import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = process.cwd();
const PROTECTED_DATABASE_ID = "ef9a2f0f-cd45-4895-8aca-f389a324b4ec";
const PROTECTED_BUCKET = "food-truck-admin-logos";

async function sourceFiles(directory) {
  const absolute = path.join(ROOT, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(relative));
    else if (/\.(?:ts|tsx|js|mjs|sql|jsonc|ya?ml)$/i.test(entry.name)) files.push(relative);
  }

  return files;
}

function destructiveTruckSql(source) {
  const normalized = source.replace(/\s+/g, " ").toLowerCase();
  return [
    "drop table trucks",
    "drop table if exists trucks",
    "truncate table trucks",
    "delete from trucks",
  ].some((statement) => normalized.includes(statement));
}

function deletesTruckDocuments(source) {
  return source.replace(/\s+/g, " ").toLowerCase().includes("delete from truck_documents");
}

test("production storage bindings stay attached to the existing data", async () => {
  const wrangler = await readFile(path.join(ROOT, "wrangler.jsonc"), "utf8");
  assert.match(wrangler, new RegExp(`\"database_id\"\\s*:\\s*\"${PROTECTED_DATABASE_ID}\"`));
  assert.match(wrangler, new RegExp(`\"bucket_name\"\\s*:\\s*\"${PROTECTED_BUCKET}\"`));
});

test("automatic runtime code cannot delete trucks", async () => {
  const runtime = await readFile(path.join(ROOT, "app", "AppRuntime.tsx"), "utf8");
  assert.doesNotMatch(runtime, /\/api\/data\?id=/);
  assert.doesNotMatch(runtime, /delete\s+from\s+trucks/i);
});

test("destructive truck SQL exists only in the explicit admin delete endpoint", async () => {
  const protectedRoots = ["app", "drizzle", "worker"];
  const files = (await Promise.all(protectedRoots.map(sourceFiles))).flat();
  const explicitDeleteRoute = path.normalize("app/api/data/route.ts");
  const violations = [];

  for (const file of files) {
    if (path.normalize(file) === explicitDeleteRoute) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (destructiveTruckSql(source)) violations.push(file);
  }

  assert.deepEqual(violations, []);

  const route = await readFile(path.join(ROOT, explicitDeleteRoute), "utf8");
  assert.match(route, /session\.user\.role\s*!==\s*\"admin\"/);
  assert.match(route, /DELETE FROM trucks WHERE id/);
});

test("stored truck documents can only be deleted through their explicit endpoint", async () => {
  const protectedRoots = ["app", "drizzle", "worker"];
  const files = (await Promise.all(protectedRoots.map(sourceFiles))).flat();
  const explicitDocumentRoute = path.normalize("app/api/truck-documents/route.ts");
  const violations = [];

  for (const file of files) {
    if (path.normalize(file) === explicitDocumentRoute) continue;
    const source = await readFile(path.join(ROOT, file), "utf8");
    if (deletesTruckDocuments(source)) violations.push(file);
  }

  assert.deepEqual(violations, []);
  const route = await readFile(path.join(ROOT, explicitDocumentRoute), "utf8");
  assert.match(route, /editorRole\(session\.user\.role\)/);
  assert.match(route, /DELETE FROM truck_documents WHERE id = \?/);

  const controls = await readFile(path.join(ROOT, "app", "ExistingTruckDocumentsRuntime.tsx"), "utf8");
  assert.match(controls, /window\.confirm\(`Delete \$\{document\.fileName\}\?/);
});

test("AI suggestions require explicit field selection and confirmation", async () => {
  const controls = await readFile(path.join(ROOT, "app", "ExistingTruckDocumentsRuntime.tsx"), "utf8");
  assert.match(controls, /selectedFields\.has\(row\.field\)/);
  assert.match(controls, /window\.confirm\(`Apply \$\{selectedRows\.length\} reviewed/);
  assert.match(controls, /Apply Selected Updates/);

  const updateRoute = await readFile(path.join(ROOT, "app", "api", "truck-update", "route.ts"), "utf8");
  assert.match(updateRoute, /Choose at least one field to update/);
  assert.match(updateRoute, /Object\.keys\(FIELD_COLUMNS\)/);
});
