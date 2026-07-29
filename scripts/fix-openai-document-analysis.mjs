import { readFile, writeFile } from "node:fs/promises";

const ROUTE_PATH = new URL("../app/api/intake-analysis/route.ts", import.meta.url);
const MARKER = "// openai-document-analysis-compat-v1";

let source = await readFile(ROUTE_PATH, "utf8");
if (!source.includes(MARKER)) {
  source = source.replace(
    'const DEFAULT_OPENAI_MODEL = "gpt-5-mini";',
    'const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";\n' + MARKER,
  );

  source = source.replace(
    '      file_data: base64,',
    '      file_data: `data:${file.type || "application/octet-stream"};base64,${base64}`,'
  );

  source = source.replace(
    '  if (error instanceof PublicError) return json({ error: error.message }, error.status);',
    '  if (error instanceof PublicError) return json({ error: error.message, diagnostic: "DOCUMENT_ANALYSIS_PROVIDER_ERROR" }, error.status);'
  );

  source = source.replace(
    '    return json({\n      error: "The documents could not be analyzed. Try a clearer scan or a smaller file.",\n    }, 500);',
    '    return json({\n      error: error instanceof Error ? `The documents could not be analyzed: ${error.message}` : "The documents could not be analyzed.",\n      diagnostic: "DOCUMENT_ANALYSIS_INTERNAL_ERROR",\n    }, 500);'
  );

  await writeFile(ROUTE_PATH, source);
}
