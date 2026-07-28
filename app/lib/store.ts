import type { SessionUser } from "./auth";

type D1 = {
  prepare(query: string): {
    bind(...values: unknown[]): ReturnType<D1["prepare"]>;
    run(): Promise<unknown>;
    all<T>(): Promise<{ results: T[] }>;
  };
  batch(statements: ReturnType<D1["prepare"]>[]): Promise<unknown>;
};

export type UserRow = SessionUser & {
  passwordHash: string;
  failedAttempts: number;
  lockedUntil: string;
};

export type AuthStore = {
  countUsers(): Promise<number>;
  findUserByEmail(email: string): Promise<UserRow | null>;
  createUser(user: { email: string; passwordHash: string; name: string; storeNumber: string; role: string }): Promise<SessionUser>;
  recordFailure(userId: number, attempts: number, lockedUntil: string): Promise<void>;
  recordSuccess(userId: number, at: string): Promise<void>;
  insertSession(tokenHash: string, userId: number, expiresAt: string, userAgent: string): Promise<void>;
  findSession(tokenHash: string): Promise<{ user: SessionUser; expiresAt: string } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  deleteExpiredSessions(): Promise<void>;
};

const D1_DDL = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    store_number TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'associate',
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL DEFAULT '',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT NOT NULL DEFAULT ''
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)",
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT NOT NULL DEFAULT ''
  )`,
  "CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)",
];

const PUBLIC_COLUMNS = `id, email, name, store_number AS storeNumber, role,
  password_hash AS passwordHash, failed_attempts AS failedAttempts, locked_until AS lockedUntil`;

function publicUser(row: UserRow): SessionUser {
  return { id: row.id, email: row.email, name: row.name, storeNumber: row.storeNumber, role: row.role };
}

export async function authStore(): Promise<AuthStore> {
  const { env } = await import("cloudflare:workers");
  const db = (env as unknown as { DB: D1 }).DB;
  await db.batch(D1_DDL.map((statement) => db.prepare(statement)));
  return {
    async countUsers() {
      const result = await db.prepare("SELECT COUNT(*) AS count FROM users").all<{ count: number }>();
      return Number(result.results[0]?.count ?? 0);
    },
    async findUserByEmail(email) {
      const result = await db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE email = ?`)
        .bind(email.toLowerCase()).all<UserRow>();
      return result.results[0] ?? null;
    },
    async createUser(user) {
      const result = await db.prepare(
        `INSERT INTO users (email, password_hash, name, store_number, role, created_at)
         VALUES (?,?,?,?,?,?) RETURNING ${PUBLIC_COLUMNS}`,
      ).bind(
        user.email.toLowerCase(),
        user.passwordHash,
        user.name,
        user.storeNumber,
        user.role,
        new Date().toISOString(),
      ).all<UserRow>();
      return publicUser(result.results[0]);
    },
    async recordFailure(userId, attempts, lockedUntil) {
      await db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?")
        .bind(attempts, lockedUntil, userId).run();
    },
    async recordSuccess(userId, at) {
      await db.prepare("UPDATE users SET failed_attempts = 0, locked_until = '', last_login_at = ? WHERE id = ?")
        .bind(at, userId).run();
    },
    async insertSession(tokenHash, userId, expiresAt, userAgent) {
      await db.prepare(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?,?,?,?,?)",
      ).bind(tokenHash, userId, new Date().toISOString(), expiresAt, userAgent.slice(0, 200)).run();
    },
    async findSession(tokenHash) {
      const result = await db.prepare(
        `SELECT s.expires_at AS expiresAt, u.id, u.email, u.name,
          u.store_number AS storeNumber, u.role
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ?`,
      ).bind(tokenHash).all<{ expiresAt: string } & SessionUser>();
      const row = result.results[0];
      if (!row) return null;
      return {
        expiresAt: row.expiresAt,
        user: { id: row.id, email: row.email, name: row.name, storeNumber: row.storeNumber, role: row.role },
      };
    },
    async deleteSession(tokenHash) {
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    },
    async deleteExpiredSessions() {
      await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(new Date().toISOString()).run();
    },
  };
}
