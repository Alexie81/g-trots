ALTER TABLE shop_products
    ADD COLUMN IF NOT EXISTS is_accounting_stock_tracked TINYINT(1) NOT NULL DEFAULT 1
    AFTER accounting_stock_quantity;

-- DEFAULT 1 marchează automat toate rândurile existente la prima adăugare a
-- coloanei și toate produsele noi. Migrarea nu suprascrie alegerile ulterioare.
-- Indexul este creat condițional de ensureShopSchema(), inclusiv pe versiunile
-- MariaDB care nu oferă o sintaxă portabilă CREATE INDEX IF NOT EXISTS.
