CREATE TABLE `business_links` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `type_lien` text NOT NULL,
  `object_id_1` text NOT NULL,
  `object_id_2` text NOT NULL,
  `params` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `business_links_org_type_pair_unique` ON `business_links` (`org_id`,`type_lien`,`object_id_1`,`object_id_2`);
--> statement-breakpoint
CREATE INDEX `business_links_org_object1_idx` ON `business_links` (`org_id`,`object_id_1`,`created_at`);
--> statement-breakpoint
CREATE INDEX `business_links_org_object2_idx` ON `business_links` (`org_id`,`object_id_2`,`created_at`);
--> statement-breakpoint
CREATE INDEX `business_links_org_created_at_idx` ON `business_links` (`org_id`,`created_at`);
--> statement-breakpoint
DROP TABLE IF EXISTS `property_user_links`;
--> statement-breakpoint
DROP TABLE IF EXISTS `property_parties`;
