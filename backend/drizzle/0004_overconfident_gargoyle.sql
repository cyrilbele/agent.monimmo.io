CREATE TABLE `calendar_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`payload` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_events_org_provider_external_unique` ON `calendar_events` (`org_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`access_token_enc` text,
	`refresh_token_enc` text,
	`token_expiry_at` integer,
	`connected_at` integer,
	`last_synced_at` integer,
	`cursor` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_org_provider_unique` ON `integrations` (`org_id`,`provider`);--> statement-breakpoint
CREATE TABLE `message_file_links` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`message_id` text NOT NULL,
	`file_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_file_links_message_file_unique` ON `message_file_links` (`message_id`,`file_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`property_id` text,
	`channel` text NOT NULL,
	`source_provider` text,
	`external_id` text,
	`subject` text,
	`body` text NOT NULL,
	`ai_status` text NOT NULL,
	`received_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_org_channel_external_unique` ON `messages` (`org_id`,`channel`,`external_id`);--> statement-breakpoint
CREATE TABLE `review_queue_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`item_type` text NOT NULL,
	`item_id` text NOT NULL,
	`reason` text NOT NULL,
	`status` text NOT NULL,
	`payload` text,
	`resolution` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `vocals` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`property_id` text,
	`file_id` text NOT NULL,
	`status` text NOT NULL,
	`transcript` text,
	`summary` text,
	`insights` text,
	`confidence` real,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`file_id`) REFERENCES `files`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `files` ADD `source_provider` text;--> statement-breakpoint
ALTER TABLE `files` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `files_org_provider_external_unique` ON `files` (`org_id`,`source_provider`,`external_id`);