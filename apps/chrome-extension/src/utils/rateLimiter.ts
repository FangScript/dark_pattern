/**
 * Central Rate Limiter Module
 * =======================
 * Handles all AI API rate limiting in one place:
 * - Request queue (ensures one at a time)
 * - Provider-specific delays
 * - Auto-retry with exponential backoff on 429
 * - User feedback for wait times
 */

import { getDebug } from '@darkpatternhunter/shared/logger';
import { getAIConfig } from './aiConfig';

const debug = getDebug('rate-limiter');

// ── Types ─────────────────────────────────────────────────────────────────

export interface RateLimiterConfig {
  /** Delay between requests in ms */
  delayMs: number;
  /** Max retries on 429 errors */
  maxRetries: number;
  /** Base delay for retry backoff */
  retryBaseMs: number;
}

export interface RateLimitState {
  isProcessing: boolean;
  lastRequestTime: number;
  nextRequestTime: number;
  retryCount: number;
  isRetrying: boolean;
  retryDelayRemaining: number;
}

// ── Default Configs ─────────────────────────────────────────────────────────

const PROVIDER_CONFIGS: Record<string, RateLimiterConfig> = {
  // OpenRouter free models - strict rate limits (10-20 req/min)
  // 6000ms = 6 seconds = max 10 calls/min = safe buffer
  openrouter_free: {
    delayMs: 6000, // 6 seconds between requests
    maxRetries: 3,
    retryBaseMs: 6000, // 6s, 12s, 24s backoff
  },
  // OpenRouter paid models - moderate limits
  openrouter_paid: {
    delayMs: 1000,
    maxRetries: 3,
    retryBaseMs: 2000,
  },
  // OpenAI - depends on plan
  openai: {
    delayMs: 1000,
    maxRetries: 3,
    retryBaseMs: 2000,
  },
  // Local (LM Studio) - no limits
  local: {
    delayMs: 300,
    maxRetries: 1,
    retryBaseMs: 1000,
  },
};

// ── Agent Scan Limits (viewports & interactions) ────────────────────────────

export interface AgentLimits {
  /** Maximum number of viewports to capture per page */
  maxViewports: number;
  /** Maximum interactive elements to click/analyze per page */
  maxInteractions: number;
}

const AGENT_LIMITS: Record<string, AgentLimits> = {
  // OpenRouter FREE - reduced for strict rate limits (10-20 req/min)
  // 5 viewports + 3 interactions = ~8 calls max = fits in 1 min
  openrouter_free: {
    maxViewports: 5,
    maxInteractions: 3,
  },
  // OpenRouter PAID - full power
  openrouter_paid: {
    maxViewports: 10,
    maxInteractions: 5,
  },
  // OpenAI - full power
  openai: {
    maxViewports: 10,
    maxInteractions: 5,
  },
  // Local (LM Studio) - full power
  local: {
    maxViewports: 10,
    maxInteractions: 5,
  },
};

/**
 * Get agent scan limits based on current provider
 * Only reduces limits for OpenRouter FREE tier
 */
export async function getAgentLimits(): Promise<AgentLimits> {
  try {
    const cfg = await getAIConfig();

    if (cfg.provider === 'local') {
      return AGENT_LIMITS.local;
    }

    if (cfg.provider === 'openai') {
      return AGENT_LIMITS.openai;
    }

    if (cfg.provider === 'openrouter') {
      const model = cfg.openrouterModel || '';
      if (model.includes(':free')) {
        return AGENT_LIMITS.openrouter_free;
      }
      return AGENT_LIMITS.openrouter_paid;
    }

    // Default to openrouter_free for safety
    return AGENT_LIMITS.openrouter_free;
  } catch {
    return AGENT_LIMITS.openrouter_free;
  }
}

// ── State ────────────────────────────────────────────────────────────────

let state: RateLimitState = {
  isProcessing: false,
  lastRequestTime: 0,
  nextRequestTime: 0,
  retryCount: 0,
  isRetrying: false,
  retryDelayRemaining: 0,
};

const requestQueue: Array<() => Promise<void>> = [];

// ── Helper Functions ─────────────────────────────────────────────────

function getConfigForProvider(): RateLimiterConfig {
  const config = PROVIDER_CONFIGS;
  const defaults = config.openrouter_free;

  // Synchronous version for quick checks
  return defaults;
}

async function getProviderDelayMs(): Promise<number> {
  try {
    const cfg = await getAIConfig();

    if (cfg.provider === 'local') {
      return PROVIDER_CONFIGS.local.delayMs;
    }

    if (cfg.provider === 'openai') {
      return PROVIDER_CONFIGS.openai.delayMs;
    }

    if (cfg.provider === 'openrouter') {
      const model = cfg.openrouterModel || '';
      if (model.includes(':free')) {
        return PROVIDER_CONFIGS.openrouter_free.delayMs;
      }
      return PROVIDER_CONFIGS.openrouter_paid.delayMs;
    }

    return defaults.delayMs;
  } catch {
    return 5000;
  }
}

// ── Core Functions ────────────────────────────────────────────────────────

/**
 * Wait for rate limit delay if needed
 * Call this before making any AI request
 */
export async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - state.lastRequestTime;
  const delay = await getProviderDelayMs();

  if (timeSinceLastRequest < delay) {
    const waitTime = delay - timeSinceLastRequest;
    debug(`Rate limiting: waiting ${waitTime}ms before request`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  state.lastRequestTime = Date.now();
  state.nextRequestTime = state.lastRequestTime + delay;
}

/**
 * Check if currently rate limited
 */
export function isRateLimited(): boolean {
  return state.isProcessing || Date.now() < state.nextRequestTime;
}

/**
 * Get time until next request allowed (in seconds, 0 if ready)
 */
export function getTimeUntilNextRequest(): number {
  const remaining = state.nextRequestTime - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
}

/**
 * Get current state for UI display
 */
export function getRateLimitState(): RateLimitState {
  return { ...state };
}

/**
 * Execute an AI call with automatic rate limiting and retry on 429
 * This is the main function to use instead of direct AI calls
 */
export async function executeWithRateLimit<T>(
  fn: () => Promise<T>,
  options?: {
    /** Custom retry config (overrides provider default) */
    maxRetries?: number;
    retryBaseMs?: number;
    /** Label for logging */
    label?: string;
  },
): Promise<T> {
  const label = options?.label || 'AI request';
  const maxRetries = options?.maxRetries ?? 3;
  const retryBaseMs = options?.retryBaseMs ?? 5000;

  // First, wait for rate limit
  await waitForRateLimit();

  state.isProcessing = true;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      debug(`[${label}] Attempt ${attempt}/${maxRetries + 1}`);

      if (attempt > 1) {
        // Exponential backoff: 5s, 10s, 20s
        const backoffDelay = retryBaseMs * Math.pow(2, attempt - 2);
        state.retryDelayRemaining = Math.ceil(backoffDelay / 1000);
        state.isRetrying = true;

        debug(`[${label}] Rate limited, retrying in ${backoffDelay}ms (attempt ${attempt})`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));

        state.lastRequestTime = Date.now();
        state.isRetrying = false;
        state.retryDelayRemaining = 0;
      }

      const result = await fn();

      // Success! Reset retry count
      state.retryCount = 0;
      state.isProcessing = false;

      debug(`[${label}] Success on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error as Error;
      const errorMessage = lastError.message.toLowerCase();

      // Check if it's a rate limit error (429)
      const isRateLimitError =
        errorMessage.includes('429') ||
        errorMessage.includes('rate limit') ||
        errorMessage.includes('too many requests');

      if (!isRateLimitError) {
        // Not a rate limit error, don't retry
        state.isProcessing = false;
        throw lastError;
      }

      // It's a 429 - will retry with backoff
      state.retryCount = attempt;

      debug(`[${label}] Rate limited (429), will retry...`);

      // If this was the last attempt, throw
      if (attempt > maxRetries) {
        state.isProcessing = false;
        state.isRetrying = false;
        throw new Error(
          `[${label}] Rate limit exceeded after ${maxRetries} retries. Please wait a moment and try again.`,
        );
      }
    }
  }

  state.isProcessing = false;
  throw lastError;
}

/**
 * Queue a request to be processed in order
 * Useful when you want to batch multiple operations
 */
export async function queueRequest<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await executeWithRateLimit(fn);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    // Process queue if not already processing
    processQueue();
  });
}

async function processQueue(): Promise<void> {
  if (requestQueue.length === 0) return;

  const nextFn = requestQueue.shift();
  if (nextFn) {
    await nextFn();
  }

  // Process next in queue
  if (requestQueue.length > 0) {
    processQueue();
  }
}

/**
 * Reset rate limiter state (useful for testing)
 */
export function resetRateLimiter(): void {
  state = {
    isProcessing: false,
    lastRequestTime: 0,
    nextRequestTime: 0,
    retryCount: 0,
    isRetrying: false,
    retryDelayRemaining: 0,
  };
}

// Keep default import for backwards compatibility
const defaults = PROVIDER_CONFIGS.openrouter_free;