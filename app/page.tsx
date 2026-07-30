"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useState } from "react";
import { VISIT_OUTCOMES } from "./lib/reliability";

/* location-schedule-settings-v1 */

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
  reliabilityEvents?: number;
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
  outcome: string;
  outcomeNotes: string;
};

type AppData = { trucks: Truck[]; visits: Visit[]; storage?: "postgres" };
type View = "dashboard" | "schedule" | "trucks" | "insights" | "location";
type SessionUser = { id: number; email: string; name: string; storeNumber: string; role: string };
type LocationProfile = { storeName: string; storeNumber: string; street: string; city: string; state: string; zip: string; phone: string; timezone: string; notes: string; operatingHours: DayAvailability[]; closedDates: string[]; weekStartsOn?: number };
type GooglePlaceProfile = {
  placeId: string;
  name: string;
  address: string;
  mapsUri: string;
  websiteUri: string;
  rating: number | null;
  ratingCount: number;
  summary: string;
  summaryDisclosure: string;
  summaryReviewsUri: string;
  summaryFlagUri: string;
  matchLevel?: "likely" | "possible" | "unlikely";
  matchReason?: string;
};
type GoogleReviewState = {
  loading: boolean;
  configured?: boolean;
  linked?: boolean;
  dailyLimit?: number;
  profile?: GooglePlaceProfile;
  error?: string;
};
type GoogleReviewResponse = {
  configured?: boolean;
  linked?: boolean;
  dailyLimit?: number;
  profile?: GooglePlaceProfile;
  candidates?: GooglePlaceProfile[];
  query?: string;
  aiAssisted?: boolean;
  error?: string;
};
type LocationTraffic = {
  configured: boolean;
  available: boolean;
  values?: number[];
  source?: "current" | "previous" | "next" | "interpolated";
  fetchedAt?: string;
  venueName?: string;
  venueAddress?: string;
  weekStart?: string;
  message?: string;
};

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
    { id: 1, name: "Sample Burger Truck", cuisine: "Smashburgers & Fries", contact: "Sample Contact", phone: "(202) 555-0101", email: "burgers@example.com", insuranceExpiry: "2026-10-14", licenseExpiry: "2027-02-28", preferredStart: "11:00", preferredEnd: "15:00", reliability: 0, reliabilityEvents: 0, notes: "Demo record. Needs 20A electrical hookup.", color: "#1687ff", availability: standardAvailability(), paymentTypes: "Cash, Credit/Debit Cards" },
    { id: 2, name: "Sample Taco Truck", cuisine: "Mexican", contact: "Sample Contact", phone: "(202) 555-0102", email: "tacos@example.com", insuranceExpiry: "2027-01-09", licenseExpiry: "2026-11-22", preferredStart: "12:00", preferredEnd: "16:00", reliability: 0, reliabilityEvents: 0, notes: "Demo record for scheduling.", color: "#7ac943", availability: standardAvailability("12:00", "16:00"), paymentTypes: "Cash, Credit/Debit Cards, Apple Pay" },
    { id: 3, name: "Sample Dessert Truck", cuisine: "Desserts & Coffee", contact: "Sample Contact", phone: "(202) 555-0103", email: "desserts@example.com", insuranceExpiry: "2026-09-18", licenseExpiry: "2027-03-10", preferredStart: "15:00", preferredEnd: "19:00", reliability: 0, reliabilityEvents: 0, notes: "Demo record for scheduling.", color: "#9b6cff", availability: standardAvailability("15:00", "19:00").map((slot) => ({ ...slot, enabled: slot.day >= 3 && slot.day <= 6 })), paymentTypes: "Credit/Debit Cards, Apple Pay, Google Pay" },
    { id: 4, name: "Sample Barbecue Truck", cuisine: "Barbecue", contact: "Sample Contact", phone: "(202) 555-0104", email: "barbecue@example.com", insuranceExpiry: "2026-08-21", licenseExpiry: "2026-12-12", preferredStart: "11:00", preferredEnd: "15:00", reliability: 0, reliabilityEvents: 0, notes: "Demo record; allow 30 minutes for setup.", color: "#ff9c42", availability: standardAvailability().map((slot) => ({ ...slot, enabled: [1, 4, 5, 6].includes(slot.day) })), paymentTypes: "Cash, Credit/Debit Cards" },
  ],
  visits: [
    { id: 1, truckId: 1, visitDate: "2026-07-27", startTime: "11:00", endTime: "14:00", status: "Confirmed", expectedDemand: "High", notes: "", outcome: "", outcomeNotes: "" },
    { id: 2, truckId: 2, visitDate: "2026-07-27", startTime: "12:00", endTime: "16:00", status: "Confirmed", expectedDemand: "High", notes: "", outcome: "", outcomeNotes: "" },
    { id: 3, truckId: 3, visitDate: "2026-07-27", startTime: "15:00", endTime: "19:00", status: "Confirmed", expectedDemand: "Medium", notes: "", outcome: "", outcomeNotes: "" },
    { id: 4, truckId: 4, visitDate: "2026-07-30", startTime: "11:00", endTime: "14:00", status: "Tentative", expectedDemand: "High", notes: "", outcome: "", outcomeNotes: "" },
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
  const [outcomeVisitId, setOutcomeVisitId] = useState<number | null>(null);
  const [visitDraft, setVisitDraft] = useState({ visitDate: "2026-07-27", startTime: "11:00", endTime: "14:00", truckId: 1 });
  const [location, setLocation] = useState<LocationProfile>({ storeName: "Lowe's", storeNumber: "0244", street: "", city: "", state: "OH", zip: "", phone: "", timezone: "America/New_York", notes: "", operatingHours: weekDays.map(({ day }) => ({ day, enabled: day >= 1 && day <= 6, start: "06:00", end: "22:00" })), closedDates: [], weekStartsOn: 6 });
  const [locationTraffic, setLocationTraffic] = useState<LocationTraffic | null>(null);
  const [locationTrafficLoading, setLocationTrafficLoading] = useState(false);
  const [googleReviews, setGoogleReviews] = useState<Record<number, GoogleReviewState>>({});
  const [googleSearchTruckId, setGoogleSearchTruckId] = useState<number | null>(null);
  const [googleCandidates, setGoogleCandidates] = useState<GooglePlaceProfile[]>([]);
  const [googleSearchQuery, setGoogleSearchQuery] = useState("");
  const [googleSearchTerms, setGoogleSearchTerms] = useState("");
  const [googleSearchArea, setGoogleSearchArea] = useState("");
  const [googleAiAssisted, setGoogleAiAssisted] = useState(false);
  const [showUnlikelyGoogleMatches, setShowUnlikelyGoogleMatches] = useState(false);
  const [googleSearchBusy, setGoogleSearchBusy] = useState(false);
  const [googleSearchError, setGoogleSearchError] = useState("");

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
          setLocation({ ...result.location, weekStartsOn: Number.isInteger(result.location.weekStartsOn) ? result.location.weekStartsOn : 6 });
          return;
        }
      } catch {
        // Fall through to the last locally cached profile.
      }
      const saved = window.localStorage.getItem("food-truck-admin-location");
      if (saved) {
        try { const parsed = JSON.parse(saved) as LocationProfile; setLocation({ ...parsed, weekStartsOn: Number.isInteger(parsed.weekStartsOn) ? parsed.weekStartsOn : 6 }); } catch { window.localStorage.removeItem("food-truck-admin-location"); }
      }
    }
    if (user) void loadLocation();
  }, [user]);

  useEffect(() => {
    const hasAddress = Boolean(
      location.street.trim()
        && location.city.trim()
        && location.state.trim()
        && location.zip.trim(),
    );
    if (!user || !hasAddress) {
      setLocationTraffic(null);
      setLocationTrafficLoading(false);
      return;
    }

    const controller = new AbortController();
    async function loadLocationTraffic() {
      setLocationTrafficLoading(true);
      try {
        const response = await fetch(
          `/api/location/traffic?date=${encodeURIComponent(dateKey(selectedDate))}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = await response.json() as LocationTraffic;
        if (!response.ok) throw new Error(result.message || "Traffic lookup failed");
        setLocationTraffic(result);
      } catch (error) {
        if (controller.signal.aborted) return;
        setLocationTraffic({
          configured: false,
          available: false,
          message: error instanceof Error
            ? error.message
            : "Typical traffic is temporarily unavailable.",
        });
      } finally {
        if (!controller.signal.aborted) setLocationTrafficLoading(false);
      }
    }
    void loadLocationTraffic();
    return () => controller.abort();
  }, [
    location.city,
    location.state,
    location.storeName,
    location.storeNumber,
    location.street,
    location.zip,
    selectedDate,
    user,
  ]);

  const weekStartsOn = Number.isInteger(location.weekStartsOn) ? Number(location.weekStartsOn) : 6;
  const week = useMemo(() => { const offset = (selectedDate.getDay() - weekStartsOn + 7) % 7; const start = addDays(selectedDate, -offset); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }, [selectedDate, weekStartsOn]);
  const dayVisits = data.visits.filter((visit) => visit.visitDate === dateKey(selectedDate));
  const selectedTruck = data.trucks.find((truck) => truck.id === selectedTruckId) ?? data.trucks[0];
  const outcomeVisit = data.visits.find((visit) => visit.id === outcomeVisitId);
  const outcomeTruck = data.trucks.find((truck) => truck.id === outcomeVisit?.truckId);

  /* next-scheduled-truck-card-v1 */
  const nextScheduled = useMemo(() => {
    const now = new Date();
    const nextVisit = data.visits
      .filter((visit) => visit.status.toLowerCase() !== "cancelled")
      .map((visit) => ({ visit, startsAt: new Date(`${visit.visitDate}T${visit.startTime}:00`) }))
      .filter(({ startsAt }) => startsAt.getTime() >= now.getTime())
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];
    if (!nextVisit) return null;
    const truck = data.trucks.find((item) => item.id === nextVisit.visit.truckId);
    if (!truck) return null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const visitDay = new Date(nextVisit.startsAt.getFullYear(), nextVisit.startsAt.getMonth(), nextVisit.startsAt.getDate());
    const daysAway = Math.round((visitDay.getTime() - today.getTime()) / 86400000);
    return { ...nextVisit, truck, daysAway };
  }, [data.trucks, data.visits]);

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

  async function submitVisitOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!outcomeVisit) return;
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/data", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "visitOutcome",
          id: outcomeVisit.id,
          outcome: String(form.get("outcome") || ""),
          outcomeNotes: String(form.get("outcomeNotes") || ""),
        }),
      });
      if (!response.ok) throw new Error("Outcome update failed");
      const next = await response.json() as AppData;
      setData({ ...next, trucks: next.trucks.map(withAvailability) });
      setOutcomeVisitId(null);
      notify("Visit outcome saved and reliability recalculated");
    } catch {
      notify("That visit outcome could not be saved");
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

  async function loadGoogleReview(truckId: number) {
    setGoogleReviews((current) => ({
      ...current,
      [truckId]: { ...current[truckId], loading: true, error: "" },
    }));
    try {
      const response = await fetch(`/api/reviews?truckId=${truckId}`, {
        cache: "no-store",
      });
      const result = await response.json() as GoogleReviewResponse;
      if (!response.ok) throw new Error(result.error || "The Google listing could not be loaded.");
      setGoogleReviews((current) => ({
        ...current,
        [truckId]: {
          loading: false,
          configured: result.configured,
          linked: result.linked,
          dailyLimit: result.dailyLimit,
          profile: result.profile,
        },
      }));
    } catch (error) {
      setGoogleReviews((current) => ({
        ...current,
        [truckId]: {
          ...current[truckId],
          loading: false,
          error: error instanceof Error ? error.message : "The Google listing could not be loaded.",
        },
      }));
    }
  }

  async function searchGooglePlaces(
    truckId: number,
    searchText?: string,
    searchArea?: string,
  ) {
    const truckName = data.trucks.find((truck) => truck.id === truckId)?.name || "";
    const nextSearchText = (searchText ?? `${truckName} food truck`).trim();
    const nextSearchArea = (searchArea ?? "").trim();
    setGoogleSearchTruckId(truckId);
    setGoogleSearchTerms(nextSearchText);
    setGoogleSearchArea(nextSearchArea);
    setGoogleCandidates([]);
    setGoogleSearchQuery("");
    setGoogleAiAssisted(false);
    setShowUnlikelyGoogleMatches(false);
    setGoogleSearchError("");
    setGoogleSearchBusy(true);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "search",
          truckId,
          searchText: nextSearchText,
          searchArea: nextSearchArea,
        }),
      });
      const result = await response.json() as GoogleReviewResponse;
      if (!response.ok) throw new Error(result.error || "Google could not search for this truck.");
      setGoogleCandidates(result.candidates || []);
      setGoogleSearchQuery(result.query || "");
      setGoogleAiAssisted(Boolean(result.aiAssisted));
    } catch (error) {
      setGoogleSearchError(error instanceof Error ? error.message : "Google could not search for this truck.");
    } finally {
      setGoogleSearchBusy(false);
    }
  }

  async function linkGooglePlace(truckId: number, placeId: string) {
    setGoogleSearchBusy(true);
    setGoogleSearchError("");
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "link", truckId, placeId }),
      });
      const result = await response.json() as GoogleReviewResponse;
      if (!response.ok || !result.profile) {
        throw new Error(result.error || "That Google listing could not be connected.");
      }
      setGoogleReviews((current) => ({
        ...current,
        [truckId]: {
          loading: false,
          configured: true,
          linked: true,
          dailyLimit: result.dailyLimit,
          profile: result.profile,
        },
      }));
      setGoogleSearchTruckId(null);
      setGoogleCandidates([]);
      notify("Google listing connected");
    } catch (error) {
      setGoogleSearchError(error instanceof Error ? error.message : "That Google listing could not be connected.");
    } finally {
      setGoogleSearchBusy(false);
    }
  }

  async function unlinkGooglePlace(truckId: number) {
    if (!window.confirm("Disconnect this Google listing? The truck profile and schedule will not be affected.")) return;
    try {
      const response = await fetch(`/api/reviews?truckId=${truckId}`, {
        method: "DELETE",
      });
      const result = await response.json() as GoogleReviewResponse;
      if (!response.ok) throw new Error(result.error || "The Google listing could not be disconnected.");
      setGoogleReviews((current) => ({
        ...current,
        [truckId]: {
          loading: false,
          configured: result.configured,
          linked: false,
          dailyLimit: result.dailyLimit,
        },
      }));
      notify("Google listing disconnected");
    } catch (error) {
      notify(error instanceof Error ? error.message : "The Google listing could not be disconnected");
    }
  }

  function openVisitModal(visitDate = dateKey(selectedDate), startTime = "11:00", truckId = selectedTruckId) {
    const visitDay = new Date(`${visitDate}T12:00:00`).getDay();
    const dayHours = location.operatingHours?.find((slot) => slot.day === visitDay);
    const closingMinutes = dayHours?.enabled ? minutes(dayHours.end) : 1440;
    const endTime = timeFromMinutes(Math.min(closingMinutes, minutes(startTime) + 180));
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
      const optimistic: Visit = { id: Date.now(), truckId: Number(payload.truckId), visitDate: String(payload.visitDate), startTime: String(payload.startTime), endTime: String(payload.endTime), status: String(payload.status), expectedDemand: String(payload.expectedDemand), notes: String(payload.notes ?? ""), outcome: "", outcomeNotes: "" };
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
      const optimistic: Truck = { id: Date.now(), name: String(payload.name), cuisine: String(payload.cuisine), contact: String(payload.contact), phone: String(payload.phone), email: String(payload.email), insuranceExpiry: String(payload.insuranceExpiry), licenseExpiry: String(payload.licenseExpiry), preferredStart: String(payload.preferredStart), preferredEnd: String(payload.preferredEnd), reliability: 0, reliabilityEvents: 0, notes: String(payload.notes ?? ""), color: "#1687ff", availability: payload.availability as DayAvailability[], hasLogo: Boolean(payload.logoData), logoData: String(payload.logoData || ""), logoVersion: String(Date.now()), paymentTypes: String(payload.paymentTypes || "") };
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
          <nav className="legal-links" aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
        </section>
      </main>
    );
  }

  const unlikelyGoogleMatchCount = googleCandidates.filter(
    (candidate) => candidate.matchLevel === "unlikely",
  ).length;
  const visibleGoogleCandidates = googleCandidates.filter(
    (candidate) => showUnlikelyGoogleMatches
      || candidate.matchLevel !== "unlikely",
  );

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
              <article><span className="metric-icon blue">★</span><div><strong>{Math.round(data.trucks.reduce((sum, t) => sum + t.reliability, 0) / Math.max(1, data.trucks.length))}%</strong><p>Avg Reliability</p><small>From recorded outcomes</small></div></article>
            </div>

            <ScheduleBoard visits={dayVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} operatingHours={location.operatingHours} traffic={locationTraffic} trafficLoading={locationTrafficLoading} onSelect={setSelectedTruckId} onUpdateVisit={updateVisit} onAddVisit={openVisitModal} onDeleteVisit={deleteVisit} onRecordOutcome={setOutcomeVisitId} />
            <div className="legend"><span><i className="blue-swatch" />Confirmed</span><span><i className="green-swatch" />Available</span><span><i className="stripe-swatch" />Conflict</span><span><i className="amber-swatch" />Documents expiring</span><span><i className="traffic-swatch" />Typical location traffic</span></div>
          </section>
          <aside className="right-rail">
            <NextScheduledTruck next={nextScheduled} onView={(visitDate) => { setSelectedDate(new Date(`${visitDate}T12:00:00`)); setView("schedule"); }} onSchedule={() => setView("schedule")} />
            <TruckProfile truck={selectedTruck} onView={() => setView("trucks")} />
            <Assistant recommendation={recommendations[0]} selectedDate={selectedDate} onSchedule={(truckId) => openVisitModal(dateKey(selectedDate), "11:00", truckId)} />
          </aside>
        </div>
      )}

      {view === "schedule" && <ScheduleView data={data} location={location} selectedDate={selectedDate} setSelectedDate={setSelectedDate} traffic={locationTraffic} trafficLoading={locationTrafficLoading} onSchedule={() => openVisitModal()} onSelect={setSelectedTruckId} onUpdateVisit={updateVisit} onAddVisit={openVisitModal} onDeleteVisit={deleteVisit} onRecordOutcome={setOutcomeVisitId} />}
      {view === "trucks" && <TrucksView trucks={filteredTrucks} selectedId={selectedTruckId} setSelectedId={setSelectedTruckId} onAdd={() => setModal("truck")} onDelete={setPendingDeleteId} onLogoChange={updateTruckLogo} role={user.role} googleReviews={googleReviews} onLoadGoogleReview={loadGoogleReview} onSearchGooglePlaces={searchGooglePlaces} onUnlinkGooglePlace={unlinkGooglePlace} />}
      {view === "insights" && <Insights data={data} />}
      {view === "location" && <LocationView location={location} onSave={(next) => { setLocation(next); window.localStorage.setItem("food-truck-admin-location", JSON.stringify(next)); void fetch("/api/location", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) }).then((response) => { if (!response.ok) throw new Error(); notify("Location profile updated"); }).catch(() => notify("Location saved locally, but could not be shared")); }} />}

      {modal === "visit" && <Modal title="Schedule a food truck" subtitle="Add a visit and check the calendar before confirming." onClose={() => setModal(null)}><VisitForm trucks={data.trucks} selectedTruckId={visitDraft.truckId} selectedDate={visitDraft.visitDate} startTime={visitDraft.startTime} endTime={visitDraft.endTime} onSubmit={submitVisit} /></Modal>}
      {modal === "truck" && <Modal title="Create truck profile" subtitle="Keep contact, compliance, and scheduling preferences together." onClose={() => setModal(null)}><TruckForm onSubmit={submitTruck} /></Modal>}
      {outcomeVisit && outcomeTruck && ["admin", "manager"].includes(user.role) && <Modal title={`Record outcome for ${outcomeTruck.name}`} subtitle={`${new Date(`${outcomeVisit.visitDate}T12:00:00`).toLocaleDateString()} • ${formatTime(outcomeVisit.startTime)} – ${formatTime(outcomeVisit.endTime)}`} onClose={() => setOutcomeVisitId(null)}><OutcomeForm visit={outcomeVisit} onSubmit={submitVisitOutcome} /></Modal>}
      {googleSearchTruckId !== null && <Modal title={`Match ${data.trucks.find((truck) => truck.id === googleSearchTruckId)?.name || "truck"}`} subtitle="Choose the exact Google business listing. Nothing is saved until you select a match." onClose={() => { if (!googleSearchBusy) setGoogleSearchTruckId(null); }}>
        <div className="google-match-list">
          <form className="google-search-form" onSubmit={(event) => { event.preventDefault(); void searchGooglePlaces(googleSearchTruckId, googleSearchTerms, googleSearchArea); }}>
            <label>
              <span>Business search</span>
              <input value={googleSearchTerms} onChange={(event) => setGoogleSearchTerms(event.target.value)} maxLength={110} placeholder="Exact business name, phone, or other identifying detail" required disabled={googleSearchBusy} />
              <small>Correct the name or add a home city, phone number, or other detail Google recognizes.</small>
            </label>
            <label>
              <span>Search area <em>Optional</em></span>
              <input value={googleSearchArea} onChange={(event) => setGoogleSearchArea(event.target.value)} maxLength={110} placeholder="Different city, ZIP, or address" disabled={googleSearchBusy} />
              <small>Leave blank to search near the store. Enter an area if the truck is based somewhere else.</small>
            </label>
            <button className="primary" type="submit" disabled={googleSearchBusy}>{googleSearchBusy ? "Searching…" : "Search again"}</button>
          </form>
          {googleSearchBusy && !googleCandidates.length && <div className="google-loading">Searching Google Maps…</div>}
          {googleSearchError && <div className="auth-error" role="alert">△ {googleSearchError}</div>}
          {!googleSearchBusy && !googleSearchError && googleSearchQuery && <small>Google searched: {googleSearchQuery}</small>}
          {!googleSearchBusy && !googleSearchError && !googleCandidates.length && <div className="google-empty"><strong>No correct match yet.</strong><p>Change the business search or enter the truck&apos;s home city or ZIP above, then search again.</p></div>}
          {googleAiAssisted && <div className="google-ai-note">
            <span><strong>AI-assisted matching</strong><small>Likely matches are shown first. AI can be wrong, so nothing is connected automatically.</small></span>
            {unlikelyGoogleMatchCount > 0 && <button className="text-button" type="button" onClick={() => setShowUnlikelyGoogleMatches((current) => !current)}>{showUnlikelyGoogleMatches ? "Hide" : "Show"} {unlikelyGoogleMatchCount} unlikely {unlikelyGoogleMatchCount === 1 ? "match" : "matches"}</button>}
          </div>}
          {!googleSearchBusy && googleAiAssisted && !visibleGoogleCandidates.length && unlikelyGoogleMatchCount > 0 && <div className="google-empty"><strong>AI did not find a plausible match.</strong><p>Change the search above or show the unlikely matches to review every Google result yourself.</p></div>}
          {visibleGoogleCandidates.map((candidate) => <article key={candidate.placeId} className={`google-candidate google-candidate-${candidate.matchLevel || "unranked"}`}>
            <div>
              <div className="google-candidate-title"><strong>{candidate.name || "Unnamed Google listing"}</strong>{googleAiAssisted && candidate.matchLevel && <span className={`google-match-badge ${candidate.matchLevel}`}>{candidate.matchLevel === "likely" ? "AI likely match" : candidate.matchLevel === "possible" ? "AI possible" : "AI unlikely"}</span>}</div>
              <p>{candidate.address || "Address not shown"}</p>
              <small>{candidate.rating === null ? "No Google rating" : `★ ${candidate.rating.toFixed(1)} from ${candidate.ratingCount.toLocaleString()} ratings`}</small>
              {googleAiAssisted && candidate.matchReason && <small className="google-match-reason">{candidate.matchReason}</small>}
            </div>
            <div className="google-candidate-actions">
              {candidate.mapsUri && <a className="secondary" href={candidate.mapsUri} target="_blank" rel="noreferrer">Check on Maps ↗</a>}
              <button className="primary" disabled={googleSearchBusy} onClick={() => void linkGooglePlace(googleSearchTruckId, candidate.placeId)}>Use this listing</button>
            </div>
          </article>)}
          <div className="google-attribution" translate="no">Google Maps</div>
        </div>
      </Modal>}
      {pendingDeleteId !== null && <DeleteTruckModal truck={data.trucks.find((truck) => truck.id === pendingDeleteId)} visitCount={data.visits.filter((visit) => visit.truckId === pendingDeleteId).length} onCancel={() => setPendingDeleteId(null)} onConfirm={() => deleteTruck(pendingDeleteId)} />}
      <footer className="app-legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></footer>
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

function trafficLinePath(values: number[]) {
  const points = values.map((value, index) => ({
    x: (index / Math.max(1, values.length - 1)) * 1000,
    y: 66 - (Math.max(0, Math.min(100, value)) / 100) * 52,
  }));
  if (!points.length) return "";
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const middle = (previous.x + point.x) / 2;
    return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function TrafficCurveRow({
  traffic,
  loading,
  timelineStart,
  timelineEnd,
}: {
  traffic: LocationTraffic | null;
  loading: boolean;
  timelineStart: number;
  timelineEnd: number;
}) {
  if (!traffic && !loading) return null;
  // traffic-store-hours-v1
  const trafficStartHour = Math.max(0, Math.min(23, Math.floor(timelineStart / 60)));
  const trafficEndHour = Math.max(trafficStartHour, Math.min(23, Math.ceil(timelineEnd / 60)));
  const values = Array.from(
    { length: trafficEndHour - trafficStartHour + 1 },
    (_, index) => traffic?.values?.[trafficStartHour + index] ?? 0,
  );
  const linePath = traffic?.available ? trafficLinePath(values) : "";
  const areaPath = linePath
    ? `M 0 68 L ${linePath.slice(1)} L 1000 68 Z`
    : "";
  const peak = Math.max(...values);
  const timelineSpan = Math.max(60, timelineEnd - timelineStart);
  const trafficPlotStart = timelineStart;
  const trafficPlotEnd = timelineEnd;
  const trafficPlotLeft = ((trafficPlotStart - timelineStart) / timelineSpan) * 100;
  const trafficPlotWidth = Math.max(0, ((trafficPlotEnd - trafficPlotStart) / timelineSpan) * 100);
  const sourceLabel = traffic?.source === "previous"
    ? "Previous successful week used"
    : traffic?.source === "next"
      ? "Following successful week used"
      : traffic?.source === "interpolated"
        ? "Previous + following weeks averaged"
        : "Latest weekly snapshot";
  const fetchedLabel = traffic?.fetchedAt
    ? new Date(traffic.fetchedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
    : "";

  return <div className="traffic-row">
    <div className="traffic-label"><span aria-hidden="true">⌁</span><div><strong>LOCATION TRAFFIC</strong><small>Typical activity</small></div></div>
    <div className={`traffic-chart ${traffic?.available ? "available" : ""}`}>
      {loading && !traffic?.available
        ? <span className="traffic-message">Loading typical traffic…</span>
        : traffic?.available
          ? <>
            <svg style={{ left: `${trafficPlotLeft}%`, right: "auto", width: `${trafficPlotWidth}%` }} viewBox="0 0 1000 72" preserveAspectRatio="none" role="img" aria-label={`Estimated typical location traffic from ${formatTime(timeFromMinutes(timelineStart))} to ${formatTime(timeFromMinutes(timelineEnd))}; peak relative activity ${peak} out of 100`}>
              <defs>
                <linearGradient id="traffic-area-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a8d86e" stopOpacity=".34" />
                  <stop offset="100%" stopColor="#a8d86e" stopOpacity=".02" />
                </linearGradient>
              </defs>
              <path className="traffic-area" d={areaPath} />
              <path className="traffic-line" d={linePath} />
            </svg>
            <span className="traffic-peak">Peak {peak}/100</span>
            <small>{sourceLabel}{fetchedLabel ? ` • checked ${fetchedLabel}` : ""} • Typical Google Maps activity via Outscraper</small>
          </>
          : <span className="traffic-message">{traffic?.message || "Typical traffic is not available yet."}</span>}
    </div>
  </div>;
}

function ScheduleBoard({ visits, trucks, overlaps, visitDate, operatingHours, traffic, trafficLoading, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit, onRecordOutcome }: { visits: Visit[]; trucks: Truck[]; overlaps: Visit[][]; visitDate: string; operatingHours: DayAvailability[]; traffic: LocationTraffic | null; trafficLoading: boolean; onSelect: (id: number) => void; onUpdateVisit: (visitId: number, startTime: string, endTime: string) => void; onAddVisit: (visitDate: string, startTime: string, truckId?: number) => void; onDeleteVisit: (visitId: number) => void; onRecordOutcome: (visitId: number) => void }) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [contextMenu, setContextMenu] = useState<ScheduleContextMenu | null>(null);
  const [now, setNow] = useState(() => new Date());
  const visitDay = new Date(`${visitDate}T12:00:00`).getDay();
  const dayHours = operatingHours?.find((slot) => slot.day === visitDay);
  const timelineStart = dayHours?.enabled ? minutes(dayHours.start) : 360;
  const timelineEnd = dayHours?.enabled && minutes(dayHours.end) > timelineStart ? minutes(dayHours.end) : 1320;
  const timelineSpan = timelineEnd - timelineStart;
  const timelineColumns = Math.max(1, Math.ceil(timelineSpan / 60));
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

  return <div className="schedule-board" style={{ "--timeline-columns": timelineColumns } as React.CSSProperties}>
    <div className="schedule-help"><span>Drag a shift to move it</span><span>Drag either edge to resize</span><span>15-minute increments</span></div>
    <div className="time-head" style={{ gridTemplateColumns: `225px repeat(${timelineColumns}, minmax(58px, 1fr))` }}><strong>TRUCKS</strong>{Array.from({ length: timelineColumns }, (_, i) => <span key={i}>{formatTime(timeFromMinutes(timelineStart + i * 60)).replace(":00", "")}</span>)}</div>
    <TrafficCurveRow traffic={traffic} loading={trafficLoading} timelineStart={timelineStart} timelineEnd={timelineEnd} />
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
          <small>{formatTime(timeFromMinutes(start))} – {formatTime(timeFromMinutes(end))}</small><strong>{truck.name}</strong><button className={`outcome-action ${visit.outcome ? "recorded" : ""}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRecordOutcome(visit.id); }} aria-label={`Record outcome for ${truck.name}`}>{visit.outcome || visit.status}</button>
          {visit.id > 0 && <button className="resize-handle end" aria-label={`Change ${truck.name} end time`} onPointerDown={(event) => beginDrag(event, visit, "end")} />}
        </div></div>
      </div>;
    })}
    {contextMenu && <div className="context-menu-layer" onMouseDown={() => setContextMenu(null)} onContextMenu={(event) => { event.preventDefault(); setContextMenu(null); }}>
      <div className="schedule-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onMouseDown={(event) => event.stopPropagation()}>
        {contextMenu.kind === "visit" ? <><small>{contextMenu.truck.name}</small><strong>{formatTime(contextMenu.visit.startTime)} – {formatTime(contextMenu.visit.endTime)}</strong><button onClick={() => { setContextMenu(null); onRecordOutcome(contextMenu.visit.id); }}>✓ Record outcome</button><button className="delete-shift-action" onClick={() => { setContextMenu(null); onDeleteVisit(contextMenu.visit.id); }}>× Delete shift</button></> : <><small>OPEN TIME</small><strong>{formatTime(contextMenu.time)}</strong><button onClick={() => { setContextMenu(null); onAddVisit(visitDate, contextMenu.time, contextMenu.truckId); }}>＋ Add shift here</button></>}
      </div>
    </div>}
  </div>;
}

function NextScheduledTruck({ next, onView, onSchedule }: { next: { visit: Visit; startsAt: Date; truck: Truck; daysAway: number } | null; onView: (visitDate: string) => void; onSchedule: () => void }) {
  const when = next?.daysAway === 0 ? "Today" : next?.daysAway === 1 ? "Tomorrow" : next ? `In ${next.daysAway} days` : "";
  return <article className="rail-card next-truck-card">
    <div className="card-title"><h2>Next Scheduled Truck</h2><span>▰</span></div>
    {next ? <>
      <div className="profile-head"><TruckAvatar truck={next.truck} large /><div><h3>{next.truck.name}</h3><p>{next.truck.cuisine}</p><strong className="rating">{when}</strong></div></div>
      <dl><div><dt>Date</dt><dd>{next.startsAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</dd></div><div><dt>Time</dt><dd>{formatTime(next.visit.startTime)} – {formatTime(next.visit.endTime)}</dd></div><div><dt>Status</dt><dd>{next.visit.status}</dd></div></dl>
      <button className="primary wide" type="button" onClick={() => onView(next.visit.visitDate)}>View on Schedule →</button>
    </> : <>
      <div className="ai-box"><h3>No upcoming truck scheduled</h3><p>There are no future, non-cancelled visits anywhere on the schedule.</p></div>
      <button className="secondary wide" type="button" onClick={onSchedule}>Open Schedule</button>
    </>}
  </article>;
}

function TruckProfile({ truck, onView }: { truck: Truck; onView: () => void }) {
  if (!truck) return null;
  return <article className="rail-card profile-card">
    <div className="card-title"><h2>Truck Profile</h2><span>⌃</span></div>
    <div className="profile-head"><TruckAvatar truck={truck} large /><div><h3>{truck.name}</h3><p>{truck.cuisine}</p><strong className="rating">★ {truck.reliability}% reliability</strong></div></div>
    <dl><div><dt>Contact</dt><dd>{truck.contact}</dd></div><div><dt>Phone</dt><dd>{truck.phone}</dd></div><div><dt>Email</dt><dd>{truck.email}</dd></div><div><dt>Payments</dt><dd>{truck.paymentTypes || "Not provided"}</dd></div><div><dt>Insurance</dt><dd>{expiryLabel(truck.insuranceExpiry)}</dd></div><div><dt>Preferred hours</dt><dd>{formatTime(truck.preferredStart)} – {formatTime(truck.preferredEnd)}</dd></div><div><dt>Reliability</dt><dd className="lime">{truck.reliability}% from {truck.reliabilityEvents ?? 0} scored {(truck.reliabilityEvents ?? 0) === 1 ? "visit" : "visits"}</dd></div></dl>
    <button className="secondary wide" onClick={onView}>View Full Profile</button>
  </article>;
}

function Assistant({ recommendation, selectedDate, onSchedule }: { recommendation?: { truck: Truck; compliant: boolean; distinct: boolean; score: number }; selectedDate: Date; onSchedule: (id: number) => void }) {
  return <article className="rail-card assistant">
    <div className="card-title"><h2>AI Schedule Assistant <em>BETA</em></h2><span>⌃</span></div>
    <div className="ai-box">{recommendation ? <><p>✦ Best available fit for {selectedDate.toLocaleDateString("en-US", { weekday: "long" })}:</p><h3>{recommendation.truck.name}</h3><small>Based on weekly availability, schedule fit, compliance, cuisine variety, and reliability.</small><ul><li>✓ Available that day</li><li>✓ {recommendation.distinct ? "No cuisine overlap" : "Complements existing lineup"}</li><li>✓ {recommendation.truck.reliability}% reliability from {recommendation.truck.reliabilityEvents ?? 0} scored visits</li><li>✓ {recommendation.compliant ? "Documents current" : "Review documents first"}</li></ul><button className="primary wide" onClick={() => onSchedule(recommendation.truck.id)}>Schedule this truck →</button></> : <><h3>No available match</h3><p>Every available truck is already scheduled, or no truck is marked available that day.</p></>}</div>
  </article>;
}

function ScheduleView({ data, location, selectedDate, setSelectedDate, traffic, trafficLoading, onSchedule, onSelect, onUpdateVisit, onAddVisit, onDeleteVisit, onRecordOutcome }: { data: AppData; location: LocationProfile; selectedDate: Date; setSelectedDate: (d: Date) => void; traffic: LocationTraffic | null; trafficLoading: boolean; onSchedule: () => void; onSelect: (id: number) => void; onUpdateVisit: (visitId: number, startTime: string, endTime: string) => void; onAddVisit: (visitDate: string, startTime: string, truckId?: number) => void; onDeleteVisit: (visitId: number) => void; onRecordOutcome: (visitId: number) => void }) {
  const [mode, setMode] = useState<"gantt" | "calendar">("gantt");
  const configuredWeekStart = Number.isInteger(location.weekStartsOn) ? Number(location.weekStartsOn) : 6;
  const weekOffset = (selectedDate.getDay() - configuredWeekStart + 7) % 7;
  const weekStart = addDays(selectedDate, -weekOffset);
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
    {mode === "gantt" ? <ScheduleBoard visits={selectedVisits} trucks={data.trucks} overlaps={overlaps} visitDate={dateKey(selectedDate)} operatingHours={location.operatingHours} traffic={traffic} trafficLoading={trafficLoading} onSelect={onSelect} onUpdateVisit={onUpdateVisit} onAddVisit={onAddVisit} onDeleteVisit={onDeleteVisit} onRecordOutcome={onRecordOutcome} /> : <div className="calendar-grid">{days.map((date) => { const visits = data.visits.filter((v) => v.visitDate === dateKey(date)); return <button key={dateKey(date)} className={`day-card ${dateKey(date) === dateKey(selectedDate) ? "selected" : ""}`} onClick={() => setSelectedDate(date)}><span>{date.toLocaleDateString("en-US", { weekday: "short" })}</span><strong>{date.getDate()}</strong><div>{visits.map((visit) => { const truck = data.trucks.find((t) => t.id === visit.truckId)!; return <i key={visit.id} style={{ borderColor: truck.color }} onClick={(event) => { event.stopPropagation(); onRecordOutcome(visit.id); }}>{truck.name}<small>{formatTime(visit.startTime)} – {formatTime(visit.endTime)} • {visit.outcome || visit.status}</small></i>; })}{!visits.length && <em>Open day</em>}</div></button>; })}</div>}
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

function OnlineReviewCard({
  truck,
  role,
  state,
  onLoad,
  onSearch,
  onUnlink,
}: {
  truck: Truck;
  role: string;
  state?: GoogleReviewState;
  onLoad: () => void;
  onSearch: () => void;
  onUnlink: () => void;
}) {
  const canEdit = ["admin", "manager"].includes(role);
  const profile = state?.profile;
  return <section className="google-review-card">
    <div className="google-review-heading">
      <div><p className="eyebrow">ONLINE REPUTATION</p><h4>Google rating</h4></div>
      <span className="google-attribution" translate="no">Google Maps</span>
    </div>
    {!state && <>
      <p>Load this truck&apos;s live Google rating only when you need it. This controls API use and avoids showing stale information.</p>
      <button className="secondary" onClick={onLoad}>Load live Google rating</button>
    </>}
    {state?.loading && <div className="google-loading">Checking Google Maps…</div>}
    {state?.error && !state.loading && <>
      <div className="auth-error" role="alert">△ {state.error}</div>
      <button className="secondary" onClick={onLoad}>Try again</button>
    </>}
    {state && !state.loading && !state.error && state.configured === false && <>
      <div className="google-empty"><strong>Google Places is not connected yet.</strong><p>The truck profile and every scheduling feature still work normally. An administrator can add the key later.</p></div>
      {state.linked && <small>The previously selected Google listing remains safely linked.</small>}
    </>}
    {state && !state.loading && !state.error && state.configured && !state.linked && <>
      <div className="google-empty"><strong>No Google listing selected.</strong><p>Match this truck to its public business listing before loading a rating.</p></div>
      {canEdit && <button className="primary" onClick={onSearch}>Find Google listing</button>}
    </>}
    {state && !state.loading && !state.error && profile && <>
      <div className="google-score">
        <strong>{profile.rating === null ? "—" : profile.rating.toFixed(1)}</strong>
        <span><b aria-hidden="true">★★★★★</b><small>{profile.ratingCount.toLocaleString()} Google {profile.ratingCount === 1 ? "rating" : "ratings"}</small></span>
      </div>
      <div className="google-place-name"><strong>{profile.name || truck.name}</strong><p>{profile.address || "Address not shown by Google"}</p></div>
      {profile.summary
        ? <div className="google-summary"><strong>Review summary</strong><blockquote><p>{profile.summary}</p><footer>{profile.summaryDisclosure}</footer></blockquote></div>
        : <p className="google-no-summary">Google does not currently provide an AI review summary for this listing.</p>}
      <div className="google-source-links">
        {profile.summary && <a href="https://support.google.com/local-listings/answer/9851099" target="_blank" rel="noreferrer">About this summary ↗</a>}
        {(profile.summaryReviewsUri || profile.mapsUri) && <a href={profile.summaryReviewsUri || profile.mapsUri} target="_blank" rel="noreferrer">See reviews ↗</a>}
        {profile.websiteUri && <a href={profile.websiteUri} target="_blank" rel="noreferrer">Business website ↗</a>}
        {profile.summaryFlagUri && <a href={profile.summaryFlagUri} target="_blank" rel="noreferrer">Report summary ↗</a>}
      </div>
      {profile.summaryFlagUri && <small className="google-report-note">To request removal of summary content under applicable law, use Report summary.</small>}
      <div className="google-review-actions">
        <button className="secondary" onClick={onLoad}>Refresh live rating</button>
        {canEdit && <button className="secondary" onClick={onSearch}>Change match</button>}
        {canEdit && <button className="text-button danger-text" onClick={onUnlink}>Disconnect</button>}
      </div>
    </>}
    <small className="google-usage-note">Live lookup • App safety limit: {state?.dailyLimit || 20} Google requests per day • Only the Place ID is stored</small>
  </section>;
}

function TrucksView({
  trucks,
  selectedId,
  setSelectedId,
  onAdd,
  onDelete,
  onLogoChange,
  role,
  googleReviews,
  onLoadGoogleReview,
  onSearchGooglePlaces,
  onUnlinkGooglePlace,
}: {
  trucks: Truck[];
  selectedId: number;
  setSelectedId: (id: number) => void;
  onAdd: () => void;
  onDelete: (id: number) => void;
  onLogoChange: (truckId: number, file: File | null) => Promise<void>;
  role: string;
  googleReviews: Record<number, GoogleReviewState>;
  onLoadGoogleReview: (truckId: number) => void;
  onSearchGooglePlaces: (truckId: number) => void;
  onUnlinkGooglePlace: (truckId: number) => void;
}) {
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
        <dl><div><dt>Primary contact</dt><dd>{selected.contact}</dd></div><div><dt>Phone</dt><dd>{selected.phone}</dd></div><div><dt>Email</dt><dd>{selected.email}</dd></div><div><dt>Accepted payments</dt><dd>{selected.paymentTypes || "Not provided"}</dd></div><div><dt>Insurance expiration</dt><dd>{selected.insuranceExpiry || "Not provided"}</dd></div><div><dt>Food license expiration</dt><dd>{selected.licenseExpiry || "Not provided"}</dd></div><div><dt>Reliability</dt><dd className="lime">{selected.reliability}% from {selected.reliabilityEvents ?? 0} scored {(selected.reliabilityEvents ?? 0) === 1 ? "visit" : "visits"}</dd></div></dl>
        <h4>Weekly availability</h4>
        <div className="availability-summary">{withAvailability(selected).availability.map((slot) => <div className={slot.enabled ? "available-day" : "closed-day"} key={slot.day}><strong>{weekDays.find((item) => item.day === slot.day)?.short}</strong><span>{slot.enabled ? `${formatTime(slot.start)} – ${formatTime(slot.end)}` : "Unavailable"}</span></div>)}</div>
        <h4>Operations notes</h4><p>{selected.notes || "No notes yet."}</p>
        <OnlineReviewCard truck={selected} role={role} state={googleReviews[selected.id]} onLoad={() => void onLoadGoogleReview(selected.id)} onSearch={() => void onSearchGooglePlaces(selected.id)} onUnlink={() => void onUnlinkGooglePlace(selected.id)} />
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
        weekStartsOn: Number(form.get("weekStartsOn") || 6),
        closedDates: String(values.closedDates || "").split(/\r?\n|,/).map((date) => date.trim()).filter(Boolean),
      });
      setEditing(false);
    }}>
      <label>Store name<input name="storeName" defaultValue={location.storeName} required /></label><label>Store number<input name="storeNumber" defaultValue={location.storeNumber} required /></label>
      <label className="full">Street address<input name="street" defaultValue={location.street} required /></label><label>City<input name="city" defaultValue={location.city} required /></label><label>State<input name="state" defaultValue={location.state} required /></label><label>ZIP<input name="zip" defaultValue={location.zip} required /></label><label>Store phone<input name="phone" defaultValue={location.phone} /></label><label>Scheduling time zone<input name="timezone" defaultValue={location.timezone} required /></label><label>Week Starts On<select name="weekStartsOn" defaultValue={String(Number.isInteger(location.weekStartsOn) ? location.weekStartsOn : 6)}>{weekDays.map((day) => <option value={day.day} key={day.day}>{day.label}</option>)}</select></label>
      <fieldset className="full availability-editor"><legend>Hours of operation</legend><p>Turn days on or off and set the opening and closing times.</p>{weekDays.map(({ day, short, label }) => { const slot = hours.find((item) => item.day === day); return <div className="availability-row" key={day}><label className="day-check"><input type="checkbox" name="openDays" value={day} defaultChecked={slot?.enabled} /><span>{short}</span><small>{label}</small></label><label><span>Open</span><input type="time" name={`open_${day}`} defaultValue={slot?.start || "06:00"} /></label><label><span>Close</span><input type="time" name={`close_${day}`} defaultValue={slot?.end || "22:00"} /></label></div>; })}</fieldset>
      <label className="full">Store closure dates <span className="optional-label">One per line</span><textarea name="closedDates" defaultValue={(location.closedDates || []).join("\n")} placeholder={"2026-11-26\n2026-12-25"} /></label>
      <label className="full">Site notes for vendors<textarea name="notes" defaultValue={location.notes} placeholder="Where to park, available hookups, and who to check in with…" /></label>
      <div className="modal-actions full"><button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button><button className="primary" type="submit">Save location profile</button></div>
    </form></article></section>;
  }
  const addressIncomplete = ![location.street, location.city, location.state, location.zip].every((value) => value.trim());
  return <section className="content-page"><div className="section-heading"><div><p className="eyebrow">STORE PROFILE</p><h1>Location</h1><p>The address, operating hours, and arrival details food-truck vendors need.</p></div><button className="primary" onClick={() => setEditing(true)}>✎ Edit details</button></div>{addressIncomplete && <div className="location-warning">△ <span><strong>Store address is incomplete</strong><small>Add the street, city, state, and ZIP before searching for nearby trucks.</small></span></div>}<article className="location-card"><div className="location-head"><span>◧</span><div><h2>{location.storeName}</h2><p>Store {location.storeNumber}</p></div></div><dl><div><dt>Address</dt><dd>{address || "Not provided"}</dd></div><div><dt>Phone</dt><dd>{location.phone || "Not provided"}</dd></div><div><dt>Time zone</dt><dd>{location.timezone}</dd></div><div><dt>Week Starts On</dt><dd>{weekDays.find((day) => day.day === (Number.isInteger(location.weekStartsOn) ? location.weekStartsOn : 6))?.label || "Saturday"}</dd></div></dl><h4>Hours of operation</h4><div className="availability-summary">{hours.map((slot) => <div className={slot.enabled ? "available-day" : "closed-day"} key={slot.day}><strong>{weekDays.find((item) => item.day === slot.day)?.short}</strong><span>{slot.enabled ? `${formatTime(slot.start)} – ${formatTime(slot.end)}` : "Closed"}</span></div>)}</div><h4>Scheduled closures</h4>{location.closedDates?.length ? <div className="closure-list">{location.closedDates.map((date) => <span key={date}>{new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>)}</div> : <p>No closure dates programmed.</p>}<h4>Site notes for vendors</h4><p>{location.notes || "No arrival notes yet."}</p></article></section>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><button className="close" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">FOOD TRUCK ADMIN</p><h2>{title}</h2><p>{subtitle}</p>{children}</section></div>;
}

function DeleteTruckModal({ truck, visitCount, onCancel, onConfirm }: { truck?: Truck; visitCount: number; onCancel: () => void; onConfirm: () => void }) {
  if (!truck) return null;
  return <div className="modal-backdrop"><section className="modal delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-truck-title"><p className="eyebrow">PERMANENT ACTION</p><h2 id="delete-truck-title">Delete {truck.name}?</h2><p>This will also remove {visitCount} scheduled {visitCount === 1 ? "visit" : "visits"} connected to this truck. This cannot be undone.</p><div className="modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="danger-button solid" onClick={onConfirm}>Delete Truck</button></div></section></div>;
}

function OutcomeForm({ visit, onSubmit }: { visit: Visit; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <form onSubmit={onSubmit} className="form-grid">
    <label className="full">Visit outcome
      <select name="outcome" defaultValue={visit.outcome}>
        <option value="">Not recorded</option>
        {VISIT_OUTCOMES.map((outcome) => <option value={outcome.value} key={outcome.value}>{outcome.label}</option>)}
      </select>
    </label>
    <div className="full outcome-score-guide">
      <strong>How reliability is averaged</strong>
      <span>On time: 100%</span>
      <span>Late: 75%</span>
      <span>No-show: 0%</span>
      <span>Truck cancellation: 0%</span>
      <small>Store and weather cancellations do not affect the average.</small>
    </div>
    <label className="full">Outcome notes <span className="optional-label">Optional</span>
      <textarea name="outcomeNotes" defaultValue={visit.outcomeNotes} maxLength={2000} placeholder="Arrival details, cancellation reason, or follow-up needed…" />
    </label>
    <button className="primary full" type="submit">Save outcome and recalculate</button>
  </form>;
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
