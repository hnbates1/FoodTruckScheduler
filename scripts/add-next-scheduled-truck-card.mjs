import { readFile, writeFile } from "node:fs/promises";

const PAGE_PATH = new URL("../app/page.tsx", import.meta.url);
const MARKER = "/* next-scheduled-truck-card-v1 */";

let page = await readFile(PAGE_PATH, "utf8");

if (!page.includes(MARKER)) {
  page = page.replace(
    '  const outcomeTruck = data.trucks.find((truck) => truck.id === outcomeVisit?.truckId);',
    `  const outcomeTruck = data.trucks.find((truck) => truck.id === outcomeVisit?.truckId);\n\n  ${MARKER}\n  const nextScheduled = useMemo(() => {\n    const now = new Date();\n    const nextVisit = data.visits\n      .filter((visit) => visit.status.toLowerCase() !== "cancelled")\n      .map((visit) => ({ visit, startsAt: new Date(\`\${visit.visitDate}T\${visit.startTime}:00\`) }))\n      .filter(({ startsAt }) => startsAt.getTime() >= now.getTime())\n      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];\n    if (!nextVisit) return null;\n    const truck = data.trucks.find((item) => item.id === nextVisit.visit.truckId);\n    if (!truck) return null;\n    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());\n    const visitDay = new Date(nextVisit.startsAt.getFullYear(), nextVisit.startsAt.getMonth(), nextVisit.startsAt.getDate());\n    const daysAway = Math.round((visitDay.getTime() - today.getTime()) / 86400000);\n    return { ...nextVisit, truck, daysAway };\n  }, [data.trucks, data.visits]);`
  );

  page = page.replace(
    '            <TruckProfile truck={selectedTruck} onView={() => setView("trucks")} />',
    '            <NextScheduledTruck next={nextScheduled} onView={(visitDate) => { setSelectedDate(new Date(`${visitDate}T12:00:00`)); setView("schedule"); }} onSchedule={() => setView("schedule")} />\n            <TruckProfile truck={selectedTruck} onView={() => setView("trucks")} />'
  );

  page = page.replace(
    'function TruckProfile({ truck, onView }: { truck: Truck; onView: () => void }) {',
    `function NextScheduledTruck({ next, onView, onSchedule }: { next: { visit: Visit; startsAt: Date; truck: Truck; daysAway: number } | null; onView: (visitDate: string) => void; onSchedule: () => void }) {\n  const when = next?.daysAway === 0 ? "Today" : next?.daysAway === 1 ? "Tomorrow" : next ? \`In \${next.daysAway} days\` : "";\n  return <article className="rail-card next-truck-card">\n    <div className="card-title"><h2>Next Scheduled Truck</h2><span>▰</span></div>\n    {next ? <>\n      <div className="profile-head"><TruckAvatar truck={next.truck} large /><div><h3>{next.truck.name}</h3><p>{next.truck.cuisine}</p><strong className="rating">{when}</strong></div></div>\n      <dl><div><dt>Date</dt><dd>{next.startsAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</dd></div><div><dt>Time</dt><dd>{formatTime(next.visit.startTime)} – {formatTime(next.visit.endTime)}</dd></div><div><dt>Status</dt><dd>{next.visit.status}</dd></div></dl>\n      <button className="primary wide" type="button" onClick={() => onView(next.visit.visitDate)}>View on Schedule →</button>\n    </> : <>\n      <div className="ai-box"><h3>No upcoming truck scheduled</h3><p>There are no future, non-cancelled visits anywhere on the schedule.</p></div>\n      <button className="secondary wide" type="button" onClick={onSchedule}>Open Schedule</button>\n    </>}\n  </article>;\n}\n\nfunction TruckProfile({ truck, onView }: { truck: Truck; onView: () => void }) {`
  );

  if (!page.includes(MARKER)) throw new Error("Could not insert next scheduled truck card.");
  await writeFile(PAGE_PATH, page);
}
