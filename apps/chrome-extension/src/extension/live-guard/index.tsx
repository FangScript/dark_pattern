/**
 * Live Guard Module — Stateful Incremental Multimodal Detection
 *
 * 6-phase pipeline:
 *   Phase 0 → Stabilize Environment
 *   Phase 1 → Global Visual Scan (one-time multi-viewport capture)
 *   Phase 2 → Primary Multimodal Detection (VLM per viewport)
 *   Phase 3 → Targeted Incremental Exploration (ranked interactions, diff-based)
 *   Phase 4 → Contextual Verification (session-aware dedup + confidence)
 *   Phase 5 → Overlay + Education (send to content script)
 */

import { ClearOutlined, SafetyOutlined } from '@ant-design/icons';
import './index.less';
import {
  AIActionType,
  callAIWithObjectResponse,
} from '@darkpatternhunter/core/ai-model';
import { getDebug } from '@darkpatternhunter/shared/logger';
import { Button, Card, Collapse, Space, Spin, Tag, Timeline, Typography, message } from 'antd';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { useRef, useState } from 'react';
import { useGlobalAIConfig } from '../../hooks/useGlobalAIConfig';
import { getActiveModelConfig } from '../../utils/aiConfig';
import { getDarkPatternPrompt } from '../../utils/analysisEngine';
import { captureTabScreenshot } from '../../utils/screenshotCapture';
import { computeVisualDiff, cropScreenshot } from './diffAnalyzer';
import { discoverInteractiveElementsInTab, rankInteractions } from './interactionRanker';
import {
  type DetectedPattern,
  type ScanSession,
  addViewportCapture,
  areViewportsIdentical,
  canInteract,
  computeViewportHash,
  createSession,
  getSessionSummary,
  logReasoning,
  markInteractionVisited,
  markRegionAnalyzed,
  mergeDetections,
} from './scanSession';

const { Title, Text, Paragraph } = Typography;
const debug = getDebug('live-guard');

// ─── Constants ──────────────────────────────────────────────────────────────

const LIVE_GUARD_MESSAGES = {
  SCAN_PAGE: 'live-guard-scan-page',
  CLEAR_HIGHLIGHTS: 'live-guard-clear-highlights',
  SHOW_HIGHLIGHTS: 'live-guard-show-highlights',
  FOCUS_PATTERN: 'live-guard-focus-pattern',
  UNFOCUS_PATTERN: 'live-guard-unfocus-pattern',
} as const;

const TARGET_VIEWPORT_WIDTH = 1280;
const MAX_VIEWPORTS = 5;
const SCROLL_STEP = 0.9;
const BOTTOM_GAP_PX = 100;
const MIN_REMAINING_PX = 200;

/**
 * VLM-first bbox coercion in normalized 0–1000 space.
 * Input expected as [x1, y1, x2, y2], output as [x, y, width, height].
 */
function coerceLiveGuardBbox(
  raw: [number, number, number, number] | undefined,
): [number, number, number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;

  let [x1, y1, x2, y2] = raw.map(Number);
  if (
    !Number.isFinite(x1) ||
    !Number.isFinite(y1) ||
    !Number.isFinite(x2) ||
    !Number.isFinite(y2)
  ) {
    return null;
  }

  // Fix inverted coordinates
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];

  // Clamp to normalized space
  x1 = Math.max(0, Math.min(1000, x1));
  y1 = Math.max(0, Math.min(1000, y1));
  x2 = Math.max(0, Math.min(1000, x2));
  y2 = Math.max(0, Math.min(1000, y2));

  const width = x2 - x1;
  const height = y2 - y1;

  // Reject tiny/garbage boxes
  if (width < 10 || height < 10) return null;
  // Reject giant full-screen-ish boxes
  if (width > 900 || height > 900) return null;

  return [x1, y1, width, height];
}

// ─── Interfaces (DetectedPattern imported from ./scanSession) ────────────────

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
        const step = Math.max(1, Math.floor(window.innerHeight * SCROLL_STEP));
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

/**
 * Click an interactive element by keyword-matching its description.
 * Replaces old clickInteractiveElement — works with RankedInteraction.
 */
async function clickByDescription(tabId: number, description: string): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (desc: string) => {
        const clickables = Array.from(document.querySelectorAll('button,a,[role="button"],details>summary,[onclick],[data-action]'));
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
      args: [description],
    });
    const clicked = !!results[0]?.result;
    if (clicked) await new Promise(res => setTimeout(res, 1500));
    return clicked;
  } catch {
    return false;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LiveGuard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string>('');
  const [detectedPatterns, setDetectedPatterns] = useState<DetectedPattern[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scanLog, setScanLog] = useState<string[]>([]);

  const sessionRef = useRef<ScanSession | null>(null);

  const { config, readyState, isLoading: isConfigLoading } = useGlobalAIConfig();

  const addLog = (entry: string) => {
    setScanLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${entry}`]);
  };

  // ── AI analysis for one screenshot ────────────────────────────────────────
  const analyzeViewport = async (
    tabId: number,
    screenshot: string,
    url: string,
    scrollY: number,
    screenshotSize: { width: number; height: number },
    viewportSize: { width: number; height: number },
    label: string,
    viewportIndex: number,
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

IMPORTANT: Return STRICT JSON with this exact structure:
{
  "patterns": [
    {
      "type": "Pattern Type — must be one of the 18-category taxonomy labels",
      "description": "Brief description",
      "severity": "low|medium|high|critical",
      "location": "Where on the page (include relative position like top/middle/bottom and nearby anchor such as price/header/checkout/footer)",
      "evidence": "Exact visible UI quote PLUS nearby context so the element is unique in this viewport (avoid generic labels alone)",
      "confidence": 0.0-1.0,
      "bbox": [x1, y1, x2, y2],
      "counterMeasure": "Actionable advice for user"
    }
  ],
  "summary": {
    "total_patterns": 0,
    "prevalence_score": 0.0,
    "primary_categories": []
  }
}

Bounding box (REQUIRED for every pattern):
- Return bounding boxes that are:
  - TIGHT: Only cover the deceptive UI element, not surrounding containers
  - PRECISE: Avoid extra whitespace or padding
  - SPECIFIC: Focus on the clickable or visible deceptive component (button, label, timer, text)
- "bbox" MUST be [x1, y1, x2, y2] normalized to [0,1000] for THIS screenshot only.
- Rules:
  - x2 > x1 and y2 > y1
  - Minimum size: at least 20 units in width and height
  - Do NOT return full-width or full-screen boxes
  - Do NOT include entire sections or containers
  - If unsure, return the smallest reasonable region

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

      // Tag each pattern with scroll + viewport metadata (VLM-first, no DOM grounding)
      return response.content.patterns.map((p) => {
        const bbox = coerceLiveGuardBbox(p.bbox as [number, number, number, number] | undefined);
        if (!bbox) return null;
        return {
          ...p,
          bbox,
          bboxSource: 'vlm' as const,
          counterMeasure: p.counterMeasure || generateCounterMeasure(p),
          scrollY,
          screenshotSize,
          viewportIndex,
          viewportWidth: viewportSize.width,
          viewportHeight: viewportSize.height,
          viewportId: `${tabId}_${viewportIndex}`,
        };
      }).filter(Boolean) as DetectedPattern[];
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

  // ── Viewport bounds filter (kept from original) ────────────────────────────
  const keepPatternsForViewport = (
    patterns: DetectedPattern[],
    _viewportHeightPx: number,
    viewportIndex: number,
  ): DetectedPattern[] =>
    patterns
      .filter((p) => {
        const b = p.bbox;
        if (!b || b.length !== 4) return false;
        const [, y, , h] = b;
        const boxBottom = y + h;
        return (
          Number.isFinite(y) &&
          Number.isFinite(h) &&
          h > 0 &&
          boxBottom > 0 &&
          y < 1000 &&
          boxBottom <= 1000.5
        );
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

  // ══════════════════════════════════════════════════════════════════════════
  // ── MAIN SCAN — 6-Phase Stateful Incremental Pipeline ────────────────────
  // ══════════════════════════════════════════════════════════════════════════
  const analyzeCurrentPage = async () => {
    setIsScanning(true);
    setError(null);
    setDetectedPatterns([]);
    setScanProgress('');
    setScanLog([]);

    try {
      if (!readyState.isReady) {
        throw new Error(readyState.errorMessage || 'AI not configured');
      }

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');
      const tabId = tab.id;
      const url = tab.url ?? '';

      // ── Create persistent session state ─────────────────────────────────
      const session = createSession(tabId, url);
      sessionRef.current = session;
      addLog('Session created');

      // ── PHASE 0: Stabilize Environment ──────────────────────────────────
      setScanProgress('Phase 0: Stabilizing…');
      addLog('Phase 0: Lock viewport + dismiss popups');
      const p0Start = Date.now();
      await lockViewportWidth(tabId);
      await dismissPopups(tabId);
      await scrollTo(tabId, 'top');
      logReasoning(session, 0, 'stabilize', url, 'done', Date.now() - p0Start);
      debug('Phase 0 done');

      // ── PHASE 1: Global Visual Scan (one-time) ──────────────────────────
      const meta = await getViewportMeta(tabId);
      const totalSteps = Math.min(Math.ceil(meta.scrollHeight / meta.h), MAX_VIEWPORTS);
      addLog(`Phase 1: Capturing up to ${totalSteps} viewports (page=${meta.scrollHeight}px)`);
      debug(`Phase 1: ${totalSteps} viewports (page=${meta.scrollHeight}px, vh=${meta.h}px)`);

      let lastHash: string | null = null;

      for (let i = 0; i < totalSteps; i++) {
        if (i > 0) await scrollTo(tabId, 'down');
        setScanProgress(`Phase 1: Viewport ${i + 1}/${totalSteps}…`);
        try {
          const screenshot = await captureTabScreenshot(tabId);
          const vmeta = await getViewportMeta(tabId);
          const hash = computeViewportHash(screenshot);

          if (lastHash && areViewportsIdentical(lastHash, hash)) {
            addLog(`Phase 1: Viewport ${i} near-identical, stopping`);
            break;
          }
          lastHash = hash;

          const screenshotSize = await getScreenshotSize(screenshot);
          addViewportCapture(session, {
            index: i,
            screenshot,
            scrollY: vmeta.y,
            screenshotSize,
            viewportSize: { width: vmeta.w, height: vmeta.h },
          });

          debug(`Phase 1: Viewport ${i} captured (scrollY=${vmeta.y})`);
          const remaining = vmeta.scrollHeight - (vmeta.y + vmeta.h);
          if (vmeta.y + vmeta.h >= vmeta.scrollHeight - BOTTOM_GAP_PX || remaining < MIN_REMAINING_PX) {
            addLog(`Phase 1: Bottom reached at viewport ${i}`);
            break;
          }
        } catch (err) {
          console.warn(`[live-guard] Phase 1: Viewport ${i} capture failed:`, err);
        }
      }

      addLog(`Phase 1: ${session.viewportCaptures.length} viewports captured`);
      logReasoning(session, 1, 'capture', `${totalSteps} planned`, `${session.viewportCaptures.length} captured`);

      // ── PHASE 2: Primary Multimodal Detection ───────────────────────────
      for (const cap of session.viewportCaptures) {
        setScanProgress(`Phase 2: Analyzing viewport ${cap.index + 1}/${session.viewportCaptures.length}…`);
        await scrollToY(tabId, cap.scrollY);

        const p2Start = Date.now();
        const patterns = await analyzeViewport(
          tabId, cap.screenshot, url, cap.scrollY,
          cap.screenshotSize, cap.viewportSize,
          `scan-${cap.index}`, cap.index,
        );
        const bounded = keepPatternsForViewport(patterns, cap.screenshotSize.height, cap.index);
        const added = mergeDetections(session, bounded);

        markRegionAnalyzed(session, {
          viewportIndex: cap.index, scrollY: cap.scrollY,
          bbox: [0, 0, 1000, 1000], detectionCount: added.length,
        });

        logReasoning(session, 2, `analyze-viewport-${cap.index}`,
          `scrollY=${cap.scrollY}`, `${added.length} new patterns`, Date.now() - p2Start);
        addLog(`Phase 2: Viewport ${cap.index} → ${added.length} patterns`);
      }

      debug(`Phase 2 done: ${session.globalDetections.length} total detections`);

      // ── PHASE 3: Targeted Incremental Exploration ───────────────────────
      setScanProgress('Phase 3: Ranking interactions…');
      await scrollTo(tabId, 'top');
      await new Promise(r => setTimeout(r, 500));

      // Discover interactive elements with scrollY metadata
      const rawElements = await (async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: discoverInteractiveElementsInTab,
          });
          return (results[0]?.result ?? []) as Array<{
            description: string; type: string; scrollY: number; selector: string;
          }>;
        } catch { return []; }
      })();

      // Rank by dark-pattern relevance
      const ranked = rankInteractions(rawElements, session.globalDetections);
      session.interactionCandidates = ranked;
      addLog(`Phase 3: ${ranked.length} interactions found, ranked by priority`);

      let interactViewportSeq = session.viewportCaptures.length;

      for (const interaction of ranked) {
        // Budget check
        if (!canInteract(session, interaction.priority)) {
          addLog(`Phase 3: Budget exhausted for [${interaction.priority}], skipping "${interaction.description}"`);
          continue;
        }
        if (session.visitedInteractions.has(interaction.id)) continue;

        setScanProgress(`Phase 3: [${interaction.priority.toUpperCase()}] "${interaction.description}"…`);
        addLog(`Phase 3: Clicking [${interaction.priority}] "${interaction.description}" (${interaction.reason})`);

        // Capture "before" screenshot at the interaction's scroll position
        await scrollToY(tabId, interaction.scrollY);
        let beforeScreenshot: string | null = null;
        try { beforeScreenshot = await captureTabScreenshot(tabId); } catch { /* ignore */ }

        // Click the interaction
        const clicked = await clickByDescription(tabId, interaction.description);
        markInteractionVisited(session, interaction.id);
        if (!clicked) {
          addLog(`Phase 3: Could not click "${interaction.description}"`);
          continue;
        }

        // Capture "after" screenshot
        try {
          const afterScreenshot = await captureTabScreenshot(tabId);
          const vmeta = await getViewportMeta(tabId);
          const screenshotSize = await getScreenshotSize(afterScreenshot);

          // ── Diff-based analysis ─────────────────────────────────────────
          if (beforeScreenshot) {
            const diff = await computeVisualDiff(beforeScreenshot, afterScreenshot);

            if (!diff.isSignificant) {
              addLog(`Phase 3: No visual change after "${interaction.description}", skipping`);
              logReasoning(session, 3, `interact-${interaction.description}`,
                'click', `no change (${(diff.changeRatio * 100).toFixed(1)}%)`, 0);
              continue;
            }

            if (diff.isLocalized && diff.changedBbox) {
              // LOCALIZED CHANGE: analyze only the changed region
              addLog(`Phase 3: Localized change (${(diff.changeRatio * 100).toFixed(1)}%), analyzing changed region only`);
              const { croppedDataUrl } = await cropScreenshot(afterScreenshot, diff.changedBbox);

              const p3Start = Date.now();
              const patterns = await analyzeViewport(
                tabId, croppedDataUrl, url, vmeta.y, screenshotSize,
                { width: vmeta.w, height: vmeta.h },
                `interact-local-${interaction.type}`, interactViewportSeq,
              );
              const bounded = keepPatternsForViewport(patterns, screenshotSize.height, interactViewportSeq);
              const tagged = bounded.map(p => ({ ...p, revealedBy: interaction.description }));
              const added = mergeDetections(session, tagged);
              interactViewportSeq++;

              logReasoning(session, 3, `interact-local-${interaction.description}`,
                `${(diff.changeRatio * 100).toFixed(1)}% changed`, `${added.length} new`, Date.now() - p3Start);
              addLog(`Phase 3: "${interaction.description}" → ${added.length} new patterns (localized)`);
            } else {
              // GLOBAL CHANGE (e.g. modal): analyze full viewport
              addLog(`Phase 3: Global change (${(diff.changeRatio * 100).toFixed(1)}%), analyzing full viewport`);
              const p3Start = Date.now();
              const patterns = await analyzeViewport(
                tabId, afterScreenshot, url, vmeta.y, screenshotSize,
                { width: vmeta.w, height: vmeta.h },
                `interact-global-${interaction.type}`, interactViewportSeq,
              );
              const bounded = keepPatternsForViewport(patterns, screenshotSize.height, interactViewportSeq);
              const tagged = bounded.map(p => ({ ...p, revealedBy: interaction.description }));
              const added = mergeDetections(session, tagged);
              interactViewportSeq++;

              logReasoning(session, 3, `interact-global-${interaction.description}`,
                `${(diff.changeRatio * 100).toFixed(1)}% changed`, `${added.length} new`, Date.now() - p3Start);
              addLog(`Phase 3: "${interaction.description}" → ${added.length} new patterns (global)`);
            }
          } else {
            // No before screenshot — fall back to full analysis (rare)
            const p3Start = Date.now();
            const patterns = await analyzeViewport(
              tabId, afterScreenshot, url, vmeta.y, screenshotSize,
              { width: vmeta.w, height: vmeta.h },
              `interact-fallback-${interaction.type}`, interactViewportSeq,
            );
            const bounded = keepPatternsForViewport(patterns, screenshotSize.height, interactViewportSeq);
            const tagged = bounded.map(p => ({ ...p, revealedBy: interaction.description }));
            mergeDetections(session, tagged);
            interactViewportSeq++;
            logReasoning(session, 3, `interact-fallback-${interaction.description}`,
              'no before screenshot', `${tagged.length} patterns`, Date.now() - p3Start);
          }
        } catch (err) {
          console.warn(`[live-guard] Phase 3 failed for "${interaction.description}":`, err);
          addLog(`Phase 3: Error on "${interaction.description}"`);
        }
      }

      // ── PHASE 4: Contextual Verification ────────────────────────────────
      setScanProgress('Phase 4: Verifying detections…');
      addLog(`Phase 4: Verifying ${session.globalDetections.length} detections`);

      // Confidence boost: patterns seen from multiple viewports get +0.1
      const boosted = session.globalDetections.map(d => {
        const sameType = session.globalDetections.filter(
          o => o !== d && o.type === d.type && Math.abs((o.scrollY ?? 0) - (d.scrollY ?? 0)) < 400,
        );
        const boost = sameType.length > 0 ? 0.1 : 0;
        return { ...d, confidence: Math.min(1, (d.confidence || 0.7) + boost) };
      });

      // Final dedup is already handled by mergeDetections, but run once more for edge cases
      session.verifiedDetections = boosted;
      addLog(`Phase 4: ${session.verifiedDetections.length} verified patterns`);
      logReasoning(session, 4, 'verify', `${session.globalDetections.length} raw`, `${session.verifiedDetections.length} verified`);

      // ── PHASE 5: Overlay + Education ────────────────────────────────────
      setScanProgress('Phase 5: Rendering overlays…');
      const finalPatterns = session.verifiedDetections;
      setDetectedPatterns(finalPatterns);

      chrome.tabs.sendMessage(tabId, {
        action: LIVE_GUARD_MESSAGES.SHOW_HIGHLIGHTS,
        patterns: finalPatterns,
        isNormalized: true,
      });

      const summary = getSessionSummary(session);
      addLog(`Done: ${summary.totalDetections} patterns, ${summary.interactionsUsed}/${summary.interactionBudgetMax} interactions, ${(summary.durationMs / 1000).toFixed(1)}s`);
      message.success(`Detected ${finalPatterns.length} dark pattern(s) across ${summary.viewportsCaptured} viewport(s)`);
      debug('DONE:', summary);
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

  const unfocusPattern = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          action: LIVE_GUARD_MESSAGES.UNFOCUS_PATTERN,
        });
      }
    } catch (err) {
      debug('Failed to unfocus pattern:', err);
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
                    onMouseLeave={unfocusPattern}
                  >
                    <Text strong>{pattern.type}</Text>
                    {pattern.revealedBy && (
                      <Tag color="purple" style={{ marginLeft: 6, fontSize: 10 }}>
                        via: {pattern.revealedBy}
                      </Tag>
                    )}
                    <br />
                    <Text type="secondary">{pattern.description}</Text>
                    <br />
                    <Text type="warning">{pattern.counterMeasure}</Text>
                  </Card>
                ))}
              </Space>
            </div>
          )}

          {/* Scan Log */}
          {scanLog.length > 0 && (
            <Collapse
              size="small"
              style={{ marginTop: 16 }}
              items={[{
                key: 'scan-log',
                label: `Scan Log (${scanLog.length} entries)`,
                children: (
                  <Timeline
                    style={{ fontSize: 11, maxHeight: 200, overflow: 'auto' }}
                    items={scanLog.map((entry) => ({
                      children: <Text type="secondary" style={{ fontSize: 11 }}>{entry}</Text>,
                    }))}
                  />
                ),
              }]}
            />
          )}
        </Space>
      </Card>
    </div>
  );
}

export default LiveGuard;
