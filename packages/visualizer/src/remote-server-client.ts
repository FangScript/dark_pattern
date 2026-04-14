import { PLAYGROUND_SERVER_PORT } from '@darkpatternhunter/shared/constants';

/** Default HTTP origin for the automation server when not derived from `window.location`. */
export function getDefaultRemoteServerUrl(): string {
  if (typeof window !== 'undefined' && window.location?.protocol?.includes('http')) {
    return window.location.origin;
  }
  return `http://localhost:${PLAYGROUND_SERVER_PORT}`;
}

/** GET `/status` — same contract as the former remote playground adapter. */
export async function checkRemoteAutomationServer(
  serverUrl = getDefaultRemoteServerUrl(),
): Promise<boolean> {
  if (!serverUrl) return false;
  try {
    const res = await fetch(`${serverUrl}/status`);
    return res.status === 200;
  } catch {
    return false;
  }
}

/** POST `/config` with `{ aiConfig }` — same contract as the former remote adapter. */
export async function postRemoteAutomationConfig(
  aiConfig: Record<string, unknown>,
  serverUrl = getDefaultRemoteServerUrl(),
): Promise<void> {
  if (!serverUrl) {
    throw new Error('Server URL not configured');
  }
  const response = await fetch(`${serverUrl}/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aiConfig }),
  });
  if (!response.ok) {
    throw new Error(`Failed to override server config: ${response.statusText}`);
  }
}
