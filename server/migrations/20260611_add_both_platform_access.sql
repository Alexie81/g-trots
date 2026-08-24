ALTER TABLE `app_users`
  MODIFY `platform_access` ENUM('desktop','mobile','both') NOT NULL DEFAULT 'mobile';
