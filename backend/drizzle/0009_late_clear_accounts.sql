PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`email` text,
	`first_name` text NOT NULL DEFAULT '',
	`last_name` text NOT NULL DEFAULT '',
	`phone` text,
	`address` text,
	`postal_code` text,
	`city` text,
	`account_type` text DEFAULT 'CLIENT' NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_users` (
	`id`,
	`org_id`,
	`email`,
	`first_name`,
	`last_name`,
	`phone`,
	`address`,
	`postal_code`,
	`city`,
	`account_type`,
	`role`,
	`password_hash`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`org_id`,
	`email`,
	`first_name`,
	`last_name`,
	`phone`,
	`address`,
	`postal_code`,
	`city`,
	`account_type`,
	`role`,
	`password_hash`,
	`created_at`,
	`updated_at`
FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
