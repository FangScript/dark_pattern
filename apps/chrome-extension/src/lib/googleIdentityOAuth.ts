/**
 * Google OAuth via chrome.identity — safe to import from the MV3 service worker.
 * Popup/side panel should prefer messaging the worker so the auth tab survives UI close.
 */
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import { SUPABASE_SESSION_STORAGE_KEY } from './authConstants';

export type GoogleIdentityAuthResult =
  | { success: true; data?: Session | null }
  | { success: false; error: string };

async function persistSession(session: Session | null): Promise<void> {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.set({ [SUPABASE_SESSION_STORAGE_KEY]: session });
}

/** Parse PKCE (?code=) or implicit (#access_token=) OAuth redirect from chrome.identity. */
export function parseChromeIdentityOAuthRedirect(callbackUrl: string): {
  error?: string;
  code?: string;
  accessToken?: string;
  refreshToken?: string;
} {
  try {
    const u = new URL(callbackUrl);
    const err =
      u.searchParams.get('error_description') ??
      u.searchParams.get('error') ??
      undefined;
    if (err) {
      return { error: decodeURIComponent(err.replace(/\+/g, ' ')) };
    }
    const code = u.searchParams.get('code');
    if (code) {
      return { code };
    }
  } catch {
    // ignore — fall through to hash parsing
  }

  const hashPart = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : '';
  const hashParams = new URLSearchParams(hashPart);
  const errH = hashParams.get('error_description') ?? hashParams.get('error');
  if (errH) {
    return { error: errH };
  }
  const accessToken = hashParams.get('access_token') ?? undefined;
  const refreshToken = hashParams.get('refresh_token') ?? undefined;
  if (accessToken && refreshToken) {
    return { accessToken, refreshToken };
  }

  return {};
}

/**
 * Full Google sign-in using Supabase OAuth URL + chrome.identity.launchWebAuthFlow.
 */
export async function performGoogleIdentitySignIn(): Promise<GoogleIdentityAuthResult> {
  try {
    if (!chrome?.identity?.launchWebAuthFlow || !chrome?.identity?.getRedirectURL) {
      return { success: false, error: 'chrome.identity is not available in this context.' };
    }

    const redirectTo = chrome.identity.getRedirectURL('supabase-auth');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      return { success: false, error: error.message };
    }
    const authUrl = data?.url;
    if (!authUrl) {
      return { success: false, error: 'Failed to start Google OAuth flow.' };
    }

    const callbackUrl = await new Promise<string>((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl,
          interactive: true,
        },
        (responseUrl) => {
          const err = chrome.runtime?.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          if (!responseUrl) {
            reject(new Error('Google OAuth did not return a callback URL.'));
            return;
          }
          resolve(responseUrl);
        },
      );
    });

    const parsed = parseChromeIdentityOAuthRedirect(callbackUrl);
    if (parsed.error) {
      return { success: false, error: parsed.error };
    }

    // PKCE (default with flowType: 'pkce'): ?code=… — survives chrome.identity better than hash tokens.
    if (parsed.code) {
      const exchanged = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (exchanged.error) {
        return { success: false, error: exchanged.error.message };
      }
      await persistSession(exchanged.data.session ?? null);
      return { success: true, data: exchanged.data.session ?? null };
    }

    // Legacy implicit grant: #access_token=…&refresh_token=…
    if (parsed.accessToken && parsed.refreshToken) {
      const setRes = await supabase.auth.setSession({
        access_token: parsed.accessToken,
        refresh_token: parsed.refreshToken,
      });
      if (setRes.error) {
        return { success: false, error: setRes.error.message };
      }
      await persistSession(setRes.data.session ?? null);
      return { success: true, data: setRes.data.session ?? null };
    }

    return {
      success: false,
      error:
        'Google sign-in did not return an auth code or tokens. Add your chrome.identity redirect URL to Supabase Auth → URL Configuration (see chrome.identity.getRedirectURL("supabase-auth")).',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Re-hydrate the Supabase client in this JS realm from chrome.storage (startup / SW wake).
 */
export async function hydrateSupabaseSessionFromChromeStorage(): Promise<void> {
  try {
    if (!chrome?.storage?.local) return;
    const result = await chrome.storage.local.get(SUPABASE_SESSION_STORAGE_KEY);
    const stored = result[SUPABASE_SESSION_STORAGE_KEY] as Session | null | undefined;
    if (!stored?.access_token || !stored?.refresh_token) {
      return;
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error) {
      await chrome.storage.local.remove(SUPABASE_SESSION_STORAGE_KEY);
      return;
    }
    await persistSession(data.session ?? null);
  } catch {
    // best-effort only
  }
}
