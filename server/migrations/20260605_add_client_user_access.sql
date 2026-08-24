CREATE TABLE IF NOT EXISTS `client_user_access` (
  `id` CHAR(36) NOT NULL PRIMARY KEY,
  `client_id` CHAR(36) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `source` ENUM('owner','scan','manual') NOT NULL DEFAULT 'manual',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_client_user_access` (`client_id`, `user_id`),
  KEY `idx_client_user_access_user` (`user_id`),
  KEY `idx_client_user_access_client` (`client_id`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `client_user_access` (`id`, `client_id`, `user_id`, `source`)
SELECT UUID(), c.`id`, c.`owner_user_id`, 'owner'
FROM `clients` c
LEFT JOIN `client_user_access` cua
  ON cua.`client_id` = c.`id` AND cua.`user_id` = c.`owner_user_id`
WHERE c.`owner_user_id` IS NOT NULL
  AND cua.`id` IS NULL;
