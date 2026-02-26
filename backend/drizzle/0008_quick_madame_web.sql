ALTER TABLE `users` ADD `account_type` text DEFAULT 'CLIENT' NOT NULL;
--> statement-breakpoint
UPDATE `users`
SET `account_type` = 'AGENT'
WHERE `role` IN ('AGENT', 'MANAGER', 'ADMIN');
