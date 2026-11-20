import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db/index';
import {
  addresses,
  backupSettings,
  backups,
  brands,
  categories,
  newsletterSubscribers,
  orderItems,
  orders,
  products,
  reviews,
  users,
} from '../db/schema';
import { getSupabaseServerClient, isSupabaseConfigured } from './supabase-server';

let backupInProgress = false;
let schedulerStarted = false;

export async function ensureBackupSettings() {
  const existing = await db
    .select()
    .from(backupSettings)
    .where(eq(backupSettings.settingKey, 'auto_backup'))
    .limit(1);

  if (existing.length) {
    return existing[0];
  }

  const [created] = await db
    .insert(backupSettings)
    .values({
      settingKey: 'auto_backup',
      enabled: true,
      intervalHours: 24,
      retentionCount: 14,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const fallback = await db
    .select()
    .from(backupSettings)
    .where(eq(backupSettings.settingKey, 'auto_backup'))
    .limit(1);
  return fallback[0];
}

export async function updateBackupSettings(input: {
  enabled?: boolean;
  intervalHours?: number;
  retentionCount?: number;
}) {
  const current = await ensureBackupSettings();
  const nextEnabled = input.enabled !== undefined ? Boolean(input.enabled) : current.enabled;
  const nextInterval = input.intervalHours
    ? Math.max(1, Math.min(720, Math.round(Number(input.intervalHours))))
    : current.intervalHours;
  const nextRetention = input.retentionCount
    ? Math.max(3, Math.min(90, Math.round(Number(input.retentionCount))))
    : current.retentionCount;

  const [updated] = await db
    .update(backupSettings)
    .set({
      enabled: nextEnabled,
      intervalHours: nextInterval,
      retentionCount: nextRetention,
      updatedAt: new Date(),
    })
    .where(eq(backupSettings.id, current.id))
    .returning();

  return updated;
}

export async function createDatabaseBackup(
  triggerType: 'auto' | 'manual' | 'pre_restore' = 'manual',
  createdByEmail = 'system-scheduler'
) {
  const settings = await ensureBackupSettings();

  const [
    allUsers,
    allAddresses,
    allCategories,
    allBrands,
    allProducts,
    allOrders,
    allOrderItems,
    allReviews,
    allSubscribers,
  ] = await Promise.all([
    db.select().from(users),
    db.select().from(addresses),
    db.select().from(categories),
    db.select().from(brands),
    db.select().from(products),
    db.select().from(orders),
    db.select().from(orderItems),
    db.select().from(reviews),
    db.select().from(newsletterSubscribers),
  ]);

  // Strip sensitive password/OTP hashes from portable snapshot
  const sanitizedUsers = allUsers.map((u) => ({
    id: u.id,
    uid: u.uid,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  }));

  const summary = {
    categories: allCategories.length,
    brands: allBrands.length,
    products: allProducts.length,
    orders: allOrders.length,
    reviews: allReviews.length,
    users: sanitizedUsers.length,
    newsletterSubscribers: allSubscribers.length,
  };

  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const randPart = crypto.randomBytes(2).toString('hex').toUpperCase();
  const backupCode = `MPH-BKP-${datePart}-${randPart}`;

  const snapshotPayload = {
    version: '1.0',
    store: 'MAGNOM PHONES HUB',
    backupCode,
    triggerType,
    createdByEmail,
    createdAt: now.toISOString(),
    summary,
    data: {
      categories: allCategories,
      brands: allBrands,
      products: allProducts,
      orders: allOrders,
      orderItems: allOrderItems,
      reviews: allReviews,
      addresses: allAddresses,
      users: sanitizedUsers,
      newsletterSubscribers: allSubscribers,
    },
  };

  const snapshotJson = JSON.stringify(snapshotPayload);
  const sizeBytes = Buffer.byteLength(snapshotJson, 'utf8');

  const [inserted] = await db
    .insert(backups)
    .values({
      backupCode,
      triggerType,
      createdByEmail,
      summaryJson: JSON.stringify(summary),
      snapshotJson,
      sizeBytes,
    })
    .returning();

  await db
    .update(backupSettings)
    .set({ lastRunAt: now, updatedAt: now })
    .where(eq(backupSettings.id, settings.id));

  // Prune older auto backups beyond retentionCount
  if (triggerType === 'auto') {
    const autoBackups = await db
      .select({ id: backups.id })
      .from(backups)
      .where(eq(backups.triggerType, 'auto'))
      .orderBy(desc(backups.createdAt));

    if (autoBackups.length > settings.retentionCount) {
      const toDeleteIds = autoBackups.slice(settings.retentionCount).map((b) => b.id);
      if (toDeleteIds.length > 0) {
        await db.delete(backups).where(inArray(backups.id, toDeleteIds));
      }
    }
  }

  // Write local rolling backup snapshot when filesystem is writable
  if (!process.env.VERCEL) {
    try {
      const backupDir = path.resolve(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      fs.writeFileSync(path.join(backupDir, 'latest-backup.json'), snapshotJson, 'utf8');
    } catch {
      // Non-fatal if filesystem is read-only
    }
  }

  // Non-blocking mirror to Supabase if configured
  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseServerClient();
      await supabase.from('backups').insert({
        backup_code: backupCode,
        trigger_type: triggerType,
        created_by_email: createdByEmail,
        summary_json: JSON.stringify(summary),
        snapshot_json: snapshotJson,
        size_bytes: sizeBytes,
      });
    } catch {
      // Non-blocking mirror
    }
  }

  return {
    id: inserted.id,
    backupCode: inserted.backupCode,
    triggerType: inserted.triggerType,
    createdByEmail: inserted.createdByEmail,
    summary,
    sizeBytes: inserted.sizeBytes,
    createdAt: inserted.createdAt,
  };
}

export async function restoreDatabaseBackup(backupId: number, actorEmail: string) {
  const found = await db.select().from(backups).where(eq(backups.id, backupId)).limit(1);
  if (!found.length) {
    throw new Error('Backup snapshot not found.');
  }

  const parsed = JSON.parse(found[0].snapshotJson) as {
    data?: {
      categories?: Array<any>;
      brands?: Array<any>;
      products?: Array<any>;
      newsletterSubscribers?: Array<any>;
    };
  };

  if (!parsed?.data) {
    throw new Error('Invalid backup snapshot format.');
  }

  // Safety backup before restoring
  await createDatabaseBackup('pre_restore', actorEmail);

  const snapCategories = parsed.data.categories || [];
  const snapBrands = parsed.data.brands || [];
  const snapProducts = parsed.data.products || [];
  const snapSubscribers = parsed.data.newsletterSubscribers || [];

  await db.transaction(async (tx) => {
    for (const c of snapCategories) {
      await tx
        .insert(categories)
        .values({
          name: c.name,
          slug: c.slug,
          parentGroup: c.parentGroup,
          description: c.description || '',
          sortOrder: Number(c.sortOrder ?? 0),
        })
        .onConflictDoUpdate({
          target: categories.slug,
          set: {
            name: c.name,
            parentGroup: c.parentGroup,
            description: c.description || '',
            sortOrder: Number(c.sortOrder ?? 0),
          },
        });
    }

    for (const b of snapBrands) {
      await tx
        .insert(brands)
        .values({
          name: b.name,
          slug: b.slug,
          categoryGroup: b.categoryGroup,
          isPopular: Boolean(b.isPopular),
        })
        .onConflictDoUpdate({
          target: brands.slug,
          set: {
            name: b.name,
            categoryGroup: b.categoryGroup,
            isPopular: Boolean(b.isPopular),
          },
        });
    }

    for (const p of snapProducts) {
      await tx
        .insert(products)
        .values({
          sku: p.sku,
          name: p.name,
          slug: p.slug,
          categoryGroup: p.categoryGroup,
          subcategory: p.subcategory,
          brandSlug: p.brandSlug,
          brandName: p.brandName,
          priceGhs: Number(p.priceGhs),
          compareAtGhs: p.compareAtGhs ? Number(p.compareAtGhs) : null,
          stockQty: Number(p.stockQty ?? 0),
          condition: p.condition || 'Brand New Sealed',
          warranty: p.warranty || '12 Months MAGNOM PHONES HUB Warranty',
          storageOrVariant: p.storageOrVariant || '',
          specsJson: p.specsJson || '{}',
          description: p.description || '',
          imageUrl: p.imageUrl,
          isFeatured: Boolean(p.isFeatured),
          isBestSeller: Boolean(p.isBestSeller),
          isNewArrival: Boolean(p.isNewArrival),
          isSpecialOffer: Boolean(p.isSpecialOffer),
          ratingAvg: String(p.ratingAvg || '4.9'),
          reviewCount: Number(p.reviewCount ?? 0),
        })
        .onConflictDoUpdate({
          target: products.slug,
          set: {
            name: p.name,
            categoryGroup: p.categoryGroup,
            subcategory: p.subcategory,
            brandSlug: p.brandSlug,
            brandName: p.brandName,
            priceGhs: Number(p.priceGhs),
            compareAtGhs: p.compareAtGhs ? Number(p.compareAtGhs) : null,
            stockQty: Number(p.stockQty ?? 0),
            condition: p.condition || 'Brand New Sealed',
            warranty: p.warranty || '12 Months MAGNOM PHONES HUB Warranty',
            storageOrVariant: p.storageOrVariant || '',
            specsJson: p.specsJson || '{}',
            description: p.description || '',
            isFeatured: Boolean(p.isFeatured),
            isBestSeller: Boolean(p.isBestSeller),
            isNewArrival: Boolean(p.isNewArrival),
            isSpecialOffer: Boolean(p.isSpecialOffer),
          },
        });
    }

    for (const s of snapSubscribers) {
      if (s.email) {
        await tx
          .insert(newsletterSubscribers)
          .values({ email: String(s.email).toLowerCase().trim() })
          .onConflictDoNothing();
      }
    }
  });

  return {
    restoredFrom: found[0].backupCode,
    counts: {
      categories: snapCategories.length,
      brands: snapBrands.length,
      products: snapProducts.length,
      newsletterSubscribers: snapSubscribers.length,
    },
  };
}

export async function runAutoBackupIfDue(force = false) {
  if (backupInProgress) {
    return { ran: false, reason: 'already_running' };
  }
  backupInProgress = true;
  try {
    const settings = await ensureBackupSettings();
    if (!force && !settings.enabled) {
      return { ran: false, reason: 'disabled' };
    }

    const intervalMs = Math.max(1, settings.intervalHours) * 60 * 60 * 1000;
    const lastMs = settings.lastRunAt ? new Date(settings.lastRunAt).getTime() : 0;
    const isDue = force || !lastMs || Date.now() - lastMs >= intervalMs;

    if (!isDue) {
      return { ran: false, reason: 'not_due', nextRunAt: new Date(lastMs + intervalMs).toISOString() };
    }

    const backup = await createDatabaseBackup('auto', 'system-scheduler');
    return { ran: true, backup };
  } finally {
    backupInProgress = false;
  }
}

export function startBackupScheduler() {
  if (schedulerStarted || process.env.VERCEL) return;
  schedulerStarted = true;

  // Run initial check 15s after server boot, then poll every 15 minutes
  const initialTimer = setTimeout(() => {
    runAutoBackupIfDue().catch((err) => {
      console.error('Auto-backup initial check error:', err);
    });
  }, 15_000);
  if (typeof initialTimer.unref === 'function') initialTimer.unref();

  const intervalTimer = setInterval(() => {
    runAutoBackupIfDue().catch((err) => {
      console.error('Auto-backup scheduled check error:', err);
    });
  }, 15 * 60 * 1000);
  if (typeof intervalTimer.unref === 'function') intervalTimer.unref();
}
