import type { Session, User } from '@supabase/supabase-js';
import { AUTH_RUNTIME_MESSAGE, SUPABASE_SESSION_STORAGE_KEY } from './authConstants';
import { parseChromeIdentityOAuthRedirect, performGoogleIdentitySignIn } from './googleIdentityOAuth';
import { supabase } from './supabaseClient';

type AuthResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type AppRole = 'admin' | 'user' | 'guest';

type EmailLinkFlowType = 'magiclink' | 'recovery' | 'unknown';

function getExtensionRedirectUrl(): string | undefined {
  if (!chrome?.identity?.getRedirectURL) return undefined;
  return chrome.identity.getRedirectURL('supabase-auth');
}

/**
 * Where Supabase sends **email** flows (signup confirm, magic link, password recovery).
 * - Prefer `REACT_APP_SUPABASE_EMAIL_REDIRECT_URL` when you host an HTTPS callback page.
 * - Otherwise use the chrome.identity URL (same path as Google OAuth is fine). That URL
 *   must be listed under Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getEmailActionRedirectUrl(): string | undefined {
  const fromEnv =
    (typeof process !== 'undefined' &&
      (process.env.REACT_APP_SUPABASE_EMAIL_REDIRECT_URL?.trim() ||
        process.env.SUPABASE_EMAIL_REDIRECT_URL?.trim())) ||
    '';
  if (fromEnv) {
    return fromEnv;
  }
  return getExtensionRedirectUrl();
}

async function saveSessionToChrome(session: Session | null): Promise<void> {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.set({ [SUPABASE_SESSION_STORAGE_KEY]: session });
}

async function getStoredSessionFromChrome(): Promise<Session | null> {
  if (!chrome?.storage?.local) return null;
  const result = await chrome.storage.local.get([SUPABASE_SESSION_STORAGE_KEY]);
  return (result[SUPABASE_SESSION_STORAGE_KEY] as Session | null) ?? null;
}

export async function restoreSession(): Promise<AuthResult<Session | null>> {
  try {
    const stored = await getStoredSessionFromChrome();
    if (!stored) {
      return { success: true, data: null };
    }
    if (!stored.access_token || !stored.refresh_token) {
      await saveSessionToChrome(null);
      return { success: true, data: null };
    }
    const { data, error } = await supabase.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
    if (error) {
      // Clear broken/expired local session so next login can proceed cleanly.
      await saveSessionToChrome(null);
      return { success: false, error: error.message };
    }
    await saveSessionToChrome(data.session ?? null);
    return { success: true, data: data.session ?? null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function signUp(
  email: string,
  password: string,
): Promise<AuthResult<User> & { needsEmailConfirmation?: boolean }> {
  try {
    const emailRedirectTo = getEmailActionRedirectUrl();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data.session) {
      await saveSessionToChrome(data.session);
    }
    const needsEmailConfirmation = Boolean(data.user && !data.session);
    return {
      success: true,
      data: data.user ?? undefined,
      needsEmailConfirmation,
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function signIn(email: string, password: string): Promise<AuthResult<Session>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data.session) {
      await saveSessionToChrome(data.session);
    }
    return { success: true, data: data.session ?? undefined };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function requestPasswordReset(email: string): Promise<AuthResult<null>> {
  try {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return { success: false, error: 'Email is required.' };
    }

    const redirectTo = getEmailActionRedirectUrl();
    if (!redirectTo) {
      return {
        success: false,
        error:
          'No redirect URL for password recovery. Open the extension in Chrome (not a plain web page) or set REACT_APP_SUPABASE_EMAIL_REDIRECT_URL.',
      };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function sendMagicLink(email: string): Promise<AuthResult<null>> {
  try {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      return { success: false, error: 'Email is required.' };
    }
    const emailRedirectTo = getEmailActionRedirectUrl();
    if (!emailRedirectTo) {
      return {
        success: false,
        error:
          'No email redirect URL. Use the extension UI in Chrome or set REACT_APP_SUPABASE_EMAIL_REDIRECT_URL.',
      };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo,
      },
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

/** Try Supabase’s URL parser (covers additional email-link shapes across versions). */
async function tryConsumeAuthViaGetSessionFromUrl(
  callbackUrl: string,
  flowType: EmailLinkFlowType,
): Promise<AuthResult<{ flowType: EmailLinkFlowType; session: Session | null }> | null> {
  const auth = supabase.auth as {
    getSessionFromUrl?: (opts: { url: string }) => Promise<{
      data: { session: Session | null };
      error: { message: string } | null;
    }>;
  };
  if (typeof auth.getSessionFromUrl !== 'function') {
    return null;
  }
  try {
    const { data, error } = await auth.getSessionFromUrl({ url: callbackUrl });
    if (error) {
      return { success: false, error: error.message };
    }
    if (!data?.session) {
      return null;
    }
    await saveSessionToChrome(data.session);
    return {
      success: true,
      data: { flowType, session: data.session },
    };
  } catch {
    return null;
  }
}

export async function consumeAuthCallbackUrl(
  callbackUrl: string,
): Promise<AuthResult<{ flowType: EmailLinkFlowType; session: Session | null }>> {
  try {
    const hashPart = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : '';
    const hashParams = new URLSearchParams(hashPart);
    let queryParams: URLSearchParams;
    try {
      queryParams = new URL(callbackUrl).searchParams;
    } catch {
      queryParams = new URLSearchParams();
    }

    const flowTypeRaw = hashParams.get('type') ?? queryParams.get('type');
    const flowType: EmailLinkFlowType =
      flowTypeRaw === 'recovery' || flowTypeRaw === 'magiclink'
        ? flowTypeRaw
        : 'unknown';

    const parsed = parseChromeIdentityOAuthRedirect(callbackUrl);
    if (parsed.error) {
      return { success: false, error: parsed.error };
    }

    if (parsed.code) {
      const exchanged = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (exchanged.error) {
        const fallback = await tryConsumeAuthViaGetSessionFromUrl(callbackUrl, flowType);
        if (fallback?.success) {
          return fallback;
        }
        return { success: false, error: exchanged.error.message };
      }
      await saveSessionToChrome(exchanged.data.session ?? null);
      return {
        success: true,
        data: { flowType, session: exchanged.data.session ?? null },
      };
    }

    const accessToken = parsed.accessToken ?? hashParams.get('access_token') ?? queryParams.get('access_token');
    const refreshToken =
      parsed.refreshToken ??
      hashParams.get('refresh_token') ??
      queryParams.get('refresh_token');
    if (!accessToken || !refreshToken) {
      const fallback = await tryConsumeAuthViaGetSessionFromUrl(callbackUrl, flowType);
      if (fallback) {
        return fallback;
      }
      return {
        success: false,
        error: 'Missing auth code or tokens in callback URL.',
      };
    }

    const setRes = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (setRes.error) {
      return { success: false, error: setRes.error.message };
    }
    await saveSessionToChrome(setRes.data.session ?? null);
    return {
      success: true,
      data: { flowType, session: setRes.data.session ?? null },
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function updatePassword(newPassword: string): Promise<AuthResult<User | null>> {
  try {
    if (!newPassword) {
      return { success: false, error: 'New password is required.' };
    }
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: data.user ?? null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

/**
 * Extension pages (popup / side panel): run Google OAuth in the **service worker** so the
 * auth window is not tied to a short-lived UI. Then restore the session into this realm.
 */
function shouldDelegateGoogleOAuthToServiceWorker(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime?.sendMessage) &&
    typeof window !== 'undefined'
  );
}

export async function signInWithGoogle(): Promise<AuthResult<Session | null>> {
  try {
    if (shouldDelegateGoogleOAuthToServiceWorker()) {
      const bgResult = await new Promise<AuthResult<Session | null>>((resolve) => {
        chrome.runtime.sendMessage(
          { type: AUTH_RUNTIME_MESSAGE.GOOGLE_SIGN_IN },
          (response: AuthResult<Session | null> | undefined) => {
            const err = chrome.runtime.lastError;
            if (err) {
              resolve({ success: false, error: err.message });
              return;
            }
            resolve(
              response ?? {
                success: false,
                error: 'No response from extension background.',
              },
            );
          },
        );
      });

      if (!bgResult.success) {
        return bgResult;
      }

      const restored = await restoreSession();
      if (!restored.success) {
        return {
          success: false,
          error:
            restored.error ??
            'Session was saved by the background worker but could not be restored here.',
        };
      }
      return { success: true, data: restored.data ?? null };
    }

    // No extension UI (e.g. service worker): run identity flow in this context.
    const direct = await performGoogleIdentitySignIn();
    if (direct.success) {
      return { success: true, data: direct.data ?? null };
    }

    // Plain web / tests — no chrome.identity; use normal browser redirect OAuth.
    const extensionLike =
      typeof chrome !== 'undefined' && typeof (chrome as { runtime?: unknown }).runtime !== 'undefined';
    if (!extensionLike) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
      });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data: null };
    }

    return { success: false, error: direct.error };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

export async function signOut(): Promise<AuthResult<null>> {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { success: false, error: error.message };
    }
    await saveSessionToChrome(null);
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function getSession(): Promise<AuthResult<Session | null>> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: data.session };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function getCurrentUser(): Promise<AuthResult<User | null>> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: data.user ?? null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
  }
}

export async function getUserRole(): Promise<AuthResult<AppRole>> {
  try {
    const userRes = await getCurrentUser();
    if (!userRes.success) {
      return { success: false, error: userRes.error };
    }
    const user = userRes.data;
    if (!user) {
      return { success: true, data: 'guest' };
    }

    const metaRole =
      (user.app_metadata as Record<string, any> | undefined)?.role ??
      (user.user_metadata as Record<string, any> | undefined)?.role;
    if (metaRole === 'admin' || metaRole === 'user') {
      return { success: true, data: metaRole };
    }

    // Recommended DB mapping:
    // user_roles(user_id, role_id) -> roles(role_name)
    const { data, error } = await supabase
      .from('user_roles')
      .select('roles(role_name)')
      .eq('user_id', user.id)
      .limit(1);

    if (error) {
      // If role-table lookup fails (commonly due to RLS permissions),
      // keep authenticated users in the default "user" role.
      return { success: true, data: 'user' };
    }

    const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const roleNameRaw = (first as any)?.roles?.role_name;
    const roleName =
      roleNameRaw === 'admin' || roleNameRaw === 'user' ? roleNameRaw : 'user';
    return { success: true, data: roleName };
  } catch (err: any) {
    // Never downgrade a signed-in user to guest because of lookup failures.
    // Caller treats failures as guest, which hides user features.
    return { success: true, data: 'user' };
  }
}

// ── Auth state listener: keep chrome.storage in sync ───────────────────────────

supabase.auth.onAuthStateChange(async (event, session) => {
  try {
    // In extension popup lifecycle, Supabase may emit INITIAL_SESSION with null
    // before we manually restore from chrome.storage. Ignoring this prevents
    // wiping a valid persisted session on every popup open.
    if (event === 'INITIAL_SESSION' && !session) {
      return;
    }
    await saveSessionToChrome(session ?? null);
  } catch {
    // best-effort only
  }
});

