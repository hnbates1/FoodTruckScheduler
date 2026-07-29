import { requireSession } from "../../lib/guard";

export const dynamic = "force-dynamic";

const MAX_FILES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const SUPPORTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const SUPPORTED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp", ".docx"];

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1 = {
  prepare(query: string): D1Statement;
};

type R2Object = {
  body: BodyInit;
  httpMetadata?: { contentType?: string };
};

type R2Bucket = {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

type RuntimeBindings = {
  DB: D1;
  BUCKET: R2Bucket;
};

type DocumentRow = {
  id: number;
  truckId: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedBy: number;
  uploadedByName: string;
  createdAt: string;
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function editorRole(role: string) {
  return role === "admin" || role === "manager";
}

function supportedFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return SUPPORTED_TYPES.has(file.type)
    || SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function safeFileName(value: string) {
  const cleaned = value.replace(/[\r\n]/g, " ").replace(/[^A-Za-z0-9._()\- ]+/g, "_").trim();
  return cleaned.slice(0, 180) || "document";
}

async function runtime() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeBindings;
}

async function ensureSchema(db: D1) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS truck_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    truck_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL,
    uploaded_by_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare(
    "CREATE INDEX IF NOT EXISTS truck_documents_truck_created_idx ON truck_documents (truck_id, created_at)",
  ).run();
}

function columns() {
  return [
    "id",
    "truck_id AS truckId",
    "file_name AS fileName",
    "content_type AS contentType",
    "size_bytes AS sizeBytes",
    "storage_key AS storageKey",
    "uploaded_by AS uploadedBy",
    "uploaded_by_name AS uploadedByName",
    "created_at AS createdAt",
  ].join(",");
}

function publicDocument(row: DocumentRow) {
  return {
    id: row.id,
    truckId: row.truckId,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    uploadedByName: row.uploadedByName,
    createdAt: row.createdAt,
  };
}

async function findDocument(db: D1, id: number) {
  const result = await db.prepare(`SELECT ${columns()} FROM truck_documents WHERE id = ?`)
    .bind(id).all<DocumentRow>();
  return result.results[0] ?? null;
}

async function truckExists(db: D1, truckId: number) {
  const result = await db.prepare("SELECT id FROM trucks WHERE id = ?").bind(truckId).all<{ id: number }>();
  return Boolean(result.results[0]);
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!editorRole(session.user.role)) return json({ error: "This account has view-only access." }, 403);

  const params = new URL(request.url).searchParams;
  const id = integer(params.get("id"));
  const truckId = integer(params.get("truckId"));

  try {
    const { DB, BUCKET } = await runtime();
    await ensureSchema(DB);

    if (id) {
      const document = await findDocument(DB, id);
      if (!document) return new Response("Not found", { status: 404 });
      const object = await BUCKET.get(document.storageKey);
      if (!object) return new Response("Not found", { status: 404 });
      const fileName = safeFileName(document.fileName).replace(/"/g, "");
      return new Response(object.body, {
        headers: {
          "cache-control": "private, no-store",
          "content-disposition": `attachment; filename="${fileName}"`,
          "content-type": object.httpMetadata?.contentType || document.contentType || "application/octet-stream",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (!truckId) return json({ error: "Choose a valid truck." }, 400);
    const result = await DB.prepare(
      `SELECT ${columns()} FROM truck_documents WHERE truck_id = ? ORDER BY created_at DESC, id DESC`,
    ).bind(truckId).all<DocumentRow>();
    return json({ documents: result.results.map(publicDocument) });
  } catch (error) {
    console.error("truck documents GET", error);
    return json({ error: "Truck documents are temporarily unavailable." }, 500);
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!editorRole(session.user.role)) return json({ error: "This account has view-only access." }, 403);

  try {
    const form = await request.formData();
    const truckId = integer(form.get("truckId"));
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    if (!truckId) return json({ error: "Choose a valid truck." }, 400);
    if (!files.length) return json({ error: "Choose at least one document." }, 400);
    if (files.length > MAX_FILES) return json({ error: `Upload no more than ${MAX_FILES} documents at once.` }, 400);

    let totalBytes = 0;
    for (const file of files) {
      if (!supportedFile(file)) return json({ error: `${file.name} is not a supported PDF, image, or Word document.` }, 400);
      if (file.size > MAX_FILE_BYTES) return json({ error: `${file.name} is larger than 10 MB.` }, 400);
      totalBytes += file.size;
    }
    if (totalBytes > MAX_TOTAL_BYTES) return json({ error: "The selected documents exceed the 24 MB combined limit." }, 400);

    const { DB, BUCKET } = await runtime();
    await ensureSchema(DB);
    if (!await truckExists(DB, truckId)) return json({ error: "That truck no longer exists." }, 404);

    const createdAt = new Date().toISOString();
    const uploaded: DocumentRow[] = [];
    for (const file of files) {
      const fileName = safeFileName(file.name);
      const storageKey = `truck-documents/${truckId}/${crypto.randomUUID()}/${fileName}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      await BUCKET.put(storageKey, bytes, {
        httpMetadata: { contentType: file.type || "application/octet-stream" },
      });
      try {
        const inserted = await DB.prepare(
          `INSERT INTO truck_documents
          (truck_id,file_name,content_type,size_bytes,storage_key,uploaded_by,uploaded_by_name,created_at)
          VALUES (?,?,?,?,?,?,?,?) RETURNING ${columns()}`,
        ).bind(
          truckId,
          fileName,
          file.type || "application/octet-stream",
          file.size,
          storageKey,
          session.user.id,
          session.user.name || session.user.email,
          createdAt,
        ).all<DocumentRow>();
        if (inserted.results[0]) uploaded.push(inserted.results[0]);
      } catch (error) {
        await BUCKET.delete(storageKey).catch(() => undefined);
        throw error;
      }
    }
    return json({ documents: uploaded.map(publicDocument) }, 201);
  } catch (error) {
    console.error("truck documents POST", error);
    return json({ error: "The documents could not be uploaded." }, 500);
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!editorRole(session.user.role)) return json({ error: "This account has view-only access." }, 403);

  const id = integer(new URL(request.url).searchParams.get("id"));
  if (!id) return json({ error: "Choose a valid document." }, 400);

  try {
    const { DB, BUCKET } = await runtime();
    await ensureSchema(DB);
    const document = await findDocument(DB, id);
    if (!document) return json({ error: "That document no longer exists." }, 404);
    await BUCKET.delete(document.storageKey);
    await DB.prepare("DELETE FROM truck_documents WHERE id = ?").bind(id).run();
    return json({ ok: true });
  } catch (error) {
    console.error("truck documents DELETE", error);
    return json({ error: "The document could not be deleted." }, 500);
  }
}
