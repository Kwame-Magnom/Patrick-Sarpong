import fs from 'fs';
import path from 'path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function resolveFirebaseProjectId(): string {
  const fromEnv = (process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { projectId?: string };
      if (parsed.projectId) return parsed.projectId;
    }
  } catch {
    // Fallback to default project ID if config file is unavailable in serverless bundle
  }
  return 'invertible-grammar-3klwk';
}

if (!getApps().length) {
  initializeApp({
    projectId: resolveFirebaseProjectId(),
  });
}

export const adminAuth = getAuth();
