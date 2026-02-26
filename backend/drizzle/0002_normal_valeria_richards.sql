CREATE TABLE `property_parties` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`org_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
