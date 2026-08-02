import { readFile, writeFile } from "node:fs/promises";

const PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const MARKER = "// openai-structured-response-parser-v2";

let source = await readFile(PATH, "utf8");

if (!source.includes(MARKER)) {
  const before = `function providerText(value: unknown): string {\n  if (typeof value === "string") return value.trim();`;
  const after = `${MARKER}\nfunction providerText(value: unknown): string {\n  if (typeof value === "string") return value.trim();`;
  if (!source.includes(before)) throw new Error("Could not locate providerText.");
  source = source.replace(before, after);

  const arrayBefore = `  for (const key of ["output", "result", "choices", "messages"]) {`;
  const arrayAfter = `  for (const key of ["content", "output", "result", "choices", "messages"]) {`;
  if (!source.includes(arrayBefore)) throw new Error("Could not locate provider response array traversal.");
  source = source.replace(arrayBefore, arrayAfter);

  source = source.replace(
    `    responseStatus: cleanText(raw.status, 80),`,
    `    responseStatus: cleanText(raw.status, 80),\n        outputTypes: Array.isArray(raw.output) ? raw.output.map((item) => item && typeof item === "object" ? cleanText((item as Record<string, unknown>).type, 80) : "").filter(Boolean) : [],`,
  );

  source = source.replace(
    `const ROUTE_VERSION = "ai-provider-analysis-v6-availability";`,
    `const ROUTE_VERSION = "ai-provider-analysis-v7-openai-parser";`,
  );
}

await writeFile(PATH, source);
