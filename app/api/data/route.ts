type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    run(): Promise<unknown>;
    all<T>(): Promise<{ results: T[] }>;
  };
  batch(statements: ReturnType<D1["prepare"]>[]): Promise<unknown>;
};

type R2Bucket = {
  get(key: string): Promise<{
    body: BodyInit;
    httpMetadata?: { contentType?: string };
  } | null>;
  put(key: string, value: Uint8Array, options?: {
    httpMetadata?: { contentType?: string };
  }): Promise<unknown>;
  delete(key: string): Promise<unknown>;
};

type TruckInput = {
  id?: number;
  name?: unknown;
  cuisine?: unknown;
  contact?: unknown;
  phone?: unknown;
  email?: unknown;
  insuranceExpiry?: unknown;
  licenseExpiry?: unknown;
  preferredStart?: unknown;
  preferredEnd?: unknown;
  reliability?: unknown;
  notes?: unknown;
  color?: unknown;
  availability?: unknown;
  logoData?: unknown;
  paymentTypes?: unknown;
};

type VisitInput = {
  id?: number;
  truckId?: unknown;
  visitDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  status?: unknown;
  expectedDemand?: unknown;
  notes?: unknown;
};

type AppDataInput = {
  trucks?: TruckInput[];
  visits?: VisitInput[];
};

type CalendarData = {
  trucks: Record<string, unknown>[];
  visits: Record<string, unknown>[];
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeLogo(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 500_000) return null;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    if (!binary.length || binary.length > 300_000) return null;
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { bytes, dataUrl: value, mime: match[1] };
  } catch {
    return null;
  }
}

function escapeCalendarText(value: unknown) {
  return text(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function calendarDateTime(date: unknown, time: unknown) {
  const compactDate = text(date).replace(/-/g, "");
  const compactTime = text(time).replace(/:/g, "");
  if (!/^\d{8}$/.test(compactDate) || !/^\d{4}$/.test(compactTime)) return "";
  return `${compactDate}T${compactTime}00`;
}

function foldCalendarLine(line: string) {
  const encoder = new TextEncoder();
  const lines: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const character of line) {
    const characterBytes = encoder.encode(character).length;
    const limit = lines.length ? 74 : 75;
    if (current && currentBytes + characterBytes > limit) {
      lines.push(current);
      current = ` ${character}`;
      currentBytes = 1 + characterBytes;
    } else {
      current += character;
      currentBytes += characterBytes;
    }
  }
  lines.push(current);
  return lines;
}

function buildScheduleCalendar(data: CalendarData) {
  const trucks = new Map(
    data.trucks.map((truck) => [number(truck.id), truck]),
  );
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const events = data.visits
    .filter((visit) => text(visit.status).toLowerCase() !== "cancelled")
    .sort((a, b) => `${text(a.visitDate)}${text(a.startTime)}`.localeCompare(`${text(b.visitDate)}${text(b.startTime)}`))
    .flatMap((visit) => {
      const truck = trucks.get(number(visit.truckId));
      const start = calendarDateTime(visit.visitDate, visit.startTime);
      const end = calendarDateTime(visit.visitDate, visit.endTime);
      if (!truck || !start || !end) return [];
      const status = text(visit.status, "Tentative");
      const details = [
        `Cuisine: ${text(truck.cuisine, "Not provided")}`,
        `Status: ${status}`,
        `Expected demand: ${text(visit.expectedDemand, "Not provided")}`,
        `Contact: ${text(truck.contact, "Not provided")}`,
        `Phone: ${text(truck.phone, "Not provided")}`,
        `Email: ${text(truck.email, "Not provided")}`,
        text(visit.notes) ? `Notes: ${text(visit.notes)}` : "",
      ].filter(Boolean).join("\n");
      return [[
        "BEGIN:VEVENT",
        `UID:visit-${number(visit.id)}-${text(visit.visitDate)}@food-truck-scheduler.store-0244`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=America/New_York:${start}`,
        `DTEND;TZID=America/New_York:${end}`,
        `SUMMARY:${escapeCalendarText(`Food Truck: ${text(truck.name, "Scheduled Truck")}`)}`,
        `DESCRIPTION:${escapeCalendarText(details)}`,
        `LOCATION:${escapeCalendarText("Lowe's Store 0244")}`,
        `STATUS:${status.toLowerCase() === "tentative" ? "TENTATIVE" : "CONFIRMED"}`,
        "TRANSP:TRANSPARENT",
        "CATEGORIES:FOOD TRUCK",
        "END:VEVENT",
      ]];
    });
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TruckStop Scheduler//Lowe's Store 0244//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Lowe's Store 0244 Food Trucks",
    "X-WR-TIMEZONE:America/New_York",
    "BEGIN:VTIMEZONE",
    "TZID:America/New_York",
    "X-LIC-LOCATION:America/New_York",
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0400",
    "TZNAME:EDT",
    "DTSTART:19700308T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:-0400",
    "TZOFFSETTO:-0500",
    "TZNAME:EST",
    "DTSTART:19701101T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.flatMap(foldCalendarLine).join("\r\n") + "\r\n";
}

function scheduleCalendarResponse(data: CalendarData) {
  return new Response(buildScheduleCalendar(data), {
    headers: {
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="lowes-store-0244-food-truck-schedule.ics"',
      "content-type": "text/calendar; charset=utf-8",
    },
  });
}

function postgresUrl() {
  return process.env.DATABASE_URL?.trim() || "";
}

let poolPromise: Promise<import("pg").Pool> | null = null;

async function postgres() {
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => {
      const connectionString = postgresUrl();
      const isInternalRenderUrl = connectionString.includes(".internal");
      return new Pool({
        connectionString,
        ssl: isInternalRenderUrl ? undefined : { rejectUnauthorized: false },
        max: 5,
      });
    });
  }
  const pool = await poolPromise;
  await pool.query(`CREATE TABLE IF NOT EXISTS trucks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    cuisine TEXT NOT NULL,
    contact TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    insurance_expiry TEXT NOT NULL,
    license_expiry TEXT NOT NULL,
    preferred_start TEXT NOT NULL,
    preferred_end TEXT NOT NULL,
    reliability INTEGER NOT NULL DEFAULT 85,
    notes TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#1687ff',
    availability_json TEXT NOT NULL DEFAULT '[]',
    logo_data TEXT NOT NULL DEFAULT '',
    logo_updated_at TEXT NOT NULL DEFAULT '',
    payment_types TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS visits (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
    visit_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Tentative',
    expected_demand TEXT NOT NULL DEFAULT 'Medium',
    notes TEXT NOT NULL DEFAULT ''
  )`);
  await pool.query("CREATE INDEX IF NOT EXISTS trucks_name_idx ON trucks(name)");
  await pool.query("CREATE INDEX IF NOT EXISTS visits_date_idx ON visits(visit_date)");
  await pool.query("ALTER TABLE trucks ADD COLUMN IF NOT EXISTS logo_data TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE trucks ADD COLUMN IF NOT EXISTS logo_updated_at TEXT NOT NULL DEFAULT ''");
  await pool.query("ALTER TABLE trucks ADD COLUMN IF NOT EXISTS payment_types TEXT NOT NULL DEFAULT '')");
  return pool;
}

async function readAllPostgres(pool: import("pg").Pool | import("pg").PoolClient) {
  const [trucksResult, visitsResult] = await Promise.all([
    pool.query(`SELECT id,name,cuisine,contact,phone,email,
      insurance_expiry AS "insuranceExpiry",license_expiry AS "licenseExpiry",
      preferred_start AS "preferredStart",preferred_end AS "preferredEnd",
      reliability,notes,color,payment_types AS "paymentTypes",availability_json AS "availabilityJson",
      (logo_data <> '') AS "hasLogo",logo_updated_at AS "logoVersion"
      FROM trucks ORDER BY name`),
    pool.query(`SELECT id,truck_id AS "truckId",visit_date AS "visitDate",
      start_time AS "startTime",end_time AS "endTime",status,
      expected_demand AS "expectedDemand",notes
      FROM visits ORDER BY visit_date,start_time`),
  ]);
  const trucks = trucksResult.rows.map((truck) => {
    let availability: unknown[] = [];
    try {
      availability = JSON.parse(String(truck.availabilityJson || "[]")) as unknown[];
    } catch {
      availability = [];
    }
    const rest = Object.fromEntries(
      Object.entries(truck).filter(([key]) => key !== "availabilityJson"),
    );
    return { ...rest, availability };
  });
  return { trucks, visits: visitsResult.rows, storage: "postgres" };
}

async function savePostgres(payload: Record<string, unknown>) {
  const pool = await postgres();
  if (payload.kind === "truck") {
    const logo = decodeLogo(payload.logoData);
    await pool.query(
      `INSERT INTO trucks
      (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color,availability_json,logo_data,logo_updated_at,payment_types)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        text(payload.name), text(payload.cuisine), text(payload.contact), text(payload.phone),
        text(payload.email), text(payload.insuranceExpiry), text(payload.licenseExpiry),
        text(payload.preferredStart), text(payload.preferredEnd), 85, text(payload.notes),
        "#1687ff", JSON.stringify(payload.availability ?? []), logo?.dataUrl ?? "",
        logo ? String(Date.now()) : "", text(payload.paymentTypes),
      ],
    );
  } else if (payload.kind === "visit") {
    await pool.query(
      `INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        number(payload.truckId), text(payload.visitDate), text(payload.startTime),
        text(payload.endTime), text(payload.status), text(payload.expectedDemand),
        text(payload.notes),
      ],
    );
  } else if (payload.kind === "import") {
    await importPostgres(pool, payload.data as AppDataInput);
  } else {
    return null;
  }
  return readAllPostgres(pool);
}

async function importPostgres(pool: import("pg").Pool, data: AppDataInput = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(8244)");
    const existing = await client.query<{ count: string }>("SELECT COUNT(*) AS count FROM trucks");
    if (Number(existing.rows[0]?.count) > 0) {
      await client.query("COMMIT");
      return;
    }
    const idMap = new Map<number, number>();
    for (const truck of data.trucks ?? []) {
      const logo = decodeLogo(truck.logoData);
      const result = await client.query<{ id: number }>(
        `INSERT INTO trucks
        (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color,availability_json,logo_data,logo_updated_at,payment_types)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [
          text(truck.name), text(truck.cuisine), text(truck.contact), text(truck.phone),
          text(truck.email), text(truck.insuranceExpiry), text(truck.licenseExpiry),
          text(truck.preferredStart), text(truck.preferredEnd), number(truck.reliability, 85),
          text(truck.notes), text(truck.color, "#1687ff"),
          JSON.stringify(truck.availability ?? []), logo?.dataUrl ?? "",
          logo ? String(Date.now()) : "", text(truck.paymentTypes),
        ],
      );
      if (truck.id && result.rows[0]) idMap.set(truck.id, result.rows[0].id);
    }
    for (const visit of data.visits ?? []) {
      const oldTruckId = number(visit.truckId);
      const truckId = idMap.get(oldTruckId);
      if (!truckId) continue;
      await client.query(
        `INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          truckId, text(visit.visitDate), text(visit.startTime), text(visit.endTime),
          text(visit.status, "Tentative"), text(visit.expectedDemand, "Medium"),
          text(visit.notes),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const truckSql = `CREATE TABLE IF NOT EXISTS trucks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  cuisine TEXT NOT NULL,
  contact TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  insurance_expiry TEXT NOT NULL,
  license_expiry TEXT NOT NULL,
  preferred_start TEXT NOT NULL,
  preferred_end TEXT NOT NULL,
  reliability INTEGER NOT NULL DEFAULT 85,
  notes TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#1687ff',
  availability_json TEXT NOT NULL DEFAULT '[]',
  logo_key TEXT NOT NULL DEFAULT '',
  logo_updated_at TEXT NOT NULL DEFAULT '',
  payment_types TEXT NOT NULL DEFAULT ''
)`;

const visitSql = `CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  truck_id INTEGER NOT NULL,
  visit_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Tentative',
  expected_demand TEXT NOT NULL DEFAULT 'Medium',
  notes TEXT NOT NULL DEFAULT ''
)`;

const truckIndexSql = "CREATE INDEX IF NOT EXISTS trucks_name_idx ON trucks(name)";
const visitIndexSql = "CREATE INDEX IF NOT EXISTS visits_date_idx ON visits(visit_date)";

async function database() {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB: D1 }).DB;
  await db.batch([
    db.prepare(truckSql),
    db.prepare(visitSql),
    db.prepare(truckIndexSql),
    db.prepare(visitIndexSql),
  ]);
  const columns = await db.prepare("PRAGMA table_info(trucks)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "logo_key")) {
    await db.prepare("ALTER TABLE trucks ADD COLUMN logo_key TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "logo_updated_at")) {
    await db.prepare("ALTER TABLE trucks ADD COLUMN logo_updated_at TEXT NOT NULL DEFAULT ''").run();
  }
  if (!columns.results.some((column) => column.name === "payment_types")) {
    await db.prepare("ALTER TABLE trucks ADD COLUMN payment_types TEXT NOT NULL DEFAULT ''").run();
  }
  const count = await db.prepare("SELECT COUNT(*) AS count FROM trucks").all<{ count: number }>();
  if (!count.results[0]?.count) {
    await db.batch([
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Sample Burger Truck","Smashburgers & Fries","Sample Contact","(202) 555-0101","burgers@example.com","2026-10-14","2027-02-28","11:00","15:00",96,"Demo record. Needs 20A electrical hookup.","#1687ff"),
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Sample Taco Truck","Mexican","Sample Contact","(202) 555-0102","tacos@example.com","2027-01-09","2026-11-22","12:00","16:00",92,"Demo record for scheduling.","#7ac943"),
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Sample Dessert Truck","Desserts & Coffee","Sample Contact","(202) 555-0103","desserts@example.com","2026-09-18","2027-03-10","15:00","19:00",88,"Demo record for scheduling.","#9b6cff"),
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Sample Barbecue Truck","Barbecue","Sample Contact","(202) 555-0104","barbecue@example.com","2026-08-21","2026-12-12","11:00","15:00",94,"Demo record; allow 30 minutes for setup.","#ff9c42"),
    ]);
    await db.batch([
      db.prepare("INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes) VALUES (1,'2026-07-27','11:00','14:00','Confirmed','High','')"),
      db.prepare("INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes) VALUES (2,'2026-07-27','12:00','16:00','Confirmed','High','')"),
      db.prepare("INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes) VALUES (3,'2026-07-27','15:00','19:00','Confirmed','Medium','')"),
      db.prepare("INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes) VALUES (4,'2026-07-30','11:00','14:00','Tentative','High','')"),
    ]);
  }
  return db;
}

async function objectStorage() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { BUCKET: R2Bucket }).BUCKET;
}

async function readAll(db: D1) {
  const trucksResult = await db.prepare("SELECT id,name,cuisine,contact,phone,email,insurance_expiry AS insuranceExpiry,license_expiry AS licenseExpiry,preferred_start AS preferredStart,preferred_end AS preferredEnd,reliability,notes,color,payment_types AS paymentTypes,availability_json AS availabilityJson,(logo_key <> '') AS hasLogo,logo_updated_at AS logoVersion FROM trucks ORDER BY name").all<Record<string, unknown>>();
  const visits = await db.prepare("SELECT id,truck_id AS truckId,visit_date AS visitDate,start_time AS startTime,end_time AS endTime,status,expected_demand AS expectedDemand,notes FROM visits ORDER BY visit_date,start_time").all();
  const trucks = trucksResult.results.map((truck) => {
    let availability: unknown[] = [];
    try {
      availability = JSON.parse(String(truck.availabilityJson || "[]")) as unknown[];
    } catch {
      availability = [];
    }
    const rest = Object.fromEntries(
      Object.entries(truck).filter(([key]) => key !== "availabilityJson"),
    );
    return { ...rest, hasLogo: Boolean(truck.hasLogo), availability };
  });
  return { trucks, visits: visits.results };
}

async function serveLogo(logoId: number) {
  if (!Number.isInteger(logoId) || logoId <= 0) {
    return new Response("Not found", { status: 404 });
  }
  if (postgresUrl()) {
    const pool = await postgres();
    const result = await pool.query<{ logo_data: string }>(
      "SELECT logo_data FROM trucks WHERE id = $1",
      [logoId],
    );
    const logo = decodeLogo(result.rows[0]?.logo_data);
    if (!logo) return new Response("Not found", { status: 404 });
    return new Response(logo.bytes, {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        "content-type": logo.mime,
      },
    });
  }
  const db = await database();
  const result = await db.prepare("SELECT logo_key AS logoKey FROM trucks WHERE id = ?")
    .bind(logoId).all<{ logoKey: string }>();
  const key = result.results[0]?.logoKey;
  if (!key) return new Response("Not found", { status: 404 });
  const object = await (await objectStorage()).get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "cache-control": "public, max-age=31536000, immutable",
      "content-type": object.httpMetadata?.contentType || "image/webp",
    },
  });
}

export async function GET(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  try {
    const searchParams = new URL(request.url).searchParams;
    const logoId = Number(searchParams.get("logoId"));
    if (Number.isInteger(logoId) && logoId > 0) return serveLogo(logoId);
    if (searchParams.get("calendar") === "1") {
      const data = postgresUrl()
        ? await readAllPostgres(await postgres())
        : await readAll(await database());
      return scheduleCalendarResponse(data as unknown as CalendarData);
    }
    if (postgresUrl()) {
      return Response.json(await readAllPostgres(await postgres()));
    }
    return Response.json(await readAll(await database()));
  } catch {
    return Response.json({ error: "Schedule data is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!["admin", "manager"].includes(session.user.role)) {
    return Response.json({ error: "This account has view-only access." }, { status: 403 });
  }
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (payload.kind === "truck" && text(payload.logoData) && !decodeLogo(payload.logoData)) {
      return Response.json({ error: "Choose a PNG, JPEG, or WebP logo under 5 MB." }, { status: 400 });
    }
    if (postgresUrl()) {
      const result = await savePostgres(payload);
      if (!result) {
        return Response.json({ error: "Unknown record type." }, { status: 400 });
      }
      return Response.json(result, { status: 201 });
    }
    const db = await database();
    if (payload.kind === "truck") {
      const result = await db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color,availability_json,payment_types) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id")
        .bind(payload.name,payload.cuisine,payload.contact,payload.phone,payload.email,payload.insuranceExpiry ?? "",payload.licenseExpiry ?? "",payload.preferredStart,payload.preferredEnd,85,payload.notes ?? "","#1687ff",JSON.stringify(payload.availability ?? []),text(payload.paymentTypes)).all<{ id: number }>();
      const logo = decodeLogo(payload.logoData);
      const id = result.results[0]?.id;
      if (logo && id) {
        const key = `truck-logos/${id}`;
        await (await objectStorage()).put(key, logo.bytes, { httpMetadata: { contentType: logo.mime } });
        await db.prepare("UPDATE trucks SET logo_key = ?, logo_updated_at = ? WHERE id = ?")
          .bind(key, String(Date.now()), id).run();
      }
    } else if (payload.kind === "visit") {
      await db.prepare("INSERT INTO visits (truck_id,visit_date,start_time,end_time,status,expected_demand,notes) VALUES (?,?,?,?,?,?,?)")
        .bind(Number(payload.truckId),payload.visitDate,payload.startTime,payload.endTime,payload.status,payload.expectedDemand,payload.notes ?? "").run();
    } else {
      return Response.json({ error: "Unknown record type." }, { status: 400 });
    }
    return Response.json(await readAll(db), { status: 201 });
  } catch {
    return Response.json({ error: "Unable to save this record." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (!["admin", "manager"].includes(session.user.role)) {
    return Response.json({ error: "This account has view-only access." }, { status: 403 });
  }
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = number(payload.id);
    if (payload.kind === "truckLogo") {
      const logoData = text(payload.logoData);
      const logo = decodeLogo(logoData);
      if (!Number.isInteger(id) || id <= 0 || (logoData && !logo)) {
        return Response.json({ error: "Choose a valid PNG, JPEG, or WebP logo." }, { status: 400 });
      }
      const version = logo ? String(Date.now()) : "";
      if (postgresUrl()) {
        const pool = await postgres();
        await pool.query(
          "UPDATE trucks SET logo_data = $1, logo_updated_at = $2 WHERE id = $3",
          [logo?.dataUrl ?? "", version, id],
        );
        return Response.json(await readAllPostgres(pool));
      }
      const db = await database();
      const existing = await db.prepare("SELECT logo_key AS logoKey FROM trucks WHERE id = ?")
        .bind(id).all<{ logoKey: string }>();
      const existingKey = existing.results[0]?.logoKey;
      if (logo) {
        const key = existingKey || `truck-logos/${id}`;
        await (await objectStorage()).put(key, logo.bytes, { httpMetadata: { contentType: logo.mime } });
        await db.prepare("UPDATE trucks SET logo_key = ?, logo_updated_at = ? WHERE id = ?")
          .bind(key, version, id).run();
      } else {
        if (existingKey) await (await objectStorage()).delete(existingKey);
        await db.prepare("UPDATE trucks SET logo_key = '', logo_updated_at = '' WHERE id = ?")
          .bind(id).run();
      }
      return Response.json(await readAll(db));
    }
    const startTime = text(payload.startTime);
    const endTime = text(payload.endTime);
    if (!Number.isInteger(id) || id <= 0 || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      return Response.json({ error: "A valid visit and time range are required." }, { status: 400 });
    }
    if (postgresUrl()) {
      const pool = await postgres();
      await pool.query("UPDATE visits SET start_time = $1, end_time = $2 WHERE id = $3", [startTime, endTime, id]);
      return Response.json(await readAllPostgres(pool));
    }
    const db = await database();
    await db.prepare("UPDATE visits SET start_time = ?, end_time = ? WHERE id = ?")
      .bind(startTime, endTime, id).run();
    return Response.json(await readAll(db));
  } catch {
    return Response.json({ error: "Unable to update this visit." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if ("response" in session) return session.response;
  if (session.user.role !== "admin") {
    return Response.json({ error: "Only an administrator can delete records." }, { status: 403 });
  }
  try {
    const searchParams = new URL(request.url).searchParams;
    const visitId = Number(searchParams.get("visitId"));
    if (Number.isInteger(visitId) && visitId > 0) {
      if (postgresUrl()) {
        const pool = await postgres();
        await pool.query("DELETE FROM visits WHERE id = $1", [visitId]);
        return Response.json(await readAllPostgres(pool));
      }
      const db = await database();
      await db.prepare("DELETE FROM visits WHERE id = ?").bind(visitId).run();
      return Response.json(await readAll(db));
    }
    const id = Number(searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "A valid truck id is required." }, { status: 400 });
    }
    if (postgresUrl()) {
      const pool = await postgres();
      await pool.query("DELETE FROM trucks WHERE id = $1", [id]);
      return Response.json(await readAllPostgres(pool));
    }
    const db = await database();
    const logo = await db.prepare("SELECT logo_key AS logoKey FROM trucks WHERE id = ?")
      .bind(id).all<{ logoKey: string }>();
    if (logo.results[0]?.logoKey) {
      await (await objectStorage()).delete(logo.results[0].logoKey);
    }
    await db.batch([
      db.prepare("DELETE FROM visits WHERE truck_id = ?").bind(id),
      db.prepare("DELETE FROM trucks WHERE id = ?").bind(id),
    ]);
    return Response.json(await readAll(db));
  } catch {
    return Response.json({ error: "Unable to delete this truck." }, { status: 500 });
  }
}
import { requireSession } from "../../lib/guard";
