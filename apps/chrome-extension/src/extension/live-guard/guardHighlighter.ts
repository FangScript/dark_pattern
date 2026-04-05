/**
 * Live Guard Content Script
 * Handles highlighting of detected dark patterns on the page using Shadow DOM
 */

import { getDebug } from '@darkpatternhunter/shared/logger';
import {
  type BBox,
  type ScreenshotSize,
  type ScrollPosition,
  type ViewportSize,
  getCanvasToDomCoords,
  getDevicePixelRatio,
  getScrollPosition,
  getViewportSize,
  isValidBbox,
} from '../../utils/coordinateMapping';

const debug = getDebug('live-guard-content');

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
  /** dom = document-space CSS px from text grounding; vlm = normalized screenshot bbox fallback */
  bboxSource?: 'dom' | 'vlm';
  counterMeasure: string;
  scrollY?: number;                          // page scroll offset when screenshot was taken
  screenshotSize?: ScreenshotSize;           // dimensions of the viewport screenshot
}

// Extended pattern interface with screenshot metadata
interface PatternWithMetadata extends DetectedPattern {
  screenshotSize?: ScreenshotSize;
  isNormalized?: boolean;
}

// Store current highlights
let currentHighlights: HTMLElement[] = [];
let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let currentScreenshotSize: ScreenshotSize | null = null;

/**
 * Initialize Shadow DOM for highlights
 */
function initShadowDOM(): void {
  if (shadowHost && shadowRoot) {
    return; // Already initialized
  }

  // Create a host element for the shadow DOM
  shadowHost = document.createElement('div');
  shadowHost.id = 'live-guard-shadow-host';
  shadowHost.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 999999;
  `;

  // Attach shadow DOM
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Add styles to shadow DOM
  const style = document.createElement('style');
  style.textContent = `
    .live-guard-highlight {
      position: absolute;
      border: 2.5px solid;
      border-radius: 4px;
      pointer-events: auto;
      cursor: pointer;
      /* Tight, precise box — low bg so you can see the element underneath */
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.3), 0 0 6px rgba(0,0,0,0.25);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      animation: liveGuardPulse 2.5s ease-in-out infinite;
      box-sizing: border-box;
    }

    .live-guard-highlight:hover {
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5), 0 0 12px rgba(0,0,0,0.4);
      animation: none;
      opacity: 1 !important;
    }

    @keyframes liveGuardPulse {
      0%, 100% { opacity: 0.65; }
      50%       { opacity: 1;    }
    }

    /* Small badge shown when no precise bbox is available */
    .live-guard-badge {
      position: absolute;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: white;
      pointer-events: auto;
      cursor: default;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      opacity: 0.9;
    }

    .live-guard-tooltip {
      position: fixed;
      background: white;
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000000;
      max-width: 350px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      animation: liveGuardFadeIn 0.3s ease;
      pointer-events: auto;
    }

    @keyframes liveGuardFadeIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .live-guard-tooltip-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid #f0f0f0;
    }

    .live-guard-severity-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .live-guard-severity-badge.critical {
      background: #ff4d4f;
      color: white;
    }

    .live-guard-severity-badge.high {
      background: #ff7a45;
      color: white;
    }

    .live-guard-severity-badge.medium {
      background: #ffa940;
      color: white;
    }

    .live-guard-severity-badge.low {
      background: #52c41a;
      color: white;
    }

    .live-guard-tooltip-body p {
      margin: 0 0 8px 0;
      color: #595959;
    }

    .live-guard-counter-measure {
      background: #f6ffed;
      border: 1px solid #b7eb8f;
      border-radius: 4px;
      padding: 8px;
      margin-top: 8px;
    }

    .live-guard-counter-measure strong {
      color: #389e0d;
      display: block;
      margin-bottom: 4px;
    }

    .live-guard-counter-measure p {
      margin: 0;
      color: #389e0d;
    }
  `;
  shadowRoot.appendChild(style);

  // Append host to document body
  document.body.appendChild(shadowHost);

  debug('Shadow DOM initialized');
}

/**
 * Clear all highlights from the page
 */
function clearHighlights(): void {
  currentHighlights.forEach((highlight) => {
    highlight.remove();
  });
  currentHighlights = [];

  // Remove tooltip if exists
  const tooltip = shadowRoot?.querySelector('.live-guard-tooltip');
  if (tooltip) {
    tooltip.remove();
  }

  debug('Cleared all highlights');
}

/**
 * Get color based on severity
 */
function getSeverityColor(severity: string): { bg: string; border: string; badge: string } {
  const colors = {
    // Low opacity bg keeps the highlight tight and non-intrusive
    critical: { bg: 'rgba(255, 77, 79, 0.10)', border: '#ff4d4f', badge: '#cf1322' },
    high:     { bg: 'rgba(255, 122, 69, 0.10)', border: '#ff7a45', badge: '#d4380d' },
    medium:   { bg: 'rgba(255, 169, 64, 0.10)', border: '#ffa940', badge: '#d46b08' },
    low:      { bg: 'rgba(82, 196, 26, 0.10)',  border: '#52c41a', badge: '#389e0d' },
  };
  return colors[severity as keyof typeof colors] || colors.low;
}

/**
 * Decide whether to prefer the AI-mapped bbox over the snapped DOM element.
 * If the DOM element is more than MAX_SNAP_RATIO times larger in area than
 * the AI bbox, the element is too big (e.g. a container or body) — use AI coords.
 */
const MAX_SNAP_RATIO = 3.0;

function shouldUseAICoords(
  aiWidth: number, aiHeight: number,
  elemWidth: number, elemHeight: number,
): boolean {
  const aiArea = Math.max(aiWidth * aiHeight, 1);
  const elemArea = elemWidth * elemHeight;
  return elemArea / aiArea > MAX_SNAP_RATIO;
}

/**
 * Create a tight, precise highlight overlay for a detected pattern.
 *
 * Strategy (in order of preference):
 *  0. DOM-grounded — evidence-based bbox in document CSS pixels (no VLM mapping).
 *  1. DOM snap  — if we find the actual element AND it's not disproportionately
 *                 larger than the AI bbox, use its exact client rect.
 *  2. AI coords — use the mapped AI bbox directly (more precise than a huge parent).
 *  3. Badge     — if no bbox or screenshot size, render a small label instead of
 *                 covering the whole page.
 */
function createHighlightOverlay(
  pattern: PatternWithMetadata,
  index: number,
): HTMLElement {
  const colors = getSeverityColor(pattern.severity);
  const effectiveScreenshotSize = pattern.screenshotSize ?? currentScreenshotSize;
  const captureScrollY = pattern.scrollY ?? 0;

  // ── Case 0: Text-grounded bbox (document coordinates, CSS px) ────────────
  if (pattern.bboxSource === 'dom' && pattern.bbox) {
    const domBbox: BBox = {
      x: pattern.bbox[0],
      y: pattern.bbox[1],
      width: pattern.bbox[2],
      height: pattern.bbox[3],
    };
    if (!isValidBbox(domBbox)) {
      debug('Invalid DOM bbox — badge for:', pattern.type);
      const badge = document.createElement('div');
      badge.className = 'live-guard-badge';
      badge.dataset.patternIndex = String(index);
      badge.dataset.patternType = pattern.type;
      badge.dataset.severity = pattern.severity;
      badge.style.cssText = `
        background-color: ${colors.badge};
        top: ${16 + index * 32}px;
        right: 16px;
      `;
      badge.textContent = `⚠ ${pattern.type}`;
      badge.addEventListener('mouseenter', () => showTooltip(pattern, badge));
      badge.addEventListener('mouseleave', () => hideTooltip());
      return badge;
    }
    const overlay = document.createElement('div');
    overlay.className = 'live-guard-highlight';
    overlay.dataset.patternIndex = String(index);
    overlay.dataset.patternType = pattern.type;
    overlay.dataset.severity = pattern.severity;
    overlay.style.cssText = `
      background-color: ${colors.bg};
      border-color: ${colors.border};
      left: ${domBbox.x}px;
      top: ${domBbox.y}px;
      width: ${domBbox.width}px;
      height: ${domBbox.height}px;
    `;
    overlay.addEventListener('mouseenter', () => showTooltip(pattern, overlay));
    overlay.addEventListener('mouseleave', () => hideTooltip());
    debug('DOM-grounded highlight:', domBbox);
    return overlay;
  }

  // ── Case 3: No bbox info → render a small badge in the top-right corner ──
  if (!pattern.bbox || !effectiveScreenshotSize) {
    const badge = document.createElement('div');
    badge.className = 'live-guard-badge';
    badge.dataset.patternIndex = String(index);
    badge.dataset.patternType = pattern.type;
    badge.dataset.severity = pattern.severity;
    badge.style.cssText = `
      background-color: ${colors.badge};
      top: ${16 + index * 32}px;
      right: 16px;
    `;
    badge.textContent = `⚠ ${pattern.type}`;
    badge.addEventListener('mouseenter', () => showTooltip(pattern, badge));
    badge.addEventListener('mouseleave', () => hideTooltip());
    debug('No bbox — rendering badge for:', pattern.type);
    return badge;
  }

  const bbox: BBox = {
    x: pattern.bbox[0],
    y: pattern.bbox[1],
    width: pattern.bbox[2],
    height: pattern.bbox[3],
  };

  // ── Case 3b: Bbox exists but is invalid → badge ────────────────────────────
  if (!isValidBbox(bbox)) {
    debug('Invalid bbox — rendering badge for:', pattern.type);
    const badge = document.createElement('div');
    badge.className = 'live-guard-badge';
    badge.dataset.patternIndex = String(index);
    badge.dataset.patternType = pattern.type;
    badge.dataset.severity = pattern.severity;
    badge.style.cssText = `
      background-color: ${colors.badge};
      top: ${16 + index * 32}px;
      right: 16px;
    `;
    badge.textContent = `⚠ ${pattern.type}`;
    badge.addEventListener('mouseenter', () => showTooltip(pattern, badge));
    badge.addEventListener('mouseleave', () => hideTooltip());
    return badge;
  }

  // ── Build overlay div ─────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'live-guard-highlight';
  overlay.dataset.patternIndex = String(index);
  overlay.dataset.patternType = pattern.type;
  overlay.dataset.severity = pattern.severity;
  overlay.style.cssText = `
    background-color: ${colors.bg};
    border-color: ${colors.border};
  `;

  // ── Map AI bbox → DOM coordinates ────────────────────────────────────────
  const viewportSize = getViewportSize();
  const dpr = getDevicePixelRatio();
  // Pass scrollY=0 so mapping is viewport-relative; we add captureScrollY manually.
  const zeroScroll: ScrollPosition = { scrollX: 0, scrollY: 0 };

  const result = getCanvasToDomCoords(
    bbox,
    effectiveScreenshotSize,
    viewportSize,
    zeroScroll,
    dpr,
    pattern.isNormalized !== false,
  );

  const aiLeft   = result.domX;
  const aiTop    = result.domY + captureScrollY;
  const aiWidth  = result.domWidth;
  const aiHeight = result.domHeight;

  // ── Case 1: Smart snap-to-element ────────────────────────────────────────
  if (result.element && result.elementRect) {
    const el   = result.element;
    const rect = result.elementRect;
    const currentScrollY = window.scrollY || 0;

    const elemLeft   = rect.left;
    const elemTop    = rect.top + currentScrollY;
    const elemWidth  = rect.width;
    const elemHeight = rect.height;

    if (shouldUseAICoords(aiWidth, aiHeight, elemWidth, elemHeight)) {
      // Element is too large (e.g. a container div) — use AI bbox directly
      overlay.style.left   = `${aiLeft}px`;
      overlay.style.top    = `${aiTop}px`;
      overlay.style.width  = `${aiWidth}px`;
      overlay.style.height = `${aiHeight}px`;
      debug('Element too large, using AI coords:', { elem: el.tagName, elemWidth, elemHeight, aiWidth, aiHeight });
    } else {
      // Good snap — element size is proportional
      overlay.style.left   = `${elemLeft}px`;
      overlay.style.top    = `${elemTop}px`;
      overlay.style.width  = `${elemWidth}px`;
      overlay.style.height = `${elemHeight}px`;
      debug('Snapped to element:', { elem: el.tagName, elemWidth, elemHeight });
    }
  } else {
    // ── Case 2: No element found — use AI coords ────────────────────────
    overlay.style.left   = `${aiLeft}px`;
    overlay.style.top    = `${aiTop}px`;
    overlay.style.width  = `${aiWidth}px`;
    overlay.style.height = `${aiHeight}px`;
    debug('No element found, using AI coords:', { aiLeft, aiTop, aiWidth, aiHeight });
  }

  overlay.addEventListener('mouseenter', () => showTooltip(pattern, overlay));
  overlay.addEventListener('mouseleave', () => hideTooltip());
  return overlay;
}

/**
 * Show tooltip with pattern details
 */
function showTooltip(pattern: DetectedPattern, element: HTMLElement): void {
  if (!shadowRoot) {
    return;
  }

  // Remove existing tooltip
  const existingTooltip = shadowRoot.querySelector('.live-guard-tooltip');
  if (existingTooltip) {
    existingTooltip.remove();
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'live-guard-tooltip';
  tooltip.innerHTML = `
    <div class="live-guard-tooltip-header">
      <strong>${pattern.type}</strong>
      <span class="live-guard-severity-badge ${pattern.severity}">${pattern.severity}</span>
    </div>
    <div class="live-guard-tooltip-body">
      <p>${pattern.description}</p>
      <div class="live-guard-counter-measure">
        <strong>Counter-Measure:</strong>
        <p>${pattern.counterMeasure}</p>
      </div>
    </div>
  `;

  // Position tooltip near the element
  const rect = element.getBoundingClientRect();
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.bottom + 10}px`;

  shadowRoot.appendChild(tooltip);
}

/**
 * Hide tooltip
 */
function hideTooltip(): void {
  if (!shadowRoot) {
    return;
  }
  const tooltip = shadowRoot.querySelector('.live-guard-tooltip');
  if (tooltip) {
    tooltip.remove();
  }
}

/**
 * Show highlights for detected patterns
 * @param patterns - Array of detected patterns
 * @param screenshotSize - Screenshot dimensions for coordinate mapping
 * @param isNormalized - Whether bbox coordinates are normalized (0-1000)
 */
function showHighlights(
  patterns: DetectedPattern[],
  screenshotSize?: ScreenshotSize,
  isNormalized = true,
): void {
  clearHighlights();

  if (screenshotSize) {
    currentScreenshotSize = screenshotSize;
  }

  initShadowDOM();

  if (!shadowRoot || !shadowHost) {
    debug('Shadow root not available');
    return;
  }

  // Stretch the host to the full document height so absolute-positioned
  // overlays at any page-Y coordinate are visible and scroll with the page.
  const docHeight = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
  );
  shadowHost.style.height = `${docHeight}px`;
  debug('Shadow host height set to', docHeight);

  patterns.forEach((pattern, index) => {
    // Each pattern carries its own screenshotSize + scrollY from the viewport it was captured in.
    // Fall back to the shared currentScreenshotSize if not present.
    const patternWithMetadata: PatternWithMetadata = {
      ...pattern,
      screenshotSize: pattern.screenshotSize ?? currentScreenshotSize ?? undefined,
      // DOM-grounded boxes skip normalized VLM mapping inside createHighlightOverlay
      isNormalized: pattern.bboxSource === 'dom' ? false : isNormalized,
    };
    const highlight = createHighlightOverlay(patternWithMetadata, index);
    shadowRoot!.appendChild(highlight);
    currentHighlights.push(highlight);
  });

  debug(`Added ${patterns.length} highlights across multiple viewports`);
}

/**
 * Focus on a specific pattern highlight
 * Changes highlight color and scrolls element into view
 * @param patternIndex - Index of the pattern to focus
 */
function focusPattern(patternIndex: number): void {
  if (!currentHighlights[patternIndex]) {
    debug('Pattern highlight not found:', patternIndex);
    return;
  }

  const highlight = currentHighlights[patternIndex];

  // Change highlight color to bright yellow for focus
  highlight.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
  highlight.style.borderColor = '#ffeb3b';
  highlight.style.boxShadow = '0 0 20px rgba(255, 235, 59, 0.8)';

  // Get the element associated with this highlight
  const patternType = highlight.dataset.patternType;
  const severity = highlight.dataset.severity;

  debug('Focusing on pattern:', { patternIndex, patternType, severity });

  // Scroll the highlight into view
  highlight.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
  });

  // Reset other highlights to their original colors
  currentHighlights.forEach((h, idx) => {
    if (idx !== patternIndex) {
      const hSeverity = h.dataset.severity || 'low';
      const colors = getSeverityColor(hSeverity);
      h.style.backgroundColor = colors.bg;
      h.style.borderColor = colors.border;
      h.style.boxShadow = `0 0 10px ${colors.bg}`;
    }
  });
}

/**
 * Reset all highlights to their original colors
 */
function resetHighlightColors(): void {
  currentHighlights.forEach((highlight) => {
    const severity = highlight.dataset.severity || 'low';
    const colors = getSeverityColor(severity);
    highlight.style.backgroundColor = colors.bg;
    highlight.style.borderColor = colors.border;
    highlight.style.boxShadow = `0 0 10px ${colors.bg}`;
  });
}

/**
 * Listen for messages from sidebar
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debug('Received message:', message);

  switch (message.action) {
    case LIVE_GUARD_MESSAGES.CLEAR_HIGHLIGHTS:
      clearHighlights();
      sendResponse({ success: true });
      break;

    case LIVE_GUARD_MESSAGES.SHOW_HIGHLIGHTS:
      showHighlights(
        message.patterns,
        message.screenshotSize,
        message.isNormalized,
      );
      sendResponse({ success: true });
      break;

    case LIVE_GUARD_MESSAGES.FOCUS_PATTERN:
      focusPattern(message.patternIndex);
      sendResponse({ success: true });
      break;

    default:
      debug('Unknown message action:', message.action);
  }

  return true; // Keep message channel open for async response
});

/**
 * Initialize content script
 */
function init(): void {
  debug('Live Guard content script initialized');

  // Initialize Shadow DOM
  initShadowDOM();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for testing
export { clearHighlights, showHighlights, createHighlightOverlay };
