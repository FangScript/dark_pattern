/** chrome.storage.local key — keep in sync everywhere session is persisted */
export const SUPABASE_SESSION_STORAGE_KEY = 'supabaseSession';

/** Service worker ↔ extension page messaging */
export const AUTH_RUNTIME_MESSAGE = {
  GOOGLE_SIGN_IN: 'DPH_AUTH_GOOGLE_SIGN_IN',
} as const;
