/**
 * Live Guard Content Script
 * Handles highlighting of detected dark patterns on the page using Shadow DOM
 */

import { getDebug } from '@darkpatternhunter/shared/logger';
import {
  type BBox,
  type ScreenshotSize,
  getViewportSize,
  isValidBbox,
} from '../../utils/coordinateMapping';

const debug = getDebug('live-guard-content');

// Message types for Live Guard
const LIVE_GUARD_MESSAGES = {
  SCAN_PAGE: 'live-guard-scan-page',
  CLEAR_HIGHLIGHTS: 'live-guard-clear-highlights',
  SHOW_HIGHLIGHTS: 'live-guard-show-highlights',
  APPEND_HIGHLIGHTS: 'live-guard-append-highlights',
  FOCUS_PATTERN: 'live-guard-focus-pattern',
  UNFOCUS_PATTERN: 'live-guard-unfocus-pattern',
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
  /** Capture index for multi-viewport scans (optional) */
  viewportIndex?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportId?: string;
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
let focusedPatternIndex: number | null = null;
let focusMaskTop: HTMLElement | null = null;
let focusMaskLeft: HTMLElement | null = null;
let focusMaskRight: HTMLElement | null = null;
let focusMaskBottom: HTMLElement | null = null;

/** Cleanup scroll/resize listeners that keep highlights aligned with the page */
let highlightScrollResizeCleanup: (() => void) | null = null;

function detachHighlightScrollResizeSync(): void {
  highlightScrollResizeCleanup?.();
  highlightScrollResizeCleanup = null;
}

/**
 * Shadow host is positioned against the viewport ICB; child `top`/`left` must be
 * **client** (viewport) coordinates. We store document-space boxes on `dataset` and
 * refresh client `left`/`top` on scroll/resize.
 */
function syncOneHighlightClientPosition(el: HTMLElement): void {
  if (el.dataset.docLeft === undefined || el.dataset.docTop === undefined) {
    return;
  }
  const docLeft = Number(el.dataset.docLeft);
  const docTop = Number(el.dataset.docTop);
  const w = Number(el.dataset.docWidth);
  const h = Number(el.dataset.docHeight);
  if (!Number.isFinite(docLeft) || !Number.isFinite(docTop)) {
    return;
  }
  el.style.position = 'absolute';
  el.style.left = `${docLeft - (window.scrollX || 0)}px`;
  el.style.top = `${docTop - (window.scrollY || 0)}px`;
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }
}

function syncAllHighlightClientPositions(): void {
  currentHighlights.forEach(syncOneHighlightClientPosition);
  if (
    focusedPatternIndex !== null &&
    currentHighlights[focusedPatternIndex]
  ) {
    const rect = currentHighlights[focusedPatternIndex].getBoundingClientRect();
    showFocusMask(rect);
  }
}

function attachHighlightScrollResizeSync(): void {
  detachHighlightScrollResizeSync();
  const onScrollOrResize = () => syncAllHighlightClientPositions();
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize, true);
  highlightScrollResizeCleanup = () => {
    window.removeEventListener('scroll', onScrollOrResize, true);
    window.removeEventListener('resize', onScrollOrResize, true);
  };
}

/** Persist document-space rect and apply initial client-space geometry */
function bindHighlightToDocumentRect(
  el: HTMLElement,
  docLeft: number,
  docTop: number,
  width: number,
  height: number,
): void {
  el.dataset.docLeft = String(docLeft);
  el.dataset.docTop = String(docTop);
  el.dataset.docWidth = String(width);
  el.dataset.docHeight = String(height);
  syncOneHighlightClientPosition(el);
}

function setMaskRect(
  el: HTMLElement | null,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  if (!el) return;
  const safeWidth = Math.max(0, Math.round(width));
  const safeHeight = Math.max(0, Math.round(height));
  if (safeWidth <= 0 || safeHeight <= 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.style.width = `${safeWidth}px`;
  el.style.height = `${safeHeight}px`;
}

function hideFocusMask(): void {
  [focusMaskTop, focusMaskLeft, focusMaskRight, focusMaskBottom].forEach(
    (el) => {
      if (el) el.style.display = 'none';
    },
  );
}

function showFocusMask(targetRect: DOMRect): void {
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const left = Math.max(0, Math.min(vw, targetRect.left));
  const top = Math.max(0, Math.min(vh, targetRect.top));
  const right = Math.max(0, Math.min(vw, targetRect.right));
  const bottom = Math.max(0, Math.min(vh, targetRect.bottom));
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  setMaskRect(focusMaskTop, 0, 0, vw, top);
  setMaskRect(focusMaskLeft, 0, top, left, height);
  setMaskRect(focusMaskRight, right, top, vw - right, height);
  setMaskRect(focusMaskBottom, 0, bottom, vw, vh - bottom);
}

/**
 * Hit-test at the VLM box center in **current** viewport coordinates, using the
 * capture scroll offset so we do not sample the wrong row when the page has moved.
 */
function elementFromPointForCaptureCenter(
  result: { domX: number; domY: number; domWidth: number; domHeight: number },
  captureScrollY: number,
): { element: Element | null; elementRect: DOMRect | null } {
  const sx = window.scrollX || 0;
  const sy = window.scrollY || 0;
  const centerVx = result.domX + result.domWidth / 2;
  const centerVy = result.domY + result.domHeight / 2;
  const docCenterX = sx + centerVx;
  const docCenterY = captureScrollY + centerVy;
  const clientX = docCenterX - sx;
  const clientY = docCenterY - sy;
  try {
    const element = document.elementFromPoint(clientX, clientY);
    if (!element) {
      return { element: null, elementRect: null };
    }
    return { element, elementRect: element.getBoundingClientRect() };
  } catch {
    return { element: null, elementRect: null };
  }
}

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
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
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

    .live-guard-focus-mask {
      position: fixed;
      pointer-events: none;
      z-index: 999998;
      backdrop-filter: blur(2px);
      -webkit-backdrop-filter: blur(2px);
      background: rgba(0, 0, 0, 0.15);
      display: none;
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

  focusMaskTop = document.createElement('div');
  focusMaskTop.className = 'live-guard-focus-mask';
  focusMaskLeft = document.createElement('div');
  focusMaskLeft.className = 'live-guard-focus-mask';
  focusMaskRight = document.createElement('div');
  focusMaskRight.className = 'live-guard-focus-mask';
  focusMaskBottom = document.createElement('div');
  focusMaskBottom.className = 'live-guard-focus-mask';

  shadowRoot.appendChild(focusMaskTop);
  shadowRoot.appendChild(focusMaskLeft);
  shadowRoot.appendChild(focusMaskRight);
  shadowRoot.appendChild(focusMaskBottom);

  // Append host to document body
  document.body.appendChild(shadowHost);

  debug('Shadow DOM initialized');
}

/**
 * Clear all highlights from the page
 */
function clearHighlights(): void {
  detachHighlightScrollResizeSync();
  focusedPatternIndex = null;
  hideFocusMask();
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
/** Light snap guard: only snap if target element area is close enough */
const MAX_SNAP_RATIO = 2.0;

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
 * Strategy (hybrid VLM-first):
 *  0. Legacy DOM-grounded — if bboxSource === 'dom', bbox is document CSS px (rare).
 *  1. Light snap — elementFromPoint at AI center; if not much larger than AI box, snap.
 *  2. VLM coords — normalized bbox mapped to document space (+ capture scrollY).
 *  3. Badge — if no bbox or screenshot size, small label instead of full-page cover.
 *
 * All full rectangles are stored in **document** space (`dataset.doc*`) and converted
 * to client `left`/`top` on each scroll/resize so multi-viewport captures stay aligned.
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
      position: absolute;
      background-color: ${colors.bg};
      border-color: ${colors.border};
    `;
    bindHighlightToDocumentRect(overlay, domBbox.x, domBbox.y, domBbox.width, domBbox.height);
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
    position: absolute;
    background-color: ${colors.bg};
    border-color: ${colors.border};
  `;

  // ── Map AI bbox → document-space CSS px (single-scroll anchoring) ─────────
  const captureViewportWidth =
    pattern.viewportWidth ||
    (effectiveScreenshotSize?.width ?? getViewportSize().width);
  const captureViewportHeight =
    pattern.viewportHeight ||
    (effectiveScreenshotSize?.height ?? getViewportSize().height);

  let localX = bbox.x;
  let localY = bbox.y;
  let localW = bbox.width;
  let localH = bbox.height;
  if (pattern.isNormalized !== false) {
    localX = (bbox.x / 1000) * captureViewportWidth;
    localY = (bbox.y / 1000) * captureViewportHeight;
    localW = (bbox.width / 1000) * captureViewportWidth;
    localH = (bbox.height / 1000) * captureViewportHeight;
  }

  const aiWidth = localW;
  const aiHeight = localH;
  let docAiLeft = localX;
  const docAiTop = captureScrollY + localY; // add capture scroll exactly once

  const centerX = localX + aiWidth / 2;
  const centerY = localY + aiHeight / 2;
  const hitElement = document.elementFromPoint(centerX, centerY);
  const hitRect = hitElement?.getBoundingClientRect() || null;

  // ── Case 1: Smart snap-to-element (hit-test uses capture scroll, not stale scroll=0) ──
  if (hitElement && hitRect) {
    const rect = hitRect;
    const elemDocLeft = rect.left + (window.scrollX || 0);
    const elemDocTop = rect.top + (window.scrollY || 0);
    const elemWidth = rect.width;
    const elemHeight = rect.height;

    const elArea = elemWidth * elemHeight;
    const boxArea = aiWidth * aiHeight;
    if (boxArea > 0 && elArea < boxArea * MAX_SNAP_RATIO) {
      bindHighlightToDocumentRect(overlay, elemDocLeft, elemDocTop, elemWidth, elemHeight);
      debug('Snapped to element:', { elem: hitElement.tagName, elemWidth, elemHeight });
    } else {
      bindHighlightToDocumentRect(overlay, docAiLeft, docAiTop, aiWidth, aiHeight);
      debug('Element too large, using AI coords:', { elemWidth, elemHeight, aiWidth, aiHeight });
    }
  } else {
    // ── Case 2: No element found — use AI coords ────────────────────────────
    bindHighlightToDocumentRect(overlay, docAiLeft, docAiTop, aiWidth, aiHeight);
    debug('No element found, using AI coords:', { docAiLeft, docAiTop, aiWidth, aiHeight });
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

  // Keep host pinned to viewport; each highlight is remapped from
  // document-space to client-space on scroll/resize.
  shadowHost.style.height = '100vh';
  debug('Shadow host fixed to viewport for stable bbox alignment');

  // Render all patterns so highlights for other captured viewports
  // become visible automatically as the user scrolls the page.
  const allPatterns = patterns.map((pattern, index) => ({ pattern, index }));

  allPatterns.forEach(({ pattern, index }) => {
    // Each pattern carries its own screenshotSize + scrollY from the viewport it was captured in.
    // Fall back to the shared currentScreenshotSize if not present.
    const patternWithMetadata: PatternWithMetadata = {
      ...pattern,
      screenshotSize: pattern.screenshotSize ?? currentScreenshotSize ?? undefined,
      // DOM-grounded boxes skip normalized VLM mapping inside createHighlightOverlay
      isNormalized: pattern.bboxSource === 'dom' ? false : isNormalized,
    };
    const highlight = createHighlightOverlay(patternWithMetadata, index);
    highlight.style.display = 'none';
    shadowRoot!.appendChild(highlight);
    currentHighlights.push(highlight);
  });

  attachHighlightScrollResizeSync();
  syncAllHighlightClientPositions();

  debug(
    `Added ${allPatterns.length}/${patterns.length} highlights across all captured viewports`,
  );
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
  focusedPatternIndex = patternIndex;

  currentHighlights.forEach((h, idx) => {
    h.style.display = idx === patternIndex ? 'block' : 'none';
  });

  // Change highlight color to bright yellow for focus
  highlight.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
  highlight.style.borderColor = '#ffeb3b';
  highlight.style.boxShadow = '0 0 20px rgba(255, 235, 59, 0.8)';

  // Get the element associated with this highlight
  const patternType = highlight.dataset.patternType;
  const severity = highlight.dataset.severity;

  debug('Focusing on pattern:', { patternIndex, patternType, severity });

  // Scroll the page so the pattern is centered in the viewport
  const docTop = Number(highlight.dataset.docTop);
  const docHeight = Number(highlight.dataset.docHeight) || 0;
  if (Number.isFinite(docTop)) {
    const targetScrollY = Math.max(0, docTop + docHeight / 2 - window.innerHeight / 2);
    window.scrollTo({ top: targetScrollY, behavior: 'smooth' });
  }

  // Sync positions and show blur mask; scroll listener handles continuous updates
  syncAllHighlightClientPositions();

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

function unfocusPattern(): void {
  focusedPatternIndex = null;
  hideFocusMask();
  currentHighlights.forEach((h) => {
    h.style.display = 'none';
  });
  resetHighlightColors();
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
 * Append highlights for new patterns WITHOUT clearing existing ones.
 * Used for incremental exploration (Phase 3) where new patterns are
 * discovered via interactions and added on top of the global scan.
 */
function appendHighlights(
  patterns: DetectedPattern[],
  screenshotSize?: ScreenshotSize,
  isNormalized = true,
): void {
  if (screenshotSize) {
    currentScreenshotSize = screenshotSize;
  }

  initShadowDOM();

  if (!shadowRoot || !shadowHost) {
    debug('Shadow root not available for append');
    return;
  }

  const startIndex = currentHighlights.length;

  patterns.forEach((pattern, i) => {
    const index = startIndex + i;
    const patternWithMetadata: PatternWithMetadata = {
      ...pattern,
      screenshotSize: pattern.screenshotSize ?? currentScreenshotSize ?? undefined,
      isNormalized: pattern.bboxSource === 'dom' ? false : isNormalized,
    };
    const highlight = createHighlightOverlay(patternWithMetadata, index);
    highlight.style.display = 'none';
    shadowRoot!.appendChild(highlight);
    currentHighlights.push(highlight);
  });

  syncAllHighlightClientPositions();
  debug(`Appended ${patterns.length} highlights (total: ${currentHighlights.length})`);
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

    case LIVE_GUARD_MESSAGES.APPEND_HIGHLIGHTS:
      appendHighlights(
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

    case LIVE_GUARD_MESSAGES.UNFOCUS_PATTERN:
      unfocusPattern();
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
export { clearHighlights, showHighlights, appendHighlights, createHighlightOverlay };
