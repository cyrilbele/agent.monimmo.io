ALTER TABLE `users` ADD `data` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `users`
SET `data` = json_object(
  'firstName', `first_name`,
  'lastName', `last_name`,
  'email', `email`,
  'phone', `phone`,
  'address', `address`,
  'postalCode', `postal_code`,
  'city', `city`,
  'personalNotes', `personal_notes`,
  'accountType', `account_type`
)
WHERE `data` = '{}' OR trim(`data`) = '';
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `data` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `calendar_events`
SET `data` = json_object(
  'title', `title`,
  'startsAt', `starts_at`,
  'endsAt', `ends_at`,
  'propertyId', json_extract(`payload`, '$.propertyId'),
  'clientUserId', json_extract(`payload`, '$.clientUserId'),
  'address', json_extract(`payload`, '$.addressOverride'),
  'comment', json_extract(`payload`, '$.comment')
)
WHERE `data` = '{}' OR trim(`data`) = '';
--> statement-breakpoint
ALTER TABLE `property_visits` ADD `data` text NOT NULL DEFAULT '{}';
--> statement-breakpoint
UPDATE `property_visits`
SET `data` = json_object(
  'propertyId', `property_id`,
  'prospectUserId', `prospect_user_id`,
  'startsAt', `starts_at`,
  'endsAt', `ends_at`,
  'compteRendu', `compte_rendu`,
  'bonDeVisiteFileId', `bon_de_visite_file_id`
)
WHERE `data` = '{}' OR trim(`data`) = '';
