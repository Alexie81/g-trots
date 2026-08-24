ALTER TABLE `clients`
  ADD COLUMN IF NOT EXISTS `service_parts_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `valoare_piese`,
  ADD COLUMN IF NOT EXISTS `service_labor_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `service_parts_price`;
