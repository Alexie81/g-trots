ALTER TABLE `clients`
  ADD COLUMN IF NOT EXISTS `advance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `predefined_price`,
  ADD COLUMN IF NOT EXISTS `currency_code` VARCHAR(3) NOT NULL DEFAULT 'RON' AFTER `advance_amount`;

ALTER TABLE `service_sheets`
  ADD COLUMN IF NOT EXISTS `advance_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `total_price`,
  ADD COLUMN IF NOT EXISTS `currency_code` VARCHAR(3) NOT NULL DEFAULT 'RON' AFTER `advance_amount`,
  ADD COLUMN IF NOT EXISTS `deadline_unit` VARCHAR(24) NOT NULL DEFAULT 'zile' AFTER `deadline`;

UPDATE `clients`
SET `currency_code` = 'RON'
WHERE `currency_code` IS NULL OR `currency_code` = '';

UPDATE `service_sheets`
SET `currency_code` = 'RON',
    `deadline_unit` = CASE
      WHEN `deadline_unit` IS NULL OR `deadline_unit` = '' THEN 'zile'
      ELSE `deadline_unit`
    END;
