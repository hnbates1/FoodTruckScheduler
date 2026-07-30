import { readFile, writeFile } from "node:fs/promises";

const PATH = new URL("../app/DocumentIntakeRuntime.tsx", import.meta.url);
const MARKER = "// create-truck-analysis-compression-v1";

let source = await readFile(PATH, "utf8");

if (!source.includes(MARKER)) {
  const anchor = "function responseError(response: Response) {";
  const helper = `${MARKER}\nconst INTAKE_IMAGE_TARGET_BYTES = 700_000;\nconst INTAKE_IMAGE_MAX_DIMENSION = 1500;\n\nasync function prepareIntakeFile(file: File): Promise<File> {\n  if (!file.type.startsWith(\"image/\") || file.size <= INTAKE_IMAGE_TARGET_BYTES) return file;\n  const bitmap = await createImageBitmap(file);\n  try {\n    let width = bitmap.width;\n    let height = bitmap.height;\n    const scale = Math.min(1, INTAKE_IMAGE_MAX_DIMENSION / Math.max(width, height));\n    width = Math.max(1, Math.round(width * scale));\n    height = Math.max(1, Math.round(height * scale));\n    let blob: Blob | null = null;\n    let quality = 0.8;\n    for (let attempt = 0; attempt < 7; attempt += 1) {\n      const canvas = document.createElement(\"canvas\");\n      canvas.width = width;\n      canvas.height = height;\n      const context = canvas.getContext(\"2d\");\n      if (!context) return file;\n      context.drawImage(bitmap, 0, 0, width, height);\n      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, \"image/jpeg\", quality));\n      if (blob && blob.size <= INTAKE_IMAGE_TARGET_BYTES) break;\n      quality = Math.max(0.45, quality - 0.08);\n      width = Math.max(640, Math.round(width * 0.82));\n      height = Math.max(640, Math.round(height * 0.82));\n    }\n    if (!blob || blob.size >= file.size) return file;\n    const base = file.name.replace(/\\.[^.]+$/, \"\") || \"document\";\n    return new File([blob], \`\${base}.jpg\`, { type: \"image/jpeg\", lastModified: file.lastModified });\n  } finally {\n    bitmap.close();\n  }\n}\n\n`;
  if (!source.includes(anchor)) throw new Error("Could not locate responseError helper.");
  source = source.replace(anchor, helper + anchor);
}

const before = `      const body = new FormData();\n      files.forEach((file) => body.append("files", file));\n      const response = await fetch("/api/intake-analysis", { method: "POST", body });`;
const after = `      const body = new FormData();\n      for (const file of files) body.append("files", await prepareIntakeFile(file));\n      const response = await fetch("/api/intake-analysis", { method: "POST", body });`;

if (!source.includes(after)) {
  if (!source.includes(before)) throw new Error("Could not locate create-truck intake upload block.");
  source = source.replace(before, after);
}

await writeFile(PATH, source);
