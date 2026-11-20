import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(rawUrl: string): string {
  return rawUrl
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

const DEFAULT_SUPABASE_URL = 'https://hlbayncsbekdmejmhorg.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsYmF5bmNzYmVrZG1lam1ob3JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUxNjYxODYsImV4cCI6MjExMDc0MjE4Nn0.gq7qTq8prh5ztSEoRZxD6JMiup1RAcjcv5wEzBHuWW4';

export const supabaseServerUrl = normalizeSupabaseUrl(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
);

const supabaseServerKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  DEFAULT_SUPABASE_ANON_KEY
).trim();

let _serverClient: SupabaseClient | null = null;

export function getSupabaseServerClient(): SupabaseClient {
  if (!_serverClient) {
    _serverClient = createClient(supabaseServerUrl, supabaseServerKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return _serverClient;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY)
  );
}

