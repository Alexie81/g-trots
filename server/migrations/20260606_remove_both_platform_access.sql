UPDATE `app_users`
SET `platform_access` = 'desktop'
WHERE `role` = 'admin' AND `platform_access` <> 'desktop';

UPDATE `app_users`
SET `platform_access` = 'mobile'
WHERE `platform_access` = 'both';

ALTER TABLE `app_users`
  MODIFY `platform_access` ENUM('desktop','mobile') NOT NULL DEFAULT 'mobile';
