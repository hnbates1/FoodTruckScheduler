CREATE TABLE `trucks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cuisine` text NOT NULL,
	`contact` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`insurance_expiry` text NOT NULL,
	`license_expiry` text NOT NULL,
	`preferred_start` text NOT NULL,
	`preferred_end` text NOT NULL,
	`reliability` integer DEFAULT 85 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#1687ff' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`truck_id` integer NOT NULL,
	`visit_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`status` text DEFAULT 'Tentative' NOT NULL,
	`expected_demand` text DEFAULT 'Medium' NOT NULL,
	`notes` text DEFAULT '' NOT NULL
);
