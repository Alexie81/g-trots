CREATE TABLE IF NOT EXISTS `chat_conversations` (
  `id`              CHAR(36)      NOT NULL PRIMARY KEY,
  `mobile_account`  VARCHAR(64)   NOT NULL,
  `admin_account`   VARCHAR(64)   NOT NULL DEFAULT 'admin',
  `assigned_agent_id` CHAR(36)    DEFAULT NULL,
  `assigned_at`     TIMESTAMP     NULL DEFAULT NULL,
  `title`           VARCHAR(255)  NOT NULL DEFAULT 'Mobile 1',
  `last_message_at` TIMESTAMP     NULL DEFAULT NULL,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_chat_mobile_account` (`mobile_account`),
  KEY `idx_chat_assigned_agent` (`assigned_agent_id`),
  KEY `idx_chat_last_message` (`last_message_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id`              CHAR(36)               NOT NULL PRIMARY KEY,
  `conversation_id` CHAR(36)               NOT NULL,
  `sender_role`     ENUM('mobile','admin') NOT NULL,
  `sender_id`       VARCHAR(64)            NOT NULL,
  `recipient_role`  ENUM('mobile','admin') NOT NULL,
  `recipient_id`    VARCHAR(64)            NOT NULL,
  `body`            TEXT                   NOT NULL,
  `read_by_mobile`  TINYINT(1)             NOT NULL DEFAULT 0,
  `read_by_admin`   TINYINT(1)             NOT NULL DEFAULT 0,
  `created_at`      TIMESTAMP              NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_chat_messages_conversation` (`conversation_id`, `created_at`),
  KEY `idx_chat_messages_mobile_unread` (`recipient_id`, `read_by_mobile`, `created_at`),
  KEY `idx_chat_messages_admin_unread` (`recipient_role`, `read_by_admin`, `created_at`),
  FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
