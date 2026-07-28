import { requireSession } from "../../../lib/guard";

type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    run(): Promise<unknown>;
    all<T>(): Promise<{ results: T[] }>;
  };
};

async function database() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { DB: D1 }).DB;
}

async function check(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session;
  if (session.user.role !== "admin") {
    return { response: Response.json({ error: "Administrator access is required." }, { status: 403 }) };
  }
  return session;
}

async function current(request: Request) {
  const db = await database();
  await db.prepare("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL)").run();
  const result = await db.prepare("SELECT value FROM app_settings WHERE key = 'public_schedule_token'").all<{ value: string }>();
  const token = result.results[0]?.value || "";
  const url = token ? new URL(`/public/schedule?token=${encodeURIComponent(token)}`, request.url).toString() : "";
  return { db, token, url };
}

export async function GET(request: Request) {
  const session = await check(request);
  if ("response" in session) return session.response;
  const { token, url } = await current(request);
  return Response.json({ enabled: Boolean(token), url });
}

export async function POST(request: Request) {
  const session = await check(request);
  if ("response" in session) return session.response;
  const { db } = await current(request);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await db.prepare(
    "INSERT INTO app_settings (key,value,updated_at) VALUES ('public_schedule_token',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",
  ).bind(token, new Date().toISOString()).run();
  return Response.json({ enabled: true, url: new URL(`/public/schedule?token=${token}`, request.url).toString() });
}

export async function DELETE(request: Request) {
  const session = await check(request);
  if ("response" in session) return session.response;
  const { db } = await current(request);
  await db.prepare("DELETE FROM app_settings WHERE key = 'public_schedule_token'").run();
  return Response.json({ enabled: false, url: "" });
}
