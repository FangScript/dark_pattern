import {
  ApiOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import {
  discoverLMStudioModels,
  isLMStudioServerRunning,
} from '@darkpatternhunter/core/ai-model';
import {
  Button,
  Card,
  Divider,
  Input,
  Radio,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useState } from 'react';
import {
  type AIConfig,
  type AIProvider,
  AI_DEFAULTS,
  AI_STORAGE_KEYS,
  getAIConfig,
  isLocalServerReachable,
  saveAIConfig,
} from '../../utils/aiConfig';

const { Title, Text, Paragraph } = Typography;

export function Settings() {
  const [config, setConfig] = useState<AIConfig>({
    provider: AI_DEFAULTS.AI_PROVIDER,
    openaiApiKey: '',
    localAiEnabled: false,
    localAiHost: AI_DEFAULTS.LOCAL_AI_HOST,
    selectedModel: undefined,
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isServerOnline, setIsServerOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load settings from storage on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const loadedConfig = await getAIConfig();
        setConfig(loadedConfig);

        // Check server status if local AI is enabled
        if (loadedConfig.localAiEnabled) {
          checkServerStatus(loadedConfig.localAiHost);
        }
      } catch (error) {
        console.error('Failed to load AI config:', error);
        message.error('Failed to load settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Check server status when local AI is enabled
  useEffect(() => {
    if (config.localAiEnabled) {
      checkServerStatus(config.localAiHost);
    } else {
      setIsServerOnline(null);
      setAvailableModels([]);
      setConfig((prev) => ({ ...prev, selectedModel: undefined }));
    }
  }, [config.localAiEnabled, config.localAiHost]);

  // Auto-detect model if only one is available
  useEffect(() => {
    if (availableModels.length === 1 && !config.selectedModel) {
      const model = availableModels[0];
      setConfig((prev) => ({ ...prev, selectedModel: model }));
      saveAIConfig({ selectedModel: model });
    }
  }, [availableModels]);

  const checkServerStatus = async (host: string) => {
    const online = await isLMStudioServerRunning(host);
    setIsServerOnline(online);
    if (online) {
      // Auto-refresh models when server comes online
      refreshModels();
    }
  };

  const refreshModels = async () => {
    setIsRefreshing(true);
    try {
      const result = await discoverLMStudioModels(config.localAiHost);
      if (result.success) {
        const modelIds = result.models.map((m: { id: string }) => m.id);
        setAvailableModels(modelIds);
        setIsServerOnline(true);
        message.success(`Found ${modelIds.length} model(s)`);

        // Auto-select if only one model
        if (modelIds.length === 1 && !config.selectedModel) {
          const model = modelIds[0];
          setConfig((prev) => ({ ...prev, selectedModel: model }));
          saveAIConfig({ selectedModel: model });
        }
      } else {
        setIsServerOnline(false);
        setAvailableModels([]);
        message.error(`Failed to fetch models: ${result.error}`);
      }
    } catch (error) {
      setIsServerOnline(false);
      setAvailableModels([]);
      message.error('Failed to connect to LM Studio server');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleProviderChange = async (provider: AIProvider) => {
    const newConfig = { ...config, provider };
    setConfig(newConfig);
    await saveAIConfig({ provider });

    // If switching to local, enable local AI
    if (provider === 'local') {
      await saveAIConfig({ localAiEnabled: true });
      setConfig((prev) => ({ ...prev, localAiEnabled: true }));
    }
  };

  const handleApiKeyChange = async (apiKey: string) => {
    const newConfig = { ...config, openaiApiKey: apiKey };
    setConfig(newConfig);
    await saveAIConfig({ openaiApiKey: apiKey });
  };

  const handleLocalAiToggle = async (enabled: boolean) => {
    const newConfig = { ...config, localAiEnabled: enabled };
    setConfig(newConfig);
    await saveAIConfig({ localAiEnabled: enabled });

    // Update provider based on toggle
    if (enabled) {
      await saveAIConfig({ provider: 'local' });
      setConfig((prev) => ({ ...prev, provider: 'local' }));
    } else {
      await saveAIConfig({ provider: 'openai' });
      setConfig((prev) => ({ ...prev, provider: 'openai' }));
    }
  };

  const handleHostChange = async (host: string) => {
    const newConfig = { ...config, localAiHost: host };
    setConfig(newConfig);
    await saveAIConfig({ localAiHost: host });
  };

  const handleModelChange = async (model: string) => {
    const newConfig = { ...config, selectedModel: model };
    setConfig(newConfig);
    await saveAIConfig({ selectedModel: model });
  };

  const saveApiKey = async () => {
    try {
      await saveAIConfig({ openaiApiKey: config.openaiApiKey });
      message.success('API key saved');
    } catch (e) {
      console.error('Failed to save API key:', e);
      message.error('Failed to save API key');
    }
  };

  if (isLoading) {
    return <div>Loading settings...</div>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      {/* Provider Selection */}
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>AI Provider</span>
          </Space>
        }
        bordered={false}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text strong>Select AI Provider:</Text>
            <br />
            <Text type="secondary" style={{ fontSize: '12px' }}>
              Choose between OpenAI cloud API or local LM Studio
            </Text>
          </div>
          <Radio.Group
            value={config.provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            style={{ width: '100%' }}
          >
            <Space direction="vertical">
              <Radio value="openai">
                <Space>
                  <ApiOutlined />
                  <span>OpenAI (Cloud)</span>
                </Space>
              </Radio>
              <Radio value="local">
                <Space>
                  <SettingOutlined />
                  <span>Local AI (LM Studio)</span>
                </Space>
              </Radio>
            </Space>
          </Radio.Group>
        </Space>
      </Card>

      <Divider />

      {/* OpenAI Configuration */}
      {config.provider === 'openai' && (
        <Card
          title={
            <Space>
              <ApiOutlined />
              <span>OpenAI Configuration</span>
            </Space>
          }
          bordered={false}
        >
          <div style={{ marginBottom: 16 }}>
            <p style={{ marginBottom: 8 }}>OpenAI API Key:</p>
            <Input.Password
              placeholder="sk-..."
              value={config.openaiApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <Button type="primary" onClick={saveApiKey} block>
              Save Configuration
            </Button>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            <p>
              The API key is stored locally in your browser and used to
              communicate directly with OpenAI API for dark pattern analysis.
            </p>
          </div>
        </Card>
      )}

      {/* Local AI Configuration */}
      {config.provider === 'local' && (
        <Card
          title={
            <Space>
              <SettingOutlined />
              <span>Local AI (LM Studio)</span>
            </Space>
          }
          bordered={false}
        >
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Server Host */}
            <div>
              <p style={{ marginBottom: 8 }}>LM Studio Server Host:</p>
              <Input
                placeholder="http://localhost:1234"
                value={config.localAiHost}
                onChange={(e) => handleHostChange(e.target.value)}
                onBlur={() => saveAIConfig({ localAiHost: config.localAiHost })}
              />
            </div>

            {/* Server Status */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                background: '#f5f5f5',
                borderRadius: '4px',
              }}
            >
              <Text strong>Server Status:</Text>
              {isServerOnline === null ? (
                <Tag color="default">Checking...</Tag>
              ) : isServerOnline ? (
                <Tag icon={<CheckCircleOutlined />} color="success">
                  Online
                </Tag>
              ) : (
                <Tag icon={<CloseCircleOutlined />} color="error">
                  ❌ Local Server Offline
                </Tag>
              )}
            </div>

            {/* Refresh Models Button */}
            <Button
              icon={<ReloadOutlined />}
              onClick={refreshModels}
              loading={isRefreshing}
              disabled={!isServerOnline}
              block
            >
              Refresh Models
            </Button>

            {/* Model Selection Dropdown */}
            {availableModels.length > 0 && (
              <div>
                <p style={{ marginBottom: 8 }}>Select Model:</p>
                <Select
                  value={config.selectedModel}
                  onChange={handleModelChange}
                  style={{ width: '100%' }}
                  placeholder="Select a model"
                  loading={isRefreshing}
                >
                  {availableModels.map((model) => (
                    <Select.Option key={model} value={model}>
                      {model}
                    </Select.Option>
                  ))}
                </Select>
              </div>
            )}

            {/* Selected Model Info */}
            {config.selectedModel && (
              <div
                style={{
                  padding: '8px 12px',
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: '4px',
                }}
              >
                <Text strong style={{ color: '#389e0d' }}>
                  Active Model:
                </Text>
                <br />
                <Text style={{ color: '#389e0d' }}>{config.selectedModel}</Text>
              </div>
            )}

            {/* Instructions */}
            <div style={{ fontSize: '12px', color: '#666' }}>
              <Paragraph>
                <strong>Instructions:</strong>
                <ol style={{ paddingLeft: '20px', margin: '8px 0' }}>
                  <li>Start LM Studio on your computer</li>
                  <li>Load a model in LM Studio</li>
                  <li>
                    Enable the server in LM Studio (default: localhost:1234)
                  </li>
                  <li>Click "Refresh Models" to discover available models</li>
                  <li>Select a model from the dropdown</li>
                </ol>
              </Paragraph>
            </div>
          </Space>
        </Card>
      )}
    </Space>
  );
}
