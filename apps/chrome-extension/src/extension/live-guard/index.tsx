/**
 * Live Guard Module
 * Real-time dark pattern detection and consumer protection for active tab
 * Multi-viewport scanning with scroll + interaction (mirrors agentAnalysis.ts)
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
import { groundPatternsWithDOM } from '../../utils/domEvidenceGrounding';

const { Title, Text, Paragraph } = Typography;
const debug = getDebug('live-guard');

// ─── Constants ──────────────────────────────────────────────────────────────

const LIVE_GUARD_MESSAGES = {
  SCAN_PAGE: 'live-guard-scan-page',
  CLEAR_HIGHLIGHTS: 'live-guard-clear-highlights',
  SHOW_HIGHLIGHTS: 'live-guard-show-highlights',
  FOCUS_PATTERN: 'live-guard-focus-pattern',
} as const;

const TARGET_VIEWPORT_WIDTH = 1280;
const MAX_VIEWPORTS = 10;

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface DetectedPattern {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  evidence: string;
  confidence: number;
  bbox?: [number, number, number, number];
  /** dom = bbox from text grounding; vlm = model bbox (fallback) */
  bboxSource?: 'dom' | 'vlm';
  counterMeasure: string;
  scrollY?: number;                          // page scroll offset when screenshot was taken
  screenshotSize?: { width: number; height: number };
  viewportIndex?: number;
}

interface LiveGuardDetectionResponse {
  patterns: DetectedPattern[];
  summary: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}

// ─── In-tab scripting helpers ────────────────────────────────────────────────

async function getViewportMeta(tabId: number) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sh = Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight,
        );
        return {
          w: window.innerWidth,
          h: window.innerHeight,
          y: Math.round(window.scrollY || document.documentElement.scrollTop),
          scrollHeight: sh,
          dpr: window.devicePixelRatio || 1,
        };
      },
    });
    return results[0]?.result ?? { w: 1280, h: 720, y: 0, scrollHeight: 3000, dpr: 1 };
  } catch {
    return { w: 1280, h: 720, y: 0, scrollHeight: 3000, dpr: 1 };
  }
}

async function scrollTo(tabId: number, pos: 'top' | 'down'): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (p: string) => {
      const el = document.scrollingElement || document.documentElement;
      if (p === 'top') {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        el.scrollTop = 0;
      } else {
        const step = window.innerHeight * 0.85;
        window.scrollBy({ top: step, behavior: 'instant' as ScrollBehavior });
        el.scrollTop += step;
      }
    },
    args: [pos],
  });
  await new Promise(r => setTimeout(r, 1200));
}

async function scrollToY(tabId: number, y: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (yy: number) => window.scrollTo({ top: yy, behavior: 'instant' as ScrollBehavior }),
    args: [y],
  });
  await new Promise(r => setTimeout(r, 300));
}

async function lockViewportWidth(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (tw: number) => {
        const prev = document.getElementById('__lg_viewport_lock__');
        if (prev) prev.remove();
        const s = document.createElement('style');
        s.id = '__lg_viewport_lock__';
        s.textContent = `html,body{min-width:${tw}px!important;overflow-x:visible!important;}`;
        document.head.appendChild(s);
      },
      args: [TARGET_VIEWPORT_WIDTH],
    });
    await new Promise(r => setTimeout(r, 400));
  } catch {
    console.warn('[live-guard] Could not lock viewport width');
  }
}

async function dismissPopups(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const sels = [
          '[data-testid*="close"]','[aria-label*="close" i]','[aria-label*="dismiss" i]',
          '.cookie-accept','#cookie-accept','.popup-close','.modal-close',
          'button[class*="close"]','button[class*="dismiss"]','button[class*="reject"]',
          '[class*="cookie"] button','[class*="popup"] button[class*="close"]',
          '[class*="consent"] button','[class*="banner"] [class*="close"]',
        ];
        for (const sel of sels) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) { el.click(); break; }
        }
      },
    });
    await new Promise(r => setTimeout(r, 800));
  } catch { /* ignore */ }
}

interface InteractiveElement {
  description: string;
  type: 'expand' | 'dropdown' | 'accordion';
}

async function findInteractiveElements(tabId: number): Promise<InteractiveElement[]> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const found: Array<{ description: string; type: string }> = [];
        const expandKeywords = ['see more','show more','view all','view more','read more','load more','expand','show details'];
        const clickables = Array.from(document.querySelectorAll('button,a,[role="button"],details>summary'));
        for (const el of clickables) {
          const text = (el.textContent || '').trim().toLowerCase();
          if (text.length > 50) continue;
          for (const kw of expandKeywords) {
            if (text.includes(kw)) {
              found.push({ description: text.substring(0, 40), type: 'expand' });
              break;
            }
          }
        }
        for (const d of Array.from(document.querySelectorAll('details:not([open])'))) {
          const s = d.querySelector('summary');
          if (s) found.push({ description: (s.textContent || '').trim().substring(0, 40), type: 'accordion' });
        }
        for (const s of Array.from(document.querySelectorAll('select'))) {
          const lbl = s.getAttribute('aria-label') || s.name || '';
          if (lbl) found.push({ description: lbl.substring(0, 40), type: 'dropdown' });
        }
        return found.slice(0, 5);
      },
    });
    return (results[0]?.result ?? []) as InteractiveElement[];
  } catch {
    return [];
  }
}

async function clickInteractiveElement(tabId: number, el: InteractiveElement): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (desc: string) => {
        const clickables = Array.from(document.querySelectorAll('button,a,[role="button"],details>summary'));
        const keywords = desc.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        const match = clickables.find((e) => {
          const t = (e.textContent || '').toLowerCase();
          return keywords.some((kw: string) => t.includes(kw));
        }) as HTMLElement | null;
        if (match) {
          match.scrollIntoView({ behavior: 'instant', block: 'center' });
          match.click();
          return true;
        }
        return false;
      },
      args: [el.description],
    });
    const clicked = !!results[0]?.result;
    if (clicked) await new Promise(res => setTimeout(res, 1500));
    return clicked;
  } catch {
    return false;
  }
}

async function getDOMText(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML.substring(0, 8000),
    });
    return results[0]?.result ?? '';
  } catch {
    return '';
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LiveGuard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { config, readyState, isLoading: isConfigLoading } = useGlobalAIConfig();

  // ── AI analysis for one screenshot ────────────────────────────────────────
  const analyzeViewport = async (
    screenshot: string,
    dom: string,
    url: string,
    scrollY: number,
    screenshotSize: { width: number; height: number },
    label: string,
  ): Promise<DetectedPattern[]> => {
    debug(`Analyzing viewport [${label}] scrollY=${scrollY}`);

    const modelConfig = await getActiveModelConfig();

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
            text: `Analyze this webpage viewport for dark patterns in real-time.

URL: ${url}
Viewport Label: ${label}

This is a live scan for consumer protection. Focus on patterns that:
1. Create urgency or scarcity (fake timers, countdowns)
2. Hide important information (small print, hidden costs)
3. Make it difficult to opt-out or cancel
4. Use deceptive design to manipulate user choices

For each detected pattern, provide a counterMeasure field with actionable advice for the user.

IMPORTANT: Return a JSON object with this exact structure:
{
  "patterns": [
    {
      "type": "Pattern Type (e.g., 'FOMO / Urgency')",
      "description": "Brief description",
      "severity": "low|medium|high|critical",
      "location": "Where on the page (include relative position like top/middle/bottom and nearby anchor such as price/header/checkout/footer)",
      "evidence": "Exact visible UI quote PLUS nearby context so the element is unique in this viewport (avoid generic labels alone)",
      "confidence": 0.0-1.0,
      "bbox": [x, y, width, height],
      "counterMeasure": "Actionable advice for user"
    }
  ],
  "summary": {
    "total_patterns": 0,
    "prevalence_score": 0.0,
    "primary_categories": []
  }
}

Bounding boxes: use normalized coordinates 0-1000 relative to THIS viewport image (x,y = top-left, width/height in the same scale). These are a fallback if text grounding fails; evidence text is the primary localization signal.

EVIDENCE QUALITY RULES (MANDATORY):
- Avoid generic evidence like "Add to Cart" by itself.
- Include nearby context (price, quantity, discount line, header label, etc.).
- Include relative placement in either location or evidence.`,
          },
          {
            type: 'image_url',
            image_url: { url: screenshot },
          },
        ],
      },
    ];

    try {
      const response = await callAIWithObjectResponse<LiveGuardDetectionResponse>(
        messages,
        AIActionType.EXTRACT_DATA,
        modelConfig,
      );

      // Tag each pattern with scroll metadata
      return response.content.patterns.map(p => ({
        ...p,
        counterMeasure: p.counterMeasure || generateCounterMeasure(p),
        scrollY,
        screenshotSize,
      }));
    } catch (err) {
      debug(`[${label}] AI analysis failed:`, err);
      return [];
    }
  };

  // ── CounterMeasure lookup ──────────────────────────────────────────────────
  const generateCounterMeasure = (pattern: DetectedPattern): string => {
    const map: Record<string, string> = {
      'Nagging': '✅ Action: You can safely dismiss repeated popups; they are designed to wear you down.',
      'Scarcity & Popularity': '✅ Action: This scarcity indicator may be fake. Check if the item is actually in stock elsewhere.',
      'FOMO / Urgency': '✅ Action: Ignore the countdown and pressure language. Take your time to decide.',
      'Reference Pricing': '✅ Action: Compare prices on other sites. The "discount" may be exaggerated.',
      'Disguised Ads': '✅ Action: Treat this as an ad, not neutral content. Avoid clicking impulsively.',
      'False Hierarchy': '✅ Action: The highlighted option may not be the best choice. Compare all options.',
      'Interface Interference': '✅ Action: Slow down and look for less prominent options or links before proceeding.',
      'Misdirection': '✅ Action: Re-read the button text and nearby fine print to confirm what will actually happen.',
      'Hard To Close': '✅ Action: Look carefully for a small "X" or "Close" link—do not click the highlighted CTA if you want to dismiss.',
      'Obstruction': '✅ Action: Take the time to follow the extra steps; they are designed to discourage cancellation.',
      'Bundling': '✅ Action: Review your cart and settings. Remove any items or add-ons you did not explicitly choose.',
      'Sneaking': '✅ Action: Check the final price breakdown. Remove any unexpected fees or items before paying.',
      'Hidden Information': '✅ Action: Look for "details", "terms", or expandable sections before you continue.',
      'Subscription Trap': '✅ Action: Check how to cancel before subscribing. Take screenshots of the cancellation instructions.',
      'Roach Motel': '✅ Action: Look for account/settings pages and help center articles that explain how to exit.',
      'Confirmshaming': '✅ Action: Do not feel guilty about choosing "No". The wording is intentionally manipulative.',
      'Forced Registration': '✅ Action: If possible, compare with other sites that allow guest checkout or browsing.',
      'Gamification Pressure': '✅ Action: Ignore streaks and badges when making financial decisions. Focus on your real goals.',
    };
    return map[pattern.type] || '✅ Action: Be cautious. This pattern may manipulate your decisions.';
  };

  // ── Deduplication ─────────────────────────────────────────────────────────
  const deduplicatePatterns = (patterns: DetectedPattern[]): DetectedPattern[] => {
    const seen = new Set<string>();
    return patterns.filter(p => {
      const key = `${p.type}::${(p.description ?? p.evidence ?? '').substring(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const keepPatternsForViewport = (
    patterns: DetectedPattern[],
    viewportHeight: number,
    viewportIndex: number,
  ): DetectedPattern[] =>
    patterns
      .filter((p) => {
        const b = p.bbox;
        if (!b || b.length !== 4) return false;
        const [, y, , h] = b;
        const boxBottom = y + h;
        return Number.isFinite(y) && Number.isFinite(h) && h > 0 && boxBottom > 0 && y < viewportHeight;
      })
      .map((p) => ({ ...p, viewportIndex }));

  // ── Get screenshot dimensions ─────────────────────────────────────────────
  const getScreenshotSize = (dataUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error('Failed to load screenshot'));
      img.src = dataUrl;
    });
  };

  // ── MAIN SCAN FUNCTION — multi-phase ─────────────────────────────────────
  const analyzeCurrentPage = async () => {
    setIsScanning(true);
    setError(null);
    setDetectedPatterns([]);
    setScanProgress('');

    try {
      if (!readyState.isReady) {
        throw new Error(readyState.errorMessage || 'AI not configured');
      }

      // Get active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');
      const tabId = tab.id;

      const url = tab.url ?? '';
      const allPatterns: DetectedPattern[] = [];

      // ── PRE-PHASE: Lock viewport width ──────────────────────────────────
      setScanProgress('Locking viewport…');
      await lockViewportWidth(tabId);
      debug('Viewport locked to', TARGET_VIEWPORT_WIDTH);

      // ── PHASE 0: Dismiss popups & scroll to top ──────────────────────────
      setScanProgress('Phase 0: Dismissing popups…');
      await dismissPopups(tabId);
      await scrollTo(tabId, 'top');
      debug('Phase 0 done');

      // ── PHASE 1 + 2: Scroll & capture + AI analyze each viewport ────────
      const meta = await getViewportMeta(tabId);
      const totalSteps = Math.min(
        Math.ceil(meta.scrollHeight / (meta.h * 0.85)),
        MAX_VIEWPORTS,
      );
      debug(`Phase 1: ${totalSteps} viewports (page=${meta.scrollHeight}px, vh=${meta.h}px)`);

      interface RawCapture {
        screenshot: string;
        scrollY: number;
        screenshotSize: { width: number; height: number };
        index: number;
      }
      const rawCaptures: RawCapture[] = [];

      for (let i = 0; i < totalSteps; i++) {
        if (i > 0) await scrollTo(tabId, 'down');
        setScanProgress(`Phase 1: Capturing viewport ${i + 1}/${totalSteps}…`);
        try {
          const screenshot = await captureTabScreenshot(tabId);
          const vmeta = await getViewportMeta(tabId);
          const screenshotSize = await getScreenshotSize(screenshot);
          rawCaptures.push({ screenshot, scrollY: vmeta.y, screenshotSize, index: i });
          debug(`Phase 1: Viewport ${i} captured (scrollY=${vmeta.y})`);
        } catch (err) {
          console.warn(`[live-guard] Phase 1: Viewport ${i} capture failed:`, err);
        }
      }

      // Analyze each captured viewport
      for (const cap of rawCaptures) {
        setScanProgress(`Phase 2: Analyzing viewport ${cap.index + 1}/${rawCaptures.length}…`);
        await scrollToY(tabId, cap.scrollY);
        const dom = await getDOMText(tabId);
        const patterns = await analyzeViewport(
          cap.screenshot, dom, url, cap.scrollY, cap.screenshotSize, `scan-${cap.index}`,
        );
        const grounded = await groundPatternsWithDOM(tabId, patterns, {
          expectedScrollY: cap.scrollY,
          viewportHeight: cap.screenshotSize.height,
        });
        const viewportBound = keepPatternsForViewport(grounded, cap.screenshotSize.height, cap.index);
        allPatterns.push(...viewportBound);
        debug(`Phase 2: Viewport ${cap.index} → ${viewportBound.length} patterns (strictly bound)`);
      }

      // ── PHASE 3 + 4: Interact + re-analyze ──────────────────────────────
      setScanProgress('Phase 3: Finding interactive elements…');
      await scrollTo(tabId, 'top');
      await new Promise(r => setTimeout(r, 500));

      const interactiveEls = await findInteractiveElements(tabId);
      debug(`Phase 3: Found ${interactiveEls.length} interactive elements`);

      for (const el of interactiveEls) {
        setScanProgress(`Phase 3: Clicking "${el.description}"…`);
        const clicked = await clickInteractiveElement(tabId, el);
        if (!clicked) continue;

        setScanProgress(`Phase 4: Analyzing after "${el.description}"…`);
        try {
          const screenshot = await captureTabScreenshot(tabId);
          const vmeta = await getViewportMeta(tabId);
          const screenshotSize = await getScreenshotSize(screenshot);
          const dom = await getDOMText(tabId);
          const patterns = await analyzeViewport(
            screenshot, dom, url, vmeta.y, screenshotSize, `interact-${el.type}`,
          );
          const grounded = await groundPatternsWithDOM(tabId, patterns, {
            expectedScrollY: vmeta.y,
            viewportHeight: screenshotSize.height,
          });
          const viewportBound = keepPatternsForViewport(grounded, screenshotSize.height, rawCaptures.length + allPatterns.length);
          allPatterns.push(...viewportBound);
          debug(`Phase 4: ${el.description} → ${viewportBound.length} patterns (strictly bound)`);
        } catch (err) {
          console.warn(`[live-guard] Phase 4 failed for "${el.description}":`, err);
        }
      }

      // ── FINALIZE ─────────────────────────────────────────────────────────
      setScanProgress('Finalizing…');
      const deduped = deduplicatePatterns(allPatterns);
      setDetectedPatterns(deduped);

      // Send ALL patterns to content script (each carries its own scrollY + screenshotSize)
      chrome.tabs.sendMessage(tabId, {
        action: LIVE_GUARD_MESSAGES.SHOW_HIGHLIGHTS,
        patterns: deduped,
        isNormalized: true,
      });

      message.success(`Detected ${deduped.length} dark pattern(s) across ${rawCaptures.length} viewport(s)`);
      debug(`DONE: ${deduped.length} unique patterns from ${rawCaptures.length} viewports`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      message.error(`Analysis failed: ${msg}`);
      debug('Analysis error:', msg);
    } finally {
      setIsScanning(false);
      setScanProgress('');
    }
  };

  // ── Clear highlights ───────────────────────────────────────────────────────
  const clearHighlights = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: LIVE_GUARD_MESSAGES.CLEAR_HIGHLIGHTS });
      }
      setDetectedPatterns([]);
      message.success('Highlights cleared');
    } catch (err) {
      debug('Failed to clear highlights:', err);
    }
  };

  // ── Focus pattern ──────────────────────────────────────────────────────────
  const focusPattern = async (patternIndex: number) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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

  // ── Severity colour ────────────────────────────────────────────────────────
  const severityColor = (s: DetectedPattern['severity']) => {
    if (s === 'critical') return '#ff4d4f';
    if (s === 'high') return '#ff7a45';
    if (s === 'medium') return '#ffa940';
    return '#52c41a';
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="live-guard-container">
      <Card>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={4}>
              <SafetyOutlined /> Live Guard
            </Title>
            <Paragraph type="secondary">
              Real-time dark pattern detection — full-page scan with scroll &amp; interaction
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
              {isScanning ? 'Scanning…' : 'Scan Current Page'}
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

          {/* Progress status */}
          {isScanning && scanProgress && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <Spin size="small" />
              <Text type="secondary" style={{ marginLeft: 8 }}>
                {scanProgress}
              </Text>
            </div>
          )}

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
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                {detectedPatterns.map((pattern, index) => (
                  <Card
                    key={index}
                    size="small"
                    style={{
                      borderLeft: `4px solid ${severityColor(pattern.severity)}`,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={() => focusPattern(index)}
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
        </Space>
      </Card>
    </div>
  );
}

export default LiveGuard;
