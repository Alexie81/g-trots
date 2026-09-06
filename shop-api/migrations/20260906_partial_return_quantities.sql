ALTER TABLE shop_order_return_items
  ADD COLUMN refused_quantity DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER accepted_quantity;

UPDATE shop_order_return_items
SET refused_quantity = GREATEST(0, requested_quantity - COALESCE(accepted_quantity, 0))
WHERE decision_status IN ('accepted', 'partial', 'refused');
