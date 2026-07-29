"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type DayHours = { day: number; enabled: boolean; start: string; end: string };
type Truck = { id: number; name: string; cuisine: string; paymentTypes: string; color: string };
type Visit = { id: number; truckId: number; visitDate: string; startTime: string; endTime: string; status: string };
type ReportData = { trucks: Truck[]; visits: Visit[] };
type LocationProfile = { storeName?: string; storeNumber?: string; city?: string; state?: string; operatingHours?: DayHours[] };
type PdfPage = { commands: string[] };

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const REPORT_START = 6 * 60;
const REPORT_END = 22 * 60;
const MAX_RANGE_DAYS = 31;
const COLORS = {
  navy: "0B2239",
  navy2: "153B57",
  lime: "86B94A",
  text: "183247",
  muted: "63798B",
  line: "C8D5DE",
  light: "EEF3F7",
  alt: "F7F9FB",
  white: "FFFFFF",
};

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const result = new Date(`${value}T12:00:00`);
  return Number.isNaN(result.getTime()) ? null : result;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function rangeDates(start: string, end: string) {
  const first = parseDate(start);
  const last = parseDate(end);
  if (!first || !last || first > last) return [];
  const result: string[] = [];
  for (let current = first; current <= last && result.length <= MAX_RANGE_DAYS; current = addDays(current, 1)) result.push(dateKey(current));
  return result;
}

function minuteValue(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : 0;
}

function timeLabel(value: string) {
  const total = minuteValue(value);
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

function hourLabel(total: number) {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${hour >= 12 ? "PM" : "AM"}`;
}

function longDate(value: string) {
  return parseDate(value)?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) || value;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeHex(value: string | undefined, fallback = COLORS.lime) {
  return String(value || "").match(/^#?([\da-f]{6})$/i)?.[1]?.toUpperCase() || fallback;
}

function storeName(location: LocationProfile | null) {
  const name = location?.storeName?.trim() || "Food Truck Admin";
  const number = location?.storeNumber?.trim();
  return number ? `${name} • Store ${number}` : name;
}

function locationName(location: LocationProfile | null) {
  return [location?.city, location?.state].filter(Boolean).join(", ");
}

function hoursForDate(location: LocationProfile | null, value: string) {
  const day = parseDate(value)?.getDay();
  const slot = location?.operatingHours?.find((item) => item.day === day);
  const start = slot?.enabled ? minuteValue(slot.start) : REPORT_START;
  const end = slot?.enabled && minuteValue(slot.end) > start ? minuteValue(slot.end) : REPORT_END;
  return { start, end, enabled: Boolean(slot?.enabled) };
}

function normalizeData(value: unknown): ReportData {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const trucks = (Array.isArray(source.trucks) ? source.trucks : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = Number(row.id);
    if (!Number.isInteger(id) || id <= 0) return [];
    return [{
      id,
      name: typeof row.name === "string" ? row.name : "Unnamed Truck",
      cuisine: typeof row.cuisine === "string" ? row.cuisine : "Not provided",
      paymentTypes: typeof row.paymentTypes === "string" && row.paymentTypes.trim() ? row.paymentTypes : "Not provided",
      color: safeHex(typeof row.color === "string" ? row.color : ""),
    }];
  });
  const visits = (Array.isArray(source.visits) ? source.visits : []).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const truckId = Number(row.truckId);
    if (!Number.isInteger(truckId) || truckId <= 0) return [];
    return [{
      id: Number(row.id) || 0,
      truckId,
      visitDate: typeof row.visitDate === "string" ? row.visitDate : "",
      startTime: typeof row.startTime === "string" ? row.startTime : "11:00",
      endTime: typeof row.endTime === "string" ? row.endTime : "15:00",
      status: typeof row.status === "string" ? row.status : "Scheduled",
    }];
  });
  return { trucks, visits };
}

function visitsForDate(data: ReportData, value: string) {
  return data.visits
    .filter((visit) => visit.visitDate === value && visit.status.toLowerCase() !== "cancelled")
    .sort((left, right) => left.startTime.localeCompare(right.startTime) || left.truckId - right.truckId);
}

function trucksForVisits(data: ReportData, visits: Visit[]) {
  const ids = new Set(visits.map((visit) => visit.truckId));
  return data.trucks.filter((truck) => ids.has(truck.id)).sort((left, right) => left.name.localeCompare(right.name));
}

function fileName(start: string, end: string, extension: string) {
  return `food-truck-schedule_${start === end ? start : `${start}_to_${end}`}.${extension}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pdfEscape(value: string) {
  return value.replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function pdfColor(hex: string) {
  const value = safeHex(hex);
  return [0, 2, 4].map((offset) => (Number.parseInt(value.slice(offset, offset + 2), 16) / 255).toFixed(3)).join(" ");
}

function pdfRect(page: PdfPage, x: number, y: number, width: number, height: number, fill: string, stroke?: string) {
  const bottom = PAGE_HEIGHT - y - height;
  page.commands.push(`q ${pdfColor(fill)} rg${stroke ? ` ${pdfColor(stroke)} RG 0.6 w` : ""} ${x.toFixed(2)} ${bottom.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${stroke ? "B" : "f"} Q`);
}

function pdfLine(page: PdfPage, x1: number, y1: number, x2: number, y2: number, color: string, width = 0.5, dashed = false) {
  page.commands.push(`q ${pdfColor(color)} RG ${width} w ${dashed ? "[2 2] 0 d " : ""}${x1.toFixed(2)} ${(PAGE_HEIGHT - y1).toFixed(2)} m ${x2.toFixed(2)} ${(PAGE_HEIGHT - y2).toFixed(2)} l S Q`);
}

function pdfText(page: PdfPage, value: string, x: number, y: number, size: number, color = COLORS.text, bold = false, align: "left" | "center" | "right" = "left") {
  const clean = pdfEscape(value);
  const estimate = clean.length * size * 0.49;
  const adjusted = align === "center" ? x - estimate / 2 : align === "right" ? x - estimate : x;
  page.commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${pdfColor(color)} rg 1 0 0 1 ${adjusted.toFixed(2)} ${(PAGE_HEIGHT - y).toFixed(2)} Tm (${clean}) Tj ET`);
}

function pdfHeader(page: PdfPage, date: string, location: LocationProfile | null, continued: boolean) {
  pdfRect(page, 0, 0, PAGE_WIDTH, 65, COLORS.navy);
  pdfRect(page, 0, 61, PAGE_WIDTH, 4, COLORS.lime);
  pdfText(page, "Food Truck Schedule", 28, 29, 20, COLORS.white, true);
  pdfText(page, continued ? "Daily timeline • continued" : "Daily timeline and vendor reference", 28, 47, 8, "B8CAD8");
  pdfText(page, storeName(location), PAGE_WIDTH - 28, 28, 10, COLORS.white, true, "right");
  if (locationName(location)) pdfText(page, locationName(location), PAGE_WIDTH - 28, 45, 8, "B8CAD8", false, "right");
  pdfRect(page, 28, 78, PAGE_WIDTH - 56, 27, COLORS.light, COLORS.line);
  pdfText(page, longDate(date), 39, 96, 12, COLORS.text, true);
  pdfText(page, "Dark blocks show each scheduled visit", PAGE_WIDTH - 39, 96, 8, COLORS.muted, false, "right");
}

function pdfTimelineHeader(page: PdfPage, y: number, start: number, end: number) {
  const margin = 28;
  const nameWidth = 148;
  const timelineX = margin + nameWidth;
  const timelineWidth = PAGE_WIDTH - margin * 2 - nameWidth;
  const columns = Math.max(1, Math.ceil((end - start) / 60));
  const columnWidth = timelineWidth / columns;
  pdfRect(page, margin, y, PAGE_WIDTH - margin * 2, 28, COLORS.navy2);
  pdfText(page, "TRUCK", margin + 10, y + 18, 8, COLORS.white, true);
  for (let index = 0; index < columns; index += 1) {
    const x = timelineX + index * columnWidth;
    if (index) pdfLine(page, x, y + 4, x, y + 24, "476279");
    pdfText(page, hourLabel(start + index * 60), x + columnWidth / 2, y + 18, columns > 14 ? 5.5 : 6.5, COLORS.white, true, "center");
  }
  return { margin, nameWidth, timelineX, timelineWidth, columns };
}

function pdfVisitRow(page: PdfPage, data: ReportData, visit: Visit, y: number, index: number, grid: ReturnType<typeof pdfTimelineHeader>, start: number, end: number) {
  const truck = data.trucks.find((item) => item.id === visit.truckId);
  const accent = safeHex(truck?.color);
  const height = 32;
  pdfRect(page, grid.margin, y, PAGE_WIDTH - grid.margin * 2, height, index % 2 ? COLORS.alt : COLORS.white, COLORS.line);
  pdfRect(page, grid.margin, y, 4, height, accent);
  pdfText(page, (truck?.name || "Unknown Truck").slice(0, 29), grid.margin + 11, y + 13, 9, COLORS.text, true);
  pdfText(page, (truck?.cuisine || "Profile unavailable").slice(0, 35), grid.margin + 11, y + 24, 6.7, COLORS.muted);
  const halfHours = grid.columns * 2;
  for (let slot = 0; slot <= halfHours; slot += 1) {
    const x = grid.timelineX + (slot / halfHours) * grid.timelineWidth;
    pdfLine(page, x, y, x, y + height, COLORS.line, 0.35, slot % 2 === 1);
  }
  const scheduledStart = clamp(minuteValue(visit.startTime), start, end);
  const scheduledEnd = clamp(minuteValue(visit.endTime), start, end);
  const left = grid.timelineX + ((scheduledStart - start) / (end - start)) * grid.timelineWidth;
  const width = Math.max(4, ((Math.max(scheduledEnd, scheduledStart + 15) - scheduledStart) / (end - start)) * grid.timelineWidth);
  pdfRect(page, left + 1.5, y + 6, Math.max(3, width - 3), height - 12, COLORS.navy);
  pdfRect(page, left + 1.5, y + 6, Math.min(5, Math.max(3, width - 3)), height - 12, accent);
  if (width > 53) pdfText(page, `${timeLabel(visit.startTime)} – ${timeLabel(visit.endTime)}`, left + width / 2, y + 20, width > 90 ? 6.6 : 5.5, COLORS.white, true, "center");
}

function pdfEmpty(page: PdfPage, y: number) {
  pdfRect(page, 28, y, PAGE_WIDTH - 56, 55, COLORS.alt, COLORS.line);
  pdfText(page, "No food trucks are scheduled for this day", PAGE_WIDTH / 2, y + 24, 11, COLORS.text, true, "center");
  pdfText(page, "The date is included so the selected report range remains complete.", PAGE_WIDTH / 2, y + 40, 7.5, COLORS.muted, false, "center");
}

function pdfKey(page: PdfPage, trucks: Truck[], y: number) {
  if (!trucks.length) return;
  const margin = 28;
  const gap = 8;
  const columns = 3;
  const width = (PAGE_WIDTH - margin * 2 - gap * 2) / columns;
  pdfText(page, "Truck Reference Key", margin, y + 10, 10, COLORS.text, true);
  pdfText(page, "Cuisine type and accepted payment types", margin + 110, y + 10, 7, COLORS.muted);
  trucks.forEach((truck, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = margin + column * (width + gap);
    const cardY = y + 18 + row * 31;
    pdfRect(page, x, cardY, width, 27, COLORS.light, COLORS.line);
    pdfRect(page, x, cardY, 5, 27, truck.color);
    pdfText(page, truck.name.slice(0, 30), x + 11, cardY + 11, 8, COLORS.text, true);
    pdfText(page, `${truck.cuisine} • ${truck.paymentTypes}`.slice(0, 68), x + 11, cardY + 21, 6.2, COLORS.muted);
  });
}

function pdfFooter(page: PdfPage, number: number) {
  pdfLine(page, 28, PAGE_HEIGHT - 25, PAGE_WIDTH - 28, PAGE_HEIGHT - 25, COLORS.line);
  pdfText(page, `Generated ${new Date().toLocaleString("en-US")} • Food Truck Admin`, 28, PAGE_HEIGHT - 11, 6.5, COLORS.muted);
  pdfText(page, `Page ${number}`, PAGE_WIDTH - 28, PAGE_HEIGHT - 11, 6.5, COLORS.muted, false, "right");
}

function buildPdf(pages: PdfPage[]) {
  const encoder = new TextEncoder();
  const pageObjectNumbers = pages.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  pages.forEach((page, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    const stream = page.commands.join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`);
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(output).length);
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = encoder.encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([encoder.encode(output)], { type: "application/pdf" });
}

async function exportPdf(data: ReportData, location: LocationProfile | null, dates: string[], startDate: string, endDate: string) {
  const pages: PdfPage[] = [];
  dates.forEach((date) => {
    const visits = visitsForDate(data, date);
    const trucks = trucksForVisits(data, visits);
    const keyHeight = trucks.length ? 30 + Math.ceil(trucks.length / 3) * 31 : 0;
    const finalCapacity = Math.max(1, Math.floor((PAGE_HEIGHT - 175 - keyHeight) / 32));
    const chunks: Visit[][] = [];
    let remaining = [...visits];
    while (remaining.length > finalCapacity) chunks.push(remaining.splice(0, Math.min(11, remaining.length - finalCapacity)));
    chunks.push(remaining);
    if (!visits.length) chunks.splice(0, chunks.length, []);
    chunks.forEach((chunk, chunkIndex) => {
      const page: PdfPage = { commands: [] };
      const hours = hoursForDate(location, date);
      pdfHeader(page, date, location, chunkIndex > 0);
      const grid = pdfTimelineHeader(page, 116, hours.start, hours.end);
      let y = 144;
      if (!visits.length) {
        pdfEmpty(page, y + 8);
        y += 70;
      } else {
        chunk.forEach((visit, index) => {
          pdfVisitRow(page, data, visit, y, index, grid, hours.start, hours.end);
          y += 32;
        });
      }
      if (chunkIndex === chunks.length - 1) pdfKey(page, trucks, y + 14);
      pdfFooter(page, pages.length + 1);
      pages.push(page);
    });
  });
  download(buildPdf(pages), fileName(startDate, endDate, "pdf"));
}

function xmlEscape(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function columnName(value: number) {
  let result = "";
  for (let current = value + 1; current > 0; current = Math.floor((current - 1) / 26)) result = String.fromCharCode(65 + ((current - 1) % 26)) + result;
  return result;
}

function inlineCell(row: number, column: number, value: string, style: number) {
  return `<c r="${columnName(column)}${row}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function workbookStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FF${COLORS.white}"/><name val="Aptos Display"/></font><font><b/><sz val="10"/><color rgb="FF${COLORS.white}"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF${COLORS.text}"/><name val="Aptos"/></font></fonts><fills count="8"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS.navy}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS.light}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS.navy2}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS.alt}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS.white}"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${COLORS.lime}"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FF${COLORS.line}"/></left><right style="thin"><color rgb="FF${COLORS.line}"/></right><top style="thin"><color rgb="FF${COLORS.line}"/></top><bottom style="thin"><color rgb="FF${COLORS.line}"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" shrinkToFit="1"/></xf><xf numFmtId="0" fontId="2" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function worksheetXml(data: ReportData, location: LocationProfile | null, date: string) {
  const visits = visitsForDate(data, date);
  const trucks = trucksForVisits(data, visits);
  const hours = hoursForDate(location, date);
  const slots = Math.max(2, Math.ceil((hours.end - hours.start) / 30));
  const lastColumn = slots;
  const merges: string[] = [`A1:${columnName(lastColumn)}1`, `A2:${columnName(lastColumn)}2`];
  const rows: string[] = [];
  rows.push(`<row r="1" ht="31" customHeight="1">${inlineCell(1, 0, "FOOD TRUCK SCHEDULE", 1)}</row>`);
  rows.push(`<row r="2" ht="24" customHeight="1">${inlineCell(2, 0, `${longDate(date)}  •  ${storeName(location)}${locationName(location) ? `  •  ${locationName(location)}` : ""}`, 2)}</row>`);
  rows.push('<row r="3" ht="8" customHeight="1"/>');
  const hourCells = [inlineCell(4, 0, "TRUCK", 3)];
  for (let slot = 0; slot < slots; slot += 2) {
    const column = slot + 1;
    hourCells.push(inlineCell(4, column, hourLabel(hours.start + slot * 30), 3));
    if (column + 1 <= lastColumn) merges.push(`${columnName(column)}4:${columnName(column + 1)}4`);
  }
  rows.push(`<row r="4" ht="23" customHeight="1">${hourCells.join("")}</row>`);
  rows.push(`<row r="5" ht="18" customHeight="1">${[inlineCell(5, 0, "", 4), ...Array.from({ length: slots }, (_, slot) => inlineCell(5, slot + 1, slot % 2 ? ":30" : ":00", 4))].join("")}</row>`);
  let rowNumber = 6;
  if (!visits.length) {
    rows.push(`<row r="${rowNumber}" ht="34" customHeight="1">${inlineCell(rowNumber, 0, "No food trucks scheduled", 6)}${Array.from({ length: slots }, (_, slot) => inlineCell(rowNumber, slot + 1, "", 6)).join("")}</row>`);
    rowNumber += 1;
  }
  visits.forEach((visit, index) => {
    const truck = data.trucks.find((item) => item.id === visit.truckId);
    const startSlot = clamp(Math.floor((minuteValue(visit.startTime) - hours.start) / 30), 0, slots - 1);
    const endSlot = clamp(Math.ceil((minuteValue(visit.endTime) - hours.start) / 30) - 1, startSlot, slots - 1);
    const bodyStyle = index % 2 ? 6 : 5;
    const cells = [inlineCell(rowNumber, 0, `${truck?.name || "Unknown Truck"}\n${truck?.cuisine || "Profile unavailable"}`, bodyStyle)];
    for (let slot = 0; slot < slots; slot += 1) {
      const active = slot >= startSlot && slot <= endSlot;
      const value = active && slot === startSlot ? timeLabel(visit.startTime) : active && slot === endSlot ? timeLabel(visit.endTime) : "";
      cells.push(inlineCell(rowNumber, slot + 1, value, active ? 7 : bodyStyle));
    }
    rows.push(`<row r="${rowNumber}" ht="31" customHeight="1">${cells.join("")}</row>`);
    rowNumber += 1;
  });
  rowNumber += 1;
  merges.push(`A${rowNumber}:${columnName(lastColumn)}${rowNumber}`);
  rows.push(`<row r="${rowNumber}" ht="23" customHeight="1">${inlineCell(rowNumber, 0, "TRUCK REFERENCE KEY", 8)}</row>`);
  rowNumber += 1;
  const cuisineEnd = Math.max(2, Math.floor(lastColumn * 0.45));
  merges.push(`B${rowNumber}:${columnName(cuisineEnd)}${rowNumber}`, `${columnName(cuisineEnd + 1)}${rowNumber}:${columnName(lastColumn)}${rowNumber}`);
  rows.push(`<row r="${rowNumber}" ht="22" customHeight="1">${inlineCell(rowNumber, 0, "Truck Name", 9)}${inlineCell(rowNumber, 1, "Cuisine Type", 9)}${inlineCell(rowNumber, cuisineEnd + 1, "Accepted Payment Types", 9)}</row>`);
  trucks.forEach((truck) => {
    rowNumber += 1;
    merges.push(`B${rowNumber}:${columnName(cuisineEnd)}${rowNumber}`, `${columnName(cuisineEnd + 1)}${rowNumber}:${columnName(lastColumn)}${rowNumber}`);
    rows.push(`<row r="${rowNumber}" ht="24" customHeight="1">${inlineCell(rowNumber, 0, truck.name, 10)}${inlineCell(rowNumber, 1, truck.cuisine, 10)}${inlineCell(rowNumber, cuisineEnd + 1, truck.paymentTypes, 10)}</row>`);
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${columnName(lastColumn)}${rowNumber}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="${lastColumn + 1}" width="4.5" customWidth="1"/></cols><sheetData>${rows.join("")}</sheetData><mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells><pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.15" footer="0.15"/><pageSetup paperSize="1" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let index = 0; index < 8; index += 1) crc = (crc & 1) ? 0xEDB88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function crc32(bytes: Uint8Array) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function little(value: number, length: number) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) bytes[index] = (value >>> (index * 8)) & 0xFF;
  return bytes;
}

function joinBytes(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

function zipFiles(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = joinBytes([little(0x04034B50, 4), little(20, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 2), little(crc, 4), little(data.length, 4), little(data.length, 4), little(name.length, 2), little(0, 2), name, data]);
    locals.push(local);
    central.push(joinBytes([little(0x02014B50, 4), little(20, 2), little(20, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 2), little(crc, 4), little(data.length, 4), little(data.length, 4), little(name.length, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 2), little(0, 4), little(offset, 4), name]));
    offset += local.length;
  });
  const centralBytes = joinBytes(central);
  const end = joinBytes([little(0x06054B50, 4), little(0, 2), little(0, 2), little(files.length, 2), little(files.length, 2), little(centralBytes.length, 4), little(offset, 4), little(0, 2)]);
  return joinBytes([...locals, centralBytes, end]);
}

async function exportExcel(data: ReportData, location: LocationProfile | null, dates: string[], startDate: string, endDate: string) {
  const sheetNames = dates.map((date) => date.slice(5));
  const files = [
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${dates.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${dates.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${dates.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", content: workbookStyles() },
    ...dates.map((date, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: worksheetXml(data, location, date) })),
  ];
  download(new Blob([zipFiles(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(startDate, endDate, "xlsx"));
}

function selectedScheduleDate() {
  const heading = document.querySelector<HTMLElement>(".schedule-datebar strong")?.textContent?.trim();
  if (!heading) return dateKey();
  const year = new Date().getFullYear();
  const parsed = new Date(`${heading}, ${year} 12:00:00`);
  return Number.isNaN(parsed.getTime()) ? dateKey() : dateKey(parsed);
}

export default function ScheduleExportRuntime() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(dateKey());
  const [endDate, setEndDate] = useState(dateKey());
  const [data, setData] = useState<ReportData | null>(null);
  const [location, setLocation] = useState<LocationProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const timers = new Set<number>();
    function sync() {
      if (!active) return;
      const heading = Array.from(document.querySelectorAll<HTMLElement>(".section-heading")).find((element) => element.querySelector("h1")?.textContent?.trim() === "Schedule");
      const actions = heading?.querySelector<HTMLElement>(".heading-actions");
      if (!actions) { setHost(null); return; }
      let target = actions.querySelector<HTMLElement>("[data-schedule-report-root]");
      if (!target) {
        target = document.createElement("span");
        target.dataset.scheduleReportRoot = "true";
        const scheduleButton = Array.from(actions.querySelectorAll("button")).find((button) => button.textContent?.includes("Schedule Visit"));
        if (scheduleButton) actions.insertBefore(target, scheduleButton); else actions.appendChild(target);
      }
      setHost(target);
    }
    function schedule(delay: number) {
      const timer = window.setTimeout(() => { timers.delete(timer); sync(); }, delay);
      timers.add(timer);
    }
    function interact() { schedule(30); schedule(300); schedule(900); }
    document.addEventListener("click", interact, { passive: true });
    [50, 300, 1000, 2200].forEach(schedule);
    return () => { active = false; timers.forEach(clearTimeout); document.removeEventListener("click", interact); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const selected = selectedScheduleDate();
    setStartDate(selected);
    setEndDate(selected);
    setError("");
    setLoading(true);
    const controller = new AbortController();
    Promise.all([
      fetch("/api/data", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error("The schedule could not be loaded.");
        return normalizeData(await response.json());
      }),
      fetch("/api/location", { cache: "no-store", signal: controller.signal }).then(async (response) => {
        if (!response.ok) return null;
        return ((await response.json()) as { location?: LocationProfile | null }).location || null;
      }).catch(() => null),
    ]).then(([nextData, nextLocation]) => { setData(nextData); setLocation(nextLocation); }).catch((caught) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The schedule could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open]);

  const dates = useMemo(() => rangeDates(startDate, endDate), [startDate, endDate]);
  const rangeError = !parseDate(startDate) || !parseDate(endDate)
    ? "Choose a valid start and end date."
    : startDate > endDate
      ? "The end date must be on or after the start date."
      : !dates.length || dates.length > MAX_RANGE_DAYS
        ? `Choose a range of ${MAX_RANGE_DAYS} days or fewer.`
        : "";
  const visitCount = data?.visits.filter((visit) => dates.includes(visit.visitDate) && visit.status.toLowerCase() !== "cancelled").length || 0;

  async function run(format: "pdf" | "excel") {
    if (!data || rangeError) return;
    setExporting(format);
    setError("");
    try {
      if (format === "pdf") await exportPdf(data, location, dates, startDate, endDate);
      else await exportExcel(data, location, dates, startDate, endDate);
    } catch (caught) {
      console.error("schedule report export", caught);
      setError(`The ${format === "pdf" ? "PDF" : "Excel workbook"} could not be created.`);
    } finally {
      setExporting(null);
    }
  }

  if (!host) return null;
  return createPortal(<>
    <style>{`
      [data-schedule-report-root]{display:inline-flex}.schedule-report-open{white-space:nowrap}.schedule-report-backdrop{position:fixed;inset:0;z-index:1600;display:grid;place-items:center;padding:24px;background:#020a13d9;backdrop-filter:blur(6px)}
      .schedule-report-modal{width:min(690px,100%);max-height:calc(100vh - 48px);overflow:auto;padding:25px;border:1px solid #315775;border-radius:15px;background:linear-gradient(145deg,#0b2239,#07182b);box-shadow:0 28px 90px #000a;color:#e8f3fb}.schedule-report-head{display:flex;justify-content:space-between;gap:18px}.schedule-report-head .eyebrow{margin:0 0 6px;color:#9bd15c!important}.schedule-report-head h2{margin:0;font-size:24px}.schedule-report-head p{margin:7px 0 0;color:#91a9bc;font-size:11px;line-height:1.5}.schedule-report-close{border:0;background:transparent;color:#9db5c8;font-size:28px;cursor:pointer}
      .schedule-report-dates{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.schedule-report-dates label{display:grid;gap:6px;color:#a9bfd0;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.schedule-report-dates input{min-height:43px;padding:0 11px;border:1px solid #3b617f;border-radius:8px;background:#061526;color:#eaf5fc;color-scheme:dark}
      .schedule-report-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:13px}.schedule-report-stats article{padding:12px;border:1px solid #294d69;border-radius:9px;background:#091d31}.schedule-report-stats span{display:block;color:#7c97ab;font-size:8px;font-weight:900;text-transform:uppercase}.schedule-report-stats strong{display:block;margin-top:4px;font-size:17px}.schedule-report-preview{margin-top:14px;padding:14px;border:1px solid #315773;border-radius:10px;background:#eef3f7;color:#173147}.schedule-report-preview header{display:flex;justify-content:space-between;padding-bottom:9px;border-bottom:3px solid #86b94a}.schedule-report-preview header strong{font-size:13px}.schedule-report-preview header span{font-size:8px}.schedule-report-mini{display:grid;grid-template-columns:110px 1fr;margin-top:10px;border:1px solid #c2d0da}.schedule-report-mini>b{padding:8px;background:#153b57;color:#fff;font-size:8px}.schedule-report-hours{display:grid;grid-template-columns:repeat(8,1fr);background:#153b57;color:#fff}.schedule-report-hours span{padding:8px 1px;border-left:1px solid #ffffff22;text-align:center;font-size:7px}.schedule-report-name{padding:10px;border-top:1px solid #c2d0da;font-size:8px;font-weight:800}.schedule-report-line{position:relative;min-height:32px;border-top:1px solid #c2d0da;background:repeating-linear-gradient(to right,transparent 0,transparent calc(6.25% - 1px),#bbc9d3 calc(6.25% - 1px),#bbc9d3 6.25%)}.schedule-report-bar{position:absolute;left:31%;top:7px;width:33%;height:18px;border-radius:5px;background:#0b2239;box-shadow:inset 4px 0 #86b94a}.schedule-report-key{margin-top:9px;color:#587080;font-size:7px}.schedule-report-key b{color:#173147}.schedule-report-note{margin:12px 0 0;color:#7894a8;font-size:9px;line-height:1.5}.schedule-report-error{margin-top:12px;padding:10px;border:1px solid #8b3935;border-radius:8px;background:#3a1719;color:#ffb1aa;font-size:10px}.schedule-report-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.schedule-report-actions button{min-width:165px}.schedule-report-actions .excel{border-color:#4e7b38;background:#17331c;color:#ceffaf}
      @media(max-width:650px){.schedule-report-dates,.schedule-report-stats{grid-template-columns:1fr}.schedule-report-preview{display:none}.schedule-report-actions{flex-direction:column}.schedule-report-actions button{width:100%}}
    `}</style>
    <button className="secondary schedule-report-open" type="button" onClick={() => setOpen(true)}>⇩ Print / Export</button>
    {open && createPortal(<div className="schedule-report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) setOpen(false); }}><section className="schedule-report-modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="schedule-report-head"><div><p className="eyebrow">PRINTABLE SCHEDULE</p><h2 id="report-title">Export Food Truck Schedule</h2><p>Choose one day or a date range, then download a polished PDF or formatted Excel workbook.</p></div><button className="schedule-report-close" type="button" disabled={Boolean(exporting)} onClick={() => setOpen(false)} aria-label="Close">×</button></div>
      <div className="schedule-report-dates"><label>Start Date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>End Date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label></div>
      <div className="schedule-report-stats"><article><span>Selected Days</span><strong>{dates.length || "—"}</strong></article><article><span>Scheduled Visits</span><strong>{loading ? "…" : visitCount}</strong></article><article><span>Output</span><strong>Landscape</strong></article></div>
      <div className="schedule-report-preview"><header><strong>Food Truck Schedule</strong><span>{startDate ? longDate(startDate) : "Selected date"}</span></header><div className="schedule-report-mini"><b>TRUCK</b><div className="schedule-report-hours">{[6,8,10,12,14,16,18,20].map((hour) => <span key={hour}>{hourLabel(hour * 60)}</span>)}</div><div className="schedule-report-name">Example Truck</div><div className="schedule-report-line"><i className="schedule-report-bar" /></div></div><div className="schedule-report-key"><b>Truck Reference Key</b> • Truck name • Cuisine • Accepted payment types</div></div>
      <p className="schedule-report-note">Each PDF day uses a print-ready landscape page. Excel creates one formatted worksheet per day. Cancelled visits are excluded.</p>
      {(error || rangeError) && <div className="schedule-report-error" role="alert">△ {error || rangeError}</div>}
      <div className="schedule-report-actions"><button className="secondary" type="button" disabled={loading || Boolean(exporting) || Boolean(rangeError) || !data} onClick={() => void run("pdf")}>{exporting === "pdf" ? "Creating PDF…" : "Download PDF"}</button><button className="secondary excel" type="button" disabled={loading || Boolean(exporting) || Boolean(rangeError) || !data} onClick={() => void run("excel")}>{exporting === "excel" ? "Creating Excel…" : "Download Excel"}</button></div>
    </section></div>, document.body)}
  </>, host);
}
