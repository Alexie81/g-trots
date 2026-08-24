ALTER TABLE `app_users`
  ADD COLUMN IF NOT EXISTS `service_sheet_access` TINYINT(1) NOT NULL DEFAULT 1 AFTER `client_edit_access`;
