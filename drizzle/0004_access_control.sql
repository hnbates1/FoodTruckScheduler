ALTER TABLE trucks ADD COLUMN payment_types TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
