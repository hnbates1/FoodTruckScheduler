import assert from "node:assert/strict";
import test from "node:test";

import {
  isCancellationOutcome,
  isVisitOutcome,
  reliabilityFromOutcomes,
} from "../app/lib/reliability.ts";

test("new trucks start at zero reliability", () => {
  assert.deepEqual(reliabilityFromOutcomes([]), {
    count: 0,
    percentage: 0,
  });
});

test("reliability averages scored attendance outcomes", () => {
  assert.deepEqual(
    reliabilityFromOutcomes([
      "Attended",
      "Attended",
      "Attended late",
      "No show",
    ]),
    {
      count: 4,
      percentage: 69,
    },
  );
});

test("store and weather cancellations do not affect reliability", () => {
  assert.deepEqual(
    reliabilityFromOutcomes([
      "Attended",
      "Cancelled by store",
      "Weather cancellation",
    ]),
    {
      count: 1,
      percentage: 100,
    },
  );
});

test("validates supported outcomes and cancellation types", () => {
  assert.equal(isVisitOutcome("No show"), true);
  assert.equal(isVisitOutcome("Unknown"), false);
  assert.equal(isCancellationOutcome("Cancelled by truck"), true);
  assert.equal(isCancellationOutcome("Attended"), false);
});
