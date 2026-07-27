type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    run(): Promise<unknown>;
    all<T>(): Promise<{ results: T[] }>;
  };
  batch(statements: ReturnType<D1["prepare"]>[]): Promise<unknown>;
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

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
    availability_json TEXT NOT NULL DEFAULT '[]'
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
  return pool;
}

async function readAllPostgres(pool: import("pg").Pool | import("pg").PoolClient) {
  const [trucksResult, visitsResult] = await Promise.all([
    pool.query(`SELECT id,name,cuisine,contact,phone,email,
      insurance_expiry AS "insuranceExpiry",license_expiry AS "licenseExpiry",
      preferred_start AS "preferredStart",preferred_end AS "preferredEnd",
      reliability,notes,color,availability_json AS "availabilityJson"
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
    await pool.query(
      `INSERT INTO trucks
      (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color,availability_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        text(payload.name), text(payload.cuisine), text(payload.contact), text(payload.phone),
        text(payload.email), text(payload.insuranceExpiry), text(payload.licenseExpiry),
        text(payload.preferredStart), text(payload.preferredEnd), 85, text(payload.notes),
        "#1687ff", JSON.stringify(payload.availability ?? []),
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
      const result = await client.query<{ id: number }>(
        `INSERT INTO trucks
        (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color,availability_json)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          text(truck.name), text(truck.cuisine), text(truck.contact), text(truck.phone),
          text(truck.email), text(truck.insuranceExpiry), text(truck.licenseExpiry),
          text(truck.preferredStart), text(truck.preferredEnd), number(truck.reliability, 85),
          text(truck.notes), text(truck.color, "#1687ff"),
          JSON.stringify(truck.availability ?? []),
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
  color TEXT NOT NULL DEFAULT '#1687ff'
  ,availability_json TEXT NOT NULL DEFAULT '[]'
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
  const count = await db.prepare("SELECT COUNT(*) AS count FROM trucks").all<{ count: number }>();
  if (!count.results[0]?.count) {
    await db.batch([
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Steel City Smash","Smashburgers & Fries","Maya Chen","(412) 555-0188","maya@steelcitysmash.com","2026-10-14","2027-02-28","11:00","15:00",96,"Strong lunch performer. Needs 20A electrical hookup.","#1687ff"),
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Taco Loco","Mexican","Luis Ramirez","(330) 555-0142","hello@tacoloco.com","2027-01-09","2026-11-22","12:00","16:00",92,"Fast service and broad menu.","#7ac943"),
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Sweet Wheels","Desserts & Coffee","Nina Patel","(234) 555-0171","nina@sweetwheels.com","2026-09-18","2027-03-10","15:00","19:00",88,"Best after 2 PM and during associate events.","#9b6cff"),
      db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind("Smoke & Oak BBQ","Barbecue","Marcus Reed","(330) 555-0126","marcus@smokeandoak.com","2026-08-21","2026-12-12","11:00","15:00",94,"High draw; allow 30 minutes for setup.","#ff9c42"),
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

async function readAll(db: D1) {
  const trucksResult = await db.prepare("SELECT id,name,cuisine,contact,phone,email,insurance_expiry AS insuranceExpiry,license_expiry AS licenseExpiry,preferred_start AS preferredStart,preferred_end AS preferredEnd,reliability,notes,color,availability_json AS availabilityJson FROM trucks ORDER BY name").all<Record<string, unknown>>();
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
    return { ...rest, availability };
  });
  return { trucks, visits: visits.results };
}

export async function GET() {
  try {
    if (postgresUrl()) {
      return Response.json(await readAllPostgres(await postgres()));
    }
    return Response.json(await readAll(await database()));
  } catch {
    return Response.json({ error: "Schedule data is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    if (postgresUrl()) {
      const result = await savePostgres(payload);
      if (!result) {
        return Response.json({ error: "Unknown record type." }, { status: 400 });
      }
      return Response.json(result, { status: 201 });
    }
    const db = await database();
    if (payload.kind === "truck") {
      await db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color,availability_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(payload.name,payload.cuisine,payload.contact,payload.phone,payload.email,payload.insuranceExpiry,payload.licenseExpiry,payload.preferredStart,payload.preferredEnd,85,payload.notes ?? "","#1687ff",JSON.stringify(payload.availability ?? [])).run();
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
  try {
    const payload = await request.json() as Record<string, unknown>;
    const id = number(payload.id);
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
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ error: "A valid truck id is required." }, { status: 400 });
    }
    if (postgresUrl()) {
      const pool = await postgres();
      await pool.query("DELETE FROM trucks WHERE id = $1", [id]);
      return Response.json(await readAllPostgres(pool));
    }
    const db = await database();
    await db.batch([
      db.prepare("DELETE FROM visits WHERE truck_id = ?").bind(id),
      db.prepare("DELETE FROM trucks WHERE id = ?").bind(id),
    ]);
    return Response.json(await readAll(db));
  } catch {
    return Response.json({ error: "Unable to delete this truck." }, { status: 500 });
  }
}
