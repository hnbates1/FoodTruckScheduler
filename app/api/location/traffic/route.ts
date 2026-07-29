import { requireSession } from "../../../lib/guard";
import {
  averageTrafficWeeks,
  hasCompleteTrafficLocation,
  locationTrafficQuery,
  normalizePopularTimes,
  requestedTrafficDay,
  trafficDayCurve,
  trafficPlaceMatchesLocation,
  trafficWeekStart,
  type LocationAddress,
  type TrafficWeek,
} from "../../../lib/location-traffic";

export const dynamic = "force-dynamic";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1 = {
  prepare(query: string): D1Statement;
};

type RuntimeBindings = {
  DB: D1;
  OUTSCRAPER_API_KEY?: string;
};

type SnapshotRow = {
  id: number;
  weekStart: string;
  status: string;
  curveJson: string;
  venueName: string;
  venueAddress: string;
  fetchedAt: string;
};

type TrafficSelection = {
  week: TrafficWeek;
  source: "current" | "previous" | "next" | "interpolated";
  snapshot: SnapshotRow;
};

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseWeek(value: string) {
  try {
    const parsed = JSON.parse(value) as TrafficWeek;
    return Array.isArray(parsed) && parsed.length === 7 ? parsed : null;
  } catch {
    return null;
  }
}

async function runtime() {
  const { env } = await import("cloudflare:workers");
  const bindings = env as unknown as RuntimeBindings;
  return {
    db: bindings.DB,
    apiKey: text(bindings.OUTSCRAPER_API_KEY),
  };
}

async function locationProfile(db: D1): Promise<LocationAddress> {
  const result = await db.prepare(
    "SELECT value FROM app_settings WHERE key = 'location_profile'",
  ).all<{ value: string }>();
  try {
    const parsed = JSON.parse(result.results[0]?.value || "{}");
    return parsed && typeof parsed === "object" ? parsed as LocationAddress : {};
  } catch {
    return {};
  }
}

async function locationKey(location: LocationAddress) {
  const source = locationTrafficQuery(location).toLowerCase();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function snapshotSelect() {
  return [
    "id",
    "week_start AS weekStart",
    "status",
    "curve_json AS curveJson",
    "venue_name AS venueName",
    "venue_address AS venueAddress",
    "fetched_at AS fetchedAt",
  ].join(",");
}

async function snapshotForWeek(
  db: D1,
  key: string,
  weekStart: string,
) {
  const result = await db.prepare(
    `SELECT ${snapshotSelect()} FROM location_traffic_snapshots WHERE location_key = ? AND week_start = ?`,
  ).bind(key, weekStart).all<SnapshotRow>();
  return result.results[0] ?? null;
}

async function claimCurrentSnapshot(
  db: D1,
  key: string,
  weekStart: string,
  now: string,
) {
  const inserted = await db.prepare(
    "INSERT INTO location_traffic_snapshots (location_key,week_start,status,fetched_at) VALUES (?,?,'pending',?) ON CONFLICT(location_key,week_start) DO NOTHING RETURNING id",
  ).bind(key, weekStart, now).all<{ id: number }>();
  if (inserted.results[0]) return true;

  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  const reclaimed = await db.prepare(
    "UPDATE location_traffic_snapshots SET fetched_at = ? WHERE location_key = ? AND week_start = ? AND status = 'pending' AND fetched_at < ? RETURNING id",
  ).bind(now, key, weekStart, staleBefore).all<{ id: number }>();
  return Boolean(reclaimed.results[0]);
}

function firstOutscraperPlace(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data) || !data.length) return null;
  const first = Array.isArray(data[0]) ? data[0][0] : data[0];
  return first && typeof first === "object"
    ? first as Record<string, unknown>
    : null;
}

async function fetchOutscraperSnapshot(
  apiKey: string,
  location: LocationAddress,
) {
  const url = new URL("https://api.outscraper.com/google-maps-search");
  url.searchParams.set("query", locationTrafficQuery(location));
  url.searchParams.set("limit", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("region", "US");
  url.searchParams.set("async", "false");
  url.searchParams.set(
    "fields",
    [
      "query",
      "name",
      "full_address",
      "street",
      "city",
      "postal_code",
      "state",
      "country_code",
      "place_id",
      "popular_times",
    ].join(","),
  );

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      headers: { "X-API-KEY": apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Outscraper request failed with status ${response.status}`);
    }
    const place = firstOutscraperPlace(await response.json());
    if (!place || !trafficPlaceMatchesLocation(place, location)) return null;
    const curve = normalizePopularTimes(place.popular_times);
    if (!curve) return null;
    return {
      curve,
      venueName: text(place.name),
      venueAddress: text(place.full_address),
      placeId: text(place.place_id),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateCurrentSnapshot(
  db: D1,
  key: string,
  weekStart: string,
  apiKey: string,
  location: LocationAddress,
) {
  try {
    const result = await fetchOutscraperSnapshot(apiKey, location);
    if (!result) {
      await db.prepare(
        "UPDATE location_traffic_snapshots SET status = 'missing',curve_json = '',error_code = 'no_popular_times',fetched_at = ? WHERE location_key = ? AND week_start = ?",
      ).bind(new Date().toISOString(), key, weekStart).run();
      return;
    }
    await db.prepare(
      "UPDATE location_traffic_snapshots SET status = 'success',curve_json = ?,venue_name = ?,venue_address = ?,place_id = ?,error_code = '',fetched_at = ? WHERE location_key = ? AND week_start = ?",
    ).bind(
      JSON.stringify(result.curve),
      result.venueName,
      result.venueAddress,
      result.placeId,
      new Date().toISOString(),
      key,
      weekStart,
    ).run();
    await backfillMissingSnapshots(db, key);
  } catch (error) {
    console.error("Location traffic refresh failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await db.prepare(
      "UPDATE location_traffic_snapshots SET status = 'error',curve_json = '',error_code = 'refresh_failed',fetched_at = ? WHERE location_key = ? AND week_start = ?",
    ).bind(new Date().toISOString(), key, weekStart).run();
  }
}

async function successfulBefore(
  db: D1,
  key: string,
  weekStart: string,
) {
  const result = await db.prepare(
    `SELECT ${snapshotSelect()} FROM location_traffic_snapshots WHERE location_key = ? AND status = 'success' AND week_start < ? ORDER BY week_start DESC LIMIT 1`,
  ).bind(key, weekStart).all<SnapshotRow>();
  return result.results[0] ?? null;
}

async function successfulAfter(
  db: D1,
  key: string,
  weekStart: string,
) {
  const result = await db.prepare(
    `SELECT ${snapshotSelect()} FROM location_traffic_snapshots WHERE location_key = ? AND status = 'success' AND week_start > ? ORDER BY week_start ASC LIMIT 1`,
  ).bind(key, weekStart).all<SnapshotRow>();
  return result.results[0] ?? null;
}

async function backfillMissingSnapshots(db: D1, key: string) {
  const missing = await db.prepare(
    `SELECT ${snapshotSelect()} FROM location_traffic_snapshots WHERE location_key = ? AND status = 'missing' ORDER BY week_start ASC`,
  ).bind(key).all<SnapshotRow>();

  for (const snapshot of missing.results) {
    const [previous, following] = await Promise.all([
      successfulBefore(db, key, snapshot.weekStart),
      successfulAfter(db, key, snapshot.weekStart),
    ]);
    const previousWeek = previous ? parseWeek(previous.curveJson) : null;
    const followingWeek = following ? parseWeek(following.curveJson) : null;
    if (!previousWeek || !followingWeek) continue;
    await db.prepare(
      "UPDATE location_traffic_snapshots SET status = 'interpolated',curve_json = ?,venue_name = ?,venue_address = ?,error_code = '',fetched_at = ? WHERE id = ? AND status = 'missing'",
    ).bind(
      JSON.stringify(averageTrafficWeeks(previousWeek, followingWeek)),
      following.venueName || previous.venueName,
      following.venueAddress || previous.venueAddress,
      new Date().toISOString(),
      snapshot.id,
    ).run();
  }
}

async function selectTraffic(
  db: D1,
  key: string,
  targetWeek: string,
): Promise<TrafficSelection | null> {
  const exact = await snapshotForWeek(db, key, targetWeek);
  const exactWeek = exact ? parseWeek(exact.curveJson) : null;
  if (exactWeek && ["success", "interpolated"].includes(exact.status)) {
    return {
      week: exactWeek,
      source: exact.status === "interpolated" ? "interpolated" : "current",
      snapshot: exact,
    };
  }

  const [previous, following] = await Promise.all([
    successfulBefore(db, key, targetWeek),
    successfulAfter(db, key, targetWeek),
  ]);
  const previousWeek = previous ? parseWeek(previous.curveJson) : null;
  const followingWeek = following ? parseWeek(following.curveJson) : null;
  if (previous && following && previousWeek && followingWeek) {
    return {
      week: averageTrafficWeeks(previousWeek, followingWeek),
      source: "interpolated",
      snapshot: following,
    };
  }
  if (previous && previousWeek) {
    return { week: previousWeek, source: "previous", snapshot: previous };
  }
  if (following && followingWeek) {
    return { week: followingWeek, source: "next", snapshot: following };
  }
  return null;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;

  const requestedDate = new URL(request.url).searchParams.get("date") || "";
  const day = requestedTrafficDay(requestedDate);
  if (day < 0) return json({ error: "Choose a valid schedule date." }, 400);

  try {
    const runtimeValue = await runtime();
    const location = await locationProfile(runtimeValue.db);
    if (!hasCompleteTrafficLocation(location)) {
      return json({
        configured: Boolean(runtimeValue.apiKey),
        available: false,
        message: "Add the full store address on the Location page to load typical traffic.",
      });
    }

    const key = await locationKey(location);
    const currentWeek = trafficWeekStart(new Date());
    if (runtimeValue.apiKey) {
      const claimed = await claimCurrentSnapshot(
        runtimeValue.db,
        key,
        currentWeek,
        new Date().toISOString(),
      );
      if (claimed) {
        await updateCurrentSnapshot(
          runtimeValue.db,
          key,
          currentWeek,
          runtimeValue.apiKey,
          location,
        );
      }
    }

    const requestedWeek = trafficWeekStart(requestedDate);
    const targetWeek = requestedWeek > currentWeek ? currentWeek : requestedWeek;
    const selected = await selectTraffic(runtimeValue.db, key, targetWeek);
    if (!selected) {
      return json({
        configured: Boolean(runtimeValue.apiKey),
        available: false,
        message: runtimeValue.apiKey
          ? "Typical traffic is not available for this location yet."
          : "Connect Outscraper to add typical location traffic.",
      });
    }

    return json({
      configured: Boolean(runtimeValue.apiKey),
      available: true,
      values: trafficDayCurve(selected.week, day),
      source: selected.source,
      fetchedAt: selected.snapshot.fetchedAt,
      venueName: selected.snapshot.venueName,
      venueAddress: selected.snapshot.venueAddress,
      weekStart: selected.snapshot.weekStart,
    });
  } catch (error) {
    console.error("Location traffic lookup failed", error);
    return json({
      configured: false,
      available: false,
      message: "Typical traffic is temporarily unavailable.",
    }, 500);
  }
}
