/**
 * YOLO Darknet Dataset Exporter — ONE PATTERN PER IMAGE
 * ======================================================
 * Each detected dark pattern → its own separate training image.
 * Number of output images = number of detected patterns.
 *
 * Output format (matches Roboflow dataset):
 *   train/dp_0001.jpg        — viewport screenshot containing the pattern
 *   train/dp_0001.txt        — "0 x_center y_center w_norm h_norm" (ONE line only)
 *   train/_darknet.labels    — "dark pattern"
 *   valid/...
 *   test/...
 *
 * Single class: class_id=0 → "dark pattern"
 */

import type { ViewportCapture } from './agentAnalysis';
import type { AutoLabel } from './datasetDB';

// ── Coordinate conversion ─────────────────────────────────────────────────────

/**
 * Convert pixel bounding box [x, y, width, height] to YOLO normalized format.
 * YOLO format: x_center y_center w_norm h_norm (all 0.0–1.0)
 */
function bboxToYolo(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): string {
  const [x, y, w, h] = bbox;

  // Convert from top-left pixel → center normalized
  const xCenter = (x + w / 2) / imageWidth;
  const yCenter = (y + h / 2) / imageHeight;
  const wNorm = w / imageWidth;
  const hNorm = h / imageHeight;

  // Clamp to valid range [0, 1]
  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  return `0 ${clamp(xCenter).toFixed(6)} ${clamp(yCenter).toFixed(6)} ${clamp(wNorm).toFixed(6)} ${clamp(hNorm).toFixed(6)}`;
}

// ── Base64 → Blob helper ──────────────────────────────────────────────────────

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Convert a PNG data URL to JPEG data URL via canvas (smaller file size).
 * Returns JPEG data URL and the image dimensions.
 */
async function convertToJpeg(
  dataUrl: string,
): Promise<{ jpegDataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.90);
      resolve({ jpegDataUrl, width: img.width, height: img.height });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

// ── ZIP creation (minimal implementation, no dependencies) ────────────────────

class SimpleZip {
  private files: Array<{ name: string; data: Uint8Array }> = [];

  addFile(name: string, data: Uint8Array | string) {
    if (typeof data === 'string') {
      const encoder = new TextEncoder();
      this.files.push({ name, data: encoder.encode(data) });
    } else {
      this.files.push({ name, data });
    }
  }

  generate(): Blob {
    const localHeaders: Uint8Array[] = [];
    const centralHeaders: Uint8Array[] = [];
    let offset = 0;

    for (const file of this.files) {
      const nameBytes = new TextEncoder().encode(file.name);

      // Local file header
      const local = new ArrayBuffer(30 + nameBytes.length + file.data.length);
      const lv = new DataView(local);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, this.crc32(file.data), true);
      lv.setUint32(18, file.data.length, true);
      lv.setUint32(22, file.data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);

      const localArray = new Uint8Array(local);
      localArray.set(nameBytes, 30);
      localArray.set(file.data, 30 + nameBytes.length);
      localHeaders.push(localArray);

      // Central directory header
      const central = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(central);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, this.crc32(file.data), true);
      cv.setUint32(20, file.data.length, true);
      cv.setUint32(24, file.data.length, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);

      const centralArray = new Uint8Array(central);
      centralArray.set(nameBytes, 46);
      centralHeaders.push(centralArray);

      offset += localArray.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for (const ch of centralHeaders) centralSize += ch.length;

    // End of central directory
    const eocdr = new ArrayBuffer(22);
    const ev = new DataView(eocdr);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, this.files.length, true);
    ev.setUint16(10, this.files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, centralStart, true);
    ev.setUint16(20, 0, true);

    return new Blob(
      [...localHeaders.map(h => h as BlobPart), ...centralHeaders.map(h => h as BlobPart), new Uint8Array(eocdr) as BlobPart],
      { type: 'application/zip' },
    );
  }

  private crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** One pattern paired with the viewport screenshot that contains it */
interface PatternImage {
  screenshot: string;         // base64 data URL of the viewport
  pattern: AutoLabel;         // the single pattern in this image
  viewportWidth: number;
  viewportHeight: number;
}

export interface YoloExportOptions {
  prefix?: string;
  trainRatio?: number;
  validRatio?: number;
  testRatio?: number;
}

// ── Main export: ONE PATTERN = ONE IMAGE ──────────────────────────────────────

/**
 * Explode viewports into individual pattern images.
 * If a viewport has 5 patterns → 5 images (same screenshot, each with 1 bbox).
 * Number of output images = total number of valid patterns.
 */
function explodeToPatternImages(viewports: ViewportCapture[]): PatternImage[] {
  const images: PatternImage[] = [];

  for (const v of viewports) {
    if (!v.screenshot) continue;

    for (const pattern of v.patterns) {
      // Must have a valid bbox
      if (!pattern.bbox || pattern.bbox.length !== 4) continue;
      if (pattern.bbox[2] <= 0 || pattern.bbox[3] <= 0) continue;

      images.push({
        screenshot: v.screenshot,
        pattern,
        viewportWidth: v.viewportWidth,
        viewportHeight: v.viewportHeight,
      });
    }
  }

  return images;
}

/**
 * Export ONE image per pattern as YOLO Darknet .zip
 *
 * 26 patterns detected → 26 images, each with 1 bbox label.
 */
export async function exportYoloDarknet(
  viewports: ViewportCapture[],
  options: YoloExportOptions = {},
): Promise<{ blob: Blob; stats: { total: number; train: number; valid: number; test: number; patterns: number } }> {
  const {
    prefix = 'dp',
    trainRatio = 0.7,
    validRatio = 0.2,
  } = options;

  // Explode: each pattern → its own image
  const patternImages = explodeToPatternImages(viewports);

  if (patternImages.length === 0) {
    throw new Error('No patterns with valid bounding boxes to export.');
  }

  console.log(`[yoloExport] ${patternImages.length} patterns → ${patternImages.length} images (one per pattern)`);

  // Shuffle for randomized split
  const shuffled = [...patternImages].sort(() => Math.random() - 0.5);

  const trainCount = Math.max(1, Math.round(shuffled.length * trainRatio));
  const validCount = Math.max(0, Math.round(shuffled.length * validRatio));

  const zip = new SimpleZip();

  // Add _darknet.labels to each split folder
  zip.addFile('train/_darknet.labels', 'dark pattern\n');
  zip.addFile('valid/_darknet.labels', 'dark pattern\n');
  zip.addFile('test/_darknet.labels', 'dark pattern\n');

  let trainActual = 0;
  let validActual = 0;
  let testActual = 0;

  for (let idx = 0; idx < shuffled.length; idx++) {
    const { screenshot, pattern, viewportWidth, viewportHeight } = shuffled[idx];

    let split: string;
    if (idx < trainCount) { split = 'train'; trainActual++; }
    else if (idx < trainCount + validCount) { split = 'valid'; validActual++; }
    else { split = 'test'; testActual++; }

    const filename = `${prefix}_${String(idx).padStart(4, '0')}`;

    try {
      // Convert screenshot to JPEG and get actual image dimensions
      const { jpegDataUrl, width, height } = await convertToJpeg(screenshot);
      const jpegBlob = dataUrlToBlob(jpegDataUrl);
      const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());

      // ONE label line — one pattern per image
      const yoloLine = bboxToYolo(pattern.bbox!, width, height);

      // Add to zip
      zip.addFile(`${split}/${filename}.jpg`, jpegBytes);
      zip.addFile(`${split}/${filename}.txt`, yoloLine + '\n');
    } catch (err) {
      console.warn(`[yoloExport] Failed to process pattern ${idx}:`, err);
    }
  }

  const stats = {
    total: shuffled.length,
    train: trainActual,
    valid: validActual,
    test: testActual,
    patterns: shuffled.length, // 1:1 with images
  };

  console.log(`[yoloExport] ✅ Exported: ${stats.total} images (1 pattern each) | train=${stats.train} valid=${stats.valid} test=${stats.test}`);

  return { blob: zip.generate(), stats };
}

// ── Download helper ───────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Export from DatasetEntry[] ─────────────────────────────────────────────────

/**
 * Extract viewport_screenshots from DatasetEntry[] and export as YOLO dataset.
 * Each pattern in each viewport → its own separate training image.
 */
export async function exportFromEntries(
  entries: Array<{
    viewport_screenshots?: Array<{
      screenshot: string;
      patterns: AutoLabel[];
      viewportWidth: number;
      viewportHeight: number;
      scrollY: number;
      stepLabel: string;
      phase: 'scan' | 'interact';
    }>;
  }>,
  options: YoloExportOptions = {},
): Promise<{ blob: Blob; stats: { total: number; train: number; valid: number; test: number; patterns: number } }> {
  // Collect all viewports from all entries
  const allViewports: ViewportCapture[] = [];

  for (const entry of entries) {
    if (!entry.viewport_screenshots) continue;
    for (const vs of entry.viewport_screenshots) {
      allViewports.push({
        screenshot: vs.screenshot,
        patterns: vs.patterns,
        viewportWidth: vs.viewportWidth,
        viewportHeight: vs.viewportHeight,
        scrollY: vs.scrollY,
        stepLabel: vs.stepLabel,
        phase: vs.phase,
      });
    }
  }

  if (allViewports.length === 0) {
    throw new Error('No viewport screenshots found. Run analysis first.');
  }

  return exportYoloDarknet(allViewports, options);
}
