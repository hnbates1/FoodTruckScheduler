import { readFile, writeFile } from "node:fs/promises";

const PAGE_PATH = new URL("../app/page.tsx", import.meta.url);
const CSS_PATH = new URL("../app/globals.css", import.meta.url);
const MARKER = "/* location-schedule-settings-v1 */";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Could not apply ${label}; expected source was not found.`);
  return source.replace(before, after);
}

let page = await readFile(PAGE_PATH, "utf8");
if (!page.includes(MARKER)) {
  page = page.replace('import { VISIT_OUTCOMES } from "./lib/reliability";\n', 'import { VISIT_OUTCOMES } from "./lib/reliability";\n\n' + MARKER + '\n');

  page = replaceRequired(
    page,
    'type LocationProfile = { storeName: string; storeNumber: string; street: string; city: string; state: string; zip: string; phone: string; timezone: string; notes: string; operatingHours: DayAvailability[]; closedDates: string[] };',
    'type LocationProfile = { storeName: string; storeNumber: string; street: string; city: string; state: string; zip: string; phone: string; timezone: string; notes: string; operatingHours: DayAvailability[]; closedDates: string[]; weekStartsOn?: number };',
    "location profile week-start field",
  );

  page = replaceRequired(
    page,
    'const [location, setLocation] = useState<LocationProfile>({ storeName: "Lowe\'s", storeNumber: "0244", street: "", city: "", state: "OH", zip: "", phone: "", timezone: "America/New_York", notes: "", operatingHours: weekDays.map(({ day }) => ({ day, enabled: day >= 1 && day <= 6, start: "06:00", end: "22:00" })), closedDates: [] });',
    'const [location, setLocation] = useState<LocationProfile>({ storeName: "Lowe\'s", storeNumber: "0244", street: "", city: "", state: "OH", zip: "", phone: "", timezone: "America/New_York", notes: "", operatingHours: weekDays.map(({ day }) => ({ day, enabled: day >= 1 && day <= 6, start: "06:00", end: "22:00" })), closedDates: [], weekStartsOn: 6 });',
    "default Saturday week start",
  );

  page = replaceRequired(
    page,
    '          setLocation(result.location);',
    '          setLocation({ ...result.location, weekStartsOn: Number.isInteger(result.location.weekStartsOn) ? result.location.weekStartsOn : 6 });',
    "remote location normalization",
  );

  page = replaceRequired(
    page,
    '        try { setLocation(JSON.parse(saved) as LocationProfile); } catch { window.localStorage.removeItem("food-truck-admin-location"); }',
    '        try { const parsed = JSON.parse(saved) as LocationProfile; setLocation({ ...parsed, weekStartsOn: Number.isInteger(parsed.weekStartsOn) ? parsed.weekStartsOn : 6 }); } catch { window.localStorage.removeItem("food-truck-admin-location"); }',
    "cached location normalization",
  );

  page = replaceRequired(
    page,
    '  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - selectedDate.getDay() + 1)), [selectedDate]);',
    '  const weekStartsOn = Number.isInteger(location.weekStartsOn) ? Number(location.weekStartsOn) : 6;\n  const week = useMemo(() => { const offset = (selectedDate.getDay() - weekStartsOn + 7) % 7; const start = addDays(selectedDate, -offset); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }, [selectedDate, weekStartsOn]);',
    "dashboard week calculation",
  );

  page = replaceRequired(
    page,
    '  function openVisitModal(visitDate = dateKey(selectedDate), startTime = "11:00", truckId = selectedTruckId) {\n    const endTime = timeFromMinutes(Math.min(1200, minutes(startTime) + 180));',
    '  function openVisitModal(visitDate = dateKey(selectedDate), startTime = "11:00", truckId = selectedTruckId) {\n    const visitDay = new Date(`${visitDate}T12:00:00`).getDay();\n    const dayHours = location.operatingHours?.find((slot) => slot.day === visitDay);\n    const closingMinutes = dayHours?.enabled ? minutes(dayHours.end) : 1440;\n    const endTime = timeFromMinutes(Math.min(closingMinutes, minutes(startTime) + 180));',
    "visit default end time",
  );

  page = replaceRequired(
    page,
    '<ScheduleBoard visits={dayVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} traffic={locationTraffic}',
    '<ScheduleBoard visits={dayVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} operatingHours={location.operatingHours} traffic={locationTraffic}',
    "dashboard operating hours",
  );

  page = replaceRequired(
    page,
    '<ScheduleView data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} traffic={locationTraffic}',
    '<ScheduleView data={data} location={location} selectedDate={selectedDate} setSelectedDate={setSelectedDate} traffic={locationTraffic}',
    "schedule location prop",
  );

  page = replaceRequired(
    page,
    'function TrafficCurveRow({\n  traffic,\n  loading,\n}: {\n  traffic: LocationTraffic | null;\n  loading: boolean;\n}) {',
    'function TrafficCurveRow({\n  traffic,\n  loading,\n  timelineStart,\n  timelineEnd,\n}: {\n  traffic: LocationTraffic | null;\n  loading: boolean;\n  timelineStart: number;\n  timelineEnd: number;\n}) {',
    "traffic timeline props",
  );

  page = replaceRequired(
    page,
    '  const peak = Math.max(...values);',
    '  const peak = Math.max(...values);\n  const timelineSpan = Math.max(60, timelineEnd - timelineStart);\n  const trafficPlotStart = Math.max(timelineStart, 600);\n  const trafficPlotEnd = Math.min(timelineEnd, 1200);\n  const trafficPlotLeft = ((trafficPlotStart - timelineStart) / timelineSpan) * 100;\n  const trafficPlotWidth = Math.max(0, ((trafficPlotEnd - trafficPlotStart) / timelineSpan) * 100);',
    "traffic plot position",
  );

  page = replaceRequired(
    page,
    '<svg viewBox="0 0 1000 72" preserveAspectRatio="none" role="img"',
    '<svg style={{ left: `${trafficPlotLeft}%`, right: "auto", width: `${trafficPlotWidth}%` }} viewBox="0 0 1000 72" preserveAspectRatio="none" role="img"',
    "traffic plot sizing",
  );

  page = replaceRequired(
    page,
    'function ScheduleBoard({ visits, trucks, overlaps, visitDate, traffic, trafficLoading, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit, onRecordOutcome }: { visits: Visit[]; trucks: Truck[]; overlaps: Visit[][]; visitDate: string; traffic: LocationTraffic | null; trafficLoading: boolean;',
    'function ScheduleBoard({ visits, trucks, overlaps, visitDate, operatingHours, traffic, trafficLoading, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit, onRecordOutcome }: { visits: Visit[]; trucks: Truck[]; overlaps: Visit[][]; visitDate: string; operatingHours: DayAvailability[]; traffic: LocationTraffic | null; trafficLoading: boolean;',
    "schedule board operating-hours prop",
  );

  page = replaceRequired(
    page,
    '  const timelineStart = 600;\n  const timelineEnd = 1200;\n  const timelineSpan = timelineEnd - timelineStart;',
    '  const visitDay = new Date(`${visitDate}T12:00:00`).getDay();\n  const dayHours = operatingHours?.find((slot) => slot.day === visitDay);\n  const timelineStart = dayHours?.enabled ? minutes(dayHours.start) : 360;\n  const timelineEnd = dayHours?.enabled && minutes(dayHours.end) > timelineStart ? minutes(dayHours.end) : 1320;\n  const timelineSpan = timelineEnd - timelineStart;\n  const timelineColumns = Math.max(1, Math.ceil(timelineSpan / 60));',
    "dynamic timeline range",
  );

  page = replaceRequired(
    page,
    '  return <div className="schedule-board">',
    '  return <div className="schedule-board" style={{ "--timeline-columns": timelineColumns } as React.CSSProperties}>',
    "timeline CSS variable",
  );

  page = replaceRequired(
    page,
    '<div className="time-head"><strong>TRUCKS</strong>{Array.from({ length: 10 }, (_, i) => <span key={i}>{formatTime(`${10 + i}:00`).replace(":00", "")}</span>)}</div>',
    '<div className="time-head" style={{ gridTemplateColumns: `225px repeat(${timelineColumns}, minmax(58px, 1fr))` }}><strong>TRUCKS</strong>{Array.from({ length: timelineColumns }, (_, i) => <span key={i}>{formatTime(timeFromMinutes(timelineStart + i * 60)).replace(":00", "")}</span>)}</div>',
    "dynamic timeline header",
  );

  page = replaceRequired(
    page,
    '<TrafficCurveRow traffic={traffic} loading={trafficLoading} />',
    '<TrafficCurveRow traffic={traffic} loading={trafficLoading} timelineStart={timelineStart} timelineEnd={timelineEnd} />',
    "traffic timeline call",
  );

  page = replaceRequired(
    page,
    'function ScheduleView({ data, selectedDate, setSelectedDate, traffic, trafficLoading, onSchedule, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit, onRecordOutcome }: { data: AppData; selectedDate: Date;',
    'function ScheduleView({ data, location, selectedDate, setSelectedDate, traffic, trafficLoading, onSchedule, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit, onRecordOutcome }: { data: AppData; location: LocationProfile; selectedDate: Date;',
    "schedule view location prop",
  );

  page = replaceRequired(
    page,
    '  const weekStart = addDays(selectedDate, -selectedDate.getDay() + 1);\n  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));',
    '  const configuredWeekStart = Number.isInteger(location.weekStartsOn) ? Number(location.weekStartsOn) : 6;\n  const weekOffset = (selectedDate.getDay() - configuredWeekStart + 7) % 7;\n  const weekStart = addDays(selectedDate, -weekOffset);\n  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));',
    "schedule view week calculation",
  );

  page = replaceRequired(
    page,
    '<ScheduleBoard visits={selectedVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} traffic={traffic}',
    '<ScheduleBoard visits={selectedVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} operatingHours={location.operatingHours} traffic={traffic}',
    "schedule view operating hours",
  );

  page = replaceRequired(
    page,
    '        operatingHours: weekDays.map(({ day }) => ({ day, enabled: openDays.has(day), start: String(form.get(`open_${day}`) || "06:00"), end: String(form.get(`close_${day}`) || "22:00") })),\n        closedDates:',
    '        operatingHours: weekDays.map(({ day }) => ({ day, enabled: openDays.has(day), start: String(form.get(`open_${day}`) || "06:00"), end: String(form.get(`close_${day}`) || "22:00") })),\n        weekStartsOn: Number(form.get("weekStartsOn") || 6),\n        closedDates:',
    "location form persistence",
  );

  page = replaceRequired(
    page,
    '<label className="full">Street address<input name="street" defaultValue={location.street} required /></label><label>City<input name="city" defaultValue={location.city} required /></label><label>State<input name="state" defaultValue={location.state} required /></label><label>ZIP<input name="zip" defaultValue={location.zip} required /></label><label>Store phone<input name="phone" defaultValue={location.phone} /></label><label className="full">Scheduling time zone<input name="timezone" defaultValue={location.timezone} required /></label>\n      <fieldset',
    '<label className="full">Street address<input name="street" defaultValue={location.street} required /></label><label>City<input name="city" defaultValue={location.city} required /></label><label>State<input name="state" defaultValue={location.state} required /></label><label>ZIP<input name="zip" defaultValue={location.zip} required /></label><label>Store phone<input name="phone" defaultValue={location.phone} /></label><label>Scheduling time zone<input name="timezone" defaultValue={location.timezone} required /></label><label>Week Starts On<select name="weekStartsOn" defaultValue={String(Number.isInteger(location.weekStartsOn) ? location.weekStartsOn : 6)}>{weekDays.map((day) => <option value={day.day} key={day.day}>{day.label}</option>)}</select></label>\n      <fieldset',
    "location week-start selector",
  );

  page = replaceRequired(
    page,
    '<dl><div><dt>Address</dt><dd>{address || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{location.phone || "Not provided"}</dd></div><div><dt>Time zone</dt><dd>{location.timezone}</dd></div></dl>',
    '<dl><div><dt>Address</dt><dd>{address || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{location.phone || "Not provided"}</dd></div><div><dt>Time zone</dt><dd>{location.timezone}</dd></div><div><dt>Week Starts On</dt><dd>{weekDays.find((day) => day.day === (Number.isInteger(location.weekStartsOn) ? location.weekStartsOn : 6))?.label || "Saturday"}</dd></div></dl>',
    "location week-start display",
  );

  await writeFile(PAGE_PATH, page);
}

let css = await readFile(CSS_PATH, "utf8");
css = css
  .replace('background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),#17344e 10%);', 'background:repeating-linear-gradient(90deg,transparent 0,transparent calc((100% / var(--timeline-columns,10)) - 1px),#17344e calc(100% / var(--timeline-columns,10)));')
  .replace('background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),#23415d 10%);', 'background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc((100% / var(--timeline-columns,10)) - 1px),#23415d calc(100% / var(--timeline-columns,10)));');
await writeFile(CSS_PATH, css);
