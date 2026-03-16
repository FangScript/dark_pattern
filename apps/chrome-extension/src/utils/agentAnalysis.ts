/**
 * Agent Analysis — Human-Like Phased Dark Pattern Detection
 * ===========================================================
 * Thinks like a human reviewer:
 *
 *   PHASE 1: SCAN    — Scroll entire page, screenshot every viewport. No analysis.
 *   PHASE 2: ANALYZE — Send each screenshot to VLM independently. Each = own dataset image.
 *   PHASE 3: INTERACT — Click suspicious elements (dropdowns, "See More", etc.)
 *   PHASE 4: RE-ANALYZE — Screenshot + analyze each interaction result.
 *
 * Every screenshot is its OWN training image with viewport-relative bboxes.
 * No mixing. No misalignment. Quality matches manual annotation.
 */

import { autoLabelScreenshot, autoLabelDOMOnly, isImageSupportError } from './autoLabeling';
import type { AutoLabel } from './datasetDB';
import { getActiveModelConfig } from './aiConfig';
import { executeWithRateLimit, getAgentLimits } from './rateLimiter';
import { captureTabScreenshot } from './screenshotCapture';
import { AIActionType, callAIWithObjectResponse } from '@darkpatternhunter/core/ai-model';
import type { AIArgs } from '@darkpatternhunter/core/ai-model';

// ── Types ─────────────────────────────────────────────────────────────────────

/** One viewport screenshot + the patterns detected in it */
export interface ViewportCapture {
  screenshot: string;           // base64 data URL (JPEG or PNG)
  patterns: AutoLabel[];        // patterns with bboxes RELATIVE to this screenshot (device pixels)
  viewportWidth: number;        // CSS pixels
  viewportHeight: number;       // CSS pixels
  scrollY: number;              // CSS pixels — page scroll offset when captured
  devicePixelRatio: number;     // DPR at capture time (screenshot is viewportWidth × DPR wide)
  stepLabel: string;            // "scan-0", "scan-1", "interact-expand", etc.
  phase: 'scan' | 'interact';  // which phase produced this viewport
}

export interface AgentAnalysisResult {
  patterns: AutoLabel[];        // all patterns across all viewports (flat)
  viewports: ViewportCapture[]; // every viewport = one YOLO training image
  agentSteps: string[];         // human-readable log
  screenshotCount: number;
  usedVision: boolean;
}

// ── Vision mode detection ────────────────────────────────────────────────────

let _visionCapable: boolean | null = null;

function setVisionCapable(capable: boolean) {
  _visionCapable = capable;
  console.log(`[agent] Vision: ${capable ? 'ENABLED' : 'DISABLED (DOM-only)'}`);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function capture(tabId: number): Promise<string> {
  return captureTabScreenshot(tabId);
}

async function getDOMText(tabId: number): Promise<string> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });
    return results[0]?.result ?? '';
  } catch {
    return '';
  }
}

async function getTabUrl(tabId: number): Promise<string> {
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab.url ?? '';
  } catch {
    return '';
  }
}

async function getViewportMeta(tabId: number) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Find the true scroll height across different browser implementations
      const scrollHeight = Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      );
      
      return {
        w: window.innerWidth,
        h: window.innerHeight,
        y: Math.round(window.scrollY || document.documentElement.scrollTop),
        scrollHeight: scrollHeight,
        dpr: window.devicePixelRatio || 1,
      };
    },
  });
  return results[0]?.result ?? { w: 1280, h: 720, y: 0, scrollHeight: 3000, dpr: 1 };
}

async function scrollTo(tabId: number, position: 'top' | 'down'): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (pos: string) => {
      const scrollEl = document.scrollingElement || document.documentElement;
      if (pos === 'top') {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        scrollEl.scrollTop = 0;
      } else {
        const step = window.innerHeight * 0.85;
        window.scrollBy({ top: step, behavior: 'instant' });
        scrollEl.scrollTop += step;
      }
    },
    args: [position],
  });
  // Wait for lazy-loaded content to render
  await new Promise((r) => setTimeout(r, 1200));
}

async function dismissPopups(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selectors = [
          '[data-testid*="close"]', '[aria-label*="close" i]', '[aria-label*="dismiss" i]',
          '.cookie-accept', '#cookie-accept', '.popup-close', '.modal-close',
          'button[class*="close"]', 'button[class*="dismiss"]', 'button[class*="reject"]',
          '[class*="cookie"] button', '[class*="popup"] button[class*="close"]',
          '[class*="consent"] button', '[class*="banner"] [class*="close"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel) as HTMLElement | null;
          if (el) { el.click(); break; }
        }
      },
    });
    await new Promise((r) => setTimeout(r, 800));
  } catch {
    // ignore
  }
}

// ── Viewport width lock ──────────────────────────────────────────────────────
// When the extension panel is open, it reduces the browser window width which
// shrinks `window.innerWidth` in the target tab. This causes inconsistent
// screenshots. We neutralage this by injecting CSS that forces the root element
// to behave as a 1280px wide viewport regardless of the actual window width.
const TARGET_VIEWPORT_WIDTH = 1280;

async function lockViewportWidth(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (targetWidth: number) => {
        // Remove any previous lock style
        const existing = document.getElementById('__dph_viewport_lock__');
        if (existing) existing.remove();

        const style = document.createElement('style');
        style.id = '__dph_viewport_lock__';
        style.textContent = `
          /* Dark Pattern Hunter — viewport lock for consistent screenshots */
          html, body {
            min-width: ${targetWidth}px !important;
            overflow-x: visible !important;
          }
          meta[name="viewport"] { content: "width=${targetWidth}" !important; }
        `;
        document.head.appendChild(style);

        // Also update the viewport meta tag if present
        const metaViewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
        if (metaViewport) {
          metaViewport.content = `width=${targetWidth}`;
        }
      },
      args: [TARGET_VIEWPORT_WIDTH],
    });
    // Give layout one tick to stabilise
    await new Promise((r) => setTimeout(r, 400));
  } catch {
    // Optional — non-fatal if CSP blocks script injection
    console.warn('[agent] Could not lock viewport width (CSP may have blocked it)');
  }
}

// ── Single screenshot analysis ──────────────────────────────────────────────

async function analyzeScreenshot(
  screenshot: string,
  tabId: number,
  label: string,
): Promise<AutoLabel[]> {
  const dom = await getDOMText(tabId);
  const url = await getTabUrl(tabId);

  // If we already know vision doesn't work → DOM-only
  if (_visionCapable === false) {
    try {
      const labels = await autoLabelDOMOnly(dom, url);
      console.log(`[agent] [${label}] DOM-only → ${labels.length} patterns`);
      return labels;
    } catch (err) {
      console.error(`[agent] [${label}] DOM-only failed:`, err);
      return [];
    }
  }

  // Try vision
  try {
    const labels = await autoLabelScreenshot(screenshot, dom);
    if (_visionCapable === null) setVisionCapable(true);
    console.log(`[agent] [${label}] Vision → ${labels.length} patterns`);
    return labels;
  } catch (err) {
    if (isImageSupportError(err)) {
      setVisionCapable(false);
      console.warn(`[agent] Vision not supported, switching to DOM-only`);
      try {
        const labels = await autoLabelDOMOnly(dom, url);
        console.log(`[agent] [${label}] DOM-only fallback → ${labels.length} patterns`);
        return labels;
      } catch {
        return [];
      }
    }
    console.error(`[agent] [${label}] Analysis failed:`, err);
    return [];
  }
}

// ── VLM helper for interaction decisions ────────────────────────────────────

async function callVLM<T>(prompt: string, screenshot?: string): Promise<T | null> {
  const modelConfig = await getActiveModelConfig();
  if (!modelConfig?.modelName) return null;

  const userContent = screenshot && _visionCapable !== false
    ? [
        { type: 'image_url' as const, image_url: { url: screenshot } },
        { type: 'text' as const, text: prompt },
      ]
    : prompt;

  const args: AIArgs = [
    { role: 'system', content: 'Return valid JSON only. No markdown.' },
    { role: 'user', content: userContent },
  ];

  try {
    const response = await executeWithRateLimit(
      () => callAIWithObjectResponse<T>(args, AIActionType.EXTRACT_DATA, modelConfig),
      { label: `agent-analysis-scan-${screenshot ? 'vision' : 'dom'}` },
    );
    return response?.content ?? null;
  } catch (err) {
    if (screenshot && isImageSupportError(err)) setVisionCapable(false);
    return null;
  }
}

// ── Interaction helpers ─────────────────────────────────────────────────────

interface InteractiveElement {
  description: string;
  selector: string;
  type: 'expand' | 'dropdown' | 'tab' | 'accordion';
}

async function findInteractiveElements(tabId: number): Promise<InteractiveElement[]> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const found: Array<{ description: string; selector: string; type: string }> = [];
        
        // Find "See More" / "Show More" / "View All" buttons
        const allClickables = Array.from(document.querySelectorAll('button, a, [role="button"], details > summary'));
        const expandKeywords = ['see more', 'show more', 'view all', 'view more', 'read more', 'load more', 'expand', 'show details'];
        
        for (const el of allClickables) {
          const text = (el.textContent || '').trim().toLowerCase();
          if (text.length > 50) continue; // Skip long text elements
          
          for (const kw of expandKeywords) {
            if (text.includes(kw)) {
              const tag = el.tagName.toLowerCase();
              const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
              found.push({
                description: text.substring(0, 40),
                selector: `${tag}${cls}`,
                type: 'expand',
              });
              break;
            }
          }
        }

        // Find <details> elements (accordions)
        const details = Array.from(document.querySelectorAll('details:not([open])'));
        for (const d of details) {
          const summary = d.querySelector('summary');
          if (summary) {
            found.push({
              description: (summary.textContent || '').trim().substring(0, 40),
              selector: 'details summary',
              type: 'accordion',
            });
          }
        }

        // Find dropdowns / select elements with relevant labels
        const selects = Array.from(document.querySelectorAll('select'));
        for (const s of selects) {
          const label = s.getAttribute('aria-label') || s.name || '';
          if (label) {
            found.push({
              description: label.substring(0, 40),
              selector: `select[name="${s.name}"]`,
              type: 'dropdown',
            });
          }
        }

        return found.slice(0, 5); // Max 5 interactions
      },
    });
    return (results[0]?.result ?? []) as InteractiveElement[];
  } catch {
    return [];
  }
}

async function clickElement(tabId: number, element: InteractiveElement): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (desc: string) => {
        const allClickables = Array.from(document.querySelectorAll('button, a, [role="button"], details > summary'));
        const keywords = desc.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        
        const match = allClickables.find((el) => {
          const text = (el.textContent || '').toLowerCase();
          return keywords.some((kw) => text.includes(kw));
        }) as HTMLElement | null;

        if (match) {
          match.scrollIntoView({ behavior: 'instant', block: 'center' });
          match.click();
          return true;
        }
        return false;
      },
      args: [element.description],
    });

    if (results[0]?.result) {
      await new Promise((r) => setTimeout(r, 1500)); // Wait for content to load
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Deduplication ──────────────────────────────────────────────────────────

function deduplicatePatterns(patterns: AutoLabel[]): AutoLabel[] {
  const seen = new Set<string>();
  return patterns.filter((p) => {
    const key = `${p.category}::${(p.description ?? p.evidence ?? '').substring(0, 80)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN AGENT LOOP — Human-Like Phased Approach
// ═══════════════════════════════════════════════════════════════════════════

export async function runAgentLoop(
  tabId: number,
  onProgress: (msg: string) => void = () => {},
): Promise<AgentAnalysisResult> {
  // Reset vision detection
  _visionCapable = null;

  const agentSteps: string[] = [];
  const viewports: ViewportCapture[] = [];
  let screenshotCount = 0;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PRE-PHASE: Lock viewport to a consistent 1280px width
  //  This prevents the extension panel width from shrinking `window.innerWidth`
  //  and producing inconsistent/narrow screenshots.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await lockViewportWidth(tabId);
  agentSteps.push(`pre-phase: viewport locked to ${TARGET_VIEWPORT_WIDTH}px`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PHASE 0: Dismiss popups/overlays
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onProgress('Phase 0: Dismissing popups...');
  await dismissPopups(tabId);
  await scrollTo(tabId, 'top');
  agentSteps.push('phase-0: dismissed popups');


  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PHASE 1: SCAN — Screenshot every viewport of the page
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onProgress('Phase 1: Scanning full page (capturing all viewports)...');
  
  interface RawCapture {
    screenshot: string;
    scrollY: number;
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
    index: number;
  }
  
  const rawCaptures: RawCapture[] = [];

  try {
    const meta = await getViewportMeta(tabId);
    const agentLimits = await getAgentLimits();
    const totalScrollSteps = Math.min(
      Math.ceil(meta.scrollHeight / (meta.h * 0.85)),
      agentLimits.maxViewports, // Dynamic based on provider
    );

    console.log(`[agent] Phase 1: Scanning ${totalScrollSteps} viewports (page=${meta.scrollHeight}px, viewport=${meta.h}px)`);

    for (let i = 0; i < totalScrollSteps; i++) {
      if (i > 0) await scrollTo(tabId, 'down');

      try {
        const screenshot = await capture(tabId);
        const vmeta = await getViewportMeta(tabId);
        screenshotCount++;

        rawCaptures.push({
          screenshot,
          scrollY: vmeta.y,
          viewportWidth: vmeta.w,
          viewportHeight: vmeta.h,
          devicePixelRatio: vmeta.dpr,
          index: i,
        });

        onProgress(`Phase 1: Captured viewport ${i + 1}/${totalScrollSteps}`);
        console.log(`[agent] Phase 1: Viewport ${i} captured (scrollY=${vmeta.y})`);
      } catch (err) {
        console.warn(`[agent] Phase 1: Failed to capture viewport ${i}:`, err);
      }
    }
  } catch (err) {
    console.error('[agent] Phase 1 failed:', err);
  }

  agentSteps.push(`phase-1: captured ${rawCaptures.length} viewports`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PHASE 2: ANALYZE — Detect dark patterns in each captured screenshot
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onProgress(`Phase 2: Analyzing ${rawCaptures.length} screenshots for dark patterns...`);

  for (const cap of rawCaptures) {
    try {
      onProgress(`Phase 2: Analyzing viewport ${cap.index + 1}/${rawCaptures.length}...`);

      // Scroll back to this position for DOM context
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (y: number) => window.scrollTo({ top: y, behavior: 'instant' }),
        args: [cap.scrollY],
      });
      await new Promise((r) => setTimeout(r, 300));

      const patterns = await analyzeScreenshot(cap.screenshot, tabId, `scan-${cap.index}`);

      viewports.push({
        screenshot: cap.screenshot,
        patterns,
        viewportWidth: cap.viewportWidth,
        viewportHeight: cap.viewportHeight,
        scrollY: cap.scrollY,
        devicePixelRatio: cap.devicePixelRatio,
        stepLabel: `scan-${cap.index}`,
        phase: 'scan',
      });

      agentSteps.push(`phase-2: viewport-${cap.index} → ${patterns.length} patterns`);
      console.log(`[agent] Phase 2: Viewport ${cap.index} → ${patterns.length} patterns`);
    } catch (err) {
      console.error(`[agent] Phase 2: Viewport ${cap.index} analysis failed:`, err);
    }
  }

  const scanPatternCount = viewports.reduce((sum, v) => sum + v.patterns.length, 0);
  agentSteps.push(`phase-2: total ${scanPatternCount} patterns across ${viewports.length} viewports`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  PHASE 3: INTERACT — Click/expand elements to reveal hidden content
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onProgress('Phase 3: Finding interactive elements...');
  await scrollTo(tabId, 'top');
  await new Promise((r) => setTimeout(r, 500));

  const interactiveElements = await findInteractiveElements(tabId);
  const agentLimits = await getAgentLimits();
  const limitedInteractions = interactiveElements.slice(0, agentLimits.maxInteractions);
  
  console.log(`[agent] Phase 3: Found ${interactiveElements.length}, processing max ${limitedInteractions}`);
  agentSteps.push(`phase-3: found ${interactiveElements.length}, limit ${agentLimits.maxInteractions}`);

  for (const element of limitedInteractions) {
    try {
      onProgress(`Phase 3: Clicking "${element.description}"...`);
      const clicked = await clickElement(tabId, element);
      
      if (!clicked) {
        console.log(`[agent] Phase 3: Could not click "${element.description}"`);
        continue;
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      //  PHASE 4: RE-ANALYZE — Screenshot + analyze after interaction
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      onProgress(`Phase 4: Analyzing after clicking "${element.description}"...`);

      const screenshot = await capture(tabId);
      const vmeta = await getViewportMeta(tabId);
      screenshotCount++;

      const patterns = await analyzeScreenshot(screenshot, tabId, `interact-${element.type}`);

      viewports.push({
        screenshot,
        patterns,
        viewportWidth: vmeta.w,
        viewportHeight: vmeta.h,
        scrollY: vmeta.y,
        devicePixelRatio: vmeta.dpr,
        stepLabel: `interact-${element.type}-${element.description.substring(0, 20)}`,
        phase: 'interact',
      });

      agentSteps.push(`phase-4: ${element.type}("${element.description}") → ${patterns.length} patterns`);
      console.log(`[agent] Phase 4: ${element.type}("${element.description}") → ${patterns.length} patterns`);
    } catch (err) {
      console.warn(`[agent] Phase 3-4: Interaction failed for "${element.description}":`, err);
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  FINALIZE — Deduplicate and return
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  onProgress('Finalizing results...');

  // Collect all patterns across all viewports, tagging them with their source viewport
  const allPatterns: AutoLabel[] = [];
  viewports.forEach((v, vIdx) => {
    // Stamp the viewportIndex onto each pattern before pushing
    v.patterns.forEach(p => {
      p.viewportIndex = vIdx;
      allPatterns.push(p);
    });
  });

  const deduped = deduplicatePatterns(allPatterns);
  const viewportsWithPatterns = viewports.filter((v) => v.patterns.length > 0);

  const modeLabel = _visionCapable === false ? 'DOM-only' : 'Vision+DOM';
  console.log(`[agent] ✅ COMPLETE: ${deduped.length} unique patterns | ${viewportsWithPatterns.length} annotated viewports | ${screenshotCount} screenshots | ${modeLabel}`);

  agentSteps.push(`DONE: ${deduped.length} patterns, ${viewportsWithPatterns.length} viewports, ${screenshotCount} screenshots`);

  return {
    patterns: deduped,
    viewports,
    agentSteps,
    screenshotCount,
    usedVision: _visionCapable === true,
  };
}

/**
 * API compatibility shim.
 */
export async function agentPatternsToAutoLabels(
  patterns: AutoLabel[],
): Promise<AutoLabel[]> {
  return patterns;
}
