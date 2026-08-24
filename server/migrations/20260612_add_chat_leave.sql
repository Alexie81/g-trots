SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'status') = 0,
  'ALTER TABLE `chat_conversations` ADD COLUMN `status` ENUM(''active'',''left'',''closed'') NOT NULL DEFAULT ''active'' AFTER `assigned_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'left_at') = 0,
  'ALTER TABLE `chat_conversations` ADD COLUMN `left_at` TIMESTAMP NULL DEFAULT NULL AFTER `status`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations'
     AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%''closed''%') = 0,
  'ALTER TABLE `chat_conversations` MODIFY COLUMN `status` ENUM(''active'',''left'',''closed'') NOT NULL DEFAULT ''active''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND COLUMN_NAME = 'closed_at') = 0,
  'ALTER TABLE `chat_conversations` ADD COLUMN `closed_at` TIMESTAMP NULL DEFAULT NULL AFTER `left_at`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND INDEX_NAME = 'uq_chat_mobile_account') > 0,
  'ALTER TABLE `chat_conversations` DROP INDEX `uq_chat_mobile_account`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_conversations' AND INDEX_NAME = 'idx_chat_mobile_status') = 0,
  'ALTER TABLE `chat_conversations` ADD KEY `idx_chat_mobile_status` (`mobile_account`, `status`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
