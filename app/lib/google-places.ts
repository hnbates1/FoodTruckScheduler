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
) {
  const name = stringValue(truckName).slice(0, 80);
  const locality = [
    stringValue(location.city),
    stringValue(location.state),
    stringValue(location.zip),
  ].filter(Boolean).join(" ");
  const address = [
    stringValue(location.street),
    locality,
  ].filter(Boolean).join(", ").slice(0, 140);
  return [
    name,
    "food truck",
    address ? `near ${address}` : "",
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
