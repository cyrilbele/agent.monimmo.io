ALTER TABLE `ai_call_logs` ADD COLUMN `prompt_redacted` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `ai_call_logs` ADD COLUMN `response_text_redacted` text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE `ai_call_logs` ADD COLUMN `redaction_version` text NOT NULL DEFAULT 'v1';
--> statement-breakpoint
ALTER TABLE `ai_call_logs` ADD COLUMN `input_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_call_logs` ADD COLUMN `output_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_call_logs` ADD COLUMN `total_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_call_logs` ADD COLUMN `expires_at` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `ai_call_logs`
SET
  `prompt_redacted` = `prompt`,
  `response_text_redacted` = `response_text`,
  `expires_at` = CASE
    WHEN `expires_at` = 0 THEN `created_at` + 7776000000
    ELSE `expires_at`
  END;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `ai_call_logs_expires_at_idx` ON `ai_call_logs` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `gdpr_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `actor_user_id` text,
  `action` text NOT NULL,
  `status` text NOT NULL,
  `details` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `gdpr_audit_events_org_created_at_idx` ON `gdpr_audit_events` (`org_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `gdpr_audit_events_org_action_idx` ON `gdpr_audit_events` (`org_id`,`action`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `privacy_exports` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `requested_by_user_id` text NOT NULL,
  `status` text NOT NULL,
  `result_json` text,
  `error_message` text,
  `requested_at` integer NOT NULL,
  `started_at` integer,
  `completed_at` integer,
  `expires_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `privacy_exports_org_requested_at_idx` ON `privacy_exports` (`org_id`,`requested_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `privacy_exports_org_status_idx` ON `privacy_exports` (`org_id`,`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `privacy_exports_expires_at_idx` ON `privacy_exports` (`expires_at`);
