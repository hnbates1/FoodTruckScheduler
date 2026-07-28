import {
  googlePlaceProfile,
  googlePlacesSearchQuery,
  isGooglePlaceId,
  type GooglePlaceProfile,
} from "../../lib/google-places";
import { requireSession } from "../../lib/guard";

export const dynamic = "force-dynamic";

const DAILY_GOOGLE_REQUEST_LIMIT = 20;

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1 = {
  prepare(query: string): D1Statement;
};

type Runtime = {
  db: D1;
  apiKey: string;
};

type TruckRow = {
  id: number;
  name: string;
};

type PlaceLinkRow = {
  placeId: string;
};

class PublicError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function runtime(): Promise<Runtime> {
  const { env } = await import("cloudflare:workers");
  const bindings = env as unknown as {
    DB: D1;
    GOOGLE_PLACES_API_KEY?: string;
  };
  return {
    db: bindings.DB,
    apiKey: String(bindings.GOOGLE_PLACES_API_KEY || "").trim(),
  };
}

async function truck(db: D1, truckId: number) {
  const result = await db.prepare(
    "SELECT id,name FROM trucks WHERE id = ?",
  ).bind(truckId).all<TruckRow>();
  return result.results[0] ?? null;
}

async function placeLink(db: D1, truckId: number) {
  const result = await db.prepare(
    "SELECT place_id AS placeId FROM truck_google_places WHERE truck_id = ?",
  ).bind(truckId).all<PlaceLinkRow>();
  return result.results[0] ?? null;
}

async function locationProfile(db: D1) {
  const result = await db.prepare(
    "SELECT value FROM app_settings WHERE key = 'location_profile'",
  ).all<{ value: string }>();
  try {
    return JSON.parse(result.results[0]?.value || "{}") as {
      city?: unknown;
      state?: unknown;
      zip?: unknown;
    };
  } catch {
    return {};
  }
}

async function reserveGoogleRequest(db: D1) {
  const usageDate = new Date().toISOString().slice(0, 10);
  await db.prepare(
    "INSERT OR IGNORE INTO google_places_daily_usage (usage_date,request_count) VALUES (?,0)",
  ).bind(usageDate).run();
  const result = await db.prepare(
    "UPDATE google_places_daily_usage SET request_count = request_count + 1 WHERE usage_date = ? AND request_count < ? RETURNING request_count AS requestCount",
  ).bind(usageDate, DAILY_GOOGLE_REQUEST_LIMIT).all<{ requestCount: number }>();
  if (!result.results[0]) {
    throw new PublicError(
      "The daily Google lookup limit has been reached. Try again tomorrow.",
      429,
    );
  }
}

async function googleFetch(
  runtimeValue: Runtime,
  url: string,
  fieldMask: string,
  init?: RequestInit,
) {
  if (!runtimeValue.apiKey) {
    throw new PublicError(
      "Google Places is not connected yet. The rest of Food Truck Admin still works normally.",
      503,
    );
  }
  await reserveGoogleRequest(runtimeValue.db);
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": runtimeValue.apiKey,
      "x-goog-fieldmask": fieldMask,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    console.error("Google Places request failed", {
      status: response.status,
      endpoint: new URL(url).pathname,
    });
    throw new PublicError(
      "Google could not complete that lookup. Check the key restrictions and try again.",
      502,
    );
  }
  return response.json() as Promise<Record<string, unknown>>;
}

async function livePlace(
  runtimeValue: Runtime,
  placeId: string,
): Promise<GooglePlaceProfile> {
  const raw = await googleFetch(
    runtimeValue,
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    "id,displayName,formattedAddress,googleMapsUri,websiteUri,rating,userRatingCount,reviewSummary",
  );
  const profile = googlePlaceProfile(raw);
  if (!profile) {
    throw new PublicError("Google returned an incomplete listing.", 502);
  }
  return profile;
}

async function editor(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session;
  if (!["admin", "manager"].includes(session.user.role)) {
    return {
      response: json(
        { error: "This account has view-only access." },
        403,
      ),
    };
  }
  return session;
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  const truckId = integer(new URL(request.url).searchParams.get("truckId"));
  if (!truckId) return json({ error: "Choose a valid truck." }, 400);
  try {
    const runtimeValue = await runtime();
    const [truckRecord, link] = await Promise.all([
      truck(runtimeValue.db, truckId),
      placeLink(runtimeValue.db, truckId),
    ]);
    if (!truckRecord) return json({ error: "Truck not found." }, 404);
    if (!link) {
      return json({
        configured: Boolean(runtimeValue.apiKey),
        linked: false,
        dailyLimit: DAILY_GOOGLE_REQUEST_LIMIT,
      });
    }
    if (!runtimeValue.apiKey) {
      return json({
        configured: false,
        linked: true,
        dailyLimit: DAILY_GOOGLE_REQUEST_LIMIT,
      });
    }
    return json({
      configured: true,
      linked: true,
      dailyLimit: DAILY_GOOGLE_REQUEST_LIMIT,
      profile: await livePlace(runtimeValue, link.placeId),
    });
  } catch (error) {
    if (error instanceof PublicError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Google review lookup failed", error);
    return json({ error: "The Google listing is temporarily unavailable." }, 500);
  }
}

export async function POST(request: Request) {
  const session = await editor(request);
  if ("response" in session) return session.response;
  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof payload.action === "string" ? payload.action : "";
  const truckId = integer(payload.truckId);
  if (!truckId) return json({ error: "Choose a valid truck." }, 400);
  try {
    const runtimeValue = await runtime();
    const truckRecord = await truck(runtimeValue.db, truckId);
    if (!truckRecord) return json({ error: "Truck not found." }, 404);

    if (action === "search") {
      const location = await locationProfile(runtimeValue.db);
      const textQuery = googlePlacesSearchQuery(truckRecord.name, location);
      const raw = await googleFetch(
        runtimeValue,
        "https://places.googleapis.com/v1/places:searchText",
        "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.rating,places.userRatingCount",
        {
          method: "POST",
          body: JSON.stringify({
            textQuery,
            maxResultCount: 5,
            languageCode: "en",
            regionCode: "US",
          }),
        },
      );
      const candidates = Array.isArray(raw.places)
        ? raw.places
          .map(googlePlaceProfile)
          .filter((place): place is GooglePlaceProfile => Boolean(place))
        : [];
      return json({
        configured: true,
        candidates,
        query: textQuery,
        dailyLimit: DAILY_GOOGLE_REQUEST_LIMIT,
      });
    }

    if (action === "link") {
      if (!isGooglePlaceId(payload.placeId)) {
        return json({ error: "Choose a valid Google listing." }, 400);
      }
      const profile = await livePlace(runtimeValue, payload.placeId);
      await runtimeValue.db.prepare(
        "INSERT INTO truck_google_places (truck_id,place_id,linked_at) VALUES (?,?,?) ON CONFLICT(truck_id) DO UPDATE SET place_id=excluded.place_id,linked_at=excluded.linked_at",
      ).bind(truckId, payload.placeId, new Date().toISOString()).run();
      return json({
        configured: true,
        linked: true,
        profile,
        dailyLimit: DAILY_GOOGLE_REQUEST_LIMIT,
      });
    }

    return json({ error: "Choose a valid Google listing action." }, 400);
  } catch (error) {
    if (error instanceof PublicError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Google review update failed", error);
    return json({ error: "The Google listing could not be updated." }, 500);
  }
}

export async function DELETE(request: Request) {
  const session = await editor(request);
  if ("response" in session) return session.response;
  const truckId = integer(new URL(request.url).searchParams.get("truckId"));
  if (!truckId) return json({ error: "Choose a valid truck." }, 400);
  try {
    const runtimeValue = await runtime();
    await runtimeValue.db.prepare(
      "DELETE FROM truck_google_places WHERE truck_id = ?",
    ).bind(truckId).run();
    return json({
      configured: Boolean(runtimeValue.apiKey),
      linked: false,
      dailyLimit: DAILY_GOOGLE_REQUEST_LIMIT,
    });
  } catch (error) {
    console.error("Google review unlink failed", error);
    return json({ error: "The Google listing could not be removed." }, 500);
  }
}
