-- Configurable expense categories and per-client expense values.

ALTER TABLE `clients`
  ADD COLUMN IF NOT EXISTS `alte_cheltuieli` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `valoare_piese`;

CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `color` VARCHAR(7) NOT NULL DEFAULT '#EF4444',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `client_expense_costs` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `client_id` CHAR(36) NOT NULL,
  `expense_id` CHAR(36) DEFAULT NULL,
  `expense_name` VARCHAR(255) NOT NULL,
  `expense_color` VARCHAR(7) NOT NULL DEFAULT '#EF4444',
  `cost` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_client_expense_client` (`client_id`),
  KEY `idx_client_expense_category` (`expense_id`),
  CONSTRAINT `fk_client_expense_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_client_expense_category`
    FOREIGN KEY (`expense_id`) REFERENCES `expense_categories`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
