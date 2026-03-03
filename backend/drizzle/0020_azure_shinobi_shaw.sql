ALTER TABLE `organizations` ADD `ai_provider` text NOT NULL DEFAULT 'openai';
--> statement-breakpoint

CREATE TABLE `ai_call_logs` (
  `id` text PRIMARY KEY NOT NULL,
  `org_id` text NOT NULL,
  `use_case` text NOT NULL,
  `prompt` text NOT NULL,
  `response_text` text NOT NULL,
  `price` real NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint

CREATE INDEX `ai_call_logs_org_created_at_idx` ON `ai_call_logs` (`org_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_call_logs_org_use_case_idx` ON `ai_call_logs` (`org_id`, `use_case`);
