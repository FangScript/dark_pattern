/**
 * COCO and YOLO Format Export Utilities
 * Export dark pattern annotations in standard detection formats for model training
 */

import JSZip from 'jszip';
import type { DarkPattern, DatasetEntry } from './datasetDB';
import { getDatasetEntries, getEffectivePatterns } from './datasetDB';

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
 */
export async function exportAsCOCO(): Promise<Blob> {
  const entries = await getDatasetEntries();
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

  for (const entry of entries) {
    if (!entry.screenshot) continue;

    imageId++;
    const imageFileName = `${sanitizeFilenameLocal(entry.id, `img_${imageId}`)}.png`;

    // Extract image dimensions (approximate from viewport if available)
    const width = entry.metadata?.viewport?.width || 1920;
    const height = entry.metadata?.viewport?.height || 1080;

    // Add image to zip
    const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
    if (match && imagesFolder) {
      imagesFolder.file(imageFileName, match[2], { base64: true });
    }

    // Add image metadata
    cocoDataset.images.push({
      id: imageId,
      file_name: imageFileName,
      width,
      height,
      date_captured: new Date(entry.timestamp).toISOString(),
      url: entry.url,
    });

    // Add annotations for each pattern
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

  // Add COCO annotation file
  zip.file(
    'annotations/instances_train.json',
    JSON.stringify(cocoDataset, null, 2),
  );

  // Add category mapping for reference
  zip.file('categories.json', JSON.stringify(DARK_PATTERN_CATEGORIES, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

/**
 * Export dataset in YOLO format
 * Each image has a corresponding .txt file with annotations
 * Format per line: class_id center_x center_y width height (all normalized 0-1)
 */
export async function exportAsYOLO(): Promise<Blob> {
  const entries = await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');
  const labelsFolder = zip.folder('labels');

  const imagesList: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.screenshot) continue;

    const baseName = sanitizeFilenameLocal(entry.id, `img_${i + 1}`);
    const imageFileName = `${baseName}.png`;
    const labelFileName = `${baseName}.txt`;

    // Get image dimensions
    const width = entry.metadata?.viewport?.width || 1920;
    const height = entry.metadata?.viewport?.height || 1080;

    // Add image to zip
    const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
    if (match && imagesFolder) {
      imagesFolder.file(imageFileName, match[2], { base64: true });
      imagesList.push(`images/${imageFileName}`);
    }

    // Create YOLO format annotations
    const annotations: string[] = [];
    const effectivePatterns = getEffectivePatterns(entry);
    for (const pattern of effectivePatterns) {
      if (!pattern.bbox || pattern.bbox.length !== 4) continue;

      const [x, y, w, h] = pattern.bbox;
      const classId = getCategoryId(pattern.type) - 1; // YOLO uses 0-indexed classes

      // Convert to YOLO format (center_x, center_y, width, height) normalized
      const centerX = (x + w / 2) / width;
      const centerY = (y + h / 2) / height;
      const normWidth = w / width;
      const normHeight = h / height;

      annotations.push(
        `${classId} ${centerX.toFixed(6)} ${centerY.toFixed(6)} ${normWidth.toFixed(6)} ${normHeight.toFixed(6)}`,
      );
    }

    // Add label file
    if (labelsFolder && annotations.length > 0) {
      labelsFolder.file(labelFileName, annotations.join('\n'));
    }
  }

  // Add classes file
  const classNames = DARK_PATTERN_CATEGORIES.map((c) => c.name).join('\n');
  zip.file('classes.txt', classNames);

  // Add train.txt with list of images
  zip.file('train.txt', imagesList.join('\n'));

  // Add data.yaml for YOLOv5/v8
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
 * Export annotated images with bounding boxes drawn on them
 */
export async function exportAnnotatedImages(): Promise<Blob> {
  const entries = await getDatasetEntries();
  const zip = new JSZip();
  const originalFolder = zip.folder('original');
  const annotatedFolder = zip.folder('annotated');

  // Import the overlay function dynamically to avoid circular deps
  const { drawBboxesOnImage } = await import('./bboxOverlay');

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry.screenshot) continue;

    const baseName = sanitizeFilenameLocal(entry.id, `img_${i + 1}`);

    // Add original image
    const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
    if (match && originalFolder) {
      originalFolder.file(`${baseName}.png`, match[2], { base64: true });
    }

    // Create annotated version
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
        const annotatedMatch = annotatedImage.match(/^data:(.*?);base64,(.*)$/);
        if (annotatedMatch) {
          annotatedFolder.file(`${baseName}_annotated.png`, annotatedMatch[2], {
            base64: true,
          });
        }
      } catch (error) {
        console.error(`Failed to annotate image ${baseName}:`, error);
      }
    }
  }

  // Add manifest
  const manifest = entries.map((e, i) => {
    const effectivePatterns = getEffectivePatterns(e);
    return {
      id: e.id,
      url: e.url,
      pattern_count: effectivePatterns.length,
      patterns: effectivePatterns.map((p) => ({
        type: p.type,
        severity: p.severity,
        bbox: p.bbox,
      })),
    };
  });
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}
