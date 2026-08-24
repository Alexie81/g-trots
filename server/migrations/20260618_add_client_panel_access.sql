SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND COLUMN_NAME = 'client_panel_access') = 0,
  'ALTER TABLE `app_users` ADD COLUMN `client_panel_access` TINYINT(1) NOT NULL DEFAULT 1 AFTER `support_chat_access`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_users' AND INDEX_NAME = 'idx_app_users_client_panel') = 0,
  'ALTER TABLE `app_users` ADD KEY `idx_app_users_client_panel` (`client_panel_access`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE `app_users`
SET `client_panel_access` = 1
WHERE `client_panel_access` IS NULL
   OR LOWER(`username`) = 'admin'
   OR `role` IN ('admin', 'manager');
