"use client";

import { useEffect, useMemo, useState } from "react";

type Truck = { id: number; name: string; cuisine: string; color: string; paymentTypes: string };
type Visit = { id: number; truckId: number; visitDate: string; startTime: string; endTime: string; status: string };

function time(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function PublicSchedule() {
  const [data, setData] = useState<{ trucks: Truck[]; visits: Visit[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    fetch(`/api/public-schedule?token=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error); setData(result); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "The schedule is unavailable."));
  }, []);
  const groups = useMemo(() => {
    if (!data) return [];
    const trucks = new Map(data.trucks.map((truck) => [truck.id, truck]));
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = data.visits.filter((visit) => visit.visitDate >= today);
    return Array.from(new Set(upcoming.map((visit) => visit.visitDate))).map((date) => ({
      date, visits: upcoming.filter((visit) => visit.visitDate === date).map((visit) => ({ ...visit, truck: trucks.get(visit.truckId) })),
    }));
  }, [data]);

  return <main className="public-schedule">
    <header><p className="eyebrow">FOOD TRUCK ADMIN</p><h1>Upcoming Food Trucks</h1><p>Current scheduled visits. Check back here for the latest lineup.</p></header>
    {error && <section className="public-error"><h2>Schedule Unavailable</h2><p>{error}</p></section>}
    {!data && !error && <p>Loading schedule…</p>}
    {data && !groups.length && <section className="public-error"><h2>No Upcoming Visits</h2><p>The next lineup has not been posted yet.</p></section>}
    <div className="public-days">{groups.map((group) => <section className="public-day" key={group.date}><h2>{new Date(group.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h2>{group.visits.map((visit) => <article key={visit.id} style={{ borderLeftColor: visit.truck?.color || "#1687ff" }}><div><h3>{visit.truck?.name || "Food Truck"}</h3><p>{visit.truck?.cuisine || "Menu details coming soon"}</p>{visit.truck?.paymentTypes && <small>Accepts: {visit.truck.paymentTypes}</small>}</div><strong>{time(visit.startTime)} – {time(visit.endTime)}</strong></article>)}</section>)}</div>
    <footer>Schedule subject to change.</footer>
  </main>;
}
