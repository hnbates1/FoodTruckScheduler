CREATE TABLE `location_traffic_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`location_key` text NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`curve_json` text DEFAULT '' NOT NULL,
	`venue_name` text DEFAULT '' NOT NULL,
	`venue_address` text DEFAULT '' NOT NULL,
	`place_id` text DEFAULT '' NOT NULL,
	`fetched_at` text NOT NULL,
	`error_code` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `location_traffic_location_week_idx` ON `location_traffic_snapshots` (`location_key`,`week_start`);
--> statement-breakpoint
CREATE INDEX `location_traffic_lookup_idx` ON `location_traffic_snapshots` (`location_key`,`status`,`week_start`);
