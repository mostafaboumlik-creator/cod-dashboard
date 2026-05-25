-- ============================================================
-- COD Dashboard - Schéma Supabase
-- Exécuter dans l'ordre dans l'éditeur SQL de Supabase
-- ============================================================

-- =====================
-- 1. TABLE PROFILES
-- =====================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'media_buyer' CHECK (role IN ('admin', 'media_buyer')),
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- 2. TABLE PRODUCTS
-- =====================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  product_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  packaging_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================
-- 3. TABLE ORDERS
-- =====================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  media_buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'confirmed', 'delivered', 'returned', 'cancelled')),
  selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  product_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  packaging_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  delivery_cost NUMERIC(10,2) NOT NULL DEFAULT 20,
  call_center_cost NUMERIC(10,2) NOT NULL DEFAULT 5,
  ad_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  campaign_name TEXT,
  ad_platform TEXT CHECK (ad_platform IN ('facebook', 'tiktok', 'other')),
  customer_name TEXT,
  customer_phone TEXT,
  city TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS orders_media_buyer_idx ON public.orders(media_buyer_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_product_idx ON public.orders(product_id);

-- =====================
-- 4. AUTO-CREATE PROFILE ON SIGNUP
-- =====================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Utilisateur'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'media_buyer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================
-- 5. ROW LEVEL SECURITY
-- =====================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admin can read all profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Products policies
CREATE POLICY "Authenticated users can read products"
  ON public.products FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage products"
  ON public.products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Orders policies
CREATE POLICY "Media buyer sees own orders"
  ON public.orders FOR SELECT
  USING (
    media_buyer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can insert orders"
  ON public.orders FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can update orders"
  ON public.orders FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete orders"
  ON public.orders FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =====================
-- 6. VIEW: ORDER METRICS
-- =====================
CREATE OR REPLACE VIEW public.order_metrics AS
SELECT
  o.*,
  (o.selling_price - o.product_cost - o.packaging_cost - o.delivery_cost - o.call_center_cost - o.ad_spend) AS net_profit,
  (o.selling_price - o.product_cost - o.packaging_cost) AS gross_profit,
  (o.product_cost + o.packaging_cost + o.delivery_cost + o.call_center_cost + o.ad_spend) AS total_costs,
  ((o.selling_price - o.product_cost - o.packaging_cost - o.delivery_cost - o.call_center_cost - o.ad_spend)
   * (COALESCE(p.commission_rate, 10) / 100)) AS commission
FROM public.orders o
JOIN public.profiles p ON o.media_buyer_id = p.id;
