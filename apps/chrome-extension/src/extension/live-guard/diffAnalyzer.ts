/**
 * Live Guard — Diff-Based Visual Analyzer
 *
 * After clicking an interaction, compares before/after screenshots
 * to detect ONLY the changed region, avoiding full-viewport re-analysis.
 *
 * Uses OffscreenCanvas with 4× downsampling for cheap pixel comparison.
 */

import { getDebug } from '@darkpatternhunter/shared/logger';

const debug = getDebug('live-guard:diff');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiffResult {
  /** Ratio of changed pixels (0.0 = identical, 1.0 = completely different) */
  changeRatio: number;
  /** Bounding box of the changed region in normalized 0–1000 space, null if no change */
  changedBbox: [number, number, number, number] | null;
  /** Whether the change is significant enough to warrant re-analysis */
  isSignificant: boolean;
  /** Whether the change is localized (small) or global (large, e.g. modal) */
  isLocalized: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum change ratio to consider the page actually changed */
const MIN_CHANGE_RATIO = 0.005;
/** Above this ratio, the change is "global" (e.g. modal overlay appeared) */
const GLOBAL_CHANGE_THRESHOLD = 0.15;
/** Pixel intensity difference threshold (0–255) */
const PIXEL_DIFF_THRESHOLD = 30;
/** Downsampling factor for faster comparison */
const DOWNSAMPLE = 4;

// ─── Core diff engine ────────────────────────────────────────────────────────

/**
 * Decode a data URL to ImageData at a downsampled resolution.
 */
async function decodeImage(dataUrl: string): Promise<{
  data: ImageData;
  originalWidth: number;
  originalHeight: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Math.max(1, Math.floor(img.width / DOWNSAMPLE));
      const h = Math.max(1, Math.floor(img.height / DOWNSAMPLE));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D not available')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({
        data: ctx.getImageData(0, 0, w, h),
        originalWidth: img.width,
        originalHeight: img.height,
      });
    };
    img.onerror = () => reject(new Error('Failed to decode image for diff'));
    img.src = dataUrl;
  });
}

/**
 * Compare two screenshots and return the diff result.
 *
 * Algorithm:
 * 1. Decode both at 4× downsampled resolution
 * 2. Walk each pixel, flag as "changed" if any channel differs by > threshold
 * 3. Compute bounding rect of all changed pixels
 * 4. Return change ratio + bbox in normalized 0–1000 space
 */
export async function computeVisualDiff(
  beforeB64: string,
  afterB64: string,
): Promise<DiffResult> {
  try {
    const [beforeImg, afterImg] = await Promise.all([
      decodeImage(beforeB64),
      decodeImage(afterB64),
    ]);

    const w = Math.min(beforeImg.data.width, afterImg.data.width);
    const h = Math.min(beforeImg.data.height, afterImg.data.height);

    if (w === 0 || h === 0) {
      return { changeRatio: 0, changedBbox: null, isSignificant: false, isLocalized: false };
    }

    const beforeData = beforeImg.data.data;
    const afterData = afterImg.data.data;
    const totalPixels = w * h;

    let changedPixels = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const dr = Math.abs(beforeData[i] - afterData[i]);
        const dg = Math.abs(beforeData[i + 1] - afterData[i + 1]);
        const db = Math.abs(beforeData[i + 2] - afterData[i + 2]);

        if (dr > PIXEL_DIFF_THRESHOLD || dg > PIXEL_DIFF_THRESHOLD || db > PIXEL_DIFF_THRESHOLD) {
          changedPixels++;
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    const changeRatio = changedPixels / totalPixels;

    if (changeRatio < MIN_CHANGE_RATIO) {
      debug(`No significant change detected (ratio=${changeRatio.toFixed(4)})`);
      return { changeRatio, changedBbox: null, isSignificant: false, isLocalized: false };
    }

    // Convert bounding rect to normalized 0–1000 space
    const normX = Math.floor((minX / w) * 1000);
    const normY = Math.floor((minY / h) * 1000);
    const normW = Math.ceil(((maxX - minX + 1) / w) * 1000);
    const normH = Math.ceil(((maxY - minY + 1) / h) * 1000);

    const changedBbox: [number, number, number, number] = [
      Math.max(0, normX),
      Math.max(0, normY),
      Math.min(1000, normW),
      Math.min(1000, normH),
    ];

    const isLocalized = changeRatio < GLOBAL_CHANGE_THRESHOLD;

    debug(
      `Diff: ${(changeRatio * 100).toFixed(1)}% changed, bbox=[${changedBbox}], ${isLocalized ? 'localized' : 'global'}`,
    );

    return {
      changeRatio,
      changedBbox,
      isSignificant: true,
      isLocalized,
    };
  } catch (err) {
    debug('Diff computation failed, treating as significant global change:', err);
    return {
      changeRatio: 1,
      changedBbox: [0, 0, 1000, 1000],
      isSignificant: true,
      isLocalized: false,
    };
  }
}

/**
 * Crop a screenshot to a normalized bbox region and return as data URL.
 * Used to send only the changed region to the VLM for analysis.
 */
export async function cropScreenshot(
  dataUrl: string,
  normBbox: [number, number, number, number],
  padding = 50,
): Promise<{ croppedDataUrl: string; cropInfo: { x: number; y: number; w: number; h: number } }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Convert normalized bbox to pixel coordinates
      let px = Math.floor((normBbox[0] / 1000) * img.width);
      let py = Math.floor((normBbox[1] / 1000) * img.height);
      let pw = Math.ceil((normBbox[2] / 1000) * img.width);
      let ph = Math.ceil((normBbox[3] / 1000) * img.height);

      // Add padding (clamped)
      px = Math.max(0, px - padding);
      py = Math.max(0, py - padding);
      pw = Math.min(img.width - px, pw + padding * 2);
      ph = Math.min(img.height - py, ph + padding * 2);

      // Ensure minimum crop size
      pw = Math.max(pw, 100);
      ph = Math.max(ph, 100);

      const canvas = document.createElement('canvas');
      canvas.width = pw;
      canvas.height = ph;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas 2D not available')); return; }

      ctx.drawImage(img, px, py, pw, ph, 0, 0, pw, ph);
      resolve({
        croppedDataUrl: canvas.toDataURL('image/png', 0.9),
        cropInfo: { x: px, y: py, w: pw, h: ph },
      });
    };
    img.onerror = () => reject(new Error('Failed to load image for cropping'));
    img.src = dataUrl;
  });
}
