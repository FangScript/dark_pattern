import {
  IndexedDBManager,
  withErrorHandling,
} from '@darkpatternhunter/shared/baseDB';
import JSZip from 'jszip';

// Database configuration
const DB_NAME = 'dph_dataset';
const DB_VERSION = 1;
const DATASET_ENTRIES_STORE = 'dataset_entries';

// Auto-label from AI model
export interface AutoLabel {
  category: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  confidence: number; // 0-1
  model: string; // Model identifier (e.g., "gpt-4o", "ui-tars-1.5-7b")
  description?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  location?: string;
  evidence?: string;
  viewportIndex?: number; // Which viewport this pattern was detected in
}

// Verified label from human reviewer
export interface VerifiedLabel {
  category: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  verified: boolean; // true = accepted, false = rejected
  reviewer?: string; // Optional reviewer identifier
  reviewTimestamp?: number;
  notes?: string;
  viewportIndex?: number; // Match the source viewport
}

// Dataset entry status
export type DatasetStatus = 'raw' | 'auto' | 'verified';

// Dataset entry interface with weak supervision support
export interface DatasetEntry {
  id: string;
  url: string;
  timestamp: number;
  screenshot?: string; // thumbnail (first viewport)
  dom?: string;
  // New fields for weak supervision pipeline
  auto_labels?: AutoLabel[]; // AI-generated labels from VLM
  verified_labels?: VerifiedLabel[]; // Human-verified labels
  status: DatasetStatus; // raw | auto | verified
  // Legacy field: patterns (kept for backward compatibility)
  patterns: DarkPattern[];
  // ── PER-VIEWPORT SCREENSHOTS ──────────────────────────────────────
  // Each viewport = one training image for YOLO dataset.
  // Patterns in each viewport have bboxes RELATIVE to that screenshot.
  viewport_screenshots?: Array<{
    screenshot: string;           // base64 data URL
    patterns: AutoLabel[];        // patterns with bboxes relative to THIS screenshot (device pixels)
    viewportWidth: number;        // CSS pixels
    viewportHeight: number;       // CSS pixels
    scrollY: number;              // CSS pixels — page scroll offset when captured
    devicePixelRatio: number;     // DPR at capture time
    stepLabel: string;            // "scan-0", "scan-1", "interact-expand", etc.
    phase: 'scan' | 'interact';
  }>;
  metadata?: {
    pageTitle?: string;
    viewport?: { width: number; height: number };
    userAgent?: string;
    researchContext?: {
      isPakistaniEcommerce?: boolean;
      siteName?: string;
      modelUsed?: string;
      analysisVersion?: string;
    };
    agentLoop?: {
      steps: string[];
      screenshotCount: number;
      viewportCount: number;
      usedVision: boolean;
    };
  };
  summary?: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}

// Legacy DarkPattern interface (kept for backward compatibility)
export interface DarkPattern {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  evidence: string;
  confidence?: number;
  bbox?: [number, number, number, number]; // [x, y, width, height]
  croppedImage?: string; // Individual cropped image showing ONLY this pattern (base64 data URL)
  viewportIndex?: number;
}

// IndexedDB entry interface (for storage)
interface IndexedDBDatasetEntry {
  id: string;
  url: string;
  timestamp: number;
  screenshot?: string;
  dom?: string;
  // New fields
  auto_labels?: AutoLabel[];
  verified_labels?: VerifiedLabel[];
  status?: DatasetStatus;
  // Legacy field
  patterns: DarkPattern[];
  // Per-viewport screenshots (each = one YOLO training image)
  viewport_screenshots?: DatasetEntry['viewport_screenshots'];
  metadata?: {
    pageTitle?: string;
    viewport?: { width: number; height: number };
    userAgent?: string;
    researchContext?: {
      isPakistaniEcommerce?: boolean;
      siteName?: string;
      modelUsed?: string;
      analysisVersion?: string;
    };
    agentLoop?: {
      steps: string[];
      screenshotCount: number;
      viewportCount: number;
      usedVision: boolean;
    };
  };
  summary?: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}

// Database manager instance
const datasetDbManager = new IndexedDBManager(DB_NAME, DB_VERSION, [
  { name: DATASET_ENTRIES_STORE, keyPath: 'id' },
]);

// Get all dataset entries from IndexedDB
export const getDatasetEntries = async (): Promise<DatasetEntry[]> => {
  return (
    (await withErrorHandling(
      async () => {
        const entries = await datasetDbManager.getAll<IndexedDBDatasetEntry>(
          DATASET_ENTRIES_STORE,
          true,
        );

        return entries.map((entry) => ({
          id: entry.id,
          url: entry.url,
          timestamp: entry.timestamp,
          screenshot: entry.screenshot,
          dom: entry.dom,
          auto_labels: entry.auto_labels,
          verified_labels: entry.verified_labels,
          status: entry.status || (entry.patterns?.length > 0 ? 'auto' : 'raw'),
          patterns: entry.patterns || [],
          viewport_screenshots: entry.viewport_screenshots,
          metadata: entry.metadata,
          summary: entry.summary,
        }));
      },
      'Failed to get dataset entries from IndexedDB',
      [],
    )) ?? []
  );
};

// Store dataset entry to IndexedDB
export const storeDatasetEntry = async (entry: DatasetEntry): Promise<void> => {
  await withErrorHandling(async () => {
    const data: IndexedDBDatasetEntry = {
      id: entry.id,
      url: entry.url,
      timestamp: entry.timestamp,
      screenshot: entry.screenshot,
      dom: entry.dom,
      auto_labels: entry.auto_labels,
      verified_labels: entry.verified_labels,
      status: entry.status || (entry.patterns?.length > 0 ? 'auto' : 'raw'),
      patterns: entry.patterns || [],
      viewport_screenshots: entry.viewport_screenshots,
      metadata: entry.metadata,
      summary: entry.summary,
    };

    await datasetDbManager.put(DATASET_ENTRIES_STORE, data);
  }, 'Failed to store dataset entry');
};

// Delete dataset entry from IndexedDB
export const deleteDatasetEntry = async (id: string): Promise<void> => {
  await withErrorHandling(
    () => datasetDbManager.delete(DATASET_ENTRIES_STORE, id),
    'Failed to delete dataset entry',
  );
};

// Clear all dataset entries
export const clearDatasetEntries = async (): Promise<void> => {
  await withErrorHandling(
    () => datasetDbManager.clear(DATASET_ENTRIES_STORE),
    'Failed to clear dataset entries',
  );
};

// Get dataset entry count
export const getDatasetEntryCount = async (): Promise<number> => {
  return (
    (await withErrorHandling(
      () => datasetDbManager.count(DATASET_ENTRIES_STORE),
      'Failed to get dataset entry count',
      0,
    )) ?? 0
  );
};

// Export dataset as JSONL
export const exportDatasetAsJSONL = async (): Promise<string> => {
  const entries = await getDatasetEntries();
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
};

// Export dataset as formatted JSON array
export const exportDatasetAsJSON = async (
  pretty: boolean | number = 2,
): Promise<string> => {
  const entries = await getDatasetEntries();
  const spacing =
    typeof pretty === 'number' && pretty >= 0 ? pretty : pretty ? 2 : undefined;
  return JSON.stringify(entries, null, spacing);
};

// Text-only JSONL export, flattened per detected pattern
export interface TextPatternExample {
  id: string;
  url: string;
  page_title?: string;
  site_name?: string;
  pattern_type: string;
  severity: DarkPattern['severity'];
  label: string;
  evidence: string;
  description: string;
  dom_excerpt?: string;
  research_tags?: {
    isPakistaniEcommerce?: boolean;
    modelUsed?: string;
    analysisVersion?: string;
  };
}

export const exportTextDatasetAsJSONL = async (): Promise<string> => {
  const entries = await getDatasetEntries();
  const lines: string[] = [];

  entries.forEach((entry) => {
    if (!entry.patterns || entry.patterns.length === 0) {
      return;
    }

    entry.patterns.forEach((pattern, idx) => {
      const example: TextPatternExample = {
        id: `${entry.id}#${idx}`,
        url: entry.url,
        page_title: entry.metadata?.pageTitle,
        site_name: entry.metadata?.researchContext?.siteName,
        pattern_type: pattern.type,
        severity: pattern.severity,
        label: pattern.type,
        evidence: pattern.evidence,
        description: pattern.description,
        dom_excerpt: entry.dom,
        research_tags: {
          isPakistaniEcommerce:
            entry.metadata?.researchContext?.isPakistaniEcommerce,
          modelUsed: entry.metadata?.researchContext?.modelUsed,
          analysisVersion: entry.metadata?.researchContext?.analysisVersion,
        },
      };

      lines.push(JSON.stringify(example));
    });
  });

  return lines.join('\n');
};

const sanitizeFilename = (value: string, fallback: string) => {
  const sanitized = value.replace(/[^a-z0-9-_]/gi, '_');
  return sanitized.length > 0 ? sanitized : fallback;
};

export interface ExportedDatasetRecord {
  id: string;
  url: string;
  timestamp: number;
  image_path: string | null;
  dom_excerpt?: string;
  patterns: DarkPattern[];
  summary?: DatasetEntry['summary'];
  metadata?: DatasetEntry['metadata'];
}

export const exportDatasetAsBundleZip = async (): Promise<Blob> => {
  const entries = await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');
  const manifest: ExportedDatasetRecord[] = [];
  const jsonlLines: string[] = [];

  entries.forEach((entry, index) => {
    const safeId = sanitizeFilename(entry.id, `entry_${index + 1}`);
    const imageFileName = `${safeId}.png`;
    let imagePath: string | null = null;

    if (entry.screenshot && imagesFolder) {
      const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
      const base64Payload = match ? match[2] : null;
      if (base64Payload) {
        imagesFolder.file(imageFileName, base64Payload, { base64: true });
        imagePath = `images/${imageFileName}`;
      }
    }

    const exportedRecord: ExportedDatasetRecord = {
      id: entry.id,
      url: entry.url,
      timestamp: entry.timestamp,
      image_path: imagePath,
      dom_excerpt: entry.dom,
      patterns: entry.patterns,
      summary: entry.summary,
      metadata: entry.metadata,
    };

    manifest.push(exportedRecord);
    jsonlLines.push(JSON.stringify(exportedRecord));
  });

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('processed.jsonl', jsonlLines.join('\n'));

  return zip.generateAsync({ type: 'blob' });
};

// UI-TARS fine-tuning format: Individual cropped image per pattern
export interface UITarsTrainingExample {
  image_path: string; // Path to individual cropped image showing ONLY this pattern
  pattern_type: string;
  bbox: [number, number, number, number]; // [x, y, width, height] - original coordinates in full screenshot
  label: string;
  severity: string;
  evidence: string;
  metadata: {
    url: string;
    page_title?: string;
    site_name?: string;
    original_entry_id?: string;
  };
}

export const exportForUITarsFineTuning = async (): Promise<Blob> => {
  const entries = await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');

  // UI-TARS standard format interface
  interface UITarsStandardExample {
    prompt: string;
    label: string;
    image_path: string;
    category: string;
    bbox: [number, number, number, number];
    image_id: number;
    annotation_id: number;
  }

  const jsonlLines: string[] = [];
  let imageIdCounter = 0;
  let annotationIdCounter = 0;

  // Helper to normalize coordinates for text description (0-1 range)
  const normalize = (val: number, total: number) => {
    return (val / total).toFixed(3);
  };

  // Helper to get image dimensions
  const getImageDimensions = (
    dataUrl: string,
  ): Promise<{ w: number; h: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.width, h: img.height });
      img.onerror = () => resolve({ w: 1920, h: 1080 }); // Fallback
      img.src = dataUrl;
    });
  };

  // Process entries sequentially to await image loading
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex];

    // Skip entries without valid screenshot or patterns
    if (!entry.screenshot || !entry.patterns || entry.patterns.length === 0) {
      continue;
    }

    // Get actual image dimensions to ensure correct normalization (handles DPR scaling)
    const { w: width, h: height } = await getImageDimensions(entry.screenshot);

    const safeId = sanitizeFilename(entry.id, `entry_${entryIndex + 1}`);
    const imageFileName = `${safeId}.png`;
    let imagePath = `images/${imageFileName}`;

    // Save FULL screenshot (shared by all patterns in this page)
    if (imagesFolder) {
      const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
      const base64Payload = match ? match[2] : null;
      if (base64Payload) {
        imagesFolder.file(imageFileName, base64Payload, { base64: true });
        // Update path to be absolute-like or relative as needed by user's training setup
        // For portability in zip, we use relative path inside zip
        imagePath = `images/${imageFileName}`;
      }
    }

    const currentImageId = imageIdCounter++;

    // Create one training example per pattern (Standard UI-TARS format)
    entry.patterns.forEach((pattern) => {
      // Validate bbox
      if (!pattern.bbox || pattern.bbox.length !== 4) return;

      const [x, y, w, h] = pattern.bbox;

      // Calculate normalized coordinates for description
      const normX = normalize(x, width);
      const normY = normalize(y, height);
      const normW = normalize(w, width);
      const normH = normalize(h, height);

      // Construct proper UI-TARS prompt and response
      const systemPrompt = `[SYSTEM] You are UI-TARS, an assistant that detects deceptive dark patterns in web interfaces.\n\n[INSTRUCTION] Analyze this webpage screenshot and identify any dark patterns present.\n\n[SCREENSHOT] ${imagePath}\n\n[RESPONSE]`;

      const category = pattern.type.toUpperCase().replace(/ /g, '_'); // e.g., "ACTIVITY MESSAGE"

      const label = `I detected a ${pattern.type.toLowerCase()} dark pattern in this screenshot. ${pattern.type}: ${pattern.description}. The pattern is located at coordinates (${normX}, ${normY}) with dimensions ${normW} x ${normH} (normalized to image size).`;

      const example: UITarsStandardExample = {
        prompt: systemPrompt,
        label: label,
        image_path: imagePath, // Use relative path in zip
        category: category,
        bbox: [x, y, w, h],
        image_id: currentImageId,
        annotation_id: annotationIdCounter++,
      };

      jsonlLines.push(JSON.stringify(example));
    });
  }

  zip.file('processed.jsonl', jsonlLines.join('\n'));
  zip.file(
    'dataset_info.json',
    JSON.stringify(
      {
        total_images: imageIdCounter,
        total_annotations: annotationIdCounter,
        created_at: new Date().toISOString(),
        format: 'uitars_standard_web',
        notes:
          'Full screenshots with bounding box annotations in UI-TARS JSONL format.',
      },
      null,
      2,
    ),
  );

  return zip.generateAsync({ type: 'blob' });
};

/**
 * Convert AutoLabel to DarkPattern (for backward compatibility)
 */
export function autoLabelToDarkPattern(autoLabel: AutoLabel): DarkPattern {
  return {
    type: autoLabel.category,
    description: autoLabel.description || '',
    severity: autoLabel.severity || 'medium',
    location: autoLabel.location || '',
    evidence: autoLabel.evidence || '',
    confidence: autoLabel.confidence,
    bbox: autoLabel.bbox,
  };
}

/**
 * Convert VerifiedLabel to DarkPattern
 */
export function verifiedLabelToDarkPattern(verifiedLabel: VerifiedLabel): DarkPattern {
  return {
    type: verifiedLabel.category,
    description: '',
    severity: 'medium',
    location: '',
    evidence: '',
    confidence: verifiedLabel.verified ? 1.0 : 0.0,
    bbox: verifiedLabel.bbox,
  };
}

/**
 * Get effective patterns for an entry (verified_labels preferred, fallback to auto_labels)
 */
export function getEffectivePatterns(entry: DatasetEntry): DarkPattern[] {
  // If verified_labels exist, use those (only verified=true)
  if (entry.verified_labels && entry.verified_labels.length > 0) {
    return entry.verified_labels
      .filter((v) => v.verified)
      .map(verifiedLabelToDarkPattern);
  }

  // Otherwise, convert auto_labels to patterns
  if (entry.auto_labels && entry.auto_labels.length > 0) {
    return entry.auto_labels.map(autoLabelToDarkPattern);
  }

  // Fallback to legacy patterns field
  return entry.patterns || [];
}
