ALTER TABLE `clients`
  MODIFY COLUMN `manopera_colaboratori` DECIMAL(10,2) NULL DEFAULT NULL,
  MODIFY COLUMN `valoare_piese` DECIMAL(10,2) NULL DEFAULT NULL,
  MODIFY COLUMN `alte_cheltuieli` DECIMAL(10,2) NULL DEFAULT NULL;

ALTER TABLE `service_sheets`
  ADD COLUMN IF NOT EXISTS `internal_parts_cost` DECIMAL(10,2) NULL DEFAULT NULL AFTER `labor_price`,
  ADD COLUMN IF NOT EXISTS `internal_labor_cost` DECIMAL(10,2) NULL DEFAULT NULL AFTER `internal_parts_cost`,
  ADD COLUMN IF NOT EXISTS `internal_other_costs` DECIMAL(10,2) NULL DEFAULT NULL AFTER `internal_labor_cost`;

-- Valorile 0 existente raman 0. Doar NULL inseamna „necompletat”.