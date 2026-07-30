import { readFile, writeFile } from "node:fs/promises";

const PAGE_PATH = new URL("../app/page.tsx", import.meta.url);
const MARKER = "/* analysis-upload-compression-v1 */";

let source = await readFile(PAGE_PATH, "utf8");
if (!source.includes(MARKER)) {
  const helperAnchor = "function withAvailability(truck: Truck): Truck {";
  const helper = `/* analysis-upload-compression-v1 */
const ANALYSIS_IMAGE_TARGET_BYTES = 900_000;
const ANALYSIS_IMAGE_MAX_DIMENSION = 1800;

async function compressAnalysisImage(file: File) {
  if (!file.type.startsWith("image/") || file.size <= ANALYSIS_IMAGE_TARGET_BYTES) return file;
  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const initialScale = Math.min(1, ANALYSIS_IMAGE_MAX_DIMENSION / Math.max(width, height));
    width = Math.max(1, Math.round(width * initialScale));
    height = Math.max(1, Math.round(height * initialScale));

    let quality = 0.84;
    let result: Blob | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (result && result.size <= ANALYSIS_IMAGE_TARGET_BYTES) break;
      quality = Math.max(0.56, quality - 0.08);
      width = Math.max(900, Math.round(width * 0.86));
      height = Math.max(900, Math.round(height * 0.86));
    }
    if (!result || result.size >= file.size) return file;
    const baseName = file.name.replace(/\.[^.]+$/, "") || "document";
    return new File([result], \`${baseName}.jpg\`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    bitmap.close();
  }
}

async function compressAnalysisFormData(body: FormData) {
  const next = new FormData();
  for (const [name, value] of body.entries()) {
    if (value instanceof File) next.append(name, await compressAnalysisImage(value));
    else next.append(name, value);
  }
  return next;
}

`;
  if (!source.includes(helperAnchor)) throw new Error("Could not locate page helper insertion point.");
  source = source.replace(helperAnchor, helper + helperAnchor);

  const homeAnchor = "export default function Home() {\n";
  const effect = `export default function Home() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/intake-analysis") && init?.body instanceof FormData) {
        try {
          return await originalFetch(input, { ...init, body: await compressAnalysisFormData(init.body) });
        } catch (error) {
          console.warn("Image compression failed; sending the original analysis request.", error);
        }
      }
      return originalFetch(input, init);
    }) as typeof window.fetch;
    return () => { window.fetch = originalFetch; };
  }, []);
`;
  if (!source.includes(homeAnchor)) throw new Error("Could not locate Home component.");
  source = source.replace(homeAnchor, effect);

  await writeFile(PAGE_PATH, source);
}
