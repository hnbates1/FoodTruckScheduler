import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  availabilityJson: text("availability_json").notNull().default("[]"),
  logoKey: text("logo_key").notNull().default(""),
  logoUpdatedAt: text("logo_updated_at").notNull().default(""),
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

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull().default(""),
    storeNumber: text("store_number").notNull().default(""),
    role: text("role").notNull().default("associate"),
    createdAt: text("created_at").notNull(),
    lastLoginAt: text("last_login_at").notNull().default(""),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until").notNull().default(""),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    userAgent: text("user_agent").notNull().default(""),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);
