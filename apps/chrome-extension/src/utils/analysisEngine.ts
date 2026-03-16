/**
 * Analysis Engine for Dark Pattern Detection
 *
 * This module provides utilities to analyze stored dataset entries using AI models
 * to detect dark patterns in web interfaces.
 */

import { AIActionType } from '@darkpatternhunter/core/ai-model';
import { callAIWithObjectResponse } from '@darkpatternhunter/core/ai-model';
import { getDebug } from '@darkpatternhunter/shared/logger';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { useState, useCallback } from 'react';

import type { DarkPattern, DatasetEntry } from './datasetDB';
import { getDatasetEntries, storeDatasetEntry } from './datasetDB';
import { getActiveModelConfig } from './aiConfig';
import { executeWithRateLimit } from './rateLimiter';

const debug = getDebug('analysis:engine');

// Dark Pattern Categories (18-category taxonomy)
// Canonical labels used across analysis, prompts, exports and UI
const DARK_PATTERN_CATEGORIES = [
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

// Analysis status types
export type AnalysisStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// Analysis result interface
export interface AnalysisResult {
  darkPatterns: DarkPattern[];
  analysisStatus: AnalysisStatus;
  confidenceScore: number;
  error?: string;
}

// AI Response Schema for Dark Pattern Detection
interface DarkPatternDetectionResponse {
  patterns: Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    location: string;
    evidence: string;
    confidence: number;
    bbox?: [number, number, number, number];
  }>;
  summary: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}

// Dark Pattern Prompt with English and Urdu support (18-category taxonomy)
const DARK_PATTERN_PROMPT = {
  english: `You are an expert dark pattern analyst specializing in detecting deceptive design patterns in web interfaces.

Your task is to analyze the provided webpage screenshot and DOM structure to identify dark patterns.

## Dark Pattern Categories to Detect (18-category taxonomy):
1. **Nagging** – Repetitive popups, overlays or banners that keep interrupting the user.
2. **Scarcity & Popularity** – Low-stock / high-demand / “X people viewing now” style pressure.
3. **FOMO / Urgency** – Countdowns, “last chance” language, expiring offers that push rushed decisions.
4. **Reference Pricing** – “Was/Now” or crossed‑out prices that exaggerate discounts.
5. **Disguised Ads** – Ads styled as normal content or buttons (including bait‑and‑switch offers).
6. **False Hierarchy** – Primary option visually overpowering safer or cheaper alternatives.
7. **Interface Interference** – Visual tricks that hide, de‑emphasize or scramble key actions/information.
8. **Misdirection** – Layout or copy that draws attention away from the real consequence of an action.
9. **Hard To Close** – Tiny/hidden close buttons, unclear ways to dismiss popups/flows.
10. **Obstruction** – Extra steps or friction added when cancelling, opting out or leaving a flow.
11. **Bundling** – Auto‑added items, pre‑ticked checkboxes, or forced add‑ons in carts/plans.
12. **Sneaking** – Hidden fees, taxes or additions that only appear late in the flow.
13. **Hidden Information** – Important terms, fees or conditions obscured in fine print or behind extra clicks.
14. **Subscription Trap** – Easy sign‑up but confusing, buried or blocked cancellation paths.
15. **Roach Motel** – Easy to get into a state (e.g., subscription, trial, newsletter), hard to get out.
16. **Confirmshaming** – Guilt‑tripping or shaming language on “No/Decline” choices.
17. **Forced Registration** – Forcing account creation/login before allowing basic exploration or purchase.
18. **Gamification Pressure** – Badges, streaks, points or levels used to push extra spending or engagement.

## Analysis Instructions:
1. Examine the screenshot for visual dark patterns
2. Review the DOM structure for hidden or subtle patterns
3. For each detected pattern, provide:
   - **type**: One of the taxonomy categories above
   - **description**: Brief explanation of the pattern
   - **severity**: low, medium, high, or critical
   - **location**: Where on the page (e.g., "top banner", "checkout button", "modal")
   - **evidence**: Specific text or visual elements that indicate the pattern
   - **confidence**: Your confidence level (0.0 to 1.0)
   - **bbox**: Bounding box coordinates [x, y, width, height] if applicable

4. Provide a summary with:
   - **total_patterns**: Total number of patterns detected
   - **prevalence_score**: Overall prevalence (0.0 to 1.0)
   - **primary_categories**: Top 3 most common pattern types

Return your analysis as a JSON object following this structure:
{
  "patterns": [...],
  "summary": {...}
}`,

  urdu: `آپ ایک ماہر ڈارک پیٹرن تجزیہ کار ہیں جو ویب انٹرفیس میں دھوکے دہ ڈیزائن پیٹرنز کا پتہ لگانے میں مہارت رکھتے ہیں۔

آپ کا کام فراہم کردہ ویب پیج اسکرین شاٹ اور DOM ڈھانچے کا تجزیہ کرکے ڈارک پیٹرنز کا پتہ لگانا ہے۔

## ڈارک پیٹرن کیٹیگریز جن کا پتہ لگانا ہے (18 کیٹیگریز):
1. **Nagging** – بار بار آنے والے پاپ اپس یا بینرز جو یوزر کو تنگ کریں۔
2. **Scarcity & Popularity** – جعلی کمی یا مقبولیت کے دعوے (مثلاً “صرف 2 بچے ہیں”، “100 لوگ دیکھ رہے ہیں”).
3. **FOMO / Urgency** – ٹائمر، “آخری موقع”، یا جلدی فیصلہ کروانے والی زبان۔
4. **Reference Pricing** – جعلی یا مبالغہ آمیز “پہلے/اب” قیمتوں کا موازنہ۔
5. **Disguised Ads** – اشتہارات کو نارمل مواد یا بٹن کی شکل میں چھپانا۔
6. **False Hierarchy** – بصری ڈیزائن سے ایک آپشن کو باقی کے مقابلے میں بہت نمایاں کرنا۔
7. **Interface Interference** – وہ ڈیزائن جو اہم معلومات یا آپشنز کو چھپاتے یا گڈ مڈ کرتے ہیں۔
8. **Misdirection** – لے آؤٹ یا کاپی سے یوزر کی توجہ اصل نتیجے سے ہٹانا۔
9. **Hard To Close** – موڈل/پاپ اپ کو بند کرنے کا بٹن چھوٹا، چھپا ہوا یا الجھا ہوا ہونا۔
10. **Obstruction** – کینسل/آؤٹ ہونے پر غیر ضروری اضافی اسٹیپس یا رکاوٹیں۔
11. **Bundling** – خود سے cart میں چیزیں ڈال دینا یا پہلے سے ٹِک شدہ آپشنز۔
12. **Sneaking** – فیس/ٹیکس یا اضافی آئٹمز کو آخر میں چپکے سے شامل کرنا۔
13. **Hidden Information** – اہم شرائط، فیس یا معلومات کو باریک یا چھپی ہوئی جگہ پر رکھنا۔
14. **Subscription Trap** – سائن اپ آسان، مگر سبسکرپشن ختم کرنا مشکل یا چھپا ہوا۔
15. **Roach Motel** – ایک اسٹیٹ میں جانا آسان (مثلاً سبسکرپشن، نیوزلیٹر)، باہر نکلنا مشکل۔
16. **Confirmshaming** – “نہیں” پر شرمندہ کرنے یا گِلٹ ٹرپ والی زبان۔
17. **Forced Registration** – اکاؤنٹ بنائے بغیر بیسک چیزیں دیکھنے یا خریدنے نہ دینا۔
18. **Gamification Pressure** – بیجز، پوائنٹس، لیولز وغیرہ سے اضافی خرچ یا یوزج پر دباؤ ڈالنا۔

## تجزیے کی ہدایات:
1. بصری ڈارک پیٹرنز کے لیے اسکرین شاٹ کا جائزہ لیں
2. چھپے ہوئے یا نازک پیٹرنز کے لیے DOM ڈھانچے کا جائزہ لیں
3. ہر پتہ لگائے گئے پیٹرن کے لیے فراہم کریں:
   - **type**: اوپر دی گئی کیٹیگریز میں سے ایک
   - **description**: پیٹرن کی مختصر وضاحت
   - **severity**: low, medium, high, یا critical
   - **location**: پیج پر کہاں (مثلاً "top banner", "checkout button", "modal")
   - **evidence**: پیٹرن کی نشاندہی کرنے والے مخصوص متن یا بصری عناصر
   - **confidence**: آپ کا اعتماد کا سطح (0.0 سے 1.0)
   - **bbox**: باؤنڈنگ باکس کوآرڈینیٹس [x, y, width, height] اگر لاگو ہو

4. ایک خلاصہ فراہم کریں جس میں شامل ہے:
   - **total_patterns**: پتہ لگائے گئے پیٹرنز کی کل تعداد
   - **prevalence_score**: مجموعی پھیلاؤ (0.0 سے 1.0)
   - **primary_categories**: سب سے زیادہ عام 3 پیٹرن کی اقسام

اپنا تجزیہ JSON آبجیکٹ کے طور پر واپس کریں جو اس ڈھانچے کی پیروی کرتا ہے:
{
  "patterns": [...],
  "summary": {...}
}`,
};

/**
 * Get the dark pattern prompt in the specified language
 */
export function getDarkPatternPrompt(
  language: 'english' | 'urdu' = 'english',
): string {
  return DARK_PATTERN_PROMPT[language];
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry logic with exponential backoff
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      debug(`Attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (error) {
      lastError = error as Error;
      debug(`Attempt ${attempt} failed:`, error);

      if (attempt < maxAttempts) {
        const delay = baseDelay * 2 ** (attempt - 1);
        debug(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Max retry attempts reached');
}

/**
 * Validate dark pattern type against known categories
 */
function validatePatternType(type: string): string {
  const normalizedType = type.trim();
  const validType = DARK_PATTERN_CATEGORIES.find(
    (cat) => cat.toLowerCase() === normalizedType.toLowerCase(),
  );

  if (validType) {
    return validType;
  }

  // Try partial match
  const partialMatch = DARK_PATTERN_CATEGORIES.find((cat) =>
    normalizedType
      .toLowerCase()
      .includes(cat.toLowerCase().split('/')[0].trim()),
  );

  return partialMatch || normalizedType;
}

/**
 * Validate severity level
 */
function validateSeverity(severity: string): DarkPattern['severity'] {
  const validSeverities: DarkPattern['severity'][] = [
    'low',
    'medium',
    'high',
    'critical',
  ];
  if (validSeverities.includes(severity as DarkPattern['severity'])) {
    return severity as DarkPattern['severity'];
  }
  return 'medium'; // Default to medium
}

/**
 * Validate confidence score
 */
function validateConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Convert AI response to DarkPattern array
 */
function convertToDarkPatterns(
  aiPatterns: DarkPatternDetectionResponse['patterns'],
): DarkPattern[] {
  return aiPatterns.map((pattern) => ({
    type: validatePatternType(pattern.type),
    description: pattern.description,
    severity: validateSeverity(pattern.severity),
    location: pattern.location,
    evidence: pattern.evidence,
    confidence: validateConfidence(pattern.confidence),
    bbox: pattern.bbox,
  }));
}

/**
 * Calculate overall confidence score from patterns
 */
function calculateConfidenceScore(patterns: DarkPattern[]): number {
  if (patterns.length === 0) {
    return 0;
  }

  const totalConfidence = patterns.reduce((sum, pattern) => {
    return sum + (pattern.confidence || 0);
  }, 0);

  return totalConfidence / patterns.length;
}

/**
 * Analyze a single dataset entry using AI
 */
export async function analyzeStoredEntry(
  entryId: string,
  options?: {
    language?: 'english' | 'urdu';
    maxRetries?: number;
  },
): Promise<AnalysisResult> {
  const { language = 'english', maxRetries = 3 } = options || {};

  debug(`Analyzing entry: ${entryId}`);

  try {
    // Get all entries and find the target one
    const entries = await getDatasetEntries();
    const entry = entries.find((e) => e.id === entryId);

    if (!entry) {
      throw new Error(`Entry with ID ${entryId} not found`);
    }

    // Validate entry has required data
    if (!entry.screenshot) {
      throw new Error('Entry does not have a screenshot');
    }

    // Prepare AI messages
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: getDarkPatternPrompt(language),
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this webpage for dark patterns.

URL: ${entry.url}
Page Title: ${entry.metadata?.pageTitle || 'N/A'}
Timestamp: ${new Date(entry.timestamp).toISOString()}

${entry.dom ? `\nDOM Structure (excerpt):\n${entry.dom.substring(0, 2000)}...` : ''}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: entry.screenshot,
            },
          },
        ],
      },
    ];

    // Call AI with rate limiting and retry
    const modelConfig = await getActiveModelConfig();
    const response = await executeWithRateLimit(
      () => callAIWithObjectResponse<DarkPatternDetectionResponse>(
        messages,
        AIActionType.EXTRACT_DATA,
        modelConfig,
      ),
      { label: 'analysis-engine', maxRetries: 3 },
    );

    // Convert AI response to DarkPattern array
    const darkPatterns = convertToDarkPatterns(response.content.patterns);

    // Calculate confidence score
    const confidenceScore = calculateConfidenceScore(darkPatterns);

    // Update entry with analysis results
    const modelConfig = await getActiveModelConfig();
    const updatedEntry: DatasetEntry = {
      ...entry,
      patterns: darkPatterns,
      summary: {
        total_patterns: response.content.summary.total_patterns,
        prevalence_score: response.content.summary.prevalence_score,
        primary_categories: response.content.summary.primary_categories,
      },
      metadata: {
        ...entry.metadata,
        researchContext: {
          ...entry.metadata?.researchContext,
          modelUsed: modelConfig.modelName,
          analysisVersion: '1.0',
        },
      },
    };

    // Store updated entry
    await storeDatasetEntry(updatedEntry);

    debug(`Analysis completed for entry: ${entryId}`);
    debug(`Detected ${darkPatterns.length} dark patterns`);

    return {
      darkPatterns,
      analysisStatus: 'completed',
      confidenceScore,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debug(`Analysis failed for entry ${entryId}:`, errorMessage);

    return {
      darkPatterns: [],
      analysisStatus: 'failed',
      confidenceScore: 0,
      error: errorMessage,
    };
  }
}

/**
 * React Hook for batch analysis of dataset entries
 */
export function useBatchAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<Map<string, AnalysisResult>>(
    new Map(),
  );
  const [error, setError] = useState<string | null>(null);

  /**
   * Analyze multiple entries in batch
   */
  const analyzeBatch = useCallback(
    async (
      entryIds: string[],
      options?: { language?: 'english' | 'urdu'; maxRetries?: number },
    ) => {
      setIsAnalyzing(true);
      setProgress(0);
      setTotal(entryIds.length);
      setResults(new Map());
      setError(null);

      const newResults = new Map<string, AnalysisResult>();

      for (let i = 0; i < entryIds.length; i++) {
        const entryId = entryIds[i];
        try {
          const result = await analyzeStoredEntry(entryId, options);
          newResults.set(entryId, result);
          setResults(new Map(newResults));
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          newResults.set(entryId, {
            darkPatterns: [],
            analysisStatus: 'failed',
            confidenceScore: 0,
            error: errorMessage,
          });
          setResults(new Map(newResults));
        }

        setProgress(i + 1);
      }

      setIsAnalyzing(false);
      return newResults;
    },
    [],
  );

  /**
   * Analyze all pending entries
   */
  const analyzePendingEntries = useCallback(
    async (options?: {
      language?: 'english' | 'urdu';
      maxRetries?: number;
    }) => {
      const entries = await getDatasetEntries();
      const pendingEntries = entries.filter(
        (entry) => entry.patterns.length === 0,
      );
      const pendingIds = pendingEntries.map((entry) => entry.id);

      return analyzeBatch(pendingIds, options);
    },
    [analyzeBatch],
  );

  /**
   * Reset the analysis state
   */
  const reset = useCallback(() => {
    setIsAnalyzing(false);
    setProgress(0);
    setTotal(0);
    setResults(new Map());
    setError(null);
  }, []);

  return {
    isAnalyzing,
    progress,
    total,
    results,
    error,
    analyzeBatch,
    analyzePendingEntries,
    reset,
  };
}


