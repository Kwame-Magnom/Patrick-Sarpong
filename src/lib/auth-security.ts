import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const AUTH_PEPPER = process.env.AUTH_PEPPER || 'goldcoast-tech-ghana-pepper-2026-server-only';
const SESSION_SECRET = process.env.SESSION_SECRET || 'goldcoast-tech-session-hmac-secret-2026-server-only';

const BCRYPT_ROUNDS = 12;

function applyPepper(password: string): string {
  return crypto.createHmac('sha256', AUTH_PEPPER).update(password).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const peppered = applyPepper(password);
  return bcrypt.hash(peppered, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const peppered = applyPepper(password);
  return bcrypt.compare(peppered, storedHash);
}

export function generateNumericOtp(): string {
  const num = crypto.randomInt(100000, 999999);
  return String(num);
}

export function hashOtp(email: string, otp: string): string {
  return crypto
    .createHmac('sha256', AUTH_PEPPER)
    .update(`${email.toLowerCase().trim()}:${otp.trim()}`)
    .digest('hex');
}

export interface SessionPayload {
  userId: number;
  uid: string;
  email: string;
  role: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `gct.${encoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token.startsWith('gct.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, encoded, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function isValidGhanaPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return /^(\+233|233|0)(2[0345678]|5[0345679])\d{7}$/.test(cleaned);
}

export function normalizeGhanaPhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `+233${cleaned.slice(1)}`;
  }
  if (cleaned.startsWith('233') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  return cleaned;
}

export function isAdminEmail(email: string): boolean {
  const normalized = email.toLowerCase().trim();
  const configured = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  const defaultAdmins = ['sarpongpatrick2915@gmail.com', 'admin@goldcoasttech.gh'];
  return configured.includes(normalized) || defaultAdmins.includes(normalized);
}
