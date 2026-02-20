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
  counterMeasure: string;
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
    position: fixed;
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
      border: 2px solid;
      border-radius: 4px;
      pointer-events: auto;
      cursor: pointer;
      box-shadow: 0 0 10px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
      animation: liveGuardPulse 2s infinite;
    }

    .live-guard-highlight:hover {
      filter: brightness(1.2);
      transform: scale(1.02);
    }

    @keyframes liveGuardPulse {
      0%, 100% {
        opacity: 0.3;
      }
      50% {
        opacity: 0.6;
      }
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
function getSeverityColor(severity: string): { bg: string; border: string } {
  const colors = {
    critical: { bg: 'rgba(255, 77, 79, 0.3)', border: '#ff4d4f' },
    high: { bg: 'rgba(255, 122, 69, 0.3)', border: '#ff7a45' },
    medium: { bg: 'rgba(255, 169, 64, 0.3)', border: '#ffa940' },
    low: { bg: 'rgba(82, 196, 26, 0.3)', border: '#52c41a' },
  };
  return colors[severity as keyof typeof colors] || colors.low;
}

/**
 * Create a highlight overlay for a detected pattern
 * Uses high-precision coordinate mapping to snap to actual DOM elements
 */
function createHighlightOverlay(
  pattern: PatternWithMetadata,
  index: number,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'live-guard-highlight';
  overlay.dataset.patternIndex = String(index);
  overlay.dataset.patternType = pattern.type;
  overlay.dataset.severity = pattern.severity;

  // Set styles based on severity
  const colors = getSeverityColor(pattern.severity);

  overlay.style.cssText = `
    background-color: ${colors.bg};
    border-color: ${colors.border};
    box-shadow: 0 0 10px ${colors.bg};
  `;

  // If bbox is provided, use high-precision coordinate mapping
  if (pattern.bbox && currentScreenshotSize) {
    const bbox: BBox = {
      x: pattern.bbox[0],
      y: pattern.bbox[1],
      width: pattern.bbox[2],
      height: pattern.bbox[3],
    };

    // Validate bbox
    if (!isValidBbox(bbox)) {
      debug('Invalid bbox, skipping highlight:', bbox);
      // Default full-page overlay if invalid bbox
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
    } else {
      // Get current viewport and scroll position
      const viewportSize = getViewportSize();
      const scrollPosition = getScrollPosition();
      const dpr = getDevicePixelRatio();

      // Map bbox to DOM coordinates with high precision
      const result = getCanvasToDomCoords(
        bbox,
        currentScreenshotSize,
        viewportSize,
        scrollPosition,
        dpr,
        pattern.isNormalized !== false, // Default to true if not specified
      );

      // If we found an element, use its bounding rect for perfect snap-to-element highlight
      if (result.element && result.elementRect) {
        const elementRect = result.elementRect;
        overlay.style.left = `${elementRect.left + scrollPosition.scrollX}px`;
        overlay.style.top = `${elementRect.top + scrollPosition.scrollY}px`;
        overlay.style.width = `${elementRect.width}px`;
        overlay.style.height = `${elementRect.height}px`;

        debug('Snapped highlight to element:', {
          element: result.element.tagName,
          rect: elementRect,
        });
      } else {
        // Use mapped coordinates if no element found
        overlay.style.left = `${result.domX}px`;
        overlay.style.top = `${result.domY}px`;
        overlay.style.width = `${result.domWidth}px`;
        overlay.style.height = `${result.domHeight}px`;

        debug('Using mapped coordinates (no element found):', {
          domX: result.domX,
          domY: result.domY,
          domWidth: result.domWidth,
          domHeight: result.domHeight,
        });
      }
    }
  } else {
    // Default full-page overlay if no bbox or screenshot size
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
  }

  // Add tooltip on hover
  overlay.addEventListener('mouseenter', () => {
    showTooltip(pattern, overlay);
  });

  overlay.addEventListener('mouseleave', () => {
    hideTooltip();
  });

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

  // Store screenshot size for coordinate mapping
  if (screenshotSize) {
    currentScreenshotSize = screenshotSize;
  }

  // Initialize Shadow DOM if not already done
  initShadowDOM();

  if (!shadowRoot) {
    debug('Shadow root not available');
    return;
  }

  patterns.forEach((pattern, index) => {
    const patternWithMetadata: PatternWithMetadata = {
      ...pattern,
      screenshotSize: currentScreenshotSize || undefined,
      isNormalized,
    };
    const highlight = createHighlightOverlay(patternWithMetadata, index);
    shadowRoot!.appendChild(highlight);
    currentHighlights.push(highlight);
  });

  debug(`Added ${patterns.length} highlights`);
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
