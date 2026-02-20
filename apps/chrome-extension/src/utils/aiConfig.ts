/**
 * Global AI Configuration Module
 * Centralized storage and state management for AI provider settings
 */

import { getDebug } from '@darkpatternhunter/shared/logger';

const debug = getDebug('ai-config');

// Storage keys for AI configuration
export const AI_STORAGE_KEYS = {
  // Provider selection
  AI_PROVIDER: 'aiProvider', // 'openai' | 'local'

  // OpenAI Configuration
  OPENAI_API_KEY: 'openaiApiKey',

  // Local AI Configuration
  LOCAL_AI_ENABLED: 'localAiEnabled',
  LOCAL_AI_HOST: 'localAiHost',
  SELECTED_MODEL: 'selectedModel',

  // Legacy keys (for migration)
  LEGACY_LOCAL_AI_ENABLED: 'localAiEnabled',
  LEGACY_LOCAL_AI_HOST: 'localAiHost',
  LEGACY_SELECTED_MODEL: 'selectedModel',
} as const;

// Default values
export const AI_DEFAULTS = {
  AI_PROVIDER: 'openai' as const,
  LOCAL_AI_HOST: 'http://localhost:1234',
} as const;

// Provider types
export type AIProvider = 'openai' | 'local';

// AI Configuration interface
export interface AIConfig {
  provider: AIProvider;
  openaiApiKey?: string;
  localAiEnabled: boolean;
  localAiHost: string;
  selectedModel?: string;
}

/**
 * Get AI configuration from chrome.storage.local
 */
export async function getAIConfig(): Promise<AIConfig> {
  return new Promise((resolve) => {
    if (!chrome?.storage?.local) {
      debug('Chrome storage not available, using defaults');
      resolve({
        provider: AI_DEFAULTS.AI_PROVIDER,
        localAiEnabled: false,
        localAiHost: AI_DEFAULTS.LOCAL_AI_HOST,
      });
      return;
    }

    chrome.storage.local.get(
      [
        AI_STORAGE_KEYS.AI_PROVIDER,
        AI_STORAGE_KEYS.OPENAI_API_KEY,
        AI_STORAGE_KEYS.LOCAL_AI_ENABLED,
        AI_STORAGE_KEYS.LOCAL_AI_HOST,
        AI_STORAGE_KEYS.SELECTED_MODEL,
        // Legacy keys for migration
        AI_STORAGE_KEYS.LEGACY_LOCAL_AI_ENABLED,
        AI_STORAGE_KEYS.LEGACY_LOCAL_AI_HOST,
        AI_STORAGE_KEYS.LEGACY_SELECTED_MODEL,
      ],
      (result) => {
        const config: AIConfig = {
          provider:
            (result[AI_STORAGE_KEYS.AI_PROVIDER] as AIProvider) ||
            AI_DEFAULTS.AI_PROVIDER,
          openaiApiKey: result[AI_STORAGE_KEYS.OPENAI_API_KEY],
          localAiEnabled:
            result[AI_STORAGE_KEYS.LOCAL_AI_ENABLED] ||
            result[AI_STORAGE_KEYS.LEGACY_LOCAL_AI_ENABLED] ||
            false,
          localAiHost:
            result[AI_STORAGE_KEYS.LOCAL_AI_HOST] ||
            result[AI_STORAGE_KEYS.LEGACY_LOCAL_AI_HOST] ||
            AI_DEFAULTS.LOCAL_AI_HOST,
          selectedModel:
            result[AI_STORAGE_KEYS.SELECTED_MODEL] ||
            result[AI_STORAGE_KEYS.LEGACY_SELECTED_MODEL],
        };

        debug('Loaded AI config:', config);
        resolve(config);
      },
    );
  });
}

/**
 * Save AI configuration to chrome.storage.local
 */
export async function saveAIConfig(config: Partial<AIConfig>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!chrome?.storage?.local) {
      const error = new Error('Chrome storage not available');
      debug('Failed to save AI config:', error);
      reject(error);
      return;
    }

    const updates: Record<string, any> = {};

    if (config.provider !== undefined) {
      updates[AI_STORAGE_KEYS.AI_PROVIDER] = config.provider;
    }
    if (config.openaiApiKey !== undefined) {
      updates[AI_STORAGE_KEYS.OPENAI_API_KEY] = config.openaiApiKey;
    }
    if (config.localAiEnabled !== undefined) {
      updates[AI_STORAGE_KEYS.LOCAL_AI_ENABLED] = config.localAiEnabled;
    }
    if (config.localAiHost !== undefined) {
      updates[AI_STORAGE_KEYS.LOCAL_AI_HOST] = config.localAiHost;
    }
    if (config.selectedModel !== undefined) {
      updates[AI_STORAGE_KEYS.SELECTED_MODEL] = config.selectedModel;
    }

    chrome.storage.local.set(updates, () => {
      if (chrome.runtime.lastError) {
        const error = new Error(chrome.runtime.lastError.message);
        debug('Failed to save AI config:', error);
        reject(error);
      } else {
        debug('Saved AI config:', updates);
        resolve();
      }
    });
  });
}

/**
 * Get the active model configuration for AI calls
 * This returns the appropriate config based on the current provider
 */
export async function getActiveModelConfig(): Promise<{
  modelName: string;
  openaiBaseURL?: string;
  openaiApiKey: string;
  openaiExtraConfig?: Record<string, unknown>;
  modelDescription: string;
  intent: 'VQA' | 'planning' | 'grounding' | 'default';
  from: 'modelConfig' | 'env' | 'legacy-env';
}> {
  const config = await getAIConfig();

  if (
    config.provider === 'local' &&
    config.localAiEnabled &&
    config.selectedModel
  ) {
    // Use local LM Studio server
    return {
      modelName: config.selectedModel,
      openaiBaseURL: `${config.localAiHost}/v1`,
      openaiApiKey: 'lm-studio', // Dummy API key for LM Studio
      openaiExtraConfig: {
        dangerouslyAllowBrowser: true,
      },
      modelDescription: `Local LM Studio model: ${config.selectedModel}`,
      intent: 'VQA',
      from: 'modelConfig',
    };
  }

  // Use default OpenAI configuration
  // This will be handled by the globalModelConfigManager
  return {
    modelName: 'gpt-4o', // Default fallback
    openaiApiKey: config.openaiApiKey || '',
    modelDescription: 'OpenAI GPT-4o',
    intent: 'VQA',
    from: 'modelConfig',
  };
}

/**
 * Check if local AI server is reachable
 */
export async function isLocalServerReachable(): Promise<boolean> {
  const config = await getAIConfig();

  if (!config.localAiEnabled) {
    return false;
  }

  try {
    const response = await fetch(`${config.localAiHost}/v1/models`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Migrate legacy settings to new format
 */
export async function migrateLegacySettings(): Promise<void> {
  const config = await getAIConfig();

  // If we have legacy settings but no provider, set provider based on legacy settings
  if (!config.provider && (config.localAiEnabled || config.openaiApiKey)) {
    const newProvider: AIProvider = config.localAiEnabled ? 'local' : 'openai';
    await saveAIConfig({ provider: newProvider });
    debug('Migrated legacy settings to provider:', newProvider);
  }
}
