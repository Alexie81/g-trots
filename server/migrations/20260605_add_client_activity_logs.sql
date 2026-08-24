CREATE TABLE IF NOT EXISTS `client_activity_logs` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `client_id` CHAR(36) NOT NULL,
  `actor_user_id` CHAR(36) DEFAULT NULL,
  `action` ENUM('created','updated','scanned','finalized','deleted') NOT NULL,
  `summary` VARCHAR(255) NOT NULL DEFAULT '',
  `details` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_client_activity_client` (`client_id`, `created_at`),
  KEY `idx_client_activity_actor` (`actor_user_id`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`actor_user_id`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `client_activity_logs` (`id`, `client_id`, `actor_user_id`, `action`, `summary`, `details`, `created_at`)
SELECT UUID(),
       c.`id`,
       c.`owner_user_id`,
       'created',
       'Client adaugat',
       JSON_OBJECT('name', c.`name`, 'phone', c.`phone`, 'qr_code', c.`qr_code`),
       c.`created_at`
FROM `clients` c
LEFT JOIN `client_activity_logs` cal
  ON cal.`client_id` = c.`id` AND cal.`action` = 'created'
WHERE cal.`id` IS NULL;
