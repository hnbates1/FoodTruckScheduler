"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Truck = {
  id: number;
  name: string;
  cuisine: string;
  contact: string;
  phone: string;
  email: string;
  insuranceExpiry: string;
  licenseExpiry: string;
  preferredStart: string;
  preferredEnd: string;
  reliability: number;
  notes: string;
  color: string;
  availability: DayAvailability[];
};

type DayAvailability = {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
};

type Visit = {
  id: number;
  truckId: number;
  visitDate: string;
  startTime: string;
  endTime: string;
  status: string;
  expectedDemand: string;
  notes: string;
};

type AppData = { trucks: Truck[]; visits: Visit[]; storage?: "postgres" };
type View = "dashboard" | "schedule" | "trucks" | "insights";

const nav: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "schedule", label: "Schedule", icon: "▣" },
  { id: "trucks", label: "Trucks", icon: "▤" },
  { id: "insights", label: "Insights", icon: "◫" },
];

const weekDays = [
  { day: 0, short: "Sun", label: "Sunday" },
  { day: 1, short: "Mon", label: "Monday" },
  { day: 2, short: "Tue", label: "Tuesday" },
  { day: 3, short: "Wed", label: "Wednesday" },
  { day: 4, short: "Thu", label: "Thursday" },
  { day: 5, short: "Fri", label: "Friday" },
  { day: 6, short: "Sat", label: "Saturday" },
];

const commonCuisines = [
  "American / Comfort Food",
  "Asian / Asian Fusion",
  "Barbecue",
  "Breakfast / Brunch",
  "Burgers & Fries",
  "Chicken / Wings",
  "Coffee / Beverages",
  "Desserts / Bakery",
  "Greek / Mediterranean",
  "Hot Dogs / Sausages",
  "Ice Cream / Frozen Treats",
  "Indian",
  "Italian",
  "Mexican / Tacos",
  "Pizza",
  "Sandwiches / Subs",
  "Seafood",
  "Soul Food",
  "Vegetarian / Vegan",
];

function standardAvailability(start = "11:00", end = "15:00"): DayAvailability[] {
  return weekDays.map(({ day }) => ({ day, enabled: day >= 1 && day <= 5, start, end }));
}

const localSeed: AppData = {
  trucks: [
    { id: 1, name: "Steel City Smash", cuisine: "Smashburgers & Fries", contact: "Maya Chen", phone: "(412) 555-0188", email: "maya@steelcitysmash.com", insuranceExpiry: "2026-10-14", licenseExpiry: "2027-02-28", preferredStart: "11:00", preferredEnd: "15:00", reliability: 96, notes: "Strong lunch performer. Needs 20A electrical hookup.", color: "#1687ff", availability: standardAvailability() },
    { id: 2, name: "Taco Loco", cuisine: "Mexican", contact: "Luis Ramirez", phone: "(330) 555-0142", email: "hello@tacoloco.com", insuranceExpiry: "2027-01-09", licenseExpiry: "2026-11-22", preferredStart: "12:00", preferredEnd: "16:00", reliability: 92, notes: "Fast service and broad menu.", color: "#7ac943", availability: standardAvailability("12:00", "16:00") },
    { id: 3, name: "Sweet Wheels", cuisine: "Desserts & Coffee", contact: "Nina Patel", phone: "(234) 555-0171", email: "nina@sweetwheels.com", insuranceExpiry: "2026-09-18", licenseExpiry: "2027-03-10", preferredStart: "15:00", preferredEnd: "19:00", reliability: 88, notes: "Best after 2 PM and during associate events.", color: "#9b6cff", availability: standardAvailability("15:00", "19:00").map((slot) => ({ ...slot, enabled: slot.day >= 3 && slot.day <= 6 })) },
    { id: 4, name: "Smoke & Oak BBQ", cuisine: "Barbecue", contact: "Marcus Reed", phone: "(330) 555-0126", email: "marcus@smokeandoak.com", insuranceExpiry: "2026-08-21", licenseExpiry: "2026-12-12", preferredStart: "11:00", preferredEnd: "15:00", reliability: 94, notes: "High draw; allow 30 minutes for setup.", color: "#ff9c42", availability: standardAvailability().map((slot) => ({ ...slot, enabled: [1, 4, 5, 6].includes(slot.day) })) },
  ],
  visits: [
    { id: 1, truckId: 1, visitDate: "2026-07-27", startTime: "11:00", endTime: "14:00", status: "Confirmed", expectedDemand: "High", notes: "" },
    { id: 2, truckId: 2, visitDate: "2026-07-27", startTime: "12:00", endTime: "16:00", status: "Confirmed", expectedDemand: "High", notes: "" },
    { id: 3, truckId: 3, visitDate: "2026-07-27", startTime: "15:00", endTime: "19:00", status: "Confirmed", expectedDemand: "Medium", notes: "" },
    { id: 4, truckId: 4, visitDate: "2026-07-30", startTime: "11:00", endTime: "14:00", status: "Tentative", expectedDemand: "High", notes: "" },
  ],
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

function expiryState(value: string) {
  const days = Math.ceil((new Date(`${value}T12:00:00`).getTime() - new Date("2026-07-27T12:00:00").getTime()) / 86400000);
  return days < 0 ? "Expired" : days <= 45 ? "Expiring" : "Valid";
}

function withAvailability(truck: Truck): Truck {
  return {
    ...truck,
    availability: Array.isArray(truck.availability) && truck.availability.length === 7
      ? truck.availability
      : standardAvailability(truck.preferredStart, truck.preferredEnd),
  };
}

function isTruckAvailableOn(truck: Truck, date: Date) {
  return withAvailability(truck).availability.find((slot) => slot.day === date.getDay())?.enabled ?? false;
}

export default function Home() {
  const [data, setData] = useState<AppData>(localSeed);
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(new Date("2026-07-27T12:00:00"));
  const [selectedTruckId, setSelectedTruckId] = useState(1);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"visit" | "truck" | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);

  useEffect(() => {
    async function hydrate() {
      const saved = window.localStorage.getItem("truckstop-data");
      let savedData: AppData | null = null;
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as AppData;
          if (parsed.trucks?.length) {
            savedData = { ...parsed, trucks: parsed.trucks.map(withAvailability) };
          }
        } catch {
          window.localStorage.removeItem("truckstop-data");
        }
      }
      try {
        const response = await fetch("/api/data");
        if (!response.ok) throw new Error("Load failed");
        let remote = await response.json() as AppData;
        if (remote.storage === "postgres" && remote.trucks?.length === 0) {
          const importResponse = await fetch("/api/data", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ kind: "import", data: savedData ?? localSeed }),
          });
          if (importResponse.ok) remote = await importResponse.json() as AppData;
        }
        if (remote.trucks?.length) {
          setData({ ...remote, trucks: remote.trucks.map(withAvailability) });
          setSelectedTruckId(remote.trucks[0].id);
        }
      } catch {
        if (savedData?.trucks.length) {
          setData(savedData);
          setSelectedTruckId(savedData.trucks[0].id);
        }
      } finally {
        setLoading(false);
      }
    }
    void hydrate();
  }, []);

  useEffect(() => {
    if (!loading) window.localStorage.setItem("truckstop-data", JSON.stringify(data));
  }, [data, loading]);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - selectedDate.getDay() + 1)), [selectedDate]);
  const dayVisits = data.visits.filter((visit) => visit.visitDate === dateKey(selectedDate));
  const selectedTruck = data.trucks.find((truck) => truck.id === selectedTruckId) ?? data.trucks[0];

  const overlaps = useMemo(() => dayVisits.flatMap((a, index) =>
    dayVisits.slice(index + 1).filter((b) => minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime)).map((b) => [a, b])
  ), [dayVisits]);

  const recommendations = useMemo(() => {
    const scheduledIds = new Set(dayVisits.map((visit) => visit.truckId));
    const scheduledCuisines = new Set(dayVisits.map((visit) => data.trucks.find((t) => t.id === visit.truckId)?.cuisine));
    return data.trucks
      .filter((truck) => !scheduledIds.has(truck.id) && isTruckAvailableOn(truck, selectedDate))
      .map((truck) => {
        const compliant = expiryState(truck.insuranceExpiry) !== "Expired" && expiryState(truck.licenseExpiry) !== "Expired";
        const distinct = !scheduledCuisines.has(truck.cuisine);
        const score = truck.reliability + (compliant ? 8 : -40) + (distinct ? 5 : 0);
        return { truck, score, compliant, distinct };
      })
      .sort((a, b) => b.score - a.score);
  }, [data, dayVisits, selectedDate]);

  const filteredTrucks = data.trucks.filter((truck) => `${truck.name} ${truck.cuisine} ${truck.contact}`.toLowerCase().includes(query.toLowerCase()));

  async function save(kind: "truck" | "visit", payload: Record<string, unknown>) {
    const response = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, ...payload }) });
    if (!response.ok) throw new Error("Save failed");
    const next = await response.json() as AppData;
    setData(next);
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }

  async function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      await save("visit", payload);
      setModal(null);
      notify("Visit added to the schedule");
    } catch {
      const optimistic: Visit = { id: Date.now(), truckId: Number(payload.truckId), visitDate: String(payload.visitDate), startTime: String(payload.startTime), endTime: String(payload.endTime), status: String(payload.status), expectedDemand: String(payload.expectedDemand), notes: String(payload.notes ?? "") };
      setData((current) => ({ ...current, visits: [...current.visits, optimistic] }));
      setModal(null);
      notify("Visit saved for this session");
    }
  }

  async function submitTruck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries()) as Record<string, unknown>;
    const enabledDays = new Set(form.getAll("availabilityDays").map(Number));
    payload.availability = weekDays.map(({ day }) => ({
      day,
      enabled: enabledDays.has(day),
      start: String(form.get(`start_${day}`) || payload.preferredStart || "11:00"),
      end: String(form.get(`end_${day}`) || payload.preferredEnd || "15:00"),
    }));
    try {
      await save("truck", payload);
      setModal(null);
      notify("Truck profile created");
    } catch {
      const optimistic: Truck = { id: Date.now(), name: String(payload.name), cuisine: String(payload.cuisine), contact: String(payload.contact), phone: String(payload.phone), email: String(payload.email), insuranceExpiry: String(payload.insuranceExpiry), licenseExpiry: String(payload.licenseExpiry), preferredStart: String(payload.preferredStart), preferredEnd: String(payload.preferredEnd), reliability: 85, notes: String(payload.notes ?? ""), color: "#1687ff", availability: payload.availability as DayAvailability[] };
      setData((current) => ({ ...current, trucks: [...current.trucks, optimistic] }));
      setModal(null);
      notify("Truck profile saved on this device");
    }
  }

  async function deleteTruck(truckId: number) {
    const remainingTrucks = data.trucks.filter((truck) => truck.id !== truckId);
    try {
      const response = await fetch(`/api/data?id=${truckId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      const next = await response.json() as AppData;
      setData({ ...next, trucks: next.trucks.map(withAvailability) });
    } catch {
      setData((current) => ({
        trucks: current.trucks.filter((truck) => truck.id !== truckId),
        visits: current.visits.filter((visit) => visit.truckId !== truckId),
      }));
    }
    setSelectedTruckId(remainingTrucks[0]?.id ?? 0);
    setPendingDeleteId(null);
    notify("Truck and its scheduled visits deleted");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="TruckStop dashboard">
          <span className="truck-mark">▰</span><strong>TruckStop</strong>
        </button>
        <span className="store-chip">LOWE&apos;S • STORE 0244</span>
        <nav>
          {nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
        </nav>
        <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trucks, cuisine, contacts…" /></label>
        <button className="primary" onClick={() => setModal("visit")}>＋ Schedule Visit</button>
      </header>

      {view === "dashboard" && (
        <div className="dashboard">
          <section className="main-panel">
            <div className="page-heading">
              <div><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>{selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h1></div>
              <div className="date-actions"><button onClick={() => setSelectedDate(new Date("2026-07-27T12:00:00"))}>Today</button><button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>‹</button><button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>›</button></div>
            </div>

            <div className="week-strip">
              {week.map((date) => <button key={dateKey(date)} className={dateKey(date) === dateKey(selectedDate) ? "selected" : ""} onClick={() => setSelectedDate(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></button>)}
            </div>

            <div className="metrics">
              <article><span className="metric-icon blue">▰</span><div><strong>{dayVisits.length}</strong><p>Trucks Today</p><small>{dayVisits.length ? "Scheduled" : "Open day"}</small></div></article>
              <article><span className="ring">{Math.min(100, dayVisits.length * 28)}%</span><div><p>Lunch Coverage</p><small>11 AM – 2 PM</small><em className="good">{dayVisits.length > 1 ? "Good" : "Needs a truck"}</em></div></article>
              <article><span className={`metric-icon ${overlaps.length ? "red" : "green"}`}>△</span><div><strong>{overlaps.length}</strong><p>Schedule Conflicts</p><small>{overlaps.length ? "Needs attention" : "All clear"}</small></div></article>
              <article><span className="metric-icon blue">★</span><div><strong>{Math.round(data.trucks.reduce((sum, t) => sum + t.reliability, 0) / Math.max(1, data.trucks.length))}%</strong><p>Avg Reliability</p><small>Across active trucks</small></div></article>
            </div>

            <ScheduleBoard visits={dayVisits} trucks={data.trucks} overlaps={overlaps} onSelect={setSelectedTruckId} />
            <div className="legend"><span><i className="blue-swatch" />Confirmed</span><span><i className="green-swatch" />Available</span><span><i className="stripe-swatch" />Conflict</span><span><i className="amber-swatch" />Documents expiring</span></div>
          </section>
          <aside className="right-rail">
            <TruckProfile truck={selectedTruck} onView={() => setView("trucks")} />
            <Assistant recommendation={recommendations[0]} selectedDate={selectedDate} onSchedule={(truckId) => { setSelectedTruckId(truckId); setModal("visit"); }} />
          </aside>
        </div>
      )}

      {view === "schedule" && <ScheduleView data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onSchedule={() => setModal("visit")} onSelect={setSelectedTruckId} />}
      {view === "trucks" && <TrucksView trucks={filteredTrucks} selectedId={selectedTruckId} setSelectedId={setSelectedTruckId} onAdd={() => setModal("truck")} onDelete={setPendingDeleteId} />}
      {view === "insights" && <Insights data={data} />}

      {modal === "visit" && <Modal title="Schedule a food truck" subtitle="Add a visit and check the calendar before confirming." onClose={() => setModal(null)}><VisitForm trucks={data.trucks} selectedTruckId={selectedTruckId} selectedDate={dateKey(selectedDate)} onSubmit={submitVisit} /></Modal>}
      {modal === "truck" && <Modal title="Create truck profile" subtitle="Keep contact, compliance, and scheduling preferences together." onClose={() => setModal(null)}><TruckForm onSubmit={submitTruck} /></Modal>}
      {pendingDeleteId !== null && <DeleteTruckModal truck={data.trucks.find((truck) => truck.id === pendingDeleteId)} visitCount={data.visits.filter((visit) => visit.truckId === pendingDeleteId).length} onCancel={() => setPendingDeleteId(null)} onConfirm={() => deleteTruck(pendingDeleteId)} />}
      {toast && <div className="toast">✓ {toast}</div>}
      {loading && <div className="sync-note">Syncing schedule…</div>}
    </main>
  );
}

function ScheduleBoard({ visits, trucks, overlaps, onSelect }: { visits: Visit[]; trucks: Truck[]; overlaps: Visit[][]; onSelect: (id: number) => void }) {
  const shown = visits.length ? visits : trucks.slice(0, 3).map((truck, index) => ({ id: -truck.id, truckId: truck.id, visitDate: "", startTime: `${11 + index}:00`, endTime: `${14 + index}:00`, status: "Available", expectedDemand: "", notes: "" }));
  return <div className="schedule-board">
    <div className="time-head"><strong>TRUCKS</strong>{Array.from({ length: 10 }, (_, i) => <span key={i}>{formatTime(`${10 + i}:00`).replace(":00", "")}</span>)}</div>
    {shown.map((visit) => {
      const truck = trucks.find((t) => t.id === visit.truckId)!;
      const left = ((minutes(visit.startTime) - 600) / 540) * 100;
      const width = ((minutes(visit.endTime) - minutes(visit.startTime)) / 540) * 100;
      const conflict = overlaps.some((pair) => pair.some((item) => item.id === visit.id));
      return <div className="timeline-row" key={visit.id}>
        <button className="truck-label" onClick={() => onSelect(truck.id)}><span className="avatar" style={{ background: truck.color }}>{initials(truck.name)}</span><span><strong>{truck.name}</strong><small>{truck.cuisine}</small></span></button>
        <div className="timeline"><button className={`visit-block ${conflict ? "conflict" : ""}`} style={{ left: `${left}%`, width: `${Math.max(width, 18)}%`, background: `linear-gradient(110deg, ${truck.color}66, ${truck.color}bb)` }} onClick={() => onSelect(truck.id)}><small>{formatTime(visit.startTime)} – {formatTime(visit.endTime)}</small><strong>{truck.name}</strong><span>{visit.status}</span></button></div>
      </div>;
    })}
  </div>;
}

function TruckProfile({ truck, onView }: { truck: Truck; onView: () => void }) {
  if (!truck) return null;
  return <article className="rail-card profile-card">
    <div className="card-title"><h2>Truck Profile</h2><span>⌃</span></div>
    <div className="profile-head"><span className="avatar large" style={{ background: truck.color }}>{initials(truck.name)}</span><div><h3>{truck.name}</h3><p>{truck.cuisine}</p><strong className="rating">★ {(truck.reliability / 20).toFixed(1)}</strong></div></div>
    <dl><div><dt>Contact</dt><dd>{truck.contact}</dd></div><div><dt>Phone</dt><dd>{truck.phone}</dd></div><div><dt>Email</dt><dd>{truck.email}</dd></div><div><dt>Insurance</dt><dd>{expiryState(truck.insuranceExpiry)} through {new Date(`${truck.insuranceExpiry}T12:00:00`).toLocaleDateString()}</dd></div><div><dt>Preferred hours</dt><dd>{formatTime(truck.preferredStart)} – {formatTime(truck.preferredEnd)}</dd></div><div><dt>Reliability</dt><dd className="lime">{truck.reliability}%</dd></div></dl>
    <button className="secondary wide" onClick={onView}>View Full Profile</button>
  </article>;
}

function Assistant({ recommendation, selectedDate, onSchedule }: { recommendation?: { truck: Truck; compliant: boolean; distinct: boolean; score: number }; selectedDate: Date; onSchedule: (id: number) => void }) {
  return <article className="rail-card assistant">
    <div className="card-title"><h2>AI Schedule Assistant <em>BETA</em></h2><span>⌃</span></div>
    <div className="ai-box">{recommendation ? <><p>✦ Best available fit for {selectedDate.toLocaleDateString("en-US", { weekday: "long" })}:</p><h3>{recommendation.truck.name}</h3><small>Based on weekly availability, schedule fit, compliance, cuisine variety, and reliability.</small><ul><li>✓ Available that day</li><li>✓ {recommendation.distinct ? "No cuisine overlap" : "Complements existing lineup"}</li><li>✓ {recommendation.truck.reliability}% reliability</li><li>✓ {recommendation.compliant ? "Documents current" : "Review documents first"}</li></ul><button className="primary wide" onClick={() => onSchedule(recommendation.truck.id)}>Schedule this truck →</button></> : <><h3>No available match</h3><p>Every available truck is already scheduled, or no truck is marked available that day.</p></>}</div>
  </article>;
}

function ScheduleView({ data, selectedDate, setSelectedDate, onSchedule, onSelect }: { data: AppData; selectedDate: Date; setSelectedDate: (d: Date) => void; onSchedule: () => void; onSelect: (id: number) => void }) {
  const [mode, setMode] = useState<"gantt" | "calendar">("gantt");
  const days = Array.from({ length: 14 }, (_, i) => addDays(new Date("2026-07-27T12:00:00"), i));
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">VISIT PLANNER</p><h1>Schedule</h1><p>Plan upcoming visits and spot open service windows.</p></div><div className="heading-actions"><div className="view-toggle"><button className={mode === "gantt" ? "active" : ""} onClick={() => setMode("gantt")}>▤ Gantt</button><button className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>▦ Calendar</button></div><button className="primary" onClick={onSchedule}>＋ Schedule Visit</button></div></div>{mode === "gantt" ? <GanttSchedule data={data} days={days} onSelect={onSelect} /> : <div className="calendar-grid">{days.map((date) => { const visits = data.visits.filter((v) => v.visitDate === dateKey(date)); return <button key={dateKey(date)} className={`day-card ${dateKey(date) === dateKey(selectedDate) ? "selected" : ""}`} onClick={() => setSelectedDate(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.getDate()}</strong><div>{visits.map((visit) => { const truck = data.trucks.find((t) => t.id === visit.truckId)!; return <i key={visit.id} style={{ borderColor: truck.color }} onClick={() => onSelect(truck.id)}>{truck.name}<small>{formatTime(visit.startTime)}</small></i>; })}{!visits.length && <em>Open day</em>}</div></button>; })}</div>}</section>;
}

function GanttSchedule({ data, days, onSelect }: { data: AppData; days: Date[]; onSelect: (id: number) => void }) {
  return <div className="gantt-wrap"><div className="gantt-grid" style={{ gridTemplateColumns: `210px repeat(${days.length}, minmax(88px, 1fr))` }}><div className="gantt-corner"><strong>TRUCK / VENDOR</strong><small>Two-week outlook</small></div>{days.map((date) => <div className="gantt-day" key={dateKey(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></div>)}{data.trucks.map((truck) => <div className="gantt-row" key={truck.id} style={{ gridColumn: `1 / span ${days.length + 1}`, gridTemplateColumns: `210px repeat(${days.length}, minmax(88px, 1fr))` }}><button className="gantt-truck" onClick={() => onSelect(truck.id)}><span className="avatar" style={{ background: truck.color }}>{initials(truck.name)}</span><span><strong>{truck.name}</strong><small>{truck.cuisine}</small></span></button>{days.map((date) => { const visit = data.visits.find((v) => v.truckId === truck.id && v.visitDate === dateKey(date)); const slot = withAvailability(truck).availability.find((item) => item.day === date.getDay()); return <div className={`gantt-cell ${!slot?.enabled ? "unavailable-cell" : ""}`} key={dateKey(date)}>{visit ? <button className={`gantt-bar ${visit.status.toLowerCase()}`} style={{ borderColor: truck.color, background: `${truck.color}35` }} onClick={() => onSelect(truck.id)}><strong>{formatTime(visit.startTime)}</strong><small>{formatTime(visit.endTime)}</small><i>{visit.status}</i></button> : slot?.enabled ? <span className="availability-window"><strong>{formatTime(slot.start).replace(":00", "")}</strong><small>to {formatTime(slot.end).replace(":00", "")}</small></span> : <span className="unavailable-label">—</span>}</div>; })}</div>)}</div><div className="gantt-foot"><span><i className="blue-swatch" /> Confirmed visit</span><span><i className="amber-swatch" /> Tentative visit</span><span>Time = available window</span><span>— Unavailable</span></div></div>;
}

function TrucksView({ trucks, selectedId, setSelectedId, onAdd, onDelete }: { trucks: Truck[]; selectedId: number; setSelectedId: (id: number) => void; onAdd: () => void; onDelete: (id: number) => void }) {
  const selected = trucks.find((t) => t.id === selectedId) ?? trucks[0];
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">VENDOR DIRECTORY</p><h1>Food Trucks</h1><p>Profiles, contact details, documents, and weekly availability.</p></div><button className="primary" onClick={onAdd}>＋ Add Truck</button></div>{trucks.length ? <div className="truck-layout"><div className="truck-grid">{trucks.map((truck) => <button className={`truck-card ${truck.id === selectedId ? "selected" : ""}`} key={truck.id} onClick={() => setSelectedId(truck.id)}><span className="avatar large" style={{ background: truck.color }}>{initials(truck.name)}</span><div><h3>{truck.name}</h3><p>{truck.cuisine}</p><span className={expiryState(truck.insuranceExpiry).toLowerCase()}>{expiryState(truck.insuranceExpiry)}</span></div><strong>{truck.reliability}%</strong></button>)}</div>{selected && <article className="detail-card"><div className="profile-head"><span className="avatar large" style={{ background: selected.color }}>{initials(selected.name)}</span><div><h2>{selected.name}</h2><p>{selected.cuisine}</p></div></div><dl><div><dt>Primary contact</dt><dd>{selected.contact}</dd></div><div><dt>Phone</dt><dd>{selected.phone}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Insurance expiration</dt><dd>{selected.insuranceExpiry}</dd></div><div><dt>Food license expiration</dt><dd>{selected.licenseExpiry}</dd></div></dl><h4>Weekly availability</h4><div className="availability-summary">{withAvailability(selected).availability.map((slot) => <div className={slot.enabled ? "available-day" : "closed-day"} key={slot.day}><strong>{weekDays.find((item) => item.day === slot.day)?.short}</strong><span>{slot.enabled ? `${formatTime(slot.start)} – ${formatTime(slot.end)}` : "Unavailable"}</span></div>)}</div><h4>Operations notes</h4><p>{selected.notes || "No notes yet."}</p><button className="danger-button" onClick={() => onDelete(selected.id)}>Delete Truck</button></article>}</div> : <div className="empty-state"><h2>No truck profiles yet</h2><p>Add your first vendor to begin scheduling visits.</p><button className="primary" onClick={onAdd}>＋ Add Truck</button></div>}</section>;
}

function Insights({ data }: { data: AppData }) {
  const cuisineCounts = Object.entries(data.trucks.reduce<Record<string, number>>((acc, truck) => { acc[truck.cuisine] = (acc[truck.cuisine] ?? 0) + 1; return acc; }, {}));
  const max = Math.max(...cuisineCounts.map(([, count]) => count), 1);
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">PERFORMANCE SIGNALS</p><h1>Insights</h1><p>Use the lineup you already have to identify gaps and scheduling risk.</p></div></div><div className="insight-grid"><article><span>ACTIVE ROSTER</span><strong>{data.trucks.length}</strong><p>food-truck partners</p></article><article><span>UPCOMING VISITS</span><strong>{data.visits.length}</strong><p>currently planned</p></article><article><span>COMPLIANCE RISK</span><strong>{data.trucks.filter((t) => expiryState(t.insuranceExpiry) !== "Valid").length}</strong><p>documents need attention</p></article></div><div className="analysis-card"><h2>Cuisine mix</h2><p>A varied lineup reduces repeat fatigue and gives associates more choice.</p>{cuisineCounts.map(([name, count]) => <div className="bar-row" key={name}><span>{name}</span><i><b style={{ width: `${(count / max) * 100}%` }} /></i><strong>{count}</strong></div>)}</div></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">TRUCKSTOP</p><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>;
}

function DeleteTruckModal({ truck, visitCount, onCancel, onConfirm }: { truck?: Truck; visitCount: number; onCancel: () => void; onConfirm: () => void }) {
  if (!truck) return null;
  return <div className="modal-backdrop"><section className="modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-truck-title"><p className="eyebrow">PERMANENT ACTION</p><h2 id="delete-truck-title">Delete {truck.name}?</h2><p>This will also remove {visitCount} scheduled {visitCount === 1 ? "visit" : "visits"} connected to this truck. This cannot be undone.</p><div className="modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="danger-button solid" onClick={onConfirm}>Delete Truck</button></div></section></div>;
}

function VisitForm({ trucks, selectedTruckId, selectedDate, onSubmit }: { trucks: Truck[]; selectedTruckId: number; selectedDate: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="form-grid"><label className="full">Food truck<select name="truckId" defaultValue={selectedTruckId}>{trucks.map((truck) => <option value={truck.id} key={truck.id}>{truck.name} — {truck.cuisine}</option>)}</select></label><label>Date<input name="visitDate" type="date" defaultValue={selectedDate} required /></label><label>Expected demand<select name="expectedDemand" defaultValue="High"><option>High</option><option>Medium</option><option>Low</option></select></label><label>Start time<input name="startTime" type="time" defaultValue="11:00" required /></label><label>End time<input name="endTime" type="time" defaultValue="14:00" required /></label><label>Status<select name="status" defaultValue="Tentative"><option>Tentative</option><option>Confirmed</option><option>Cancelled</option></select></label><label>Notes<input name="notes" placeholder="Setup needs, event details…" /></label><button className="primary full" type="submit">Add to schedule</button></form>;
}

function TruckForm({ onSubmit }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  const [cuisineChoice, setCuisineChoice] = useState("");
  const [customCuisine, setCustomCuisine] = useState("");
  const cuisine = cuisineChoice === "custom" ? customCuisine.trim() : cuisineChoice;

  return <form onSubmit={onSubmit} className="form-grid">
    <label>Name<input name="name" placeholder="Truck name" required /></label>
    <label>Cuisine
      <select value={cuisineChoice} onChange={(event) => setCuisineChoice(event.target.value)} required>
        <option value="" disabled>Select a cuisine…</option>
        {commonCuisines.map((option) => <option value={option} key={option}>{option}</option>)}
        <option value="custom">Other / Custom</option>
      </select>
      <input type="hidden" name="cuisine" value={cuisine} />
      {cuisineChoice === "custom" && <input aria-label="Custom cuisine" value={customCuisine} onChange={(event) => setCustomCuisine(event.target.value)} placeholder="Enter cuisine or menu type" required />}
    </label>
    <label>Contact<input name="contact" placeholder="Owner or coordinator" required /></label>
    <label>Phone<input name="phone" type="tel" required /></label>
    <label className="full">Email<input name="email" type="email" required /></label>
    <label>Insurance expires<input name="insuranceExpiry" type="date" required /></label>
    <label>Food license expires<input name="licenseExpiry" type="date" required /></label>
    <label>Default start<input name="preferredStart" type="time" defaultValue="11:00" /></label>
    <label>Default end<input name="preferredEnd" type="time" defaultValue="15:00" /></label>
    <fieldset className="full availability-editor"><legend>Weekly availability</legend><p>Check every day this truck can come, then set that day&apos;s available window.</p>{weekDays.map(({ day, short, label }) => <div className="availability-row" key={day}><label className="day-check"><input type="checkbox" name="availabilityDays" value={day} defaultChecked={day >= 1 && day <= 5} /><span>{short}</span><small>{label}</small></label><label><span>From</span><input type="time" name={`start_${day}`} defaultValue="11:00" /></label><label><span>To</span><input type="time" name={`end_${day}`} defaultValue="15:00" /></label></div>)}</fieldset>
    <label className="full">Notes<textarea name="notes" placeholder="Electrical needs, setup notes, strongest dayparts…" /></label>
    <button className="primary full" type="submit">Create truck profile</button>
  </form>;
}
