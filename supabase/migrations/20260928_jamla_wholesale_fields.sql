-- Migration: Jamla Sport wholesale fields
-- Adds nullable columns for B2B/wholesale orders while preserving full retail compatibility.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS pack_size integer,
  ADD COLUMN IF NOT EXISTS minimum_quantity integer;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS quantity integer,
  ADD COLUMN IF NOT EXISTS payment_mode text;
