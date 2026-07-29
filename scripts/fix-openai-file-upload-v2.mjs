import { readFile, writeFile } from "node:fs/promises";

const ROUTE_PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const MARKER = "// openai-files-api-v2";

let source = await readFile(ROUTE_PATH, "utf8");
if (!source.includes(MARKER)) {
  const start = source.indexOf("async function analyzeWithOpenAi(");
  const end = source.indexOf("async function analyzeWithWorkers", start);
  if (start < 0 || end < 0) throw new Error("Could not locate OpenAI analysis function.");

  const replacement = `${MARKER}
async function uploadOpenAiFile(apiKey: string, file: File) {
  const body = new FormData();
  body.append("purpose", "user_data");
  body.append("expires_after[anchor]", "created_at");
  body.append("expires_after[seconds]", "3600");
  body.append("file", file, file.name);
  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { authorization: \`Bearer \${apiKey}\` },
    body,
  });
  const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const message = raw.error && typeof raw.error === "object"
      ? cleanText((raw.error as Record<string, unknown>).message, 500)
      : "";
    throw new PublicError(message || \`OpenAI file upload returned status \${response.status}.\`, response.status >= 400 && response.status < 500 ? 422 : 502);
  }
  const id = cleanText(raw.id, 160);
  if (!id) throw new PublicError("OpenAI did not return a file identifier.", 502);
  return id;
}

async function deleteOpenAiFile(apiKey: string, fileId: string) {
  await fetch(\`https://api.openai.com/v1/files/\${encodeURIComponent(fileId)}\`, {
    method: "DELETE",
    headers: { authorization: \`Bearer \${apiKey}\` },
  }).catch(() => undefined);
}

async function analyzeWithOpenAi(
  apiKey: string,
  model: string,
  files: File[],
) {
  const uploadedIds: string[] = [];
  try {
    for (const file of files) uploadedIds.push(await uploadOpenAiFile(apiKey, file));
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
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Analyze every supplied file together. Return the structured food-truck intake result.",
              },
              ...uploadedIds.map((fileId) => ({ type: "input_file", file_id: fileId })),
            ],
          },
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
    if (!output) throw new PublicError("OpenAI returned no document analysis.", 502);
    return normalizeExtraction(parseExtraction(output));
  } finally {
    await Promise.all(uploadedIds.map((fileId) => deleteOpenAiFile(apiKey, fileId)));
  }
}

`;

  source = source.slice(0, start) + replacement + source.slice(end);
  await writeFile(ROUTE_PATH, source);
}
