"use client";

import { useEffect } from "react";

const TARGET_BYTES = 850_000;
const MAX_DIMENSION = 1600;

async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= TARGET_BYTES) return file;

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));

    let blob: Blob | null = null;
    let quality = 0.82;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= TARGET_BYTES) break;
      quality = Math.max(0.5, quality - 0.08);
      width = Math.max(720, Math.round(width * 0.84));
      height = Math.max(720, Math.round(height * 0.84));
    }

    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "document";
    return new File([blob], `${base}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

async function compressFormData(body: FormData): Promise<FormData> {
  const next = new FormData();
  for (const [name, value] of body.entries()) {
    if (value instanceof File) next.append(name, await compressImage(value));
    else next.append(name, value);
  }
  return next;
}

export default function AnalysisUploadCompressionRuntime() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

      if (url.includes("/api/intake-analysis") && init?.body instanceof FormData) {
        const compressedBody = await compressFormData(init.body);
        return originalFetch(input, { ...init, body: compressedBody });
      }

      return originalFetch(input, init);
    }) as typeof window.fetch;

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null;
}
