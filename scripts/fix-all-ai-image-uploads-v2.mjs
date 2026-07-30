import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const APP_DIR = path.resolve("app");
const MARKER = "// ai-upload-image-prep-v2";

const helper = `${MARKER}
async function prepareAiUploadFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 900_000) return file;
  return await new Promise<File>((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      try {
        const maxDimension = 1800;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) return resolve(file);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const finish = (blob: Blob | null) => {
          if (!blob || blob.size >= file.size) return resolve(file);
          const stem = file.name.replace(/\.[^.]+$/, "") || "document";
          resolve(new File([blob], `${stem}.jpg`, { type: "image/jpeg", lastModified: file.lastModified }));
        };
        canvas.toBlob(finish, "image/jpeg", 0.76);
      } catch {
        resolve(file);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    image.src = url;
  });
}
`;

async function walk(dir) {
  const entries = await readdir(dir);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) files.push(...await walk(full));
    else if (/\.(tsx|ts|jsx|js)$/.test(entry)) files.push(full);
  }
  return files;
}

let changed = 0;
for (const filePath of await walk(APP_DIR)) {
  let source = await readFile(filePath, "utf8");
  if (!source.includes("/api/intake-analysis") || !source.includes("use client")) continue;

  if (!source.includes(MARKER)) {
    const importEnd = source.lastIndexOf("import ");
    if (importEnd >= 0) {
      const lineEnd = source.indexOf("\n", importEnd);
      source = source.slice(0, lineEnd + 1) + "\n" + helper + "\n" + source.slice(lineEnd + 1);
    } else {
      source = helper + "\n" + source;
    }
  }

  source = source.replace(
    /([A-Za-z_$][\w$]*)\.forEach\(\(file\) => ([A-Za-z_$][\w$]*)\.append\("files", file\)\);/g,
    'for (const file of await Promise.all($1.map(prepareAiUploadFile))) $2.append("files", file);',
  );

  source = source.replace(
    /for \(const file of ([A-Za-z_$][\w$]*)\) \{\s*([A-Za-z_$][\w$]*)\.append\("files", file\);\s*\}/g,
    'for (const file of await Promise.all($1.map(prepareAiUploadFile))) { $2.append("files", file); }',
  );

  await writeFile(filePath, source);
  changed += 1;
}

if (!changed) throw new Error("No client-side intake-analysis uploaders were found.");
console.log(`Prepared ${changed} AI upload component(s).`);
