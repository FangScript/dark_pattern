import {
  IndexedDBManager,
  withErrorHandling,
} from '@darkpatternhunter/shared/baseDB';
import JSZip from 'jszip';
import {
  isDatasetCloudSyncEnabled,
  upsertDatasetEntryRemote,
} from './datasetSupabaseSync';

// Database configuration
const DB_NAME = 'dph_dataset';
const DB_VERSION = 1;
const DATASET_ENTRIES_STORE = 'dataset_entries';

/**
 * Fill missing location/description from evidence so UI and exports always have text.
 * Safe to call multiple times (idempotent when fields already set).
 */
export function enrichAutoLabel(label: AutoLabel): AutoLabel {
  const ev = (label.evidence || '').trim();
  const loc = (label.location || '').trim();
  const desc = (label.description || '').trim();
  if (loc && desc) {
    return { ...label, evidence: ev || label.evidence };
  }
  const cat = label.category || 'Dark pattern';
  return {
    ...label,
    evidence: ev || undefined,
    location:
      loc ||
      (ev
        ? 'Where the quoted evidence appears in this viewport (see bbox if present)'
        : 'Visible somewhere in this viewport'),
    description:
      desc ||
      (ev
        ? `${cat}: manipulative or high-pressure UI copy — "${ev.length > 300 ? `${ev.slice(0, 300)}…` : ev}"`
        : `${cat}: detected; add a short rationale if you verify this label.`),
  };
}

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
  /** dom = bbox from evidence grounding; vlm = model bbox */
  bboxSource?: 'dom' | 'vlm';
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
  // Metadata filled in by human (or carried over from AI label)
  location?: string;
  description?: string;
  evidence?: string;
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

    if (isDatasetCloudSyncEnabled()) {
      void upsertDatasetEntryRemote(entry).catch((err) => {
        console.warn('[datasetSupabaseSync] cloud upsert failed:', err);
      });
    }
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

// Export dataset as formatted JSON array (full IndexedDB shape: auto_labels, viewport_screenshots, etc.)
export const exportDatasetAsJSON = async (
  pretty: boolean | number = 2,
): Promise<string> => {
  const entries = await getDatasetEntries();
  const spacing =
    typeof pretty === 'number' && pretty >= 0 ? pretty : pretty ? 2 : undefined;
  return JSON.stringify(entries, null, spacing);
};

/** Canonical 18-category taxonomy labels (for export metadata — keep aligned with autoLabeling / COCO). */
export const DATASET_TAXONOMY_LABELS = [
  'Nagging',
  'Scarcity & Popularity',
  'FOMO / Urgency',
  'Reference Pricing',
  'Disguised Ads',
  'False Hierarchy',
  'Interface Interference',
  'Misdirection',
  'Hard To Close',
  'Obstruction',
  'Bundling',
  'Sneaking',
  'Hidden Information',
  'Subscription Trap',
  'Roach Motel',
  'Confirmshaming',
  'Forced Registration',
  'Gamification Pressure',
] as const;

/** One normalized label for vision / JSON training pipelines */
export interface DatasetTrainingLabel {
  dark_pattern_type: string;
  confidence: number;
  explanation: string;
  evidence?: string;
  severity?: string;
  location?: string;
  /** Pixel bbox [x, y, w, h] in coordinates of the image identified by `image_ref` */
  region: { x: number; y: number; width: number; height: number } | null;
  /** Which viewport image this bbox is relative to when multi-viewport data exists */
  viewport_index?: number;
  bbox_source?: 'dom' | 'vlm';
  model?: string;
  /** True only for human-accepted verified_labels */
  ground_truth: boolean;
  label_source: 'verified' | 'auto' | 'viewport' | 'legacy';
}

export interface DatasetTrainingEntry {
  id: string;
  url: string;
  timestamp: number;
  /** Thumbnail / first viewport screenshot (data URL) when stored */
  screenshot?: string;
  page_title?: string;
  labels: DatasetTrainingLabel[];
  /**
   * When present, bbox coordinates in labels refer to the matching index’s `screenshot`
   * (same scroll order as capture). Omitted in lightweight exports.
   */
  viewport_screenshots?: DatasetEntry['viewport_screenshots'];
}

export interface DatasetTrainingExport {
  schema_version: 'dph-training-v1';
  taxonomy: readonly string[];
  documentation: {
    bbox_space: string;
    label_priority: string;
  };
  entries: DatasetTrainingEntry[];
}

function bboxToRegion(
  bbox: [number, number, number, number] | undefined,
): { x: number; y: number; width: number; height: number } | null {
  if (!bbox || bbox.length !== 4) return null;
  const [x, y, w, h] = bbox;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

/**
 * Collect ML-ready labels for one entry. Prefers human-verified accepts; otherwise VLM auto_labels;
 * then per-viewport patterns; then legacy `patterns`.
 */
export function collectTrainingLabels(entry: DatasetEntry): DatasetTrainingLabel[] {
  const acceptedVerified = entry.verified_labels?.filter((v) => v.verified) ?? [];

  if (acceptedVerified.length > 0) {
    return acceptedVerified.map((v) => ({
      dark_pattern_type: v.category,
      confidence: 1,
      explanation: (v.description || v.notes || '').trim() || v.category,
      evidence: v.evidence,
      severity: 'medium',
      location: v.location,
      region: bboxToRegion(v.bbox),
      viewport_index: v.viewportIndex,
      ground_truth: true,
      label_source: 'verified' as const,
    }));
  }

  if (entry.auto_labels && entry.auto_labels.length > 0) {
    return entry.auto_labels.map((raw) => {
      const a = enrichAutoLabel(raw);
      return {
        dark_pattern_type: a.category,
        confidence: a.confidence,
        explanation: (a.description || '').trim() || a.category,
        evidence: a.evidence,
        severity: a.severity,
        location: a.location,
        region: bboxToRegion(a.bbox),
        viewport_index: a.viewportIndex,
        bbox_source: a.bboxSource,
        model: a.model,
        ground_truth: false,
        label_source: 'auto' as const,
      };
    });
  }

  if (entry.viewport_screenshots && entry.viewport_screenshots.length > 0) {
    const out: DatasetTrainingLabel[] = [];
    entry.viewport_screenshots.forEach((vp, vIdx) => {
      for (const raw of vp.patterns || []) {
        const a = enrichAutoLabel(raw);
        out.push({
          dark_pattern_type: a.category,
          confidence: a.confidence,
          explanation: (a.description || '').trim() || a.category,
          evidence: a.evidence,
          severity: a.severity,
          location: a.location,
          region: bboxToRegion(a.bbox),
          viewport_index: a.viewportIndex ?? vIdx,
          bbox_source: a.bboxSource,
          model: a.model,
          ground_truth: false,
          label_source: 'viewport' as const,
        });
      }
    });
    if (out.length > 0) return out;
  }

  return (entry.patterns || []).map((p) => ({
    dark_pattern_type: p.type,
    confidence: p.confidence ?? 0,
    explanation: p.description,
    evidence: p.evidence,
    severity: p.severity,
    location: p.location,
    region: bboxToRegion(p.bbox),
    viewport_index: p.viewportIndex,
    ground_truth: false,
    label_source: 'legacy' as const,
  }));
}

export type ExportTrainingJsonOptions = {
  /** Include full `viewport_screenshots` (large). Default true so bboxes match an image. */
  includeViewportScreenshots?: boolean;
};

/** JSON intended for collaborators / VLMs: every entry has an explicit `labels[]` with regions and scores. */
export const exportDatasetAsTrainingJSON = async (
  pretty: boolean | number = 2,
  options: ExportTrainingJsonOptions = {},
): Promise<string> => {
  const { includeViewportScreenshots = true } = options;
  const entries = await getDatasetEntries();
  const spacing =
    typeof pretty === 'number' && pretty >= 0 ? pretty : pretty ? 2 : undefined;

  const trainingEntries: DatasetTrainingEntry[] = entries.map((e) => ({
    id: e.id,
    url: e.url,
    timestamp: e.timestamp,
    screenshot: e.screenshot,
    page_title: e.metadata?.pageTitle,
    labels: collectTrainingLabels(e),
    viewport_screenshots: includeViewportScreenshots ? e.viewport_screenshots : undefined,
  }));

  const payload: DatasetTrainingExport = {
    schema_version: 'dph-training-v1',
    taxonomy: DATASET_TAXONOMY_LABELS,
    documentation: {
      bbox_space:
        'Each region is {x,y,width,height} in pixels on the image referenced by viewport_index: use entry.viewport_screenshots[viewport_index].screenshot when present; otherwise entry.screenshot (single-viewport / thumbnail).',
      label_priority:
        'Per entry: accepted verified_labels (ground_truth=true) if any; else auto_labels; else patterns on viewport_screenshots; else legacy patterns[].',
    },
    entries: trainingEntries,
  };

  return JSON.stringify(payload, null, spacing);
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
    const labels = collectTrainingLabels(entry);
    if (labels.length === 0) return;

    labels.forEach((lab, idx) => {
      const example: TextPatternExample = {
        id: `${entry.id}#${idx}`,
        url: entry.url,
        page_title: entry.metadata?.pageTitle,
        site_name: entry.metadata?.researchContext?.siteName,
        pattern_type: lab.dark_pattern_type,
        severity: (lab.severity as DarkPattern['severity']) || 'medium',
        label: lab.dark_pattern_type,
        evidence: lab.evidence || '',
        description: lab.explanation,
        dom_excerpt: entry.dom,
        research_tags: {
          isPakistaniEcommerce:
            entry.metadata?.researchContext?.isPakistaniEcommerce,
          modelUsed: entry.metadata?.researchContext?.modelUsed,
          analysisVersion: entry.metadata?.researchContext?.analysisVersion,
        },
      };

      lines.push(
        JSON.stringify({
          ...example,
          confidence: lab.confidence,
          region: lab.region,
          viewport_index: lab.viewport_index,
          ground_truth: lab.ground_truth,
          label_source: lab.label_source,
          bbox_source: lab.bbox_source,
          model: lab.model,
          location: lab.location,
        }),
      );
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
  /** Legacy field; often empty when using the agent pipeline */
  patterns: DarkPattern[];
  /** Normalized labels for training / sharing (same logic as exportDatasetAsTrainingJSON) */
  labels: DatasetTrainingLabel[];
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
      labels: collectTrainingLabels(entry),
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

  const saveDataUrlToImages = (
    fileName: string,
    dataUrl: string,
  ): string | null => {
    if (!imagesFolder) return null;
    const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    const base64Payload = match ? match[2] : null;
    if (!base64Payload) return null;
    imagesFolder.file(fileName, base64Payload, { base64: true });
    return `images/${fileName}`;
  };

  const emitPatternsForImage = async (
    patterns: DarkPattern[],
    imagePath: string,
    dataUrlForDims: string,
    currentImageId: number,
  ) => {
    const { w: width, h: height } = await getImageDimensions(dataUrlForDims);
    patterns.forEach((pattern) => {
      if (!pattern.bbox || pattern.bbox.length !== 4) return;
      const [x, y, w, h] = pattern.bbox;
      if (w <= 0 || h <= 0) return;

      const normX = normalize(x, width);
      const normY = normalize(y, height);
      const normW = normalize(w, width);
      const normH = normalize(h, height);

      const systemPrompt = `[SYSTEM] You are UI-TARS, an assistant that detects deceptive dark patterns in web interfaces.\n\n[INSTRUCTION] Analyze this webpage screenshot and identify any dark patterns present.\n\n[SCREENSHOT] ${imagePath}\n\n[RESPONSE]`;

      const category = pattern.type.toUpperCase().replace(/ /g, '_');

      const label = `I detected a ${pattern.type.toLowerCase()} dark pattern in this screenshot. ${pattern.type}: ${pattern.description}. The pattern is located at coordinates (${normX}, ${normY}) with dimensions ${normW} x ${normH} (normalized to image size).`;

      const example: UITarsStandardExample = {
        prompt: systemPrompt,
        label,
        image_path: imagePath,
        category,
        bbox: [x, y, w, h],
        image_id: currentImageId,
        annotation_id: annotationIdCounter++,
      };

      jsonlLines.push(JSON.stringify(example));
    });
  };

  // Process entries sequentially to await image loading
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex];
    const safeBase = sanitizeFilename(entry.id, `entry_${entryIndex + 1}`);

    let emitted = false;

    if (entry.viewport_screenshots?.length) {
      for (let vIdx = 0; vIdx < entry.viewport_screenshots.length; vIdx++) {
        const vp = entry.viewport_screenshots[vIdx];
        const rawPats = vp.patterns || [];
        if (!vp.screenshot || rawPats.length === 0) continue;

        const eff = rawPats.map((raw) =>
          autoLabelToDarkPattern(
            enrichAutoLabel({ ...raw, viewportIndex: raw.viewportIndex ?? vIdx }),
          ),
        );
        const withBbox = eff.filter(
          (p) =>
            p.bbox &&
            p.bbox.length === 4 &&
            p.bbox[2] > 0 &&
            p.bbox[3] > 0,
        );
        if (withBbox.length === 0) continue;

        const imageFileName = `${safeBase}_vp${vIdx}.png`;
        const imagePath = saveDataUrlToImages(imageFileName, vp.screenshot);
        if (!imagePath) continue;

        const currentImageId = imageIdCounter++;
        await emitPatternsForImage(withBbox, imagePath, vp.screenshot, currentImageId);
        emitted = true;
      }
    }

    if (emitted) continue;

    const eff = getEffectivePatterns(entry);
    if (!entry.screenshot || eff.length === 0) continue;

    const imageFileName = `${safeBase}.png`;
    const imagePath = saveDataUrlToImages(imageFileName, entry.screenshot);
    if (!imagePath) continue;

    const currentImageId = imageIdCounter++;
    await emitPatternsForImage(eff, imagePath, entry.screenshot, currentImageId);
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
  const ev = (autoLabel.evidence || '').trim();
  const desc = (autoLabel.description || '').trim();
  const loc = (autoLabel.location || '').trim();
  return {
    type: autoLabel.category,
    description:
      desc ||
      (ev ? `${autoLabel.category}: "${ev.length > 200 ? `${ev.slice(0, 200)}…` : ev}"` : ''),
    severity: autoLabel.severity || 'medium',
    location:
      loc ||
      (ev ? 'Near the quoted evidence text in the viewport' : ''),
    evidence: ev,
    confidence: autoLabel.confidence,
    bbox: autoLabel.bbox,
  };
}

/**
 * Convert VerifiedLabel to DarkPattern
 */
export function verifiedLabelToDarkPattern(verifiedLabel: VerifiedLabel): DarkPattern {
  const ev = (verifiedLabel.evidence || '').trim();
  const desc = (verifiedLabel.description || '').trim();
  const loc = (verifiedLabel.location || '').trim();
  return {
    type: verifiedLabel.category,
    description:
      desc ||
      (ev
        ? `${verifiedLabel.category}: "${ev.length > 200 ? `${ev.slice(0, 200)}…` : ev}"`
        : ''),
    severity: 'medium',
    location:
      loc ||
      (ev ? 'Near the quoted evidence text in the viewport' : ''),
    evidence: ev,
    confidence: verifiedLabel.verified ? 1.0 : 0.0,
    bbox: verifiedLabel.bbox,
  };
}

/**
 * Get effective patterns for an entry (verified_labels preferred, fallback to auto_labels)
 */
export function getEffectivePatterns(entry: DatasetEntry): DarkPattern[] {
  const acceptedVerified =
    entry.verified_labels?.filter((v) => v.verified) ?? [];
  if (acceptedVerified.length > 0) {
    return acceptedVerified.map(verifiedLabelToDarkPattern);
  }

  if (entry.auto_labels && entry.auto_labels.length > 0) {
    return entry.auto_labels.map((a) => autoLabelToDarkPattern(enrichAutoLabel(a)));
  }

  if (entry.viewport_screenshots && entry.viewport_screenshots.length > 0) {
    const merged: DarkPattern[] = [];
    entry.viewport_screenshots.forEach((vp, vIdx) => {
      for (const raw of vp.patterns || []) {
        merged.push(autoLabelToDarkPattern(enrichAutoLabel({ ...raw, viewportIndex: raw.viewportIndex ?? vIdx })));
      }
    });
    if (merged.length > 0) return merged;
  }

  return entry.patterns || [];
}
