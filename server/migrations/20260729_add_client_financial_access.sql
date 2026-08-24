ALTER TABLE `app_users`
  ADD COLUMN IF NOT EXISTS `client_financial_access` TINYINT(1) NOT NULL DEFAULT 1 AFTER `service_sheet_access`;

ALTER TABLE `app_users`
  ADD INDEX IF NOT EXISTS `idx_app_users_client_financial` (`client_financial_access`);
