import { relations } from 'drizzle-orm';
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  phone: text('phone').default(''),
  role: text('role').notNull().default('customer'), // 'customer' | 'admin'
  passwordHash: text('password_hash'),
  emailVerified: boolean('email_verified').notNull().default(false),
  otpCodeHash: text('otp_code_hash'),
  otpPurpose: text('otp_purpose'), // 'verify_email' | 'reset_password'
  otpExpiresAt: timestamp('otp_expires_at'),
  otpLastSentAt: timestamp('otp_last_sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const addresses = pgTable('addresses', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  label: text('label').notNull().default('Home'),
  recipientName: text('recipient_name').notNull(),
  phone: text('phone').notNull(),
  region: text('region').notNull(),
  city: text('city').notNull(),
  streetAddress: text('street_address').notNull(),
  digitalAddress: text('digital_address').default(''),
  isDefault: boolean('is_default').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  parentGroup: text('parent_group').notNull(), // 'iphones' | 'android' | 'laptops' | 'accessories'
  description: text('description').default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  categoryGroup: text('category_group').notNull(), // 'iphones' | 'android' | 'laptops' | 'accessories'
  isPopular: boolean('is_popular').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  categoryGroup: text('category_group').notNull(), // 'iphones' | 'android' | 'laptops' | 'accessories'
  subcategory: text('subcategory').notNull(), // e.g., 'iPhone 16 Series', 'Chargers', 'Samsung'
  brandSlug: text('brand_slug').notNull(),
  brandName: text('brand_name').notNull(),
  priceGhs: integer('price_ghs').notNull(),
  compareAtGhs: integer('compare_at_ghs'),
  stockQty: integer('stock_qty').notNull().default(10),
  condition: text('condition').notNull().default('Brand New Sealed'),
  warranty: text('warranty').notNull().default('12 Months GoldCoast Warranty'),
  storageOrVariant: text('storage_or_variant').default(''),
  specsJson: text('specs_json').notNull().default('{}'),
  description: text('description').notNull(),
  imageUrl: text('image_url').notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  isBestSeller: boolean('is_best_seller').notNull().default(false),
  isNewArrival: boolean('is_new_arrival').notNull().default(false),
  isSpecialOffer: boolean('is_special_offer').notNull().default(false),
  ratingAvg: text('rating_avg').notNull().default('4.9'),
  reviewCount: integer('review_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cartItems = pgTable('cart_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  quantity: integer('quantity').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const wishlistItems = pgTable('wishlist_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  customerName: text('customer_name').notNull(),
  customerEmail: text('customer_email').notNull(),
  customerPhone: text('customer_phone').notNull(),
  shippingRegion: text('shipping_region').notNull(),
  shippingCity: text('shipping_city').notNull(),
  shippingStreet: text('shipping_street').notNull(),
  digitalAddress: text('digital_address').default(''),
  deliveryMethod: text('delivery_method').notNull(),
  paymentMethod: text('payment_method').notNull(), // 'paystack' | 'cod'
  paymentStatus: text('payment_status').notNull().default('pending'), // 'pending' | 'paid' | 'failed' | 'cod_pending'
  paystackReference: text('paystack_reference').default(''),
  orderStatus: text('order_status').notNull().default('pending'), // 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  trackingNote: text('tracking_note').default('Order received and queued for verification in Accra.'),
  subtotalGhs: integer('subtotal_ghs').notNull(),
  deliveryFeeGhs: integer('delivery_fee_ghs').notNull(),
  totalGhs: integer('total_ghs').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .references(() => orders.id, { onDelete: 'cascade' })
    .notNull(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'set null' }),
  productName: text('product_name').notNull(),
  productSku: text('product_sku').notNull(),
  productImage: text('product_image').notNull(),
  unitPriceGhs: integer('unit_price_ghs').notNull(),
  quantity: integer('quantity').notNull(),
});

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .references(() => products.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  reviewerName: text('reviewer_name').notNull(),
  reviewerCity: text('reviewer_city').notNull().default('Accra'),
  rating: integer('rating').notNull(),
  title: text('title').notNull(),
  comment: text('comment').notNull(),
  verifiedPurchase: boolean('verified_purchase').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const backups = pgTable('backups', {
  id: serial('id').primaryKey(),
  backupCode: text('backup_code').notNull().unique(),
  triggerType: text('trigger_type').notNull().default('auto'), // 'auto' | 'manual' | 'pre_restore'
  createdByEmail: text('created_by_email').notNull().default('system-scheduler'),
  summaryJson: text('summary_json').notNull().default('{}'),
  snapshotJson: text('snapshot_json').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const backupSettings = pgTable('backup_settings', {
  id: serial('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique().default('auto_backup'),
  enabled: boolean('enabled').notNull().default(true),
  intervalHours: integer('interval_hours').notNull().default(24),
  retentionCount: integer('retention_count').notNull().default(14),
  lastRunAt: timestamp('last_run_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  addresses: many(addresses),
  orders: many(orders),
  cartItems: many(cartItems),
  wishlistItems: many(wishlistItems),
  reviews: many(reviews),
}));

export const addressesRelations = relations(addresses, ({ one }) => ({
  user: one(users, {
    fields: [addresses.userId],
    references: [users.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  product: one(products, {
    fields: [reviews.productId],
    references: [products.id],
  }),
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
}));
