-- ============================================================
-- G-Trots CRM - Schema MySQL
-- Baza de date: cabitro_mobile_trotty_clients
-- Ruleaza acest script o singura data in phpMyAdmin sau CLI
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Useri aplicatie, roluri si sesiuni login
CREATE TABLE IF NOT EXISTS `app_users` (
  `id`              CHAR(36)      NOT NULL PRIMARY KEY,
  `username`        VARCHAR(80)   NOT NULL,
  `password_hash`   VARCHAR(255)  NOT NULL,
  `display_name`    VARCHAR(255)  NOT NULL,
  `role`            ENUM('admin','manager','user') NOT NULL DEFAULT 'user',
  `platform_access` ENUM('desktop','mobile','both') NOT NULL DEFAULT 'mobile',
  `support_chat_access` TINYINT(1) NOT NULL DEFAULT 0,
  `client_panel_access` TINYINT(1) NOT NULL DEFAULT 1,
  `client_edit_access` TINYINT(1) NOT NULL DEFAULT 0,
  `service_sheet_access` TINYINT(1) NOT NULL DEFAULT 1,
  `client_financial_access` TINYINT(1) NOT NULL DEFAULT 1,
  `is_active`       TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_app_users_username` (`username`),
  KEY `idx_app_users_role` (`role`),
  KEY `idx_app_users_platform` (`platform_access`),
  KEY `idx_app_users_support_chat` (`support_chat_access`),
  KEY `idx_app_users_client_panel` (`client_panel_access`),
  KEY `idx_app_users_client_edit` (`client_edit_access`),
  KEY `idx_app_users_service_sheet` (`service_sheet_access`),
  KEY `idx_app_users_client_financial` (`client_financial_access`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_sessions` (
  `id`         CHAR(36) NOT NULL PRIMARY KEY,
  `user_id`    CHAR(36) NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `platform`   ENUM('desktop','mobile') NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_app_sessions_token` (`token_hash`),
  KEY `idx_app_sessions_user` (`user_id`),
  KEY `idx_app_sessions_expires` (`expires_at`),
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_push_tokens` (
  `id`           CHAR(36)     NOT NULL PRIMARY KEY,
  `user_id`      CHAR(36)     NOT NULL,
  `token`        VARCHAR(255) NOT NULL,
  `platform`     VARCHAR(32)  NOT NULL DEFAULT 'android',
  `created_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `last_seen_at` TIMESTAMP    NULL DEFAULT NULL,
  UNIQUE KEY `uq_app_push_token` (`token`),
  KEY `idx_app_push_user` (`user_id`),
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_migrations` (
  `id`         VARCHAR(120) NOT NULL PRIMARY KEY,
  `applied_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `company_settings` (
  `id`                  TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  `company_name`        VARCHAR(255)     NOT NULL DEFAULT '',
  `fiscal_code`         VARCHAR(80)      NOT NULL DEFAULT '',
  `registration_number` VARCHAR(80)      NOT NULL DEFAULT '',
  `address`             TEXT             DEFAULT NULL,
  `phone`               VARCHAR(50)      DEFAULT NULL,
  `email`               VARCHAR(255)     DEFAULT NULL,
  `website`             VARCHAR(255)     DEFAULT NULL,
  `bank_name`           VARCHAR(255)     DEFAULT NULL,
  `iban`                VARCHAR(80)      DEFAULT NULL,
  `stamp_image`         MEDIUMTEXT       DEFAULT NULL,
  `updated_by`          CHAR(36)         DEFAULT NULL,
  `updated_at`          TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_company_settings_updated_by` (`updated_by`),
  FOREIGN KEY (`updated_by`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `price_presets` (
  `id`         CHAR(36)      NOT NULL PRIMARY KEY,
  `label`      VARCHAR(120)  NOT NULL,
  `price`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_active`  TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_price_presets_active` (`is_active`),
  KEY `idx_price_presets_price` (`price`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `whatsapp_predefined_messages` (
  `id`              CHAR(36)     NOT NULL PRIMARY KEY,
  `title`           VARCHAR(120) NOT NULL,
  `body`            TEXT         NOT NULL,
  `created_by`      CHAR(36)     DEFAULT NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_whatsapp_messages_updated` (`updated_at`),
  FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tabela profiles ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `profiles` (
  `id`         CHAR(36)      NOT NULL PRIMARY KEY,
  `name`       VARCHAR(255)  NOT NULL,
  `role`       VARCHAR(100)  NOT NULL DEFAULT 'agent',
  `phone`      VARCHAR(50)   DEFAULT NULL,
  `email`      VARCHAR(255)  DEFAULT NULL,
  `percentage` DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `color`      VARCHAR(7)    NOT NULL DEFAULT '#FF6B35',
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tabela collaborators
CREATE TABLE IF NOT EXISTS `collaborators` (
  `id`         CHAR(36)      NOT NULL PRIMARY KEY,
  `name`       VARCHAR(255)  NOT NULL,
  `role`       VARCHAR(100)  NOT NULL DEFAULT '',
  `phone`      VARCHAR(50)   DEFAULT NULL,
  `email`      VARCHAR(255)  DEFAULT NULL,
  `percentage` DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `color`      VARCHAR(7)    NOT NULL DEFAULT '#14B8A6',
  `created_at` TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tabela clients ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `clients` (
  `id`                  CHAR(36)      NOT NULL PRIMARY KEY,
  `name`                VARCHAR(255)  NOT NULL,
  `phone`               VARCHAR(50)   NOT NULL,
  `email`               VARCHAR(255)  DEFAULT NULL,
  `status`              ENUM('interesat','va_folosi_codul','cod_folosit')
                                      NOT NULL DEFAULT 'interesat',
  `qr_code`             VARCHAR(100)  NOT NULL,
  `qr_used`             TINYINT(1)    NOT NULL DEFAULT 0,
  `qr_used_at`          TIMESTAMP     NULL DEFAULT NULL,
  `discount_percentage` DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `price`               DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `predefined_price`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `advance_amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency_code`       VARCHAR(3)    NOT NULL DEFAULT 'RON',
  `payment_status`      ENUM('incasati','de_incasat')
                                      NOT NULL DEFAULT 'de_incasat',
  `manopera_colaboratori` DECIMAL(10,2) NULL DEFAULT NULL,
  `valoare_piese`       DECIMAL(10,2) NULL DEFAULT NULL,
  `service_parts_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `service_labor_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `alte_cheltuieli`     DECIMAL(10,2) NULL DEFAULT NULL,
  `notes`               TEXT          DEFAULT NULL,
  `profile_id`          CHAR(36)      DEFAULT NULL,
  `owner_user_id`       CHAR(36)      DEFAULT NULL,
  `price_edit_count`    INT           NOT NULL DEFAULT 0,
  `is_finalized`        TINYINT(1)    NOT NULL DEFAULT 0,
  `finalization_source` ENUM('manual','service') DEFAULT NULL,
  `created_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_qr_code` (`qr_code`),
  KEY `idx_clients_updated` (`updated_at`),
  KEY `idx_clients_owner_user` (`owner_user_id`),
  FOREIGN KEY (`owner_user_id`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Acces multiplu la clienti pentru userii mobili care scaneaza acelasi QR
CREATE TABLE IF NOT EXISTS `client_user_access` (
  `id`         CHAR(36) NOT NULL PRIMARY KEY,
  `client_id`  CHAR(36) NOT NULL,
  `user_id`    CHAR(36) NOT NULL,
  `source`     ENUM('owner','scan','manual') NOT NULL DEFAULT 'manual',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_client_user_access` (`client_id`, `user_id`),
  KEY `idx_client_user_access_user` (`user_id`),
  KEY `idx_client_user_access_client` (`client_id`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `app_users`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Istoric actiuni pe client: creare, editare, scanare, finalizare
CREATE TABLE IF NOT EXISTS `client_activity_logs` (
  `id`            CHAR(36) NOT NULL PRIMARY KEY,
  `client_id`     CHAR(36) NOT NULL,
  `actor_user_id` CHAR(36) DEFAULT NULL,
  `action`        ENUM('created','updated','scanned','finalized','deleted') NOT NULL,
  `summary`       VARCHAR(255) NOT NULL DEFAULT '',
  `details`       TEXT DEFAULT NULL,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_client_activity_client` (`client_id`, `created_at`),
  KEY `idx_client_activity_actor` (`actor_user_id`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`actor_user_id`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Costuri manopera pe colaboratori
CREATE TABLE IF NOT EXISTS `client_collaborator_costs` (
  `id`                 CHAR(36)      NOT NULL PRIMARY KEY,
  `client_id`          CHAR(36)      NOT NULL,
  `collaborator_id`    CHAR(36)      DEFAULT NULL,
  `collaborator_name`  VARCHAR(255)  NOT NULL,
  `collaborator_color` VARCHAR(7)    NOT NULL DEFAULT '#14B8A6',
  `cost_type`          ENUM('fixed','percentage') NOT NULL DEFAULT 'fixed',
  `percentage`         DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `net_base`           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `cost`               DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `payment_status`     ENUM('incasati','de_incasat') NOT NULL DEFAULT 'de_incasat',
  `created_at`         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_client_collaborator_client` (`client_id`),
  KEY `idx_client_collaborator_collaborator` (`collaborator_id`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`collaborator_id`) REFERENCES `collaborators`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tipuri de cheltuieli configurabile
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id`         CHAR(36)     NOT NULL PRIMARY KEY,
  `name`       VARCHAR(255) NOT NULL,
  `color`      VARCHAR(7)   NOT NULL DEFAULT '#EF4444',
  `created_at` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Cheltuieli personalizate selectate pe client
CREATE TABLE IF NOT EXISTS `client_expense_costs` (
  `id`            CHAR(36)      NOT NULL PRIMARY KEY,
  `client_id`     CHAR(36)      NOT NULL,
  `expense_id`    CHAR(36)      DEFAULT NULL,
  `expense_name`  VARCHAR(255)  NOT NULL,
  `expense_color` VARCHAR(7)    NOT NULL DEFAULT '#EF4444',
  `cost`          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at`    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_client_expense_client` (`client_id`),
  KEY `idx_client_expense_category` (`expense_id`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (`expense_id`) REFERENCES `expense_categories`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── Tabela service_sheets ──────────────────────────────────
-- Conversatii chat intre aplicatia mobila si admin desktop
CREATE TABLE IF NOT EXISTS `chat_conversations` (
  `id`              CHAR(36)      NOT NULL PRIMARY KEY,
  `mobile_account`  VARCHAR(64)   NOT NULL,
  `admin_account`   VARCHAR(64)   NOT NULL DEFAULT 'admin',
  `assigned_agent_id` CHAR(36)    DEFAULT NULL,
  `assigned_at`     TIMESTAMP     NULL DEFAULT NULL,
  `status`          ENUM('active','left','closed') NOT NULL DEFAULT 'active',
  `left_at`         TIMESTAMP     NULL DEFAULT NULL,
  `closed_at`       TIMESTAMP     NULL DEFAULT NULL,
  `title`           VARCHAR(255)  NOT NULL DEFAULT 'Mobile 1',
  `last_message_at` TIMESTAMP     NULL DEFAULT NULL,
  `created_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_chat_mobile_status` (`mobile_account`, `status`),
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

CREATE TABLE IF NOT EXISTS `service_sheets` (
  `id`                         CHAR(36)      NOT NULL PRIMARY KEY,
  `sheet_number`               VARCHAR(40)   NOT NULL,
  `client_id`                  CHAR(36)      DEFAULT NULL,
  `qr_code`                    VARCHAR(100)  NOT NULL DEFAULT '',
  `client_name`                VARCHAR(255)  NOT NULL DEFAULT '',
  `client_phone`               VARCHAR(50)   NOT NULL DEFAULT '',
  `client_email`               VARCHAR(255)  DEFAULT NULL,
  `client_address`             TEXT          DEFAULT NULL,
  `company_name`               VARCHAR(255)  NOT NULL DEFAULT '',
  `company_fiscal_code`        VARCHAR(80)   NOT NULL DEFAULT '',
  `company_registration_number` VARCHAR(80)  NOT NULL DEFAULT '',
  `company_address`            TEXT          DEFAULT NULL,
  `company_phone`              VARCHAR(50)   DEFAULT NULL,
  `company_email`              VARCHAR(255)  DEFAULT NULL,
  `show_company_details`       TINYINT(1)    NOT NULL DEFAULT 0,
  `vehicle_type`               ENUM('trotineta','scuter','altul') NOT NULL DEFAULT 'trotineta',
  `vehicle_brand_model`        VARCHAR(255)  NOT NULL DEFAULT '',
  `vehicle_registration`       VARCHAR(80)   NOT NULL DEFAULT '',
  `vehicle_series`             VARCHAR(120)  NOT NULL DEFAULT '',
  `vehicle_km`                 VARCHAR(60)   NOT NULL DEFAULT '',
  `vehicle_battery`            VARCHAR(120)  NOT NULL DEFAULT '',
  `issue_description`          TEXT          DEFAULT NULL,
  `visible_damage`             TEXT          DEFAULT NULL,
  `accessories_charger`        TINYINT(1)    NOT NULL DEFAULT 0,
  `accessories_keys`           TINYINT(1)    NOT NULL DEFAULT 0,
  `accessories_saddle`         TINYINT(1)    NOT NULL DEFAULT 0,
  `accessories_other`          TINYINT(1)    NOT NULL DEFAULT 0,
  `accessories_other_text`     VARCHAR(255)  NOT NULL DEFAULT '',
  `quick_powers_on`            TINYINT(1)    NOT NULL DEFAULT 0,
  `quick_water_traces`         TINYINT(1)    NOT NULL DEFAULT 0,
  `quick_impact`               TINYINT(1)    NOT NULL DEFAULT 0,
  `quick_battery_risk`         TINYINT(1)    NOT NULL DEFAULT 0,
  `product_photo`              ENUM('da','nu','') NOT NULL DEFAULT '',
  `diagnostic`                 TEXT          DEFAULT NULL,
  `work_performed`             TEXT          DEFAULT NULL,
  `parts_used`                 TEXT          DEFAULT NULL,
  `observations`               TEXT          DEFAULT NULL,
  `diagnostic_price`           DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `parts_price`                DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `labor_price`                DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `internal_parts_cost`       DECIMAL(10,2) NULL DEFAULT NULL,
  `internal_labor_cost`       DECIMAL(10,2) NULL DEFAULT NULL,
  `internal_other_costs`      DECIMAL(10,2) NULL DEFAULT NULL,
  `total_price`                DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `advance_amount`             DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `currency_code`              VARCHAR(3)    NOT NULL DEFAULT 'RON',
  `payment_status`             ENUM('incasati','de_incasat')
                                             NOT NULL DEFAULT 'de_incasat',
  `client_package_price`       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `client_discount`            DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `final_price`                DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `deadline`                   VARCHAR(120)  NOT NULL DEFAULT '',
  `deadline_unit`              VARCHAR(24)   NOT NULL DEFAULT 'zile',
  `warranty`                   VARCHAR(120)  NOT NULL DEFAULT '',
  `storage_fee_per_day`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `storage_after_days`         INT           NOT NULL DEFAULT 0,
  `old_parts_client`           TINYINT(1)    NOT NULL DEFAULT 0,
  `old_parts_recycle`          TINYINT(1)    NOT NULL DEFAULT 0,
  `approve_diagnostic_test`    TINYINT(1)    NOT NULL DEFAULT 0,
  `approve_repair_estimate`    TINYINT(1)    NOT NULL DEFAULT 0,
  `reject_repair`              TINYINT(1)    NOT NULL DEFAULT 0,
  `vehicle_delivered_checked`  TINYINT(1)    NOT NULL DEFAULT 0,
  `client_signature`           MEDIUMTEXT    DEFAULT NULL,
  `client_signed_at`           DATETIME      DEFAULT NULL,
  `is_finalized`               TINYINT(1)    NOT NULL DEFAULT 0,
  `finalized_at`               DATETIME      DEFAULT NULL,
  `service_pdf_base_url`        VARCHAR(500)  DEFAULT NULL,
  `service_pdf_filename`        VARCHAR(255)  DEFAULT NULL,
  `service_pdf_share_url`       VARCHAR(700)  DEFAULT NULL,
  `service_pdf_generated_at`    DATETIME      DEFAULT NULL,
  `technician_name`            VARCHAR(255)  NOT NULL DEFAULT '',
  `mechanic_name`              VARCHAR(255)  NOT NULL DEFAULT '',
  `service_type`               VARCHAR(100)  NOT NULL DEFAULT 'Verificare generala',
  `service_date`               TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by`                 CHAR(36)      DEFAULT NULL,
  `updated_by`                 CHAR(36)      DEFAULT NULL,
  `created_at`                 TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`                 TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_service_sheet_number` (`sheet_number`),
  KEY `idx_service_client` (`client_id`),
  KEY `idx_service_qr_code` (`qr_code`),
  KEY `idx_service_finalized` (`is_finalized`, `finalized_at`),
  KEY `idx_service_created` (`created_at`),
  KEY `idx_service_updated` (`updated_at`),
  KEY `idx_service_total` (`total_price`),
  FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY (`updated_by`) REFERENCES `app_users`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
