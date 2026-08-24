CREATE TABLE IF NOT EXISTS `whatsapp_predefined_messages` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `title` VARCHAR(120) NOT NULL,
  `body` TEXT NOT NULL,
  `created_by` CHAR(36) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_whatsapp_messages_updated` (`updated_at`),
  FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
