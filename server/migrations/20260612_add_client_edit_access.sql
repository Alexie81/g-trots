SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'client_edit_access') = 0,
  'ALTER TABLE `app_users` ADD COLUMN `client_edit_access` TINYINT(1) NOT NULL DEFAULT 0 AFTER `support_chat_access`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND INDEX_NAME = 'idx_app_users_client_edit') = 0,
  'ALTER TABLE `app_users` ADD KEY `idx_app_users_client_edit` (`client_edit_access`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `app_users`
SET `client_edit_access` = 1
WHERE LOWER(`username`) = 'admin';
