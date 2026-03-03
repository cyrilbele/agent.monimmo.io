CREATE TABLE IF NOT EXISTS `platform_settings` (
  `id` text PRIMARY KEY NOT NULL,
  `ai_provider` text NOT NULL DEFAULT 'openai',
  `search_engine` text NOT NULL DEFAULT 'qmd',
  `storage_provider` text NOT NULL DEFAULT 'local',
  `email_provider` text NOT NULL DEFAULT 'smtp-server',
  `calendar_provider` text NOT NULL DEFAULT 'google',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint

INSERT INTO `platform_settings` (
  `id`,
  `ai_provider`,
  `search_engine`,
  `storage_provider`,
  `email_provider`,
  `calendar_provider`,
  `created_at`,
  `updated_at`
)
SELECT
  'global',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM `organizations`
      WHERE lower(coalesce(`ai_provider`, '')) = 'anthropic'
    ) THEN 'anthropic'
    ELSE 'openai'
  END,
  'qmd',
  'local',
  'smtp-server',
  'google',
  (CAST(strftime('%s', 'now') AS integer) * 1000),
  (CAST(strftime('%s', 'now') AS integer) * 1000)
WHERE NOT EXISTS (SELECT 1 FROM `platform_settings` WHERE `id` = 'global');
--> statement-breakpoint

ALTER TABLE `organizations` DROP COLUMN `ai_provider`;
