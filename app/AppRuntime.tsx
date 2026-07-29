"use client";

import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

type RuntimeProps = {
  children: ReactNode;
};

type RuntimeErrorState = {
  failed: boolean;
};

type RuntimeData = {
  trucks?: Array<{ id?: unknown }>;
  visits?: Array<{ id?: unknown; truckId?: unknown }>;
};

type TrafficSeries = {
  values: number[];
  low: number;
  high: number;
  enhancedPath: string;
};

const TRAFFIC_START_MINUTES = 10 * 60;
const TRAFFIC_END_MINUTES = 20 * 60;
const TRAFFIC_HOURS = 10;
const SVG_WIDTH = 1000;
const SOURCE_TOP = 14;
const SOURCE_BOTTOM = 66;
const DISPLAY_TOP = 10;
const DISPLAY_BOTTOM = 66;
const SAMPLES_PER_HOUR = 12;

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

class RuntimeErrorBoundary extends Component<RuntimeProps, RuntimeErrorState> {
  state: RuntimeErrorState = { failed: false };

  static getDerivedStateFromError(): RuntimeErrorState {
    return { failed: true };
  }

  componentDidCatch(error: Error, details: ErrorInfo) {
    console.error("Food Truck Admin render error", error, details.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#071a2f", color: "#dcecff" }}>
      <section style={{ width: "min(520px, 100%)", padding: 24, border: "1px solid #31516e", borderRadius: 12, background: "#0b2440" }}>
        <h1 style={{ margin: "0 0 10px", fontSize: 24 }}>That schedule view hit a bad record</h1>
        <p style={{ margin: "0 0 18px", color: "#a9bfd4" }}>The page was stopped before it could turn into a blank blue screen. Reload after the automatic data check finishes.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ border: 0, borderRadius: 8, padding: "10px 16px", background: "#9ce13c", color: "#112808", fontWeight: 800, cursor: "pointer" }}>Reload Food Truck Admin</button>
      </section>
    </main>;
  }
}

function pointAtX(path: SVGPathElement, targetX: number) {
  const totalLength = path.getTotalLength();
  let low = 0;
  let high = totalLength;

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const distance = (low + high) / 2;
    const point = path.getPointAtLength(distance);
    if (point.x < targetX) low = distance;
    else high = distance;
  }

  return path.getPointAtLength((low + high) / 2);
}

function readHourlyValues(path: SVGPathElement) {
  return Array.from({ length: TRAFFIC_HOURS + 1 }, (_, index) => {
    const point = pointAtX(path, (index / TRAFFIC_HOURS) * SVG_WIDTH);
    const percentage = ((SOURCE_BOTTOM - point.y) / (SOURCE_BOTTOM - SOURCE_TOP)) * 100;
    return Math.round(clamp(percentage, 0, 100));
  });
}

function displayScale(values: number[]) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const padding = Math.max(4, range * 0.2);
  let low = clamp(minimum - padding, 0, 100);
  let high = clamp(maximum + padding, 0, 100);

  if (high - low < 20) {
    const midpoint = (minimum + maximum) / 2;
    low = midpoint - 10;
    high = midpoint + 10;
    if (low < 0) {
      high -= low;
      low = 0;
    }
    if (high > 100) {
      low -= high - 100;
      high = 100;
    }
  }

  return { low: clamp(low, 0, 100), high: clamp(high, 0, 100) };
}

function interpolatedValue(values: number[], hourPosition: number) {
  const bounded = clamp(hourPosition, 0, TRAFFIC_HOURS);
  const leftIndex = Math.floor(bounded);
  const rightIndex = Math.min(TRAFFIC_HOURS, leftIndex + 1);
  const progress = bounded - leftIndex;
  const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;
  return values[leftIndex] + (values[rightIndex] - values[leftIndex]) * easedProgress;
}

function yForValue(value: number, low: number, high: number) {
  const fraction = (value - low) / Math.max(1, high - low);
  return DISPLAY_BOTTOM - clamp(fraction, 0, 1) * (DISPLAY_BOTTOM - DISPLAY_TOP);
}

function detailedPath(values: number[], low: number, high: number) {
  const sampleCount = TRAFFIC_HOURS * SAMPLES_PER_HOUR;
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const hourPosition = (index / sampleCount) * TRAFFIC_HOURS;
    const x = (hourPosition / TRAFFIC_HOURS) * SVG_WIDTH;
    const y = yForValue(interpolatedValue(values, hourPosition), low, high);
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function formatTime(totalMinutes: number) {
  const rounded = Math.round(totalMinutes);
  const hour24 = Math.floor(rounded / 60) % 24;
  const minute = rounded % 60;
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}

function useTrafficHover(tooltipRef: React.RefObject<HTMLDivElement | null>) {
  const seriesByChart = useRef(new WeakMap<HTMLElement, TrafficSeries>());

  useEffect(() => {
    let animationFrame = 0;
    let latestEvent: PointerEvent | null = null;

    function hideTooltip() {
      const tooltip = tooltipRef.current;
      if (tooltip) tooltip.style.display = "none";
    }

    function ensureSeries(chart: HTMLElement) {
      const svg = chart.querySelector<SVGSVGElement>("svg");
      const line = svg?.querySelector<SVGPathElement>("path.traffic-line");
      const area = svg?.querySelector<SVGPathElement>("path.traffic-area");
      if (!svg || !line) return null;

      const currentPath = line.getAttribute("d") || "";
      const existing = seriesByChart.current.get(chart);
      if (existing && currentPath === existing.enhancedPath) return existing;
      if (!currentPath) return null;

      let values: number[];
      try {
        values = readHourlyValues(line);
      } catch {
        return null;
      }

      const { low, high } = displayScale(values);
      const enhancedPath = detailedPath(values, low, high);
      line.setAttribute("d", enhancedPath);
      if (area) area.setAttribute("d", `M 0 68 L ${enhancedPath.slice(1)} L 1000 68 Z`);

      const label = chart.closest(".traffic-row")?.querySelector<HTMLElement>(".traffic-label small");
      if (label) label.textContent = "Relative weekly activity";
      const footer = Array.from(chart.children).find((element) => element.tagName === "SMALL") as HTMLElement | undefined;
      if (footer && !footer.dataset.hoverExplanation) {
        footer.dataset.hoverExplanation = "true";
        footer.textContent = `${footer.textContent || "Typical activity"} • Hover for time and value • 100 = weekly peak`;
      }

      const series = { values, low, high, enhancedPath };
      seriesByChart.current.set(chart, series);
      return series;
    }

    function updateTooltip() {
      animationFrame = 0;
      const event = latestEvent;
      const tooltip = tooltipRef.current;
      if (!event || !tooltip || !(event.target instanceof Element)) return;

      const chart = event.target.closest<HTMLElement>(".traffic-chart.available");
      if (!chart) {
        hideTooltip();
        return;
      }

      const series = ensureSeries(chart);
      const rect = chart.getBoundingClientRect();
      if (!series || rect.width <= 0) {
        hideTooltip();
        return;
      }

      const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const hourPosition = fraction * TRAFFIC_HOURS;
      const value = interpolatedValue(series.values, hourPosition);
      const time = TRAFFIC_START_MINUTES + fraction * (TRAFFIC_END_MINUTES - TRAFFIC_START_MINUTES);
      const left = clamp(event.clientX, 76, window.innerWidth - 76);
      const placeBelow = event.clientY < 70;

      tooltip.textContent = `${formatTime(time)} • ≈${Math.round(value)}/100`;
      tooltip.style.display = "block";
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${event.clientY}px`;
      tooltip.style.transform = placeBelow
        ? "translate(-50%, 14px)"
        : "translate(-50%, calc(-100% - 14px))";
    }

    function handlePointerMove(event: PointerEvent) {
      latestEvent = event;
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateTooltip);
    }

    function handlePointerLeave() {
      latestEvent = null;
      hideTooltip();
    }

    document.addEventListener("pointermove", handlePointerMove, { passive: true });
    document.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("blur", handlePointerLeave);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("blur", handlePointerLeave);
    };
  }, [tooltipRef]);
}

export default function AppRuntime({ children }: RuntimeProps) {
  const [ready, setReady] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  useTrafficHover(tooltipRef);

  useEffect(() => {
    let active = true;

    async function repairImpossibleVisits() {
      try {
        const response = await fetch("/api/data", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as RuntimeData;
        const truckIds = new Set(
          (data.trucks || [])
            .map((truck) => finiteNumber(truck.id))
            .filter((id): id is number => id !== null),
        );
        const orphanVisitIds = (data.visits || [])
          .filter((visit) => {
            const truckId = finiteNumber(visit.truckId);
            return truckId !== null && !truckIds.has(truckId);
          })
          .map((visit) => finiteNumber(visit.id))
          .filter((id): id is number => id !== null && id > 0);

        let repaired = 0;
        for (const visitId of orphanVisitIds) {
          const deleteResponse = await fetch(`/api/data?visitId=${visitId}`, { method: "DELETE" });
          if (deleteResponse.ok) repaired += 1;
        }

        if (repaired > 0) {
          window.location.reload();
          return;
        }
      } catch (error) {
        console.warn("Schedule integrity check could not run", error);
      } finally {
        if (active) setReady(true);
      }
    }

    void repairImpossibleVisits();
    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#071a2f", color: "#9fb5ca", fontSize: 12 }}>Checking schedule data…</main>;
  }

  return <RuntimeErrorBoundary>
    {children}
    <div
      ref={tooltipRef}
      role="tooltip"
      style={{
        position: "fixed",
        zIndex: 10000,
        display: "none",
        pointerEvents: "none",
        padding: "6px 9px",
        border: "1px solid #668c40",
        borderRadius: 7,
        background: "rgba(15, 38, 25, .97)",
        color: "#ddffb7",
        fontSize: 10,
        fontWeight: 800,
        whiteSpace: "nowrap",
        boxShadow: "0 5px 16px rgba(0, 0, 0, .5)",
      }}
    />
  </RuntimeErrorBoundary>;
}
