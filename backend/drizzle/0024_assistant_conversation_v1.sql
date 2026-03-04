ALTER TABLE `organizations` ADD COLUMN `assistant_soul` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `assistant_conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `assistant_conversations_org_user_unique` ON `assistant_conversations` (`org_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `assistant_pending_actions` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `org_id` text NOT NULL,
  `user_id` text NOT NULL,
  `status` text NOT NULL,
  `operation` text NOT NULL,
  `object_type` text NOT NULL,
  `object_id` text,
  `payload_json` text NOT NULL,
  `preview_text` text NOT NULL,
  `result_json` text,
  `error_message` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assistant_pending_actions_conversation_created_at_idx` ON `assistant_pending_actions` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assistant_pending_actions_org_user_status_idx` ON `assistant_pending_actions` (`org_id`,`user_id`,`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `assistant_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `org_id` text NOT NULL,
  `role` text NOT NULL,
  `text` text NOT NULL,
  `citations_json` text NOT NULL DEFAULT '[]',
  `pending_action_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`pending_action_id`) REFERENCES `assistant_pending_actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assistant_messages_conversation_created_at_idx` ON `assistant_messages` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `assistant_messages_org_created_at_idx` ON `assistant_messages` (`org_id`,`created_at`);
