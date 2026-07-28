import { requireSession } from "../../lib/guard";

type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    run(): Promise<unknown>;
    all<T>(): Promise<{ results: T[] }>;
  };
};

async function db() {
  const { env } = await import("cloudflare:workers");
  const database = (env as unknown as { DB: D1 }).DB;
  await database.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)").run();
  return database;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const result = await (await db()).prepare("SELECT value FROM app_settings WHERE key = 'location_profile'").all<{ value: string }>();
  try {
    return Response.json({ location: result.results[0]?.value ? JSON.parse(result.results[0].value) : null });
  } catch {
    return Response.json({ location: null });
  }
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!["admin", "manager"].includes(session.user.role)) {
    return Response.json({ error: "This account has view-only access." }, { status: 403 });
  }
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") return Response.json({ error: "A location profile is required." }, { status: 400 });
  const serialized = JSON.stringify(payload);
  if (serialized.length > 20_000) return Response.json({ error: "The location profile is too large." }, { status: 400 });
  const database = await db();
  await database.prepare("INSERT INTO app_settings (key,value,updated_at) VALUES ('location_profile',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
    .bind(serialized, new Date().toISOString()).run();
  return Response.json({ location: payload });
}
