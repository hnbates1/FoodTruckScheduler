"use client";

import { useEffect } from "react";

const START_MINUTES = 10 * 60;
const END_MINUTES = 20 * 60;
const HOUR_COUNT = 10;
const SVG_WIDTH = 1000;
const SOURCE_TOP = 14;
const SOURCE_BOTTOM = 66;
const DISPLAY_TOP = 12;
const DISPLAY_BOTTOM = 66;
const SAMPLES_PER_HOUR = 12;

type TrafficScale = {
  low: number;
  high: number;
};

type EnhancedChart = {
  values: number[];
  scale: TrafficScale;
  tooltip: HTMLDivElement;
  generatedLine: string;
  cleanup: () => void;
};

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function pointAtX(path: SVGPathElement, targetX: number) {
  const totalLength = path.getTotalLength();
  let low = 0;
  let high = totalLength;
  let point = path.getPointAtLength(0);

  for (let iteration = 0; iteration < 28; iteration += 1) {
    const distance = (low + high) / 2;
    point = path.getPointAtLength(distance);
    if (point.x < targetX) low = distance;
    else high = distance;
  }

  return path.getPointAtLength((low + high) / 2);
}

function readHourlyValues(path: SVGPathElement) {
  return Array.from({ length: HOUR_COUNT + 1 }, (_, index) => {
    const point = pointAtX(path, (index / HOUR_COUNT) * SVG_WIDTH);
    const value = ((SOURCE_BOTTOM - point.y) / (SOURCE_BOTTOM - SOURCE_TOP)) * 100;
    return Math.round(clamp(value, 0, 100));
  });
}

function detailedScale(values: number[]): TrafficScale {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = maximum - minimum;
  const padding = Math.max(4, range * 0.18);
  let low = clamp(minimum - padding, 0, 100);
  let high = clamp(maximum + padding, 0, 100);

  if (high - low < 18) {
    const midpoint = (minimum + maximum) / 2;
    low = clamp(midpoint - 9, 0, 82);
    high = clamp(low + 18, 18, 100);
    low = high - 18;
  }

  return { low, high };
}

function interpolatedValue(values: number[], position: number) {
  const bounded = clamp(position, 0, HOUR_COUNT);
  const left = Math.floor(bounded);
  const right = Math.min(HOUR_COUNT, left + 1);
  const progress = bounded - left;
  const eased = (1 - Math.cos(Math.PI * progress)) / 2;
  return values[left] + (values[right] - values[left]) * eased;
}

function yForValue(value: number, scale: TrafficScale) {
  const proportion = (value - scale.low) / Math.max(1, scale.high - scale.low);
  return DISPLAY_BOTTOM - clamp(proportion, 0, 1) * (DISPLAY_BOTTOM - DISPLAY_TOP);
}

function detailedPath(values: number[], scale: TrafficScale) {
  const sampleCount = HOUR_COUNT * SAMPLES_PER_HOUR;
  return Array.from({ length: sampleCount + 1 }, (_, index) => {
    const position = (index / sampleCount) * HOUR_COUNT;
    const x = (position / HOUR_COUNT) * SVG_WIDTH;
    const y = yForValue(interpolatedValue(values, position), scale);
    return `${index ? "L" : "M"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function formatTime(totalMinutes: number) {
  const rounded = Math.round(totalMinutes);
  const hours24 = Math.floor(rounded / 60) % 24;
  const minutes = rounded % 60;
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${hours24 >= 12 ? "PM" : "AM"}`;
}

function updateExplanatoryText(chart: HTMLElement) {
  const row = chart.closest(".traffic-row");
  const label = row?.querySelector<HTMLElement>(".traffic-label small");
  if (label) label.textContent = "Relative weekly activity";

  const footer = Array.from(chart.children).find(
    (element) => element.tagName.toLowerCase() === "small",
  ) as HTMLElement | undefined;
  if (!footer) return;

  const suffix = "100 = this location's typical weekly peak";
  const base = (footer.textContent || "")
    .replace(new RegExp(`\\s*•\\s*${suffix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`), "")
    .trim();
  footer.textContent = `${base} • ${suffix}`;
}

export default function TrafficCurveEnhancer() {
  useEffect(() => {
    const enhancedCharts = new Map<HTMLElement, EnhancedChart>();
    let refreshQueued = false;

    function enhance(chart: HTMLElement) {
      const svg = chart.querySelector<SVGSVGElement>("svg");
      const line = svg?.querySelector<SVGPathElement>("path.traffic-line");
      const area = svg?.querySelector<SVGPathElement>("path.traffic-area");
      if (!svg || !line) return;

      updateExplanatoryText(chart);

      const currentPath = line.getAttribute("d") || "";
      const existing = enhancedCharts.get(chart);
      if (existing && currentPath === existing.generatedLine) return;
      if (!currentPath) return;

      let values: number[];
      try {
        values = readHourlyValues(line);
      } catch {
        return;
      }

      const scale = detailedScale(values);
      const generatedLine = detailedPath(values, scale);
      line.setAttribute("d", generatedLine);
      if (area) area.setAttribute("d", `M 0 68 L ${generatedLine.slice(1)} L 1000 68 Z`);

      if (existing) {
        existing.values = values;
        existing.scale = scale;
        existing.generatedLine = generatedLine;
        return;
      }

      const tooltip = document.createElement("div");
      tooltip.setAttribute("aria-hidden", "true");
      Object.assign(tooltip.style, {
        position: "absolute",
        zIndex: "6",
        display: "none",
        pointerEvents: "none",
        padding: "5px 8px",
        border: "1px solid #668c40",
        borderRadius: "7px",
        background: "rgba(16, 39, 27, .96)",
        color: "#d9ffae",
        fontSize: "10px",
        fontWeight: "800",
        whiteSpace: "nowrap",
        boxShadow: "0 4px 12px rgba(0, 0, 0, .45)",
      });
      chart.appendChild(tooltip);

      const state: EnhancedChart = {
        values,
        scale,
        tooltip,
        generatedLine,
        cleanup: () => undefined,
      };

      const move = (event: globalThis.PointerEvent) => {
        const rect = chart.getBoundingClientRect();
        if (!rect.width) return;
        const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const position = fraction * HOUR_COUNT;
        const value = interpolatedValue(state.values, position);
        const time = START_MINUTES + fraction * (END_MINUTES - START_MINUTES);
        const chartY = 5 + (yForValue(value, state.scale) / 72) * 68;
        const tooltipX = clamp(fraction * rect.width, 58, Math.max(58, rect.width - 58));

        tooltip.textContent = `${formatTime(time)} • ≈${Math.round(value)}/100`;
        tooltip.style.display = "block";
        tooltip.style.left = `${tooltipX}px`;
        tooltip.style.top = `${chartY}px`;
        tooltip.style.transform = chartY < 32
          ? "translate(-50%, 9px)"
          : "translate(-50%, calc(-100% - 9px))";
      };

      const leave = () => {
        tooltip.style.display = "none";
      };

      chart.addEventListener("pointermove", move);
      chart.addEventListener("pointerleave", leave);
      state.cleanup = () => {
        chart.removeEventListener("pointermove", move);
        chart.removeEventListener("pointerleave", leave);
        tooltip.remove();
      };
      enhancedCharts.set(chart, state);
    }

    function refresh() {
      refreshQueued = false;
      document.querySelectorAll<HTMLElement>(".traffic-chart.available").forEach(enhance);
      for (const [chart, state] of enhancedCharts) {
        if (!document.contains(chart)) {
          state.cleanup();
          enhancedCharts.delete(chart);
        }
      }
    }

    function queueRefresh() {
      if (refreshQueued) return;
      refreshQueued = true;
      queueMicrotask(refresh);
    }

    const observer = new MutationObserver(queueRefresh);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class", "d"],
      childList: true,
      subtree: true,
    });
    const frame = window.requestAnimationFrame(refresh);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      for (const state of enhancedCharts.values()) state.cleanup();
      enhancedCharts.clear();
    };
  }, []);

  return null;
}
