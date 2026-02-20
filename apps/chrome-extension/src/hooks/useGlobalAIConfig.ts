/**
 * Global AI Configuration Hook
 * Provides centralized AI configuration state and ready state for all modules
 * Reads directly from chrome.storage.local and provides reactive updates
 */

import { getDebug } from '@darkpatternhunter/shared/logger';
import { useCallback, useEffect, useState } from 'react';
import {
  type AIConfig,
  type AIProvider,
  getAIConfig,
  isLocalServerReachable,
  saveAIConfig,
} from '../utils/aiConfig';

const debug = getDebug('use-global-ai-config');

/**
 * Ready state for AI configuration
 */
export interface AIReadyState {
  isReady: boolean;
  provider: AIProvider | null;
  hasApiKey: boolean;
  hasLocalModel: boolean;
  isLocalServerReachable: boolean;
  errorMessage: string | null;
}

/**
 * Global AI configuration hook
 * Provides centralized AI configuration and ready state for all modules
 *
 * @returns Object containing config, ready state, and update functions
 */
export function useGlobalAIConfig() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [readyState, setReadyState] = useState<AIReadyState>({
    isReady: false,
    provider: null,
    hasApiKey: false,
    hasLocalModel: false,
    isLocalServerReachable: false,
    errorMessage: null,
  });
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Load configuration from chrome.storage.local
   */
  const loadConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedConfig = await getAIConfig();
      setConfig(loadedConfig);

      // Determine ready state
      const newReadyState: AIReadyState = {
        isReady: false,
        provider: loadedConfig.provider,
        hasApiKey: !!loadedConfig.openaiApiKey,
        hasLocalModel: !!loadedConfig.selectedModel,
        isLocalServerReachable: false,
        errorMessage: null,
      };

      // Check if OpenAI is configured
      if (loadedConfig.provider === 'openai') {
        if (!loadedConfig.openaiApiKey) {
          newReadyState.errorMessage = 'OpenAI API key not configured';
        } else {
          newReadyState.isReady = true;
        }
      }
      // Check if Local AI is configured
      else if (loadedConfig.provider === 'local') {
        if (!loadedConfig.localAiEnabled) {
          newReadyState.errorMessage = 'Local AI is not enabled';
        } else if (!loadedConfig.selectedModel) {
          newReadyState.errorMessage = 'No model selected';
        } else {
          // Check if local server is reachable
          const isReachable = await isLocalServerReachable();
          newReadyState.isLocalServerReachable = isReachable;
          if (!isReachable) {
            newReadyState.errorMessage = 'Local AI server not reachable';
          } else {
            newReadyState.isReady = true;
          }
        }
      }

      setReadyState(newReadyState);
      debug('Loaded AI config:', loadedConfig);
      debug('Ready state:', newReadyState);
    } catch (error) {
      console.error('Failed to load AI config:', error);
      setReadyState({
        isReady: false,
        provider: null,
        hasApiKey: false,
        hasLocalModel: false,
        isLocalServerReachable: false,
        errorMessage: 'Failed to load AI configuration',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Update configuration
   */
  const updateConfig = useCallback(
    async (updates: Partial<AIConfig>) => {
      try {
        await saveAIConfig(updates);
        // Reload config after update
        await loadConfig();
      } catch (error) {
        console.error('Failed to update AI config:', error);
      }
    },
    [loadConfig],
  );

  /**
   * Refresh configuration (reload from storage)
   */
  const refreshConfig = useCallback(async () => {
    await loadConfig();
  }, [loadConfig]);

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Listen for storage changes to reactively update
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local') {
        debug('Storage changed, reloading config:', changes);
        loadConfig();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [loadConfig]);

  return {
    config,
    readyState,
    isLoading,
    updateConfig,
    refreshConfig,
  };
}

/**
 * Hook to get just the ready state (lighter weight)
 */
export function useAIReadyState(): AIReadyState {
  const [readyState, setReadyState] = useState<AIReadyState>({
    isReady: false,
    provider: null,
    hasApiKey: false,
    hasLocalModel: false,
    isLocalServerReachable: false,
    errorMessage: null,
  });

  const checkReadyState = useCallback(async () => {
    try {
      const loadedConfig = await getAIConfig();

      const newReadyState: AIReadyState = {
        isReady: false,
        provider: loadedConfig.provider,
        hasApiKey: !!loadedConfig.openaiApiKey,
        hasLocalModel: !!loadedConfig.selectedModel,
        isLocalServerReachable: false,
        errorMessage: null,
      };

      if (loadedConfig.provider === 'openai') {
        if (!loadedConfig.openaiApiKey) {
          newReadyState.errorMessage = 'OpenAI API key not configured';
        } else {
          newReadyState.isReady = true;
        }
      } else if (loadedConfig.provider === 'local') {
        if (!loadedConfig.localAiEnabled) {
          newReadyState.errorMessage = 'Local AI is not enabled';
        } else if (!loadedConfig.selectedModel) {
          newReadyState.errorMessage = 'No model selected';
        } else {
          const isReachable = await isLocalServerReachable();
          newReadyState.isLocalServerReachable = isReachable;
          if (!isReachable) {
            newReadyState.errorMessage = 'Local AI server not reachable';
          } else {
            newReadyState.isReady = true;
          }
        }
      }

      setReadyState(newReadyState);
    } catch (error) {
      console.error('Failed to check AI ready state:', error);
    }
  }, []);

  useEffect(() => {
    checkReadyState();

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName === 'local') {
        checkReadyState();
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [checkReadyState]);

  return readyState;
}
