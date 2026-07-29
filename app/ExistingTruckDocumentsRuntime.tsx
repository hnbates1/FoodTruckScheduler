"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Truck = {
  id: number;
  name: string;
  cuisine: string;
  contact: string;
  phone: string;
  email: string;
  insuranceExpiry: string;
  licenseExpiry: string;
  paymentTypes: string;
  notes: string;
};

type StoredDocument = {
  id: number;
  truckId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: number;
  uploadedByName: string;
  createdAt: string;
};

type SuggestedField = { value: string; confidence: number; source: string };
type IntakeAnalysis = {
  fields: {
    businessName: SuggestedField;
    cuisine: SuggestedField;
    contactName: SuggestedField;
    phone: SuggestedField;
    email: SuggestedField;
    insuranceExpiry: SuggestedField;
    licenseExpiry: SuggestedField;
    paymentTypes: { values: string[]; confidence: number; source: string };
    notes: SuggestedField;
  };
  documents: Array<{ fileName: string; type: string; summary: string }>;
  warnings: string[];
};

type UpdateField = "name" | "cuisine" | "contact" | "phone" | "email" | "insuranceExpiry" | "licenseExpiry" | "paymentTypes" | "notes";
type ReviewRow = {
  field: UpdateField;
  label: string;
  current: string;
  suggested: string;
  confidence: number;
  source: string;
};

function normalizeTruck(value: unknown): Truck | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = Number(row.id);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!Number.isInteger(id) || id <= 0 || !name) return null;
  const text = (key: string) => typeof row[key] === "string" ? String(row[key]) : "";
  return {
    id,
    name,
    cuisine: text("cuisine"),
    contact: text("contact"),
    phone: text("phone"),
    email: text("email"),
    insuranceExpiry: text("insuranceExpiry"),
    licenseExpiry: text("licenseExpiry"),
    paymentTypes: text("paymentTypes"),
    notes: text("notes"),
  };
}

function humanBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function confidenceLabel(value: number) {
  if (value >= 0.85) return "High";
  if (value >= 0.6) return "Medium";
  return "Low";
}

// analysis-runtime-diagnostics-v1
async function errorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "unknown content type";
  const copy = response.clone();
  try {
    const value = await response.json() as { error?: string; diagnostic?: string };
    const message = value.error || fallback;
    const diagnostic = value.diagnostic ? ` [${value.diagnostic}]` : "";
    return `${message}${diagnostic} (HTTP ${response.status})`;
  } catch {
    const raw = await copy.text().catch(() => "");
    const excerpt = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
    return `${fallback} (HTTP ${response.status}; ${contentType})${excerpt ? `: ${excerpt}` : ""}`;
  }
}

async function analyzerStatus() {
  try {
    const response = await fetch("/api/intake-analysis", { cache: "no-store" });
    const value = await response.json() as { routeVersion?: string; openAiConfigured?: boolean; workersAiConfigured?: boolean };
    return ` Analyzer status: route ${value.routeVersion || "unknown"}; OpenAI key ${value.openAiConfigured ? "detected" : "NOT detected"}; Workers AI ${value.workersAiConfigured ? "connected" : "not connected"}.`;
  } catch {
    return " Analyzer status could not be loaded.";
  }
}

function reviewRows(truck: Truck, analysis: IntakeAnalysis): ReviewRow[] {
  const fields = analysis.fields;
  const rows: ReviewRow[] = [
    { field: "name", label: "Business Name", current: truck.name, suggested: fields.businessName.value, confidence: fields.businessName.confidence, source: fields.businessName.source },
    { field: "cuisine", label: "Cuisine", current: truck.cuisine, suggested: fields.cuisine.value, confidence: fields.cuisine.confidence, source: fields.cuisine.source },
    { field: "contact", label: "Contact", current: truck.contact, suggested: fields.contactName.value, confidence: fields.contactName.confidence, source: fields.contactName.source },
    { field: "phone", label: "Phone", current: truck.phone, suggested: fields.phone.value, confidence: fields.phone.confidence, source: fields.phone.source },
    { field: "email", label: "Email", current: truck.email, suggested: fields.email.value, confidence: fields.email.confidence, source: fields.email.source },
    { field: "insuranceExpiry", label: "Insurance Expiration", current: truck.insuranceExpiry, suggested: fields.insuranceExpiry.value, confidence: fields.insuranceExpiry.confidence, source: fields.insuranceExpiry.source },
    { field: "licenseExpiry", label: "Food License Expiration", current: truck.licenseExpiry, suggested: fields.licenseExpiry.value, confidence: fields.licenseExpiry.confidence, source: fields.licenseExpiry.source },
    { field: "paymentTypes", label: "Payment Types", current: truck.paymentTypes, suggested: fields.paymentTypes.values.join(", "), confidence: fields.paymentTypes.confidence, source: fields.paymentTypes.source },
    { field: "notes", label: "Operations Notes", current: truck.notes, suggested: fields.notes.value, confidence: fields.notes.confidence, source: fields.notes.source },
  ];
  return rows.filter((row) => row.suggested.trim() && row.suggested.trim() !== row.current.trim());
}

export default function ExistingTruckDocumentsRuntime() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [analysis, setAnalysis] = useState<IntakeAnalysis | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<UpdateField>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const truckCache = useRef<Truck[]>([]);
  const accessDenied = useRef(false);

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();

    async function loadTrucks() {
      if (truckCache.current.length) return truckCache.current;
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        if (!response.ok) return [];
        const result = await response.json() as { trucks?: unknown[] };
        truckCache.current = (result.trucks || []).map(normalizeTruck).filter((item): item is Truck => Boolean(item));
      } catch {
        truckCache.current = [];
      }
      return truckCache.current;
    }

    async function sync() {
      if (!active || accessDenied.current) return;
      const detail = document.querySelector<HTMLElement>(".truck-layout .detail-card");
      const name = detail?.querySelector<HTMLElement>(".profile-head h2")?.textContent?.trim() || "";
      if (!detail || !name) {
        setPortalTarget(null);
        setTruck(null);
        return;
      }
      let host = detail.querySelector<HTMLElement>("[data-existing-truck-documents-root]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.existingTruckDocumentsRoot = "true";
        const comments = detail.querySelector("[data-truck-comments-root]");
        const google = detail.querySelector(".google-review-card");
        const deleteButton = detail.querySelector(".danger-button");
        const anchor = comments || google || deleteButton;
        if (anchor) detail.insertBefore(host, anchor);
        else detail.appendChild(host);
      }
      const trucks = await loadTrucks();
      if (!active) return;
      const selected = trucks.find((item) => item.name === name) || null;
      setPortalTarget(host);
      setTruck((current) => current?.id === selected?.id ? current : selected);
    }

    function schedule(delay: number) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        void sync();
      }, delay);
      timers.add(timer);
    }

    function interaction() {
      schedule(20);
      schedule(250);
      schedule(800);
    }

    document.addEventListener("click", interaction, { passive: true });
    [100, 600, 1600].forEach(schedule);
    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", interaction);
    };
  }, []);

  useEffect(() => {
    setFiles([]);
    setAnalysis(null);
    setSelectedFields(new Set());
    setError("");
    setMessage("");
    if (!truck || accessDenied.current) {
      setDocuments([]);
      return;
    }
    const controller = new AbortController();
    async function loadDocuments() {
      setLoading(true);
      try {
        const response = await fetch(`/api/truck-documents?truckId=${truck.id}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 403) {
          accessDenied.current = true;
          setPortalTarget(null);
          return;
        }
        if (!response.ok) throw new Error(await errorMessage(response, "Documents could not be loaded."));
        const result = await response.json() as { documents?: StoredDocument[] };
        setDocuments(Array.isArray(result.documents) ? result.documents : []);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Documents could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadDocuments();
    return () => controller.abort();
  }, [truck]);

  const rows = useMemo(() => truck && analysis ? reviewRows(truck, analysis) : [], [truck, analysis]);

  async function refreshDocuments() {
    if (!truck) return;
    const response = await fetch(`/api/truck-documents?truckId=${truck.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error(await errorMessage(response, "Documents could not be refreshed."));
    const result = await response.json() as { documents?: StoredDocument[] };
    setDocuments(Array.isArray(result.documents) ? result.documents : []);
  }

  async function uploadAndAnalyze() {
    if (!truck || !files.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    setAnalysis(null);
    setSelectedFields(new Set());
    const body = new FormData();
    body.append("truckId", String(truck.id));
    files.forEach((file) => body.append("files", file));
    try {
      const uploadResponse = await fetch("/api/truck-documents", { method: "POST", body });
      if (!uploadResponse.ok) throw new Error(await errorMessage(uploadResponse, "The documents could not be uploaded."));
      await refreshDocuments();
      setMessage(`${files.length} ${files.length === 1 ? "document was" : "documents were"} attached to ${truck.name}.`);

      const analysisBody = new FormData();
      files.forEach((file) => analysisBody.append("files", file));
      const analysisResponse = await fetch("/api/intake-analysis", { method: "POST", body: analysisBody });
      if (!analysisResponse.ok) {
        setError(`The files were saved, but AI analysis failed: ${await errorMessage(analysisResponse, "The documents could not be analyzed.")}`);
        return;
      }
      const result = await analysisResponse.json() as IntakeAnalysis;
      setAnalysis(result);
      const suggestedRows = reviewRows(truck, result);
      setSelectedFields(new Set(suggestedRows.filter((row) => row.confidence >= 0.6).map((row) => row.field)));
      setMessage(`${files.length} ${files.length === 1 ? "document was" : "documents were"} attached and analyzed. Review the suggested changes below.`);
      setFiles([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The documents could not be uploaded.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeStoredDocuments() {
    if (!truck || !documents.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    setAnalysis(null);
    setSelectedFields(new Set());
    try {
      const body = new FormData();
      const selectedDocuments = documents.slice(0, 6);
      for (const document of selectedDocuments) {
        const response = await fetch(`/api/truck-documents?id=${document.id}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await errorMessage(response, `${document.fileName} could not be downloaded for analysis.`));
        const blob = await response.blob();
        body.append("files", new File([blob], document.fileName, { type: document.contentType || blob.type || "application/octet-stream" }));
      }
      const response = await fetch("/api/intake-analysis", { method: "POST", body });
      if (!response.ok) {
        const detail = await errorMessage(response, "The stored documents could not be analyzed.");
        throw new Error(detail + await analyzerStatus());
      }
      const result = await response.json() as IntakeAnalysis;
      setAnalysis(result);
      const suggestedRows = reviewRows(truck, result);
      setSelectedFields(new Set(suggestedRows.filter((row) => row.confidence >= 0.6).map((row) => row.field)));
      setMessage(`${selectedDocuments.length} stored ${selectedDocuments.length === 1 ? "document was" : "documents were"} analyzed. Review the suggested changes below.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The stored documents could not be analyzed.");
    } finally {
      setBusy(false);
    }
  }

  function toggleField(field: UpdateField) {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function applySelectedUpdates() {
    if (!truck || !analysis || !selectedFields.size) return;
    const selectedRows = rows.filter((row) => selectedFields.has(row.field));
    if (!selectedRows.length) return;
    if (!window.confirm(`Apply ${selectedRows.length} reviewed ${selectedRows.length === 1 ? "change" : "changes"} to ${truck.name}?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const fields = Object.fromEntries(selectedRows.map((row) => [row.field, row.suggested]));
      const response = await fetch("/api/truck-update", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ truckId: truck.id, fields }),
      });
      if (!response.ok) throw new Error(await errorMessage(response, "The truck could not be updated."));
      setMessage("The selected profile fields were updated.");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The truck could not be updated.");
      setBusy(false);
    }
  }

  async function deleteDocument(document: StoredDocument) {
    if (!window.confirm(`Delete ${document.fileName}? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/truck-documents?id=${document.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorMessage(response, "The document could not be deleted."));
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setMessage(`${document.fileName} was deleted.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The document could not be deleted.");
    } finally {
      setBusy(false);
    }
  }

  if (!portalTarget || !truck) return null;

  return createPortal(<>
    <style>{`
      .existing-documents{margin:24px 0 20px;padding-top:20px;border-top:1px solid #284864;color:#dcecff}
      .existing-documents-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:13px}.existing-documents-head h4{margin:0 0 4px;font-size:15px}.existing-documents-head p{margin:0;color:#8fa7bd;font-size:10px;line-height:1.5}.existing-documents-count{min-width:28px;height:28px;display:grid;place-items:center;border:1px solid #45627b;border-radius:50%;font-size:10px;font-weight:800}
      .existing-upload{display:grid;gap:9px;padding:13px;border:1px solid #294a68;border-radius:9px;background:#0a2038}.existing-upload label{display:grid;gap:5px;padding:11px;border:1px dashed #4a6a83;border-radius:7px;background:#071a2f;cursor:pointer}.existing-upload label strong{font-size:10px}.existing-upload label span{color:#829db4;font-size:9px}.existing-upload input{color:#adc5d8;font-size:9px}.existing-file-chips{display:flex;gap:6px;flex-wrap:wrap}.existing-file-chips span{padding:4px 7px;border:1px solid #395b75;border-radius:8px;font-size:9px}.existing-upload-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}.existing-status{margin:10px 0 0;padding:9px;border-radius:7px;font-size:10px;line-height:1.45}.existing-status.good{border:1px solid #527d38;background:#142d18;color:#cfffaf}.existing-status.bad{border:1px solid #8b3935;background:#3a1719;color:#ffb1aa}
      .stored-documents{display:grid;gap:8px;margin-top:12px}.stored-document{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px;border:1px solid #294a68;border-radius:8px;background:#091e34}.stored-document strong{display:block;font-size:10px;overflow-wrap:anywhere}.stored-document small{display:block;margin-top:3px;color:#7f99af;font-size:8px}.stored-document-actions{display:flex;gap:9px;align-items:center}.stored-document-actions a,.stored-document-actions button{border:0;background:transparent;color:#8fc0ea;padding:0;font-size:9px;font-weight:800;cursor:pointer}.stored-document-actions button{color:#ff9187}
      .existing-review{display:grid;gap:9px;margin-top:14px;padding-top:14px;border-top:1px solid #31516c}.existing-review h4{margin:0;font-size:13px}.existing-review p{margin:0;color:#8fa7bd;font-size:9px;line-height:1.45}.review-row{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;padding:10px;border:1px solid #31516c;border-radius:8px;background:#081c31}.review-row>input{margin-top:3px}.review-row-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.review-row-head strong{font-size:10px}.review-confidence{padding:2px 6px;border:1px solid #4f6c83;border-radius:8px;color:#a9c2d7;font-size:8px}.review-values{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}.review-values div{padding:7px;border-radius:6px;background:#07182a}.review-values span{display:block;color:#7993aa;font-size:8px;text-transform:uppercase;letter-spacing:.05em}.review-values p{margin:4px 0 0;color:#dcecff;font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere}.review-source{display:block;margin-top:6px;color:#748fa5;font-size:8px}.existing-review-actions{display:flex;justify-content:flex-end;margin-top:3px}.existing-empty{margin-top:11px;padding:14px;border:1px dashed #34536e;border-radius:8px;text-align:center;color:#7f99af;font-size:9px}
      @media(max-width:700px){.stored-document{grid-template-columns:1fr}.review-values{grid-template-columns:1fr}.existing-upload-actions button,.existing-review-actions button{width:100%}}
    `}</style>
    <section className="existing-documents" aria-label={`Documents for ${truck.name}`}>
      <div className="existing-documents-head">
        <div><h4>Documents &amp; AI Intake</h4><p>Attach permanent vendor documents, then review any suggested profile updates.</p></div>
        <span className="existing-documents-count">{documents.length}</span>
      </div>

      <div className="existing-upload">
        <label>
          <strong>Choose Documents</strong>
          <span>PDF, JPG, PNG, WebP, or Word • Up to 6 files • 10 MB each</span>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { setFiles(Array.from(event.target.files || []).slice(0, 6)); setAnalysis(null); setSelectedFields(new Set()); setError(""); setMessage(""); }} />
        </label>
        {files.length > 0 && <div className="existing-file-chips">{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div>}
        <div className="existing-upload-actions">{documents.length > 0 && <button className="secondary" type="button" disabled={busy} onClick={() => void analyzeStoredDocuments()}>{busy ? "Analyzing…" : "Analyze Stored Documents"}</button>}<button className="primary" type="button" disabled={busy || !files.length} onClick={() => void uploadAndAnalyze()}>{busy ? "Uploading and Analyzing…" : "Upload and Analyze"}</button></div>
      </div>

      {message && <div className="existing-status good" role="status">✓ {message}</div>}
      {error && <div className="existing-status bad" role="alert">△ {error}</div>}

      {loading ? <div className="existing-empty">Loading documents…</div> : documents.length > 0 ? <div className="stored-documents">{documents.map((document) => <article className="stored-document" key={document.id}>
        <div><strong>{document.fileName}</strong><small>{humanBytes(document.sizeBytes)} • Uploaded by {document.uploadedByName} • {formattedDate(document.createdAt)}</small></div>
        <div className="stored-document-actions"><a href={`/api/truck-documents?id=${document.id}`}>Download</a><button type="button" disabled={busy} onClick={() => void deleteDocument(document)}>Delete</button></div>
      </article>)}</div> : <div className="existing-empty">No documents have been attached to this truck.</div>}

      {analysis && <div className="existing-review">
        <h4>Review Suggested Changes</h4>
        <p>Checked fields will replace the current values only after you select Apply Selected Updates.</p>
        {rows.length > 0 ? rows.map((row) => <label className="review-row" key={row.field}>
          <input type="checkbox" checked={selectedFields.has(row.field)} onChange={() => toggleField(row.field)} />
          <div>
            <div className="review-row-head"><strong>{row.label}</strong><span className="review-confidence">{confidenceLabel(row.confidence)} Confidence</span></div>
            <div className="review-values"><div><span>Current</span><p>{row.current || "Not provided"}</p></div><div><span>Suggested</span><p>{row.suggested}</p></div></div>
            <small className="review-source">Source: {row.source || "Uploaded documents"}</small>
          </div>
        </label>) : <div className="existing-empty">The analysis found no profile changes to suggest.</div>}
        {analysis.warnings.length > 0 && <div className="existing-status bad">{analysis.warnings.join(" ")}</div>}
        {rows.length > 0 && <div className="existing-review-actions"><button className="primary" type="button" disabled={busy || !selectedFields.size} onClick={() => void applySelectedUpdates()}>{busy ? "Applying…" : "Apply Selected Updates"}</button></div>}
      </div>}
    </section>
  </>, portalTarget);
}
