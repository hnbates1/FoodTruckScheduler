import assert from "node:assert/strict";
import test from "node:test";

import {
  averageTrafficWeeks,
  hasCompleteTrafficLocation,
  locationTrafficQuery,
  normalizePopularTimes,
  requestedTrafficDay,
  trafficDayCurve,
  trafficPlaceMatchesLocation,
  trafficWeekStart,
} from "../app/lib/location-traffic.ts";

test("builds an exact store query from the programmed location", () => {
  assert.equal(
    locationTrafficQuery({
      storeName: "Lowe's",
      storeNumber: "0244",
      street: "940 Niles Cortland Rd SE",
      city: "Warren",
      state: "OH",
      zip: "44484",
    }),
    "Lowe's #0244, 940 Niles Cortland Rd SE, Warren OH, 44484",
  );
  assert.equal(
    hasCompleteTrafficLocation({
      street: "940 Niles Cortland Rd SE",
      city: "Warren",
      state: "OH",
      zip: "44484",
    }),
    true,
  );
});

test("rejects a result at the wrong store address", () => {
  const location = {
    storeName: "Lowe's",
    street: "940 Niles Cortland Rd SE",
    city: "Warren",
    state: "OH",
    zip: "44484",
  };
  assert.equal(
    trafficPlaceMatchesLocation({
      name: "Lowe's Home Improvement",
      full_address: "940 Niles Cortland Rd SE, Warren, OH 44484",
    }, location),
    true,
  );
  assert.equal(
    trafficPlaceMatchesLocation({
      name: "Lowe's Home Improvement",
      full_address: "1100 Doral Dr, Poland, OH 44514",
    }, location),
    false,
  );
});

test("normalizes Outscraper Sunday and Monday popular times", () => {
  const week = normalizePopularTimes([
    {
      day: 7,
      popular_times: [
        { hour: 10, percentage: 25 },
        { hour: 11, percentage: 48 },
      ],
    },
    {
      day: 1,
      popular_times: [{ hour: 10, percentage: 64 }],
    },
  ]);
  assert.ok(week);
  assert.equal(trafficDayCurve(week, 0)[11], 48);
  assert.equal(trafficDayCurve(week, 1)[10], 64);
  assert.equal(trafficDayCurve(week, 2)[10], 0);
});

test("rejects an empty popular-times response", () => {
  assert.equal(normalizePopularTimes(null), null);
  assert.equal(normalizePopularTimes([]), null);
  assert.equal(normalizePopularTimes([{ day: 1, popular_times: [] }]), null);
});

test("averages two surrounding successful weekly snapshots", () => {
  const previous = Array.from({ length: 7 }, () => Array(24).fill(20));
  const following = Array.from({ length: 7 }, () => Array(24).fill(70));
  const average = averageTrafficWeeks(previous, following);
  assert.equal(average[0][0], 45);
  assert.equal(average[6][23], 45);
});

test("uses Monday as the weekly snapshot boundary", () => {
  assert.equal(trafficWeekStart("2026-07-28"), "2026-07-27");
  assert.equal(trafficWeekStart("2026-08-02"), "2026-07-27");
  assert.equal(trafficWeekStart("2026-08-03"), "2026-08-03");
  assert.equal(requestedTrafficDay("2026-08-02"), 0);
});
