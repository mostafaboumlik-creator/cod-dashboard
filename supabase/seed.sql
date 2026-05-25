-- ============================================================
-- DONNÉES DE TEST (optionnel)
-- À exécuter après schema.sql
-- Crée d'abord les comptes via Supabase Auth, puis:
-- ============================================================

-- Exemple produits
INSERT INTO public.products (name, selling_price, product_cost, packaging_cost, is_active) VALUES
  ('Montre Sport Premium', 299.00, 45.00, 8.00, true),
  ('Ceinture Minceur', 199.00, 25.00, 5.00, true),
  ('Lampe LED Solaire', 149.00, 30.00, 6.00, true),
  ('Aspirateur Robot Mini', 399.00, 95.00, 12.00, true),
  ('Chargeur Sans Fil 3-en-1', 249.00, 55.00, 8.00, true)
ON CONFLICT DO NOTHING;

-- Note: Pour créer un admin, signupez via Supabase Auth puis:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@votreBusiness.com';
