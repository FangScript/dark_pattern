import { PlaygroundSDK } from '@darkpatternhunter/playground';
import {
  UniversalPlayground,
  createStorageProvider,
  detectBestStorageType,
} from '@darkpatternhunter/visualizer';
import { useEnvConfig } from '@darkpatternhunter/visualizer';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import './index.less';

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

// Browser Extension Playground Component using Universal Playground
export function BrowserExtensionPlayground({
  getAgent,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  const { forceSameTabNavigation } = useEnvConfig((state) => ({
    forceSameTabNavigation: state.forceSameTabNavigation,
  }));

  // Check if run button should be enabled - but DON'T call getAgent yet
  const { config } = useEnvConfig();
  const runEnabled = !!getAgent && Object.keys(config || {}).length >= 1;

  // Create storage provider for persistence - use IndexedDB for better capacity
  const storage = useMemo(() => {
    const bestStorageType = detectBestStorageType();
    console.log(`Chrome Extension Playground using ${bestStorageType} storage`);
    return createStorageProvider(
      bestStorageType,
      'chrome-extension-playground',
    );
  }, []);

  // Simplified agent tracking using a single ref for both agent and SDK
  const agentInfoRef = useRef<{ agent: any; sdk: PlaygroundSDK } | null>(null);

  // Helper function to detach all debuggers
  const detachAllDebuggers = async () => {
    try {
      const targets = await chrome.debugger.getTargets();
      for (const target of targets) {
        if (
          target.attached &&
          target.tabId &&
          typeof target.tabId === 'number'
        ) {
          try {
            await chrome.debugger.detach({ tabId: target.tabId });
          } catch (e) {
            // Ignore errors, debugger might already be detached or tab closed
            if (chrome.runtime.lastError) {
              // Suppress "No tab id to detach" errors
              const errorMessage = chrome.runtime.lastError.message || '';
              if (!errorMessage.includes('No tab id')) {
                console.warn(
                  'Debugger detach error:',
                  chrome.runtime.lastError.message,
                );
              }
            }
          }
        }
      }
    } catch (e) {
      // Suppress "No tab id to detach" errors
      const errorMessage = e?.message || String(e);
      if (!errorMessage.includes('No tab id')) {
        console.warn('Failed to detach debuggers:', e);
      }
    }
  };

  // Helper to cleanup agent
  const cleanupAgent = useCallback((agent: any) => {
    if (agent) {
      try {
        agent.page?.destroy?.();
        agent.destroy?.();
      } catch (error) {
        console.warn('Failed to cleanup agent:', error);
      }
    }
  }, []);

  // Create SDK when needed
  const playgroundSDK = useMemo(() => {
    if (!runEnabled) {
      return null;
    }

    try {
      const agent = getAgent(forceSameTabNavigation);
      if (!agent) {
        throw new Error('Please configure AI settings first');
      }

      // Check if we can reuse existing SDK
      if (agentInfoRef.current && agentInfoRef.current.agent === agent) {
        return agentInfoRef.current.sdk;
      }

      // Need to create new SDK
      // Clean up previous agent if it exists
      if (agentInfoRef.current) {
        cleanupAgent(agentInfoRef.current.agent);
      }

      // Detach all debuggers before creating new SDK
      detachAllDebuggers().then(() => {
        console.log('[DEBUG] Detached all debuggers before creating SDK');
      });

      // Create new SDK
      const newSdk = new PlaygroundSDK({
        type: 'local-execution',
        agent: agent,
      });

      // Store the new agent and SDK
      agentInfoRef.current = { agent, sdk: newSdk };
      return newSdk;
    } catch (error) {
      console.error('Failed to initialize PlaygroundSDK:', error);
      return null;
    }
  }, [runEnabled, getAgent, forceSameTabNavigation, cleanupAgent]);

  // Progress callback handling is now managed in usePlaygroundExecution hook
  // No need to override onProgressUpdate here

  // Context provider - delay creation until actually needed
  const contextProvider = useMemo(() => {
    if (!showContextPreview) {
      return undefined;
    }

    // Return a lazy context provider that only creates agent when needed
    return {
      async getUIContext() {
        try {
          const agent = getAgent(forceSameTabNavigation);
          if (!agent) {
            throw new Error('Please configure AI settings first');
          }
          return agent.page.screenshot();
        } catch (error) {
          console.warn('Failed to get UI context:', error);
          // Return null context instead of throwing to allow UI to initialize
          return null;
        }
      },
      async refreshContext() {
        try {
          const agent = getAgent(forceSameTabNavigation);
          if (!agent) {
            throw new Error('Please configure AI settings first');
          }
          return agent.page.screenshot();
        } catch (error) {
          console.warn('Failed to refresh context:', error);
          // Return null context instead of throwing to allow UI to initialize
          return null;
        }
      },
    };
  }, [showContextPreview, getAgent, forceSameTabNavigation]);

  // Cleanup effect to detach chrome.debugger when component unmounts
  useEffect(() => {
    return () => {
      // When component unmounts, clean up agent and detach all debuggers
      if (agentInfoRef.current) {
        cleanupAgent(agentInfoRef.current.agent);
        agentInfoRef.current = null;
      }
    };
  }, [cleanupAgent]);

  return (
    <UniversalPlayground
      playgroundSDK={playgroundSDK}
      storage={storage}
      contextProvider={contextProvider}
      config={{
        showContextPreview,
        layout: 'vertical',
        showVersionInfo: false,
        enableScrollToBottom: true,
        showEnvConfigReminder: true,
      }}
      branding={{
        title: 'Playground',
      }}
      className="chrome-extension-playground"
      dryMode={dryMode}
    />
  );
}

export default BrowserExtensionPlayground;
