-- G-Trots / MariaDB 10.5+
-- Modul NIR, referințe multi-furnizor, istoric de achiziție și loturi FIFO.
-- Migrarea este reluabilă. Runtime-ul API execută aceleași verificări de
-- existență în ensureShopSchema(), inclusiv pentru instalările mai vechi.

START TRANSACTION;

ALTER TABLE shop_products
  ADD COLUMN IF NOT EXISTS accounting_stock_quantity DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER stock_quantity;
ALTER TABLE shop_products MODIFY accounting_stock_quantity DECIMAL(18,4) NOT NULL DEFAULT 0;

ALTER TABLE shop_suppliers
  ADD COLUMN IF NOT EXISTS vat_number VARCHAR(60) NULL,
  ADD COLUMN IF NOT EXISTS is_vat_payer TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_vat_rate DECIMAL(9,4) NOT NULL DEFAULT 19.0000,
  ADD COLUMN IF NOT EXISTS city VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS county VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS postal_code VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS country VARCHAR(80) NOT NULL DEFAULT 'România',
  ADD COLUMN IF NOT EXISTS default_currency CHAR(3) NOT NULL DEFAULT 'RON',
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(180) NULL,
  ADD COLUMN IF NOT EXISTS row_version INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS shop_warehouses (
  id CHAR(36) NOT NULL PRIMARY KEY, code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL, is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_shop_warehouses_active (is_active, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO shop_warehouses (id, code, name, is_default, is_active)
VALUES ('00000000-0000-4000-8000-000000000001', 'MAIN', 'Gestiune principală', 1, 1);

CREATE TABLE IF NOT EXISTS shop_nir_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  default_warehouse_id CHAR(36) NOT NULL,
  include_vat_in_inventory_cost TINYINT(1) NOT NULL DEFAULT 0,
  price_variance_warning_percent DECIMAL(7,2) NOT NULL DEFAULT 20.00,
  next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 1,
  number_prefix VARCHAR(30) NOT NULL DEFAULT 'NIR',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO shop_nir_settings (id, default_warehouse_id)
VALUES (1, '00000000-0000-4000-8000-000000000001');

CREATE TABLE IF NOT EXISTS shop_supplier_product_references (
  id CHAR(36) NOT NULL PRIMARY KEY, supplier_id CHAR(36) NOT NULL, product_id CHAR(36) NOT NULL,
  supplier_product_code_original VARCHAR(180) NOT NULL,
  supplier_product_code_normalized VARCHAR(180) NOT NULL,
  supplier_product_name VARCHAR(255) NULL, supplier_ean VARCHAR(120) NULL,
  purchase_unit VARCHAR(40) NOT NULL DEFAULT 'buc', stock_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
  conversion_factor DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  is_primary_for_supplier TINYINT(1) NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_used_at DATETIME NULL, last_confirmed_purchase_price DECIMAL(18,6) NULL,
  last_confirmed_currency CHAR(3) NULL, last_confirmed_price_ron DECIMAL(18,6) NULL,
  last_confirmed_at DATETIME NULL, created_by VARCHAR(180) NULL, updated_by VARCHAR(180) NULL,
  row_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_shop_supplier_code (supplier_id, supplier_product_code_normalized),
  INDEX idx_shop_supplier_ref_product (product_id),
  INDEX idx_shop_supplier_ref_supplier_product (supplier_id, product_id),
  INDEX idx_shop_supplier_ref_code (supplier_product_code_normalized),
  INDEX idx_shop_supplier_ref_ean (supplier_ean), INDEX idx_shop_supplier_ref_last_used (last_used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_legacy_supplier_codes (
  id CHAR(36) NOT NULL PRIMARY KEY, product_id CHAR(36) NOT NULL,
  code_original VARCHAR(180) NOT NULL, code_normalized VARCHAR(180) NOT NULL,
  source_domain VARCHAR(120) NULL, resolution_status VARCHAR(30) NOT NULL DEFAULT 'unresolved_supplier',
  resolved_reference_id CHAR(36) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL, UNIQUE INDEX uq_shop_legacy_product_code (product_id, code_normalized),
  INDEX idx_shop_legacy_resolution (resolution_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_nir_documents (
  id CHAR(36) NOT NULL PRIMARY KEY, temporary_number VARCHAR(80) NOT NULL, nir_number VARCHAR(80) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft', supplier_id CHAR(36) NULL, warehouse_id CHAR(36) NOT NULL,
  supplier_invoice_series VARCHAR(60) NULL, supplier_invoice_number VARCHAR(120) NULL,
  supplier_invoice_date DATE NULL, nir_date DATE NOT NULL, reception_date DATE NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'RON', exchange_rate DECIMAL(18,8) NOT NULL DEFAULT 1.00000000,
  exchange_rate_date DATE NULL, notes TEXT NULL, source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  external_identifier VARCHAR(180) NULL, source_file_hash CHAR(64) NULL, duplicate_fingerprint CHAR(64) NULL,
  subtotal DECIMAL(18,2) NOT NULL DEFAULT 0, vat_total DECIMAL(18,2) NOT NULL DEFAULT 0,
  grand_total DECIMAL(18,2) NOT NULL DEFAULT 0, subtotal_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
  vat_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0, grand_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
  inventory_cost_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
  total_difference_ron DECIMAL(18,2) NOT NULL DEFAULT 0, row_version INT UNSIGNED NOT NULL DEFAULT 1,
  confirmed_at DATETIME NULL, confirmed_by VARCHAR(180) NULL, reversed_at DATETIME NULL,
  reversed_by VARCHAR(180) NULL, reversal_of_id CHAR(36) NULL, created_by VARCHAR(180) NULL,
  updated_by VARCHAR(180) NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_shop_nir_number (nir_number), UNIQUE INDEX uq_shop_nir_temporary_number (temporary_number),
  UNIQUE INDEX uq_shop_nir_confirmed_duplicate (duplicate_fingerprint),
  INDEX idx_shop_nir_status_date (status, reception_date), INDEX idx_shop_nir_supplier_date (supplier_id, reception_date),
  INDEX idx_shop_nir_invoice (supplier_invoice_number, supplier_invoice_date), INDEX idx_shop_nir_reversal (reversal_of_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_nir_lines (
  id CHAR(36) NOT NULL PRIMARY KEY, nir_document_id CHAR(36) NOT NULL, line_number INT UNSIGNED NOT NULL,
  product_id CHAR(36) NULL, supplier_product_reference_id CHAR(36) NULL,
  supplier_product_code VARCHAR(180) NULL, supplier_product_code_normalized VARCHAR(180) NULL,
  supplier_product_name VARCHAR(255) NOT NULL, supplier_ean VARCHAR(120) NULL,
  supplier_description TEXT NULL, raw_description TEXT NULL,
  product_snapshot_name VARCHAR(255) NULL, sku_snapshot VARCHAR(120) NULL, ean_snapshot VARCHAR(120) NULL,
  purchase_unit VARCHAR(40) NOT NULL DEFAULT 'buc', stock_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
  invoiced_quantity DECIMAL(18,4) NOT NULL DEFAULT 0, received_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  accepted_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  rejected_quantity DECIMAL(18,4) NOT NULL DEFAULT 0, conversion_factor DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  stock_quantity DECIMAL(18,4) NOT NULL DEFAULT 0, unit_price DECIMAL(18,6) NOT NULL DEFAULT 0,
  discount_percent DECIMAL(9,4) NOT NULL DEFAULT 0, discount_value DECIMAL(18,6) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(9,4) NOT NULL DEFAULT 0,
  line_net DECIMAL(18,6) NOT NULL DEFAULT 0, line_vat DECIMAL(18,6) NOT NULL DEFAULT 0,
  line_total DECIMAL(18,6) NOT NULL DEFAULT 0, line_net_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_vat_ron DECIMAL(18,2) NOT NULL DEFAULT 0, line_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
  allocated_cost_ron DECIMAL(18,2) NOT NULL DEFAULT 0, inventory_unit_cost_ron DECIMAL(18,6) NOT NULL DEFAULT 0,
  inventory_cost_total_ron DECIMAL(18,2) NOT NULL DEFAULT 0,
  resolution_status VARCHAR(30) NOT NULL DEFAULT 'unmatched', match_method VARCHAR(30) NOT NULL DEFAULT 'unmatched',
  match_confidence DECIMAL(5,4) NOT NULL DEFAULT 0, is_stock_item TINYINT(1) NOT NULL DEFAULT 1,
  difference_reason VARCHAR(40) NULL, difference_notes VARCHAR(500) NULL,
  mismatch_reason VARCHAR(500) NULL,
  row_version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_shop_nir_line_number (nir_document_id, line_number), INDEX idx_shop_nir_line_product (product_id),
  INDEX idx_shop_nir_line_reference (supplier_product_reference_id), INDEX idx_shop_nir_line_code (supplier_product_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE shop_nir_lines
  ADD COLUMN IF NOT EXISTS difference_reason VARCHAR(40) NULL AFTER is_stock_item,
  ADD COLUMN IF NOT EXISTS difference_notes VARCHAR(500) NULL AFTER difference_reason;

CREATE TABLE IF NOT EXISTS shop_nir_attachments (
  id CHAR(36) NOT NULL PRIMARY KEY, nir_document_id CHAR(36) NOT NULL,
  original_name VARCHAR(255) NOT NULL, storage_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL, extension VARCHAR(20) NOT NULL, file_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL, extraction_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  extraction_message VARCHAR(500) NULL, extracted_json LONGTEXT NULL, created_by VARCHAR(180) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_shop_nir_attachment_hash (nir_document_id, sha256),
  INDEX idx_shop_nir_attachment_document (nir_document_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_inventory_cost_layers (
  id CHAR(36) NOT NULL PRIMARY KEY, product_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL,
  supplier_id CHAR(36) NULL, supplier_product_reference_id CHAR(36) NULL,
  nir_document_id CHAR(36) NULL, nir_line_id CHAR(36) NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'NIR', source_reference VARCHAR(120) NULL,
  invoice_number_snapshot VARCHAR(180) NULL, supplier_code_snapshot VARCHAR(180) NULL,
  reception_date DATE NOT NULL, confirmed_at DATETIME NULL, original_quantity DECIMAL(18,4) NOT NULL,
  remaining_quantity DECIMAL(18,4) NOT NULL, stock_unit VARCHAR(40) NOT NULL DEFAULT 'buc',
  unit_cost_ron DECIMAL(18,6) NOT NULL,
  total_cost_ron DECIMAL(18,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'RON',
  original_unit_price DECIMAL(18,6) NULL, exchange_rate DECIMAL(18,8) NOT NULL DEFAULT 1.00000000,
  status VARCHAR(30) NOT NULL DEFAULT 'open', is_reversed TINYINT(1) NOT NULL DEFAULT 0,
  reversed_at DATETIME NULL, created_by VARCHAR(180) NULL,
  row_version INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_shop_fifo_nir_line (nir_line_id),
  INDEX idx_shop_fifo_product_order (product_id, warehouse_id, reception_date, created_at),
  INDEX idx_shop_fifo_remaining (product_id, warehouse_id, is_reversed, remaining_quantity),
  INDEX idx_shop_fifo_supplier (supplier_id, reception_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_inventory_layer_consumptions (
  id CHAR(36) NOT NULL PRIMARY KEY, inventory_cost_layer_id CHAR(36) NOT NULL,
  product_id CHAR(36) NOT NULL, warehouse_id CHAR(36) NOT NULL,
  source_document_type VARCHAR(40) NOT NULL, source_document_id CHAR(36) NOT NULL, source_line_id CHAR(36) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL, unit_cost_ron DECIMAL(18,6) NOT NULL,
  total_cost_ron DECIMAL(18,2) NOT NULL, idempotency_key VARCHAR(120) NOT NULL,
  consumed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, created_by VARCHAR(180) NULL,
  reversal_consumption_id CHAR(36) NULL, row_version INT UNSIGNED NOT NULL DEFAULT 1,
  reversed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uq_shop_fifo_consumption_source (source_document_type, source_line_id, inventory_cost_layer_id),
  UNIQUE INDEX uq_shop_fifo_consumption_idempotency (idempotency_key, inventory_cost_layer_id),
  INDEX idx_shop_fifo_consumption_layer (inventory_cost_layer_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_domain_audit (
  id CHAR(36) NOT NULL PRIMARY KEY, action_type VARCHAR(80) NOT NULL, entity_type VARCHAR(80) NOT NULL,
  entity_id CHAR(36) NOT NULL, actor_id VARCHAR(180) NULL, actor_name VARCHAR(180) NULL,
  old_values_json LONGTEXT NULL, new_values_json LONGTEXT NULL, context_json LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shop_audit_entity (entity_type, entity_id, created_at), INDEX idx_shop_audit_actor (actor_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_nir_idempotency (
  idempotency_key VARCHAR(120) NOT NULL PRIMARY KEY, nir_document_id CHAR(36) NOT NULL,
  request_hash CHAR(64) NOT NULL, response_json LONGTEXT NULL, completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_shop_nir_idempotency_document (nir_document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_domain_outbox (
  id CHAR(36) NOT NULL PRIMARY KEY, event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(80) NOT NULL, aggregate_id CHAR(36) NOT NULL,
  payload_json LONGTEXT NOT NULL, published_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_shop_outbox_pending (published_at, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE shop_inventory_movements
  ADD COLUMN IF NOT EXISTS warehouse_id CHAR(36) NULL AFTER product_id,
  ADD COLUMN IF NOT EXISTS nir_document_id CHAR(36) NULL AFTER order_id,
  ADD COLUMN IF NOT EXISTS nir_line_id CHAR(36) NULL AFTER nir_document_id,
  ADD COLUMN IF NOT EXISTS inventory_cost_layer_id CHAR(36) NULL AFTER nir_line_id,
  ADD COLUMN IF NOT EXISTS accounting_quantity_delta DECIMAL(18,4) NULL AFTER quantity_delta,
  ADD COLUMN IF NOT EXISTS accounting_quantity_after DECIMAL(18,4) NULL AFTER quantity_after,
  ADD COLUMN IF NOT EXISTS inventory_unit_cost_ron DECIMAL(18,6) NULL AFTER accounting_quantity_after,
  ADD COLUMN IF NOT EXISTS inventory_cost_total_ron DECIMAL(18,2) NULL AFTER inventory_unit_cost_ron,
  ADD COLUMN IF NOT EXISTS reception_date DATE NULL AFTER inventory_cost_total_ron,
  ADD COLUMN IF NOT EXISTS reversal_of_movement_id CHAR(36) NULL AFTER reception_date;

-- Aceste indexuri sunt create condițional de ensureShopSchema() pentru versiunile
-- MariaDB care nu acceptă ADD INDEX IF NOT EXISTS în ALTER TABLE.

-- Valorile legacy sunt copiate de ensureShopSchema() prin funcția canonică PHP
-- shopNirNormalizeSupplierCode(). SQL-ul nu încearcă o a doua normalizare,
-- tocmai pentru a nu obține reguli diferite între migrare, desktop și mobil.

COMMIT;
