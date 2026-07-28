ALTER TABLE visits ADD COLUMN outcome TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE visits ADD COLUMN outcome_notes TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE trucks SET reliability = 0;
