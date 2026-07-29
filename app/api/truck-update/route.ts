import { requireSession } from "../../lib/guard";

export const dynamic = "force-dynamic";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results: T[] }>;
};

type D1 = {
  prepare(query: string): D1Statement;
};

type RuntimeBindings = {
  DB: D1;
};

const FIELD_COLUMNS = {
  name: "name",
  cuisine: "cuisine",
  contact: "contact",
  phone: "phone",
  email: "email",
  insuranceExpiry: "insurance_expiry",
  licenseExpiry: "license_expiry",
  paymentTypes: "payment_types",
  notes: "notes",
} as const;

type FieldName = keyof typeof FIELD_COLUMNS;

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function integer(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function editorRole(role: string) {
  return role === "admin" || role === "manager";
}

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validDate(value: string) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function validEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function database() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as RuntimeBindings).DB;
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!editorRole(session.user.role)) return json({ error: "This account has view-only access." }, 403);

  const payload = await request.json().catch(() => ({})) as Record<string, unknown>;
  const truckId = integer(payload.truckId);
  const suppliedFields = payload.fields && typeof payload.fields === "object"
    ? payload.fields as Record<string, unknown>
    : {};
  if (!truckId) return json({ error: "Choose a valid truck." }, 400);

  const cleaned = new Map<FieldName, string>();
  for (const field of Object.keys(FIELD_COLUMNS) as FieldName[]) {
    if (!(field in suppliedFields)) continue;
    const maximum = field === "notes" ? 4000 : field === "paymentTypes" ? 500 : 300;
    cleaned.set(field, clean(suppliedFields[field], maximum));
  }
  if (!cleaned.size) return json({ error: "Choose at least one field to update." }, 400);

  const insuranceExpiry = cleaned.get("insuranceExpiry");
  const licenseExpiry = cleaned.get("licenseExpiry");
  const email = cleaned.get("email");
  if (insuranceExpiry !== undefined && !validDate(insuranceExpiry)) {
    return json({ error: "Insurance expiration must use YYYY-MM-DD." }, 400);
  }
  if (licenseExpiry !== undefined && !validDate(licenseExpiry)) {
    return json({ error: "Food-license expiration must use YYYY-MM-DD." }, 400);
  }
  if (email !== undefined && !validEmail(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  try {
    const db = await database();
    const exists = await db.prepare("SELECT id FROM trucks WHERE id = ?").bind(truckId).all<{ id: number }>();
    if (!exists.results[0]) return json({ error: "That truck no longer exists." }, 404);

    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [field, value] of cleaned) {
      assignments.push(`${FIELD_COLUMNS[field]} = ?`);
      values.push(value);
    }
    values.push(truckId);
    await db.prepare(`UPDATE trucks SET ${assignments.join(", ")} WHERE id = ?`).bind(...values).run();
    return json({ ok: true, updatedFields: Array.from(cleaned.keys()) });
  } catch (error) {
    console.error("truck update PUT", error);
    return json({ error: "The truck profile could not be updated." }, 500);
  }
}
