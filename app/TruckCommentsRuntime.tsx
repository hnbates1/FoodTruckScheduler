"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type TruckSummary = {
  id: number;
  name: string;
};

type CommentVisibility = "admin" | "management";

type TruckComment = {
  id: number;
  truckId: number;
  body: string;
  visibility: CommentVisibility;
  authorId: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

type CommentsResponse = {
  role?: string;
  comments?: TruckComment[];
  error?: string;
};

type EditDraft = {
  id: number;
  body: string;
  visibility: CommentVisibility;
};

function normalizeTruck(value: unknown): TruckSummary | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { id?: unknown; name?: unknown };
  const id = Number(record.id);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  return Number.isInteger(id) && id > 0 && name ? { id, name } : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function visibilityLabel(value: CommentVisibility) {
  return value === "admin" ? "Admins only" : "Admins + managers";
}

async function responseMessage(response: Response) {
  try {
    const result = await response.json() as { error?: string };
    return result.error || "The request could not be completed.";
  } catch {
    return "The request could not be completed.";
  }
}

export default function TruckCommentsRuntime() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [truck, setTruck] = useState<TruckSummary | null>(null);
  const [role, setRole] = useState("");
  const [comments, setComments] = useState<TruckComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<CommentVisibility>("management");
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const truckCache = useRef<TruckSummary[]>([]);
  const accessDenied = useRef(false);

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();

    async function loadTruckCache() {
      if (truckCache.current.length) return truckCache.current;
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        if (!response.ok) return [];
        const result = await response.json() as { trucks?: unknown[] };
        truckCache.current = (result.trucks || [])
          .map(normalizeTruck)
          .filter((item): item is TruckSummary => Boolean(item));
      } catch {
        truckCache.current = [];
      }
      return truckCache.current;
    }

    async function syncSelectedTruck() {
      if (!active) return;
      const detailCard = document.querySelector<HTMLElement>(".truck-layout .detail-card");
      const truckName = detailCard?.querySelector<HTMLElement>(".profile-head h2")
        ?.textContent?.trim() || "";

      if (!detailCard || !truckName) {
        setPortalTarget(null);
        setTruck(null);
        return;
      }

      let host = detailCard.querySelector<HTMLElement>("[data-truck-comments-root]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.truckCommentsRoot = "true";
        const deleteButton = detailCard.querySelector(".danger-button");
        if (deleteButton) detailCard.insertBefore(host, deleteButton);
        else detailCard.appendChild(host);
      }

      const trucks = await loadTruckCache();
      if (!active) return;
      const selected = trucks.find((item) => item.name === truckName) || null;
      setPortalTarget(host);
      setTruck((current) => current?.id === selected?.id ? current : selected);
    }

    function scheduleSync(delay: number) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        void syncSelectedTruck();
      }, delay);
      timers.add(timer);
    }

    function handleClick() {
      scheduleSync(20);
      scheduleSync(250);
      scheduleSync(800);
    }

    document.addEventListener("click", handleClick, { passive: true });
    [100, 600, 1600].forEach(scheduleSync);

    return () => {
      active = false;
      document.removeEventListener("click", handleClick);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (!truck || accessDenied.current) {
      setComments([]);
      return;
    }

    const controller = new AbortController();
    async function loadComments() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/truck-comments?truckId=${truck.id}`,
          { cache: "no-store", signal: controller.signal },
        );
        if (response.status === 403) {
          accessDenied.current = true;
          setPortalTarget(null);
          return;
        }
        const result = await response.json() as CommentsResponse;
        if (!response.ok) throw new Error(result.error || "Comments could not be loaded.");
        setRole((result.role || "").toLowerCase());
        setComments(Array.isArray(result.comments) ? result.comments : []);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "Comments could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadComments();
    return () => controller.abort();
  }, [truck, reloadKey]);

  const canUseAdminVisibility = role === "admin";
  const sortedComments = useMemo(
    () => [...comments].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [comments],
  );

  async function createComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!truck || !body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/truck-comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ truckId: truck.id, body, visibility }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setBody("");
      setVisibility("management");
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The comment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editing.body.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/truck-comments", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editing),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setEditing(null);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The comment could not be updated.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteComment(comment: TruckComment) {
    if (!window.confirm("Delete this truck comment? This cannot be undone.")) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/truck-comments?id=${comment.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      if (editing?.id === comment.id) setEditing(null);
      setReloadKey((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The comment could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  if (!portalTarget || !truck) return null;

  return createPortal(<>
    <style>{`
      .truck-comments-panel{margin:24px 0 20px;padding-top:20px;border-top:1px solid #284864;color:#dcecff}
      .truck-comments-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:14px}
      .truck-comments-heading h4{margin:0 0 4px;font-size:15px}
      .truck-comments-heading p{margin:0;color:#8fa7bd;font-size:10px;line-height:1.5}
      .truck-comments-count{min-width:28px;height:28px;display:grid;place-items:center;border:1px solid #45627b;border-radius:50%;color:#b8cee0;font-size:10px;font-weight:800}
      .truck-comment-form,.truck-comment-edit{display:grid;gap:9px;margin-bottom:15px;padding:13px;border:1px solid #294a68;border-radius:9px;background:#0a2038}
      .truck-comment-form textarea,.truck-comment-edit textarea{width:100%;min-height:84px;resize:vertical;border:1px solid #365875;border-radius:7px;background:#071a2f;color:#e6f3ff;padding:10px;font:inherit;line-height:1.45;box-sizing:border-box}
      .truck-comment-form textarea:focus,.truck-comment-edit textarea:focus{outline:2px solid #70a832;outline-offset:1px}
      .truck-comment-controls{display:flex;gap:9px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
      .truck-comment-controls label{margin-right:auto;display:flex;gap:7px;align-items:center;color:#9eb4c8;font-size:9px}
      .truck-comment-controls select{border:1px solid #365875;border-radius:6px;background:#071a2f;color:#dcecff;padding:7px 9px}
      .truck-comment-list{display:grid;gap:10px}
      .truck-comment-item{padding:13px;border:1px solid #294a68;border-radius:9px;background:#0a1f36}
      .truck-comment-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:#8099af;font-size:9px}
      .truck-comment-meta strong{color:#c8dbee;font-size:10px}
      .truck-comment-visibility{padding:2px 6px;border:1px solid #46617a;border-radius:9px;color:#a9c1d5}
      .truck-comment-visibility.admin{border-color:#91653c;color:#ffc987;background:#3b2615}
      .truck-comment-body{margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#dcecff;font-size:12px;line-height:1.5}
      .truck-comment-actions{display:flex;gap:12px;margin-top:10px}
      .truck-comment-actions button{border:0;background:transparent;color:#89b8e4;padding:0;cursor:pointer;font-size:9px;font-weight:800}
      .truck-comment-actions button:last-child{color:#ff8f83}
      .truck-comments-empty{padding:18px;border:1px dashed #34536e;border-radius:9px;text-align:center;color:#7f99af;font-size:10px}
      .truck-comments-error{margin:0 0 10px;padding:9px;border:1px solid #8b3935;border-radius:7px;background:#3a1719;color:#ffb1aa;font-size:10px}
      .truck-comments-loading{padding:14px;text-align:center;color:#819bb1;font-size:10px}
      @media(max-width:700px){.truck-comment-controls{align-items:stretch;flex-direction:column}.truck-comment-controls label{width:100%;justify-content:space-between}.truck-comment-controls select{flex:1}}
    `}</style>
    <section className="truck-comments-panel" aria-label={`Comments for ${truck.name}`}>
      <div className="truck-comments-heading">
        <div><h4>Comments &amp; history</h4><p>Timestamped internal notes. Visibility is enforced by account role.</p></div>
        <span className="truck-comments-count">{comments.length}</span>
      </div>

      {error && <div className="truck-comments-error" role="alert">{error}</div>}

      <form className="truck-comment-form" onSubmit={createComment}>
        <textarea
          value={body}
          maxLength={4000}
          placeholder="Add a comment about this truck…"
          aria-label="New truck comment"
          onChange={(event) => setBody(event.target.value)}
        />
        <div className="truck-comment-controls">
          <label>Visible to
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as CommentVisibility)}
            >
              <option value="management">Admins + managers</option>
              {canUseAdminVisibility && <option value="admin">Admins only</option>}
            </select>
          </label>
          <button className="primary" type="submit" disabled={saving || !body.trim()}>{saving ? "Saving…" : "Save comment"}</button>
        </div>
      </form>

      {loading
        ? <div className="truck-comments-loading">Loading comments…</div>
        : sortedComments.length
          ? <div className="truck-comment-list">{sortedComments.map((comment) => <article className="truck-comment-item" key={comment.id}>
            {editing?.id === comment.id
              ? <form className="truck-comment-edit" onSubmit={saveEdit}>
                <textarea
                  value={editing.body}
                  maxLength={4000}
                  aria-label="Edit truck comment"
                  onChange={(event) => setEditing({ ...editing, body: event.target.value })}
                />
                <div className="truck-comment-controls">
                  <label>Visible to
                    <select
                      value={editing.visibility}
                      onChange={(event) => setEditing({ ...editing, visibility: event.target.value as CommentVisibility })}
                    >
                      <option value="management">Admins + managers</option>
                      {canUseAdminVisibility && <option value="admin">Admins only</option>}
                    </select>
                  </label>
                  <button className="secondary" type="button" disabled={saving} onClick={() => setEditing(null)}>Cancel</button>
                  <button className="primary" type="submit" disabled={saving || !editing.body.trim()}>{saving ? "Saving…" : "Save changes"}</button>
                </div>
              </form>
              : <>
                <div className="truck-comment-meta">
                  <strong>{comment.authorName}</strong>
                  <span className={`truck-comment-visibility ${comment.visibility}`}>{visibilityLabel(comment.visibility)}</span>
                  <span>{formatDate(comment.createdAt)}</span>
                  {comment.updatedAt !== comment.createdAt && <span>Edited {formatDate(comment.updatedAt)}</span>}
                </div>
                <p className="truck-comment-body">{comment.body}</p>
                {(comment.canEdit || comment.canDelete) && <div className="truck-comment-actions">
                  {comment.canEdit && <button type="button" onClick={() => setEditing({ id: comment.id, body: comment.body, visibility: comment.visibility })}>Edit</button>}
                  {comment.canDelete && <button type="button" onClick={() => void deleteComment(comment)}>Delete</button>}
                </div>}
              </>}
          </article>)}</div>
          : <div className="truck-comments-empty">No comments have been added for this truck.</div>}
    </section>
  </>, portalTarget);
}
