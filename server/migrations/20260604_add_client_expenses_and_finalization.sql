-- Add client expense fields and finalization lock for existing MySQL databases.
ALTER TABLE `clients`
  ADD COLUMN IF NOT EXISTS `manopera_colaboratori` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `price`,
  ADD COLUMN IF NOT EXISTS `valoare_piese` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `manopera_colaboratori`,
  ADD COLUMN IF NOT EXISTS `is_finalized` TINYINT(1) NOT NULL DEFAULT 0 AFTER `price_edit_count`;
