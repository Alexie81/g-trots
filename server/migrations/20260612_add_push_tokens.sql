CREATE TABLE IF NOT EXISTS `app_push_tokens` (
  `id`           CHAR(36)     NOT NULL PRIMARY KEY,
  `user_id`      CHAR(36)     NOT NULL,
  `token`        VARCHAR(255) NOT NULL,
  `platform`     VARCHAR(32)  NOT NULL DEFAULT 'android',
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_seen_at` TIMESTAMP    NULL DEFAULT NULL,
  UNIQUE KEY `uq_app_push_token` (`token`),
  KEY `idx_app_push_user` (`user_id`),
  CONSTRAINT `fk_app_push_user`
    FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
