export type GooglePlaceProfile = {
  placeId: string;
  name: string;
  address: string;
  mapsUri: string;
  websiteUri: string;
  rating: number | null;
  ratingCount: number;
  summary: string;
  summaryDisclosure: string;
  summaryReviewsUri: string;
  summaryFlagUri: string;
  matchLevel?: "likely" | "possible" | "unlikely";
  matchReason?: string;
};

type GoogleLocalizedText = {
  text?: unknown;
};

type GooglePlacePayload = {
  id?: unknown;
  displayName?: GoogleLocalizedText;
  formattedAddress?: unknown;
  googleMapsUri?: unknown;
  websiteUri?: unknown;
  rating?: unknown;
  userRatingCount?: unknown;
  reviewSummary?: {
    text?: GoogleLocalizedText;
    disclosureText?: GoogleLocalizedText;
    reviewsUri?: unknown;
    flagContentUri?: unknown;
  };
};

type GooglePlacesLocation = {
  street?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
};

type GooglePlacesSearchOptions = {
  searchText?: unknown;
  searchArea?: unknown;
};

type GooglePlaceAiMatch = {
  placeId?: unknown;
  matchLevel?: unknown;
  reason?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function httpsUrl(value: unknown) {
  const candidate = stringValue(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function isGooglePlaceId(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 10
    && value.length <= 300
    && /^[A-Za-z0-9_-]+$/.test(value);
}

export function googlePlaceProfile(value: unknown): GooglePlaceProfile | null {
  if (!value || typeof value !== "object") return null;
  const place = value as GooglePlacePayload;
  if (!isGooglePlaceId(place.id)) return null;
  const rating = finiteNumber(place.rating);
  const ratingCount = finiteNumber(place.userRatingCount);
  return {
    placeId: place.id,
    name: stringValue(place.displayName?.text),
    address: stringValue(place.formattedAddress),
    mapsUri: httpsUrl(place.googleMapsUri),
    websiteUri: httpsUrl(place.websiteUri),
    rating: rating === null ? null : Math.max(0, Math.min(5, rating)),
    ratingCount: ratingCount === null ? 0 : Math.max(0, Math.round(ratingCount)),
    summary: stringValue(place.reviewSummary?.text?.text),
    summaryDisclosure: stringValue(place.reviewSummary?.disclosureText?.text),
    summaryReviewsUri: httpsUrl(place.reviewSummary?.reviewsUri),
    summaryFlagUri: httpsUrl(place.reviewSummary?.flagContentUri),
  };
}

export function googlePlacesSearchQuery(
  truckName: unknown,
  location: GooglePlacesLocation,
  options: GooglePlacesSearchOptions = {},
) {
  const name = stringValue(truckName);
  const defaultSearchText = [
    name.slice(0, 95),
    "food truck",
  ].filter(Boolean).join(" ");
  const searchText = (
    stringValue(options.searchText)
    || defaultSearchText
  ).slice(0, 110);
  const locality = [
    stringValue(location.city),
    stringValue(location.state),
    stringValue(location.zip),
  ].filter(Boolean).join(" ");
  const address = [
    stringValue(location.street),
    locality,
  ].filter(Boolean).join(", ");
  const searchArea = (
    stringValue(options.searchArea)
    || address
  ).slice(0, 110);
  return [
    searchText,
    searchArea ? `near ${searchArea}` : "",
  ].filter(Boolean).join(" ").slice(0, 240);
}

export function hasCompleteGooglePlacesLocation(location: GooglePlacesLocation) {
  return [
    location.street,
    location.city,
    location.state,
    location.zip,
  ].every((value) => Boolean(stringValue(value)));
}

export function hasGooglePlacesSearchArea(
  location: GooglePlacesLocation,
  searchArea: unknown,
) {
  return Boolean(stringValue(searchArea))
    || hasCompleteGooglePlacesLocation(location);
}

function matchLevel(value: unknown): "likely" | "possible" | "unlikely" | null {
  return value === "likely" || value === "possible" || value === "unlikely"
    ? value
    : null;
}

function aiMatchPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return null;
  const response = (value as { response?: unknown }).response;
  if (typeof response !== "string") return response;
  try {
    return JSON.parse(response);
  } catch {
    return null;
  }
}

export function rankGooglePlaceCandidates(
  candidates: GooglePlaceProfile[],
  aiResult: unknown,
) {
  const payload = aiMatchPayload(aiResult);
  if (!payload || typeof payload !== "object") {
    return { candidates, applied: false };
  }
  const matches = (payload as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) {
    return { candidates, applied: false };
  }
  const byPlaceId = new Map<string, {
    matchLevel: "likely" | "possible" | "unlikely";
    matchReason: string;
  }>();
  for (const value of matches) {
    if (!value || typeof value !== "object") continue;
    const match = value as GooglePlaceAiMatch;
    const placeId = stringValue(match.placeId);
    const level = matchLevel(match.matchLevel);
    if (!isGooglePlaceId(placeId) || !level) continue;
    byPlaceId.set(placeId, {
      matchLevel: level,
      matchReason: stringValue(match.reason).slice(0, 180),
    });
  }
  if (!byPlaceId.size) {
    return { candidates, applied: false };
  }
  const order = { likely: 0, possible: 1, unlikely: 2 };
  const ranked = candidates.map((candidate, index) => {
    const match = byPlaceId.get(candidate.placeId);
    return {
      candidate: match
        ? { ...candidate, ...match }
        : { ...candidate, matchLevel: "possible" as const },
      index,
    };
  });
  ranked.sort((left, right) => {
    const levelDifference = order[left.candidate.matchLevel || "possible"]
      - order[right.candidate.matchLevel || "possible"];
    return levelDifference || left.index - right.index;
  });
  return {
    candidates: ranked.map(({ candidate }) => candidate),
    applied: true,
  };
}
