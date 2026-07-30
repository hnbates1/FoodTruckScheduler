import { readFile, writeFile } from "node:fs/promises";

const PAGE_PATH = new URL("../app/page.tsx", import.meta.url);
const MARKER = "// traffic-store-hours-v1";

let page = await readFile(PAGE_PATH, "utf8");

if (!page.includes(MARKER)) {
  const oldValues = `  const values = Array.from(
    { length: 11 },
    (_, index) => traffic?.values?.[10 + index] ?? 0,
  );`;
  const newValues = `  ${MARKER}
  const trafficStartHour = Math.max(0, Math.min(23, Math.floor(timelineStart / 60)));
  const trafficEndHour = Math.max(trafficStartHour, Math.min(23, Math.ceil(timelineEnd / 60)));
  const values = Array.from(
    { length: trafficEndHour - trafficStartHour + 1 },
    (_, index) => traffic?.values?.[trafficStartHour + index] ?? 0,
  );`;

  const oldPlotRange = `  const trafficPlotStart = Math.max(timelineStart, 600);
  const trafficPlotEnd = Math.min(timelineEnd, 1200);`;
  const newPlotRange = `  const trafficPlotStart = timelineStart;
  const trafficPlotEnd = timelineEnd;`;

  const oldLabel = 'aria-label={`Estimated typical location traffic from 10 AM to 8 PM; peak relative activity ${peak} out of 100`}';
  const newLabel = 'aria-label={`Estimated typical location traffic from ${formatTime(timeFromMinutes(timelineStart))} to ${formatTime(timeFromMinutes(timelineEnd))}; peak relative activity ${peak} out of 100`}';

  if (!page.includes(oldValues)) throw new Error("Could not find the fixed 10 AM–8 PM traffic values.");
  if (!page.includes(oldPlotRange)) throw new Error("Could not find the fixed traffic plot range.");
  if (!page.includes(oldLabel)) throw new Error("Could not find the fixed traffic accessibility label.");

  page = page
    .replace(oldValues, newValues)
    .replace(oldPlotRange, newPlotRange)
    .replace(oldLabel, newLabel);

  await writeFile(PAGE_PATH, page);
}
