import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { users } from '../db/schema';
import { adminAuth } from '../lib/firebase-admin';
import { isAdminEmail, verifySessionToken } from '../lib/auth-security';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

export async function getOrCreateFirebaseUser(uid: string, email: string, name?: string) {
  const role = isAdminEmail(email) ? 'admin' : 'customer';
  const result = await db
    .insert(users)
    .values({
      uid,
      email: email.toLowerCase().trim(),
      fullName: name || email.split('@')[0],
      role,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        uid,
        emailVerified: true,
      },
    })
    .returning();

  const user = result[0];
  if (role === 'admin' && user.role !== 'admin') {
    const updated = await db
      .update(users)
      .set({ role: 'admin' })
      .where(eq(users.id, user.id))
      .returning();
    return updated[0];
  }
  return user;
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication token is missing.' });
  }

  // 1. Check signed email/password session token
  const sessionPayload = verifySessionToken(token);
  if (sessionPayload) {
    try {
      const found = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionPayload.userId))
        .limit(1);

      if (!found.length) {
        return res.status(401).json({ error: 'Account not found.' });
      }
      const user = found[0];
      req.authUser = {
        id: user.id,
        uid: user.uid,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
      };
      return next();
    } catch (error) {
      console.error('Session user lookup error:', error);
      return res.status(500).json({ error: 'Failed to verify user session.' });
    }
  }

  // 2. Otherwise verify Firebase ID Token (Google Sign-In)
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = decoded.email || `${decoded.uid}@firebase.local`;
    const user = await getOrCreateFirebaseUser(decoded.uid, email, decoded.name);
    req.authUser = {
      id: user.id,
      uid: user.uid,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      emailVerified: user.emailVerified,
    };
    return next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
};

export const requireVerifiedEmail = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!req.authUser.emailVerified) {
    return res.status(403).json({
      error: 'Please verify your email address with OTP before proceeding to checkout or protected actions.',
      requiresVerification: true,
    });
  }
  return next();
};

export const requireAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.authUser.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required.' });
  }
  return next();
};

export const requireStaffOrAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.authUser.role !== 'admin' && req.authUser.role !== 'staff') {
    return res.status(403).json({ error: 'Staff or Administrator privileges required.' });
  }
  return next();
};

