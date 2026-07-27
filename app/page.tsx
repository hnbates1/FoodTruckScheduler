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

type AppData = { trucks: Truck[]; visits: Visit[] };
type View = "dashboard" | "schedule" | "trucks" | "insights";

const nav: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "schedule", label: "Schedule", icon: "▣" },
  { id: "trucks", label: "Trucks", icon: "▤" },
  { id: "insights", label: "Insights", icon: "◫" },
];

const localSeed: AppData = {
  trucks: [
    { id: 1, name: "Steel City Smash", cuisine: "Smashburgers & Fries", contact: "Maya Chen", phone: "(412) 555-0188", email: "maya@steelcitysmash.com", insuranceExpiry: "2026-10-14", licenseExpiry: "2027-02-28", preferredStart: "11:00", preferredEnd: "15:00", reliability: 96, notes: "Strong lunch performer. Needs 20A electrical hookup.", color: "#1687ff" },
    { id: 2, name: "Taco Loco", cuisine: "Mexican", contact: "Luis Ramirez", phone: "(330) 555-0142", email: "hello@tacoloco.com", insuranceExpiry: "2027-01-09", licenseExpiry: "2026-11-22", preferredStart: "12:00", preferredEnd: "16:00", reliability: 92, notes: "Fast service and broad menu.", color: "#7ac943" },
    { id: 3, name: "Sweet Wheels", cuisine: "Desserts & Coffee", contact: "Nina Patel", phone: "(234) 555-0171", email: "nina@sweetwheels.com", insuranceExpiry: "2026-09-18", licenseExpiry: "2027-03-10", preferredStart: "15:00", preferredEnd: "19:00", reliability: 88, notes: "Best after 2 PM and during associate events.", color: "#9b6cff" },
    { id: 4, name: "Smoke & Oak BBQ", cuisine: "Barbecue", contact: "Marcus Reed", phone: "(330) 555-0126", email: "marcus@smokeandoak.com", insuranceExpiry: "2026-08-21", licenseExpiry: "2026-12-12", preferredStart: "11:00", preferredEnd: "15:00", reliability: 94, notes: "High draw; allow 30 minutes for setup.", color: "#ff9c42" },
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

export default function Home() {
  const [data, setData] = useState<AppData>(localSeed);
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(new Date("2026-07-27T12:00:00"));
  const [selectedTruckId, setSelectedTruckId] = useState(1);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"visit" | "truck" | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((remote: AppData) => {
        if (remote.trucks?.length) {
          setData(remote);
          setSelectedTruckId(remote.trucks[0].id);
        }
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

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
      .filter((truck) => !scheduledIds.has(truck.id))
      .map((truck) => {
        const compliant = expiryState(truck.insuranceExpiry) !== "Expired" && expiryState(truck.licenseExpiry) !== "Expired";
        const distinct = !scheduledCuisines.has(truck.cuisine);
        const score = truck.reliability + (compliant ? 8 : -40) + (distinct ? 5 : 0);
        return { truck, score, compliant, distinct };
      })
      .sort((a, b) => b.score - a.score);
  }, [data, dayVisits]);

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
    const payload = Object.fromEntries(form.entries());
    try {
      await save("truck", payload);
      setModal(null);
      notify("Truck profile created");
    } catch {
      const optimistic: Truck = { id: Date.now(), name: String(payload.name), cuisine: String(payload.cuisine), contact: String(payload.contact), phone: String(payload.phone), email: String(payload.email), insuranceExpiry: String(payload.insuranceExpiry), licenseExpiry: String(payload.licenseExpiry), preferredStart: String(payload.preferredStart), preferredEnd: String(payload.preferredEnd), reliability: 85, notes: String(payload.notes ?? ""), color: "#1687ff" };
      setData((current) => ({ ...current, trucks: [...current.trucks, optimistic] }));
      setModal(null);
      notify("Truck profile saved for this session");
    }
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
      {view === "trucks" && <TrucksView trucks={filteredTrucks} selectedId={selectedTruckId} setSelectedId={setSelectedTruckId} onAdd={() => setModal("truck")} />}
      {view === "insights" && <Insights data={data} />}

      {modal === "visit" && <Modal title="Schedule a food truck" subtitle="Add a visit and check the calendar before confirming." onClose={() => setModal(null)}><VisitForm trucks={data.trucks} selectedTruckId={selectedTruckId} selectedDate={dateKey(selectedDate)} onSubmit={submitVisit} /></Modal>}
      {modal === "truck" && <Modal title="Create truck profile" subtitle="Keep contact, compliance, and scheduling preferences together." onClose={() => setModal(null)}><TruckForm onSubmit={submitTruck} /></Modal>}
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
    <div className="ai-box">{recommendation ? <><p>✦ Best fit for {selectedDate.toLocaleDateString("en-US", { weekday: "long" })}:</p><h3>{recommendation.truck.name}</h3><small>Based on schedule fit, compliance, cuisine variety, and reliability.</small><ul><li>✓ {recommendation.distinct ? "No cuisine overlap" : "Complements existing lineup"}</li><li>✓ {recommendation.truck.reliability}% reliability</li><li>✓ {recommendation.compliant ? "Documents current" : "Review documents first"}</li></ul><button className="primary wide" onClick={() => onSchedule(recommendation.truck.id)}>Schedule this truck →</button></> : <><h3>Day is fully staffed</h3><p>Every active truck already appears on this date.</p></>}</div>
  </article>;
}

function ScheduleView({ data, selectedDate, setSelectedDate, onSchedule, onSelect }: { data: AppData; selectedDate: Date; setSelectedDate: (d: Date) => void; onSchedule: () => void; onSelect: (id: number) => void }) {
  const [mode, setMode] = useState<"gantt" | "calendar">("gantt");
  const days = Array.from({ length: 14 }, (_, i) => addDays(new Date("2026-07-27T12:00:00"), i));
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">VISIT PLANNER</p><h1>Schedule</h1><p>Plan upcoming visits and spot open service windows.</p></div><div className="heading-actions"><div className="view-toggle"><button className={mode === "gantt" ? "active" : ""} onClick={() => setMode("gantt")}>▤ Gantt</button><button className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>▦ Calendar</button></div><button className="primary" onClick={onSchedule}>＋ Schedule Visit</button></div></div>{mode === "gantt" ? <GanttSchedule data={data} days={days} onSelect={onSelect} /> : <div className="calendar-grid">{days.map((date) => { const visits = data.visits.filter((v) => v.visitDate === dateKey(date)); return <button key={dateKey(date)} className={`day-card ${dateKey(date) === dateKey(selectedDate) ? "selected" : ""}`} onClick={() => setSelectedDate(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.getDate()}</strong><div>{visits.map((visit) => { const truck = data.trucks.find((t) => t.id === visit.truckId)!; return <i key={visit.id} style={{ borderColor: truck.color }} onClick={() => onSelect(truck.id)}>{truck.name}<small>{formatTime(visit.startTime)}</small></i>; })}{!visits.length && <em>Open day</em>}</div></button>; })}</div>}</section>;
}

function GanttSchedule({ data, days, onSelect }: { data: AppData; days: Date[]; onSelect: (id: number) => void }) {
  return <div className="gantt-wrap"><div className="gantt-grid" style={{ gridTemplateColumns: `210px repeat(${days.length}, minmax(88px, 1fr))` }}><div className="gantt-corner"><strong>TRUCK / VENDOR</strong><small>Two-week outlook</small></div>{days.map((date) => <div className="gantt-day" key={dateKey(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></div>)}{data.trucks.map((truck) => <div className="gantt-row" key={truck.id} style={{ gridColumn: `1 / span ${days.length + 1}`, gridTemplateColumns: `210px repeat(${days.length}, minmax(88px, 1fr))` }}><button className="gantt-truck" onClick={() => onSelect(truck.id)}><span className="avatar" style={{ background: truck.color }}>{initials(truck.name)}</span><span><strong>{truck.name}</strong><small>{truck.cuisine}</small></span></button>{days.map((date) => { const visit = data.visits.find((v) => v.truckId === truck.id && v.visitDate === dateKey(date)); return <div className="gantt-cell" key={dateKey(date)}>{visit ? <button className={`gantt-bar ${visit.status.toLowerCase()}`} style={{ borderColor: truck.color, background: `${truck.color}35` }} onClick={() => onSelect(truck.id)}><strong>{formatTime(visit.startTime)}</strong><small>{formatTime(visit.endTime)}</small><i>{visit.status}</i></button> : <span className="open-slot">＋</span>}</div>; })}</div>)}</div><div className="gantt-foot"><span><i className="blue-swatch" /> Confirmed visit</span><span><i className="amber-swatch" /> Tentative visit</span><span>＋ Open scheduling slot</span></div></div>;
}

function TrucksView({ trucks, selectedId, setSelectedId, onAdd }: { trucks: Truck[]; selectedId: number; setSelectedId: (id: number) => void; onAdd: () => void }) {
  const selected = trucks.find((t) => t.id === selectedId) ?? trucks[0];
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">VENDOR DIRECTORY</p><h1>Food Trucks</h1><p>Profiles, contact details, documents, and scheduling preferences.</p></div><button className="primary" onClick={onAdd}>＋ Add Truck</button></div><div className="truck-layout"><div className="truck-grid">{trucks.map((truck) => <button className={`truck-card ${truck.id === selectedId ? "selected" : ""}`} key={truck.id} onClick={() => setSelectedId(truck.id)}><span className="avatar large" style={{ background: truck.color }}>{initials(truck.name)}</span><div><h3>{truck.name}</h3><p>{truck.cuisine}</p><span className={expiryState(truck.insuranceExpiry).toLowerCase()}>{expiryState(truck.insuranceExpiry)}</span></div><strong>{truck.reliability}%</strong></button>)}</div>{selected && <article className="detail-card"><div className="profile-head"><span className="avatar large" style={{ background: selected.color }}>{initials(selected.name)}</span><div><h2>{selected.name}</h2><p>{selected.cuisine}</p></div></div><dl><div><dt>Primary contact</dt><dd>{selected.contact}</dd></div><div><dt>Phone</dt><dd>{selected.phone}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Insurance expiration</dt><dd>{selected.insuranceExpiry}</dd></div><div><dt>Food license expiration</dt><dd>{selected.licenseExpiry}</dd></div><div><dt>Preferred window</dt><dd>{formatTime(selected.preferredStart)} – {formatTime(selected.preferredEnd)}</dd></div></dl><h4>Operations notes</h4><p>{selected.notes || "No notes yet."}</p></article>}</div></section>;
}

function Insights({ data }: { data: AppData }) {
  const cuisineCounts = Object.entries(data.trucks.reduce<Record<string, number>>((acc, truck) => { acc[truck.cuisine] = (acc[truck.cuisine] ?? 0) + 1; return acc; }, {}));
  const max = Math.max(...cuisineCounts.map(([, count]) => count), 1);
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">PERFORMANCE SIGNALS</p><h1>Insights</h1><p>Use the lineup you already have to identify gaps and scheduling risk.</p></div></div><div className="insight-grid"><article><span>ACTIVE ROSTER</span><strong>{data.trucks.length}</strong><p>food-truck partners</p></article><article><span>UPCOMING VISITS</span><strong>{data.visits.length}</strong><p>currently planned</p></article><article><span>COMPLIANCE RISK</span><strong>{data.trucks.filter((t) => expiryState(t.insuranceExpiry) !== "Valid").length}</strong><p>documents need attention</p></article></div><div className="analysis-card"><h2>Cuisine mix</h2><p>A varied lineup reduces repeat fatigue and gives associates more choice.</p>{cuisineCounts.map(([name, count]) => <div className="bar-row" key={name}><span>{name}</span><i><b style={{ width: `${(count / max) * 100}%` }} /></i><strong>{count}</strong></div>)}</div></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">TRUCKSTOP</p><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>;
}

function VisitForm({ trucks, selectedTruckId, selectedDate, onSubmit }: { trucks: Truck[]; selectedTruckId: number; selectedDate: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="form-grid"><label className="full">Food truck<select name="truckId" defaultValue={selectedTruckId}>{trucks.map((truck) => <option value={truck.id} key={truck.id}>{truck.name} — {truck.cuisine}</option>)}</select></label><label>Date<input name="visitDate" type="date" defaultValue={selectedDate} required /></label><label>Expected demand<select name="expectedDemand" defaultValue="High"><option>High</option><option>Medium</option><option>Low</option></select></label><label>Start time<input name="startTime" type="time" defaultValue="11:00" required /></label><label>End time<input name="endTime" type="time" defaultValue="14:00" required /></label><label>Status<select name="status" defaultValue="Tentative"><option>Tentative</option><option>Confirmed</option><option>Cancelled</option></select></label><label>Notes<input name="notes" placeholder="Setup needs, event details…" /></label><button className="primary full" type="submit">Add to schedule</button></form>;
}

function TruckForm({ onSubmit }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="form-grid"><label>Name<input name="name" placeholder="Truck name" required /></label><label>Cuisine<input name="cuisine" placeholder="e.g. Barbecue" required /></label><label>Contact<input name="contact" placeholder="Owner or coordinator" required /></label><label>Phone<input name="phone" type="tel" required /></label><label className="full">Email<input name="email" type="email" required /></label><label>Insurance expires<input name="insuranceExpiry" type="date" required /></label><label>Food license expires<input name="licenseExpiry" type="date" required /></label><label>Preferred start<input name="preferredStart" type="time" defaultValue="11:00" /></label><label>Preferred end<input name="preferredEnd" type="time" defaultValue="15:00" /></label><label className="full">Notes<textarea name="notes" placeholder="Electrical needs, setup notes, strongest dayparts…" /></label><button className="primary full" type="submit">Create truck profile</button></form>;
}
