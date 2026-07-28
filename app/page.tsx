"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from "react";

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
  hasLogo?: boolean;
  logoVersion?: string;
  logoData?: string;
  paymentTypes: string;
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
type View = "dashboard" | "schedule" | "trucks" | "insights" | "location";
type SessionUser = { id: number; email: string; name: string; storeNumber: string; role: string };
type LocationProfile = { storeName: string; storeNumber: string; street: string; city: string; state: string; zip: string; phone: string; timezone: string; notes: string; operatingHours: DayAvailability[]; closedDates: string[] };

const nav: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "▦" },
  { id: "schedule", label: "Schedule", icon: "▣" },
  { id: "trucks", label: "Trucks", icon: "▤" },
  { id: "insights", label: "Insights", icon: "◫" },
  { id: "location", label: "Location", icon: "◧" },
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
    { id: 1, name: "Sample Burger Truck", cuisine: "Smashburgers & Fries", contact: "Sample Contact", phone: "(202) 555-0101", email: "burgers@example.com", insuranceExpiry: "2026-10-14", licenseExpiry: "2027-02-28", preferredStart: "11:00", preferredEnd: "15:00", reliability: 96, notes: "Demo record. Needs 20A electrical hookup.", color: "#1687ff", availability: standardAvailability(), paymentTypes: "Cash, Credit/Debit Cards" },
    { id: 2, name: "Sample Taco Truck", cuisine: "Mexican", contact: "Sample Contact", phone: "(202) 555-0102", email: "tacos@example.com", insuranceExpiry: "2027-01-09", licenseExpiry: "2026-11-22", preferredStart: "12:00", preferredEnd: "16:00", reliability: 92, notes: "Demo record for scheduling.", color: "#7ac943", availability: standardAvailability("12:00", "16:00"), paymentTypes: "Cash, Credit/Debit Cards, Apple Pay" },
    { id: 3, name: "Sample Dessert Truck", cuisine: "Desserts & Coffee", contact: "Sample Contact", phone: "(202) 555-0103", email: "desserts@example.com", insuranceExpiry: "2026-09-18", licenseExpiry: "2027-03-10", preferredStart: "15:00", preferredEnd: "19:00", reliability: 88, notes: "Demo record for scheduling.", color: "#9b6cff", availability: standardAvailability("15:00", "19:00").map((slot) => ({ ...slot, enabled: slot.day >= 3 && slot.day <= 6 })), paymentTypes: "Credit/Debit Cards, Apple Pay, Google Pay" },
    { id: 4, name: "Sample Barbecue Truck", cuisine: "Barbecue", contact: "Sample Contact", phone: "(202) 555-0104", email: "barbecue@example.com", insuranceExpiry: "2026-08-21", licenseExpiry: "2026-12-12", preferredStart: "11:00", preferredEnd: "15:00", reliability: 94, notes: "Demo record; allow 30 minutes for setup.", color: "#ff9c42", availability: standardAvailability().map((slot) => ({ ...slot, enabled: [1, 4, 5, 6].includes(slot.day) })), paymentTypes: "Cash, Credit/Debit Cards" },
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

function timeFromMinutes(value: number) {
  const bounded = Math.max(0, Math.min(1439, value));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}

const menuStopwords = new Set(["and", "with", "food", "truck", "trucks", "fusion", "style", "fresh", "house", "grill", "kitchen", "more", "other", "custom"]);

function menuWords(cuisine: string) {
  return cuisine.toLowerCase().split(/[^a-z]+/).filter((word) => word.length >= 4 && !menuStopwords.has(word));
}

function sharesMenu(left: string, right: string) {
  const rightWords = new Set(menuWords(right));
  return menuWords(left).some((word) => rightWords.has(word));
}

function todayAtNoon() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
}

function formatTime(time: string) {
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2);
}

function expiryState(value: string) {
  if (!value) return "Not provided";
  const days = Math.ceil((new Date(`${value}T12:00:00`).getTime() - new Date("2026-07-27T12:00:00").getTime()) / 86400000);
  return days < 0 ? "Expired" : days <= 45 ? "Expiring" : "Valid";
}

function expiryClass(value: string) {
  return expiryState(value).toLowerCase().replace(" ", "-");
}

function expiryLabel(value: string) {
  if (!value) return "Not provided";
  return `${expiryState(value)} through ${new Date(`${value}T12:00:00`).toLocaleDateString()}`;
}

function needsDocumentAttention(value: string) {
  return value ? expiryState(value) !== "Valid" : false;
}

function logoSource(truck: Truck) {
  if (truck.logoData) return truck.logoData;
  if (!truck.hasLogo) return "";
  return `/api/data?logoId=${truck.id}&v=${encodeURIComponent(truck.logoVersion || "1")}`;
}

function TruckAvatar({ truck, large = false }: { truck: Truck; large?: boolean }) {
  const source = logoSource(truck);
  return <span
    className={`avatar ${large ? "large" : ""} ${source ? "has-logo" : ""}`}
    style={{ backgroundColor: truck.color, backgroundImage: source ? `url("${source}")` : undefined }}
    role="img"
    aria-label={source ? `${truck.name} logo` : `${truck.name} initials`}
  >{source ? "" : initials(truck.name)}</span>;
}

function resizeTruckLogo(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      reject(new Error("Choose a PNG, JPEG, or WebP image."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Choose an image smaller than 5 MB."));
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const size = 360;
        const padding = 20;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser could not prepare that image.");
        const scale = Math.min((size - padding * 2) / image.naturalWidth, (size - padding * 2) / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        context.clearRect(0, 0, size, size);
        context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
        const dataUrl = canvas.toDataURL("image/webp", 0.86);
        if (!dataUrl || dataUrl.length > 500_000) throw new Error("That logo is still too large after resizing.");
        resolve(dataUrl);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be opened."));
    };
    image.src = objectUrl;
  });
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
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signInError, setSignInError] = useState("");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupToken, setSetupToken] = useState("");
  const [setupName, setSetupName] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [selectedDate, setSelectedDate] = useState(todayAtNoon);
  const [selectedTruckId, setSelectedTruckId] = useState(1);
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<"visit" | "truck" | null>(null);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [visitDraft, setVisitDraft] = useState({ visitDate: "2026-07-27", startTime: "11:00", endTime: "14:00", truckId: 1 });
  const [location, setLocation] = useState<LocationProfile>({ storeName: "Lowe's", storeNumber: "0244", street: "", city: "", state: "OH", zip: "", phone: "", timezone: "America/New_York", notes: "", operatingHours: weekDays.map(({ day }) => ({ day, enabled: day >= 1 && day <= 6, start: "06:00", end: "22:00" })), closedDates: [] });

  async function hydrate() {
    setLoading(true);
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      if (!response.ok) throw new Error("Load failed");
      const remote = await response.json() as AppData;
      if (remote.trucks?.length) {
        setData({ ...remote, trucks: remote.trucks.map(withAvailability) });
        setSelectedTruckId(remote.trucks[0].id);
      }
    } catch {
      notify("Schedule data could not be loaded");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function restoreSession() {
      try {
        const response = await fetch("/api/auth", { cache: "no-store" });
        const result = await response.json() as { user?: SessionUser | null; needsSetup?: boolean };
        setNeedsSetup(Boolean(result.needsSetup));
        if (response.ok && result.user) {
          setUser(result.user);
          await hydrate();
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      } finally {
        setAuthLoading(false);
      }
    }
    void restoreSession();
    // hydrate intentionally runs once after session restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading && user) window.localStorage.setItem("truckstop-data", JSON.stringify(data));
  }, [data, loading, user]);

  useEffect(() => {
    async function loadLocation() {
      try {
        const response = await fetch("/api/location", { cache: "no-store" });
        const result = await response.json() as { location?: LocationProfile | null };
        if (response.ok && result.location) {
          setLocation(result.location);
          return;
        }
      } catch {
        // Fall through to the last locally cached profile.
      }
      const saved = window.localStorage.getItem("food-truck-admin-location");
      if (saved) {
        try { setLocation(JSON.parse(saved) as LocationProfile); } catch { window.localStorage.removeItem("food-truck-admin-location"); }
      }
    }
    if (user) void loadLocation();
  }, [user]);

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - selectedDate.getDay() + 1)), [selectedDate]);
  const dayVisits = data.visits.filter((visit) => visit.visitDate === dateKey(selectedDate));
  const selectedTruck = data.trucks.find((truck) => truck.id === selectedTruckId) ?? data.trucks[0];

  const overlaps = useMemo(() => dayVisits.flatMap((a, index) =>
    dayVisits.slice(index + 1).filter((b) => {
      const aTruck = data.trucks.find((truck) => truck.id === a.truckId);
      const bTruck = data.trucks.find((truck) => truck.id === b.truckId);
      return minutes(a.startTime) < minutes(b.endTime)
        && minutes(b.startTime) < minutes(a.endTime)
        && sharesMenu(aTruck?.cuisine || "", bTruck?.cuisine || "");
    }).map((b) => [a, b])
  ), [data.trucks, dayVisits]);

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
    setData({ ...next, trucks: next.trucks.map(withAvailability) });
  }

  async function updateVisit(visitId: number, startTime: string, endTime: string) {
    const previous = data;
    setData((current) => ({
      ...current,
      visits: current.visits.map((visit) => visit.id === visitId ? { ...visit, startTime, endTime } : visit),
    }));
    try {
      const response = await fetch("/api/data", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: visitId, startTime, endTime }),
      });
      if (!response.ok) throw new Error("Update failed");
      const next = await response.json() as AppData;
      setData({ ...next, trucks: next.trucks.map(withAvailability) });
      notify(`Visit changed to ${formatTime(startTime)} – ${formatTime(endTime)}`);
    } catch {
      setData(previous);
      notify("That schedule change could not be saved");
    }
  }

  async function updateTruckLogo(truckId: number, file: File | null) {
    let logoData = "";
    if (file) {
      try {
        logoData = await resizeTruckLogo(file);
      } catch (error) {
        notify(error instanceof Error ? error.message : "That logo could not be prepared");
        return;
      }
    }
    const previous = data;
    const localVersion = String(Date.now());
    setData((current) => ({
      ...current,
      trucks: current.trucks.map((truck) => truck.id === truckId
        ? { ...truck, hasLogo: Boolean(logoData), logoData, logoVersion: logoData ? localVersion : "" }
        : truck),
    }));
    try {
      const response = await fetch("/api/data", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "truckLogo", id: truckId, logoData }),
      });
      if (!response.ok) throw new Error("Logo update failed");
      const next = await response.json() as AppData;
      setData({ ...next, trucks: next.trucks.map(withAvailability) });
      notify(file ? "Truck logo updated" : "Truck logo removed");
    } catch {
      setData(previous);
      notify("That logo change could not be saved");
    }
  }

  function openVisitModal(visitDate = dateKey(selectedDate), startTime = "11:00", truckId = selectedTruckId) {
    const endTime = timeFromMinutes(Math.min(1200, minutes(startTime) + 180));
    setVisitDraft({ visitDate, startTime, endTime, truckId });
    setSelectedTruckId(truckId);
    setModal("visit");
  }

  async function deleteVisit(visitId: number) {
    if (!window.confirm("Delete this scheduled visit?")) return;
    const previous = data;
    setData((current) => ({ ...current, visits: current.visits.filter((visit) => visit.id !== visitId) }));
    try {
      const response = await fetch(`/api/data?visitId=${visitId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Delete failed");
      const next = await response.json() as AppData;
      setData({ ...next, trucks: next.trucks.map(withAvailability) });
      notify("Scheduled visit deleted");
    } catch {
      setData(previous);
      notify("That visit could not be deleted");
    }
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
    payload.paymentTypes = form.getAll("paymentMethods").map(String).map((method) => method.trim()).filter(Boolean).join(", ");
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
      const optimistic: Truck = { id: Date.now(), name: String(payload.name), cuisine: String(payload.cuisine), contact: String(payload.contact), phone: String(payload.phone), email: String(payload.email), insuranceExpiry: String(payload.insuranceExpiry), licenseExpiry: String(payload.licenseExpiry), preferredStart: String(payload.preferredStart), preferredEnd: String(payload.preferredEnd), reliability: 85, notes: String(payload.notes ?? ""), color: "#1687ff", availability: payload.availability as DayAvailability[], hasLogo: Boolean(payload.logoData), logoData: String(payload.logoData || ""), logoVersion: String(Date.now()), paymentTypes: String(payload.paymentTypes || "") };
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

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signInEmail.trim() || signInPassword.length < 12) {
      setSignInError("Enter your account email and password (at least 12 characters).");
      return;
    }
    setSigningIn(true);
    setSignInError("");
    try {
      if (needsSetup) {
        const bootstrap = await fetch("/api/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "bootstrap", setupToken, email: signInEmail, password: signInPassword, name: setupName, storeNumber: "0244" }),
        });
        const bootstrapResult = await bootstrap.json() as { error?: string };
        if (!bootstrap.ok) {
          setSignInError(bootstrapResult.error || "The administrator account could not be created.");
          return;
        }
      }
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "login", email: signInEmail, password: signInPassword }),
      });
      const result = await response.json() as { user?: SessionUser; error?: string };
      if (!response.ok || !result.user) {
        setSignInError(result.error || "That email and password do not match an account.");
        return;
      }
      setUser(result.user);
      setNeedsSetup(false);
      setSignInPassword("");
      await hydrate();
    } catch {
      setSignInError("Sign-in is temporarily unavailable.");
    } finally {
      setSigningIn(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).catch(() => undefined);
    setUser(null);
    setSignInPassword("");
    setView("dashboard");
  }

  if (authLoading) {
    return <main className="auth-shell"><div className="auth-loading">Loading Food Truck Admin…</div></main>;
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand"><span className="truck-mark">▰</span><strong>Food Truck Admin</strong></div>
          <p className="auth-kicker">LOWE&apos;S • STORE 0244</p>
          <h1>{needsSetup ? "Create administrator" : "Welcome back"}</h1>
          <p>{needsSetup ? "Finish the one-time setup for Store 0244." : "Sign in to manage food trucks, visits, and schedules."}</p>
          <form onSubmit={signIn}>
            {needsSetup && <label>Your name<input autoComplete="name" value={setupName} onChange={(event) => { setSetupName(event.target.value); setSignInError(""); }} required /></label>}
            <label>Email address<input type="email" autoComplete="username" value={signInEmail} onChange={(event) => { setSignInEmail(event.target.value); setSignInError(""); }} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" autoComplete="current-password" minLength={12} value={signInPassword} onChange={(event) => { setSignInPassword(event.target.value); setSignInError(""); }} placeholder="At least 12 characters" required /></label>
            {needsSetup && <label>One-time setup token<input type="password" autoComplete="off" value={setupToken} onChange={(event) => { setSetupToken(event.target.value); setSignInError(""); }} required /></label>}
            {signInError && <div className="auth-error" role="alert">△ {signInError}</div>}
            <button className="primary auth-submit" type="submit" disabled={signingIn}>{signingIn ? "Working…" : needsSetup ? "Create administrator" : "Sign in"}</button>
          </form>
          <small>Accounts are created by the Food Truck Admin administrator.</small>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell role-${user.role}`}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("dashboard")} aria-label="Food Truck Admin dashboard">
          <span className="truck-mark">▰</span><strong>Food Truck Admin</strong>
        </button>
        <span className="store-chip">LOWE&apos;S • STORE 0244</span>
        <nav>
          {nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span>{item.icon}</span>{item.label}</button>)}
          {user.role === "admin" && <a className="admin-nav-link" href="/admin"><span>⚙</span>Admin</a>}
        </nav>
        <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search trucks, cuisine, contacts…" /></label>
        <button className="primary" onClick={() => openVisitModal()}>＋ Schedule Visit</button>
        <div className="user-menu"><strong>{user.name || user.email}</strong><button type="button" onClick={signOut}>Sign out</button></div>
      </header>

      {view === "dashboard" && (
        <div className="dashboard">
          <section className="main-panel">
            <div className="page-heading">
              <div><p className="eyebrow">OPERATIONS OVERVIEW</p><h1>{selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</h1></div>
              <div className="date-actions"><button onClick={() => setSelectedDate(todayAtNoon())}>Today</button><button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>‹</button><button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>›</button></div>
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

            <ScheduleBoard visits={dayVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} onSelect={setSelectedTruckId} onUpdateVisit={updateVisit} onAddVisit={openVisitModal} onDeleteVisit={deleteVisit} />
            <div className="legend"><span><i className="blue-swatch" />Confirmed</span><span><i className="green-swatch" />Available</span><span><i className="stripe-swatch" />Conflict</span><span><i className="amber-swatch" />Documents expiring</span></div>
          </section>
          <aside className="right-rail">
            <TruckProfile truck={selectedTruck} onView={() => setView("trucks")} />
            <Assistant recommendation={recommendations[0]} selectedDate={selectedDate} onSchedule={(truckId) => openVisitModal(dateKey(selectedDate), "11:00", truckId)} />
          </aside>
        </div>
      )}

      {view === "schedule" && <ScheduleView data={data} selectedDate={selectedDate} setSelectedDate={setSelectedDate} onSchedule={() => openVisitModal()} onSelect={setSelectedTruckId} onUpdateVisit={updateVisit} onAddVisit={openVisitModal} onDeleteVisit={deleteVisit} />}
      {view === "trucks" && <TrucksView trucks={filteredTrucks} selectedId={selectedTruckId} setSelectedId={setSelectedTruckId} onAdd={() => setModal("truck")} onDelete={setPendingDeleteId} onLogoChange={updateTruckLogo} />}
      {view === "insights" && <Insights data={data} />}
      {view === "location" && <LocationView location={location} onSave={(next) => { setLocation(next); window.localStorage.setItem("food-truck-admin-location", JSON.stringify(next)); void fetch("/api/location", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).then((response) => { if (!response.ok) throw new Error(); notify("Location profile updated"); }).catch(() => notify("Location saved locally, but could not be shared")); }} />}

      {modal === "visit" && <Modal title="Schedule a food truck" subtitle="Add a visit and check the calendar before confirming." onClose={() => setModal(null)}><VisitForm trucks={data.trucks} selectedTruckId={visitDraft.truckId} selectedDate={visitDraft.visitDate} startTime={visitDraft.startTime} endTime={visitDraft.endTime} onSubmit={submitVisit} /></Modal>}
      {modal === "truck" && <Modal title="Create truck profile" subtitle="Keep contact, compliance, and scheduling preferences together." onClose={() => setModal(null)}><TruckForm onSubmit={submitTruck} /></Modal>}
      {pendingDeleteId !== null && <DeleteTruckModal truck={data.trucks.find((truck) => truck.id === pendingDeleteId)} visitCount={data.visits.filter((visit) => visit.truckId === pendingDeleteId).length} onCancel={() => setPendingDeleteId(null)} onConfirm={() => deleteTruck(pendingDeleteId)} />}
      {toast && <div className="toast">✓ {toast}</div>}
      {loading && <div className="sync-note">Syncing schedule…</div>}
    </main>
  );
}

type DragState = {
  visitId: number;
  mode: "move" | "start" | "end";
  originX: number;
  originStart: number;
  originEnd: number;
  start: number;
  end: number;
  timelineWidth: number;
};

type ScheduleContextMenu =
  | { kind: "visit"; x: number; y: number; visit: Visit; truck: Truck }
  | { kind: "open"; x: number; y: number; time: string; truckId?: number };

function ScheduleBoard({ visits, trucks, overlaps, visitDate, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit }: { visits: Visit[]; trucks: Truck[]; overlaps: Visit[][]; visitDate: string; onSelect: (id: number) => void; onUpdateVisit: (visitId: number, startTime: string, endTime: string) => void; onAddVisit: (visitDate: string, startTime: string, truckId?: number) => void; onDeleteVisit: (visitId: number) => void }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [contextMenu, setContextMenu] = useState<ScheduleContextMenu | null>(null);
  const [now, setNow] = useState(() => new Date());
  const timelineStart = 600;
  const timelineEnd = 1200;
  const timelineSpan = timelineEnd - timelineStart;
  const shown = visits;
  const today = dateKey(todayAtNoon());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNow = visitDate === today && nowMinutes >= timelineStart && nowMinutes <= timelineEnd;
  const nowLeft = ((nowMinutes - timelineStart) / timelineSpan) * 100;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 20_000);
    return () => window.clearInterval(timer);
  }, []);

  function beginDrag(event: ReactPointerEvent<HTMLElement>, visit: Visit, mode: DragState["mode"]) {
    if (visit.id < 0 || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const timeline = event.currentTarget.closest(".timeline");
    const timelineWidth = timeline?.getBoundingClientRect().width ?? 1;
    const start = minutes(visit.startTime);
    const end = minutes(visit.endTime);
    setDrag({ visitId: visit.id, mode, originX: event.clientX, originStart: start, originEnd: end, start, end, timelineWidth });
  }

  function continueDrag(event: ReactPointerEvent<HTMLElement>) {
    if (!drag) return;
    const rawDelta = ((event.clientX - drag.originX) / drag.timelineWidth) * timelineSpan;
    const delta = Math.round(rawDelta / 15) * 15;
    let start = drag.originStart;
    let end = drag.originEnd;
    if (drag.mode === "move") {
      const duration = drag.originEnd - drag.originStart;
      start = Math.max(timelineStart, Math.min(timelineEnd - duration, drag.originStart + delta));
      end = start + duration;
    } else if (drag.mode === "start") {
      start = Math.max(timelineStart, Math.min(drag.originEnd - 30, drag.originStart + delta));
    } else {
      end = Math.min(timelineEnd, Math.max(drag.originStart + 30, drag.originEnd + delta));
    }
    setDrag((current) => current ? { ...current, start, end } : null);
  }

  function finishDrag() {
    if (!drag) return;
    if (drag.start !== drag.originStart || drag.end !== drag.originEnd) {
      onUpdateVisit(drag.visitId, timeFromMinutes(drag.start), timeFromMinutes(drag.end));
    }
    setDrag(null);
  }

  function timeAtPointer(event: React.MouseEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const snapped = Math.round((timelineStart + ratio * timelineSpan) / 15) * 15;
    return timeFromMinutes(Math.min(timelineEnd - 30, snapped));
  }

  function openTimelineMenu(event: React.MouseEvent<HTMLElement>, truckId?: number) {
    event.preventDefault();
    setContextMenu({ kind: "open", x: event.clientX, y: event.clientY, time: timeAtPointer(event), truckId });
  }

  return <div className="schedule-board">
    <div className="schedule-help"><span>Drag a shift to move it</span><span>Drag either edge to resize</span><span>15-minute increments</span></div>
    <div className="time-head"><strong>TRUCKS</strong>{Array.from({ length: 10 }, (_, i) => <span key={i}>{formatTime(`${10 + i}:00`).replace(":00", "")}</span>)}</div>
    {!shown.length && <div className="empty-schedule" onContextMenu={openTimelineMenu}><strong>No trucks scheduled for this day</strong><span>Right-click anywhere here to add a visit.</span></div>}
    {shown.map((visit) => {
      const truck = trucks.find((t) => t.id === visit.truckId)!;
      const active = drag?.visitId === visit.id ? drag : null;
      const start = active?.start ?? minutes(visit.startTime);
      const end = active?.end ?? minutes(visit.endTime);
      const left = ((start - timelineStart) / timelineSpan) * 100;
      const width = ((end - start) / timelineSpan) * 100;
      const conflict = overlaps.some((pair) => pair.some((item) => item.id === visit.id));
      return <div className="timeline-row" key={visit.id}>
        <button className="truck-label" onClick={() => onSelect(truck.id)}><TruckAvatar truck={truck} /><span><strong>{truck.name}</strong><small>{truck.cuisine}</small></span></button>
        <div className="timeline" onContextMenu={(event) => openTimelineMenu(event, truck.id)}>{showNow && <span className="now-cursor" style={{ left: `${nowLeft}%` }} aria-hidden="true"><i>NOW</i></span>}<div className={`visit-block ${conflict ? "conflict" : ""} ${active ? "dragging" : ""}`} style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(width, 5)}%`, background: `linear-gradient(110deg, ${truck.color}66, ${truck.color}bb)` }} role="button" tabIndex={0} onClick={() => onSelect(truck.id)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ kind: "visit", x: event.clientX, y: event.clientY, visit, truck }); }} onPointerDown={(event) => beginDrag(event, visit, "move")} onPointerMove={continueDrag} onPointerUp={finishDrag} onPointerCancel={() => setDrag(null)}>
          {visit.id > 0 && <button className="resize-handle start" aria-label={`Change ${truck.name} start time`} onPointerDown={(event) => beginDrag(event, visit, "start")} />}
          <small>{formatTime(timeFromMinutes(start))} – {formatTime(timeFromMinutes(end))}</small><strong>{truck.name}</strong><span>{visit.status}</span>
          {visit.id > 0 && <button className="resize-handle end" aria-label={`Change ${truck.name} end time`} onPointerDown={(event) => beginDrag(event, visit, "end")} />}
        </div></div>
      </div>;
    })}
    {contextMenu && <div className="context-menu-layer" onMouseDown={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}>
      <div className="schedule-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
        {contextMenu.kind === "visit" ? <><small>{contextMenu.truck.name}</small><strong>{formatTime(contextMenu.visit.startTime)} – {formatTime(contextMenu.visit.endTime)}</strong><button className="delete-shift-action" onClick={() => { setContextMenu(null); onDeleteVisit(contextMenu.visit.id); }}>× Delete shift</button></> : <><small>OPEN TIME</small><strong>{formatTime(contextMenu.time)}</strong><button onClick={() => { setContextMenu(null); onAddVisit(visitDate, contextMenu.time, contextMenu.truckId); }}>＋ Add shift here</button></>}
      </div>
    </div>}
  </div>;
}

function TruckProfile({ truck, onView }: { truck: Truck; onView: () => void }) {
  if (!truck) return null;
  return <article className="rail-card profile-card">
    <div className="card-title"><h2>Truck Profile</h2><span>⌃</span></div>
    <div className="profile-head"><TruckAvatar truck={truck} large /><div><h3>{truck.name}</h3><p>{truck.cuisine}</p><strong className="rating">★ {(truck.reliability / 20).toFixed(1)}</strong></div></div>
    <dl><div><dt>Contact</dt><dd>{truck.contact}</dd></div><div><dt>Phone</dt><dd>{truck.phone}</dd></div><div><dt>Email</dt><dd>{truck.email}</dd></div><div><dt>Payments</dt><dd>{truck.paymentTypes || "Not provided"}</dd></div><div><dt>Insurance</dt><dd>{expiryLabel(truck.insuranceExpiry)}</dd></div><div><dt>Preferred hours</dt><dd>{formatTime(truck.preferredStart)} – {formatTime(truck.preferredEnd)}</dd></div><div><dt>Reliability</dt><dd className="lime">{truck.reliability}%</dd></div></dl>
    <button className="secondary wide" onClick={onView}>View Full Profile</button>
  </article>;
}

function Assistant({ recommendation, selectedDate, onSchedule }: { recommendation?: { truck: Truck; compliant: boolean; distinct: boolean; score: number }; selectedDate: Date; onSchedule: (id: number) => void }) {
  return <article className="rail-card assistant">
    <div className="card-title"><h2>AI Schedule Assistant <em>BETA</em></h2><span>⌃</span></div>
    <div className="ai-box">{recommendation ? <><p>✦ Best available fit for {selectedDate.toLocaleDateString("en-US", { weekday: "long" })}:</p><h3>{recommendation.truck.name}</h3><small>Based on weekly availability, schedule fit, compliance, cuisine variety, and reliability.</small><ul><li>✓ Available that day</li><li>✓ {recommendation.distinct ? "No cuisine overlap" : "Complements existing lineup"}</li><li>✓ {recommendation.truck.reliability}% reliability</li><li>✓ {recommendation.compliant ? "Documents current" : "Review documents first"}</li></ul><button className="primary wide" onClick={() => onSchedule(recommendation.truck.id)}>Schedule this truck →</button></> : <><h3>No available match</h3><p>Every available truck is already scheduled, or no truck is marked available that day.</p></>}</div>
  </article>;
}

function ScheduleView({ data, selectedDate, setSelectedDate, onSchedule, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit }: { data: AppData; selectedDate: Date; setSelectedDate: (d: Date) => void; onSchedule: () => void; onSelect: (id: number) => void; onUpdateVisit: (visitId: number, startTime: string, endTime: string) => void; onAddVisit: (visitDate: string, startTime: string, truckId?: number) => void; onDeleteVisit: (visitId: number) => void }) {
  const [mode, setMode] = useState<"gantt" | "calendar">("gantt");
  const weekStart = addDays(selectedDate, -selectedDate.getDay() + 1);
  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));
  const selectedVisits = data.visits.filter((visit) => visit.visitDate === dateKey(selectedDate));
  const exportCount = data.visits.filter((visit) => visit.status.toLowerCase() !== "cancelled").length;
  const overlaps = selectedVisits.flatMap((a, index) => selectedVisits.slice(index + 1).filter((b) => {
    const aTruck = data.trucks.find((truck) => truck.id === a.truckId);
    const bTruck = data.trucks.find((truck) => truck.id === b.truckId);
    return minutes(a.startTime) < minutes(b.endTime)
      && minutes(b.startTime) < minutes(a.endTime)
      && sharesMenu(aTruck?.cuisine || "", bTruck?.cuisine || "");
  }).map((b) => [a, b]));
  return <section className="content-page">
    <div className="section-heading">
      <div><p className="eyebrow">VISIT PLANNER</p><h1>Schedule</h1><p>Plan visits, adjust times, or export every non-cancelled visit in Eastern Time.</p></div>
      <div className="heading-actions">
        <div className="view-toggle"><button className={mode === "gantt" ? "active" : ""} onClick={() => setMode("gantt")}>▤ Daily Gantt</button><button className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>▦ Calendar</button></div>
        <a className={`secondary calendar-export ${exportCount ? "" : "disabled"}`} href={exportCount ? "/api/data?calendar=1" : undefined} aria-disabled={!exportCount} download>
          <span aria-hidden="true">⇩</span><span><strong>Export All to Calendar</strong><small>{exportCount} {exportCount === 1 ? "visit" : "visits"} • .ics</small></span>
        </a>
        <button className="primary" onClick={onSchedule}>＋ Schedule Visit</button>
      </div>
    </div>
    <div className="schedule-datebar"><div><button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>‹</button><strong>{selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</strong><button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>›</button></div><button className="secondary" onClick={() => setSelectedDate(todayAtNoon())}>Today</button></div>
    <div className="week-strip schedule-week">{days.slice(0, 7).map((date) => <button key={dateKey(date)} className={dateKey(date) === dateKey(selectedDate) ? "selected" : ""} onClick={() => setSelectedDate(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong></button>)}</div>
    {mode === "gantt" ? <ScheduleBoard visits={selectedVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} onSelect={onSelect} onUpdateVisit={onUpdateVisit} onAddVisit={onAddVisit} onDeleteVisit={onDeleteVisit} /> : <div className="calendar-grid">{days.map((date) => { const visits = data.visits.filter((v) => v.visitDate === dateKey(date)); return <button key={dateKey(date)} className={`day-card ${dateKey(date) === dateKey(selectedDate) ? "selected" : ""}`} onClick={() => setSelectedDate(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.getDate()}</strong><div>{visits.map((visit) => { const truck = data.trucks.find((t) => t.id === visit.truckId)!; return <i key={visit.id} style={{ borderColor: truck.color }} onClick={() => onSelect(truck.id)}>{truck.name}<small>{formatTime(visit.startTime)} – {formatTime(visit.endTime)}</small></i>; })}{!visits.length && <em>Open day</em>}</div></button>; })}</div>}
  </section>;
}

function TruckLogoEditor({ truck, onChange }: { truck: Truck; onChange: (file: File | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);

  async function chooseLogo(file: File | null) {
    if (!file) return;
    setBusy(true);
    await onChange(file);
    setBusy(false);
  }

  return <div className="logo-actions">
    <label className="secondary logo-button">
      {busy ? "Preparing logo…" : truck.hasLogo || truck.logoData ? "Change logo" : "＋ Add logo"}
      <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void chooseLogo(file); }} />
    </label>
    {(truck.hasLogo || truck.logoData) && <button className="text-button" disabled={busy} onClick={() => { setBusy(true); void onChange(null).finally(() => setBusy(false)); }}>Remove logo</button>}
    <small>PNG, JPEG, or WebP. It will be resized automatically.</small>
  </div>;
}

function TrucksView({ trucks, selectedId, setSelectedId, onAdd, onDelete, onLogoChange }: { trucks: Truck[]; selectedId: number; setSelectedId: (id: number) => void; onAdd: () => void; onDelete: (id: number) => void; onLogoChange: (truckId: number, file: File | null) => Promise<void> }) {
  const selected = trucks.find((t) => t.id === selectedId) ?? trucks[0];
  return <section className="content-page">
    <div className="section-heading"><div><p className="eyebrow">VENDOR DIRECTORY</p><h1>Food Trucks</h1><p>Profiles, contact details, documents, and weekly availability.</p></div><button className="primary" onClick={onAdd}>＋ Add Truck</button></div>
    {trucks.length ? <div className="truck-layout">
      <div className="truck-grid">{trucks.map((truck) => <button className={`truck-card ${truck.id === selectedId ? "selected" : ""}`} key={truck.id} onClick={() => setSelectedId(truck.id)}>
        <TruckAvatar truck={truck} large />
        <div><h3>{truck.name}</h3><p>{truck.cuisine}</p><span className={expiryClass(truck.insuranceExpiry)}>{expiryState(truck.insuranceExpiry)}</span></div>
        <strong>{truck.reliability}%</strong>
      </button>)}</div>
      {selected && <article className="detail-card">
        <div className="profile-head"><TruckAvatar truck={selected} large /><div><h2>{selected.name}</h2><p>{selected.cuisine}</p></div></div>
        <TruckLogoEditor truck={selected} onChange={(file) => onLogoChange(selected.id, file)} />
        <dl><div><dt>Primary contact</dt><dd>{selected.contact}</dd></div><div><dt>Phone</dt><dd>{selected.phone}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Accepted payments</dt><dd>{selected.paymentTypes || "Not provided"}</dd></div><div><dt>Insurance expiration</dt><dd>{selected.insuranceExpiry || "Not provided"}</dd></div><div><dt>Food license expiration</dt><dd>{selected.licenseExpiry || "Not provided"}</dd></div></dl>
        <h4>Weekly availability</h4>
        <div className="availability-summary">{withAvailability(selected).availability.map((slot) => <div className={slot.enabled ? "available-day" : "closed-day"} key={slot.day}><strong>{weekDays.find((item) => item.day === slot.day)?.short}</strong><span>{slot.enabled ? `${formatTime(slot.start)} – ${formatTime(slot.end)}` : "Unavailable"}</span></div>)}</div>
        <h4>Operations notes</h4><p>{selected.notes || "No notes yet."}</p>
        <button className="danger-button" onClick={() => onDelete(selected.id)}>Delete Truck</button>
      </article>}
    </div> : <div className="empty-state"><h2>No truck profiles yet</h2><p>Add your first vendor to begin scheduling visits.</p><button className="primary" onClick={onAdd}>＋ Add Truck</button></div>}
  </section>;
}

function Insights({ data }: { data: AppData }) {
  const cuisineCounts = Object.entries(data.trucks.reduce<Record<string, number>>((acc, truck) => { acc[truck.cuisine] = (acc[truck.cuisine] ?? 0) + 1; return acc; }, {}));
  const max = Math.max(...cuisineCounts.map(([, count]) => count), 1);
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">PERFORMANCE SIGNALS</p><h1>Insights</h1><p>Use the lineup you already have to identify gaps and scheduling risk.</p></div></div><div className="insight-grid"><article><span>ACTIVE ROSTER</span><strong>{data.trucks.length}</strong><p>food-truck partners</p></article><article><span>UPCOMING VISITS</span><strong>{data.visits.length}</strong><p>currently planned</p></article><article><span>COMPLIANCE RISK</span><strong>{data.trucks.filter((t) => needsDocumentAttention(t.insuranceExpiry) || needsDocumentAttention(t.licenseExpiry)).length}</strong><p>documents need attention</p></article></div><div className="analysis-card"><h2>Cuisine mix</h2><p>A varied lineup reduces repeat fatigue and gives associates more choice.</p>{cuisineCounts.map(([name, count]) => <div className="bar-row" key={name}><span>{name}</span><i><b style={{ width: `${(count / max) * 100}%` }} /></i><strong>{count}</strong></div>)}</div></section>;
}

function LocationView({ location, onSave }: { location: LocationProfile; onSave: (location: LocationProfile) => void }) {
  const [editing, setEditing] = useState(false);
  const address = [location.street, [location.city, location.state].filter(Boolean).join(", "), location.zip].filter(Boolean).join(" ");
  const hours = location.operatingHours?.length ? location.operatingHours : weekDays.map(({ day }) => ({ day, enabled: day >= 1 && day <= 6, start: "06:00", end: "22:00" }));
  if (editing) {
    return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">STORE PROFILE</p><h1>Location</h1><p>Program operating hours, closure dates, and arrival details.</p></div></div><article className="location-card"><form className="form-grid" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const values = Object.fromEntries(form.entries());
      const openDays = new Set(form.getAll("openDays").map(Number));
      onSave({
        storeName: String(values.storeName), storeNumber: String(values.storeNumber), street: String(values.street),
        city: String(values.city), state: String(values.state), zip: String(values.zip), phone: String(values.phone),
        timezone: String(values.timezone), notes: String(values.notes),
        operatingHours: weekDays.map(({ day }) => ({ day, enabled: openDays.has(day), start: String(form.get(`open_${day}`) || "06:00"), end: String(form.get(`close_${day}`) || "22:00") })),
        closedDates: String(values.closedDates || "").split(/\r?\n|,/).map((date) => date.trim()).filter(Boolean),
      });
      setEditing(false);
    }}>
      <label>Store name<input name="storeName" defaultValue={location.storeName} required /></label><label>Store number<input name="storeNumber" defaultValue={location.storeNumber} required /></label>
      <label className="full">Street address<input name="street" defaultValue={location.street} /></label><label>City<input name="city" defaultValue={location.city} /></label><label>State<input name="state" defaultValue={location.state} /></label><label>ZIP<input name="zip" defaultValue={location.zip} /></label><label>Store phone<input name="phone" defaultValue={location.phone} /></label><label className="full">Scheduling time zone<input name="timezone" defaultValue={location.timezone} required /></label>
      <fieldset className="full availability-editor"><legend>Hours of operation</legend><p>Turn days on or off and set the opening and closing times.</p>{weekDays.map(({ day, short, label }) => { const slot = hours.find((item) => item.day === day); return <div className="availability-row" key={day}><label className="day-check"><input type="checkbox" name="openDays" value={day} defaultChecked={slot?.enabled} /><span>{short}</span><small>{label}</small></label><label><span>Open</span><input type="time" name={`open_${day}`} defaultValue={slot?.start || "06:00"} /></label><label><span>Close</span><input type="time" name={`close_${day}`} defaultValue={slot?.end || "22:00"} /></label></div>; })}</fieldset>
      <label className="full">Store closure dates <span className="optional-label">One per line</span><textarea name="closedDates" defaultValue={(location.closedDates || []).join("\n")} placeholder={"2026-11-26\n2026-12-25"} /></label>
      <label className="full">Site notes for vendors<textarea name="notes" defaultValue={location.notes} placeholder="Where to park, available hookups, and who to check in with…" /></label>
      <div className="modal-actions full"><button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button><button className="primary" type="submit">Save location profile</button></div>
    </form></article></section>;
  }
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">STORE PROFILE</p><h1>Location</h1><p>The address, operating hours, and arrival details food-truck vendors need.</p></div><button className="primary" onClick={() => setEditing(true)}>✎ Edit details</button></div>{!location.street && <div className="location-warning">△ <span><strong>Store details are incomplete</strong><small>Add the address and phone before the next lineup.</small></span></div>}<article className="location-card"><div className="location-head"><span>◧</span><div><h2>{location.storeName}</h2><p>Store {location.storeNumber}</p></div></div><dl><div><dt>Address</dt><dd>{address || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{location.phone || "Not provided"}</dd></div><div><dt>Time zone</dt><dd>{location.timezone}</dd></div></dl><h4>Hours of operation</h4><div className="availability-summary">{hours.map((slot) => <div className={slot.enabled ? "available-day" : "closed-day"} key={slot.day}><strong>{weekDays.find((item) => item.day === slot.day)?.short}</strong><span>{slot.enabled ? `${formatTime(slot.start)} – ${formatTime(slot.end)}` : "Closed"}</span></div>)}</div><h4>Scheduled closures</h4>{location.closedDates?.length ? <div className="closure-list">{location.closedDates.map((date) => <span key={date}>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>)}</div> : <p>No closure dates programmed.</p>}<h4>Site notes for vendors</h4><p>{location.notes || "No arrival notes yet."}</p></article></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">FOOD TRUCK ADMIN</p><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>;
}

function DeleteTruckModal({ truck, visitCount, onCancel, onConfirm }: { truck?: Truck; visitCount: number; onCancel: () => void; onConfirm: () => void }) {
  if (!truck) return null;
  return <div className="modal-backdrop"><section className="modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-truck-title"><p className="eyebrow">PERMANENT ACTION</p><h2 id="delete-truck-title">Delete {truck.name}?</h2><p>This will also remove {visitCount} scheduled {visitCount === 1 ? "visit" : "visits"} connected to this truck. This cannot be undone.</p><div className="modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="danger-button solid" onClick={onConfirm}>Delete Truck</button></div></section></div>;
}

function VisitForm({ trucks, selectedTruckId, selectedDate, startTime, endTime, onSubmit }: { trucks: Truck[]; selectedTruckId: number; selectedDate: string; startTime: string; endTime: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="form-grid"><label className="full">Food truck<select name="truckId" defaultValue={selectedTruckId}>{trucks.map((truck) => <option value={truck.id} key={truck.id}>{truck.name} — {truck.cuisine}</option>)}</select></label><label>Date<input name="visitDate" type="date" defaultValue={selectedDate} required /></label><label>Expected demand<select name="expectedDemand" defaultValue="High"><option>High</option><option>Medium</option><option>Low</option></select></label><label>Start time<input name="startTime" type="time" defaultValue={startTime} required /></label><label>End time<input name="endTime" type="time" defaultValue={endTime} required /></label><label>Status<select name="status" defaultValue="Tentative"><option>Tentative</option><option>Confirmed</option><option>Cancelled</option></select></label><label>Notes<input name="notes" placeholder="Setup needs, event details…" /></label><button className="primary full" type="submit">Add to schedule</button></form>;
}

function TruckForm({ onSubmit }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void }) {
  const [cuisineChoice, setCuisineChoice] = useState("");
  const [customCuisine, setCustomCuisine] = useState("");
  const [logoData, setLogoData] = useState("");
  const [logoError, setLogoError] = useState("");
  const [logoBusy, setLogoBusy] = useState(false);
  const cuisine = cuisineChoice === "custom" ? customCuisine.trim() : cuisineChoice;

  async function chooseLogo(file: File | null) {
    if (!file) return;
    setLogoBusy(true);
    setLogoError("");
    try {
      setLogoData(await resizeTruckLogo(file));
    } catch (error) {
      setLogoError(error instanceof Error ? error.message : "That logo could not be prepared.");
    } finally {
      setLogoBusy(false);
    }
  }

  return <form onSubmit={onSubmit} className="form-grid">
    <div className="full truck-logo-upload">
      <span className={`logo-preview ${logoData ? "has-logo" : ""}`} style={{ backgroundImage: logoData ? `url("${logoData}")` : undefined }}>{logoData ? "" : "▰"}</span>
      <div><strong>Truck logo <em>Optional</em></strong><p>Add a profile image now, or upload one later from the truck profile.</p><div className="logo-upload-buttons"><label className="secondary logo-button">{logoBusy ? "Preparing…" : logoData ? "Choose another" : "Choose image"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={logoBusy} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.target.value = ""; void chooseLogo(file); }} /></label>{logoData && <button type="button" className="text-button" onClick={() => { setLogoData(""); setLogoError(""); }}>Remove</button>}</div>{logoError && <small className="form-error">{logoError}</small>}</div>
      <input type="hidden" name="logoData" value={logoData} />
    </div>
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
    <fieldset className="full payment-editor"><legend>Accepted payment types</legend><p>Select every method this truck accepts.</p><div className="payment-options">{["Cash","Credit/Debit Cards","Apple Pay","Google Pay","Cash App","Venmo"].map((method) => <label key={method}><input type="checkbox" name="paymentMethods" value={method} />{method}</label>)}</div><label>Other<input name="paymentMethods" placeholder="Other payment type" /></label></fieldset>
    <label>Insurance expires <span className="optional-label">Optional</span><input name="insuranceExpiry" type="date" /></label>
    <label>Food license expires <span className="optional-label">Optional</span><input name="licenseExpiry" type="date" /></label>
    <label>Default start<input name="preferredStart" type="time" defaultValue="11:00" /></label>
    <label>Default end<input name="preferredEnd" type="time" defaultValue="15:00" /></label>
    <fieldset className="full availability-editor"><legend>Weekly availability</legend><p>Check every day this truck can come, then set that day&apos;s available window.</p>{weekDays.map(({ day, short, label }) => <div className="availability-row" key={day}><label className="day-check"><input type="checkbox" name="availabilityDays" value={day} defaultChecked={day >= 1 && day <= 5} /><span>{short}</span><small>{label}</small></label><label><span>From</span><input type="time" name={`start_${day}`} defaultValue="11:00" /></label><label><span>To</span><input type="time" name={`end_${day}`} defaultValue="15:00" /></label></div>)}</fieldset>
    <label className="full">Notes<textarea name="notes" placeholder="Electrical needs, setup notes, strongest dayparts…" /></label>
    <button className="primary full" type="submit">Create truck profile</button>
  </form>;
}
