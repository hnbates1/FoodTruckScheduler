CREATE TABLE `truck_google_places` (
	`truck_id` integer PRIMARY KEY NOT NULL,
	`place_id` text NOT NULL,
	`linked_at` text NOT NULL,
	FOREIGN KEY (`truck_id`) REFERENCES `trucks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `truck_google_places_place_id_idx` ON `truck_google_places` (`place_id`);
--> statement-breakpoint
CREATE TABLE `google_places_daily_usage` (
	`usage_date` text PRIMARY KEY NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL
);
