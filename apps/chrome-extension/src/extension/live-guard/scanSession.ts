/**
 * Live Guard — Scan Session State Engine
 *
 * Maintains persistent state across the 6-phase scan lifecycle.
 * Tracks viewports, detections, interactions, analyzed regions,
 * and a reasoning log for debugging / future RAG integration.
 */

import { getDebug } from '@darkpatternhunter/shared/logger';

const debug = getDebug('live-guard:session');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ViewportCapture {
  index: number;
  screenshot: string;
  scrollY: number;
  screenshotSize: { width: number; height: number };
  viewportSize: { width: number; height: number };
  /** Cheap hash for duplicate viewport detection */
  hash: string;
}

export interface AnalyzedRegion {
  viewportIndex: number;
  scrollY: number;
  /** Normalized 0–1000 bbox [x, y, w, h] */
  bbox: [number, number, number, number];
  detectionCount: number;
}

export interface RankedInteraction {
  id: string;
  description: string;
  type: 'expand' | 'dropdown' | 'accordion' | 'checkout' | 'pricing' | 'modal';
  priority: 'high' | 'medium' | 'low';
  reason: string;
  selector?: string;
  scrollY: number;
}

export interface DetectedPattern {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;
  evidence: string;
  confidence: number;
  bbox?: [number, number, number, number];
  bboxSource?: 'dom' | 'vlm';
  counterMeasure: string;
  scrollY?: number;
  screenshotSize?: { width: number; height: number };
  viewportIndex?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  viewportId?: string;
  /** Which interaction revealed this pattern (null = global scan) */
  revealedBy?: string | null;
}

export interface ReasoningEntry {
  phase: number;
  action: string;
  input: string;
  output: string;
  timestamp: number;
  durationMs?: number;
}

export interface InteractionBudget {
  /** Max interactions per priority level */
  high: number;
  medium: number;
  low: number;
  /** Total interactions consumed so far */
  used: number;
}

export interface ScanSession {
  id: string;
  tabId: number;
  url: string;
  startedAt: number;

  // Phase 1 results
  viewportCaptures: ViewportCapture[];
  viewportHashes: Map<number, string>;

  // Phase 2 results (global detections)
  globalDetections: DetectedPattern[];
  analyzedRegions: AnalyzedRegion[];

  // Phase 3 state
  interactionCandidates: RankedInteraction[];
  visitedInteractions: Set<string>;
  interactionBudget: InteractionBudget;

  // Phase 4 results
  verifiedDetections: DetectedPattern[];

  // Reasoning trace
  reasoningLog: ReasoningEntry[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_BUDGET: InteractionBudget = {
  high: 3,
  medium: 2,
  low: 0,
  used: 0,
};

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createSession(tabId: number, url: string): ScanSession {
  const session: ScanSession = {
    id: `${tabId}-${Date.now()}`,
    tabId,
    url,
    startedAt: Date.now(),
    viewportCaptures: [],
    viewportHashes: new Map(),
    globalDetections: [],
    analyzedRegions: [],
    interactionCandidates: [],
    visitedInteractions: new Set(),
    interactionBudget: { ...DEFAULT_BUDGET },
    verifiedDetections: [],
    reasoningLog: [],
  };
  debug('Session created:', session.id);
  return session;
}

// ─── Viewport helpers ────────────────────────────────────────────────────────

/**
 * Compute a cheap hash from a base64 screenshot string.
 * Samples 1024 evenly-spaced characters → fast O(1).
 */
export function computeViewportHash(base64: string): string {
  const step = Math.max(1, Math.floor(base64.length / 1024));
  let hash = '';
  for (let i = 0; i < base64.length; i += step) {
    hash += base64[i];
  }
  return hash;
}

export function addViewportCapture(
  session: ScanSession,
  capture: Omit<ViewportCapture, 'hash'>,
): ViewportCapture {
  const hash = computeViewportHash(capture.screenshot);
  const full: ViewportCapture = { ...capture, hash };
  session.viewportCaptures.push(full);
  session.viewportHashes.set(capture.index, hash);
  debug(`Viewport ${capture.index} added (scrollY=${capture.scrollY}, hash=${hash.slice(0, 16)}…)`);
  return full;
}

/**
 * Check if two viewport hashes are near-identical (>98% character match).
 */
export function areViewportsIdentical(hashA: string, hashB: string): boolean {
  const len = Math.min(hashA.length, hashB.length);
  if (len === 0) return false;
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (hashA[i] === hashB[i]) matches++;
  }
  return matches / len > 0.98;
}

// ─── Detection merge ─────────────────────────────────────────────────────────

/**
 * IoU between two [x, y, w, h] boxes in the same normalized space.
 */
export function bboxIoU(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ix1 = Math.max(ax, bx);
  const iy1 = Math.max(ay, by);
  const ix2 = Math.min(ax + aw, bx + bw);
  const iy2 = Math.min(ay + ah, by + bh);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return 0;
  const unionArea = aw * ah + bw * bh - inter;
  return unionArea > 0 ? inter / unionArea : 0;
}

/**
 * Check if a new detection duplicates an existing one in the session.
 * Same type + close scroll position + high IoU = duplicate.
 */
export function isDuplicate(
  existing: DetectedPattern,
  candidate: DetectedPattern,
): boolean {
  if (existing.type !== candidate.type) return false;
  if (!existing.bbox || !candidate.bbox) return false;
  const scrollDelta = Math.abs((existing.scrollY ?? 0) - (candidate.scrollY ?? 0));
  return scrollDelta < 200 && bboxIoU(existing.bbox, candidate.bbox) > 0.6;
}

/**
 * Merge new patterns into session.globalDetections, rejecting duplicates.
 * Returns only the genuinely new patterns that were added.
 */
export function mergeDetections(
  session: ScanSession,
  newPatterns: DetectedPattern[],
): DetectedPattern[] {
  const added: DetectedPattern[] = [];
  for (const p of newPatterns) {
    const dup = session.globalDetections.some((d) => isDuplicate(d, p));
    if (!dup) {
      session.globalDetections.push(p);
      added.push(p);
    }
  }
  if (added.length > 0) {
    debug(`Merged ${added.length}/${newPatterns.length} new detections (${newPatterns.length - added.length} duplicates skipped)`);
  }
  return added;
}

// ─── Region tracking ─────────────────────────────────────────────────────────

/**
 * Mark a region as analyzed (prevents re-analysis of the same area).
 */
export function markRegionAnalyzed(
  session: ScanSession,
  region: AnalyzedRegion,
): void {
  session.analyzedRegions.push(region);
}

/**
 * Check if a given region overlaps significantly with any already-analyzed region.
 * Uses IoU > 0.5 threshold on normalized bboxes at similar scroll positions.
 */
export function isRegionAnalyzed(
  session: ScanSession,
  scrollY: number,
  bbox: [number, number, number, number],
): boolean {
  return session.analyzedRegions.some((r) => {
    const scrollClose = Math.abs(r.scrollY - scrollY) < 200;
    return scrollClose && bboxIoU(r.bbox, bbox) > 0.5;
  });
}

// ─── Interaction budget ──────────────────────────────────────────────────────

/**
 * Check whether the budget allows one more interaction at the given priority.
 */
export function canInteract(
  session: ScanSession,
  priority: 'high' | 'medium' | 'low',
): boolean {
  const budget = session.interactionBudget;
  const totalMax = budget.high + budget.medium + budget.low;
  if (budget.used >= totalMax) return false;

  // Count how many of this priority have been used
  const usedAtPriority = Array.from(session.visitedInteractions).filter((id) => {
    const candidate = session.interactionCandidates.find((c) => c.id === id);
    return candidate?.priority === priority;
  }).length;

  return usedAtPriority < budget[priority];
}

/**
 * Record that an interaction was visited.
 */
export function markInteractionVisited(
  session: ScanSession,
  interactionId: string,
): void {
  session.visitedInteractions.add(interactionId);
  session.interactionBudget.used += 1;
  debug(`Interaction visited: ${interactionId} (budget: ${session.interactionBudget.used}/${session.interactionBudget.high + session.interactionBudget.medium + session.interactionBudget.low})`);
}

// ─── Reasoning log ───────────────────────────────────────────────────────────

export function logReasoning(
  session: ScanSession,
  phase: number,
  action: string,
  input: string,
  output: string,
  durationMs?: number,
): void {
  session.reasoningLog.push({
    phase,
    action,
    input,
    output,
    timestamp: Date.now(),
    durationMs,
  });
}

// ─── Session summary ─────────────────────────────────────────────────────────

export interface SessionSummary {
  id: string;
  url: string;
  durationMs: number;
  viewportsCaptured: number;
  totalDetections: number;
  interactionsUsed: number;
  interactionBudgetMax: number;
  reasoningSteps: number;
  detectionsByType: Record<string, number>;
  detectionsBySeverity: Record<string, number>;
}

export function getSessionSummary(session: ScanSession): SessionSummary {
  const detections = session.verifiedDetections.length > 0
    ? session.verifiedDetections
    : session.globalDetections;

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const d of detections) {
    byType[d.type] = (byType[d.type] || 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
  }

  const budget = session.interactionBudget;
  return {
    id: session.id,
    url: session.url,
    durationMs: Date.now() - session.startedAt,
    viewportsCaptured: session.viewportCaptures.length,
    totalDetections: detections.length,
    interactionsUsed: budget.used,
    interactionBudgetMax: budget.high + budget.medium + budget.low,
    reasoningSteps: session.reasoningLog.length,
    detectionsByType: byType,
    detectionsBySeverity: bySeverity,
  };
}
