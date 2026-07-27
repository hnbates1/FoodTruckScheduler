import { env } from "cloudflare:workers";

type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    run(): Promise<unknown>;
    all<T>(): Promise<{ results: T[] }>;
  };
  batch(statements: ReturnType<D1["prepare"]>[]): Promise<unknown>;
};

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
  const trucks = await db.prepare("SELECT id,name,cuisine,contact,phone,email,insurance_expiry AS insuranceExpiry,license_expiry AS licenseExpiry,preferred_start AS preferredStart,preferred_end AS preferredEnd,reliability,notes,color FROM trucks ORDER BY name").all();
  const visits = await db.prepare("SELECT id,truck_id AS truckId,visit_date AS visitDate,start_time AS startTime,end_time AS endTime,status,expected_demand AS expectedDemand,notes FROM visits ORDER BY visit_date,start_time").all();
  return { trucks: trucks.results, visits: visits.results };
}

export async function GET() {
  try {
    return Response.json(await readAll(await database()));
  } catch {
    return Response.json({ error: "Schedule data is temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, string>;
    const db = await database();
    if (payload.kind === "truck") {
      await db.prepare("INSERT INTO trucks (name,cuisine,contact,phone,email,insurance_expiry,license_expiry,preferred_start,preferred_end,reliability,notes,color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
        .bind(payload.name,payload.cuisine,payload.contact,payload.phone,payload.email,payload.insuranceExpiry,payload.licenseExpiry,payload.preferredStart,payload.preferredEnd,85,payload.notes ?? "","#1687ff").run();
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
