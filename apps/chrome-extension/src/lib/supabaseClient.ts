import { createClient } from '@supabase/supabase-js';

/** Subset of @supabase/auth-js SupportedStorage — matches createClient auth.storage */
type AuthChromeStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

// In MV3 we can’t safely ship a service_role key.
// Use ONLY the anon key and RLS on the Supabase side.
// These values should be injected at build time (env, rsbuild define, etc.).
/** Set via rsbuild `source.define` / env — never commit real project keys in source. */
const SUPABASE_URL =
  (process.env.REACT_APP_SUPABASE_URL as string | undefined) ??
  (process.env.SUPABASE_URL as string | undefined) ??
  (globalThis as any).REACT_APP_SUPABASE_URL ??
  (globalThis as any).SUPABASE_URL ??
  '';
const SUPABASE_ANON_KEY =
  (process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined) ??
  (process.env.SUPABASE_ANON_KEY as string | undefined) ??
  (globalThis as any).REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  (globalThis as any).SUPABASE_ANON_KEY ??
  '';

// Prevent the whole UI from crashing if env injection is missing.
// Auth calls will still fail (and we log loudly), but the extension remains usable.
const EFFECTIVE_SUPABASE_URL = SUPABASE_URL || 'https://invalid.supabase.co';
const EFFECTIVE_SUPABASE_ANON_KEY = SUPABASE_ANON_KEY || 'invalid';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabaseClient] SUPABASE_URL / SUPABASE_ANON_KEY are not configured. Auth calls will fail until they are set.',
  );
}

/**
 * Supabase auth storage backed by chrome.storage.local (popup + service worker).
 * Required for PKCE: keeps the code_verifier across MV3 service worker suspends.
 */
const chromeAuthStorage: AuthChromeStorage = {
  getItem: async (key: string) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
    const r = await chrome.storage.local.get(key);
    const v = r[key];
    if (v === undefined || v === null) return null;
    return typeof v === 'string' ? v : JSON.stringify(v);
  },
  setItem: async (key: string, value: string) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.remove(key);
  },
};

/** Same key Supabase uses internally (for storage.onChanged listeners). */
export function getSupabaseAuthStorageKey(): string {
  try {
    const host = new URL(EFFECTIVE_SUPABASE_URL).hostname;
    const ref = host.split('.')[0];
    return `sb-${ref}-auth-token`;
  } catch {
    return 'sb-unknown-auth-token';
  }
}

export const supabase = createClient(EFFECTIVE_SUPABASE_URL, EFFECTIVE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    /** PKCE: callback uses ?code=… — required with chrome.identity (hash is often stripped). */
    flowType: 'pkce',
    storage: chromeAuthStorage,
  },
});
