CREATE TABLE IF NOT EXISTS `object_changes` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `object_type` text NOT NULL,
  `object_id` text NOT NULL,
  `param_name` text NOT NULL,
  `param_value` text NOT NULL,
  `mode` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `object_changes_org_object_created_at_idx` ON `object_changes` (`org_id`,`object_type`,`object_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `object_changes_org_created_at_idx` ON `object_changes` (`org_id`,`created_at`);
