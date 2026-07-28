type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    all<T>(): Promise<{ results: T[] }>;
  };
};

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token || token.length > 100) return Response.json({ error: "This schedule link is not valid." }, { status: 404 });
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB: D1 }).DB;
  const setting = await db.prepare("SELECT value FROM app_settings WHERE key = 'public_schedule_token'").all<{ value: string }>();
  if (!setting.results[0]?.value || setting.results[0].value !== token) {
    return Response.json({ error: "This schedule link has expired or was disabled." }, { status: 404 });
  }
  const trucks = await db.prepare(
    "SELECT id,name,cuisine,color,payment_types AS paymentTypes,(logo_key <> '') AS hasLogo,logo_updated_at AS logoVersion FROM trucks ORDER BY name",
  ).all<Record<string, unknown>>();
  const visits = await db.prepare(
    "SELECT id,truck_id AS truckId,visit_date AS visitDate,start_time AS startTime,end_time AS endTime,status FROM visits WHERE status <> 'Cancelled' ORDER BY visit_date,start_time",
  ).all<Record<string, unknown>>();
  return Response.json(
    { trucks: trucks.results.map((truck) => ({ ...truck, hasLogo: Boolean(truck.hasLogo) })), visits: visits.results },
    { headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } },
  );
}
