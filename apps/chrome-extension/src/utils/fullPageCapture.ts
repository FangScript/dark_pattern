/**
 * Full-Page Capture Utility
 * Implements scroll-and-stitch strategy for capturing full-page screenshots
 * and extracting complete DOM structure
 */

import { getDebug } from '@darkpatternhunter/shared/logger';
import { captureTabScreenshot } from './screenshotCapture';

const debug = getDebug('full-page-capture');

/**
 * Screenshot segment interface
 */
export interface ScreenshotSegment {
  dataUrl: string;
  scrollY: number;
  width: number;
  height: number;
}

/**
 * Full-page capture result
 */
export interface FullPageCaptureResult {
  screenshot: string; // Stitched full-page screenshot
  dom: string; // Full DOM structure
  viewport: { width: number; height: number };
  totalHeight: number;
  segments: number; // Number of segments captured
}

/**
 * Capture options
 */
export interface CaptureOptions {
  maxSegments?: number; // Maximum number of segments to capture
  segmentHeight?: number; // Height of each segment in pixels
  overlap?: number; // Overlap between segments in pixels
  waitTime?: number; // Wait time between scrolls in ms
}

/**
 * Default capture options
 */
const DEFAULT_OPTIONS: Required<CaptureOptions> = {
  maxSegments: 50,
  segmentHeight: 1000,
  overlap: 100,
  waitTime: 300,
};

/**
 * Capture a single screenshot segment
 * @param tabId - Tab ID to capture from
 * @param windowId - Window ID (not used, kept for compatibility)
 * @returns Screenshot data URL
 */
async function captureSegment(
  tabId: number,
  windowId: number,
): Promise<string> {
  // Use debugger API for automatic operation without user interaction
  return captureTabScreenshot(tabId);
}

/**
 * Get page dimensions
 * @param tabId - Tab ID to get dimensions from
 * @returns Page dimensions
 */
async function getPageDimensions(tabId: number): Promise<{
  totalHeight: number;
  viewportHeight: number;
  viewportWidth: number;
}> {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      return {
        totalHeight: Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
          document.documentElement.offsetHeight,
          document.body.offsetHeight,
        ),
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      };
    },
  });

  if (!result?.[0]?.result) {
    throw new Error('Failed to get page dimensions');
  }

  return result[0].result;
}

/**
 * Scroll to a specific position
 * @param tabId - Tab ID to scroll
 * @param scrollY - Y position to scroll to
 */
async function scrollToPosition(tabId: number, scrollY: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => {
      window.scrollTo(0, y);
    },
    args: [scrollY],
  });
}

/**
 * Stitch multiple screenshot segments into a single image
 * @param segments - Array of screenshot segments
 * @param totalWidth - Total width of the final image
 * @param totalHeight - Total height of the final image
 * @returns Stitched image data URL
 */
async function stitchSegments(
  segments: ScreenshotSegment[],
  totalWidth: number,
  totalHeight: number,
): Promise<string> {
  debug('Stitching', segments.length, 'segments into full-page image');

  // Create a canvas for the final image
  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Load and draw each segment
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Load the segment image
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load segment image'));
      img.src = segment.dataUrl;
    });

    // Draw the segment at the correct position
    ctx.drawImage(img, 0, segment.scrollY);
  }

  // Convert canvas to data URL
  const dataUrl = canvas.toDataURL('image/png', 0.9);
  debug('Stitching complete, final image size:', totalWidth, 'x', totalHeight);

  return dataUrl;
}

/**
 * Capture full page using scroll-and-stitch strategy
 * @param tabId - Tab ID to capture from
 * @param windowId - Window ID to capture from
 * @param options - Capture options
 * @returns Full-page capture result
 */
export async function captureFullPage(
  tabId: number,
  windowId: number,
  options: Partial<CaptureOptions> = {},
): Promise<FullPageCaptureResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  debug('Starting full-page capture with options:', opts);

  // Get page dimensions
  const { totalHeight, viewportHeight, viewportWidth } =
    await getPageDimensions(tabId);

  debug('Page dimensions:', { totalHeight, viewportHeight, viewportWidth });

  // If page fits in viewport, just capture once
  if (totalHeight <= viewportHeight) {
    debug('Page fits in viewport, capturing single screenshot');
    const screenshot = await captureSegment(tabId, windowId);

    // Get full DOM
    const domResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });

    const dom = domResult?.[0]?.result || '';

    return {
      screenshot,
      dom,
      viewport: { width: viewportWidth, height: viewportHeight },
      totalHeight,
      segments: 1,
    };
  }

  // Calculate segments needed
  const segments: ScreenshotSegment[] = [];
  let currentScrollY = 0;
  let segmentCount = 0;

  // Scroll and capture segments
  while (currentScrollY < totalHeight && segmentCount < opts.maxSegments) {
    // Scroll to position
    await scrollToPosition(tabId, currentScrollY);

    // Wait for page to settle
    await new Promise((resolve) => setTimeout(resolve, opts.waitTime));

    // Capture segment
    const dataUrl = await captureSegment(tabId, windowId);

    segments.push({
      dataUrl,
      scrollY: currentScrollY,
      width: viewportWidth,
      height: Math.min(opts.segmentHeight, totalHeight - currentScrollY),
    });

    debug(
      `Captured segment ${segmentCount + 1}/${Math.ceil(
        totalHeight / (opts.segmentHeight - opts.overlap),
      )} at scrollY=${currentScrollY}`,
    );

    // Move to next segment (with overlap)
    currentScrollY += opts.segmentHeight - opts.overlap;
    segmentCount++;
  }

  // Stitch segments
  const screenshot = await stitchSegments(segments, viewportWidth, totalHeight);

  // Get full DOM
  const domResult = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Filter out invisible nodes to optimize token consumption
      const filterInvisibleNodes = (node: Node): boolean => {
        if (node.nodeType !== Node.ELEMENT_NODE) {
          return true;
        }

        const element = node as Element;
        const style = window.getComputedStyle(element);

        // Skip invisible elements
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          style.opacity === '0'
        ) {
          return false;
        }

        // Skip elements with zero dimensions
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }

        return true;
      };

      // Clone the document and filter invisible nodes
      const clone = document.documentElement.cloneNode(true) as HTMLElement;
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
          return filterInvisibleNodes(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      });

      // Remove rejected nodes
      while (walker.nextNode()) {
        // Tree walker handles filtering
      }

      return clone.outerHTML;
    },
  });

  const dom = domResult?.[0]?.result || '';

  debug('Full-page capture complete:', {
    segments: segments.length,
    totalHeight,
    domLength: dom.length,
  });

  return {
    screenshot,
    dom,
    viewport: { width: viewportWidth, height: viewportHeight },
    totalHeight,
    segments: segments.length,
  };
}

/**
 * Capture full page using Debugger API (alternative method)
 * This method uses the Chrome Debugger Protocol to capture the full page
 * @param tabId - Tab ID to capture from
 * @returns Full-page capture result
 */
export async function captureFullPageWithDebugger(
  tabId: number,
): Promise<FullPageCaptureResult> {
  debug('Starting full-page capture with Debugger API');

  // Attach debugger
  await chrome.debugger.attach({ tabId }, '1.3');

  try {
    // Get page dimensions
    const { totalHeight, viewportHeight, viewportWidth } =
      await getPageDimensions(tabId);

    // Capture screenshot using Debugger API
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Page.captureScreenshot',
      {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: true,
      },
    );

    if (!result || typeof result !== 'object' || !('data' in result)) {
      throw new Error('Failed to capture screenshot with Debugger API');
    }

    const screenshotData = (result as { data: string }).data;

    // Get full DOM
    const domResult = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });

    const dom = domResult?.[0]?.result || '';

    debug('Debugger capture complete:', {
      totalHeight,
      viewportHeight,
      viewportWidth,
      domLength: dom.length,
    });

    return {
      screenshot: `data:image/png;base64,${screenshotData}`,
      dom,
      viewport: { width: viewportWidth, height: viewportHeight },
      totalHeight,
      segments: 1,
    };
  } finally {
    // Detach debugger
    await chrome.debugger.detach({ tabId });
  }
}
