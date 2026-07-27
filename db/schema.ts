import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const trucks = sqliteTable("trucks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  cuisine: text("cuisine").notNull(),
  contact: text("contact").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  insuranceExpiry: text("insurance_expiry").notNull(),
  licenseExpiry: text("license_expiry").notNull(),
  preferredStart: text("preferred_start").notNull(),
  preferredEnd: text("preferred_end").notNull(),
  reliability: integer("reliability").notNull().default(85),
  notes: text("notes").notNull().default(""),
  color: text("color").notNull().default("#1687ff"),
});

export const visits = sqliteTable("visits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  truckId: integer("truck_id").notNull(),
  visitDate: text("visit_date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  status: text("status").notNull().default("Tentative"),
  expectedDemand: text("expected_demand").notNull().default("Medium"),
  notes: text("notes").notNull().default(""),
});
