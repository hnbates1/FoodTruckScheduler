export const VISIT_OUTCOMES = [
  { value: "Attended", label: "Attended — on time", score: 100 },
  { value: "Attended late", label: "Attended — late", score: 75 },
  { value: "No show", label: "No-show", score: 0 },
  { value: "Cancelled by truck", label: "Cancelled by truck", score: 0 },
  { value: "Cancelled by store", label: "Cancelled by store", score: null },
  { value: "Weather cancellation", label: "Weather cancellation", score: null },
] as const;

export type VisitOutcome = (typeof VISIT_OUTCOMES)[number]["value"];

const outcomeScores = new Map<string, number | null>(
  VISIT_OUTCOMES.map((outcome) => [outcome.value, outcome.score]),
);

export function isVisitOutcome(value: string): value is VisitOutcome {
  return outcomeScores.has(value);
}

export function isCancellationOutcome(value: string) {
  return value === "Cancelled by truck"
    || value === "Cancelled by store"
    || value === "Weather cancellation";
}

export function reliabilityFromOutcomes(outcomes: unknown[]) {
  const scores = outcomes.flatMap((outcome) => {
    if (typeof outcome !== "string") return [];
    const score = outcomeScores.get(outcome);
    return typeof score === "number" ? [score] : [];
  });

  return {
    count: scores.length,
    percentage: scores.length
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0,
  };
}
