-- ============================================================================
-- MAGNOM PHONES HUB - Complete Supabase PostgreSQL Schema, Indexes, RLS & Seed
-- Compatible with Supabase SQL Editor and Drizzle ORM (src/db/schema.ts)
-- ============================================================================

-- 1. USERS & AUTHENTICATION
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'admin')),
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  otp_code_hash TEXT,
  otp_purpose TEXT CHECK (otp_purpose IS NULL OR otp_purpose IN ('verify_email', 'reset_password')),
  otp_expires_at TIMESTAMPTZ,
  otp_last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CUSTOMER DELIVERY ADDRESSES (GHANA)
CREATE TABLE IF NOT EXISTS public.addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT NOT NULL,
  city TEXT NOT NULL,
  street_address TEXT NOT NULL,
  digital_address TEXT DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_group TEXT NOT NULL CHECK (parent_group IN ('iphones', 'android', 'laptops', 'accessories')),
  description TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. BRANDS
CREATE TABLE IF NOT EXISTS public.brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_group TEXT NOT NULL CHECK (category_group IN ('iphones', 'android', 'laptops', 'accessories')),
  is_popular BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. PRODUCTS (PRICED IN GHANA CEDIS - GHS)
CREATE TABLE IF NOT EXISTS public.products (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_group TEXT NOT NULL CHECK (category_group IN ('iphones', 'android', 'laptops', 'accessories')),
  subcategory TEXT NOT NULL,
  brand_slug TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  price_ghs INTEGER NOT NULL CHECK (price_ghs >= 0),
  compare_at_ghs INTEGER CHECK (compare_at_ghs IS NULL OR compare_at_ghs >= 0),
  stock_qty INTEGER NOT NULL DEFAULT 10 CHECK (stock_qty >= 0),
  condition TEXT NOT NULL DEFAULT 'Brand New Sealed',
  warranty TEXT NOT NULL DEFAULT '12 Months MAGNOM PHONES HUB Warranty',
  storage_or_variant TEXT DEFAULT '',
  specs_json TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_best_seller BOOLEAN NOT NULL DEFAULT FALSE,
  is_new_arrival BOOLEAN NOT NULL DEFAULT FALSE,
  is_special_offer BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg TEXT NOT NULL DEFAULT '4.9',
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. SHOPPING CART ITEMS
CREATE TABLE IF NOT EXISTS public.cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- 7. WISHLIST ITEMS
CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

-- 8. ORDERS (PAYSTACK & CASH ON DELIVERY)
CREATE TABLE IF NOT EXISTS public.orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  shipping_region TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_street TEXT NOT NULL,
  digital_address TEXT DEFAULT '',
  delivery_method TEXT NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('paystack', 'cod')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'cod_pending')),
  paystack_reference TEXT DEFAULT '',
  order_status TEXT NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  tracking_note TEXT DEFAULT 'Order received and queued for verification in Accra.',
  subtotal_ghs INTEGER NOT NULL CHECK (subtotal_ghs >= 0),
  delivery_fee_ghs INTEGER NOT NULL CHECK (delivery_fee_ghs >= 0),
  total_ghs INTEGER NOT NULL CHECK (total_ghs >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. ORDER LINE ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  product_image TEXT NOT NULL,
  unit_price_ghs INTEGER NOT NULL CHECK (unit_price_ghs >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

-- 10. PRODUCT REVIEWS
CREATE TABLE IF NOT EXISTS public.reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_city TEXT NOT NULL DEFAULT 'Accra',
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT NOT NULL,
  comment TEXT NOT NULL,
  verified_purchase BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. NEWSLETTER SUBSCRIBERS
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. DATABASE BACKUPS
CREATE TABLE IF NOT EXISTS public.backups (
  id SERIAL PRIMARY KEY,
  backup_code TEXT NOT NULL UNIQUE,
  trigger_type TEXT NOT NULL DEFAULT 'auto' CHECK (trigger_type IN ('auto', 'manual', 'pre_restore')),
  created_by_email TEXT NOT NULL DEFAULT 'system-scheduler',
  summary_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. BACKUP SETTINGS
CREATE TABLE IF NOT EXISTS public.backup_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE DEFAULT 'auto_backup',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  interval_hours INTEGER NOT NULL DEFAULT 24 CHECK (interval_hours > 0),
  retention_count INTEGER NOT NULL DEFAULT 14 CHECK (retention_count > 0),
  last_run_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_group ON public.categories(parent_group, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_category_group ON public.products(category_group);
CREATE INDEX IF NOT EXISTS idx_products_subcategory ON public.products(subcategory);
CREATE INDEX IF NOT EXISTS idx_products_brand_slug ON public.products(brand_slug);
CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON public.cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON public.wishlist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_paystack_ref ON public.orders(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON public.reviews(product_id);

-- ============================================================================
-- AUTO-UPDATE TIMESTAMP TRIGGER FOR ORDERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- SUPABASE ROLE GRANTS & ROW LEVEL SECURITY (RLS)
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT ON public.categories, public.brands, public.products, public.reviews TO anon, authenticated;
GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.newsletter_subscribers_id_seq TO anon, authenticated;

GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses, public.cart_items, public.wishlist_items TO authenticated;
GRANT SELECT, INSERT ON public.orders, public.order_items, public.reviews TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_settings ENABLE ROW LEVEL SECURITY;

-- Public storefront read access
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
CREATE POLICY "Public read categories" ON public.categories FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read products" ON public.products;
CREATE POLICY "Public read products" ON public.products FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read reviews" ON public.reviews;
CREATE POLICY "Public read reviews" ON public.reviews FOR SELECT USING (TRUE);

-- Public newsletter signup
DROP POLICY IF EXISTS "Public insert newsletter" ON public.newsletter_subscribers;
CREATE POLICY "Public insert newsletter" ON public.newsletter_subscribers FOR INSERT WITH CHECK (TRUE);

-- Authenticated user policies (mapped via users.uid = auth.uid()::text)
DROP POLICY IF EXISTS "Users view own profile" ON public.users;
CREATE POLICY "Users view own profile" ON public.users
  FOR SELECT USING ((SELECT auth.uid())::text = uid);

DROP POLICY IF EXISTS "Users update own profile" ON public.users;
CREATE POLICY "Users update own profile" ON public.users
  FOR UPDATE USING ((SELECT auth.uid())::text = uid);

DROP POLICY IF EXISTS "Users manage own addresses" ON public.addresses;
CREATE POLICY "Users manage own addresses" ON public.addresses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = addresses.user_id AND u.uid = (SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS "Users manage own cart" ON public.cart_items;
CREATE POLICY "Users manage own cart" ON public.cart_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = cart_items.user_id AND u.uid = (SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS "Users manage own wishlist" ON public.wishlist_items;
CREATE POLICY "Users manage own wishlist" ON public.wishlist_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = wishlist_items.user_id AND u.uid = (SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS "Users view own orders" ON public.orders;
CREATE POLICY "Users view own orders" ON public.orders
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = orders.user_id AND u.uid = (SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
CREATE POLICY "Users view own order items" ON public.order_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.users u ON u.id = o.user_id
      WHERE o.id = order_items.order_id AND u.uid = (SELECT auth.uid())::text
    )
  );

-- ============================================================================
-- SEED DATA: CATEGORIES
-- ============================================================================
INSERT INTO public.categories (name, slug, parent_group, description, sort_order) VALUES
  -- iPhones
  ('iPhone 17 Series', 'iphone-17-series', 'iphones', 'Latest Apple iPhone 17 lineup', 1),
  ('iPhone 16 Series', 'iphone-16-series', 'iphones', 'Apple iPhone 16 & 16 Pro models', 2),
  ('iPhone 15 Series', 'iphone-15-series', 'iphones', 'Titanium iPhone 15 & USB-C models', 3),
  ('iPhone 14 Series', 'iphone-14-series', 'iphones', 'Apple iPhone 14 & Pro series', 4),
  ('iPhone 13 Series', 'iphone-13-series', 'iphones', 'Apple iPhone 13 series', 5),
  ('iPhone 12 Series', 'iphone-12-series', 'iphones', 'Apple iPhone 12 5G series', 6),
  ('iPhone 11 Series', 'iphone-11-series', 'iphones', 'Apple iPhone 11 lineup', 7),
  ('Other iPhone Models', 'other-iphone-models', 'iphones', 'iPhone SE and special editions', 8),
  -- Android
  ('Samsung', 'samsung-phones', 'android', 'Samsung Galaxy S, Z & A series', 10),
  ('Tecno', 'tecno-phones', 'android', 'Tecno Camon, Phantom & Spark series', 11),
  ('Infinix', 'infinix-phones', 'android', 'Infinix Note, Zero & Hot series', 12),
  ('itel', 'itel-phones', 'android', 'Reliable budget itel smartphones', 13),
  ('Google Pixel', 'google-pixel', 'android', 'Google Pixel flagship AI smartphones', 14),
  ('Xiaomi', 'xiaomi-phones', 'android', 'Xiaomi flagship & Leica camera phones', 15),
  ('Redmi', 'redmi-phones', 'android', 'Redmi Note value series', 16),
  ('Oppo', 'oppo-phones', 'android', 'Oppo Reno & Find series', 17),
  ('Vivo', 'vivo-phones', 'android', 'Vivo V & X series', 18),
  ('Other Android Brands', 'other-android-brands', 'android', 'OnePlus, Nokia, Motorola & more', 19),
  -- Laptops
  ('Apple MacBook', 'apple-macbook', 'laptops', 'MacBook Air & MacBook Pro M-series', 20),
  ('HP', 'hp-laptops', 'laptops', 'HP Spectre, Envy, Pavilion & EliteBook', 21),
  ('Dell', 'dell-laptops', 'laptops', 'Dell XPS, Latitude & Inspiron', 22),
  ('Lenovo', 'lenovo-laptops', 'laptops', 'Lenovo ThinkPad, Yoga & IdeaPad', 23),
  ('Asus', 'asus-laptops', 'laptops', 'Asus ZenBook, Vivobook & ROG', 24),
  ('Acer', 'acer-laptops', 'laptops', 'Acer Swift, Aspire & Predator', 25),
  ('Microsoft Surface', 'microsoft-surface', 'laptops', 'Surface Laptop & Surface Pro', 26),
  ('Other Laptop Brands', 'other-laptop-brands', 'laptops', 'MSI, Razer & workstation laptops', 27),
  -- Accessories
  ('Chargers', 'chargers', 'accessories', 'GaN fast wall adapters & MagSafe chargers', 30),
  ('Earphones', 'earphones', 'accessories', 'True wireless earbuds & wired earphones', 31),
  ('Headphones', 'headphones', 'accessories', 'Active noise-cancelling over-ear headphones', 32),
  ('Bluetooth Speakers', 'bluetooth-speakers', 'accessories', 'Portable waterproof Bluetooth speakers', 33),
  ('Smartwatches', 'smartwatches', 'accessories', 'Apple Watch, Galaxy Watch & fitness bands', 34),
  ('Power Banks', 'power-banks', 'accessories', 'High-capacity fast charging power banks', 35),
  ('Phone Cases', 'phone-cases', 'accessories', 'MagSafe & shockproof protective cases', 36),
  ('Screen Protectors', 'screen-protectors', 'accessories', 'Tempered glass & privacy screen guards', 37),
  ('USB Cables', 'usb-cables', 'accessories', 'Braided USB-C to USB-C & Lightning cables', 38),
  ('Keyboards', 'keyboards', 'accessories', 'Mechanical & wireless productivity keyboards', 39),
  ('Computer Mice', 'computer-mice', 'accessories', 'Ergonomic & gaming wireless mice', 40),
  ('Laptop Bags', 'laptop-bags', 'accessories', 'Water-resistant sleeves & backpacks', 41),
  ('Laptop Chargers', 'laptop-chargers', 'accessories', 'USB-C PD & OEM laptop power adapters', 42),
  ('Other Electronic Accessories', 'other-accessories', 'accessories', 'Hubs, adapters, SSDs & stands', 43)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: BRANDS
-- ============================================================================
INSERT INTO public.brands (name, slug, category_group, is_popular) VALUES
  ('Apple', 'apple', 'iphones', TRUE),
  ('Samsung', 'samsung', 'android', TRUE),
  ('Tecno', 'tecno', 'android', TRUE),
  ('Infinix', 'infinix', 'android', TRUE),
  ('itel', 'itel', 'android', FALSE),
  ('Google Pixel', 'google-pixel', 'android', TRUE),
  ('Xiaomi', 'xiaomi', 'android', TRUE),
  ('Redmi', 'redmi', 'android', TRUE),
  ('Oppo', 'oppo', 'android', FALSE),
  ('Vivo', 'vivo', 'android', FALSE),
  ('HP', 'hp', 'laptops', TRUE),
  ('Dell', 'dell', 'laptops', TRUE),
  ('Lenovo', 'lenovo', 'laptops', TRUE),
  ('Asus', 'asus', 'laptops', TRUE),
  ('Acer', 'acer', 'laptops', FALSE),
  ('Microsoft', 'microsoft', 'laptops', FALSE),
  ('Anker', 'anker', 'accessories', TRUE),
  ('JBL', 'jbl', 'accessories', TRUE),
  ('Sony', 'sony', 'accessories', TRUE),
  ('Logitech', 'logitech', 'accessories', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: PRODUCTS (PRICES IN GHS)
-- ============================================================================
INSERT INTO public.products (
  sku, name, slug, category_group, subcategory, brand_slug, brand_name,
  price_ghs, compare_at_ghs, stock_qty, condition, warranty, storage_or_variant,
  specs_json, description, image_url, is_featured, is_best_seller, is_new_arrival,
  is_special_offer, rating_avg, review_count
) VALUES
  ('MPH-IP17PM-256', 'iPhone 17 Pro Max 256GB', 'iphone-17-pro-max-256gb', 'iphones', 'iPhone 17 Series', 'apple', 'Apple', 21800, 23200, 9, 'Brand New Factory Unlocked', '12 Months Apple + MAGNOM PHONES HUB Warranty', '256GB · Desert Titanium · Dual eSIM/Physical', '{"Display":"6.9\" Super Retina XDR 120Hz","Chip":"A19 Pro","Camera":"48MP Triple Fusion","Battery":"Up to 33 hrs video","Network":"5G + Wi-Fi 7"}', 'Factory unlocked iPhone 17 Pro Max ready for MTN, Telecel, and AT Ghana 4G/5G networks. Sealed in original box with official warranty.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', TRUE, FALSE, TRUE, FALSE, '5.0', 2),
  ('MPH-IP16P-256', 'iPhone 16 Pro 256GB', 'iphone-16-pro-256gb', 'iphones', 'iPhone 16 Series', 'apple', 'Apple', 16950, 18400, 14, 'Brand New Factory Unlocked', '12 Months Apple + MAGNOM PHONES HUB Warranty', '256GB · Natural Titanium', '{"Display":"6.3\" ProMotion OLED","Chip":"A18 Pro","Camera":"48MP 5x Telephoto","Port":"USB-C 10Gbps"}', 'Grade-5 titanium design with Camera Control, 4K 120fps Dolby Vision video, and A18 Pro efficiency.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', TRUE, TRUE, FALSE, TRUE, '4.9', 2),
  ('MPH-IP15-128', 'iPhone 15 128GB USB-C', 'iphone-15-128gb', 'iphones', 'iPhone 15 Series', 'apple', 'Apple', 10800, 11600, 18, 'Brand New Sealed', '12 Months MAGNOM PHONES HUB Warranty', '128GB · Midnight Black', '{"Display":"6.1\" Dynamic Island OLED","Chip":"A16 Bionic","Camera":"48MP Main","Port":"USB-C"}', 'Dynamic Island, 48MP main camera, and universal USB-C charging. Ideal everyday flagship across Ghana.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', FALSE, TRUE, FALSE, TRUE, '4.8', 1),
  ('MPH-IP14PM-256', 'iPhone 14 Pro Max 256GB', 'iphone-14-pro-max-256gb', 'iphones', 'iPhone 14 Series', 'apple', 'Apple', 10200, 11000, 7, 'UK Clean Verified', '6 Months MAGNOM PHONES HUB Warranty', '256GB · Deep Purple · 92%+ Battery', '{"Display":"6.7\" 120Hz Always-On","Chip":"A16 Bionic","Camera":"48MP ProRAW","SIM":"Physical + eSIM"}', 'Thoroughly 32-point inspected UK clean iPhone 14 Pro Max with verified battery health and Face ID.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', FALSE, FALSE, FALSE, FALSE, '4.8', 1),
  ('MPH-IP13-128', 'iPhone 13 128GB', 'iphone-13-128gb', 'iphones', 'iPhone 13 Series', 'apple', 'Apple', 7400, 7900, 15, 'Brand New Sealed', '12 Months MAGNOM PHONES HUB Warranty', '128GB · Starlight', '{"Display":"6.1\" Super Retina XDR","Chip":"A15 Bionic","Camera":"Dual 12MP Cinematic"}', 'Best-value iPhone in Accra with all-day battery life and Cinematic Mode photography.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', FALSE, TRUE, FALSE, FALSE, '4.9', 1),
  ('MPH-IP12-128', 'iPhone 12 128GB 5G', 'iphone-12-128gb', 'iphones', 'iPhone 12 Series', 'apple', 'Apple', 5400, NULL, 11, 'Clean Certified Pre-Owned', '6 Months MAGNOM PHONES HUB Warranty', '128GB · Pacific Blue', '{"Display":"6.1\" OLED Ceramic Shield","Chip":"A14 Bionic","MagSafe":"Supported"}', 'Crisp OLED display with MagSafe support and 5G readiness, inspected by our Osu lab technicians.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', FALSE, FALSE, FALSE, FALSE, '4.7', 1),
  ('MPH-IP11-128', 'iPhone 11 128GB', 'iphone-11-128gb', 'iphones', 'iPhone 11 Series', 'apple', 'Apple', 4100, 4500, 12, 'Clean Certified Pre-Owned', '6 Months MAGNOM PHONES HUB Warranty', '128GB · Black', '{"Display":"6.1\" Liquid Retina","Chip":"A13 Bionic","Camera":"Dual 12MP Ultra Wide"}', 'Reliable entry-level iPhone with Night Mode and 4K 60fps video, tested for full Face ID and True Tone.', '/src/assets/images/product_iphone_flagship_1795168475656.jpg', FALSE, FALSE, FALSE, TRUE, '4.7', 0),
  ('MPH-SAM-S25U', 'Samsung Galaxy S25 Ultra 512GB', 'samsung-galaxy-s25-ultra-512gb', 'android', 'Samsung', 'samsung', 'Samsung', 19400, 20900, 8, 'Brand New Global Version', '12 Months Samsung + MAGNOM PHONES HUB Warranty', '512GB / 12GB RAM · Titanium Navy', '{"Display":"6.9\" QHD+ Dynamic AMOLED 2X","Chip":"Snapdragon 8 Elite","Camera":"200MP Quad Telephoto","Stylus":"Integrated S Pen"}', 'Samsung flagship with Titanium frame, integrated S Pen, Galaxy AI productivity suite, and 200MP zoom optics.', '/src/assets/images/product_android_flagship_1795168475255.jpg', TRUE, TRUE, TRUE, FALSE, '5.0', 2),
  ('MPH-TEC-C30P', 'Tecno Camon 30 Premier 5G', 'tecno-camon-30-premier-5g', 'android', 'Tecno', 'tecno', 'Tecno', 6450, 6990, 22, 'Brand New Official Ghana Warranty', '12 Months Carlcare Official Warranty', '512GB / 12GB RAM · Alps Snowy Silver', '{"Display":"6.77\" 1.5K LTPO AMOLED 120Hz","Camera":"Triple 50MP Sony PolarAce","Charging":"70W Ultra Charge","Battery":"5000mAh"}', 'Official Tecno Ghana unit with Carlcare warranty, Sony imaging chip, and blazing 70W charger in the box.', '/src/assets/images/product_android_flagship_1795168475255.jpg', TRUE, TRUE, FALSE, TRUE, '4.8', 1),
  ('MPH-INF-N40P', 'Infinix Note 40 Pro+ 5G', 'infinix-note-40-pro-plus-5g', 'android', 'Infinix', 'infinix', 'Infinix', 4650, 4950, 25, 'Brand New Sealed', '12 Months Official Ghana Warranty', '256GB / 12GB RAM · Obsidian Black', '{"Display":"6.78\" Curved AMOLED 120Hz","Charging":"100W All-Round FastCharge + 20W MagCharge","Camera":"108MP OIS"}', 'Includes MagKit wireless charging pad in the box with 100W fast charging built for busy days in Accra.', '/src/assets/images/product_android_flagship_1795168475255.jpg', FALSE, FALSE, TRUE, FALSE, '4.8', 1),
  ('MPH-PIX-9P', 'Google Pixel 9 Pro 256GB', 'google-pixel-9-pro-256gb', 'android', 'Google Pixel', 'google-pixel', 'Google Pixel', 14200, NULL, 6, 'Brand New Factory Unlocked', '12 Months MAGNOM PHONES HUB Warranty', '256GB / 16GB RAM · Obsidian', '{"Display":"6.3\" Super Actua OLED","Chip":"Google Tensor G4","Camera":"50MP + 48MP 5x Telephoto","Updates":"7 Years OS Updates"}', 'Pure Android with unmatched computational photography and 7 years of software support.', '/src/assets/images/product_android_flagship_1795168475255.jpg', FALSE, FALSE, TRUE, FALSE, '4.9', 1),
  ('MPH-RED-N14P', 'Redmi Note 14 Pro 256GB', 'redmi-note-14-pro-256gb', 'android', 'Redmi', 'redmi', 'Redmi', 3850, 4200, 30, 'Brand New Global ROM', '12 Months MAGNOM PHONES HUB Warranty', '256GB / 8GB RAM · Midnight Black', '{"Display":"6.67\" 120Hz AMOLED","Camera":"200MP OIS","Battery":"5500mAh · 45W Turbo Charge"}', 'Best-selling mid-range powerhouse with 200MP OIS camera and Gorilla Glass Victus 2 protection.', '/src/assets/images/product_android_flagship_1795168475255.jpg', FALSE, TRUE, FALSE, TRUE, '4.8', 0),
  ('MPH-ITL-S24', 'itel S24 128GB', 'itel-s24-128gb', 'android', 'itel', 'itel', 'itel', 1650, 1850, 40, 'Brand New Official Ghana', '12 Months Carlcare Warranty', '128GB / 8GB RAM · Starry Black', '{"Display":"6.6\" 90Hz Punch-Hole","Camera":"108MP Ultra-Clear","Battery":"5000mAh Type-C"}', 'Affordable, dependable everyday smartphone with a 108MP camera and Type-C fast charging.', '/src/assets/images/product_android_flagship_1795168475255.jpg', FALSE, FALSE, FALSE, TRUE, '4.6', 0),
  ('MPH-MBP-M4-14', 'Apple MacBook Pro 14" M4 512GB', 'apple-macbook-pro-14-m4-512gb', 'laptops', 'Apple MacBook', 'apple', 'Apple', 24900, 26500, 5, 'Brand New Sealed US/UK Keyboard', '12 Months Apple + MAGNOM PHONES HUB Warranty', '16GB Unified RAM · 512GB SSD · Space Black', '{"Processor":"Apple M4 10-Core CPU","Display":"14.2\" Liquid Retina XDR","Battery":"Up to 24 Hours","Ports":"3x Thunderbolt 4, HDMI, SDXC"}', 'Built for Ghanaian software engineers, video editors, and creatives needing 24-hour battery performance.', '/src/assets/images/product_laptop_ultrabook_1795168475793.jpg', TRUE, TRUE, TRUE, FALSE, '5.0', 2),
  ('MPH-HP-EB840G10', 'HP EliteBook 840 G10 Core i7', 'hp-elitebook-840-g10-i7', 'laptops', 'HP', 'hp', 'HP', 12900, 14100, 12, 'Brand New Boxed', '12 Months HP + MAGNOM PHONES HUB Warranty', '16GB DDR5 · 512GB NVMe SSD · 14" FHD+', '{"Processor":"Intel Core i7-1355U","Display":"14\" WUXGA Anti-Glare","Security":"Fingerprint + IR Privacy Shutter","OS":"Windows 11 Pro"}', 'Enterprise-grade aluminum laptop trusted by Accra corporate professionals, banks, and university scholars.', '/src/assets/images/product_laptop_ultrabook_1795168475793.jpg', TRUE, TRUE, FALSE, TRUE, '4.9', 1),
  ('MPH-DEL-XPS13', 'Dell XPS 13 9340 Core Ultra 7', 'dell-xps-13-9340-ultra-7', 'laptops', 'Dell', 'dell', 'Dell', 18600, NULL, 6, 'Brand New Sealed', '12 Months MAGNOM PHONES HUB Warranty', '16GB LPDDR5x · 1TB SSD · Platinum Silver', '{"Processor":"Intel Core Ultra 7 155H","Display":"13.4\" InfinityEdge 120Hz","Weight":"1.19 kg"}', 'Ultra-thin CNC machined aluminum ultrabook with all-day battery and edge-to-edge InfinityEdge display.', '/src/assets/images/product_laptop_ultrabook_1795168475793.jpg', FALSE, FALSE, TRUE, FALSE, '4.9', 0),
  ('MPH-LEN-TPX1', 'Lenovo ThinkPad X1 Carbon Gen 12', 'lenovo-thinkpad-x1-carbon-gen12', 'laptops', 'Lenovo', 'lenovo', 'Lenovo', 19200, 20500, 7, 'Brand New Sealed', '12 Months MAGNOM PHONES HUB Warranty', '32GB RAM · 1TB SSD · Matte Black', '{"Processor":"Intel Core Ultra 7","Build":"Carbon Fiber MIL-STD-810H","Weight":"1.09 kg"}', 'Featherweight durability and legendary ThinkPad keyboard ergonomics for executives and developers.', '/src/assets/images/product_laptop_ultrabook_1795168475793.jpg', FALSE, FALSE, FALSE, FALSE, '4.9', 1),
  ('MPH-SNY-XM5', 'Sony WH-1000XM5 ANC Headphones', 'sony-wh-1000xm5-anc-headphones', 'accessories', 'Headphones', 'sony', 'Sony', 4950, 5400, 16, 'Brand New Sealed', '12 Months MAGNOM PHONES HUB Warranty', 'Midnight Blue / Black · 30-Hr Battery', '{"ANC":"8-Mic Dual Processor Noise Cancelling","Battery":"30 Hours + 3-min quick charge","Connectivity":"Bluetooth 5.2 Multipoint"}', 'Industry-leading noise cancellation for flights, campus study, and studio focus.', '/src/assets/images/product_audio_accessories_1795168475567.jpg', TRUE, TRUE, FALSE, TRUE, '5.0', 2),
  ('MPH-ANK-PB20K', 'Anker Prime 20,000mAh 200W Power Bank', 'anker-prime-20000mah-200w-power-bank', 'accessories', 'Power Banks', 'anker', 'Anker', 1850, 2100, 28, 'Brand New Official Anker', '18 Months Anker + MAGNOM PHONES HUB Warranty', '20,000mAh · 2x USB-C + 1x USB-A', '{"Output":"200W Total (100W Single Port Laptop Fast Charge)","Display":"Smart Digital Wattage Screen","Capacity":"20,000mAh Airline Safe"}', 'Charges a MacBook Pro and iPhone simultaneously at full speed — essential backup power anywhere in Ghana.', '/src/assets/images/product_audio_accessories_1795168475567.jpg', TRUE, TRUE, TRUE, FALSE, '4.9', 1),
  ('MPH-JBL-CH5', 'JBL Charge 5 Portable Bluetooth Speaker', 'jbl-charge-5-bluetooth-speaker', 'accessories', 'Bluetooth Speakers', 'jbl', 'JBL', 2250, 2500, 19, 'Brand New Original JBL', '12 Months MAGNOM PHONES HUB Warranty', 'Squad Navy · IP67 Waterproof', '{"Battery":"20 Hours Playtime","Protection":"IP67 Waterproof & Dustproof","Extra":"Built-in Powerbank USB-A Out"}', 'Bold JBL Original Pro Sound with 20 hours of playtime and built-in phone charging.', '/src/assets/images/product_audio_accessories_1795168475567.jpg', FALSE, TRUE, FALSE, TRUE, '4.9', 1),
  ('MPH-ANK-GAN65', 'Anker 67W 3-Port GaN Charger + USB-C Cable', 'anker-67w-gan-charger-usbc', 'accessories', 'Chargers', 'anker', 'Anker', 680, 790, 45, 'Brand New Sealed', '18 Months MAGNOM PHONES HUB Warranty', 'UK 3-Pin Ghana Plug · 67W PD', '{"Plug":"UK Type-G (Ghana Wall Ready)","Ports":"2x USB-C PD + 1x USB-A","Included":"1.8m Braided 100W USB-C Cable"}', 'Ghana wall-socket ready UK 3-pin GaN fast charger capable of powering laptops, tablets, and iPhones safely.', '/src/assets/images/product_audio_accessories_1795168475567.jpg', FALSE, TRUE, FALSE, FALSE, '4.9', 0)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED DATA: VERIFIED CUSTOMER REVIEWS
-- ============================================================================
INSERT INTO public.reviews (product_id, reviewer_name, reviewer_city, rating, title, comment, verified_purchase)
SELECT p.id, v.reviewer_name, v.reviewer_city, v.rating, v.title, v.comment, TRUE
FROM (
  VALUES
    ('iphone-16-pro-256gb', 'Kwame Boateng', 'East Legon, Accra', 5, 'Delivered in 3 hours, 100% factory sealed', 'Paid via MTN MoMo on Paystack and the dispatch rider arrived at my East Legon office the same afternoon. Checked the Apple serial on the spot.'),
    ('apple-macbook-pro-14-m4-512gb', 'Abena Mensah', 'Airport Residential, Accra', 5, 'Authentic M4 MacBook Pro for our design studio', 'Super smooth checkout and transparent GHS pricing without hidden dollar rate surprises. The 12-month warranty receipt came with the box.'),
    ('samsung-galaxy-s25-ultra-512gb', 'Kofi Owusu-Ansah', 'Adum, Kumasi', 5, 'Next-day Kumasi DHL delivery worked seamlessly', 'Ordered Tuesday morning from Kumasi and picked up Wednesday afternoon. Tracking updates were clear from Accra dispatch to arrival.'),
    ('sony-wh-1000xm5-anc-headphones', 'Efua Darko', 'Community 11, Tema', 5, 'Genuine Sony headphones, crisp ANC', 'Paired immediately with the Sony Sound Connect app. Packaging was completely sealed and price beat local mall shops.'),
    ('hp-elitebook-840-g10-i7', 'Yaw Adjei', 'Takoradi', 5, 'Rock-solid business laptop for engineering work', 'Clean invoice, fast delivery to Takoradi, and great customer service when confirming specs beforehand.'),
    ('anker-prime-20000mah-200w-power-bank', 'Nana Ama Serwaa', 'Osu, Accra', 5, 'Powers my MacBook Air and iPhone easily', 'No cheap knockoffs here. Genuine Anker wattage readout shows 65W+ straight into my laptop.')
) AS v(product_slug, reviewer_name, reviewer_city, rating, title, comment)
JOIN public.products p ON p.slug = v.product_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.reviews r
  WHERE r.product_id = p.id AND r.reviewer_name = v.reviewer_name
);
