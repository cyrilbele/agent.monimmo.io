CREATE TABLE `market_dvf_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_row_hash` text NOT NULL,
	`sale_date` integer NOT NULL,
	`sale_price` integer NOT NULL,
	`surface_m2` real NOT NULL,
	`built_surface_m2` real,
	`land_surface_m2` real,
	`property_type` text NOT NULL,
	`longitude` real,
	`latitude` real,
	`postal_code` text,
	`city` text,
	`insee_code` text,
	`raw_payload` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_dvf_transactions_source_row_hash_unique` ON `market_dvf_transactions` (`source_row_hash`);
--> statement-breakpoint
CREATE INDEX `market_dvf_transactions_sale_date_idx` ON `market_dvf_transactions` (`sale_date`);
--> statement-breakpoint
CREATE INDEX `market_dvf_transactions_property_type_sale_date_idx` ON `market_dvf_transactions` (`property_type`,`sale_date`);
--> statement-breakpoint
CREATE TABLE `market_dvf_query_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`property_id` text NOT NULL,
	`cache_key` text NOT NULL,
	`query_signature` text NOT NULL,
	`final_radius_m` integer NOT NULL,
	`comparables_count` integer NOT NULL,
	`target_reached` integer NOT NULL,
	`response_json` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `market_dvf_query_cache_cache_key_unique` ON `market_dvf_query_cache` (`cache_key`);
--> statement-breakpoint
CREATE INDEX `market_dvf_query_cache_org_property_idx` ON `market_dvf_query_cache` (`org_id`,`property_id`);
--> statement-breakpoint
CREATE INDEX `market_dvf_query_cache_expires_at_idx` ON `market_dvf_query_cache` (`expires_at`);
