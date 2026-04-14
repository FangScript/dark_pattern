/// <reference types="chrome" />
import {
  DatabaseOutlined,
  MenuOutlined,
  SafetyOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  EnvConfig,
  globalThemeConfig,
  safeOverrideAIConfig,
  useEnvConfig,
} from '@darkpatternhunter/visualizer';
import { ConfigProvider, Dropdown, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { getUserRole, restoreSession, type AppRole } from '../../lib/auth';
import DatasetCollection from '../dataset-collection';
import LiveGuard from '../live-guard';
import { Settings } from '../settings';
import './index.less';
import {
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
  MIDSCENE_VL_MODE,
  OPENAI_API_KEY,
} from '@darkpatternhunter/shared/env';
const STORAGE_KEY = 'dph-popup-mode';
type PopupMode =
  | 'dataset'
  | 'live-guard'
  | 'settings';
const ADMIN_MODES: PopupMode[] = [
  'dataset',
  'live-guard',
  'settings',
];
const USER_MODES: PopupMode[] = ['live-guard', 'settings'];

function getAllowedModes(role: AppRole): PopupMode[] {
  return role === 'admin' ? ADMIN_MODES : USER_MODES;
}

export function PlaygroundPopup() {
  const { setPopupTab, config } = useEnvConfig();
  const roleSyncInFlight = useRef(false);
  const [role, setRole] = useState<AppRole>('guest');
  const [currentMode, setCurrentMode] = useState<PopupMode>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'playground' || raw === 'bridge' || raw === 'recorder') {
      return 'dataset';
    }
    return (raw as PopupMode) || 'dataset';
  });

  // Sync popupTab with saved mode on mount
  useEffect(() => {
    if (currentMode !== 'dataset' && currentMode !== 'settings') {
      setPopupTab(currentMode);
    }
  }, [currentMode]);

  useEffect(() => {
    const loadRole = async (restore = true) => {
      if (roleSyncInFlight.current) return;
      roleSyncInFlight.current = true;
      try {
        if (restore) {
          await restoreSession();
        }
        const roleRes = await getUserRole();
        const r = roleRes.success ? roleRes.data ?? 'guest' : 'guest';
        setRole(r);
      } finally {
        roleSyncInFlight.current = false;
      }
    };
    loadRole(true);
    const listener = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      // Prevent restoreSession -> storage update -> onChanged -> restoreSession loops.
      if (areaName !== 'local' || !changes.supabaseSession) return;
      loadRole(false);
    };
    chrome.storage?.onChanged?.addListener(listener);
    return () => {
      chrome.storage?.onChanged?.removeListener(listener);
    };
  }, []);

  useEffect(() => {
    const allowed = getAllowedModes(role);
    if (!allowed.includes(currentMode)) {
      const fallback = role === 'admin' ? 'dataset' : 'live-guard';
      setCurrentMode(fallback);
      localStorage.setItem(STORAGE_KEY, fallback);
    }
  }, [role, currentMode]);

  // Override AI configuration
  useEffect(() => {
    const loadAndOverrideConfig = async () => {
      let apiKey = '';

      // Get API key from chrome storage if available
      if (chrome?.storage?.local) {
        try {
          const result = await chrome.storage.local.get(['openaiApiKey']);
          apiKey = result.openaiApiKey; // can be empty or undefined
        } catch (e) {
          console.warn('Failed to access chrome storage:', e);
        }
      }

      console.log('Chrome Extension - Loading AI config');
      console.log('Stored API Key found:', !!apiKey);

      let configToOverride: Record<string, string>;

      if (apiKey) {
        // use OpenAI config
        configToOverride = {
          [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
          [MIDSCENE_OPENAI_API_KEY]: apiKey,
          [OPENAI_API_KEY]: apiKey,
          [MIDSCENE_MODEL_NAME]: 'gpt-4o',
          [MIDSCENE_VL_MODE]: '', // Unset VL mode for OpenAI
        };
      } else {
        // fallback to local UI-TARS
        configToOverride = {
          [MIDSCENE_OPENAI_BASE_URL]: 'http://localhost:8000/v1',
          [MIDSCENE_OPENAI_API_KEY]: 'not-needed',
          [OPENAI_API_KEY]: 'not-needed',
          [MIDSCENE_MODEL_NAME]: 'ui-tars-1.5-7b',
          [MIDSCENE_VL_MODE]: 'vlm-ui-tars',
        };
      }

      console.log('Applying AI config:', configToOverride);
      safeOverrideAIConfig(configToOverride);
    };

    loadAndOverrideConfig();
  }, [config]); // Re-run if config changes (though usually we initiate this)

  const allItems = [
    {
      key: 'dataset',
      icon: <DatabaseOutlined />,
      label: 'Dataset Collection',
      onClick: () => {
        setCurrentMode('dataset');
        setPopupTab('dataset');
        localStorage.setItem(STORAGE_KEY, 'dataset');
      },
    },
    {
      key: 'live-guard',
      icon: <SafetyOutlined />,
      label: 'Live Guard',
      onClick: () => {
        setCurrentMode('live-guard');
        localStorage.setItem(STORAGE_KEY, 'live-guard');
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
      onClick: () => {
        setCurrentMode('settings');
        localStorage.setItem(STORAGE_KEY, 'settings');
      },
    },
  ];
  const allowedModes = getAllowedModes(role);
  const menuItems = allItems.filter(
    (item: any) => item.type === 'divider' || allowedModes.includes(item.key as PopupMode),
  );

  const renderContent = () => {
    if (role !== 'admin' && currentMode !== 'live-guard' && currentMode !== 'settings') {
      return (
        <div className="popup-content live-guard-mode">
          <div className="module-container">
            <LiveGuard />
          </div>
        </div>
      );
    }
    if (currentMode === 'dataset') {
      return (
        <div className="popup-content dataset-mode">
          <div className="module-container">
            <DatasetCollection />
          </div>
        </div>
      );
    }
    if (currentMode === 'live-guard') {
      return (
        <div className="popup-content live-guard-mode">
          <div className="module-container">
            <LiveGuard />
          </div>
        </div>
      );
    }
    if (currentMode === 'settings') {
      return (
        <div className="popup-content settings-mode">
          <div className="module-container">
            <Settings role={role} />
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <ConfigProvider theme={globalThemeConfig()}>
      <div className="popup-wrapper">
        {/* top navigation bar */}
        <div className="popup-nav">
          <div className="nav-left">
            <Dropdown
              menu={{ items: menuItems as any }}
              trigger={['click']}
              placement="bottomLeft"
              overlayClassName="mode-selector-dropdown"
            >
              <MenuOutlined className="nav-icon menu-trigger" />
            </Dropdown>
            <span className="nav-title">
              {currentMode === 'dataset'
                    ? 'Dataset Collection'
                    : currentMode === 'live-guard'
                      ? 'Live Guard'
                      : 'Settings'}
            </span>
          </div>
          <div className="nav-right">
            <EnvConfig showTooltipWhenEmpty={false} showModelName={false} />
          </div>
        </div>

        {/* main content area */}
        {renderContent()}
      </div>
    </ConfigProvider>
  );
}
