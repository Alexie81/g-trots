ALTER TABLE `service_sheets`
  ADD COLUMN IF NOT EXISTS `show_company_details` TINYINT(1) NOT NULL DEFAULT 0
  AFTER `company_email`;
