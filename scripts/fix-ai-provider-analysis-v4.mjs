import { readFile, writeFile } from "node:fs/promises";

const PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const MARKER = "// ai-provider-analysis-v4";
let source = await readFile(PATH, "utf8");

if (!source.includes(MARKER)) {
  source = source.replace(
    "const DEFAULT_OPENAI_MODEL = \"gpt-4.1-mini\";",
    "const DEFAULT_OPENAI_MODEL = \"gpt-4.1-mini\";\n" + MARKER,
  );
}

const oldOutputParser = /function openAiOutputText\(result: unknown\) \{[\s\S]*?\n\}\n\n\/\/ openai-files-api-v2/;
const newOutputParser = `function providerText(result: unknown): string {
  if (typeof result === "string") return result.trim();
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  for (const key of ["output_text", "response", "text", "content"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  for (const key of ["output", "result", "choices", "messages"]) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const text = providerText(item);
      if (text) return text;
    }
  }
  if (record.message && typeof record.message === "object") {
    const text = providerText(record.message);
    if (text) return text;
  }
  return "";
}

function openAiOutputText(result: unknown) {
  return providerText(result);
}

// openai-files-api-v2`;
if (!oldOutputParser.test(source)) throw new Error("Could not locate OpenAI output parser.");
source = source.replace(oldOutputParser, newOutputParser);

const oldOpenAi = /async function analyzeWithOpenAi\([\s\S]*?\n\}\n\nasync function analyzeWithWorkers/;
const newOpenAi = `async function analyzeWithOpenAi(
  apiKey: string,
  model: string,
  files: File[],
) {
  const uploadedIds: string[] = [];
  try {
    const userContent: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: "Analyze every supplied file together. Return the structured food-truck intake result.",
    }];

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        userContent.push(await openAiFileInput(file));
      } else {
        const fileId = await uploadOpenAiFile(apiKey, file);
        uploadedIds.push(fileId);
        userContent.push({ type: "input_file", file_id: fileId });
      }
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: \`Bearer \${apiKey}\`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: extractionInstructions() }],
          },
          { role: "user", content: userContent },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "food_truck_intake",
            strict: true,
            schema: extractionSchema(),
          },
        },
      }),
    });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const error = raw.error && typeof raw.error === "object"
        ? cleanText((raw.error as Record<string, unknown>).message, 500)
        : "";
      throw new PublicError(error || \`OpenAI returned status \${response.status}.\`, response.status >= 400 && response.status < 500 ? 422 : 502);
    }
    const output = openAiOutputText(raw);
    if (!output) {
      const status = cleanText(raw.status, 80);
      const incomplete = raw.incomplete_details && typeof raw.incomplete_details === "object"
        ? cleanText((raw.incomplete_details as Record<string, unknown>).reason, 180)
        : "";
      throw new PublicError(
        ["OpenAI returned no document analysis.", status ? \`Status: \${status}.\` : "", incomplete ? \`Reason: \${incomplete}.\` : ""].filter(Boolean).join(" "),
        502,
      );
    }
    return normalizeExtraction(parseExtraction(output));
  } finally {
    await Promise.all(uploadedIds.map((fileId) => deleteOpenAiFile(apiKey, fileId)));
  }
}

async function analyzeWithWorkers`;
if (!oldOpenAi.test(source)) throw new Error("Could not locate analyzeWithOpenAi.");
source = source.replace(oldOpenAi, newOpenAi);

const oldWorkersResult = `  const result = await ai.run(WORKERS_MODEL, {
    messages: [
      { role: "system", content: extractionInstructions() },
      { role: "user", content: documentText },
    ],
    temperature: 0,
    max_tokens: 1800,
    response_format: {
      type: "json_schema",
      json_schema: extractionSchema(),
    },
  });
  const analysis = normalizeExtraction(parseExtraction(result));`;
const newWorkersResult = `  const request = {
    messages: [
      { role: "system", content: extractionInstructions() },
      { role: "user", content: documentText + "\\n\\nReturn JSON only." },
    ],
    temperature: 0,
    max_tokens: 1800,
  };
  let result = await ai.run(WORKERS_MODEL, {
    ...request,
    response_format: {
      type: "json_schema",
      json_schema: { name: "food_truck_intake", strict: true, schema: extractionSchema() },
    },
  });
  let responseText = providerText(result);
  if (!responseText) {
    result = await ai.run(WORKERS_MODEL, request);
    responseText = providerText(result);
  }
  if (!responseText) throw new PublicError("Workers AI returned an empty response.", 502);
  const analysis = normalizeExtraction(parseExtraction(responseText));`;
if (!source.includes(oldWorkersResult)) throw new Error("Could not locate Workers AI request block.");
source = source.replace(oldWorkersResult, newWorkersResult);

const oldFailureBlock = `        throw new PublicError(
          openAiFailure
            ? \`OpenAI could not analyze the files, and the backup analyzer also failed. \${workersFailure}\`
            : workersFailure,
          error instanceof PublicError ? error.status : 502,
        );`;
const newFailureBlock = `        throw new PublicError(
          openAiFailure
            ? \`OpenAI failed: \${openAiFailure} Workers AI failed: \${workersFailure}\`
            : \`Workers AI failed: \${workersFailure}\`,
          error instanceof PublicError ? error.status : 502,
        );`;
if (!source.includes(oldFailureBlock)) throw new Error("Could not locate provider failure block.");
source = source.replace(oldFailureBlock, newFailureBlock);

source = source.replace(
  'routeVersion: "openai-files-api-v2",',
  'routeVersion: "ai-provider-analysis-v4",',
);

await writeFile(PATH, source);
