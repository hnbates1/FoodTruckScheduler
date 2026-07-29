"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DayAvailability = {
  day: number;
  enabled: boolean;
  start: string;
  end: string;
};

type Truck = {
  id: number;
  name: string;
  preferredStart: string;
  preferredEnd: string;
  availability: DayAvailability[];
};

const DAYS = [
  { day: 0, short: "Sun", label: "Sunday" },
  { day: 1, short: "Mon", label: "Monday" },
  { day: 2, short: "Tue", label: "Tuesday" },
  { day: 3, short: "Wed", label: "Wednesday" },
  { day: 4, short: "Thu", label: "Thursday" },
  { day: 5, short: "Fri", label: "Friday" },
  { day: 6, short: "Sat", label: "Saturday" },
];

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeTruck(value: unknown): Truck | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = Number(record.id);
  const name = text(record.name).trim();
  if (!Number.isInteger(id) || id <= 0 || !name) return null;

  const preferredStart = text(record.preferredStart) || "11:00";
  const preferredEnd = text(record.preferredEnd) || "15:00";
  const supplied = Array.isArray(record.availability) ? record.availability : [];
  const availability = DAYS.map(({ day }) => {
    const slot = supplied.find((item) => item && typeof item === "object" && Number((item as Record<string, unknown>).day) === day) as Record<string, unknown> | undefined;
    return {
      day,
      enabled: slot ? Boolean(slot.enabled) : day >= 1 && day <= 5,
      start: slot ? text(slot.start) || preferredStart : preferredStart,
      end: slot ? text(slot.end) || preferredEnd : preferredEnd,
    };
  });

  return { id, name, preferredStart, preferredEnd, availability };
}

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(":").map(Number);
  if (!Number.isFinite(hourValue) || !Number.isFinite(minuteValue)) return value;
  const period = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minuteValue).padStart(2, "0")} ${period}`;
}

function selectedDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

function locateVisitForm() {
  return Array.from(document.querySelectorAll<HTMLFormElement>("form.form-grid")).find((form) => (
    Boolean(form.querySelector('select[name="truckId"]'))
      && Boolean(form.querySelector('input[name="visitDate"]'))
  )) || null;
}

export default function VisitAvailabilityRuntime() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [truckId, setTruckId] = useState(0);
  const [visitDate, setVisitDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loaded = useRef(false);

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();

    async function loadTrucks() {
      if (loaded.current) return;
      loaded.current = true;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        if (!response.ok) throw new Error("Availability could not be loaded.");
        const result = await response.json() as { trucks?: unknown[] };
        if (!active) return;
        setTrucks((result.trucks || []).map(normalizeTruck).filter((truck): truck is Truck => Boolean(truck)));
      } catch (caught) {
        if (active) {
          loaded.current = false;
          setError(caught instanceof Error ? caught.message : "Availability could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    function sync() {
      if (!active) return;
      const form = locateVisitForm();
      if (!form) {
        setPortalTarget(null);
        return;
      }

      const select = form.querySelector<HTMLSelectElement>('select[name="truckId"]');
      const date = form.querySelector<HTMLInputElement>('input[name="visitDate"]');
      if (!select || !date) return;

      let host = form.querySelector<HTMLElement>("[data-visit-availability-root]");
      if (!host) {
        host = document.createElement("div");
        host.dataset.visitAvailabilityRoot = "true";
        host.className = "full";
        const selectLabel = select.closest("label");
        if (selectLabel) selectLabel.insertAdjacentElement("afterend", host);
        else form.prepend(host);
      }

      setPortalTarget(host);
      setTruckId(Number(select.value));
      setVisitDate(date.value);
      void loadTrucks();
    }

    function schedule(delay: number) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        sync();
      }, delay);
      timers.add(timer);
    }

    function handleInteraction(event: Event) {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.name === "truckId") {
        setTruckId(Number(target.value));
      } else if (target instanceof HTMLInputElement && target.name === "visitDate") {
        setVisitDate(target.value);
      }
      schedule(30);
      schedule(250);
    }

    document.addEventListener("click", handleInteraction, { passive: true });
    document.addEventListener("change", handleInteraction, { passive: true });
    [50, 300, 900, 1800].forEach(schedule);

    return () => {
      active = false;
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("change", handleInteraction);
    };
  }, []);

  const truck = useMemo(() => trucks.find((item) => item.id === truckId) || null, [trucks, truckId]);
  const dayNumber = selectedDay(visitDate);
  const selectedSlot = truck && dayNumber !== null ? truck.availability.find((slot) => slot.day === dayNumber) : null;
  const dayLabel = dayNumber === null ? "Selected Day" : DAYS.find((day) => day.day === dayNumber)?.label || "Selected Day";

  if (!portalTarget) return null;

  return createPortal(<>
    <style>{`
      .visit-availability{padding:11px 12px;border:1px solid #365b78;border-radius:8px;background:linear-gradient(135deg,#091d32,#0b2842);color:#d9eaff}
      .visit-availability-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}.visit-availability-head h3{margin:0;font-size:11px}.visit-availability-head small{display:block;margin-top:2px;color:#809bb1;font-size:8px}.visit-availability-status{padding:4px 7px;border-radius:10px;font-size:8px;font-weight:900;white-space:nowrap}.visit-availability-status.available{border:1px solid #5f8d3c;background:#16321b;color:#cfff9e}.visit-availability-status.unavailable{border:1px solid #9b6542;background:#382316;color:#ffc28f}.visit-availability-status.loading{border:1px solid #46657e;background:#10283b;color:#9fb8ca}
      .visit-selected-day{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 9px;border-radius:7px;background:#07182a}.visit-selected-day strong{font-size:10px}.visit-selected-day span{color:#bdd2e3;font-size:9px;text-align:right}.visit-selected-day.unavailable span{color:#ffb27b}
      .visit-availability-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;margin-top:8px}.visit-availability-day{min-width:0;padding:6px 3px;border:1px solid #294a65;border-radius:6px;background:#081a2d;text-align:center}.visit-availability-day.current{border-color:#75ad3c;box-shadow:0 0 0 1px #75ad3c55}.visit-availability-day.disabled{opacity:.48}.visit-availability-day strong{display:block;font-size:8px}.visit-availability-day span{display:block;margin-top:3px;color:#91aabd;font-size:7px;line-height:1.25;overflow-wrap:anywhere}.visit-availability-note{display:block;margin-top:7px;color:#728da4;font-size:7px;line-height:1.35}
      @media(max-width:620px){.visit-availability-week{grid-template-columns:repeat(4,minmax(0,1fr))}.visit-availability-head{align-items:center}}
    `}</style>
    <section className="visit-availability" aria-live="polite" aria-label="Programmed truck availability">
      <div className="visit-availability-head">
        <div><h3>Programmed Availability</h3><small>{truck?.name || "Select a truck to view its schedule"}</small></div>
        {loading
          ? <span className="visit-availability-status loading">LOADING</span>
          : selectedSlot?.enabled
            ? <span className="visit-availability-status available">AVAILABLE</span>
            : <span className="visit-availability-status unavailable">NOT AVAILABLE</span>}
      </div>

      {error ? <div className="visit-selected-day unavailable"><strong>Availability Unavailable</strong><span>{error}</span></div> : truck ? <>
        <div className={`visit-selected-day ${selectedSlot?.enabled ? "" : "unavailable"}`}>
          <strong>{dayLabel}</strong>
          <span>{selectedSlot?.enabled ? `${formatTime(selectedSlot.start)} – ${formatTime(selectedSlot.end)}` : "Not programmed as available"}</span>
        </div>
        <div className="visit-availability-week">
          {DAYS.map((day) => {
            const slot = truck.availability.find((item) => item.day === day.day);
            return <div className={`visit-availability-day ${day.day === dayNumber ? "current" : ""} ${slot?.enabled ? "" : "disabled"}`} key={day.day}>
              <strong>{day.short}</strong>
              <span>{slot?.enabled ? `${formatTime(slot.start)}–${formatTime(slot.end)}` : "Unavailable"}</span>
            </div>;
          })}
        </div>
        <small className="visit-availability-note">For reference only. You may still schedule outside this window when the truck confirms an exception.</small>
      </> : <div className="visit-selected-day"><strong>Select a Truck</strong><span>Its programmed weekly availability will appear here.</span></div>}
    </section>
  </>, portalTarget);
}
