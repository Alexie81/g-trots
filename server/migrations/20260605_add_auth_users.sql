-- Add shared login users, roles, platform access and sessions.
-- The API bootstraps the default admin/admin account automatically on first login.

CREATE TABLE IF NOT EXISTS `app_users` (
  `id`              CHAR(36)      NOT NULL PRIMARY KEY,
  `username`        VARCHAR(80)   NOT NULL,
  `password_hash`   VARCHAR(255)  NOT NULL,
  `display_name`    VARCHAR(255)  NOT NULL,
  `role`            ENUM('admin','manager','user') NOT NULL DEFAULT 'user',
  `platform_access` ENUM('desktop','mobile') NOT NULL DEFAULT 'mobile',
  `support_chat_access` TINYINT(1) NOT NULL DEFAULT 0,
  `is_active`       TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_app_users_username` (`username`),
  KEY `idx_app_users_role` (`role`),
  KEY `idx_app_users_platform` (`platform_access`),
  KEY `idx_app_users_support_chat` (`support_chat_access`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_sessions` (
  `id`         CHAR(36) NOT NULL PRIMARY KEY,
  `user_id`    CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `platform`   ENUM('desktop','mobile') NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_app_sessions_token` (`token_hash`),
  KEY `idx_app_sessions_user` (`user_id`),
  KEY `idx_app_sessions_expires` (`expires_at`),
  CONSTRAINT `fk_app_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
