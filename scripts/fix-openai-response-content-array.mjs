import { readFile, writeFile } from "node:fs/promises";

const PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const MARKER = "// openai-response-content-array-v2";
let source = await readFile(PATH, "utf8");

if (!source.includes(MARKER)) {
  const oldLoop = `  for (const key of ["output", "result", "choices", "messages"]) {`;
  const newLoop = `  ${MARKER}\n  for (const key of ["output", "result", "choices", "messages", "content"]) {`;
  if (!source.includes(oldLoop)) throw new Error("Could not locate providerText array traversal.");
  source = source.replace(oldLoop, newLoop);

  source = source.replace(
    `const ROUTE_VERSION = "ai-provider-analysis-v6-availability";`,
    `const ROUTE_VERSION = "ai-provider-analysis-v7-openai-content-array";`,
  );
  source = source.replace(
    `const ROUTE_VERSION = "ai-provider-analysis-v5-direct";`,
    `const ROUTE_VERSION = "ai-provider-analysis-v7-openai-content-array";`,
  );

  const diagnosticBefore = `        incompleteReason: raw.incomplete_details && typeof raw.incomplete_details === "object"\n          ? cleanText((raw.incomplete_details as Record<string, unknown>).reason, 180)\n          : "",`;
  const diagnosticAfter = `        incompleteReason: raw.incomplete_details && typeof raw.incomplete_details === "object"\n          ? cleanText((raw.incomplete_details as Record<string, unknown>).reason, 180)\n          : "",\n        outputTypes: Array.isArray(raw.output)\n          ? raw.output.map((item) => item && typeof item === "object" ? cleanText((item as Record<string, unknown>).type, 80) : "").filter(Boolean)\n          : [],`;
  if (source.includes(diagnosticBefore)) source = source.replace(diagnosticBefore, diagnosticAfter);
}

await writeFile(PATH, source);
