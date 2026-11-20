import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db, hasPostgresConfig } from './db/index';
import {
  addresses,
  backups,
  brands,
  cartItems,
  categories,
  newsletterSubscribers,
  orderItems,
  orders,
  products,
  reviews,
  users,
  wishlistItems,
} from './db/schema';
import { ensureSeeded } from './db/seed';
import {
  generateNumericOtp,
  hashOtp,
  hashPassword,
  isAdminEmail,
  isValidGhanaPhone,
  normalizeGhanaPhone,
  signSessionToken,
  verifyPassword,
} from './lib/auth-security';
import {
  AuthRequest,
  requireAdmin,
  requireAuth,
  requireStaffOrAdmin,
  requireVerifiedEmail,
} from './middleware/auth';
import { getSupabaseServerClient, isSupabaseConfigured } from './lib/supabase-server';
import {
  createDatabaseBackup,
  ensureBackupSettings,
  restoreDatabaseBackup,
  runAutoBackupIfDue,
  updateBackupSettings,
} from './lib/backup-service';
import { isMailerConfigured, sendOtpEmail } from './lib/mailer';
import { fetchCatalogFromSupabase } from './lib/supabase-catalog';
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(
  express.json({
    limit: '2mb',
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

function sanitizeUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    uid: u.uid,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone || '',
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'MAGNOM PHONES HUB API',
    supabaseConfigured: isSupabaseConfigured(),
    smtpConfigured: isMailerConfigured(),
  });
});

app.get('/api/supabase/status', async (_req, res) => {
  try {
    const supabase = getSupabaseServerClient();
    const { count, error } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true });

    if (error) {
      return res.json({
        connected: true,
        schemaReady: false,
        code: error.code || null,
        message: error.message,
      });
    }

    res.json({
      connected: true,
      schemaReady: true,
      productCount: count ?? 0,
    });
  } catch (error: any) {
    res.status(500).json({ connected: false, message: error?.message || 'Supabase check failed' });
  }
});

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, phone, password, confirmPassword } = req.body || {};
    if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter your full name.' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!phone || typeof phone !== 'string' || !isValidGhanaPhone(phone)) {
      return res.status(400).json({
        error: 'Please enter a valid Ghana phone number (e.g., 0241234567 or +233241234567).',
      });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const otp = generateNumericOtp();
    const otpHash = hashOtp(normalizedEmail, otp);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const role = isAdminEmail(normalizedEmail) ? 'admin' : 'customer';

    const [created] = await db
      .insert(users)
      .values({
        uid: `gct-${crypto.randomUUID()}`,
        fullName: fullName.trim(),
        email: normalizedEmail,
        phone: normalizeGhanaPhone(phone),
        role,
        passwordHash,
        emailVerified: false,
        otpCodeHash: otpHash,
        otpPurpose: 'verify_email',
        otpExpiresAt: expiresAt,
        otpLastSentAt: new Date(),
      })
      .returning();

    const mailRes = await sendOtpEmail({
      toEmail: created.email,
      fullName: created.fullName,
      otp,
      purpose: 'verify_email',
    });

    res.status(201).json({
      message: mailRes.sent
        ? 'Account created! A 6-digit verification code has been sent to your email.'
        : 'Account created, but email delivery failed. Please click Resend OTP.',
      requiresVerification: true,
      emailSent: mailRes.sent,
      email: created.email,
      ...(mailRes.sent || isMailerConfigured() ? {} : { previewOtp: otp }),
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and 6-digit OTP code are required.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    const user = found[0];
    if (
      !user.otpCodeHash ||
      !user.otpExpiresAt ||
      (user.otpPurpose !== 'verify_email' && user.otpPurpose !== 'login_otp')
    ) {
      return res.status(400).json({ error: 'No pending OTP verification code. Please request a new OTP.' });
    }
    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Verification code has expired. Please resend OTP.' });
    }

    const candidateHash = hashOtp(normalizedEmail, String(otp));
    if (candidateHash !== user.otpCodeHash) {
      return res.status(400).json({ error: 'Invalid 6-digit verification code.' });
    }

    const [updated] = await db
      .update(users)
      .set({
        emailVerified: true,
        otpCodeHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
      })
      .where(eq(users.id, user.id))
      .returning();

    const token = signSessionToken({
      userId: updated.id,
      uid: updated.uid,
      email: updated.email,
      role: updated.role,
    });

    res.json({
      message: 'Email verified successfully.',
      token,
      user: sanitizeUser(updated),
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'OTP verification failed.' });
  }
});

app.post('/api/auth/resend-otp', async (req, res) => {
  try {
    const { email, purpose = 'verify_email' } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'No account found with this email.' });
    }
    const user = found[0];
    if (user.otpLastSentAt && Date.now() - user.otpLastSentAt.getTime() < 25000) {
      return res.status(429).json({ error: 'Please wait 25 seconds before requesting another OTP.' });
    }

    const otp = generateNumericOtp();
    const otpHash = hashOtp(normalizedEmail, otp);
    const resolvedPurpose =
      purpose === 'reset_password'
        ? 'reset_password'
        : purpose === 'login_otp'
        ? 'login_otp'
        : 'verify_email';

    await db
      .update(users)
      .set({
        otpCodeHash: otpHash,
        otpPurpose: resolvedPurpose,
        otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        otpLastSentAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const mailRes = await sendOtpEmail({
      toEmail: user.email,
      fullName: user.fullName,
      otp,
      purpose: resolvedPurpose,
    });

    if (!mailRes.sent && isMailerConfigured()) {
      return res.status(502).json({ error: mailRes.error || 'Failed to send OTP email.' });
    }

    res.json({
      message: 'A new 6-digit OTP code has been sent to your email.',
      emailSent: mailRes.sent,
      ...(mailRes.sent || isMailerConfigured() ? {} : { previewOtp: otp }),
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ error: 'Failed to resend OTP.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    await ensureSeeded();
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    const user = found[0];
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const valid = await verifyPassword(String(password), user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const purpose = user.emailVerified ? 'login_otp' : 'verify_email';
    const otp = generateNumericOtp();
    const otpHash = hashOtp(normalizedEmail, otp);

    await db
      .update(users)
      .set({
        otpCodeHash: otpHash,
        otpPurpose: purpose,
        otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        otpLastSentAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const mailRes = await sendOtpEmail({
      toEmail: user.email,
      fullName: user.fullName,
      otp,
      purpose,
    });

    if (!mailRes.sent && isMailerConfigured()) {
      return res.status(502).json({
        error: mailRes.error || 'Could not send login OTP to your email. Please try again.',
      });
    }

    return res.json({
      requiresOtp: true,
      requiresVerification: !user.emailVerified,
      purpose,
      email: user.email,
      emailSent: mailRes.sent,
      message: 'A 6-digit verification code has been sent to your email.',
      ...(mailRes.sent || isMailerConfigured() ? {} : { previewOtp: otp }),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

app.post('/api/auth/firebase-sync', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.authUser });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Please enter your account email.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'No account registered with that email address.' });
    }

    const otp = generateNumericOtp();
    const otpHash = hashOtp(normalizedEmail, otp);
    await db
      .update(users)
      .set({
        otpCodeHash: otpHash,
        otpPurpose: 'reset_password',
        otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        otpLastSentAt: new Date(),
      })
      .where(eq(users.id, found[0].id));

    const mailRes = await sendOtpEmail({
      toEmail: found[0].email,
      fullName: found[0].fullName,
      otp,
      purpose: 'reset_password',
    });

    if (!mailRes.sent && isMailerConfigured()) {
      return res.status(502).json({ error: mailRes.error || 'Failed to send password reset OTP.' });
    }

    res.json({
      message: 'A 6-digit password reset OTP has been sent to your email.',
      emailSent: mailRes.sent,
      ...(mailRes.sent || isMailerConfigured() ? {} : { previewOtp: otp }),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Could not initiate password reset.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword, confirmPassword } = req.body || {};
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
    }
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }
    const normalizedEmail = String(email).toLowerCase().trim();
    const found = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    const user = found[0];
    if (!user.otpCodeHash || !user.otpExpiresAt || user.otpPurpose !== 'reset_password') {
      return res.status(400).json({ error: 'No active password reset OTP. Please request one first.' });
    }
    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset OTP has expired.' });
    }
    if (hashOtp(normalizedEmail, String(otp)) !== user.otpCodeHash) {
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    const passwordHash = await hashPassword(String(newPassword));
    await db
      .update(users)
      .set({
        passwordHash,
        emailVerified: true,
        otpCodeHash: null,
        otpPurpose: null,
        otpExpiresAt: null,
      })
      .where(eq(users.id, user.id));

    res.json({ message: 'Password has been reset successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  res.json({ user: req.authUser });
});

app.put('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { fullName, phone } = req.body || {};
    if (!fullName || String(fullName).trim().length < 2) {
      return res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    }
    if (phone && !isValidGhanaPhone(String(phone))) {
      return res.status(400).json({ error: 'Enter a valid Ghana phone number (e.g., 0241234567).' });
    }
    const [updated] = await db
      .update(users)
      .set({
        fullName: String(fullName).trim(),
        phone: phone ? normalizeGhanaPhone(String(phone)) : req.authUser!.phone || '',
      })
      .where(eq(users.id, req.authUser!.id))
      .returning();

    res.json({ user: sanitizeUser(updated) });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New passwords do not match.' });
    }
    const found = await db
      .select()
      .from(users)
      .where(eq(users.id, req.authUser!.id))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    const user = found[0];
    if (user.passwordHash) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Please enter your current password.' });
      }
      const valid = await verifyPassword(String(currentPassword), user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect.' });
      }
    }

    const passwordHash = await hashPassword(String(newPassword));
    await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
});

// ==================== CATALOG & REVIEWS ====================

app.get('/api/catalog', async (req, res) => {
  const { category, subcategory, brand, collection, q, sort } = req.query;

  if (hasPostgresConfig()) {
    try {
      await ensureSeeded();

      const conditions = [];
      if (category && category !== 'all') {
        conditions.push(eq(products.categoryGroup, String(category)));
      }
      if (subcategory && subcategory !== 'all') {
        conditions.push(eq(products.subcategory, String(subcategory)));
      }
      if (brand && brand !== 'all') {
        conditions.push(eq(products.brandSlug, String(brand)));
      }
      if (collection === 'featured') conditions.push(eq(products.isFeatured, true));
      if (collection === 'bestseller') conditions.push(eq(products.isBestSeller, true));
      if (collection === 'new') conditions.push(eq(products.isNewArrival, true));
      if (collection === 'offer') conditions.push(eq(products.isSpecialOffer, true));
      if (q && String(q).trim()) {
        const term = `%${String(q).trim()}%`;
        conditions.push(
          or(
            ilike(products.name, term),
            ilike(products.brandName, term),
            ilike(products.subcategory, term),
            ilike(products.description, term)
          )
        );
      }

      const [allCategories, allBrands, productRows, recentReviews] = await Promise.all([
        db.select().from(categories).orderBy(categories.sortOrder, categories.name),
        db.select().from(brands).orderBy(brands.name),
        conditions.length
          ? db.select().from(products).where(and(...conditions)).orderBy(desc(products.id))
          : db.select().from(products).orderBy(desc(products.id)),
        db.select().from(reviews).orderBy(desc(reviews.createdAt)).limit(8),
      ]);

      const sortedProducts = [...productRows];
      if (sort === 'price_asc') sortedProducts.sort((a, b) => a.priceGhs - b.priceGhs);
      else if (sort === 'price_desc') sortedProducts.sort((a, b) => b.priceGhs - a.priceGhs);

      return res.json({
        categories: allCategories,
        brands: allBrands,
        products: sortedProducts,
        recentReviews,
        paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY),
      });
    } catch (pgError) {
      console.error('Postgres catalog load failed, falling back to Supabase REST:', pgError);
    }
  }

  try {
    const supabaseCatalog = await fetchCatalogFromSupabase(getSupabaseServerClient(), {
      category: category ? String(category) : undefined,
      subcategory: subcategory ? String(subcategory) : undefined,
      brand: brand ? String(brand) : undefined,
      collection: collection ? String(collection) : undefined,
      q: q ? String(q) : undefined,
      sort: sort ? String(sort) : undefined,
    });
    return res.json({
      ...supabaseCatalog,
      paystackConfigured: Boolean(process.env.PAYSTACK_SECRET_KEY),
    });
  } catch (supaError: any) {
    console.error('Catalog load error:', supaError);
    const rawMsg = String(supaError?.message || '');
    const friendlyMsg = rawMsg.toLowerCase().includes('permission denied')
      ? 'Database not connected yet (Supabase permission denied). Run supabase/schema.sql in your Supabase SQL Editor or set DATABASE_URL / SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables.'
      : rawMsg || 'Unable to load store catalog. Verify DATABASE_URL or Supabase table permissions.';
    return res.status(500).json({ error: friendlyMsg });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    await ensureSeeded();
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId) || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product ID.' });
    }
    const found = await db.select().from(products).where(eq(products.id, productId)).limit(1);
    if (!found.length) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    const productReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));

    res.json({ product: found[0], reviews: productReviews });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).json({ error: 'Failed to load product details.' });
  }
});

app.post('/api/products/:id/reviews', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res) => {
  try {
    const productId = Number(req.params.id);
    const { rating, title, comment, city } = req.body || {};
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    }
    if (!title || !comment) {
      return res.status(400).json({ error: 'Review title and comment are required.' });
    }

    // Check if user purchased this product
    const userOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.userId, req.authUser!.id));
    let hasPurchased = false;
    if (userOrders.length > 0) {
      const orderIds = userOrders.map((o) => o.id);
      const matchedItem = await db
        .select()
        .from(orderItems)
        .where(and(inArray(orderItems.orderId, orderIds), eq(orderItems.productId, productId)))
        .limit(1);
      hasPurchased = matchedItem.length > 0;
    }

    const [created] = await db
      .insert(reviews)
      .values({
        productId,
        userId: req.authUser!.id,
        reviewerName: req.authUser!.fullName,
        reviewerCity: city ? String(city).trim() : 'Accra',
        rating: numRating,
        title: String(title).trim(),
        comment: String(comment).trim(),
        verifiedPurchase: hasPurchased,
      })
      .returning();

    const allReviews = await db.select().from(reviews).where(eq(reviews.productId, productId));
    const avg = (
      allReviews.reduce((acc, r) => acc + r.rating, 0) / Math.max(allReviews.length, 1)
    ).toFixed(1);

    await db
      .update(products)
      .set({ ratingAvg: avg, reviewCount: allReviews.length })
      .where(eq(products.id, productId));

    res.status(201).json({ review: created, ratingAvg: avg, reviewCount: allReviews.length });
  } catch (error) {
    console.error('Review post error:', error);
    res.status(500).json({ error: 'Failed to submit product review.' });
  }
});

// ==================== ADDRESSES ====================

app.get('/api/addresses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const list = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, req.authUser!.id))
      .orderBy(desc(addresses.isDefault), desc(addresses.id));
    res.json({ addresses: list });
  } catch (error) {
    console.error('Get addresses error:', error);
    res.status(500).json({ error: 'Failed to load delivery addresses.' });
  }
});

app.post('/api/addresses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { label, recipientName, phone, region, city, streetAddress, digitalAddress, isDefault } =
      req.body || {};
    if (!recipientName || !phone || !region || !city || !streetAddress) {
      return res.status(400).json({ error: 'Please complete all required address fields.' });
    }
    if (!isValidGhanaPhone(String(phone))) {
      return res.status(400).json({ error: 'Please enter a valid Ghana phone number.' });
    }
    if (isDefault) {
      await db
        .update(addresses)
        .set({ isDefault: false })
        .where(eq(addresses.userId, req.authUser!.id));
    }
    const [created] = await db
      .insert(addresses)
      .values({
        userId: req.authUser!.id,
        label: label ? String(label).trim() : 'Home',
        recipientName: String(recipientName).trim(),
        phone: normalizeGhanaPhone(String(phone)),
        region: String(region).trim(),
        city: String(city).trim(),
        streetAddress: String(streetAddress).trim(),
        digitalAddress: digitalAddress ? String(digitalAddress).trim().toUpperCase() : '',
        isDefault: Boolean(isDefault),
      })
      .returning();

    res.status(201).json({ address: created });
  } catch (error) {
    console.error('Create address error:', error);
    res.status(500).json({ error: 'Failed to save address.' });
  }
});

app.delete('/api/addresses/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.userId, req.authUser!.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete address error:', error);
    res.status(500).json({ error: 'Failed to remove address.' });
  }
});

// ==================== CART & WISHLIST ====================

app.get('/api/cart', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        cartId: cartItems.id,
        quantity: cartItems.quantity,
        product: products,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, req.authUser!.id));

    res.json({ items: rows });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ error: 'Failed to load shopping cart.' });
  }
});

app.post('/api/cart', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { productId, quantity = 1 } = req.body || {};
    const pid = Number(productId);
    const qty = Math.max(1, Number(quantity) || 1);

    const existing = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.userId, req.authUser!.id), eq(cartItems.productId, pid)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(cartItems)
        .set({ quantity: existing[0].quantity + qty })
        .where(eq(cartItems.id, existing[0].id));
    } else {
      await db.insert(cartItems).values({
        userId: req.authUser!.id,
        productId: pid,
        quantity: qty,
      });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ error: 'Failed to update cart.' });
  }
});

app.put('/api/cart/:productId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const pid = Number(req.params.productId);
    const qty = Number(req.body?.quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      await db
        .delete(cartItems)
        .where(and(eq(cartItems.userId, req.authUser!.id), eq(cartItems.productId, pid)));
    } else {
      await db
        .update(cartItems)
        .set({ quantity: qty })
        .where(and(eq(cartItems.userId, req.authUser!.id), eq(cartItems.productId, pid)));
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(500).json({ error: 'Failed to update quantity.' });
  }
});

app.delete('/api/cart/:productId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const pid = Number(req.params.productId);
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.userId, req.authUser!.id), eq(cartItems.productId, pid)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete cart item error:', error);
    res.status(500).json({ error: 'Failed to remove item from cart.' });
  }
});

app.get('/api/wishlist', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        wishlistId: wishlistItems.id,
        product: products,
      })
      .from(wishlistItems)
      .innerJoin(products, eq(wishlistItems.productId, products.id))
      .where(eq(wishlistItems.userId, req.authUser!.id));
    res.json({ items: rows });
  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).json({ error: 'Failed to load wishlist.' });
  }
});

app.post('/api/wishlist/toggle', requireAuth, async (req: AuthRequest, res) => {
  try {
    const pid = Number(req.body?.productId);
    const existing = await db
      .select()
      .from(wishlistItems)
      .where(and(eq(wishlistItems.userId, req.authUser!.id), eq(wishlistItems.productId, pid)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(wishlistItems).where(eq(wishlistItems.id, existing[0].id));
      return res.json({ wishlisted: false });
    }
    await db.insert(wishlistItems).values({
      userId: req.authUser!.id,
      productId: pid,
    });
    res.json({ wishlisted: true });
  } catch (error) {
    console.error('Toggle wishlist error:', error);
    res.status(500).json({ error: 'Failed to update wishlist.' });
  }
});

// ==================== ORDERS & PAYSTACK CHECKOUT ====================

app.post('/api/orders/checkout', requireAuth, requireVerifiedEmail, async (req: AuthRequest, res) => {
  try {
    const {
      items,
      customerName,
      customerPhone,
      shippingRegion,
      shippingCity,
      shippingStreet,
      digitalAddress,
      deliveryMethod,
      paymentMethod,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Your shopping cart is empty.' });
    }
    if (!customerName || !customerPhone || !shippingRegion || !shippingCity || !shippingStreet) {
      return res.status(400).json({ error: 'Please complete your delivery address and phone details.' });
    }
    if (!isValidGhanaPhone(String(customerPhone))) {
      return res.status(400).json({ error: 'Please enter a valid Ghana phone number for dispatch.' });
    }

    const productIds = items.map((i: any) => Number(i.productId)).filter((id: number) => id > 0);
    const dbProducts = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));
    let subtotalGhs = 0;
    const verifiedLineItems: Array<{
      product: typeof products.$inferSelect;
      quantity: number;
    }> = [];

    for (const item of items) {
      const pid = Number(item.productId);
      const qty = Math.max(1, Number(item.quantity) || 1);
      const prod = productMap.get(pid);
      if (!prod) {
        return res.status(404).json({ error: `One of the selected items is no longer available.` });
      }
      if (prod.stockQty < qty) {
        return res.status(400).json({
          error: `Insufficient stock for ${prod.name} (${prod.stockQty} remaining).`,
        });
      }
      subtotalGhs += prod.priceGhs * qty;
      verifiedLineItems.push({ product: prod, quantity: qty });
    }

    let deliveryFeeGhs = 85;
    if (deliveryMethod === 'Osu Showroom Pickup') {
      deliveryFeeGhs = 0;
    } else if (deliveryMethod === 'Accra Same-Day Dispatch') {
      deliveryFeeGhs = subtotalGhs >= 5000 ? 0 : 45;
    }
    const totalGhs = subtotalGhs + deliveryFeeGhs;
    const orderNumber = `GCT-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
    const paystackReference = `PAY-${orderNumber}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const isCod = paymentMethod === 'cod';

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        userId: req.authUser!.id,
        customerName: String(customerName).trim(),
        customerEmail: req.authUser!.email,
        customerPhone: normalizeGhanaPhone(String(customerPhone)),
        shippingRegion: String(shippingRegion).trim(),
        shippingCity: String(shippingCity).trim(),
        shippingStreet: String(shippingStreet).trim(),
        digitalAddress: digitalAddress ? String(digitalAddress).trim().toUpperCase() : '',
        deliveryMethod: String(deliveryMethod || 'Accra Same-Day Dispatch'),
        paymentMethod: isCod ? 'cod' : 'paystack',
        paymentStatus: isCod ? 'cod_pending' : 'pending',
        paystackReference: isCod ? '' : paystackReference,
        orderStatus: isCod ? 'confirmed' : 'pending',
        trackingNote: isCod
          ? 'Cash on Delivery order confirmed. Accra dispatch team notified.'
          : 'Awaiting Paystack payment confirmation.',
        subtotalGhs,
        deliveryFeeGhs,
        totalGhs,
      })
      .returning();

    await db.insert(orderItems).values(
      verifiedLineItems.map(({ product, quantity }) => ({
        orderId: createdOrder.id,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        productImage: product.imageUrl,
        unitPriceGhs: product.priceGhs,
        quantity,
      }))
    );

    if (isCod) {
      for (const { product, quantity } of verifiedLineItems) {
        await db
          .update(products)
          .set({ stockQty: sql`GREATEST(0, ${products.stockQty} - ${quantity})` })
          .where(eq(products.id, product.id));
      }
      await db.delete(cartItems).where(eq(cartItems.userId, req.authUser!.id));
      return res.status(201).json({ order: createdOrder, mode: 'cod' });
    }

    // Paystack payment initialization
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (paystackSecret) {
      const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
      const psResp = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${paystackSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: req.authUser!.email,
          amount: totalGhs * 100, // GHS pesewas
          currency: 'GHS',
          reference: paystackReference,
          callback_url: `${appUrl}/?paystack_ref=${encodeURIComponent(paystackReference)}`,
          metadata: {
            orderNumber,
            orderId: createdOrder.id,
            customerPhone: createdOrder.customerPhone,
          },
        }),
      });
      const psData = (await psResp.json()) as any;
      if (!psResp.ok || !psData.status) {
        return res.status(502).json({
          error: psData.message || 'Unable to initialize Paystack checkout.',
        });
      }
      return res.status(201).json({
        order: createdOrder,
        paystack: {
          mode: 'live',
          reference: paystackReference,
          authorizationUrl: psData.data.authorization_url,
        },
      });
    }

    // Preview sandbox Paystack flow when PAYSTACK_SECRET_KEY is not configured in Secrets
    res.status(201).json({
      order: createdOrder,
      paystack: {
        mode: 'sandbox',
        reference: paystackReference,
        amountGhs: totalGhs,
      },
    });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Checkout failed. Please try again.' });
  }
});

app.post('/api/payments/paystack/verify', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { reference, channel } = req.body || {};
    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required.' });
    }

    const found = await db
      .select()
      .from(orders)
      .where(
        and(eq(orders.paystackReference, String(reference)), eq(orders.userId, req.authUser!.id))
      )
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'Order matching payment reference was not found.' });
    }
    const order = found[0];
    if (order.paymentStatus === 'paid') {
      return res.json({ order, verified: true });
    }

    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (paystackSecret) {
      const verifyResp = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(String(reference))}`,
        {
          headers: { Authorization: `Bearer ${paystackSecret}` },
        }
      );
      const verifyJson = (await verifyResp.json()) as any;
      if (!verifyResp.ok || !verifyJson.status || verifyJson.data?.status !== 'success') {
        return res.status(400).json({
          error: verifyJson.data?.gateway_response || 'Paystack payment was not completed.',
        });
      }
    }

    const [updatedOrder] = await db
      .update(orders)
      .set({
        paymentStatus: 'paid',
        orderStatus: 'confirmed',
        trackingNote: `Paystack ${channel ? `(${channel}) ` : ''}payment confirmed. Preparing order in Accra warehouse.`,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id))
      .returning();

    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      if (item.productId) {
        await db
          .update(products)
          .set({ stockQty: sql`GREATEST(0, ${products.stockQty} - ${item.quantity})` })
          .where(eq(products.id, item.productId));
      }
    }
    await db.delete(cartItems).where(eq(cartItems.userId, req.authUser!.id));

    res.json({ order: updatedOrder, verified: true });
  } catch (error) {
    console.error('Paystack verify error:', error);
    res.status(500).json({ error: 'Failed to verify Paystack payment.' });
  }
});

app.post('/api/payments/paystack/webhook', async (req: any, res) => {
  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.sendStatus(200);
    const sig = req.headers['x-paystack-signature'];
    const hash = crypto
      .createHmac('sha512', secret)
      .update(req.rawBody || JSON.stringify(req.body))
      .digest('hex');

    if (sig !== hash) {
      return res.status(401).send('Invalid signature');
    }
    if (req.body?.event === 'charge.success') {
      const ref = req.body.data?.reference;
      if (ref) {
        await db
          .update(orders)
          .set({
            paymentStatus: 'paid',
            orderStatus: 'confirmed',
            trackingNote: 'Paystack webhook confirmed payment. Preparing shipment.',
            updatedAt: new Date(),
          })
          .where(eq(orders.paystackReference, String(ref)));
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Paystack webhook error:', error);
    res.sendStatus(500);
  }
});

app.get('/api/orders', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, req.authUser!.id))
      .orderBy(desc(orders.createdAt));

    if (!userOrders.length) {
      return res.json({ orders: [] });
    }
    const orderIds = userOrders.map((o) => o.id);
    const allItems = await db
      .select()
      .from(orderItems)
      .where(inArray(orderItems.orderId, orderIds));

    const enriched = userOrders.map((o) => ({
      ...o,
      items: allItems.filter((item) => item.orderId === o.id),
    }));

    res.json({ orders: enriched });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to load order history.' });
  }
});

app.get('/api/orders/track/:orderNumber', async (req, res) => {
  try {
    const orderNo = String(req.params.orderNumber).trim().toUpperCase();
    const found = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNo))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'Order number not found. Check your receipt (e.g. MPH-2026-1042).' });
    }
    const o = found[0];
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));

    res.json({
      order: {
        orderNumber: o.orderNumber,
        orderStatus: o.orderStatus,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        deliveryMethod: o.deliveryMethod,
        shippingRegion: o.shippingRegion,
        shippingCity: o.shippingCity,
        trackingNote: o.trackingNote,
        totalGhs: o.totalGhs,
        createdAt: o.createdAt,
        updatedAt: o.updatedAt,
        items,
      },
    });
  } catch (error) {
    console.error('Track order error:', error);
    res.status(500).json({ error: 'Unable to track order right now.' });
  }
});

// ==================== NEWSLETTER ====================

app.post('/api/newsletter', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const cleanEmail = String(email).toLowerCase().trim();
    await db
      .insert(newsletterSubscribers)
      .values({ email: cleanEmail })
      .onConflictDoNothing();

    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabaseServerClient();
        await supabase
          .from('newsletter_subscribers')
          .upsert({ email: cleanEmail }, { onConflict: 'email', ignoreDuplicates: true });
      } catch {
        // Non-blocking mirror to Supabase REST
      }
    }

    res.json({ message: 'Subscribed to MAGNOM PHONES HUB deals and restock alerts.' });
  } catch (error) {
    console.error('Newsletter error:', error);
    res.status(500).json({ error: 'Subscription failed.' });
  }
});

// ==================== ADMIN ROUTES ====================

app.get('/api/admin/overview', requireAuth, requireStaffOrAdmin, async (_req, res) => {
  try {
    await ensureSeeded();
    const [allOrders, allOrderItems, allProducts, allCategories, allBrands, allCustomers] =
      await Promise.all([
        db.select().from(orders).orderBy(desc(orders.createdAt)),
        db.select().from(orderItems),
        db.select().from(products).orderBy(desc(products.id)),
        db.select().from(categories).orderBy(categories.sortOrder, categories.name),
        db.select().from(brands).orderBy(brands.name),
        db.select().from(users).orderBy(desc(users.createdAt)),
      ]);

    const paidRevenueGhs = allOrders
      .filter((o) => o.paymentStatus === 'paid' || o.orderStatus === 'delivered')
      .reduce((sum, o) => sum + o.totalGhs, 0);

    const enrichedOrders = allOrders.map((o) => ({
      ...o,
      items: allOrderItems.filter((i) => i.orderId === o.id),
    }));

    res.json({
      stats: {
        totalRevenueGhs: paidRevenueGhs,
        totalOrders: allOrders.length,
        pendingOrders: allOrders.filter((o) => o.orderStatus === 'pending' || o.orderStatus === 'confirmed').length,
        lowStockCount: allProducts.filter((p) => p.stockQty <= 5).length,
        totalProducts: allProducts.length,
        totalCustomers: allCustomers.filter((u) => u.role === 'customer').length,
      },
      orders: enrichedOrders,
      products: allProducts,
      categories: allCategories,
      brands: allBrands,
      customers: allCustomers.map(sanitizeUser),
    });
  } catch (error) {
    console.error('Admin overview error:', error);
    res.status(500).json({ error: 'Failed to load admin overview.' });
  }
});

app.post('/api/admin/products', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name || !b.categoryGroup || !b.subcategory || !b.brandName || !b.priceGhs) {
      return res.status(400).json({ error: 'Name, category, subcategory, brand, and price (GHS) are required.' });
    }
    const baseSlug = slugify(String(b.name));
    const uniqueSuffix = crypto.randomBytes(2).toString('hex');
    const sku = b.sku ? String(b.sku).trim().toUpperCase() : `GCT-${uniqueSuffix.toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const defaultImgMap: Record<string, string> = {
      iphones: '/src/assets/images/product_iphone_flagship_1795168475656.jpg',
      android: '/src/assets/images/product_android_flagship_1795168475255.jpg',
      laptops: '/src/assets/images/product_laptop_ultrabook_1795168475793.jpg',
      accessories: '/src/assets/images/product_audio_accessories_1795168475567.jpg',
    };

    const [created] = await db
      .insert(products)
      .values({
        sku,
        name: String(b.name).trim(),
        slug: `${baseSlug}-${uniqueSuffix}`,
        categoryGroup: String(b.categoryGroup),
        subcategory: String(b.subcategory).trim(),
        brandSlug: slugify(String(b.brandName)),
        brandName: String(b.brandName).trim(),
        priceGhs: Number(b.priceGhs),
        compareAtGhs: b.compareAtGhs ? Number(b.compareAtGhs) : null,
        stockQty: Number(b.stockQty ?? 10),
        condition: String(b.condition || 'Brand New Sealed'),
        warranty: String(b.warranty || '12 Months MAGNOM PHONES HUB Warranty'),
        storageOrVariant: String(b.storageOrVariant || ''),
        specsJson: typeof b.specsJson === 'string' ? b.specsJson : JSON.stringify(b.specsJson || {}),
        description: String(b.description || 'Authentic electronics unit inspected and backed by MAGNOM PHONES HUB Ghana warranty.'),
        imageUrl: b.imageUrl ? String(b.imageUrl).trim() : defaultImgMap[String(b.categoryGroup)] || defaultImgMap.accessories,
        isFeatured: Boolean(b.isFeatured),
        isBestSeller: Boolean(b.isBestSeller),
        isNewArrival: Boolean(b.isNewArrival ?? true),
        isSpecialOffer: Boolean(b.isSpecialOffer),
      })
      .returning();

    res.status(201).json({ product: created });
  } catch (error) {
    console.error('Admin add product error:', error);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

app.put('/api/admin/products/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const b = req.body || {};
    const [updated] = await db
      .update(products)
      .set({
        name: String(b.name).trim(),
        categoryGroup: String(b.categoryGroup),
        subcategory: String(b.subcategory).trim(),
        brandSlug: slugify(String(b.brandName)),
        brandName: String(b.brandName).trim(),
        priceGhs: Number(b.priceGhs),
        compareAtGhs: b.compareAtGhs ? Number(b.compareAtGhs) : null,
        stockQty: Number(b.stockQty ?? 0),
        condition: String(b.condition || 'Brand New Sealed'),
        warranty: String(b.warranty || '12 Months MAGNOM PHONES HUB Warranty'),
        storageOrVariant: String(b.storageOrVariant || ''),
        description: String(b.description || ''),
        isFeatured: Boolean(b.isFeatured),
        isBestSeller: Boolean(b.isBestSeller),
        isNewArrival: Boolean(b.isNewArrival),
        isSpecialOffer: Boolean(b.isSpecialOffer),
      })
      .where(eq(products.id, id))
      .returning();

    res.json({ product: updated });
  } catch (error) {
    console.error('Admin update product error:', error);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

app.delete('/api/admin/products/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(products).where(eq(products.id, id));
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin delete product error:', error);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

app.post('/api/admin/categories', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { name, parentGroup, description } = req.body || {};
    if (!name || !parentGroup) {
      return res.status(400).json({ error: 'Category name and parent group are required.' });
    }
    const [created] = await db
      .insert(categories)
      .values({
        name: String(name).trim(),
        slug: slugify(String(name)),
        parentGroup: String(parentGroup),
        description: description ? String(description).trim() : '',
        sortOrder: 50,
      })
      .returning();
    res.status(201).json({ category: created });
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json({ error: 'Failed to add category (may already exist).' });
  }
});

app.delete('/api/admin/categories/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.delete(categories).where(eq(categories.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete category.' });
  }
});

app.post('/api/admin/brands', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const { name, categoryGroup, isPopular } = req.body || {};
    if (!name || !categoryGroup) {
      return res.status(400).json({ error: 'Brand name and category group are required.' });
    }
    const [created] = await db
      .insert(brands)
      .values({
        name: String(name).trim(),
        slug: slugify(String(name)),
        categoryGroup: String(categoryGroup),
        isPopular: Boolean(isPopular ?? true),
      })
      .returning();
    res.status(201).json({ brand: created });
  } catch (error) {
    console.error('Add brand error:', error);
    res.status(500).json({ error: 'Failed to add brand (may already exist).' });
  }
});

app.delete('/api/admin/brands/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.delete(brands).where(eq(brands.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete brand.' });
  }
});

app.post('/api/admin/orders', requireAuth, requireStaffOrAdmin, async (req: AuthRequest, res) => {
  try {
    const {
      productId,
      quantity = 1,
      customerName,
      customerEmail,
      customerPhone,
      shippingRegion,
      shippingCity,
      shippingStreet,
      digitalAddress,
      deliveryMethod,
      paymentMethod,
      paymentStatus,
      orderStatus,
      trackingNote,
    } = req.body || {};

    if (!productId || !customerName || !customerPhone || !shippingRegion || !shippingCity) {
      return res.status(400).json({
        error: 'Product, customer name, Ghana phone, region, and city are required.',
      });
    }

    const foundProd = await db
      .select()
      .from(products)
      .where(eq(products.id, Number(productId)))
      .limit(1);

    if (!foundProd.length) {
      return res.status(404).json({ error: 'Selected product was not found.' });
    }
    const prod = foundProd[0];
    const qty = Math.max(1, Number(quantity) || 1);
    const subtotalGhs = prod.priceGhs * qty;
    const deliveryFeeGhs =
      deliveryMethod === 'Showroom Pickup'
        ? 0
        : deliveryMethod === 'Accra Same-Day Dispatch'
        ? subtotalGhs >= 5000
          ? 0
          : 45
        : 85;
    const totalGhs = subtotalGhs + deliveryFeeGhs;
    const orderNumber = `MPH-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        userId: req.authUser!.id,
        customerName: String(customerName).trim(),
        customerEmail: customerEmail ? String(customerEmail).trim() : req.authUser!.email,
        customerPhone: normalizeGhanaPhone(String(customerPhone)),
        shippingRegion: String(shippingRegion).trim(),
        shippingCity: String(shippingCity).trim(),
        shippingStreet: shippingStreet ? String(shippingStreet).trim() : 'Direct Admin Order',
        digitalAddress: digitalAddress ? String(digitalAddress).trim().toUpperCase() : '',
        deliveryMethod: String(deliveryMethod || 'Accra Same-Day Dispatch'),
        paymentMethod: String(paymentMethod || 'cod'),
        paymentStatus: String(paymentStatus || 'paid'),
        paystackReference: '',
        orderStatus: String(orderStatus || 'confirmed'),
        trackingNote: trackingNote
          ? String(trackingNote).trim()
          : 'Order created and logged by MAGNOM PHONES HUB Admin.',
        subtotalGhs,
        deliveryFeeGhs,
        totalGhs,
      })
      .returning();

    await db.insert(orderItems).values({
      orderId: createdOrder.id,
      productId: prod.id,
      productName: prod.name,
      productSku: prod.sku,
      productImage: prod.imageUrl,
      unitPriceGhs: prod.priceGhs,
      quantity: qty,
    });

    await db
      .update(products)
      .set({ stockQty: sql`GREATEST(0, ${products.stockQty} - ${qty})` })
      .where(eq(products.id, prod.id));

    res.status(201).json({ order: createdOrder });
  } catch (error) {
    console.error('Admin create order error:', error);
    res.status(500).json({ error: 'Failed to create order.' });
  }
});

app.patch('/api/admin/orders/:id', requireAuth, requireStaffOrAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { orderStatus, paymentStatus, trackingNote } = req.body || {};
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (orderStatus) updateData.orderStatus = String(orderStatus);
    if (paymentStatus) updateData.paymentStatus = String(paymentStatus);
    if (trackingNote !== undefined) updateData.trackingNote = String(trackingNote);

    const [updated] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();

    res.json({ order: updated });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order.' });
  }
});

app.delete('/api/admin/orders/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.delete(orders).where(eq(orders.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ error: 'Failed to delete order.' });
  }
});

// ==================== USER ROLE MANAGEMENT (RBAC) ====================

app.patch('/api/admin/users/:id/role', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const targetId = Number(req.params.id);
    const { role, emailVerified } = req.body || {};

    if (role !== undefined && !['customer', 'staff', 'admin'].includes(String(role))) {
      return res.status(400).json({ error: 'Role must be customer, staff, or admin.' });
    }

    const found = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
    if (!found.length) {
      return res.status(404).json({ error: 'User account not found.' });
    }
    const targetUser = found[0];

    if (role && role !== 'admin') {
      if (targetUser.id === req.authUser!.id) {
        return res.status(400).json({ error: 'You cannot demote your own active admin account.' });
      }
      if (targetUser.email.toLowerCase() === 'sarpongpatrick2915@gmail.com') {
        return res.status(400).json({ error: 'Primary store owner admin role cannot be removed.' });
      }
    }

    const updateSet: Record<string, any> = {};
    if (role) updateSet.role = String(role);
    if (emailVerified !== undefined) updateSet.emailVerified = Boolean(emailVerified);

    const [updated] = await db
      .update(users)
      .set(updateSet)
      .where(eq(users.id, targetId))
      .returning();

    res.json({ user: sanitizeUser(updated) });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { fullName, email, phone, password, role = 'staff' } = req.body || {};
    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }
    if (!['customer', 'staff', 'admin'].includes(String(role))) {
      return res.status(400).json({ error: 'Invalid role selected.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const existing = await db.select().from(users).where(eq(users.email, cleanEmail)).limit(1);
    if (existing.length) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(String(password));
    const uid = `mph-${crypto.randomBytes(6).toString('hex')}`;
    const otp = generateNumericOtp();
    const otpHash = hashOtp(cleanEmail, otp);

    const [created] = await db
      .insert(users)
      .values({
        uid,
        fullName: String(fullName).trim(),
        email: cleanEmail,
        phone: phone ? normalizeGhanaPhone(String(phone)) : '',
        role: String(role),
        passwordHash,
        emailVerified: false,
        otpCodeHash: otpHash,
        otpPurpose: 'verify_email',
        otpExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        otpLastSentAt: new Date(),
      })
      .returning();

    const mailRes = await sendOtpEmail({
      toEmail: created.email,
      fullName: created.fullName,
      otp,
      purpose: 'verify_email',
    });

    res.status(201).json({ user: sanitizeUser(created), emailSent: mailRes.sent });
  } catch (error) {
    console.error('Admin create user error:', error);
    res.status(500).json({ error: 'Failed to create user account.' });
  }
});

// ==================== AUTOMATED BACKUPS & RESTORE ====================

app.get('/api/cron/backup', async (req, res) => {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized cron trigger.' });
    }
    const result = await runAutoBackupIfDue(true);
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Cron backup error:', error);
    res.status(500).json({ error: 'Scheduled backup failed.' });
  }
});

app.get('/api/admin/backups', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [settings, rows] = await Promise.all([
      ensureBackupSettings(),
      db
        .select({
          id: backups.id,
          backupCode: backups.backupCode,
          triggerType: backups.triggerType,
          createdByEmail: backups.createdByEmail,
          summaryJson: backups.summaryJson,
          sizeBytes: backups.sizeBytes,
          createdAt: backups.createdAt,
        })
        .from(backups)
        .orderBy(desc(backups.createdAt))
        .limit(50),
    ]);

    res.json({
      settings,
      backups: rows.map((r) => {
        let summary = {
          categories: 0,
          brands: 0,
          products: 0,
          orders: 0,
          reviews: 0,
          users: 0,
          newsletterSubscribers: 0,
        };
        try {
          summary = { ...summary, ...JSON.parse(r.summaryJson || '{}') };
        } catch {
          // ignore malformed summary
        }
        return {
          id: r.id,
          backupCode: r.backupCode,
          triggerType: r.triggerType,
          createdByEmail: r.createdByEmail,
          summary,
          sizeBytes: r.sizeBytes,
          createdAt: r.createdAt,
        };
      }),
    });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ error: 'Failed to load database backups.' });
  }
});

app.put('/api/admin/backups/settings', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { enabled, intervalHours, retentionCount } = req.body || {};
    const updated = await updateBackupSettings({ enabled, intervalHours, retentionCount });
    res.json({ settings: updated });
  } catch (error) {
    console.error('Update backup settings error:', error);
    res.status(500).json({ error: 'Failed to update backup schedule.' });
  }
});

app.post('/api/admin/backups/run', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const backup = await createDatabaseBackup('manual', req.authUser!.email);
    res.status(201).json({ backup });
  } catch (error) {
    console.error('Manual backup error:', error);
    res.status(500).json({ error: 'Failed to create backup snapshot.' });
  }
});

app.get('/api/admin/backups/:id/download', requireAuth, requireAdmin, async (req, res) => {
  try {
    const found = await db
      .select()
      .from(backups)
      .where(eq(backups.id, Number(req.params.id)))
      .limit(1);

    if (!found.length) {
      return res.status(404).json({ error: 'Backup snapshot not found.' });
    }
    const row = found[0];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${row.backupCode}.json"`);
    res.send(row.snapshotJson);
  } catch (error) {
    console.error('Download backup error:', error);
    res.status(500).json({ error: 'Failed to download backup file.' });
  }
});

app.post('/api/admin/backups/:id/restore', requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await restoreDatabaseBackup(Number(req.params.id), req.authUser!.email);
    res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Restore backup error:', error);
    res.status(500).json({ error: error?.message || 'Failed to restore backup.' });
  }
});

app.delete('/api/admin/backups/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.delete(backups).where(eq(backups.id, Number(req.params.id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete backup error:', error);
    res.status(500).json({ error: 'Failed to delete backup snapshot.' });
  }
});

export default app;
