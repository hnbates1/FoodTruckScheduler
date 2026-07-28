import assert from "node:assert/strict";
import test from "node:test";

import {
  googlePlaceProfile,
  googlePlacesSearchQuery,
  isGooglePlaceId,
} from "../app/lib/google-places.ts";

test("builds a bounded food-truck search near the store", () => {
  assert.equal(
    googlePlacesSearchQuery("Taco Trail", {
      city: "Niles",
      state: "OH",
      zip: "44446",
    }),
    "Taco Trail food truck Niles OH 44446",
  );
});

test("normalizes Google ratings and review-summary disclosure", () => {
  assert.deepEqual(
    googlePlaceProfile({
      id: "ChIJ_place_12345",
      displayName: { text: "Taco Trail" },
      formattedAddress: "100 Main St",
      googleMapsUri: "https://maps.google.com/example",
      websiteUri: "https://example.com/",
      rating: 4.7,
      userRatingCount: 83,
      reviewSummary: {
        text: { text: "Customers mention quick service." },
        disclosureText: { text: "Summarized with Gemini" },
        reviewsUri: "https://maps.google.com/reviews",
        flagContentUri: "https://maps.google.com/flag",
      },
    }),
    {
      placeId: "ChIJ_place_12345",
      name: "Taco Trail",
      address: "100 Main St",
      mapsUri: "https://maps.google.com/example",
      websiteUri: "https://example.com/",
      rating: 4.7,
      ratingCount: 83,
      summary: "Customers mention quick service.",
      summaryDisclosure: "Summarized with Gemini",
      summaryReviewsUri: "https://maps.google.com/reviews",
      summaryFlagUri: "https://maps.google.com/flag",
    },
  );
});

test("rejects malformed Place IDs and incomplete responses", () => {
  assert.equal(isGooglePlaceId("not a place"), false);
  assert.equal(isGooglePlaceId("short"), false);
  assert.equal(googlePlaceProfile({ displayName: { text: "Missing ID" } }), null);
});
