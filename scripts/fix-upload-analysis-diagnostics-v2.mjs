import { readFile, writeFile } from "node:fs/promises";

const CLIENT_PATH = new URL("../app/ExistingTruckDocumentsRuntime.tsx", import.meta.url);
const MARKER = "upload-analysis-diagnostics-v2";

let client = await readFile(CLIENT_PATH, "utf8");
const oldBlock = `      if (!analysisResponse.ok) {
        setError(\`The files were saved, but AI analysis failed: \${await errorMessage(analysisResponse, "The documents could not be analyzed.")}\`);
        return;
      }`;
const newBlock = `      if (!analysisResponse.ok) {
        const detail = await errorMessage(analysisResponse, "The documents could not be analyzed.");
        setError(\`The files were saved, but AI analysis failed: \${detail}\${await analyzerStatus()}\`);
        return;
      }`;

if (!client.includes(newBlock)) {
  if (!client.includes(oldBlock)) {
    throw new Error("Could not locate the Upload and Analyze error branch.");
  }
  client = client.replace(oldBlock, newBlock);
}
if (!client.includes(`// ${MARKER}`)) {
  client = client.replace("async function analyzerStatus() {", `// ${MARKER}\nasync function analyzerStatus() {`);
}
await writeFile(CLIENT_PATH, client);
