import { readFile, writeFile } from "node:fs/promises";

const FILE_PATH = new URL("../app/ExistingTruckDocumentsRuntime.tsx", import.meta.url);
const MARKER = "async function analyzeStoredDocuments()";
let source = await readFile(FILE_PATH, "utf8");

if (!source.includes(MARKER)) {
  const beforeFunction = `  function toggleField(field: UpdateField) {`;
  const functionCode = `  async function analyzeStoredDocuments() {
    if (!truck || !documents.length) return;
    setBusy(true);
    setError("");
    setMessage("");
    setAnalysis(null);
    setSelectedFields(new Set());
    try {
      const body = new FormData();
      const selectedDocuments = documents.slice(0, 6);
      for (const document of selectedDocuments) {
        const response = await fetch(\`/api/truck-documents?id=\${document.id}\`, { cache: "no-store" });
        if (!response.ok) throw new Error(await errorMessage(response, \`\${document.fileName} could not be downloaded for analysis.\`));
        const blob = await response.blob();
        body.append("files", new File([blob], document.fileName, { type: document.contentType || blob.type || "application/octet-stream" }));
      }
      const response = await fetch("/api/intake-analysis", { method: "POST", body });
      if (!response.ok) throw new Error(await errorMessage(response, "The stored documents could not be analyzed."));
      const result = await response.json() as IntakeAnalysis;
      setAnalysis(result);
      const suggestedRows = reviewRows(truck, result);
      setSelectedFields(new Set(suggestedRows.filter((row) => row.confidence >= 0.6).map((row) => row.field)));
      setMessage(\`\${selectedDocuments.length} stored \${selectedDocuments.length === 1 ? "document was" : "documents were"} analyzed. Review the suggested changes below.\`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The stored documents could not be analyzed.");
    } finally {
      setBusy(false);
    }
  }

`;
  if (!source.includes(beforeFunction)) throw new Error("Could not find the stored-document analysis insertion point.");
  source = source.replace(beforeFunction, functionCode + beforeFunction);

  const beforeButtons = `<div className="existing-upload-actions"><button className="primary" type="button" disabled={busy || !files.length} onClick={() => void uploadAndAnalyze()}>{busy ? "Uploading and Analyzing…" : "Upload and Analyze"}</button></div>`;
  const afterButtons = `<div className="existing-upload-actions">{documents.length > 0 && <button className="secondary" type="button" disabled={busy} onClick={() => void analyzeStoredDocuments()}>{busy ? "Analyzing…" : "Analyze Stored Documents"}</button>}<button className="primary" type="button" disabled={busy || !files.length} onClick={() => void uploadAndAnalyze()}>{busy ? "Uploading and Analyzing…" : "Upload and Analyze"}</button></div>`;
  if (!source.includes(beforeButtons)) throw new Error("Could not find the existing document action buttons.");
  source = source.replace(beforeButtons, afterButtons);

  source = source.replace(
    `.existing-upload-actions{display:flex;justify-content:flex-end}`,
    `.existing-upload-actions{display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap}`,
  );

  await writeFile(FILE_PATH, source);
}
