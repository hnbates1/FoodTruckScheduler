import { readFile, writeFile } from "node:fs/promises";

const CSS_PATH = new URL("../app/globals.css", import.meta.url);
const EXPORT_PATH = new URL("../app/ScheduleExportRuntime.tsx", import.meta.url);

let css = await readFile(CSS_PATH, "utf8");
css = css
  .replaceAll(
    "background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),#17344e 10%);",
    "background:repeating-linear-gradient(90deg,transparent 0,transparent calc((100% / var(--timeline-columns,10)) - 1px),#17344e calc(100% / var(--timeline-columns,10)));",
  )
  .replaceAll(
    "background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),#23415d 10%);",
    "background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc((100% / var(--timeline-columns,10)) - 1px),#23415d calc(100% / var(--timeline-columns,10)));",
  );
await writeFile(CSS_PATH, css);

let source = await readFile(EXPORT_PATH, "utf8");
source = source
  .replace(
    'return new Blob([encoder.encode(output)], { type: "application/pdf" });',
    'const bytes = encoder.encode(output);\n  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });',
  )
  .replace(
    '  const cuisineEnd = Math.max(2, Math.floor(lastColumn * 0.45));',
    '  const cuisineEnd = Math.max(1, Math.floor(lastColumn * 0.45));',
  )
  .replace(
    '  download(new Blob([zipFiles(files)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(startDate, endDate, "xlsx"));',
    '  const archive = zipFiles(files);\n  download(new Blob([archive.buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName(startDate, endDate, "xlsx"));',
  )
  .replace(
    'timers.forEach(clearTimeout);',
    'timers.forEach((timer) => window.clearTimeout(timer));',
  );
await writeFile(EXPORT_PATH, source);
