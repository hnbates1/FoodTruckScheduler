import { readFile, writeFile } from "node:fs/promises";

const RUNTIME_PATH = new URL("../app/DocumentIntakeRuntime.tsx", import.meta.url);
const ROUTE_PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const COMPRESSION_MARKER = "// create-truck-analysis-compression-v1";
const REQUEST_LIMIT_MARKER = "// intake-request-size-guard-v1";
const AVAILABILITY_MARKER = "// intake-availability-extraction-v1";

let runtime = await readFile(RUNTIME_PATH, "utf8");

if (!runtime.includes(COMPRESSION_MARKER)) {
  const anchor = "function responseError(response: Response) {";
  const helper = `${COMPRESSION_MARKER}\nconst INTAKE_IMAGE_TARGET_BYTES = 180_000;\nconst INTAKE_IMAGE_MAX_DIMENSION = 1200;\nconst INTAKE_REQUEST_TARGET_BYTES = 900_000;\n\nasync function prepareIntakeFile(file: File): Promise<File> {\n  if (!file.type.startsWith(\"image/\") || file.size <= INTAKE_IMAGE_TARGET_BYTES) return file;\n  const bitmap = await createImageBitmap(file);\n  try {\n    let width = bitmap.width;\n    let height = bitmap.height;\n    const scale = Math.min(1, INTAKE_IMAGE_MAX_DIMENSION / Math.max(width, height));\n    width = Math.max(1, Math.round(width * scale));\n    height = Math.max(1, Math.round(height * scale));\n    let blob: Blob | null = null;\n    let quality = 0.76;\n    for (let attempt = 0; attempt < 9; attempt += 1) {\n      const canvas = document.createElement(\"canvas\");\n      canvas.width = width;\n      canvas.height = height;\n      const context = canvas.getContext(\"2d\");\n      if (!context) return file;\n      context.drawImage(bitmap, 0, 0, width, height);\n      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, \"image/jpeg\", quality));\n      if (blob && blob.size <= INTAKE_IMAGE_TARGET_BYTES) break;\n      quality = Math.max(0.4, quality - 0.07);\n      width = Math.max(520, Math.round(width * 0.82));\n      height = Math.max(520, Math.round(height * 0.82));\n    }\n    if (!blob || blob.size >= file.size) return file;\n    const base = file.name.replace(/\\.[^.]+$/, \"\") || \"document\";\n    return new File([blob], \`\${base}.jpg\`, { type: \"image/jpeg\", lastModified: file.lastModified });\n  } finally {\n    bitmap.close();\n  }\n}\n\n`;
  if (!runtime.includes(anchor)) throw new Error("Could not locate responseError helper.");
  runtime = runtime.replace(anchor, helper + anchor);
}

runtime = runtime
  .replace("const INTAKE_IMAGE_TARGET_BYTES = 700_000;", "const INTAKE_IMAGE_TARGET_BYTES = 180_000;")
  .replace("const INTAKE_IMAGE_MAX_DIMENSION = 1500;", "const INTAKE_IMAGE_MAX_DIMENSION = 1200;");
if (!runtime.includes("const INTAKE_REQUEST_TARGET_BYTES")) {
  runtime = runtime.replace(
    "const INTAKE_IMAGE_MAX_DIMENSION = 1200;",
    "const INTAKE_IMAGE_MAX_DIMENSION = 1200;\nconst INTAKE_REQUEST_TARGET_BYTES = 900_000;",
  );
}

const uploadBefore = `      const body = new FormData();\n      files.forEach((file) => body.append("files", file));\n      const response = await fetch("/api/intake-analysis", { method: "POST", body });`;
const compressedUpload = `      const body = new FormData();\n      for (const file of files) body.append("files", await prepareIntakeFile(file));\n      const response = await fetch("/api/intake-analysis", { method: "POST", body });`;
const guardedUpload = `      ${REQUEST_LIMIT_MARKER}\n      const preparedFiles: File[] = [];\n      for (const file of files) preparedFiles.push(await prepareIntakeFile(file));\n      const preparedBytes = preparedFiles.reduce((total, file) => total + file.size, 0);\n      if (preparedBytes > INTAKE_REQUEST_TARGET_BYTES) {\n        throw new Error(\`The selected documents are still too large after compression (\${Math.ceil(preparedBytes / 1024)} KB). Upload fewer documents at once or use smaller PDF/Word files.\`);\n      }\n      const body = new FormData();\n      preparedFiles.forEach((file) => body.append("files", file));\n      const response = await fetch("/api/intake-analysis", { method: "POST", body });`;
if (!runtime.includes(REQUEST_LIMIT_MARKER)) {
  if (runtime.includes(compressedUpload)) runtime = runtime.replace(compressedUpload, guardedUpload);
  else if (runtime.includes(uploadBefore)) runtime = runtime.replace(uploadBefore, guardedUpload);
  else throw new Error("Could not locate create-truck intake upload block.");
}

if (!runtime.includes(AVAILABILITY_MARKER)) {
  runtime = runtime.replace(
    `type SuggestedPayments = {\n  values: string[];\n  confidence: number;\n  source: string;\n};`,
    `type SuggestedPayments = {\n  values: string[];\n  confidence: number;\n  source: string;\n};\n\n${AVAILABILITY_MARKER}\ntype SuggestedAvailability = {\n  day: number;\n  enabled: boolean;\n  start: string;\n  end: string;\n  confidence: number;\n  source: string;\n};`,
  );
  runtime = runtime.replace(
    `    notes: SuggestedField;\n  };`,
    `    notes: SuggestedField;\n  };\n  availability: SuggestedAvailability[];`,
  );
  runtime = runtime.replace(
    `  return filled;\n}\n\nexport default function DocumentIntakeRuntime()`,
    `  if (analysis.availability?.length) {\n    for (const slot of analysis.availability) {\n      if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) continue;\n      const dayCheckbox = form.querySelector<HTMLInputElement>(\`input[name="availabilityDays"][value="\${slot.day}"]\`);\n      const startInput = form.querySelector<HTMLInputElement>(\`input[name="start_\${slot.day}"]\`);\n      const endInput = form.querySelector<HTMLInputElement>(\`input[name="end_\${slot.day}"]\`);\n      if (dayCheckbox && (replaceExisting || !dayCheckbox.checked)) {\n        setNativeChecked(dayCheckbox, slot.enabled);\n        filled += 1;\n      }\n      if (slot.enabled && startInput && slot.start && (replaceExisting || startInput.value === "11:00")) {\n        setNativeValue(startInput, slot.start);\n        filled += 1;\n      }\n      if (slot.enabled && endInput && slot.end && (replaceExisting || endInput.value === "15:00")) {\n        setNativeValue(endInput, slot.end);\n        filled += 1;\n      }\n    }\n  }\n\n  return filled;\n}\n\nexport default function DocumentIntakeRuntime()`,
  );
  runtime = runtime.replace(
    `    if (analysis.fields.paymentTypes.values.length) {`,
    `    if (analysis.availability?.some((slot) => slot.enabled)) {\n      const enabled = analysis.availability.filter((slot) => slot.enabled);\n      values.push({\n        key: "availability",\n        label: "Weekly Availability",\n        value: enabled.map((slot) => {\n          const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][slot.day] || \`Day \${slot.day}\`;\n          return \`\${day} \${slot.start || "?"}–\${slot.end || "?"}\`;\n        }).join(", "),\n        confidence: Math.min(...enabled.map((slot) => slot.confidence || 0)),\n        source: enabled.map((slot) => slot.source).filter(Boolean).join(", "),\n      });\n    }\n    if (analysis.fields.paymentTypes.values.length) {`,
  );
}

await writeFile(RUNTIME_PATH, runtime);

let route = await readFile(ROUTE_PATH, "utf8");
if (!route.includes(AVAILABILITY_MARKER)) {
  route = route.replace(
    `type PaymentSuggestion = { values: string[]; confidence: number; source: string };`,
    `type PaymentSuggestion = { values: string[]; confidence: number; source: string };\n${AVAILABILITY_MARKER}\ntype AvailabilitySuggestion = { day: number; enabled: boolean; start: string; end: string; confidence: number; source: string };`,
  );
  route = route.replace(
    `  documents?: Array<{ fileName?: string; type?: string; summary?: string }>;`,
    `  availability?: AvailabilitySuggestion[];\n  documents?: Array<{ fileName?: string; type?: string; summary?: string }>;`,
  );
  route = route.replace(
    `    documents: (Array.isArray(raw.documents) ? raw.documents : []).slice(0, MAX_FILES).map((document) => ({`,
    `    availability: (Array.isArray(raw.availability) ? raw.availability : []).slice(0, 7).map((slot) => ({\n      day: Math.max(0, Math.min(6, Math.round(Number(slot?.day) || 0))),\n      enabled: Boolean(slot?.enabled),\n      start: /^([01]\\d|2[0-3]):[0-5]\\d$/.test(cleanText(slot?.start, 5)) ? cleanText(slot?.start, 5) : "",\n      end: /^([01]\\d|2[0-3]):[0-5]\\d$/.test(cleanText(slot?.end, 5)) ? cleanText(slot?.end, 5) : "",\n      confidence: boundedConfidence(slot?.confidence),\n      source: cleanText(slot?.source, 180),\n    })).sort((left, right) => left.day - right.day),\n    documents: (Array.isArray(raw.documents) ? raw.documents : []).slice(0, MAX_FILES).map((document) => ({`,
  );
  route = route.replace(
    `      documents: {`,
    `      availability: {\n        type: "array",\n        minItems: 7,\n        maxItems: 7,\n        items: {\n          type: "object",\n          additionalProperties: false,\n          properties: {\n            day: { type: "integer", minimum: 0, maximum: 6 },\n            enabled: { type: "boolean" },\n            start: { type: "string" },\n            end: { type: "string" },\n            confidence: { type: "number", minimum: 0, maximum: 1 },\n            source: { type: "string" },\n          },\n          required: ["day", "enabled", "start", "end", "confidence", "source"],\n        },\n      },\n      documents: {`,
  );
  route = route.replace(
    `    required: ["fields", "documents", "warnings"],`,
    `    required: ["fields", "availability", "documents", "warnings"],`,
  );
  route = route.replace(
    `    \"Return expiration dates as YYYY-MM-DD only when clear.\",`,
    `    \"Return expiration dates as YYYY-MM-DD only when clear.\",\n    \"Extract weekly availability for all seven days using day numbers 0=Sunday through 6=Saturday. Mark enabled false when the document explicitly says closed or unavailable. For enabled days, return 24-hour HH:MM start and end times. If a day is not mentioned, return enabled false with empty times and low confidence rather than guessing.\",`,
  );
  route = route.replace(
    `const ROUTE_VERSION = "ai-provider-analysis-v5-direct";`,
    `const ROUTE_VERSION = "ai-provider-analysis-v6-availability";`,
  );
  route = route.replace(
    `          warnings: openAiFailure\n            ? [...result.analysis.warnings, "OpenAI was unavailable, so Workers AI was used instead."]\n            : result.analysis.warnings,`,
    `          warnings: openAiFailure\n            ? [...result.analysis.warnings, \`OpenAI was unavailable at \${String(openAiFailure.diagnostic?.stage || "analysis")}: \${openAiFailure.message} Workers AI was used instead.\`]\n            : result.analysis.warnings,\n          fallbackDetails: openAiFailure ? { message: openAiFailure.message, ...openAiFailure.diagnostic } : undefined,`,
  );
}
await writeFile(ROUTE_PATH, route);
