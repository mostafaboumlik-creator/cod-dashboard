ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source text DEFAULT 'acquisition';
