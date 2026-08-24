SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'support_chat_access') = 0,
  'ALTER TABLE `app_users` ADD COLUMN `support_chat_access` TINYINT(1) NOT NULL DEFAULT 0 AFTER `platform_access`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND INDEX_NAME = 'idx_app_users_support_chat') = 0,
  'ALTER TABLE `app_users` ADD KEY `idx_app_users_support_chat` (`support_chat_access`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `app_users`
SET `support_chat_access` = 1
WHERE `role` = 'admin' AND `platform_access` = 'desktop';

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'assigned_agent_id') = 0,
  'ALTER TABLE `chat_conversations` ADD COLUMN `assigned_agent_id` CHAR(36) DEFAULT NULL AFTER `admin_account`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'assigned_at') = 0,
  'ALTER TABLE `chat_conversations` ADD COLUMN `assigned_at` TIMESTAMP NULL DEFAULT NULL AFTER `assigned_agent_id`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND INDEX_NAME = 'idx_chat_assigned_agent') = 0,
  'ALTER TABLE `chat_conversations` ADD KEY `idx_chat_assigned_agent` (`assigned_agent_id`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
