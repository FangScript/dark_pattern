/**
 * Coordinate System Normalization Utilities
 * ==========================================
 * Handles the mapping between the five coordinate spaces:
 *   1. CSS pixels          — window.innerWidth, getBoundingClientRect
 *   2. Device pixels       — Page.captureScreenshot output, VLM bboxes
 *   3. Page-absolute CSS   — CSS px from document origin
 *   4. Page-absolute Device — device px from document origin
 *   5. VLM image pixels    — bbox coords from VLM (= device pixels)
 *
 * Key relationship:
 *   device_px = css_px × devicePixelRatio
 *   page_y    = viewport_y + scrollY  (in matching units)
 */

import type { AutoLabel } from './datasetDB';

// ── Core Interfaces ──────────────────────────────────────────────────────────

/** One viewport screenshot with full coordinate metadata */
export interface ViewportCaptureWithDPR {
  screenshot: string;           // base64 data URL
  patterns: AutoLabel[];        // bboxes RELATIVE to this screenshot (device pixels)
  viewportWidth: number;        // CSS pixels
  viewportHeight: number;       // CSS pixels
  scrollY: number;              // CSS pixels — page scroll when captured
  devicePixelRatio: number;     // DPR at capture time
  stepLabel: string;
  phase: 'scan' | 'interact';
}

/** Bbox in a specific coordinate space */
export interface AbsoluteBbox {
  x: number;
  y: number;
  width: number;
  height: number;
  space: 'css' | 'device';
}

// ── Conversion Functions ─────────────────────────────────────────────────────

/**
 * Convert a viewport-relative bbox (in device/image pixels, as VLM returns)
 * to page-absolute coordinates (in device pixels).
 *
 * x stays the same (horizontal scroll is not used).
 * y is offset by scrollY × DPR to convert from viewport-relative to page-absolute.
 */
export function viewportToPageAbsolute(
  bbox: [number, number, number, number],
  viewport: ViewportCaptureWithDPR,
): AbsoluteBbox {
  const [x, y, w, h] = bbox;
  const scrollYDevice = viewport.scrollY * viewport.devicePixelRatio;
  return {
    x,
    y: y + scrollYDevice,
    width: w,
    height: h,
    space: 'device',
  };
}

/**
 * Convert device-pixel bbox to CSS-pixel bbox.
 */
export function deviceToCSS(
  bbox: AbsoluteBbox,
  dpr: number,
): AbsoluteBbox {
  if (bbox.space === 'css') return bbox;
  return {
    x: bbox.x / dpr,
    y: bbox.y / dpr,
    width: bbox.width / dpr,
    height: bbox.height / dpr,
    space: 'css',
  };
}

/**
 * Convert CSS-pixel bbox to device-pixel bbox.
 */
export function cssToDevice(
  bbox: AbsoluteBbox,
  dpr: number,
): AbsoluteBbox {
  if (bbox.space === 'device') return bbox;
  return {
    x: bbox.x * dpr,
    y: bbox.y * dpr,
    width: bbox.width * dpr,
    height: bbox.height * dpr,
    space: 'device',
  };
}

// ── Image Dimension Helpers ──────────────────────────────────────────────────

/**
 * Get actual pixel dimensions of a base64 image.
 * This returns the TRUE image size in device pixels, not CSS viewport size.
 */
export function getImageDimensions(
  dataUrl: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => reject(new Error('Failed to load image for dimension check'));
    img.src = dataUrl;
  });
}

/**
 * Verify DPR consistency: actual image width should equal viewportWidth × DPR.
 * Returns diagnostics for debugging.
 */
export async function verifyDPRConsistency(
  viewport: ViewportCaptureWithDPR,
): Promise<{
  consistent: boolean;
  actualWidth: number;
  actualHeight: number;
  expectedWidth: number;
  expectedHeight: number;
  measuredDPR: number;
}> {
  const dims = await getImageDimensions(viewport.screenshot);
  const expectedWidth = Math.round(viewport.viewportWidth * viewport.devicePixelRatio);
  const expectedHeight = Math.round(viewport.viewportHeight * viewport.devicePixelRatio);
  const measuredDPR = dims.width / viewport.viewportWidth;

  // Allow 2px tolerance for rounding
  const consistent =
    Math.abs(dims.width - expectedWidth) <= 2 &&
    Math.abs(dims.height - expectedHeight) <= 2;

  return {
    consistent,
    actualWidth: dims.width,
    actualHeight: dims.height,
    expectedWidth,
    expectedHeight,
    measuredDPR,
  };
}

// ── Full-Page Stitching (Visualization Only) ─────────────────────────────────

/**
 * Calculate the full-page canvas dimensions needed to stitch all viewports.
 * Uses the actual scroll positions to determine total page coverage.
 */
export function calculateFullPageDimensions(
  viewports: ViewportCaptureWithDPR[],
): { width: number; height: number } {
  if (viewports.length === 0) return { width: 0, height: 0 };

  // All viewports should have the same width (same page), use max for safety
  const dpr = viewports[0].devicePixelRatio;
  const width = Math.max(...viewports.map((v) => v.viewportWidth * v.devicePixelRatio));

  // Height = max(scrollY + viewportHeight) across all viewports, in device pixels
  const height = Math.max(
    ...viewports.map((v) => (v.scrollY + v.viewportHeight) * v.devicePixelRatio),
  );

  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Build a full-page stitched canvas from multiple viewport screenshots.
 *
 * Each viewport is drawn at its correct scroll offset position.
 * Bounding boxes are converted to page-absolute coordinates and drawn.
 *
 * @param viewports - Array of viewport captures with DPR
 * @param drawBboxes - Whether to draw bounding boxes
 * @param severityColors - Color mapping for bbox severity levels
 * @returns Base64 data URL of the stitched full-page image
 */
export async function buildFullPageCanvas(
  viewports: ViewportCaptureWithDPR[],
  drawBboxes = true,
  severityColors?: Record<string, { strokeColor: string; fillColor: string; strokeWidth: number; labelBgColor: string; labelTextColor: string }>,
): Promise<string> {
  if (viewports.length === 0) {
    throw new Error('No viewports to stitch');
  }

  const defaultColors: Record<string, { strokeColor: string; fillColor: string; strokeWidth: number; labelBgColor: string; labelTextColor: string }> = {
    critical: { strokeColor: '#ff0000', fillColor: 'rgba(255,0,0,0.15)', strokeWidth: 3, labelBgColor: '#ff0000', labelTextColor: '#fff' },
    high: { strokeColor: '#ff6600', fillColor: 'rgba(255,102,0,0.15)', strokeWidth: 3, labelBgColor: '#ff6600', labelTextColor: '#fff' },
    medium: { strokeColor: '#ffcc00', fillColor: 'rgba(255,204,0,0.15)', strokeWidth: 2, labelBgColor: '#ffcc00', labelTextColor: '#000' },
    low: { strokeColor: '#00cc00', fillColor: 'rgba(0,204,0,0.15)', strokeWidth: 2, labelBgColor: '#00cc00', labelTextColor: '#fff' },
  };
  const colors = severityColors ?? defaultColors;

  const dims = calculateFullPageDimensions(viewports);
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  // Fill with white background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dims.width, dims.height);

  // Sort viewports by scrollY so we draw bottom-up overlaps correctly
  const sorted = [...viewports].sort((a, b) => a.scrollY - b.scrollY);

  // Draw each viewport screenshot at its scroll offset
  for (const vp of sorted) {
    const img = await loadImage(vp.screenshot);
    const yOffset = vp.scrollY * vp.devicePixelRatio;
    ctx.drawImage(img, 0, yOffset);
  }

  // Draw bounding boxes in page-absolute positions
  if (drawBboxes) {
    let globalIndex = 0;
    for (const vp of sorted) {
      for (const pattern of vp.patterns) {
        if (!pattern.bbox || pattern.bbox.length !== 4) continue;
        globalIndex++;

        const abs = viewportToPageAbsolute(pattern.bbox, vp);
        const style = colors[pattern.severity ?? 'medium'] ?? colors.medium;

        // Draw filled rectangle
        ctx.fillStyle = style.fillColor;
        ctx.fillRect(abs.x, abs.y, abs.width, abs.height);

        // Draw border
        ctx.strokeStyle = style.strokeColor;
        ctx.lineWidth = style.strokeWidth;
        ctx.strokeRect(abs.x, abs.y, abs.width, abs.height);

        // Draw label
        const label = `${globalIndex}. ${pattern.category}`;
        const fontSize = 14;
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        const textMetrics = ctx.measureText(label);
        const pad = 4;
        const labelH = fontSize + pad * 2;
        const labelW = textMetrics.width + pad * 2;
        const labelY = abs.y - labelH > 0 ? abs.y - labelH : abs.y;

        ctx.fillStyle = style.labelBgColor;
        ctx.fillRect(abs.x, labelY, labelW, labelH);
        ctx.fillStyle = style.labelTextColor;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, abs.x + pad, labelY + labelH / 2);
      }
    }
  }

  return canvas.toDataURL('image/png', 0.95);
}

/** Helper: load an image from data URL */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

// ── YOLO/COCO Normalization Helpers ──────────────────────────────────────────

/**
 * Normalize a bbox for YOLO export.
 * Input bbox is in device/image pixels. imageWidth/imageHeight are actual image dimensions.
 *
 * Returns: { centerX, centerY, width, height } all in [0, 1] range.
 */
export function normalizeForYOLO(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): { centerX: number; centerY: number; width: number; height: number } | null {
  const [x, y, w, h] = bbox;

  const centerX = (x + w / 2) / imageWidth;
  const centerY = (y + h / 2) / imageHeight;
  const normW = w / imageWidth;
  const normH = h / imageHeight;

  // Validate: all values must be in [0, 1]
  if (centerX < 0 || centerX > 1 || centerY < 0 || centerY > 1 ||
      normW < 0 || normW > 1 || normH < 0 || normH > 1) {
    console.warn(`[coordinateUtils] YOLO normalization out of range: ` +
      `bbox=[${bbox}], image=${imageWidth}×${imageHeight}, ` +
      `normalized=[${centerX.toFixed(4)}, ${centerY.toFixed(4)}, ${normW.toFixed(4)}, ${normH.toFixed(4)}]`);
    return null;
  }

  return { centerX, centerY, width: normW, height: normH };
}
