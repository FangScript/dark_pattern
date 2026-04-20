/**
 * COCO and YOLO Format Export Utilities
 * Export dark pattern annotations in standard detection formats for model training
 */

import JSZip from 'jszip';
import type { DarkPattern, DatasetEntry } from './datasetDB';
import { getDatasetEntries, getEffectivePatterns } from './datasetDB';
import { getImageDimensions } from './coordinateUtils';

// COCO Format Types
export interface COCODataset {
  info: {
    description: string;
    version: string;
    year: number;
    date_created: string;
  };
  licenses: Array<{
    id: number;
    name: string;
    url: string;
  }>;
  images: COCOImage[];
  annotations: COCOAnnotation[];
  categories: COCOCategory[];
}

export interface COCOImage {
  id: number;
  file_name: string;
  width: number;
  height: number;
  date_captured?: string;
  url?: string;
}

export interface COCOAnnotation {
  id: number;
  image_id: number;
  category_id: number;
  bbox: [number, number, number, number]; // [x, y, width, height]
  area: number;
  iscrowd: 0 | 1;
  attributes?: {
    severity: string;
    evidence: string;
    description: string;
  };
}

export interface COCOCategory {
  id: number;
  name: string;
  supercategory: string;
}

// Dark Pattern Categories for COCO format
export const DARK_PATTERN_CATEGORIES: COCOCategory[] = [
  { id: 1, name: 'Nagging', supercategory: 'dark_pattern' },
  { id: 2, name: 'Scarcity & Popularity', supercategory: 'dark_pattern' },
  { id: 3, name: 'FOMO / Urgency', supercategory: 'dark_pattern' },
  { id: 4, name: 'Reference Pricing', supercategory: 'dark_pattern' },
  { id: 5, name: 'Disguised Ads', supercategory: 'dark_pattern' },
  { id: 6, name: 'False Hierarchy', supercategory: 'dark_pattern' },
  { id: 7, name: 'Interface Interference', supercategory: 'dark_pattern' },
  { id: 8, name: 'Misdirection', supercategory: 'dark_pattern' },
  { id: 9, name: 'Hard To Close', supercategory: 'dark_pattern' },
  { id: 10, name: 'Obstruction', supercategory: 'dark_pattern' },
  { id: 11, name: 'Bundling', supercategory: 'dark_pattern' },
  { id: 12, name: 'Sneaking', supercategory: 'dark_pattern' },
  { id: 13, name: 'Hidden Information', supercategory: 'dark_pattern' },
  { id: 14, name: 'Subscription Trap', supercategory: 'dark_pattern' },
  { id: 15, name: 'Roach Motel', supercategory: 'dark_pattern' },
  { id: 16, name: 'Confirmshaming', supercategory: 'dark_pattern' },
  { id: 17, name: 'Forced Registration', supercategory: 'dark_pattern' },
  { id: 18, name: 'Gamification Pressure', supercategory: 'dark_pattern' },
];

function getCategoryId(patternType: string): number {
  const category = DARK_PATTERN_CATEGORIES.find(
    (c) =>
      c.name.toLowerCase() === patternType.toLowerCase() ||
      patternType
        .toLowerCase()
        .includes(c.name.toLowerCase().split('/')[0].trim()),
  );
  return category?.id || 0; // 0 for unknown
}

function sanitizeFilenameLocal(value: string, fallback: string): string {
  const sanitized = value.replace(/[^a-z0-9-_]/gi, '_');
  return sanitized.length > 0 ? sanitized : fallback;
}

/**
 * Export dataset in COCO format
 * This is the standard format for object detection models (YOLO, Faster R-CNN, etc.)
 * 
 * When viewport_screenshots are available, each viewport becomes its own training image
 * with bboxes scoped to that viewport. Otherwise falls back to the legacy single-screenshot approach.
 */

// Helper to pull human-verified labels *if available* for a given viewport, falling back to VLM outputs.
function getViewportPatterns(entry: DatasetEntry, vIdx: number, vs: any) {
  const verifiedForViewport = entry.verified_labels?.filter(
    (v) => v.viewportIndex === vIdx && v.verified
  );
  if (verifiedForViewport && verifiedForViewport.length > 0) {
    return verifiedForViewport.map((v) => ({
      category: v.category,
      bbox: v.bbox,
      severity: 'medium',
      description: v.notes || '',
      evidence: '',
    }));
  }
  return vs.patterns || [];
}

export async function exportAsCOCO(entries?: DatasetEntry[]): Promise<Blob> {
  const data = entries ?? await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');

  const cocoDataset: COCODataset = {
    info: {
      description: 'Dark Pattern Detection Dataset - Pakistani E-commerce',
      version: '1.0',
      year: new Date().getFullYear(),
      date_created: new Date().toISOString(),
    },
    licenses: [
      {
        id: 1,
        name: 'Research Use Only',
        url: '',
      },
    ],
    images: [],
    annotations: [],
    categories: DARK_PATTERN_CATEGORIES,
  };

  let imageId = 0;
  let annotationId = 0;

  for (const entry of data) {
    // ── Prefer per-viewport screenshots (each is its own training image) ──
    if (entry.viewport_screenshots && entry.viewport_screenshots.length > 0) {
      for (let vIdx = 0; vIdx < entry.viewport_screenshots.length; vIdx++) {
        const vs = entry.viewport_screenshots[vIdx];
        if (!vs.screenshot || vs.patterns.length === 0) continue;

        imageId++;
        const imageFileName = `${sanitizeFilenameLocal(entry.id, `img_${imageId}`)}_vp${imageId}.png`;

        // Get ACTUAL image dimensions (device pixels) from the PNG data
        let width: number;
        let height: number;
        try {
          const dims = await getImageDimensions(vs.screenshot);
          width = dims.width;
          height = dims.height;
        } catch {
          // Fallback: compute from CSS viewport × DPR
          const dpr = vs.devicePixelRatio || 1;
          width = Math.round(vs.viewportWidth * dpr);
          height = Math.round(vs.viewportHeight * dpr);
        }

        // Add image to zip
        const match = vs.screenshot.match(/^data:(.*?);base64,(.*)$/);
        if (match && imagesFolder) {
          imagesFolder.file(imageFileName, match[2], { base64: true });
        }

        cocoDataset.images.push({
          id: imageId,
          file_name: imageFileName,
          width,
          height,
          date_captured: new Date(entry.timestamp).toISOString(),
          url: entry.url,
        });

        // Add annotations — bboxes are already relative to this viewport's screenshot
        const patternsToExport = getViewportPatterns(entry, vIdx, vs);
        for (const pattern of patternsToExport) {
          if (!pattern.bbox || pattern.bbox.length !== 4) continue;

          annotationId++;
          const [x, y, w, h] = pattern.bbox;

          cocoDataset.annotations.push({
            id: annotationId,
            image_id: imageId,
            category_id: getCategoryId(pattern.category),
            bbox: [x, y, w, h],
            area: w * h,
            iscrowd: 0,
            attributes: {
              severity: pattern.severity ?? 'medium',
              evidence: pattern.evidence ?? '',
              description: pattern.description ?? '',
            },
          });
        }
      }
      continue; // Skip legacy path for this entry
    }

    // ── Legacy fallback: single screenshot with entry-level patterns ──
    if (!entry.screenshot) continue;

    imageId++;
    const imageFileName = `${sanitizeFilenameLocal(entry.id, `img_${imageId}`)}.png`;

    // Get ACTUAL image dimensions from the PNG instead of CSS viewport
    let width: number;
    let height: number;
    try {
      const dims = await getImageDimensions(entry.screenshot);
      width = dims.width;
      height = dims.height;
    } catch {
      width = entry.metadata?.viewport?.width || 1920;
      height = entry.metadata?.viewport?.height || 1080;
    }

    const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
    if (match && imagesFolder) {
      imagesFolder.file(imageFileName, match[2], { base64: true });
    }

    cocoDataset.images.push({
      id: imageId,
      file_name: imageFileName,
      width,
      height,
      date_captured: new Date(entry.timestamp).toISOString(),
      url: entry.url,
    });

    const effectivePatterns = getEffectivePatterns(entry);
    for (const pattern of effectivePatterns) {
      if (!pattern.bbox || pattern.bbox.length !== 4) continue;

      annotationId++;
      const [x, y, w, h] = pattern.bbox;

      cocoDataset.annotations.push({
        id: annotationId,
        image_id: imageId,
        category_id: getCategoryId(pattern.type),
        bbox: [x, y, w, h],
        area: w * h,
        iscrowd: 0,
        attributes: {
          severity: pattern.severity,
          evidence: pattern.evidence,
          description: pattern.description,
        },
      });
    }
  }

  zip.file(
    'annotations/instances_train.json',
    JSON.stringify(cocoDataset, null, 2),
  );
  zip.file('categories.json', JSON.stringify(DARK_PATTERN_CATEGORIES, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Export dataset in YOLO format
 * Each image has a corresponding .txt file with annotations
 * Format per line: class_id center_x center_y width height (all normalized 0-1)
 *
 * Uses actual image dimensions for normalization (not CSS viewport dimensions)
 * to ensure correct coordinates on HiDPI/Retina screens.
 *
 * @param entries - Optional array of entries to export. If not provided, loads all from IndexedDB.
 */
export async function exportAsYOLO(entries?: DatasetEntry[]): Promise<Blob> {
  const data = entries ?? await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');
  const labelsFolder = zip.folder('labels');

  const imagesList: string[] = [];
  let globalIndex = 0;

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];

    // ── Prefer per-viewport screenshots ──
    if (entry.viewport_screenshots && entry.viewport_screenshots.length > 0) {
      for (let vIdx = 0; vIdx < entry.viewport_screenshots.length; vIdx++) {
        const vs = entry.viewport_screenshots[vIdx];
        if (!vs.screenshot || vs.patterns.length === 0) continue;

        globalIndex++;
        const baseName = sanitizeFilenameLocal(entry.id, `img_${globalIndex}`) + `_vp${vIdx}`;
        const imageFileName = `${baseName}.png`;
        const labelFileName = `${baseName}.txt`;

        // Get ACTUAL image dimensions from the PNG
        let width: number;
        let height: number;
        try {
          const dims = await getImageDimensions(vs.screenshot);
          width = dims.width;
          height = dims.height;
        } catch {
          const dpr = vs.devicePixelRatio || 1;
          width = Math.round(vs.viewportWidth * dpr);
          height = Math.round(vs.viewportHeight * dpr);
        }

        const match = vs.screenshot.match(/^data:(.*?);base64,(.*)$/);
        if (match && imagesFolder) {
          imagesFolder.file(imageFileName, match[2], { base64: true });
          imagesList.push(`images/${imageFileName}`);
        }

        // Create YOLO annotations — bboxes are in image/device pixels
        const annotations: string[] = [];
        const patternsToExport = getViewportPatterns(entry, vIdx, vs);
        for (const pattern of patternsToExport) {
          if (!pattern.bbox || pattern.bbox.length !== 4) continue;

          const [x, y, w, h] = pattern.bbox;
          const classId = getCategoryId(pattern.category) - 1;

          const centerX = (x + w / 2) / width;
          const centerY = (y + h / 2) / height;
          const normWidth = w / width;
          const normHeight = h / height;

          // Validate normalized values are in [0, 1]
          if (centerX < 0 || centerX > 1 || centerY < 0 || centerY > 1 ||
              normWidth < 0 || normWidth > 1 || normHeight < 0 || normHeight > 1) {
            console.warn(`[YOLO] Skipping out-of-range bbox: [${x},${y},${w},${h}] on ${width}×${height} image`);
            continue;
          }

          annotations.push(
            `${classId} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}`,
          );
        }

        if (labelsFolder && annotations.length > 0) {
          labelsFolder.file(labelFileName, annotations.join('\n'));
        }
      }
      continue;
    }

    // ── Legacy fallback: single screenshot ──
    if (!entry.screenshot) continue;

    globalIndex++;
    const baseName = sanitizeFilenameLocal(entry.id, `img_${globalIndex}`);
    const imageFileName = `${baseName}.png`;
    const labelFileName = `${baseName}.txt`;

    // Get ACTUAL image dimensions from the PNG
    let width: number;
    let height: number;
    try {
      const dims = await getImageDimensions(entry.screenshot);
      width = dims.width;
      height = dims.height;
    } catch {
      width = entry.metadata?.viewport?.width || 1920;
      height = entry.metadata?.viewport?.height || 1080;
    }

    const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
    if (match && imagesFolder) {
      imagesFolder.file(imageFileName, match[2], { base64: true });
      imagesList.push(`images/${imageFileName}`);
    }

    const annotations: string[] = [];
    const effectivePatterns = getEffectivePatterns(entry);
    for (const pattern of effectivePatterns) {
      if (!pattern.bbox || pattern.bbox.length !== 4) continue;

      const [x, y, w, h] = pattern.bbox;
      const classId = getCategoryId(pattern.type) - 1;

      const centerX = (x + w / 2) / width;
      const centerY = (y + h / 2) / height;
      const normWidth = w / width;
      const normHeight = h / height;

      if (centerX < 0 || centerX > 1 || centerY < 0 || centerY > 1 ||
          normWidth < 0 || normWidth > 1 || normHeight < 0 || normHeight > 1) {
        console.warn(`[YOLO] Skipping out-of-range bbox: [${x},${y},${w},${h}] on ${width}×${height} image`);
        continue;
      }

      annotations.push(
        `${classId} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}`,
      );
    }

    if (labelsFolder && annotations.length > 0) {
      labelsFolder.file(labelFileName, annotations.join('\n'));
    }
  }

  const classNames = DARK_PATTERN_CATEGORIES.map((c) => c.name).join('\n');
  zip.file('classes.txt', classNames);
  zip.file('train.txt', imagesList.join('\n'));

  const dataYaml = `
# Dark Pattern Detection Dataset
# Automatically generated for YOLO training

path: .
train: train.txt
val: train.txt  # Use same for validation in small datasets
test:

nc: ${DARK_PATTERN_CATEGORIES.length}
names: [${DARK_PATTERN_CATEGORIES.map((c) => `'${c.name}'`).join(', ')}]
`;
  zip.file('data.yaml', dataYaml.trim());

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Export annotated images with bounding boxes drawn on them.
 * Uses per-viewport screenshots when available so each viewport
 * is exported as a separate image with only its own patterns.
 * Falls back to single-screenshot export for legacy entries.
 *
 * @param entries - Optional array of entries to export. If not provided, loads all from IndexedDB.
 */
export async function exportAnnotatedImages(
  entries?: DatasetEntry[],
): Promise<Blob> {
  const data = entries ?? await getDatasetEntries();
  const zip = new JSZip();
  const originalFolder = zip.folder('original');
  const annotatedFolder = zip.folder('annotated');

  // Import the overlay function dynamically to avoid circular deps
  const { drawBboxesOnImage } = await import('./bboxOverlay');

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const baseName = sanitizeFilenameLocal(entry.id, `img_${i + 1}`);
    const viewportScreenshots = entry.viewport_screenshots;

    // ── Per-viewport export (preferred) ──
    if (viewportScreenshots && viewportScreenshots.length > 0) {
      for (let vIdx = 0; vIdx < viewportScreenshots.length; vIdx++) {
        const vs = viewportScreenshots[vIdx];
        if (!vs.screenshot) continue;

        const vpName = `${baseName}_vp${vIdx}`;

        // Add original viewport image
        const match = vs.screenshot.match(/^data:(.*?);base64,(.*)$/);
        if (match && originalFolder) {
          originalFolder.file(`${vpName}.png`, match[2], { base64: true });
        }

        // Annotate with ONLY this viewport's patterns (verified preferred)
        const vpPatterns = getViewportPatterns(entry, vIdx, vs);
        const annotations = vpPatterns
          .filter((p: any) => p.bbox && p.bbox.length === 4)
          .map((p: any) => ({
            bbox: p.bbox as [number, number, number, number],
            label: p.category || p.type || 'unknown',
            severity: p.severity || 'medium',
          }));

        if (annotations.length > 0 && annotatedFolder) {
          try {
            const annotatedImage = await drawBboxesOnImage(
              vs.screenshot,
              annotations,
            );
            const annotatedMatch = annotatedImage.match(
              /^data:(.*?);base64,(.*)$/,
            );
            if (annotatedMatch) {
              annotatedFolder.file(
                `${vpName}_annotated.png`,
                annotatedMatch[2],
                { base64: true },
              );
            }
          } catch (error) {
            console.error(`Failed to annotate viewport ${vpName}:`, error);
          }
        }
      }
    } else {
      // ── Legacy fallback: single screenshot with all patterns ──
      if (!entry.screenshot) continue;

      const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
      if (match && originalFolder) {
        originalFolder.file(`${baseName}.png`, match[2], { base64: true });
      }

      const effectivePatterns = getEffectivePatterns(entry);
      if (effectivePatterns.length > 0 && annotatedFolder) {
        try {
          const annotations = effectivePatterns
            .filter((p) => p.bbox && p.bbox.length === 4)
            .map((p) => ({
              bbox: p.bbox as [number, number, number, number],
              label: p.type,
              severity: p.severity,
            }));

          const annotatedImage = await drawBboxesOnImage(
            entry.screenshot,
            annotations,
          );
          const annotatedMatch = annotatedImage.match(
            /^data:(.*?);base64,(.*)$/,
          );
          if (annotatedMatch) {
            annotatedFolder.file(
              `${baseName}_annotated.png`,
              annotatedMatch[2],
              { base64: true },
            );
          }
        } catch (error) {
          console.error(`Failed to annotate image ${baseName}:`, error);
        }
      }
    }
  }

  // Add manifest with per-viewport breakdown
  const manifest = data.map((e, i) => {
    const viewportScreenshots = e.viewport_screenshots;
    const hasViewports = viewportScreenshots && viewportScreenshots.length > 0;

    return {
      id: e.id,
      url: e.url,
      viewport_count: hasViewports ? viewportScreenshots.length : 1,
      viewports: hasViewports
        ? viewportScreenshots.map((vs, vIdx) => ({
            viewport_index: vIdx,
            scrollY: vs.scrollY,
            pattern_count: (vs.patterns || []).length,
            patterns: (vs.patterns || []).map((p) => ({
              type: p.category || (p as any).type || 'unknown',
              severity: p.severity,
              bbox: p.bbox,
            })),
          }))
        : [
            {
              viewport_index: 0,
              scrollY: 0,
              pattern_count: getEffectivePatterns(e).length,
              patterns: getEffectivePatterns(e).map((p) => ({
                type: p.type,
                severity: p.severity,
                bbox: p.bbox,
              })),
            },
          ],
    };
  });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}
