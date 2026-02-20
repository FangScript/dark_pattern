/**
 * Live Guard Module
 * Real-time dark pattern detection and consumer protection for active tab
 */

import { ClearOutlined, SafetyOutlined } from '@ant-design/icons';
import './index.less';
import {
  AIActionType,
  callAIWithObjectResponse,
} from '@darkpatternhunter/core/ai-model';
import { getDebug } from '@darkpatternhunter/shared/logger';
import { Button, Card, Space, Spin, Tag, Typography, message } from 'antd';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { useEffect, useState } from 'react';
import { useGlobalAIConfig } from '../../hooks/useGlobalAIConfig';
import {
  type AIConfig,
  getAIConfig,
  getActiveModelConfig,
  isLocalServerReachable,
} from '../../utils/aiConfig';
import { getDarkPatternPrompt } from '../../utils/analysisEngine';
import { captureTabScreenshot } from '../../utils/screenshotCapture';

const { Title, Text, Paragraph } = Typography;
const debug = getDebug('live-guard');

// Message types for Live Guard
const LIVE_GUARD_MESSAGES = {
  SCAN_PAGE: 'live-guard-scan-page',
  CLEAR_HIGHLIGHTS: 'live-guard-clear-highlights',
  SHOW_HIGHLIGHTS: 'live-guard-show-highlights',
  FOCUS_PATTERN: 'live-guard-focus-pattern',
} as const;

// Dark pattern detection result interface
interface DetectedPattern {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  evidence: string;
  confidence: number;
  bbox?: [number, number, number, number];
  counterMeasure: string;
}

// AI Response Schema for Live Guard
interface LiveGuardDetectionResponse {
  patterns: DetectedPattern[];
  summary: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}

export function LiveGuard() {
  const [isScanning, setIsScanning] = useState(false);
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);

  // Use global AI configuration hook
  const {
    config,
    readyState,
    isLoading: isConfigLoading,
  } = useGlobalAIConfig();

  /**
   * Capture current tab screenshot and DOM
   */
  const capturePageData = async (): Promise<{
    screenshot: string;
    dom: string;
    url: string;
    title: string;
    screenshotSize: { width: number; height: number };
  } | null> => {
    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Capture screenshot using debugger API for automatic operation
      // This works without requiring activeTab invocation
      const screenshot = await captureTabScreenshot(tab.id);

      // Get screenshot dimensions
      const img = new Image();
      const imgPromise = new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          img.onload = () => {
            resolve({ width: img.width, height: img.height });
          };
          img.onerror = () => reject(new Error('Failed to load screenshot'));
          img.src = screenshot;
        },
      );
      const screenshotSize = await imgPromise;

      // Get DOM and page info
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return {
            url: window.location.href,
            title: document.title,
            dom: document.documentElement.outerHTML.substring(0, 5000), // Limit DOM size
          };
        },
      });

      if (result?.[0]?.result) {
        return {
          screenshot,
          screenshotSize,
          ...result[0].result,
        };
      }

      return null;
    } catch (err) {
      debug('Failed to capture page data:', err);
      return null;
    }
  };

  /**
   * Analyze current page using AI
   */
  const analyzeCurrentPage = async () => {
    setIsScanning(true);
    setError(null);
    setDetectedPatterns([]);

    try {
      // Check if AI is ready using global config
      if (!readyState.isReady) {
        throw new Error(readyState.errorMessage || 'AI not configured');
      }

      // Get current AI configuration
      const currentConfig = await getAIConfig();

      const pageData = await capturePageData();
      if (!pageData) {
        throw new Error('Failed to capture page data');
      }

      debug('Analyzing page:', pageData.url);
      debug('Using provider:', currentConfig.provider);
      debug('Using model:', currentConfig.selectedModel);

      // Get active model config
      const modelConfig = await getActiveModelConfig();

      // Prepare AI messages
      const messages: ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: getDarkPatternPrompt('english'),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this webpage for dark patterns in real-time.

URL: ${pageData.url}
Page Title: ${pageData.title}

This is a live scan for consumer protection. Focus on patterns that:
1. Create urgency or scarcity (fake timers, countdowns)
2. Hide important information (small print, hidden costs)
3. Make it difficult to opt-out or cancel
4. Use deceptive design to manipulate user choices

For each detected pattern, provide a counterMeasure field with actionable advice for user.

IMPORTANT: Return a JSON object with the following structure:
{
  "patterns": [
    {
      "type": "Pattern Type (e.g., 'FOMO / Urgency' or 'Subscription Trap')",
      "description": "Brief description of pattern",
      "severity": "low|medium|high|critical",
      "location": "Where on the page this pattern appears",
      "evidence": "What makes this a dark pattern",
      "confidence": 0.0-1.0,
      "bbox": [x, y, width, height], // Bounding box coordinates in pixels
      "counterMeasure": "Short, actionable advice for user (English/Urdu)"
    }
  ],
  "summary": {
    "total_patterns": number,
    "prevalence_score": 0.0-1.0,
    "primary_categories": ["category1", "category2"]
  }
}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: pageData.screenshot,
              },
            },
          ],
        },
      ];

      // Call AI with active model config
      const response =
        await callAIWithObjectResponse<LiveGuardDetectionResponse>(
          messages,
          AIActionType.EXTRACT_DATA,
          modelConfig,
        );

      // Add counter-measures to patterns if not provided
      const patternsWithCounterMeasures = response.content.patterns.map(
        (pattern) => ({
          ...pattern,
          counterMeasure:
            pattern.counterMeasure || generateCounterMeasure(pattern),
        }),
      );

      setDetectedPatterns(patternsWithCounterMeasures);

      // Send highlights to content script with screenshot size
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: LIVE_GUARD_MESSAGES.SHOW_HIGHLIGHTS,
          patterns: patternsWithCounterMeasures,
          screenshotSize: pageData.screenshotSize,
          isNormalized: true, // AI returns normalized coordinates (0-1000)
        });
      }

      message.success(
        `Detected ${patternsWithCounterMeasures.length} dark pattern(s)`,
      );
      debug('Analysis completed:', patternsWithCounterMeasures);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      message.error(`Analysis failed: ${errorMessage}`);
      debug('Analysis error:', errorMessage);
    } finally {
      setIsScanning(false);
    }
  };

  /**
   * Generate counter-measure for a pattern
   */
  const generateCounterMeasure = (pattern: DetectedPattern): string => {
    const counterMeasures: Record<string, string> = {
      'Nagging':
        '✅ Action: You can safely dismiss repeated popups; they are designed to wear you down.',
      'Scarcity & Popularity':
        '✅ Action: This scarcity indicator may be fake. Check if the item is actually in stock elsewhere.',
      'FOMO / Urgency':
        '✅ Action: Ignore the countdown and pressure language. Take your time to decide.',
      'Reference Pricing':
        '✅ Action: Compare prices on other sites. The “discount” may be exaggerated.',
      'Disguised Ads':
        '✅ Action: Treat this as an ad, not neutral content. Avoid clicking impulsively.',
      'False Hierarchy':
        '✅ Action: The highlighted option may not be the best choice. Compare all options.',
      'Interface Interference':
        '✅ Action: Slow down and look for less prominent options or links before proceeding.',
      Misdirection:
        '✅ Action: Re-read the button text and nearby fine print to confirm what will actually happen.',
      'Hard To Close':
        '✅ Action: Look carefully for a small “X” or “Close” link—do not click the highlighted CTA if you want to dismiss.',
      Obstruction:
        '✅ Action: Take the time to follow the extra steps; they are designed to discourage cancellation.',
      Bundling:
        '✅ Action: Review your cart and settings. Remove any items or add-ons you did not explicitly choose.',
      Sneaking:
        '✅ Action: Check the final price breakdown. Remove any unexpected fees or items before paying.',
      'Hidden Information':
        '✅ Action: Look for “details”, “terms”, or expandable sections before you continue.',
      'Subscription Trap':
        '✅ Action: Check how to cancel before subscribing. Take screenshots of the cancellation instructions.',
      'Roach Motel':
        '✅ Action: Look for account/settings pages and help center articles that explain how to exit.',
      Confirmshaming:
        '✅ Action: Do not feel guilty about choosing “No”. The wording is intentionally manipulative.',
      'Forced Registration':
        '✅ Action: If possible, compare with other sites that allow guest checkout or browsing.',
      'Gamification Pressure':
        '✅ Action: Ignore streaks and badges when making financial decisions. Focus on your real goals, not points.',
    };

    return (
      counterMeasures[pattern.type] ||
      '✅ Action: Be cautious. This pattern may manipulate your decisions.'
    );
  };

  /**
   * Clear all highlights from the page
   */
  const clearHighlights = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: LIVE_GUARD_MESSAGES.CLEAR_HIGHLIGHTS,
        });
      }
      setDetectedPatterns([]);
      message.success('Highlights cleared');
      debug('Highlights cleared');
    } catch (err) {
      debug('Failed to clear highlights:', err);
    }
  };

  /**
   * Focus on a specific pattern highlight
   * Sends message to content script to change highlight color and scroll element into view
   */
  const focusPattern = async (patternIndex: number) => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: LIVE_GUARD_MESSAGES.FOCUS_PATTERN,
          patternIndex,
        });
      }
    } catch (err) {
      debug('Failed to focus pattern:', err);
    }
  };

  return (
    <div className="live-guard-container">
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={4}>
              <SafetyOutlined /> Live Guard
            </Title>
            <Paragraph type="secondary">
              Real-time dark pattern detection and consumer protection
            </Paragraph>
            {config && config.provider === 'local' && config.selectedModel && (
              <Tag color="blue">Using Local AI: {config.selectedModel}</Tag>
            )}
            {!readyState.isReady && !isConfigLoading && (
              <Tag color="error">{readyState.errorMessage}</Tag>
            )}
          </div>

          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Button
              type="primary"
              size="large"
              icon={<SafetyOutlined />}
              onClick={analyzeCurrentPage}
              loading={isScanning}
              disabled={isScanning}
              block
            >
              {isScanning ? 'Scanning...' : 'Scan Current Page'}
            </Button>

            {detectedPatterns.length > 0 && (
              <Button
                icon={<ClearOutlined />}
                onClick={clearHighlights}
                disabled={isScanning}
                block
              >
                Clear Highlights
              </Button>
            )}
          </Space>

          {error && (
            <div style={{ marginTop: 16 }}>
              <Text type="danger">{error}</Text>
            </div>
          )}

          {detectedPatterns.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Title level={5}>
                Detected Patterns ({detectedPatterns.length})
              </Title>
              <Space
                direction="vertical"
                size="small"
                style={{ width: '100%' }}
              >
                {detectedPatterns.map((pattern, index) => (
                  <Card
                    key={index}
                    size="small"
                    style={{
                      borderLeft: `4px solid ${
                        pattern.severity === 'critical'
                          ? '#ff4d4f'
                          : pattern.severity === 'high'
                            ? '#ff7a45'
                            : pattern.severity === 'medium'
                              ? '#ffa940'
                              : '#52c41a'
                      }`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={() => focusPattern(index)}
                    onMouseLeave={() => {
                      // Optional: Reset highlights when mouse leaves
                      // Currently keeping the focus for better UX
                    }}
                  >
                    <Text strong>{pattern.type}</Text>
                    <br />
                    <Text type="secondary">{pattern.description}</Text>
                    <br />
                    <Text type="warning">{pattern.counterMeasure}</Text>
                  </Card>
                ))}
              </Space>
            </div>
          )}

          {isScanning && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Spin tip="Analyzing page for dark patterns..." />
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
}

export default LiveGuard;
