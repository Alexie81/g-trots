-- Add G-Trots collaborators and per-client collaborator labor costs.

CREATE TABLE IF NOT EXISTS `collaborators` (
  `id`         CHAR(36)      NOT NULL PRIMARY KEY,
  `name`       VARCHAR(255)  NOT NULL,
  `role`       VARCHAR(100)  NOT NULL DEFAULT '',
  `color`      VARCHAR(7)    NOT NULL DEFAULT '#14B8A6',
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `client_collaborator_costs` (
  `id`                 CHAR(36)      NOT NULL PRIMARY KEY,
  `client_id`          CHAR(36)      NOT NULL,
  `collaborator_id`    CHAR(36)      DEFAULT NULL,
  `collaborator_name`  VARCHAR(255)  NOT NULL,
  `collaborator_color` VARCHAR(7)    NOT NULL DEFAULT '#14B8A6',
  `cost`               DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_client_collaborator_client` (`client_id`),
  KEY `idx_client_collaborator_collaborator` (`collaborator_id`),
  CONSTRAINT `fk_client_collaborator_client`
    FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_client_collaborator_collaborator`
    FOREIGN KEY (`collaborator_id`) REFERENCES `collaborators`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
