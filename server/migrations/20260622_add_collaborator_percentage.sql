-- Default collaborator percentage and per-client fixed/percentage payout mode.

ALTER TABLE `collaborators`
  ADD COLUMN `percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER `email`;

ALTER TABLE `client_collaborator_costs`
  ADD COLUMN `cost_type` ENUM('fixed','percentage') NOT NULL DEFAULT 'fixed' AFTER `collaborator_color`,
  ADD COLUMN `percentage` DECIMAL(5,2) NOT NULL DEFAULT 0.00 AFTER `cost_type`,
  ADD COLUMN `net_base` DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER `percentage`;
