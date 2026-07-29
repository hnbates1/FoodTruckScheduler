import { requireSession } from "../../lib/guard";

export const dynamic = "force-dynamic";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1 = {
  prepare(query: string): D1Statement;
};

type CommentRow = {
  id: number;
  truckId: number;
  body: string;
  visibility: "admin" | "management";
  authorId: number;
  authorName: string;
  createdAt: string;
  updatedAt: string;
};

type CommentPayload = {
  id?: unknown;
  truckId?: unknown;
  body?: unknown;
  visibility?: unknown;
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function role(value: unknown) {
  return text(value).toLowerCase();
}

function isManagementRole(value: string) {
  return value === "admin" || value === "manager";
}

function requestedVisibility(value: unknown) {
  return value === "admin" ? "admin" : "management";
}

async function database() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { DB: D1 }).DB;
}

async function ensureSchema(db: D1) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS truck_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    truck_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    visibility TEXT NOT NULL DEFAULT 'management',
    author_id INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS truck_comments_truck_created_idx ON truck_comments (truck_id, created_at)",
  ).run();
}

function selectColumns() {
  return [
    "id",
    "truck_id AS truckId",
    "body",
    "visibility",
    "author_id AS authorId",
    "author_name AS authorName",
    "created_at AS createdAt",
    "updated_at AS updatedAt",
  ].join(",");
}

async function findComment(db: D1, id: number) {
  const result = await db.prepare(
    `SELECT ${selectColumns()} FROM truck_comments WHERE id = ?`,
  ).bind(id).all<CommentRow>();
  return result.results[0] ?? null;
}

function canModify(
  comment: CommentRow,
  user: { id: number; role: string },
) {
  const userRole = role(user.role);
  return userRole === "admin"
    || (userRole === "manager"
      && comment.visibility === "management"
      && comment.authorId === user.id);
}

async function listComments(
  db: D1,
  truckId: number,
  user: { id: number; role: string },
) {
  const userRole = role(user.role);
  const statement = userRole === "admin"
    ? db.prepare(
      `SELECT ${selectColumns()} FROM truck_comments WHERE truck_id = ? ORDER BY created_at DESC, id DESC`,
    ).bind(truckId)
    : db.prepare(
      `SELECT ${selectColumns()} FROM truck_comments WHERE truck_id = ? AND visibility = 'management' ORDER BY created_at DESC, id DESC`,
    ).bind(truckId);
  const result = await statement.all<CommentRow>();
  return result.results.map((comment) => ({
    ...comment,
    canEdit: canModify(comment, user),
    canDelete: canModify(comment, user),
  }));
}

async function truckExists(db: D1, truckId: number) {
  const result = await db.prepare("SELECT id FROM trucks WHERE id = ?")
    .bind(truckId).all<{ id: number }>();
  return Boolean(result.results[0]);
}

async function payload(request: Request): Promise<CommentPayload> {
  try {
    const value = await request.json();
    return value && typeof value === "object" ? value as CommentPayload : {};
  } catch {
    return {};
  }
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const userRole = role(session.user.role);
  if (!isManagementRole(userRole)) {
    return json({ error: "Truck comments are limited to managers and administrators." }, 403);
  }

  const truckId = integer(new URL(request.url).searchParams.get("truckId"));
  if (!truckId) return json({ error: "Choose a valid truck." }, 400);

  try {
    const db = await database();
    await ensureSchema(db);
    return json({
      role: userRole,
      comments: await listComments(db, truckId, session.user),
    });
  } catch (error) {
    console.error("truck comments GET", error);
    return json({ error: "Truck comments are temporarily unavailable." }, 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const userRole = role(session.user.role);
  if (!isManagementRole(userRole)) {
    return json({ error: "Truck comments are limited to managers and administrators." }, 403);
  }

  const input = await payload(request);
  const truckId = integer(input.truckId);
  const body = text(input.body).slice(0, 4000);
  const visibility = requestedVisibility(input.visibility);
  if (!truckId || !body) return json({ error: "Enter a comment before saving." }, 400);
  if (visibility === "admin" && userRole !== "admin") {
    return json({ error: "Only administrators can create administrator-only comments." }, 403);
  }

  try {
    const db = await database();
    await ensureSchema(db);
    if (!await truckExists(db, truckId)) return json({ error: "That truck no longer exists." }, 404);
    const now = new Date().toISOString();
    await db.prepare(
      "INSERT INTO truck_comments (truck_id,body,visibility,author_id,author_name,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    ).bind(
      truckId,
      body,
      visibility,
      session.user.id,
      session.user.name || session.user.email,
      now,
      now,
    ).run();
    return json({ ok: true }, 201);
  } catch (error) {
    console.error("truck comments POST", error);
    return json({ error: "The comment could not be saved." }, 500);
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const userRole = role(session.user.role);
  if (!isManagementRole(userRole)) {
    return json({ error: "Truck comments are limited to managers and administrators." }, 403);
  }

  const input = await payload(request);
  const id = integer(input.id);
  const body = text(input.body).slice(0, 4000);
  const visibility = requestedVisibility(input.visibility);
  if (!id || !body) return json({ error: "Enter a comment before saving." }, 400);
  if (visibility === "admin" && userRole !== "admin") {
    return json({ error: "Only administrators can use administrator-only visibility." }, 403);
  }

  try {
    const db = await database();
    await ensureSchema(db);
    const comment = await findComment(db, id);
    if (!comment) return json({ error: "That comment no longer exists." }, 404);
    if (!canModify(comment, session.user)) {
      return json({ error: "You do not have permission to edit that comment." }, 403);
    }
    await db.prepare(
      "UPDATE truck_comments SET body = ?, visibility = ?, updated_at = ? WHERE id = ?",
    ).bind(body, visibility, new Date().toISOString(), id).run();
    return json({ ok: true });
  } catch (error) {
    console.error("truck comments PUT", error);
    return json({ error: "The comment could not be updated." }, 500);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const userRole = role(session.user.role);
  if (!isManagementRole(userRole)) {
    return json({ error: "Truck comments are limited to managers and administrators." }, 403);
  }

  const id = integer(new URL(request.url).searchParams.get("id"));
  if (!id) return json({ error: "Choose a valid comment." }, 400);

  try {
    const db = await database();
    await ensureSchema(db);
    const comment = await findComment(db, id);
    if (!comment) return json({ error: "That comment no longer exists." }, 404);
    if (!canModify(comment, session.user)) {
      return json({ error: "You do not have permission to delete that comment." }, 403);
    }
    await db.prepare("DELETE FROM truck_comments WHERE id = ?").bind(id).run();
    return json({ ok: true });
  } catch (error) {
    console.error("truck comments DELETE", error);
    return json({ error: "The comment could not be deleted." }, 500);
  }
}
