/**
 * High-Precision Coordinate Mapping Utility
 * Converts AI-generated bounding boxes (normalized 0-1000) to live DOM viewport coordinates
 * accounting for Scroll Position, Device Pixel Ratio (DPR), and Scaling.
 */

import { getDebug } from '@darkpatternhunter/shared/logger';

const debug = getDebug('coordinate-mapping');

/**
 * Bounding box interface
 */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Screenshot size interface
 */
export interface ScreenshotSize {
  width: number;
  height: number;
}

/**
 * Viewport size interface
 */
export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Scroll position interface
 */
export interface ScrollPosition {
  scrollX: number;
  scrollY: number;
}

/**
 * Result of coordinate mapping
 */
export interface CoordinateMappingResult {
  domX: number;
  domY: number;
  domWidth: number;
  domHeight: number;
  element: Element | null;
  elementRect: DOMRect | null;
}

/**
 * Convert normalized coordinates (0-1000) to actual screenshot pixel dimensions
 * @param normalizedValue - Normalized value (0-1000)
 * @param screenshotDimension - Actual screenshot dimension (width or height)
 * @returns Actual pixel value
 */
function normalizedToPixels(
  normalizedValue: number,
  screenshotDimension: number,
): number {
  return (normalizedValue / 1000) * screenshotDimension;
}

/**
 * Map a normalized axis-aligned box in 0–1000 space (x1,y1,x2,y2 corners)
 * to screenshot pixel rectangle (top-left + size).
 */
export function mapNormalizedToViewport(
  bbox: [number, number, number, number],
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const [x1, y1, x2, y2] = bbox;
  return {
    x: (x1 / 1000) * width,
    y: (y1 / 1000) * height,
    w: ((x2 - x1) / 1000) * width,
    h: ((y2 - y1) / 1000) * height,
  };
}

/**
 * Normalize a quad [x1,y1,x2,y2] in 0–1000 to [x,y,width,height] in the same scale.
 * Ensures positive area with a small minimum size.
 */
export function normalizedQuadToNormXYWH(
  quad: [number, number, number, number],
  minSpan = 15,
): [number, number, number, number] {
  let x1 = Math.min(quad[0], quad[2]);
  let x2 = Math.max(quad[0], quad[2]);
  let y1 = Math.min(quad[1], quad[3]);
  let y2 = Math.max(quad[1], quad[3]);
  x1 = Math.max(0, Math.min(1000, x1));
  x2 = Math.max(0, Math.min(1000, x2));
  y1 = Math.max(0, Math.min(1000, y1));
  y2 = Math.max(0, Math.min(1000, y2));
  let w = x2 - x1;
  let h = y2 - y1;
  if (w < minSpan) {
    const pad = (minSpan - w) / 2;
    x1 = Math.max(0, x1 - pad);
    x2 = Math.min(1000, x1 + minSpan);
    w = x2 - x1;
  }
  if (h < minSpan) {
    const pad = (minSpan - h) / 2;
    y1 = Math.max(0, y1 - pad);
    y2 = Math.min(1000, y1 + minSpan);
    h = y2 - y1;
  }
  return [x1, y1, w, h];
}

/**
 * Get canvas to DOM coordinates with high precision
 * Accounts for Scroll Position, DPR, and Scaling
 *
 * @param bbox - AI-generated bounding box (normalized 0-1000 or actual pixels)
 * @param screenshotSize - Actual screenshot dimensions in pixels
 * @param viewportSize - Current viewport dimensions
 * @param scrollPosition - Current scroll position (window.scrollX, window.scrollY)
 * @param dpr - Device pixel ratio (window.devicePixelRatio)
 * @param isNormalized - Whether bbox is normalized (0-1000) or actual pixels
 * @returns Coordinate mapping result with DOM coordinates and element info
 */
export function getCanvasToDomCoords(
  bbox: BBox,
  screenshotSize: ScreenshotSize,
  viewportSize: ViewportSize,
  scrollPosition: ScrollPosition,
  dpr: number = window.devicePixelRatio || 1,
  isNormalized = true,
): CoordinateMappingResult {
  debug('Mapping bbox to DOM coordinates:', {
    bbox,
    screenshotSize,
    viewportSize,
    scrollPosition,
    dpr,
    isNormalized,
  });

  let { x, y, width, height } = bbox;

  // Convert normalized coordinates to actual pixels if needed
  if (isNormalized) {
    x = normalizedToPixels(x, screenshotSize.width);
    y = normalizedToPixels(y, screenshotSize.height);
    width = normalizedToPixels(width, screenshotSize.width);
    height = normalizedToPixels(height, screenshotSize.height);
  }

  // Convert from screenshot pixel-space to current viewport CSS-space.
  // Prefer measured image/viewport scale over runtime DPR to avoid mismatch
  // when captures are forced to scaleFactor=1.
  const scaleX =
    viewportSize.width > 0 ? screenshotSize.width / viewportSize.width : dpr || 1;
  const scaleY =
    viewportSize.height > 0 ? screenshotSize.height / viewportSize.height : dpr || 1;
  const safeScaleX = Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  const safeScaleY = Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1;
  const adjustedX = x / safeScaleX;
  const adjustedY = y / safeScaleY;
  const adjustedWidth = width / safeScaleX;
  const adjustedHeight = height / safeScaleY;

  // Add scroll position to get absolute DOM coordinates
  const domX = adjustedX + scrollPosition.scrollX;
  const domY = adjustedY + scrollPosition.scrollY;

  debug('Mapped coordinates:', {
    domX,
    domY,
    domWidth: adjustedWidth,
    domHeight: adjustedHeight,
  });

  // Find the closest DOM element at the center of the bounding box
  const centerX = domX + adjustedWidth / 2;
  const centerY = domY + adjustedHeight / 2;

  let element: Element | null = null;
  let elementRect: DOMRect | null = null;

  try {
    // Use elementFromPoint to find the element at the center of the bbox
    // Note: elementFromPoint uses viewport coordinates, so we need to subtract scroll position
    const viewportX = centerX - scrollPosition.scrollX;
    const viewportY = centerY - scrollPosition.scrollY;

    element = document.elementFromPoint(viewportX, viewportY);

    if (element) {
      // Get the actual bounding rect of the element for perfect snap-to-element highlight
      elementRect = element.getBoundingClientRect();

      debug('Found element at coordinates:', {
        element: element.tagName,
        elementRect: {
          x: elementRect.x,
          y: elementRect.y,
          width: elementRect.width,
          height: elementRect.height,
        },
      });
    } else {
      debug('No element found at coordinates:', { viewportX, viewportY });
    }
  } catch (error) {
    debug('Error finding element at coordinates:', error);
  }

  return {
    domX,
    domY,
    domWidth: adjustedWidth,
    domHeight: adjustedHeight,
    element,
    elementRect,
  };
}

/**
 * Snap bounding box to the closest DOM element
 * Uses elementFromPoint to find the element and returns its bounding rect
 *
 * @param bbox - AI-generated bounding box
 * @param screenshotSize - Actual screenshot dimensions
 * @param viewportSize - Current viewport dimensions
 * @param scrollPosition - Current scroll position
 * @param dpr - Device pixel ratio
 * @param isNormalized - Whether bbox is normalized
 * @returns Snapped bounding box coordinates or null if no element found
 */
export function snapBboxToElement(
  bbox: BBox,
  screenshotSize: ScreenshotSize,
  viewportSize: ViewportSize,
  scrollPosition: ScrollPosition,
  dpr: number = window.devicePixelRatio || 1,
  isNormalized = true,
): BBox | null {
  const result = getCanvasToDomCoords(
    bbox,
    screenshotSize,
    viewportSize,
    scrollPosition,
    dpr,
    isNormalized,
  );

  if (result.element && result.elementRect) {
    // Return the element's bounding rect for perfect snap-to-element highlight
    return {
      x: result.elementRect.left + scrollPosition.scrollX,
      y: result.elementRect.top + scrollPosition.scrollY,
      width: result.elementRect.width,
      height: result.elementRect.height,
    };
  }

  // If no element found, return the original mapped coordinates
  return {
    x: result.domX,
    y: result.domY,
    width: result.domWidth,
    height: result.domHeight,
  };
}

/**
 * Get current scroll position
 * @returns Current scroll position
 */
export function getScrollPosition(): ScrollPosition {
  return {
    scrollX: window.scrollX || window.pageXOffset || 0,
    scrollY: window.scrollY || window.pageYOffset || 0,
  };
}

/**
 * Get current viewport size
 * @returns Current viewport dimensions
 */
export function getViewportSize(): ViewportSize {
  return {
    width: window.innerWidth || document.documentElement.clientWidth,
    height: window.innerHeight || document.documentElement.clientHeight,
  };
}

/**
 * Get device pixel ratio
 * @returns Device pixel ratio
 */
export function getDevicePixelRatio(): number {
  return window.devicePixelRatio || 1;
}

/**
 * Validate bounding box coordinates
 * @param bbox - Bounding box to validate
 * @returns Whether the bounding box is valid
 */
export function isValidBbox(bbox: BBox): boolean {
  return (
    bbox.x >= 0 &&
    bbox.y >= 0 &&
    bbox.width > 0 &&
    bbox.height > 0 &&
    Number.isFinite(bbox.x) &&
    Number.isFinite(bbox.y) &&
    Number.isFinite(bbox.width) &&
    Number.isFinite(bbox.height)
  );
}

/**
 * Normalize bounding box coordinates to 0-1000 range
 * @param bbox - Bounding box in actual pixels
 * @param screenshotSize - Screenshot dimensions
 * @returns Normalized bounding box
 */
export function normalizeBbox(
  bbox: BBox,
  screenshotSize: ScreenshotSize,
): BBox {
  return {
    x: (bbox.x / screenshotSize.width) * 1000,
    y: (bbox.y / screenshotSize.height) * 1000,
    width: (bbox.width / screenshotSize.width) * 1000,
    height: (bbox.height / screenshotSize.height) * 1000,
  };
}
