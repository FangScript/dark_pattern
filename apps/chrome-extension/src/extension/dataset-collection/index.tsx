import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';
// Note: AI calls are handled via runAgentLoop/autoLabeling.ts
// Legacy imports (AIActionType, AIArgs, callAIWithObjectResponse, IModelConfig)
// are kept for the analyzePageForDarkPatterns fallback function below.
import { getDebug } from '@darkpatternhunter/shared/logger';
import { runAgentLoop, agentPatternsToAutoLabels, type ViewportCapture } from '../../utils/agentAnalysis';
import { AIActionType, callAIWithObjectResponse, type AIArgs } from '@darkpatternhunter/core/ai-model';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Image,
  List,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useCallback, useEffect, useState, useRef } from 'react';
import { useGlobalAIConfig } from '../../hooks/useGlobalAIConfig';
import { getAIConfig, getActiveModelConfig } from '../../utils/aiConfig';
import { drawBboxesOnImage } from '../../utils/bboxOverlay';
import { buildFullPageCanvas, viewportToPageAbsolute, type ViewportCaptureWithDPR } from '../../utils/coordinateUtils';
import {
  exportAnnotatedImages,
  exportAsCOCO,
  exportAsYOLO,
} from '../../utils/cocoYoloExport';
import {
  type DarkPattern,
  type DatasetEntry,
  clearDatasetEntries,
  deleteDatasetEntry,
  exportDatasetAsBundleZip,
  exportDatasetAsJSON,
  exportForUITarsFineTuning,
  exportTextDatasetAsJSONL,
  getDatasetEntries,
  getEffectivePatterns,
  storeDatasetEntry,
} from '../../utils/datasetDB';
import {
  autoLabelScreenshot,
  filterByConfidence,
} from '../../utils/autoLabeling';
import LabelReviewPanel from './LabelReviewPanel';
import { cropImageFromBbox } from '../../utils/imageCrop';
import {
  getSiteName,
  isPakistaniEcommerceSite,
  validateUrl,
} from '../../utils/pakistaniSites';
import { captureTabScreenshot } from '../../utils/screenshotCapture';
import BboxEditor from './BboxEditor';
import './index.less';

const { Text, Paragraph } = Typography;
const debug = getDebug('dataset-collection');

/**
 * Wrapper that stitches viewport screenshots into a full-page canvas
 * and converts per-viewport bboxes to page-absolute coordinates
 * before passing them to BboxEditor.
 */
function StitchedBboxEditor({
  entry,
  onSave,
  onCancel,
}: {
  entry: DatasetEntry;
  onSave: (patterns: DarkPattern[]) => void;
  onCancel: () => void;
}) {
  const [stitchedScreenshot, setStitchedScreenshot] = useState<string | null>(null);
  const [absolutePatterns, setAbsolutePatterns] = useState<DarkPattern[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const prepare = async () => {
      setLoading(true);
      try {
        const viewportScreenshots = entry.viewport_screenshots;

        if (viewportScreenshots && viewportScreenshots.length > 0) {
          // Build ViewportCaptureWithDPR array for stitching
          const vpCaptures: ViewportCaptureWithDPR[] = viewportScreenshots.map((vs) => ({
            screenshot: vs.screenshot,
            patterns: vs.patterns || [],
            viewportWidth: vs.viewportWidth,
            viewportHeight: vs.viewportHeight,
            scrollY: vs.scrollY,
            devicePixelRatio: vs.devicePixelRatio ?? 1,
            stepLabel: vs.stepLabel,
            phase: vs.phase,
          }));

          // Build stitched canvas WITHOUT drawing bboxes (BboxEditor will draw them)
          const stitched = await buildFullPageCanvas(vpCaptures, false);
          setStitchedScreenshot(stitched);

          // Convert per-viewport bboxes to page-absolute coordinates
          const absPatterns: DarkPattern[] = [];
          for (const vp of vpCaptures) {
            for (const p of vp.patterns) {
              if (!p.bbox || p.bbox.length !== 4) continue;
              const abs = viewportToPageAbsolute(p.bbox, vp);
              absPatterns.push({
                type: p.category,
                description: p.description || p.evidence || `${p.category} detected`,
                severity: (p.severity as DarkPattern['severity']) || 'medium',
                location: p.location || '',
                evidence: p.evidence || '',
                confidence: p.confidence,
                bbox: [abs.x, abs.y, abs.width, abs.height],
              });
            }
          }
          setAbsolutePatterns(absPatterns);
        } else {
          // Fallback: single screenshot with all patterns
          setStitchedScreenshot(entry.screenshot ?? null);
          setAbsolutePatterns(getEffectivePatterns(entry));
        }
      } catch (err) {
        console.error('[StitchedBboxEditor] Failed to stitch:', err);
        // Fallback
        setStitchedScreenshot(entry.screenshot ?? null);
        setAbsolutePatterns(getEffectivePatterns(entry));
      } finally {
        setLoading(false);
      }
    };
    prepare();
  }, [entry]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin tip="Stitching viewport screenshots..." /></div>;
  }

  if (!stitchedScreenshot) {
    return <div style={{ padding: 24 }}>No screenshot available</div>;
  }

  return (
    <BboxEditor
      screenshot={stitchedScreenshot}
      patterns={absolutePatterns}
      onSave={onSave}
      onCancel={onCancel}
    />
  );
}

// Enhanced dark pattern detection prompt for Pakistani e-commerce (18-category taxonomy)
const DARK_PATTERN_PROMPT = `You are a Dark Pattern Detection AI expert specializing in Pakistani e-commerce websites.

Given a webpage screenshot and DOM, identify all dark patterns present on the page.

Use this taxonomy (aligns with the provided CSV list):
- Nagging: repetitive popups/banners that keep interrupting the user.
- Scarcity & Popularity: low stock / high demand / “X people viewing now” pressure.
- FOMO / Urgency: countdown timers, “last chance” offers, rushed decision pressure.
- Reference Pricing: “was/now”, strikethrough anchor prices that exaggerate discounts.
- Disguised Ads: ads styled as real content or buttons (including bait & switch).
- False Hierarchy: primary CTA overly dominant vs secondary/back options.
- Interface Interference: visuals or layout that hide, blur or scramble key actions/info.
- Misdirection: layout/copy that diverts attention from the true outcome of an action.
- Hard To Close: tiny/hidden close buttons; unclear ways to dismiss overlays/flows.
- Obstruction: extra friction/steps only when cancelling, opting out, or leaving.
- Bundling: auto-added items or pre-selected add-ons/options in cart/plan.
- Sneaking: hidden fees, taxes or items that appear only late in the journey.
- Hidden Information: fees/terms in fine print or only revealed at the last step.
- Subscription Trap: easy to subscribe, confusing or buried cancellation.
- Roach Motel: easy to get into a state (e.g., subscription), hard to get out.
- Confirmshaming: guilt-tripping / shaming language on “No/Decline” options.
- Forced Registration: forcing account creation/login before basic exploration.
- Gamification Pressure: badges, streaks, points used to push extra spending/engagement.

Language coverage: English + Urdu (Perso-Arabic) + Roman Urdu.
Examples (Roman Urdu): "Jaldi karein", "Aakhri mauqa", "Fori khareedain", "Sirf X baaqi", "Kam stock", "Aur dekhein", "Mansookh karein".

Evidence requirements:
- Provide exact text/element evidence; if visual, describe element (timer, badge, close button position/size).
- Only include patterns with confidence > 0.7.
- Prefer concise descriptions and precise locations (e.g., "product card badge", "checkout summary fee line", "overlay top-right close button").

BOUNDING BOX GUIDANCE:
- If the pattern is visual (e.g., a countdown timer, a banner, a button), provide bounding box coordinates [x, y, width, height] in pixels.
- If the pattern is purely textual or conceptual (e.g., hidden terms in a long paragraph, or general site structure like infinite scroll), providing a bounding box is OPTIONAL. You can omit the "bbox" field or set it to null.
- DO NOT invent bounding boxes if you are unsure.
- x: left edge position in pixels (0 = leftmost)
- y: top edge position in pixels (0 = topmost)
- width: width of the element in pixels
- height: height of the element in pixels

OUTPUT REQUIREMENT: Return ONLY valid JSON with this exact structure:
{
  "patterns": [
    {
      "type": "one of the taxonomy labels above",
      "description": "Specific description of the deceptive pattern",
      "severity": "low|medium|high|critical",
      "location": "Where on page (header, product card, checkout, modal, etc.)",
      "evidence": "Exact text/element that proves the pattern",
      "confidence": 0.85,
      "bbox": [x, y, width, height] // Optional
    }
  ],
  "summary": {
    "total_patterns": 5,
    "prevalence_score": 0.75,
    "primary_categories": ["choose from taxonomy above"]
  }
}

⚠️ VALIDATION RULES:
1. If providing "bbox", it MUST have exactly 4 non-negative integers: [x, y, width, height]
2. Only include patterns with confidence > 0.7
3. Text-only patterns are WELCOME. Do not filter them out.

Return ONLY valid JSON. No explanations, no markdown, just the JSON object.`;

export default function DatasetCollection() {
  const [entries, setEntries] = useState<DatasetEntry[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [exportingBundle, setExportingBundle] = useState(false);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
    url: string;
    status: string;
  } | null>(null);
  const [urlQueue, setUrlQueue] = useState<string[]>([]);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);
  const [filterPattern, setFilterPattern] = useState<string>('ALL');
  const [isRecursiveCrawling, setIsRecursiveCrawling] = useState(false);
  const [reviewingEntry, setReviewingEntry] = useState<DatasetEntry | null>(null);
  const [crawlProgress, setCrawlProgress] = useState<{
    discovered: number;
    visited: number;
    queue: number;
    currentUrl: string;
  } | null>(null);
  const [showCrawlModal, setShowCrawlModal] = useState(false);
  const stopCrawlRef = useRef(false);
  const [statistics, setStatistics] = useState<{
    totalEntries: number;
    totalPatterns: number;
    prevalenceRate: number;
    pakistaniSitesScanned: number;
    categoryBreakdown: Record<string, number>;
  }>({
    totalEntries: 0,
    totalPatterns: 0,
    prevalenceRate: 0,
    pakistaniSitesScanned: 0,
    categoryBreakdown: {},
  });
  const [editingEntry, setEditingEntry] = useState<DatasetEntry | null>(null);
  const [showBboxEditor, setShowBboxEditor] = useState(false);

  // Use global AI configuration hook
  const { readyState } = useGlobalAIConfig();

  // Load entries on mount
  useEffect(() => {
    loadEntries();
  }, []);

  // Calculate statistics when entries change
  useEffect(() => {
    calculateStatistics();
  }, [entries]);

  const calculateStatistics = () => {
    const totalEntries = entries.length;
    // FIX (Bug 2): Use getEffectivePatterns() which falls back to auto_labels
    // when human-verified patterns (entry.patterns) are not yet set.
    // Previously this always counted 0 for fresh AI scans.
    const totalPatterns = entries.reduce(
      (sum, e) => sum + getEffectivePatterns(e).length,
      0,
    );
    const sitesWithPatterns = entries.filter(
      (e) => getEffectivePatterns(e).length > 0,
    ).length;
    const prevalenceRate =
      totalEntries > 0 ? (sitesWithPatterns / totalEntries) * 100 : 0;

    const categoryBreakdown: Record<string, number> = {};
    entries.forEach((entry) => {
      getEffectivePatterns(entry).forEach((pattern) => {
        categoryBreakdown[pattern.type] =
          (categoryBreakdown[pattern.type] || 0) + 1;
      });
    });

    const pakistaniSitesScanned = entries.filter(
      (e) => e.metadata?.researchContext?.isPakistaniEcommerce,
    ).length;

    setStatistics({
      totalEntries,
      totalPatterns,
      prevalenceRate: Math.round(prevalenceRate * 100) / 100,
      categoryBreakdown,
      pakistaniSitesScanned,
    });
  };

  const loadEntries = async () => {
    try {
      const data = await getDatasetEntries();
      // Sort by timestamp descending
      data.sort((a, b) => b.timestamp - a.timestamp);
      setEntries(data);
    } catch (error) {
      console.error('Failed to load entries:', error);
      message.error('Failed to load dataset entries');
    }
  };

  const filteredEntries =
    filterPattern === 'ALL'
      ? entries
      : entries.filter((entry) =>
          entry.patterns.some((p) => p.type === filterPattern),
        );

  const getCurrentTab = async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  };

  const waitForPageLoad = async (
    tabId: number,
    maxWait = 10000,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let resolved = false; // FIX (Bug 6): guard so 2s wait runs only ONCE

      const checkReady = async () => {
        try {
          const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => document.readyState,
          });

          if (results[0]?.result === 'complete') {
            if (resolved) return; // already resolving, skip
            resolved = true;
            // Wait a bit more for dynamic content (runs exactly once)
            await new Promise((r) => setTimeout(r, 2000));
            resolve();
            return;
          }

          if (Date.now() - startTime > maxWait) {
            reject(new Error('Page load timeout'));
            return;
          }

          setTimeout(checkReady, 500);
        } catch (error) {
          reject(error);
        }
      };

      checkReady();
    });
  };

  const capturePageData = async (tabId: number) => {
    // Get tab first to get windowId
    const tab = await chrome.tabs.get(tabId);

    if (
      !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://')
    ) {
      throw new Error('Cannot capture Chrome internal pages');
    }

    // Wait for page to be ready
    await waitForPageLoad(tabId);

    // Capture screenshot using debugger API for automatic operation
    // This works without requiring activeTab invocation
    const screenshot = await captureTabScreenshot(tabId);

    // Capture DOM
    const domResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });

    const dom = domResults[0]?.result || '';
    if (!dom) {
      throw new Error('Failed to capture DOM');
    }

    // Get viewport size
    const viewportResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        width: window.innerWidth || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight,
      }),
    });

    const viewport = viewportResults[0]?.result || {
      width: 1920,
      height: 1080,
    };

    // Get page metadata
    const metadata = {
      pageTitle: tab.title || undefined,
      viewport,
      userAgent: navigator.userAgent,
    };

    return {
      screenshot,
      dom,
      metadata,
      url: tab.url,
    };
  };

  const analyzePageForDarkPatterns = async (
    screenshot: string,
    dom: string,
    url: string,
    retries = 3,
  ): Promise<{ patterns: DarkPattern[]; summary?: any }> => {
    // Get active model config from centralized storage
    const modelConfig = await getActiveModelConfig();
    // This function will crop individual images for each pattern
    const messageContent: AIArgs[0]['content'] = [
      {
        type: 'image_url',
        image_url: {
          url: screenshot,
          detail: 'high',
        },
      },
      {
        type: 'text',
        text: `${DARK_PATTERN_PROMPT}\n\nURL: ${url}\n\nDOM (first 5000 chars):\n${dom.substring(0, 5000)}`,
      },
    ];

    const prompt: AIArgs = [
      {
        role: 'system',
        content:
          'You are a dark pattern detection expert specializing in Pakistani e-commerce. Analyze webpages for deceptive UI patterns in both English, Urdu (Perso-Arabic script), and Roman Urdu (Latin script). Return ONLY valid JSON.',
      },
      {
        role: 'user',
        content: messageContent,
      },
    ];

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await callAIWithObjectResponse<{
          patterns: DarkPattern[];
          summary?: {
            total_patterns: number;
            prevalence_score: number;
            primary_categories: string[];
          };
        }>(prompt, AIActionType.EXTRACT_DATA, modelConfig);

        // Validate response
        if (!response || !response.content) {
          throw new Error('Invalid response from AI model');
        }

        const patterns = response.content.patterns || [];
        const summary = response.content.summary;

        // Validate and filter patterns
        const validPatterns = patterns.filter((p) => {
          // Filter by confidence threshold
          if (p.confidence !== undefined && p.confidence <= 0.7) {
            return false;
          }

          // Relaxed Bounding Box Validation:
          // We allow patterns WITHOUT bbox (text-only patterns)
          // But IF bbox is present, it must be valid.

          if (p.bbox) {
            if (!Array.isArray(p.bbox) || p.bbox.length !== 4) {
              // Invalid bbox format -> Keep pattern but strip bbox? Or reject?
              // Let's strip the invalid bbox and keep the pattern as text-only
              console.warn(
                `Pattern "${p.type}" has invalid bbox format, removing bbox`,
                p.bbox,
              );
              p.bbox = undefined;
              return true;
            }

            const [x, y, width, height] = p.bbox;
            if (
              typeof x !== 'number' ||
              typeof y !== 'number' ||
              typeof width !== 'number' ||
              typeof height !== 'number' ||
              x < 0 ||
              y < 0 ||
              width <= 0 ||
              height <= 0 ||
              !Number.isFinite(x) ||
              !Number.isFinite(y) ||
              !Number.isFinite(width) ||
              !Number.isFinite(height)
            ) {
              console.warn(
                `Pattern "${p.type}" has invalid bbox values, removing bbox`,
                p.bbox,
              );
              p.bbox = undefined;
              return true;
            }

            // Normalize bbox to integers
            p.bbox = [
              Math.round(x),
              Math.round(y),
              Math.round(width),
              Math.round(height),
            ];
          }

          return true;
        });

        // Warn if patterns were filtered out
        if (patterns.length > validPatterns.length) {
          const filteredCount = patterns.length - validPatterns.length;
          console.warn(
            `Filtered out ${filteredCount} pattern(s) due to low confidence`,
          );
        }

        // CRITICAL: Crop individual images for each pattern
        // Each pattern gets its own cropped image showing ONLY that specific dark pattern
        const patternsWithCroppedImages = await Promise.all(
          validPatterns.map(async (pattern) => {
            if (pattern.bbox && pattern.bbox.length === 4) {
              try {
                const croppedImage = await cropImageFromBbox(
                  screenshot,
                  pattern.bbox,
                );
                return {
                  ...pattern,
                  croppedImage, // Individual cropped image for THIS pattern only
                };
              } catch (error) {
                console.error(
                  `Failed to crop image for pattern "${pattern.type}":`,
                  error,
                );
                return pattern; // Return pattern without cropped image if cropping fails
              }
            }
            return pattern;
          }),
        );

        return {
          patterns: patternsWithCroppedImages,
          summary,
        };
      } catch (error: any) {
        lastError = error;
        console.error(`Analysis attempt ${attempt} failed:`, error);

        if (attempt < retries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed
    throw new Error(
      `Failed to analyze page after ${retries} attempts: ${lastError?.message || 'Unknown error'}`,
    );
  };

  const analyzeCurrentPage = async () => {
    // Validate model configuration using centralized config
    if (!readyState.isReady) {
      Modal.warning({
        title: 'Model Configuration Required',
        content: `${readyState.errorMessage} Please configure your AI model settings first.`,
      });
      return;
    }

    setAnalyzing(true);
    try {
      const tab = await getCurrentTab();
      if (!tab.id || !tab.url) {
        message.error('No active tab found');
        setAnalyzing(false);
        return;
      }

      if (
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://')
      ) {
        message.error('Cannot analyze Chrome internal pages');
        setAnalyzing(false);
        return;
      }

      // Check if Pakistani e-commerce site
      const isPakistaniSite = isPakistaniEcommerceSite(tab.url);
      const siteName = getSiteName(tab.url);

      if (!isPakistaniSite) {
        Modal.confirm({
          title: 'Not a Pakistani E-commerce Site',
          content:
            'This page does not appear to be a Pakistani e-commerce site. Continue analysis anyway?',
          onOk: async () => {
            try {
              await performAnalysis(tab, isPakistaniSite, siteName);
            } catch (error: any) {
              console.error('Error in performAnalysis:', error);
              message.error(
                `Failed to analyze page: ${error.message || 'Unknown error'}`,
              );
            } finally {
              setAnalyzing(false);
            }
          },
          onCancel: () => {
            setAnalyzing(false);
          },
        });
        return;
      }

      try {
        await performAnalysis(tab, isPakistaniSite, siteName);
      } finally {
        setAnalyzing(false);
      }
    } catch (error: any) {
      console.error('Error analyzing page:', error);
      message.error(
        `Failed to analyze page: ${error.message || 'Unknown error'}`,
      );
      setAnalyzing(false);
    }
  };

  const performAnalysis = async (
    tab: chrome.tabs.Tab,
    isPakistaniSite: boolean,
    siteName: string | null,
  ) => {
    try {
      message.loading({
        content: 'Phase 0: Preparing page...',
        key: 'analysis',
        duration: 0,
      });

      const modelConfig = await getActiveModelConfig();
      if (!modelConfig || !modelConfig.modelName) {
        throw new Error('AI model not configured');
      }

      // ── PHASED AGENT LOOP ─────────────────────────────────────────
      // Phase 1: SCAN — scroll entire page, capture every viewport
      // Phase 2: ANALYZE — VLM analyzes each screenshot independently
      // Phase 3: INTERACT — click expandable elements
      // Phase 4: RE-ANALYZE — analyze interaction results
      const agentResult = await runAgentLoop(tab.id!, (msg) => {
        message.loading({ content: msg, key: 'analysis', duration: 0 });
      });

      // Convert agent patterns to AutoLabel format
      const autoLabels = await agentPatternsToAutoLabels(agentResult.patterns);

      // Use first viewport's screenshot as thumbnail (or re-capture if none)
      let screenshot: string;
      if (agentResult.viewports.length > 0) {
        screenshot = agentResult.viewports[0].screenshot;
      } else {
        const pageData = await capturePageData(tab.id!);
        screenshot = pageData.screenshot;
      }

      // Capture DOM and metadata for the entry
      const { dom, metadata, url } = await capturePageData(tab.id!);

      // Filter by confidence
      const confidenceFilter = filterByConfidence(autoLabels);
      const highConfidenceLabels = confidenceFilter.high;
      const mediumConfidenceLabels = confidenceFilter.medium;

      // ── Map ALL viewport screenshots into the dataset entry ─────────
      // Each viewport = one YOLO training image with its OWN screenshot + patterns
      const viewportScreenshots = agentResult.viewports.map((v) => ({
        screenshot: v.screenshot,
        patterns: v.patterns,
        viewportWidth: v.viewportWidth,
        viewportHeight: v.viewportHeight,
        scrollY: v.scrollY,
        devicePixelRatio: v.devicePixelRatio,
        stepLabel: v.stepLabel,
        phase: v.phase,
      }));

      console.log(`[performAnalysis] Storing ${viewportScreenshots.length} viewport screenshots (${viewportScreenshots.filter(v => v.patterns.length > 0).length} with patterns)`);

      // Create dataset entry with ALL viewport screenshots
      const entry: DatasetEntry = {
        id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        url,
        timestamp: Date.now(),
        screenshot, // thumbnail = first viewport
        dom: dom.substring(0, 10000),
        auto_labels: autoLabels,
        verified_labels: undefined,
        status: autoLabels.length > 0 ? 'auto' : 'raw',
        patterns: [],
        viewport_screenshots: viewportScreenshots, // <-- ALL viewports stored here
        summary: {
          total_patterns: autoLabels.length,
          prevalence_score: autoLabels.length > 0 ? highConfidenceLabels.length / autoLabels.length : 0,
          primary_categories: [
            ...new Set(autoLabels.map((l) => l.category)),
          ].slice(0, 3),
        },
        metadata: {
          ...metadata,
          researchContext: {
            isPakistaniEcommerce: isPakistaniSite,
            siteName: siteName || undefined,
            modelUsed: modelConfig.modelName,
            analysisVersion: '4.0', // Phased human-like agent loop
          },
          agentLoop: {
            steps: agentResult.agentSteps,
            screenshotCount: agentResult.screenshotCount,
            viewportCount: agentResult.viewports.length,
            usedVision: agentResult.usedVision,
          },
        },
      };

      await storeDatasetEntry(entry);

      message.destroy('analysis');

      // Show success message with phase-based breakdown
      if (autoLabels.length > 0) {
        const scanViewports = agentResult.viewports.filter(v => v.phase === 'scan').length;
        const interactViewports = agentResult.viewports.filter(v => v.phase === 'interact').length;
        message.success({
          content: `Analysis complete! ${autoLabels.length} patterns found across ${scanViewports} page sections + ${interactViewports} interactions. (${highConfidenceLabels.length} high, ${mediumConfidenceLabels.length} medium confidence)`,
          duration: 7,
        });
        if (mediumConfidenceLabels.length > 0) {
          setTimeout(() => {
            Modal.confirm({
              title: 'Review Labels?',
              content: `${mediumConfidenceLabels.length} label(s) have medium confidence and may need review. Open review panel?`,
              onOk: () => setReviewingEntry(entry),
            });
          }, 1000);
        }
      } else {
        message.success({
          content: `No dark patterns detected (scanned ${agentResult.viewports.length} viewports).`,
          duration: 5,
        });
      }

      await loadEntries();
    } catch (error: any) {
      message.destroy('analysis');
      throw error;
    }
  };

  const processUrlQueue = async (directUrls?: string[]) => {
    const urls = directUrls ?? urlQueue;
    if (urls.length === 0 || isProcessingQueue) return;

    if (!readyState.isReady) {
      Modal.warning({
        title: 'Model Configuration Required',
        content: `${readyState.errorMessage} Please configure your AI model settings first.`,
      });
      return;
    }

    setIsProcessingQueue(true);
    const modelConfig = await getActiveModelConfig();
    if (!modelConfig || !modelConfig.modelName) {
      message.error('AI model not configured');
      setIsProcessingQueue(false);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      setProgress({
        current: i + 1,
        total: urls.length,
        url,
        status: 'Processing...',
      });

      let tab: chrome.tabs.Tab | null = null;

      try {
        // Validate URL
        const validation = validateUrl(url);
        if (!validation.valid) {
          throw new Error(validation.error || 'Invalid URL');
        }

        setProgress((prev) =>
          prev ? { ...prev, status: 'Opening page...' } : null,
        );

        // Open URL in new tab and ensure it gets focus
        tab = await chrome.tabs.create({ url, active: true });

        if (!tab.id || !tab.windowId) {
          throw new Error('Failed to create tab');
        }

        // Must bring window to front for viewport screenshots to work
        await chrome.windows.update(tab.windowId, { focused: true });

        setProgress((prev) =>
          prev ? { ...prev, status: 'Waiting for page to load...' } : null,
        );

        // Wait for page to load properly
        await waitForPageLoad(tab.id, 15000);

        setProgress((prev) =>
          prev ? { ...prev, status: 'Capturing page data...' } : null,
        );

        // Capture initial screenshot as fallback + get metadata
        const { screenshot, dom: domInit, metadata: metaInit } = await capturePageData(tab.id);
        const isPakistaniSite = isPakistaniEcommerceSite(url);
        const siteName = getSiteName(url);

        setProgress((prev) =>
          prev ? { ...prev, status: 'Scanning all viewports with AI...' } : null,
        );

        // Use the same phased agent loop as "Analyze Current Page"
        // This scrolls the full page and captures every viewport
        const agentResult = await runAgentLoop(tab.id!, (msg) => {
          setProgress((prev) =>
            prev ? { ...prev, status: msg } : null,
          );
        });

        const autoLabels = await agentPatternsToAutoLabels(agentResult.patterns);

        // Use first viewport screenshot as the thumbnail
        let screenshotForEntry: string = screenshot; // fallback
        if (agentResult.viewports.length > 0) {
          screenshotForEntry = agentResult.viewports[0].screenshot;
        }

        const { dom: domData, metadata: metaData } = await capturePageData(tab.id);


        // Store all viewport screenshots just like performAnalysis
        const viewportScreenshots = agentResult.viewports.map((v) => ({
          screenshot: v.screenshot,
          patterns: v.patterns,
          viewportWidth: v.viewportWidth,
          viewportHeight: v.viewportHeight,
          scrollY: v.scrollY,
          devicePixelRatio: v.devicePixelRatio,
          stepLabel: v.stepLabel,
          phase: v.phase,
        }));

        const entry: DatasetEntry = {
          id: `entry-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url,
          timestamp: Date.now(),
          screenshot: screenshotForEntry,
          dom: domData.substring(0, 10000),
          auto_labels: autoLabels,
          verified_labels: undefined,
          patterns: [],
          status: autoLabels.length > 0 ? 'auto' : 'raw',
          viewport_screenshots: viewportScreenshots,
          summary: {
            total_patterns: autoLabels.length,
            prevalence_score: autoLabels.length > 0 ? autoLabels.filter(l => l.confidence >= 0.8).length / autoLabels.length : 0,
            primary_categories: [...new Set(autoLabels.map((l) => l.category))].slice(0, 3),
          },
          metadata: {
            ...metaData,
            researchContext: {
              isPakistaniEcommerce: isPakistaniSite,
              siteName: siteName || undefined,
              modelUsed: modelConfig.modelName,
              analysisVersion: '4.0',
            },
            agentLoop: {
              steps: agentResult.agentSteps,
              screenshotCount: agentResult.screenshotCount,
              viewportCount: agentResult.viewports.length,
              usedVision: agentResult.usedVision,
            },
          },
        };

        await storeDatasetEntry(entry);
        successCount++;

        // Close tab
        if (tab.id) {
          await chrome.tabs.remove(tab.id);
        }
      } catch (error: any) {
        console.error(`Error processing ${url}:`, error);
        failCount++;

        // Close tab if it was created
        if (tab?.id) {
          try {
            await chrome.tabs.remove(tab.id);
          } catch (e) {
            // Ignore errors when closing tab
          }
        }

        message.warning(
          `Failed to process ${url}: ${error.message || 'Unknown error'}`,
        );
      }
    }

    setProgress(null);
    setUrlQueue([]);
    setIsProcessingQueue(false);

    message.success({
      content: `Batch processing complete! ${successCount} succeeded, ${failCount} failed.`,
      duration: 5,
    });

    await loadEntries();
  };

  // FIX (Bug 8): Store textarea value in a ref instead of reading via
  // document.getElementById — avoids crashes when modal unmounts first.
  const batchUrlInputRef = React.useRef<string>('');

  const handleBatchProcess = () => {
    batchUrlInputRef.current = '';
    Modal.confirm({
      title: 'Batch Process URLs',
      content: (
        <div>
          <p>Enter URLs to process (one per line):</p>
          <textarea
            style={{
              width: '100%',
              minHeight: '200px',
              fontFamily: 'monospace',
            }}
            placeholder={`https://example.com\nhttps://example2.com`}
            onChange={(e) => { batchUrlInputRef.current = e.target.value; }}
          />
        </div>
      ),
      onOk: () => {
        // FIX (Bug 4b): Pass urls directly — setUrlQueue is async, processUrlQueue
        // would otherwise read the old empty state on the same render.
        const urls = batchUrlInputRef.current
          .split('\n')
          .map((u) => u.trim())
          .filter((u) => u?.startsWith('http'));

        if (urls.length === 0) {
          message.error('No valid URLs provided');
          return;
        }

        setUrlQueue(urls);
        processUrlQueue(urls);
      },
    });
  };

  const handleAutoDiscoverLinks = async () => {
    try {
      const tab = await getCurrentTab();
      if (!tab?.id || !tab.url) {
        message.error('No active tab found');
        return;
      }

      // Show options modal first
      Modal.confirm({
        title: 'Enhanced Auto Crawl Options',
        width: 700,
        content: (
          <div style={{ marginTop: 16 }}>
            <p>Choose crawling strategy:</p>
            <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: '1.8' }}>
              <li>
                <strong>Quick Scan:</strong> Current page only (fast, ~50-200
                links)
              </li>
              <li>
                <strong>Deep Scan:</strong> Scroll page + wait for dynamic
                content (~200-1000 links)
              </li>
              <li>
                <strong>🕷️ Full Website Crawl:</strong> Recursively follows ALL
                links to discover EVERY page on the website (comprehensive, may
                take 10-30 minutes)
              </li>
            </ul>
            <p style={{ marginTop: 12, color: '#666', fontSize: '12px' }}>
              <strong>Full Website Crawl:</strong> Will visit every page, follow
              all internal links, and discover the entire website structure.
              Perfect for complete coverage.
            </p>
          </div>
        ),
        okText: '🕷️ Full Website Crawl',
        cancelText: 'Deep Scan',
        onOk: async () => {
          await performRecursiveWebsiteCrawl(tab.id!, tab.url!);
        },
        onCancel: async () => {
          await performDeepLinkDiscovery(tab.id!);
        },
      });
    } catch (error: any) {
      console.error('Auto-discover links error:', error);
      message.error(
        `Failed to auto-discover links: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  };

  const performQuickLinkDiscovery = async (tabId: number) => {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[href]'),
          );
          const origin = location.origin;
          const urls = new Set<string>();

          for (const a of anchors) {
            const rawHref = a.getAttribute('href') || a.href;
            if (!rawHref) continue;
            try {
              const absolute = new URL(rawHref, location.href).href;
              if (absolute.startsWith(origin)) {
                urls.add(absolute);
              }
            } catch {
              // ignore malformed hrefs
            }
          }

          return Array.from(urls);
        },
      });

      const discovered: string[] = results[0]?.result || [];
      showLinkDiscoveryResult(discovered);
    } catch (error: any) {
      message.error(`Failed to discover links: ${error.message}`);
    }
  };

  const performDeepLinkDiscovery = async (tabId: number) => {
    try {
      message.loading({
        content: 'Scanning page (this may take 30-60 seconds)...',
        key: 'crawl',
        duration: 0,
      });

      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const origin = location.origin;
          const urls = new Set<string>();
          let lastHeight = 0;
          let scrollAttempts = 0;
          const maxScrollAttempts = 10; // Prevent infinite scroll

          // Function to collect all links
          const collectLinks = () => {
            const anchors = Array.from(
              document.querySelectorAll<HTMLAnchorElement>('a[href]'),
            );

            for (const a of anchors) {
              const rawHref = a.getAttribute('href') || a.href;
              if (!rawHref) continue;
              try {
                const absolute = new URL(rawHref, location.href).href;
                if (absolute.startsWith(origin)) {
                  // Filter out common non-content URLs
                  const urlLower = absolute.toLowerCase();
                  if (
                    !urlLower.includes('/api/') &&
                    !urlLower.includes('/ajax/') &&
                    !urlLower.includes('/json/') &&
                    !urlLower.includes('#') &&
                    !urlLower.includes('javascript:') &&
                    !urlLower.includes('mailto:') &&
                    !urlLower.includes('tel:')
                  ) {
                    urls.add(absolute);
                  }
                }
              } catch {
                // ignore malformed hrefs
              }
            }
          };

          // Initial collection
          collectLinks();

          // Scroll and collect (for lazy-loaded content)
          while (scrollAttempts < maxScrollAttempts) {
            // Scroll to bottom
            window.scrollTo(0, document.body.scrollHeight);

            // Wait for content to load
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Check if page height changed (new content loaded)
            const currentHeight = document.body.scrollHeight;
            if (currentHeight === lastHeight) {
              // No new content, try a few more times
              scrollAttempts++;
              if (scrollAttempts >= 3) break;
            } else {
              scrollAttempts = 0; // Reset if new content found
            }

            lastHeight = currentHeight;

            // Collect links after scroll
            collectLinks();

            // Try clicking "Load More" or "See More" buttons if they exist
            const loadMoreButtons = Array.from(
              document.querySelectorAll<HTMLElement>(
                'button, a, div[role="button"]',
              ),
            ).filter((el) => {
              const text = el.textContent?.toLowerCase() || '';
              return (
                text.includes('load more') ||
                text.includes('see more') ||
                text.includes('show more') ||
                text.includes('زیادہ دیکھیں') ||
                text.includes('aur dekhein')
              );
            });

            if (loadMoreButtons.length > 0) {
              try {
                loadMoreButtons[0].click();
                await new Promise((resolve) => setTimeout(resolve, 3000));
                collectLinks();
              } catch {
                // Ignore click errors
              }
            }
          }

          // Scroll back to top
          window.scrollTo(0, 0);
          await new Promise((resolve) => setTimeout(resolve, 1000));
          collectLinks();

          return Array.from(urls);
        },
      });

      message.destroy('crawl');
      const discovered: string[] = results[0]?.result || [];
      showLinkDiscoveryResult(discovered);
    } catch (error: any) {
      message.destroy('crawl');
      message.error(`Failed to discover links: ${error.message}`);
    }
  };

  // Normalize URL to avoid duplicates (remove fragments, trailing slashes, etc.)
  const normalizeUrl = (url: string): string => {
    try {
      const urlObj = new URL(url);
      // Remove fragment
      urlObj.hash = '';
      // Remove trailing slash (except for root)
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
      }
      // Sort query params for consistency
      const params = new URLSearchParams(urlObj.search);
      urlObj.search = params.toString();
      return urlObj.href;
    } catch {
      return url;
    }
  };

  // Check if URL should be crawled (filters out API endpoints, etc.)
  const shouldCrawlUrl = (url: string, baseOrigin: string): boolean => {
    try {
      const urlObj = new URL(url);
      // Must be same origin
      if (urlObj.origin !== baseOrigin) return false;

      const urlLower = url.toLowerCase();
      // Exclude API endpoints
      if (
        urlLower.includes('/api/') ||
        urlLower.includes('/ajax/') ||
        urlLower.includes('/json/') ||
        urlLower.includes('/graphql') ||
        urlLower.includes('/rest/') ||
        urlLower.includes('javascript:') ||
        urlLower.includes('mailto:') ||
        urlLower.includes('tel:') ||
        urlLower.includes('#') ||
        urlLower.includes('.pdf') ||
        urlLower.includes('.jpg') ||
        urlLower.includes('.png') ||
        urlLower.includes('.gif') ||
        urlLower.includes('.zip') ||
        urlLower.includes('.exe')
      ) {
        return false;
      }

      // Exclude common non-content paths
      const path = urlObj.pathname.toLowerCase();
      if (
        path.includes('/admin/') ||
        path.includes('/private/') ||
        path.includes('/internal/') ||
        path.includes('/_next/') ||
        path.includes('/static/') ||
        path.includes('/assets/')
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  };

  const performRecursiveWebsiteCrawl = async (
    startTabId: number,
    startUrl: string,
  ) => {
    if (isRecursiveCrawling) {
      message.warning('Recursive crawl already in progress');
      return;
    }

    try {
      const startUrlObj = new URL(startUrl);
      const baseOrigin = startUrlObj.origin;

      Modal.confirm({
        title: '🕷️ Full Website Crawl',
        width: 600,
        content: (
          <div style={{ marginTop: 16 }}>
            <p>
              This will recursively crawl the <strong>ENTIRE website</strong>{' '}
              starting from:
            </p>
            <p
              style={{
                wordBreak: 'break-all',
                background: '#f5f5f5',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              {startUrl}
            </p>
            <div style={{ marginTop: 16 }}>
              <p>
                <strong>How it works:</strong>
              </p>
              <ul style={{ paddingLeft: 20, fontSize: '12px' }}>
                <li>Starts from current page</li>
                <li>Discovers all links on each page</li>
                <li>Visits each new page found</li>
                <li>Continues until ALL pages are discovered</li>
                <li>Skips already visited pages (no duplicates)</li>
              </ul>
            </div>
            <p style={{ marginTop: 16, color: '#ff4d4f', fontSize: '12px' }}>
              <strong>⚠️ Warning:</strong> This may take 10-30 minutes for large
              websites and will discover thousands of pages. Make sure you have
              enough API credits.
            </p>
          </div>
        ),
        okText: 'Start Full Crawl',
        cancelText: 'Cancel',
        onOk: async () => {
          setIsRecursiveCrawling(true);
          setShowCrawlModal(true);
          stopCrawlRef.current = false;
          setCrawlProgress({
            discovered: 0,
            visited: 0,
            queue: 1,
            currentUrl: startUrl,
          });

          const visitedUrls = new Set<string>();
          const urlQueue: string[] = [normalizeUrl(startUrl)];
          const allDiscoveredUrls = new Set<string>();

          let currentIndex = 0;
          const maxPages = 10000; // Safety limit
          const delayBetweenPages = 2000; // 2 seconds between page visits

          while (currentIndex < urlQueue.length && currentIndex < maxPages) {
            if (stopCrawlRef.current) {
              console.log('Recursive crawl stopped by user');
              break;
            }

            const currentUrl = urlQueue[currentIndex];
            const normalizedUrl = normalizeUrl(currentUrl);

            // Skip if already visited
            if (visitedUrls.has(normalizedUrl)) {
              currentIndex++;
              continue;
            }

            setCrawlProgress({
              discovered: allDiscoveredUrls.size,
              visited: visitedUrls.size,
              queue: urlQueue.length - currentIndex,
              currentUrl: currentUrl,
            });

            try {
              // Open URL in new tab
              const tab = await chrome.tabs.create({
                url: currentUrl,
                active: false,
              });

              if (!tab.id) {
                currentIndex++;
                continue;
              }

              // Wait for page to load
              await waitForPageLoad(tab.id, 15000);

              // Discover links on this page
              const discoveredLinks = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async () => {
                  const origin = location.origin;
                  const urls = new Set<string>();
                  let lastHeight = 0;
                  let scrollAttempts = 0;
                  const maxScrollAttempts = 8; // Increased attempts

                  // Recursive function to find links, piercing Shadow DOMs
                  const findLinksInNode = (
                    root: Document | ShadowRoot | Element,
                  ) => {
                    // Get links in current root
                    const anchors = Array.from(
                      root.querySelectorAll('a[href]'),
                    ) as HTMLAnchorElement[];

                    anchors.forEach((a) => {
                      try {
                        const rawHref = a.getAttribute('href') || a.href;
                        if (!rawHref) return;

                        const absolute = new URL(rawHref, location.href).href;

                        // Relaxed filtering: Allow same-domain and subdomains if logical
                        // We mainly check if it's http/https and not some other protocol
                        const urlObj = new URL(absolute);

                        if (
                          urlObj.protocol !== 'http:' &&
                          urlObj.protocol !== 'https:'
                        )
                          return;

                        // Basic exclusion of non-page resources
                        const urlLower = absolute.toLowerCase();
                        if (
                          urlLower.includes('javascript:') ||
                          urlLower.includes('mailto:') ||
                          urlLower.includes('tel:') ||
                          urlLower.match(
                            /\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|woff|woff2)$/i,
                          )
                        ) {
                          return;
                        }

                        // Check if it belongs to the same domain (allowing subdomains for now, or strict origin?)
                        // User wants "all links that I use for the scratching", implying same site.
                        // Let's stick to origin startsWith for safety against external links,
                        // but we can be slightly looser if needed. For now, origin check is standard for "crawling a site".
                        if (absolute.startsWith(origin)) {
                          urlObj.hash = ''; // Remove fragments
                          if (
                            urlObj.pathname !== '/' &&
                            urlObj.pathname.endsWith('/')
                          ) {
                            urlObj.pathname = urlObj.pathname.slice(0, -1);
                          }
                          urls.add(urlObj.href);
                        }
                      } catch (e) {
                        /* ignore invalid URLs */
                      }
                    });

                    // Traverse children to find Shadow Roots
                    const allNodes = root.querySelectorAll('*');
                    allNodes.forEach((node) => {
                      if (node.shadowRoot) {
                        findLinksInNode(node.shadowRoot);
                      }
                    });
                  };

                  const collectLinks = () => {
                    findLinksInNode(document);
                  };

                  collectLinks();

                  // Robust scroll to load lazy content
                  for (let i = 0; i < maxScrollAttempts; i++) {
                    window.scrollTo(0, document.body.scrollHeight);
                    // Wait longer for hydration/network
                    await new Promise((resolve) => setTimeout(resolve, 2500));

                    const currentHeight = document.body.scrollHeight;
                    if (currentHeight === lastHeight) {
                      scrollAttempts++;
                      // If stuck for 2 attempts, try scrolling up a bit and back down to trigger scroll events
                      if (scrollAttempts >= 2) {
                        window.scrollTo(0, document.body.scrollHeight - 500);
                        await new Promise((resolve) =>
                          setTimeout(resolve, 500),
                        );
                        window.scrollTo(0, document.body.scrollHeight);
                        await new Promise((resolve) =>
                          setTimeout(resolve, 1000),
                        );
                        if (document.body.scrollHeight === lastHeight) break; // Still stuck
                      }
                    } else {
                      scrollAttempts = 0;
                    }
                    lastHeight = currentHeight;
                    collectLinks();
                  }

                  return Array.from(urls);
                },
              });

              const links = discoveredLinks[0]?.result || [];

              // FIX (Bug 5): Use allDiscoveredUrls.has() Set lookup (O(1))
              // instead of urlQueue.includes() which is O(n), causing O(n²)
              // performance on large crawls with 10,000+ URLs.
              for (const link of links) {
                const normalized = normalizeUrl(link);
                if (
                  shouldCrawlUrl(link, baseOrigin) &&
                  !visitedUrls.has(normalized) &&
                  !allDiscoveredUrls.has(normalized)
                ) {
                  urlQueue.push(normalized);
                  allDiscoveredUrls.add(normalized);
                }
              }

              // Mark as visited
              visitedUrls.add(normalizedUrl);

              // Close tab
              await chrome.tabs.remove(tab.id);

              // Delay between pages to avoid overwhelming the server
              await new Promise((resolve) =>
                setTimeout(resolve, delayBetweenPages),
              );
            } catch (error: any) {
              console.error(`Error crawling ${currentUrl}:`, error);
              // Mark as visited even if failed to avoid retrying
              visitedUrls.add(normalizedUrl);
            }

            currentIndex++;
          }

          setIsRecursiveCrawling(false);
          setShowCrawlModal(false);
          setCrawlProgress(null);

          const finalUrls = Array.from(allDiscoveredUrls);

          Modal.success({
            title: stopCrawlRef.current
              ? '⏸️ Crawl Stopped Early'
              : '✅ Full Website Crawl Complete!',
            width: 700,
            content: (
              <div style={{ marginTop: 16 }}>
                <p>
                  <strong>Website crawl finished!</strong>
                </p>
                <div style={{ marginTop: 12 }}>
                  <p>
                    <strong>Total pages discovered:</strong> {finalUrls.length}
                  </p>
                  <p>
                    <strong>Pages visited:</strong> {visitedUrls.size}
                  </p>
                </div>
                <div
                  style={{
                    marginTop: 16,
                    maxHeight: '200px',
                    overflow: 'auto',
                    border: '1px solid #d9d9d9',
                    padding: '8px',
                    borderRadius: '4px',
                  }}
                >
                  <p
                    style={{
                      fontSize: '12px',
                      marginBottom: '8px',
                      fontWeight: 'bold',
                    }}
                  >
                    Sample URLs:
                  </p>
                  {finalUrls.slice(0, 20).map((url, idx) => (
                    <p
                      key={idx}
                      style={{
                        fontSize: '11px',
                        margin: '4px 0',
                        wordBreak: 'break-all',
                      }}
                    >
                      {url}
                    </p>
                  ))}
                  {finalUrls.length > 20 && (
                    <p
                      style={{
                        fontSize: '11px',
                        color: '#666',
                        marginTop: '8px',
                      }}
                    >
                      ... and {finalUrls.length - 20} more
                    </p>
                  )}
                </div>
                <p style={{ marginTop: 16, color: '#666', fontSize: '12px' }}>
                  <small>
                    Ready to process all {finalUrls.length} pages for dark
                    pattern analysis.
                  </small>
                </p>
              </div>
            ),
            okText: `Process All (${finalUrls.length})`,
            onOk: () => {
              setUrlQueue(finalUrls);
              processUrlQueue(finalUrls);
            },
          });
        },
      });
    } catch (error: any) {
      message.error(`Failed to start recursive crawl: ${error.message}`);
      setIsRecursiveCrawling(false);
      setShowCrawlModal(false);
      setCrawlProgress(null);
    }
  };

  const showLinkDiscoveryResult = (discovered: string[]) => {
    if (!discovered.length) {
      message.warning('No internal links discovered on this page');
      return;
    }

    // Filter and categorize URLs
    const categorized = {
      product: discovered.filter(
        (url) =>
          url.match(/\/product\//i) ||
          url.match(/\/p\//i) ||
          url.match(/\/item\//i) ||
          url.match(/\/dp\//i),
      ),
      category: discovered.filter(
        (url) =>
          url.match(/\/category\//i) ||
          url.match(/\/c\//i) ||
          url.match(/\/shop\//i),
      ),
      other: discovered.filter(
        (url) =>
          !url.match(/\/product\//i) &&
          !url.match(/\/p\//i) &&
          !url.match(/\/item\//i) &&
          !url.match(/\/dp\//i) &&
          !url.match(/\/category\//i) &&
          !url.match(/\/c\//i) &&
          !url.match(/\/shop\//i),
      ),
    };

    Modal.confirm({
      title: 'Auto Crawl Results',
      width: 700,
      content: (
        <div style={{ marginTop: 16 }}>
          <p>
            <strong>Total links discovered: {discovered.length}</strong>
          </p>
          <div style={{ marginTop: 12 }}>
            <p>
              <strong>Product pages:</strong> {categorized.product.length}
            </p>
            <p>
              <strong>Category pages:</strong> {categorized.category.length}
            </p>
            <p>
              <strong>Other pages:</strong> {categorized.other.length}
            </p>
          </div>
          <div
            style={{
              marginTop: 16,
              maxHeight: '200px',
              overflow: 'auto',
              border: '1px solid #d9d9d9',
              padding: '8px',
              borderRadius: '4px',
            }}
          >
            <p
              style={{
                fontSize: '12px',
                marginBottom: '8px',
                fontWeight: 'bold',
              }}
            >
              Sample URLs:
            </p>
            {discovered.slice(0, 10).map((url, idx) => (
              <p
                key={idx}
                style={{
                  fontSize: '11px',
                  margin: '4px 0',
                  wordBreak: 'break-all',
                }}
              >
                {url}
              </p>
            ))}
            {discovered.length > 10 && (
              <p style={{ fontSize: '11px', color: '#666', marginTop: '8px' }}>
                ... and {discovered.length - 10} more
              </p>
            )}
          </div>
          <p style={{ marginTop: 16, color: '#666', fontSize: '12px' }}>
            <small>
              Note: Processing all {discovered.length} pages may take a while.
              Consider filtering by type first.
            </small>
          </p>
        </div>
      ),
      okText: `Process All (${discovered.length})`,
      cancelText: 'Cancel',
      onOk: () => {
        setUrlQueue(discovered);
        processUrlQueue(discovered);
      },
    });
  };

  // Fallback download in popup (in case service worker download fails on some browsers)
  const triggerFallbackDownload = (data: string, filename: string) => {
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('Dataset exported (fallback download)');
    } catch (error) {
      console.error('Fallback export error:', error);
      message.error('Failed to export dataset (fallback)');
    }
  };

  const handleExport = async () => {
    try {
      const jsonData = await exportDatasetAsJSON(2);
      const filename = `dark-patterns-dataset-${dayjs().format('YYYY-MM-DD-HHmmss')}.json`;

      // Direct download from popup to avoid message size limits
      triggerFallbackDownload(jsonData, filename);
    } catch (error) {
      console.error('Export error before download:', error);
      message.error(
        `Failed to prepare dataset for export: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  };

  const handleExportTextOnly = async () => {
    try {
      const jsonlData = await exportTextDatasetAsJSONL();
      if (!jsonlData.trim()) {
        message.warning('No patterns found to export in text dataset');
        return;
      }

      const filename = `dark-patterns-text-dataset-${dayjs().format(
        'YYYY-MM-DD-HHmmss',
      )}.jsonl`;

      // Direct download from popup to avoid message size limits
      triggerFallbackDownload(jsonlData, filename);
    } catch (error) {
      console.error('Text dataset export error:', error);
      message.error(
        `Failed to export text-only dataset: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  };

  const handleExportBundle = async () => {
    if (entries.length === 0) {
      message.warning('No dataset entries to export');
      return;
    }

    setExportingBundle(true);
    try {
      const bundleBlob = await exportDatasetAsBundleZip();
      const filename = `dark-patterns-dataset-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
      const blobUrl = URL.createObjectURL(bundleBlob);

      chrome.downloads.download(
        {
          url: blobUrl,
          filename,
          saveAs: true,
        },
        () => {
          if (chrome.runtime.lastError) {
            message.error(
              `Failed to export bundle: ${chrome.runtime.lastError.message}`,
            );
          } else {
            message.success('Dataset bundle exported');
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        },
      );
    } catch (error) {
      console.error('Bundle export error:', error);
      message.error(
        `Failed to build dataset bundle: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      setExportingBundle(false);
    }
  };

  const handleExportUITars = async () => {
    if (entries.length === 0) {
      message.warning('No dataset entries to export');
      return;
    }

    // Check if entries have bounding boxes
    const entriesWithBbox = entries.filter((e) =>
      e.patterns.some((p) => p.bbox && p.bbox.length === 4),
    );

    if (entriesWithBbox.length === 0) {
      Modal.warning({
        title: 'No Bounding Boxes Found',
        content:
          'Your dataset entries do not have bounding box annotations. GPT-4o needs to detect and return bbox coordinates for each pattern. Please re-analyze pages to get bounding boxes.',
      });
      return;
    }

    setExportingBundle(true);
    try {
      const uitarsBlob = await exportForUITarsFineTuning();
      const filename = `ui-tars-training-dataset-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
      const blobUrl = URL.createObjectURL(uitarsBlob);

      chrome.downloads.download(
        {
          url: blobUrl,
          filename,
          saveAs: true,
        },
        () => {
          if (chrome.runtime.lastError) {
            message.error(
              `Failed to export UI-TARS dataset: ${chrome.runtime.lastError.message}`,
            );
          } else {
            message.success(
              `UI-TARS training dataset exported (${entriesWithBbox.length} images with annotations)`,
            );
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        },
      );
    } catch (error) {
      console.error('UI-TARS export error:', error);
      message.error(
        `Failed to export UI-TARS dataset: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      setExportingBundle(false);
    }
  };

  const handleClear = () => {
    Modal.confirm({
      title: 'Clear All Entries',
      content:
        'Are you sure you want to delete all dataset entries? This cannot be undone.',
      onOk: async () => {
        try {
          await clearDatasetEntries();
          message.success('All entries cleared');
          await loadEntries();
        } catch (error) {
          message.error('Failed to clear entries');
        }
      },
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDatasetEntry(id);
      message.success('Entry deleted');
      await loadEntries();
    } catch (error) {
      message.error('Failed to delete entry');
    }
  };

  // Export COCO format
  const handleExportCOCO = async () => {
    setExportingBundle(true);
    try {
      const blob = await exportAsCOCO();
      const filename = `dark-patterns-coco-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
      const blobUrl = URL.createObjectURL(blob);
      chrome.downloads.download(
        { url: blobUrl, filename, saveAs: true },
        () => {
          if (chrome.runtime.lastError) {
            message.error(
              `Failed to export COCO: ${chrome.runtime.lastError.message}`,
            );
          } else {
            message.success('COCO format dataset exported!');
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        },
      );
    } catch (error) {
      message.error(
        `Failed to export COCO: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setExportingBundle(false);
    }
  };

  // Export YOLO format
  const handleExportYOLO = async () => {
    setExportingBundle(true);
    try {
      const blob = await exportAsYOLO();
      const filename = `dark-patterns-yolo-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
      const blobUrl = URL.createObjectURL(blob);
      chrome.downloads.download(
        { url: blobUrl, filename, saveAs: true },
        () => {
          if (chrome.runtime.lastError) {
            message.error(
              `Failed to export YOLO: ${chrome.runtime.lastError.message}`,
            );
          } else {
            message.success('YOLO format dataset exported!');
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        },
      );
    } catch (error) {
      message.error(
        `Failed to export YOLO: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setExportingBundle(false);
    }
  };

  // Export annotated images
  const handleExportAnnotatedImages = async () => {
    setExportingBundle(true);
    try {
      const blob = await exportAnnotatedImages();
      const filename = `dark-patterns-annotated-${dayjs().format('YYYY-MM-DD-HHmmss')}.zip`;
      const blobUrl = URL.createObjectURL(blob);
      chrome.downloads.download(
        { url: blobUrl, filename, saveAs: true },
        () => {
          if (chrome.runtime.lastError) {
            message.error(
              `Failed to export: ${chrome.runtime.lastError.message}`,
            );
          } else {
            message.success('Annotated images exported!');
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        },
      );
    } catch (error) {
      message.error(
        `Failed to export: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setExportingBundle(false);
    }
  };

  // Open bbox editor for an entry
  const handleEditBboxes = (entry: DatasetEntry) => {
    if (!entry.screenshot) {
      message.error('No screenshot available for this entry');
      return;
    }
    setEditingEntry(entry);
    setShowBboxEditor(true);
  };

  // Save bbox edits
  const handleSaveBboxEdits = async (patterns: DarkPattern[]) => {
    if (!editingEntry) return;

    try {
      // Re-crop images for updated patterns
      const patternsWithCrops = await Promise.all(
        patterns.map(async (p) => {
          if (p.bbox && p.bbox.length === 4 && editingEntry.screenshot) {
            try {
              const croppedImage = await cropImageFromBbox(
                editingEntry.screenshot,
                p.bbox,
              );
              return { ...p, croppedImage };
            } catch {
              return p;
            }
          }
          return p;
        }),
      );

      const updatedEntry: DatasetEntry = {
        ...editingEntry,
        patterns: patternsWithCrops,
      };

      await storeDatasetEntry(updatedEntry);
      message.success('Bounding boxes updated!');
      setShowBboxEditor(false);
      setEditingEntry(null);
      await loadEntries();
    } catch (error) {
      message.error('Failed to save edits');
    }
  };

  const getSeverityColor = (severity?: string) => {
    if (!severity) {
      return 'default';
    }
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'red';
      case 'high':
        return 'orange';
      case 'medium':
        return 'gold';
      case 'low':
        return 'blue';
      default:
        return 'default';
    }
  };

  const patternBreakdown = Object.entries(
    statistics.categoryBreakdown || {},
  ).sort((a, b) => b[1] - a[1]);

  const patternFilterOptions = [
    { label: 'All Patterns', value: 'ALL' },
    ...patternBreakdown.map(([type]) => ({ label: type, value: type })),
  ];

  return (
    <div className="dataset-collection-container">
      {!readyState.isReady && readyState.errorMessage && (
        <Alert
          message="Configuration Required"
          description={readyState.errorMessage}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Refresh
            </Button>
          }
        />
      )}

      {/* Crawl Progress Modal */}
      <Modal
        title="🕷️ Auto Crawling Website..."
        open={showCrawlModal}
        closable={false}
        maskClosable={false}
        footer={[
          <Button
            key="stop"
            danger
            type="primary"
            onClick={() => {
              stopCrawlRef.current = true;
              message.info('Stopping crawl... please wait for current page to finish.');
            }}
          >
            Stop & Process Discovered Links
          </Button>,
        ]}
      >
        {crawlProgress ? (
          <div>
            <p>The extractor is currently exploring the website structure to discover relevant pages.</p>
            <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 500 }}>Pages Visited:</span>
                <span style={{ color: '#1890ff', fontWeight: 'bold' }}>{crawlProgress.visited}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 500 }}>Links Discovered:</span>
                <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{crawlProgress.discovered}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500 }}>Remaining in Queue:</span>
                <span>{crawlProgress.queue}</span>
              </div>
            </div>
            <div style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>Currently processing:</p>
              <div style={{ 
                fontSize: '11px', 
                background: '#fafafa', 
                padding: '8px', 
                border: '1px solid #e8e8e8',
                borderRadius: '4px',
                wordBreak: 'break-all',
                maxHeight: '60px',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {crawlProgress.currentUrl}
              </div>
            </div>
          </div>
        ) : (
          <p>Initializing crawler...</p>
        )}
      </Modal>

      <div className="dataset-header">
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="Websites Scanned"
              value={statistics.totalEntries}
              prefix={<FileTextOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Patterns Found"
              value={statistics.totalPatterns}
              prefix={<WarningOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Prevalence Rate"
              value={statistics.prevalenceRate}
              suffix="%"
              precision={1}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="PK E-commerce"
              value={statistics.pakistaniSitesScanned}
            />
          </Col>
        </Row>

        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={12}>
            <Card
              size="small"
              title="Pattern Counts"
              bodyStyle={{ padding: 12 }}
            >
              {patternBreakdown.length === 0 ? (
                <Text type="secondary">No patterns detected yet.</Text>
              ) : (
                <Space wrap>
                  {patternBreakdown.map(([type, count]) => (
                    <Tag key={type} color="blue">
                      {type}: {count}
                    </Tag>
                  ))}
                </Space>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card
              size="small"
              title="Filter by Pattern"
              bodyStyle={{ padding: 12 }}
            >
              <Select
                style={{ minWidth: 240 }}
                options={patternFilterOptions}
                value={filterPattern}
                onChange={(v) => setFilterPattern(v)}
              />
            </Card>
          </Col>
        </Row>

        <Space wrap>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={analyzeCurrentPage}
            loading={analyzing}
            disabled={!readyState.isReady}
          >
            Analyze Current Page
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={handleBatchProcess}
            disabled={isProcessingQueue || !readyState.isReady}
          >
            Batch Process (Manual URLs)
          </Button>
          <Button
            icon={<FileTextOutlined />}
            onClick={handleAutoDiscoverLinks}
            disabled={
              isProcessingQueue || isRecursiveCrawling || !readyState.isReady
            }
          >
            {isRecursiveCrawling
              ? '🕷️ Crawling Website...'
              : 'Batch Process (Auto Crawl)'}
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExport}
            disabled={entries.length === 0}
          >
            Export JSON (Full)
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportTextOnly}
            disabled={entries.length === 0}
          >
            Export Text Dataset (JSONL)
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportBundle}
            loading={exportingBundle}
            disabled={entries.length === 0}
          >
            Export Bundle (ZIP)
          </Button>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleExportUITars}
            loading={exportingBundle}
            disabled={entries.length === 0}
            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
          >
            Export UI-TARS Format
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportCOCO}
            loading={exportingBundle}
            disabled={entries.length === 0}
            style={{
              backgroundColor: '#722ed1',
              borderColor: '#722ed1',
              color: '#fff',
            }}
          >
            Export COCO Format
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportYOLO}
            loading={exportingBundle}
            disabled={entries.length === 0}
            style={{
              backgroundColor: '#eb2f96',
              borderColor: '#eb2f96',
              color: '#fff',
            }}
          >
            Export YOLO Format
          </Button>
          <Button
            icon={<EyeOutlined />}
            onClick={handleExportAnnotatedImages}
            loading={exportingBundle}
            disabled={entries.length === 0}
          >
            Export Annotated Images
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleClear}
            disabled={entries.length === 0}
          >
            Clear All
          </Button>
        </Space>
      </div>

      {crawlProgress && (
        <Card style={{ marginBottom: 16, border: '2px solid #ff4d4f', background: '#fff1f0' }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: '16px' }}>
                🕷️ Full Website Crawl in Progress...
              </Text>
              <Button
                danger
                type="primary"
                size="large"
                onClick={() => {
                  stopCrawlRef.current = true;
                  message.warning('⏸ Stopping after current page finishes — discovered links will be processed.');
                }}
                style={{ fontWeight: 'bold', fontSize: '14px' }}
              >
                ⏹ STOP & PROCESS NOW
              </Button>
            </div>
            <Row gutter={16}>
              <Col span={8}>
                <Statistic
                  title="Links Discovered"
                  value={crawlProgress.discovered}
                  valueStyle={{ color: '#1890ff', fontSize: '28px' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Pages Visited"
                  value={crawlProgress.visited}
                  valueStyle={{ color: '#52c41a', fontSize: '28px' }}
                />
              </Col>
              <Col span={8}>
                <Statistic
                  title="Remaining in Queue"
                  value={crawlProgress.queue}
                  valueStyle={{ color: '#faad14', fontSize: '28px' }}
                />
              </Col>
            </Row>
            <Text
              type="secondary"
              style={{ fontSize: '12px', display: 'block', marginTop: 4 }}
            >
              <strong>Currently crawling:</strong>{' '}
              {crawlProgress.currentUrl.length > 90
                ? `${crawlProgress.currentUrl.substring(0, 90)}...`
                : crawlProgress.currentUrl}
            </Text>
            <Text
              type="secondary"
              style={{ fontSize: '11px', display: 'block', color: '#ff4d4f' }}
            >
              ⚠️ Click "STOP & PROCESS NOW" at any time to halt crawling and immediately analyze all discovered links so far.
            </Text>
          </Space>
        </Card>
      )}


      {progress && (
        <Card style={{ marginBottom: 16 }}>
          <Progress
            percent={Math.round((progress.current / progress.total) * 100)}
            status="active"
          />
          <Space direction="vertical" style={{ width: '100%', marginTop: 8 }}>
            <Text strong>
              Processing {progress.current} of {progress.total}
            </Text>
            <Text
              type="secondary"
              style={{ fontSize: '12px', display: 'block' }}
            >
              {progress.status}
            </Text>
            <Text
              type="secondary"
              style={{ fontSize: '12px', display: 'block' }}
            >
              {progress.url}
            </Text>
          </Space>
        </Card>
      )}

      {entries.length === 0 ? (
        <Empty
          description="No dataset entries yet. Click 'Analyze Current Page' to start collecting data."
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          dataSource={filteredEntries}
          renderItem={(entry) => (
            <List.Item>
              <Card style={{ width: '100%' }}>
                <div className="entry-header">
                  <div>
                    <Text strong>
                      {entry.metadata?.pageTitle || 'Untitled'}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {entry.url}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                    </Text>
                  </div>
                  <Space>
                    <Button
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={() => handleDelete(entry.id)}
                    >
                      Delete
                    </Button>
                  </Space>
                </div>

                {(() => {
                  const effectivePatterns = getEffectivePatterns(entry);
                  return effectivePatterns.length === 0 ? (
                    <Tag color="green">No dark patterns detected</Tag>
                  ) : (
                    <div className="patterns-list">
                      {effectivePatterns.map((pattern, idx) => (
                      <Card
                        key={idx}
                        size="small"
                        style={{ marginTop: 8 }}
                        title={
                          <Space>
                            <Tag color={getSeverityColor(pattern.severity)}>
                              {pattern.severity?.toUpperCase() || 'UNKNOWN'}
                            </Tag>
                            <Text strong>{pattern.type}</Text>
                          </Space>
                        }
                      >
                        {/* Image display removed for Text-First strategy */}

                        <div style={{ display: 'grid', gap: 6 }}>
                          <div>
                            <Text strong>Location: </Text>
                            <Text type="secondary">{pattern.location || '—'}</Text>
                          </div>

                          <div>
                            <Text strong>Description: </Text>
                            <Paragraph
                              style={{ margin: 0 }}
                              ellipsis={{ rows: 2, expandable: true, symbol: 'more' }}
                            >
                              {pattern.description || '—'}
                            </Paragraph>
                          </div>

                          <div>
                            <Text strong>Evidence: </Text>
                            <Paragraph
                              style={{
                                margin: 0,
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                fontSize: 12,
                                background: '#fafafa',
                                border: '1px solid #f0f0f0',
                                borderRadius: 6,
                                padding: '8px 10px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                              ellipsis={{ rows: 3, expandable: true, symbol: 'more' }}
                            >
                              {pattern.evidence || '—'}
                            </Paragraph>
                          </div>
                        </div>
                        {pattern.confidence !== undefined && (
                          <Text
                            type="secondary"
                            style={{ fontSize: '12px', display: 'block' }}
                          >
                            Confidence: {(pattern.confidence * 100).toFixed(0)}%
                          </Text>
                        )}
                        {pattern.bbox && pattern.bbox.length === 4 && (
                          <Text
                            type="secondary"
                            style={{
                              fontSize: '12px',
                              display: 'block',
                              marginTop: 4,
                            }}
                          >
                            Bounding Box: [{pattern.bbox.join(', ')}]
                          </Text>
                        )}
                      </Card>
                    ))}
                  </div>
                  );
                })()}
                <div style={{ marginTop: 8 }}>
                  <Space>
                    <Tag color={entry.status === 'verified' ? 'green' : entry.status === 'auto' ? 'blue' : 'default'}>
                      Status: {entry.status || 'raw'}
                    </Tag>
                    {entry.auto_labels && (
                      <Tag>Auto: {entry.auto_labels.length}</Tag>
                    )}
                    {entry.verified_labels && (
                      <Tag color="green">Verified: {entry.verified_labels.filter((v) => v.verified).length}</Tag>
                    )}
                    <Button
                      size="small"
                      type="primary"
                      icon={<EditOutlined />}
                      onClick={() => setReviewingEntry(entry)}
                      style={{ background: '#722ed1', borderColor: '#722ed1' }}
                    >
                      ✏️ Manual Label
                    </Button>
                  </Space>
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}
      {/* Label Review Panel */}
      {reviewingEntry && (
        <Modal
          title="Review Auto-Generated Labels"
          open={!!reviewingEntry}
          onCancel={() => setReviewingEntry(null)}
          footer={null}
          width="90%"
          style={{ top: 20 }}
        >
          <LabelReviewPanel
            entry={reviewingEntry}
            onSave={async (verifiedLabels) => {
              const updatedEntry: DatasetEntry = {
                ...reviewingEntry,
                verified_labels: verifiedLabels,
                status: 'verified',
              };
              await storeDatasetEntry(updatedEntry);
              await loadEntries();
              setReviewingEntry(null);
              message.success('Verified labels saved');
            }}
            onCancel={() => setReviewingEntry(null)}
          />
        </Modal>
      )}

      {showBboxEditor && editingEntry && (editingEntry.screenshot || editingEntry.viewport_screenshots) && (
        <Modal
          title="Edit Bounding Boxes"
          open={true}
          onCancel={() => {
            setShowBboxEditor(false);
            setEditingEntry(null);
          }}
          footer={null}
          width="90%"
          style={{ top: 20 }}
          bodyStyle={{ height: '80vh', padding: 0 }}
          destroyOnClose
        >
          <StitchedBboxEditor
            entry={editingEntry}
            onSave={handleSaveBboxEdits}
            onCancel={() => {
              setShowBboxEditor(false);
              setEditingEntry(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
