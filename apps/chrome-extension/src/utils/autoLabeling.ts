/**
 * Auto-Labeling Engine for Weak Supervision
 * 
 * Uses Vision-Language Models (VLM) to automatically detect dark patterns
 * and generate structured labels with bounding boxes and confidence scores.
 */

import { AIActionType, callAIWithObjectResponse } from '@darkpatternhunter/core/ai-model';
import { getDebug } from '@darkpatternhunter/shared/logger';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { AutoLabel } from './datasetDB';
import { getActiveModelConfig } from './aiConfig';
import { getImageDimensions } from './coordinateUtils';
import { groundAutoLabelsViewportRelative } from './domEvidenceGrounding';

const debug = getDebug('auto-labeling');

// 18-category taxonomy (canonical labels)
const DARK_PATTERN_TAXONOMY = [
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

// VLM Prompt Template for Auto-Labeling (research-grade, strict + evidence-based)
const AUTO_LABELING_PROMPT = `You are a research-grade dark pattern detection and localization model specialized in e-commerce interfaces.

CONTEXT ISOLATION (CRITICAL — READ FIRST)

You are analyzing ONE SINGLE VIEWPORT SCREENSHOT.
This screenshot is COMPLETELY INDEPENDENT.

Do NOT:
- Think about or reference previous screenshots
- Detect elements not fully visible in this image
- Assume content above, below, or outside this image
- Use memory from earlier images
- Duplicate detections from other viewports

If an element is partially cut off at the edge of the screenshot, DO NOT label it.
Only detect patterns that are FULLY VISIBLE inside THIS image.

You perform evidence-based visual + structural analysis.

You must prioritize:

- Precise bounding boxes
- Conservative labeling
- Well-calibrated confidence
- Dataset-quality consistency

You are generating labels for a research dataset.
Incorrect labels reduce dataset quality.
Be strict and evidence-driven.

INPUTS

You will receive:

- A SINGLE viewport screenshot of an e-commerce webpage (NOT the full page)
- The webpage DOM HTML (may be long or partial)

Use BOTH modalities:

- Screenshot → visual evidence, UI prominence, styling
- DOM → structure, hidden defaults, prechecked inputs, scripts, hidden elements

If screenshot and DOM conflict → prioritize visible screenshot evidence.

TASK

Detect and LOCALIZE any dark patterns present using the taxonomy below.

You must:

- Identify concrete visual/structural evidence.
- Localize it precisely.
- Assign calibrated confidence.
- Avoid speculative labeling.

TAXONOMY (USE EXACT LABELS)

${DARK_PATTERN_TAXONOMY.join('\n')}

Do NOT invent new labels. Use EXACT spelling.

DETECTION RULES (STRICT)

Only label a pattern if:

- Clear visual or DOM evidence exists
- It matches the taxonomy definition
- It is localized in the screenshot
- It would reasonably influence user decision-making

Do NOT label:

- Normal UX patterns
- Standard discounts without anchoring
- Legitimate stock counters without pressure framing
- Clean UI hierarchy without manipulation
- Subscription offers without friction evidence

BOUNDING BOX RULES (CRITICAL)

Each pattern MUST include:

"bbox": [x, y, width, height]

Rules:

- Coordinates in PIXELS
- Relative to the provided screenshot
- Tightly enclose the visual evidence
- Do NOT include unrelated whitespace
- Do NOT estimate outside visible area
- Do NOT guess coordinates

If multiple separate UI elements independently qualify → return separate pattern objects.
If you cannot confidently localize → do NOT output that pattern.

CONFIDENCE CALIBRATION (STRICT)

Base confidence on:

- Strength of evidence
- Clarity of visual signals
- Alignment with taxonomy definition
- Manipulative intent clarity

Scale:

0.90–1.00: Unmistakable manipulation (rare)
0.75–0.89: Strong evidence with minor ambiguity
0.50–0.74: Plausible but some uncertainty
<0.50: Do NOT output

Be conservative. High confidence should be rare.

FALSE POSITIVE GUARDRAILS

Before finalizing output:

- Remove duplicate overlapping labels
- Do not label the same UI block under multiple categories unless clearly distinct mechanisms
- If unsure between two categories → choose the most specific one
- Avoid over-labeling
- Maximum 5 patterns per screenshot — if you find more, keep only the highest confidence ones
- If two bounding boxes overlap by more than 50%, keep only the one with higher confidence

Dataset precision > recall.

EDGE CASE RULES

- Countdown timer exists but no urgency language → still FOMO / Urgency if visually time-bound
- Prechecked checkbox found in DOM → label Bundling (only if visible in screenshot)
- Large CTA dominates + small gray decline → False Hierarchy
- Crossed-out price without credible reference → Reference Pricing
- Modal appears immediately blocking page → Nagging or Hard To Close (depending on dismiss friction)

OUTPUT FORMAT (JSON ONLY — NO TEXT)

Return EXACTLY this schema:

{
  "patterns": [
    {
      "category": "Exact Taxonomy Label",
      "bbox": [x, y, width, height],
      "confidence": 0.00,
      "evidence": "Verbatim visible UI text PLUS nearby context so this instance is unique in this viewport (avoid generic label-only evidence)",
      "location": "Short phrase with relative position + anchor (e.g. top-right product card near price, checkout header, sticky bottom banner, modal footer)",
      "description": "1–2 sentences: why this qualifies as that dark pattern (not generic UI description)"
    }
  ]
}

Rules:

- Valid JSON only
- No explanations outside JSON
- No markdown
- No comments
- No trailing commas

EVIDENCE QUALITY RULES (MANDATORY):
- Do NOT output generic evidence like "Add to Cart" alone.
- Include nearby contextual text (price, discount line, section title, etc.).
- Include relative position in location (top/middle/bottom + nearby anchor).

If no patterns detected, return:

{
  "patterns": []
}`;

// AI Response Schema
interface AutoLabelingResponse {
  patterns: Array<{
    category?: string;
    type?: string;
    bbox?: [number, number, number, number] | null;
    confidence: number;
    description?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    location?: string;
    evidence?: string;
    element_hint?: string | null;
  }>;
  // Compatibility with strict single-object schemas
  type?: string;
  /** Some prompts use `confidence`, others `modelConfidence` */
  confidence?: number;
  modelConfidence?: number;
  element_hint?: 'button' | 'text' | 'badge' | 'banner' | null;
  bbox?: [number, number, number, number] | null;
  description?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  evidence?: string | null;
  location?: string | null;
}

function normalizeCategory(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (!v || v.toLowerCase() === 'none') return null;

  const direct = DARK_PATTERN_TAXONOMY.find((cat) => cat.toLowerCase() === v.toLowerCase());
  if (direct) return direct;

  // Compatibility mapping for alternate label sets
  const map: Record<string, string> = {
    'scarcity': 'Scarcity & Popularity',
    'social proof pressure': 'Scarcity & Popularity',
    'forced continuity': 'Subscription Trap',
    'hidden costs': 'Hidden Information',
    'bait and switch': 'Misdirection',
    'trick questions': 'Misdirection',
    'privacy zuckering': 'Forced Registration',
    'preselection': 'Bundling',
    'hard to cancel': 'Roach Motel',
    'visual interference': 'Interface Interference',
  };

  const mapped = map[v.toLowerCase()];
  return mapped ?? null;
}

/** Human-readable placement when the model only returns element_hint */
function elementHintToLocation(hint: string | undefined | null): string {
  if (!hint) return '';
  const h = hint.trim().toLowerCase();
  const map: Record<string, string> = {
    button: 'Clickable CTA / button area',
    text: 'Inline text, label, or paragraph',
    badge: 'Small badge, chip, or highlight',
    banner: 'Banner, strip, or wide promotional block',
  };
  return map[h] || `UI region: ${hint}`;
}

/**
 * Validate and heuristically fix auto-label responses (especially from LM Studio models)
 */
function validateAutoLabel(
  label: AutoLabelingResponse['patterns'][0] & { type?: string },
  modelName: string,
  imgWidth: number = 1920,
  imgHeight: number = 1080,
): AutoLabel | null {
  // Validate category (some models return "type" instead of "category")
  const categoryRaw = label.category ?? label.type;
  const normalizedCategory = normalizeCategory(categoryRaw);
  const validCategory = normalizedCategory
    ? DARK_PATTERN_TAXONOMY.find((cat) => cat.toLowerCase() === normalizedCategory.toLowerCase())
    : null;
  
  if (!validCategory) {
    debug(`Invalid category: ${categoryRaw}`);
    return null;
  }

  // BBox is optional in strict schemas; keep as text-only label when missing.
  const hasValidBbox = Array.isArray(label.bbox) && label.bbox.length === 4;
  let x = 0;
  let y = 0;
  let width = 0;
  let height = 0;
  if (hasValidBbox) {
    [x, y, width, height] = label.bbox as [number, number, number, number];
  }

  // ── LM STUDIO HEURISTICS ──
  
  // Heuristic 1: Normalized [ymin, xmin, ymax, xmax] from 0-1000 (Very common in Qwen2.5-VL / LLaVA)
  // If all coordinates are <= 1000 but the image is much larger, it's likely normalized.
  // Note: Sometimes the prompt tricks it into Outputting [x, y, width, height] but STILL using the 0-1000 scale.
  // We check if it looks like a bounding box format first:
  if (hasValidBbox) {
    const allUnder1000 = x <= 1000 && y <= 1000 && width <= 1000 && height <= 1000;
    if (allUnder1000 && (imgWidth > 1200 || imgHeight > 1200)) {
      // If width/height are actually xmax/ymax coords (they are larger than x/y)
      if (width > x && height > y) {
        // Is it [xmin, ymin, xmax, ymax] or [ymin, xmin, ymax, xmax]?
        // Let's assume the prompt failed and it output [xmin, ymin, xmax, ymax] normalized to 1000
        const xmin = (x / 1000) * imgWidth;
        const ymin = (y / 1000) * imgHeight;
        const xmax = (width / 1000) * imgWidth;
        const ymax = (height / 1000) * imgHeight;
        x = xmin;
        y = ymin;
        width = xmax - xmin;
        height = ymax - ymin;
      } else {
        // It's [x, y, width, height] but normalized to 1000
        x = (x / 1000) * imgWidth;
        y = (y / 1000) * imgHeight;
        width = (width / 1000) * imgWidth;
        height = (height / 1000) * imgHeight;
      }
    }

    // Heuristic 2: Absolute pixels but formatted as [xmin, ymin, xmax, ymax]
    // In [x,y,w,h], width is a length. If the AI output an xmax coordinate instead, 
    // 'width' would be an absolute coordinate near the right edge of the screen.
    // Example: [100, 100, 1500, 800] -> xmax=1500 > imgWidth*0.5.
    // If 'width' is extremely large AND larger than x, it's likely xmax.
    if (width > x && height > y && width > imgWidth * 0.5 && x > 0) {
      // If the difference creates a valid box, it was likely xmax/ymax
      if (width <= imgWidth && height <= imgHeight) {
        const xmax = width;
        const ymax = height;
        width = xmax - x;
        height = ymax - y;
      }
    }

    // Final sanity limits
    x = Math.max(0, x);
    y = Math.max(0, y);
    width = Math.max(10, Math.min(width, imgWidth - x));
    height = Math.max(10, Math.min(height, imgHeight - y));

    if (
      width <= 0 ||
      height <= 0
    ) {
      debug(`Invalid bbox values: [${x}, ${y}, ${width}, ${height}]`);
      return null;
    }
  }

  // Validate confidence
  const confidence = Math.max(0, Math.min(1, label.confidence || 0));
  if (confidence < 0.5) {
    debug(`Low confidence filtered: ${confidence}`);
    return null;
  }

  const evidenceStr = (label.evidence ?? '').trim();
  const descRaw = (label.description ?? '').trim();
  const locRaw = (label.location ?? '').trim();
  const hint = (label as { element_hint?: string | null }).element_hint;
  const location =
    locRaw ||
    elementHintToLocation(typeof hint === 'string' ? hint : null) ||
    (evidenceStr ? 'Region containing the quoted evidence (see Evidence)' : 'Visible in this viewport');
  const description =
    descRaw ||
    (evidenceStr
      ? `${validCategory}: manipulative copy shown in the UI — "${evidenceStr.length > 220 ? `${evidenceStr.slice(0, 220)}…` : evidenceStr}"`
      : `${validCategory}: detected from visible UI (see category and evidence).`);

  return {
    category: validCategory,
    bbox: hasValidBbox ? [x, y, width, height] : [0, 0, 0, 0],
    confidence,
    model: modelName,
    description,
    severity: label.severity || 'medium',
    location,
    evidence: evidenceStr || undefined,
  };
}

/**
 * Detect if an error is a vision/image-not-supported error from a local model
 */
export function isImageSupportError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('failed to process image') ||
    msg.includes('does not support image') ||
    msg.includes('image_url') ||
    msg.includes('multimodal') ||
    msg.includes('vision')
  );
}

/**
 * DOM-only analysis — for models that don't support vision/images (e.g. local LLMs).
 * Analyzes page DOM structure for dark patterns without requiring screenshot.
 * Patterns are returned without bboxes (bbox = [0,0,0,0]).
 */
export async function autoLabelDOMOnly(
  dom: string,
  url?: string,
): Promise<AutoLabel[]> {
  const modelConfig = await getActiveModelConfig();
  const usedModelName = modelConfig?.modelName || 'unknown';

  debug(`DOM-only labeling with model: ${usedModelName}`);

  try {
    if (!modelConfig || !modelConfig.modelName) throw new Error('AI model not configured');

    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a research-grade dark pattern detection model specialized in e-commerce.
You analyze HTML DOM structure to detect manipulative dark patterns.
You do NOT have access to screenshots — analyze structure and text only.
Return ONLY valid JSON, no markdown, no explanation.`,
      },
      {
        role: 'user',
        content: `Analyze this webpage's DOM for dark patterns.
${url ? `URL: ${url}` : ''}

DOM HTML (excerpt):
${dom.substring(0, 6000)}

Use ONLY these category labels:
${DARK_PATTERN_TAXONOMY.join(', ')}

Look for:
- Countdown timers (urgency/FOMO) in DOM structure
- Crossed-out prices or fake "was/now" pricing (Reference Pricing)
- Pre-checked checkboxes for add-ons (Bundling/Sneaking)
- Small/hidden unsubscribe paths (Roach Motel/Subscription Trap)
- Forced account/registration gates (Forced Registration)
- Nagging popups or repeated prompts (Nagging)
- Urgency/scarcity text in class names or data attributes
- Hidden fees or condition text in small/secondary elements (Hidden Information)
- Confirmshaming language in decline buttons
- Urdu / Roman Urdu text that indicates any of the above

Return JSON:
{
  "patterns": [
    {
      "category": "exact label from taxonomy",
      "confidence": 0.0 to 1.0,
      "evidence": "exact text or element from DOM proving the pattern",
      "severity": "low" | "medium" | "high" | "critical",
      "location": "where on page (header/product card/modal/footer/etc)"
    }
  ]
}

Rules:
- Only patterns with confidence > 0.65
- Only CLEAR DOM evidence, not speculation
- No bboxes required (DOM-only mode)
- If no patterns found return: { "patterns": [] }`,
      },
    ];

    const response = await callAIWithObjectResponse<AutoLabelingResponse>(
      messages,
      AIActionType.EXTRACT_DATA,
      modelConfig,
    );

    const validatedLabels: AutoLabel[] = [];
    if (response.content.patterns && Array.isArray(response.content.patterns)) {
      for (const pattern of response.content.patterns) {
        const validCategory = DARK_PATTERN_TAXONOMY.find(
          (cat) => cat.toLowerCase() === pattern.category?.toLowerCase(),
        );
        if (!validCategory) continue;

        const confidence = Math.max(0, Math.min(1, pattern.confidence || 0));
        if (confidence < 0.5) continue;

        validatedLabels.push({
          category: validCategory,
          bbox: pattern.bbox ?? [0, 0, 0, 0],
          confidence,
          model: usedModelName,
          description: pattern.evidence || pattern.description,
          severity: pattern.severity || 'medium',
          location: pattern.location,
          evidence: pattern.evidence,
        });
      }
    }

    debug(`DOM-only labeling complete: ${validatedLabels.length} labels`);
    return validatedLabels;
  } catch (error) {
    debug('DOM-only labeling failed:', error);
    throw new Error(
      `DOM-only labeling failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Auto-label a screenshot using VLM
 *
 * @param screenshot - Base64 data URL of screenshot
 * @param dom - DOM HTML string
 * @param modelName - Optional model identifier (defaults to current config)
 * @param domGrounding - When set, replaces bboxes using evidence text in the live tab (viewport-relative pixels)
 * @returns Array of validated AutoLabel objects
 */
export async function autoLabelScreenshot(
  screenshot: string,
  dom?: string,
  modelName?: string,
  domGrounding?: { tabId: number; scrollY: number },
): Promise<AutoLabel[]> {
  const modelConfig = await getActiveModelConfig();
  const usedModelName = modelName || modelConfig.modelName || 'unknown';

  debug(`Auto-labeling with model: ${usedModelName}`);

  try {
    if (!modelConfig || !modelConfig.modelName) {
      throw new Error('AI model not configured');
    }
    if (!modelConfig.openaiApiKey) {
      // In local mode this may be a dummy key, but it should still be present.
      throw new Error('Missing API key for active model configuration');
    }

    // Prepare messages for VLM
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: AUTO_LABELING_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `SINGLE VIEWPORT SCREENSHOT — Analyze ONLY what is visible in this one image.
Do NOT assume or reference content from any other screenshot.
IGNORE previous or next screenshots — this viewport is completely independent.

${dom ? `DOM Structure (excerpt):\n${dom.substring(0, 2000)}...` : 'DOM not available.'}

Detect dark patterns FULLY VISIBLE in this screenshot only.
Provide precise bounding boxes with confidence scores.
If unsure, return fewer patterns rather than guessing.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: screenshot,
            },
          },
        ],
      },
    ];

    // Call AI with retry logic
    const response = await callAIWithObjectResponse<AutoLabelingResponse>(
      messages,
      AIActionType.EXTRACT_DATA,
      modelConfig,
    );

    // Validate and filter labels
    const validatedLabels: AutoLabel[] = [];
    let imgWidth = 1920;
    let imgHeight = 1080;
    try {
      if (screenshot) {
        const dims = await getImageDimensions(screenshot);
        imgWidth = dims.width;
        imgHeight = dims.height;
      }
    } catch (e) {
      debug('Failed to get screenshot dimensions for heuristic parsing', e);
    }

    const parsedPatterns: AutoLabelingResponse['patterns'] = [];
    if (response.content.patterns && Array.isArray(response.content.patterns)) {
      parsedPatterns.push(...response.content.patterns);
    } else if (typeof response.content.type === 'string') {
      // Support strict single-object output schema:
      // { type, confidence OR modelConfidence, evidence, element_hint, bbox, description, location, severity }
      const c =
        typeof response.content.confidence === 'number'
          ? response.content.confidence
          : typeof response.content.modelConfidence === 'number'
            ? response.content.modelConfidence
            : 0;
      parsedPatterns.push({
        category: response.content.type,
        confidence: c,
        bbox: response.content.bbox ?? null,
        description: response.content.description ?? undefined,
        severity: response.content.severity,
        evidence: response.content.evidence ?? undefined,
        location: response.content.location ?? undefined,
        element_hint: response.content.element_hint ?? undefined,
      });
    }

    if (parsedPatterns.length > 0) {
      for (const pattern of parsedPatterns) {
        const validated = validateAutoLabel(pattern, usedModelName, imgWidth, imgHeight);
        if (validated) {
          validatedLabels.push(validated);
        }
      }
    }

    let labelsForNms = validatedLabels;
    if (domGrounding?.tabId !== undefined) {
      labelsForNms = await groundAutoLabelsViewportRelative(
        domGrounding.tabId,
        validatedLabels,
        domGrounding.scrollY,
        imgWidth,
        imgHeight,
        { expectedScrollY: domGrounding.scrollY, viewportHeight: imgHeight },
      );
    }

    // ── Post-processing: NMS + max cap ──────────────────────────────────
    // Remove overlapping bboxes (keep higher confidence), then cap at 5
    const nmsLabels = applyNMS(labelsForNms, 0.5);
    const cappedLabels = nmsLabels
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    if (validatedLabels.length !== cappedLabels.length) {
      debug(`Post-processing: ${validatedLabels.length} → ${cappedLabels.length} labels (NMS + cap)`);
    }

    debug(`Auto-labeling complete: ${cappedLabels.length} valid labels`);
    return cappedLabels;
  } catch (error) {
    debug('Auto-labeling failed:', error);
    throw new Error(
      `Auto-labeling failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Non-Maximum Suppression (NMS): Remove overlapping bboxes, keeping highest confidence
 */
function applyNMS(labels: AutoLabel[], iouThreshold: number): AutoLabel[] {
  if (labels.length <= 1) return labels;

  // Sort descending by confidence
  const sorted = [...labels].sort((a, b) => b.confidence - a.confidence);
  const kept: AutoLabel[] = [];
  const suppressed = new Set<number>();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;
    kept.push(sorted[i]);

    // Suppress lower-confidence boxes that overlap too much
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;
      const iou = calculateIoU(sorted[i].bbox, sorted[j].bbox);
      if (iou >= iouThreshold) {
        suppressed.add(j);
        debug(`NMS: suppressed "${sorted[j].category}" (conf=${sorted[j].confidence.toFixed(2)}) — overlaps "${sorted[i].category}" (IoU=${iou.toFixed(2)})`);
      }
    }
  }

  return kept;
}

/**
 * Multi-model voting: Aggregate labels from multiple models
 * 
 * @param labelSets - Array of label arrays from different models
 * @param iouThreshold - IoU threshold for matching boxes (default 0.5)
 * @returns Aggregated labels with averaged confidence
 */
export function aggregateMultiModelLabels(
  labelSets: AutoLabel[][],
  iouThreshold = 0.5,
): AutoLabel[] {
  if (labelSets.length === 0) return [];
  if (labelSets.length === 1) return labelSets[0];

  debug(`Aggregating labels from ${labelSets.length} models`);

  // Flatten all labels with model tracking
  const allLabels: Array<AutoLabel & { modelIndex: number }> = [];
  labelSets.forEach((labels, modelIdx) => {
    labels.forEach((label) => {
      allLabels.push({ ...label, modelIndex: modelIdx });
    });
  });

  // Group by category
  const byCategory = new Map<string, typeof allLabels>();
  allLabels.forEach((label) => {
    const key = label.category;
    if (!byCategory.has(key)) {
      byCategory.set(key, []);
    }
    byCategory.get(key)!.push(label);
  });

  const aggregated: AutoLabel[] = [];

  // For each category, find overlapping boxes and aggregate
  byCategory.forEach((labels, category) => {
    // Sort by confidence (descending)
    labels.sort((a, b) => b.confidence - a.confidence);

    const clusters: Array<typeof allLabels> = [];

    labels.forEach((label) => {
      let assigned = false;
      for (const cluster of clusters) {
        // Check if this label overlaps with any label in cluster
        const overlaps = cluster.some((clusterLabel) => {
          const iou = calculateIoU(label.bbox, clusterLabel.bbox);
          return iou >= iouThreshold;
        });

        if (overlaps) {
          cluster.push(label);
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        clusters.push([label]);
      }
    });

    // Aggregate each cluster
    clusters.forEach((cluster) => {
      if (cluster.length === 1) {
        // Single model, use as-is
        const { modelIndex, ...label } = cluster[0];
        aggregated.push(label);
      } else {
        // Multiple models agree, average bbox and confidence
        const avgBbox = averageBbox(cluster.map((l) => l.bbox));
        const avgConfidence =
          cluster.reduce((sum, l) => sum + l.confidence, 0) / cluster.length;
        const models = [...new Set(cluster.map((l) => l.model))].join(',');

        aggregated.push({
          category: cluster[0].category,
          bbox: avgBbox,
          confidence: Math.min(1, avgConfidence * 1.1), // Slight boost for agreement
          model: `voting:${models}`,
          description: cluster[0].description,
          severity: cluster[0].severity,
          location: cluster[0].location,
          evidence: cluster[0].evidence,
        });
      }
    });
  });

  debug(`Aggregated to ${aggregated.length} labels`);
  return aggregated;
}

/**
 * Calculate Intersection over Union (IoU) for two bounding boxes
 */
function calculateIoU(
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number],
): number {
  const [x1, y1, w1, h1] = bbox1;
  const [x2, y2, w2, h2] = bbox2;

  const x1End = x1 + w1;
  const y1End = y1 + h1;
  const x2End = x2 + w2;
  const y2End = y2 + h2;

  const interX = Math.max(0, Math.min(x1End, x2End) - Math.max(x1, x2));
  const interY = Math.max(0, Math.min(y1End, y2End) - Math.max(y1, y2));
  const interArea = interX * interY;

  const area1 = w1 * h1;
  const area2 = w2 * h2;
  const unionArea = area1 + area2 - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

/**
 * Average multiple bounding boxes
 */
function averageBbox(
  bboxes: Array<[number, number, number, number]>,
): [number, number, number, number] {
  const n = bboxes.length;
  const sumX = bboxes.reduce((sum, [x]) => sum + x, 0);
  const sumY = bboxes.reduce((sum, [, y]) => sum + y, 0);
  const sumW = bboxes.reduce((sum, [, , w]) => sum + w, 0);
  const sumH = bboxes.reduce((sum, [, , , h]) => sum + h, 0);

  return [
    Math.round(sumX / n),
    Math.round(sumY / n),
    Math.round(sumW / n),
    Math.round(sumH / n),
  ];
}

/**
 * Confidence filtering: Categorize labels by confidence
 */
export interface ConfidenceFilterResult {
  high: AutoLabel[]; // confidence > 0.75
  medium: AutoLabel[]; // 0.5 <= confidence <= 0.75
  low: AutoLabel[]; // confidence < 0.5 (discard)
}

export function filterByConfidence(labels: AutoLabel[]): ConfidenceFilterResult {
  const result: ConfidenceFilterResult = {
    high: [],
    medium: [],
    low: [],
  };

  labels.forEach((label) => {
    if (label.confidence > 0.75) {
      result.high.push(label);
    } else if (label.confidence >= 0.5) {
      result.medium.push(label);
    } else {
      result.low.push(label);
    }
  });

  return result;
}
