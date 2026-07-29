import { readFile, writeFile } from "node:fs/promises";

const CLIENT_PATH = new URL("../app/ExistingTruckDocumentsRuntime.tsx", import.meta.url);
const ROUTE_PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const CLIENT_MARKER = "analysis-runtime-diagnostics-v1";
const ROUTE_MARKER = "analysis-runtime-status-v1";

let client = await readFile(CLIENT_PATH, "utf8");
if (!client.includes(CLIENT_MARKER)) {
  client = client.replace(
`async function errorMessage(response: Response, fallback: string) {
  try {
    const value = await response.json() as { error?: string };
    return value.error || fallback;
  } catch {
    return fallback;
  }
}`,
`// ${CLIENT_MARKER}
async function errorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get("content-type") || "unknown content type";
  const copy = response.clone();
  try {
    const value = await response.json() as { error?: string; diagnostic?: string };
    const message = value.error || fallback;
    const diagnostic = value.diagnostic ? \` [\${value.diagnostic}]\` : "";
    return \`\${message}\${diagnostic} (HTTP \${response.status})\`;
  } catch {
    const raw = await copy.text().catch(() => "");
    const excerpt = raw.replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 240);
    return \`\${fallback} (HTTP \${response.status}; \${contentType})\${excerpt ? \`: \${excerpt}\` : ""}\`;
  }
}

async function analyzerStatus() {
  try {
    const response = await fetch("/api/intake-analysis", { cache: "no-store" });
    const value = await response.json() as { routeVersion?: string; openAiConfigured?: boolean; workersAiConfigured?: boolean };
    return \` Analyzer status: route \${value.routeVersion || "unknown"}; OpenAI key \${value.openAiConfigured ? "detected" : "NOT detected"}; Workers AI \${value.workersAiConfigured ? "connected" : "not connected"}.\`;
  } catch {
    return " Analyzer status could not be loaded.";
  }
}`
  );

  client = client.replace(
`      if (!response.ok) throw new Error(await errorMessage(response, "The stored documents could not be analyzed."));`,
`      if (!response.ok) {
        const detail = await errorMessage(response, "The stored documents could not be analyzed.");
        throw new Error(detail + await analyzerStatus());
      }`
  );
  await writeFile(CLIENT_PATH, client);
}

let route = await readFile(ROUTE_PATH, "utf8");
if (!route.includes(ROUTE_MARKER)) {
  const insertion = `// ${ROUTE_MARKER}\nexport async function GET(request: Request) {\n  const session = await requireSession(request);\n  if (\"response\" in session) return session.response;\n  const { env } = await import(\"cloudflare:workers\");\n  const bindings = env as unknown as RuntimeBindings;\n  return json({\n    routeVersion: \"openai-files-api-v2\",\n    openAiConfigured: Boolean(String(bindings.OPENAI_API_KEY || \"\").trim()),\n    workersAiConfigured: Boolean(bindings.AI),\n  });\n}\n\n`;
  route = route.replace("export async function POST(request: Request) {", insertion + "export async function POST(request: Request) {");
  await writeFile(ROUTE_PATH, route);
}
