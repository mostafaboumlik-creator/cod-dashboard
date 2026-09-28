-- Migration: Jamla customer type field
-- Allows agents to classify wholesale customers (revendeur / pro / personal use).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_type text;
