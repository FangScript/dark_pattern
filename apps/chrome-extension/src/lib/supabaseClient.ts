import { createClient } from '@supabase/supabase-js';

// In MV3 we can’t safely ship a service_role key.
// Use ONLY the anon key and RLS on the Supabase side.
// These values should be injected at build time (env, rsbuild define, etc.).
const SUPABASE_URL =
  (process.env.REACT_APP_SUPABASE_URL as string | undefined) ??
  (process.env.SUPABASE_URL as string | undefined) ??
  (globalThis as any).REACT_APP_SUPABASE_URL ??
  (globalThis as any).SUPABASE_URL ??
  'https://zwyumurkgzfwgegtokow.supabase.co' ??
  '';
const SUPABASE_ANON_KEY =
  (process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY as string | undefined) ??
  (process.env.SUPABASE_ANON_KEY as string | undefined) ??
  (globalThis as any).REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  (globalThis as any).SUPABASE_ANON_KEY ??
  'sb_publishable_WOu5zH6wwC0hEuJ5llU-Ag_Elni7BTW' ??
  '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabaseClient] SUPABASE_URL / SUPABASE_ANON_KEY are not configured. Auth calls will fail until they are set.',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // We handle persistence explicitly via chrome.storage.local
    persistSession: false,
    autoRefreshToken: true,
  },
});

