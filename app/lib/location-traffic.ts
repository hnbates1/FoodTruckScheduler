export type LocationAddress = {
  storeName?: unknown;
  storeNumber?: unknown;
  street?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};

export type TrafficWeek = number[][];

type PopularTimePoint = {
  hour?: unknown;
  percentage?: unknown;
};

type PopularDay = {
  day?: unknown;
  popular_times?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampPercentage(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.max(0, Math.min(100, Math.round(number)))
    : null;
}

export function hasCompleteTrafficLocation(location: LocationAddress) {
  return Boolean(
    text(location.street)
      && text(location.city)
      && text(location.state)
      && text(location.zip),
  );
}

export function locationTrafficQuery(location: LocationAddress) {
  const storeName = text(location.storeName);
  const storeNumber = text(location.storeNumber);
  const identity = [storeName, storeNumber ? `#${storeNumber}` : ""]
    .filter(Boolean)
    .join(" ");
  const address = [
    text(location.street),
    [text(location.city), text(location.state)].filter(Boolean).join(" "),
    text(location.zip),
  ].filter(Boolean).join(", ");
  return [identity, address].filter(Boolean).join(", ").slice(0, 300);
}

export function trafficPlaceMatchesLocation(
  place: Record<string, unknown>,
  location: LocationAddress,
) {
  const returnedAddress = [
    text(place.full_address),
    text(place.street),
    text(place.city),
    text(place.state),
    text(place.postal_code),
  ].filter(Boolean).join(" ").toLowerCase();
  const expectedZip = text(location.zip).toLowerCase();
  if (!returnedAddress || (expectedZip && !returnedAddress.includes(expectedZip))) {
    return false;
  }

  const streetNumber = text(location.street).match(/^\s*(\d+[a-z-]*)\b/i)?.[1];
  if (
    streetNumber
    && !new RegExp(`\\b${streetNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")
      .test(returnedAddress)
  ) {
    return false;
  }

  const expectedNameToken = text(location.storeName)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .find((token) => token.length >= 3 && !["store", "shop", "location"].includes(token));
  const returnedName = text(place.name).toLowerCase();
  return !expectedNameToken || returnedName.includes(expectedNameToken);
}

export function trafficWeekStart(value: Date | string) {
  const date = typeof value === "string"
    ? new Date(`${value.slice(0, 10)}T12:00:00Z`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
  return date.toISOString().slice(0, 10);
}

export function normalizePopularTimes(value: unknown): TrafficWeek | null {
  if (!Array.isArray(value)) return null;
  const week = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
  let pointCount = 0;

  for (const rawDay of value) {
    if (!rawDay || typeof rawDay !== "object") continue;
    const day = rawDay as PopularDay;
    const sourceDay = Number(day.day);
    const targetDay = sourceDay === 7
      ? 0
      : sourceDay >= 1 && sourceDay <= 6
        ? sourceDay
        : -1;
    if (targetDay < 0 || !Array.isArray(day.popular_times)) continue;

    for (const rawPoint of day.popular_times) {
      if (!rawPoint || typeof rawPoint !== "object") continue;
      const point = rawPoint as PopularTimePoint;
      const hour = Number(point.hour);
      const percentage = clampPercentage(point.percentage);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || percentage === null) {
        continue;
      }
      week[targetDay][hour] = percentage;
      pointCount += 1;
    }
  }

  return pointCount ? week : null;
}

export function averageTrafficWeeks(
  previous: TrafficWeek,
  following: TrafficWeek,
): TrafficWeek {
  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: 24 }, (_, hour) =>
      Math.round(((previous[day]?.[hour] ?? 0) + (following[day]?.[hour] ?? 0)) / 2),
    ),
  );
}

export function trafficDayCurve(week: TrafficWeek, day: number) {
  if (!Number.isInteger(day) || day < 0 || day > 6) return [];
  return Array.from(
    { length: 24 },
    (_, hour) => clampPercentage(week[day]?.[hour]) ?? 0,
  );
}

export function requestedTrafficDay(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? -1 : date.getUTCDay();
}
