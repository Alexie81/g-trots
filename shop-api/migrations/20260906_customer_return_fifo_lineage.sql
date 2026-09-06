-- Permanent lineage for accounting-tracked customer returns.
-- Applied idempotently by ensureShopSchema(); kept here for manual/database audits.

CREATE TABLE IF NOT EXISTS shop_customer_return_fifo_origins (
    id CHAR(36) NOT NULL PRIMARY KEY,
    customer_return_nir_id CHAR(36) NOT NULL,
    customer_return_nir_line_id CHAR(36) NOT NULL,
    return_invoice_id CHAR(36) NOT NULL,
    sales_invoice_id CHAR(36) NOT NULL,
    sales_invoice_line_id CHAR(36) NOT NULL,
    inventory_cost_layer_id CHAR(36) NOT NULL,
    original_nir_document_id CHAR(36) NOT NULL,
    original_nir_line_id CHAR(36) NOT NULL,
    product_id CHAR(36) NOT NULL,
    supplier_id CHAR(36) NULL,
    restored_quantity DECIMAL(18,4) NOT NULL,
    unit_cost_ron DECIMAL(18,6) NOT NULL,
    created_by VARCHAR(180) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_shop_return_origin_layer (customer_return_nir_line_id, inventory_cost_layer_id),
    INDEX idx_shop_return_origin_return_nir (customer_return_nir_id, original_nir_document_id),
    INDEX idx_shop_return_origin_original_line (original_nir_line_id, created_at),
    INDEX idx_shop_return_origin_invoice (return_invoice_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shop_customer_return_supplier_storno_allocations (
    id CHAR(36) NOT NULL PRIMARY KEY,
    customer_return_origin_id CHAR(36) NOT NULL,
    supplier_return_nir_id CHAR(36) NOT NULL,
    supplier_return_nir_line_id CHAR(36) NOT NULL,
    quantity DECIMAL(18,4) NOT NULL,
    created_by VARCHAR(180) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE INDEX uq_shop_return_supplier_allocation (customer_return_origin_id, supplier_return_nir_line_id),
    INDEX idx_shop_return_supplier_origin (customer_return_origin_id, created_at),
    INDEX idx_shop_return_supplier_nir (supplier_return_nir_id, supplier_return_nir_line_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
