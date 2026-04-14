import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'supabaseSession';

type AuthResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type AppRole = 'admin' | 'user' | 'guest';

async function saveSessionToChrome(session: Session | null): Promise<void> {
  if (!chrome?.storage?.local) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

async function getStoredSessionFromChrome(): Promise<Session | null> {
  if (!chrome?.storage?.local) return null;
  const result = await chrome.storage.local.get([STORAGE_KEY]);
  return (result[STORAGE_KEY] as Session | null) ?? null;
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

export async function signUp(email: string, password: string): Promise<AuthResult<User>> {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { success: false, error: error.message };
    }
    if (data.session) {
      await saveSessionToChrome(data.session);
    }
    return { success: true, data: data.user ?? undefined };
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

export async function signInWithGoogle(): Promise<AuthResult<Session | null>> {
  try {
    // Prefer Chrome Identity OAuth flow in extension context.
    if (chrome?.identity?.launchWebAuthFlow) {
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

      const hash = callbackUrl.includes('#') ? callbackUrl.split('#')[1] : '';
      const params = new URLSearchParams(hash);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken) {
        return { success: false, error: 'Google OAuth token exchange failed.' };
      }

      const setRes = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setRes.error) {
        return { success: false, error: setRes.error.message };
      }
      await saveSessionToChrome(setRes.data.session ?? null);
      return { success: true, data: setRes.data.session ?? null };
    }

    // Fallback for non-extension context.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
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
      return { success: false, error: error.message };
    }

    const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
    const roleNameRaw = (first as any)?.roles?.role_name;
    const roleName =
      roleNameRaw === 'admin' || roleNameRaw === 'user' ? roleNameRaw : 'user';
    return { success: true, data: roleName };
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) };
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

