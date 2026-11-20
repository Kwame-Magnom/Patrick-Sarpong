import { auth } from './firebase';
export { supabase } from './supabase';

let customSessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  customSessionToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem('gct_session_token', token);
    } else {
      sessionStorage.removeItem('gct_session_token');
    }
  }
}

export function getStoredSessionToken(): string | null {
  if (customSessionToken) return customSessionToken;
  if (typeof window !== 'undefined') {
    customSessionToken = sessionStorage.getItem('gct_session_token');
  }
  return customSessionToken;
}

async function resolveBearerToken(): Promise<string | null> {
  const custom = getStoredSessionToken();
  if (custom) return custom;
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  return null;
}

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await resolveBearerToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const rawText = await response.text().catch(() => '');
  let data: any = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  }
  if (!response.ok) {
    const fallbackMsg = `Request failed (HTTP ${response.status})`;
    const err = new Error(data.error || fallbackMsg) as Error & {
      status?: number;
      data?: any;
    };
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data as T;
}
