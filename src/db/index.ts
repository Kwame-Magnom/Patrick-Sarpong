import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import * as schema from './schema';

declare global {
  var _postgresPool: Pool | undefined;
  var _pgliteInstance: PGlite | undefined;
  var _dbInstance: any;
  var _schemaInitialized: boolean | undefined;
}

export function hasPostgresConfig(): boolean {
  return true;
}

export const DDL_STATEMENTS = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'customer',
  password_hash TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  otp_code_hash TEXT,
  otp_purpose TEXT,
  otp_expires_at TIMESTAMP,
  otp_last_sent_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Home',
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT NOT NULL,
  city TEXT NOT NULL,
  street_address TEXT NOT NULL,
  digital_address TEXT DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  parent_group TEXT NOT NULL,
  description TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_group TEXT NOT NULL,
  is_popular BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_group TEXT NOT NULL,
  subcategory TEXT NOT NULL,
  brand_slug TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  price_ghs INTEGER NOT NULL,
  compare_at_ghs INTEGER,
  stock_qty INTEGER NOT NULL DEFAULT 10,
  condition TEXT NOT NULL DEFAULT 'Brand New Sealed',
  warranty TEXT NOT NULL DEFAULT '12 Months GoldCoast Warranty',
  storage_or_variant TEXT DEFAULT '',
  specs_json TEXT NOT NULL DEFAULT '{}',
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_best_seller BOOLEAN NOT NULL DEFAULT FALSE,
  is_new_arrival BOOLEAN NOT NULL DEFAULT FALSE,
  is_special_offer BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg TEXT NOT NULL DEFAULT '4.9',
  review_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  shipping_region TEXT NOT NULL,
  shipping_city TEXT NOT NULL,
  shipping_street TEXT NOT NULL,
  digital_address TEXT DEFAULT '',
  delivery_method TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  paystack_reference TEXT DEFAULT '',
  order_status TEXT NOT NULL DEFAULT 'pending',
  tracking_note TEXT DEFAULT 'Order received and queued for verification in Accra.',
  subtotal_ghs INTEGER NOT NULL,
  delivery_fee_ghs INTEGER NOT NULL,
  total_ghs INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  product_image TEXT NOT NULL,
  unit_price_ghs INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewer_name TEXT NOT NULL,
  reviewer_city TEXT NOT NULL DEFAULT 'Accra',
  rating INTEGER NOT NULL,
  title TEXT NOT NULL,
  comment TEXT NOT NULL,
  verified_purchase BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backups (
  id SERIAL PRIMARY KEY,
  backup_code TEXT NOT NULL UNIQUE,
  trigger_type TEXT NOT NULL DEFAULT 'auto',
  created_by_email TEXT NOT NULL DEFAULT 'system-scheduler',
  summary_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE DEFAULT 'auto_backup',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  interval_hours INTEGER NOT NULL DEFAULT 24,
  retention_count INTEGER NOT NULL DEFAULT 14,
  last_run_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

export async function ensureDatabaseSchema(): Promise<void> {
  if (global._schemaInitialized) return;
  try {
    if (global._postgresPool) {
      await global._postgresPool.query(DDL_STATEMENTS);
    } else if (global._pgliteInstance) {
      await global._pgliteInstance.exec(DDL_STATEMENTS);
    }
    global._schemaInitialized = true;
  } catch (err) {
    console.warn('[DB] Schema init warning:', err);
  }
}

export const createPool = (): Pool | null => {
  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!connectionString && !process.env.SQL_HOST) {
    return null;
  }
  if (!global._postgresPool) {
    const timeoutMs = process.env.VERCEL ? 4500 : 10000;
    if (connectionString) {
      global._postgresPool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
          ? undefined
          : { rejectUnauthorized: false },
        max: 10,
        connectionTimeoutMillis: timeoutMs,
      });
    } else {
      global._postgresPool = new Pool({
        host: process.env.SQL_HOST,
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: timeoutMs,
      });
    }

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

function getOrCreatePglite(): PGlite {
  if (!global._pgliteInstance) {
    const dataDir = path.resolve(process.cwd(), '.data', 'pglite');
    try {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      global._pgliteInstance = new PGlite(dataDir);
    } catch {
      global._pgliteInstance = new PGlite();
    }
  }
  return global._pgliteInstance;
}

function initDb() {
  const pool = createPool();
  if (pool) {
    return drizzlePg(pool, { schema }) as any;
  }
  const pglite = getOrCreatePglite();
  return drizzlePglite(pglite, { schema }) as any;
}

if (!global._dbInstance) {
  global._dbInstance = initDb();
}

export const db: ReturnType<typeof drizzlePg<typeof schema>> = global._dbInstance;

