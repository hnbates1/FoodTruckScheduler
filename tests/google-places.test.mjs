import assert from "node:assert/strict";
import test from "node:test";

import {
  googlePlaceProfile,
  googlePlacesSearchQuery,
  hasCompleteGooglePlacesLocation,
  hasGooglePlacesSearchArea,
  isGooglePlaceId,
  rankGooglePlaceCandidates,
} from "../app/lib/google-places.ts";

test("builds a bounded food-truck search near the store", () => {
  assert.equal(
    googlePlacesSearchQuery("Taco Trail", {
      street: "940 Niles Cortland Rd SE",
      city: "Niles",
      state: "OH",
      zip: "44446",
    }),
    "Taco Trail food truck near 940 Niles Cortland Rd SE, Niles OH 44446",
  );
});

test("lets an editor correct the search name and area", () => {
  assert.equal(
    googlePlacesSearchQuery(
      "Taco Trail",
      {
        street: "940 Niles Cortland Rd SE",
        city: "Niles",
        state: "OH",
        zip: "44446",
      },
      {
        searchText: "The Original Taco Trail",
        searchArea: "Youngstown, OH",
      },
    ),
    "The Original Taco Trail near Youngstown, OH",
  );
});

test("requires a complete store address before searching Google", () => {
  assert.equal(
    hasCompleteGooglePlacesLocation({
      street: "940 Niles Cortland Rd SE",
      city: "Niles",
      state: "OH",
      zip: "44446",
    }),
    true,
  );
  assert.equal(
    hasCompleteGooglePlacesLocation({
      city: "Niles",
      state: "OH",
      zip: "44446",
    }),
    false,
  );
  assert.equal(
    hasGooglePlacesSearchArea({}, "Youngstown, OH"),
    true,
  );
  assert.equal(
    hasGooglePlacesSearchArea({}, "  "),
    false,
  );
});

test("keeps Google search queries within the API limit", () => {
  const query = googlePlacesSearchQuery("T".repeat(400), {
    street: "S".repeat(400),
    city: "Niles",
    state: "OH",
    zip: "44446",
  });
  assert.ok(query.length <= 240);
  assert.match(query, /food truck near/);
});

test("ranks AI matches and leaves missing judgments visible", () => {
  const candidates = [
    googlePlaceProfile({
      id: "ChIJ_wrong_12345",
      displayName: { text: "Completely Different Restaurant" },
    }),
    googlePlaceProfile({
      id: "ChIJ_right_12345",
      displayName: { text: "Taco Trail" },
    }),
    googlePlaceProfile({
      id: "ChIJ_unsure_12345",
      displayName: { text: "Taco Trailer" },
    }),
  ].filter(Boolean);
  const ranking = rankGooglePlaceCandidates(candidates, {
    response: {
      matches: [
        {
          placeId: "ChIJ_wrong_12345",
          matchLevel: "unlikely",
          reason: "The business name is unrelated.",
        },
        {
          placeId: "ChIJ_right_12345",
          matchLevel: "likely",
          reason: "The names match exactly.",
        },
      ],
    },
  });
  assert.equal(ranking.applied, true);
  assert.deepEqual(
    ranking.candidates.map((candidate) => [
      candidate.placeId,
      candidate.matchLevel,
    ]),
    [
      ["ChIJ_right_12345", "likely"],
      ["ChIJ_unsure_12345", "possible"],
      ["ChIJ_wrong_12345", "unlikely"],
    ],
  );
});

test("keeps Google order when AI output is unusable", () => {
  const candidate = googlePlaceProfile({
    id: "ChIJ_place_12345",
    displayName: { text: "Taco Trail" },
  });
  const ranking = rankGooglePlaceCandidates(
    candidate ? [candidate] : [],
    { response: "not json" },
  );
  assert.equal(ranking.applied, false);
  assert.equal(ranking.candidates[0]?.placeId, "ChIJ_place_12345");
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
