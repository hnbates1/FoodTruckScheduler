import { readFile, writeFile } from "node:fs/promises";

const ROUTE_PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const MARKER = "// openai-file-purpose-compat-v3";

let source = await readFile(ROUTE_PATH, "utf8");
if (!source.includes(MARKER)) {
  const before = `  const body = new FormData();
  body.append("purpose", "user_data");
  body.append("expires_after[anchor]", "created_at");
  body.append("expires_after[seconds]", "3600");
  body.append("file", file, file.name);`;
  const after = `  ${MARKER}
  const body = new FormData();
  // "assistants" is accepted by older and newer Files API deployments and
  // remains valid when the resulting file_id is passed to the Responses API.
  // Files are explicitly deleted in analyzeWithOpenAi's finally block.
  body.append("purpose", "assistants");
  body.append("file", file, file.name);`;

  if (!source.includes(before)) {
    throw new Error("Could not locate the OpenAI file upload purpose block.");
  }
  source = source.replace(before, after);
  await writeFile(ROUTE_PATH, source);
}
