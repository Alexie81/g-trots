ALTER TABLE `clients`
  ADD COLUMN `owner_user_id` CHAR(36) DEFAULT NULL AFTER `profile_id`,
  ADD KEY `idx_clients_owner_user` (`owner_user_id`),
  ADD CONSTRAINT `fk_clients_owner_user`
    FOREIGN KEY (`owner_user_id`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
