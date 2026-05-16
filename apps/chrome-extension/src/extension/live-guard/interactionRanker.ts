/**
 * Live Guard — Interaction Ranker
 *
 * Replaces dumb "click first 5" with keyword-based priority ranking.
 * Zero VLM calls — pure DOM/keyword analysis.
 */

import { getDebug } from '@darkpatternhunter/shared/logger';
import type { DetectedPattern, RankedInteraction } from './scanSession';

const debug = getDebug('live-guard:ranker');

// ─── Priority keywords ──────────────────────────────────────────────────────

const HIGH_KEYWORDS = [
  'price','pricing','cost','fee','charge','checkout','pay','payment','order',
  'subscribe','subscription','trial','free trial','add to cart','buy now',
  'purchase','terms','conditions','privacy','cancel','unsubscribe','opt out',
  'hidden','fine print','billing','recurring','auto-renew','total','subtotal',
  'tax','shipping',
];

const MEDIUM_KEYWORDS = [
  'see more','show more','view all','view more','read more','load more',
  'expand','show details','learn more','compare','options','select plan',
  'choose','upgrade','premium','pro','offer','deal','discount','coupon',
];

const LOW_KEYWORDS = [
  'about','contact','help','faq','support','blog','careers','press',
  'sitemap','social','share','follow','tweet','facebook','instagram',
];

// ─── Scoring ─────────────────────────────────────────────────────────────────

interface RawInteraction {
  description: string;
  type: string;
  scrollY: number;
  selector?: string;
}

function scoreInteraction(
  raw: RawInteraction,
  detections: DetectedPattern[],
): { priority: 'high' | 'medium' | 'low'; reason: string } {
  const text = raw.description.toLowerCase();

  for (const kw of HIGH_KEYWORDS) {
    if (text.includes(kw)) return { priority: 'high', reason: `Keyword: "${kw}"` };
  }
  for (const kw of MEDIUM_KEYWORDS) {
    if (text.includes(kw)) return { priority: 'medium', reason: `Keyword: "${kw}"` };
  }

  // Proximity boost: near an existing detection → medium
  if (detections.some(d => Math.abs((d.scrollY ?? 0) - raw.scrollY) < 500)) {
    return { priority: 'medium', reason: 'Near existing detection' };
  }

  // Type-based boost
  if (['checkout', 'pricing', 'modal'].includes(raw.type)) {
    return { priority: 'high', reason: `Type: ${raw.type}` };
  }
  if (['accordion', 'expand'].includes(raw.type)) {
    return { priority: 'medium', reason: `Type: ${raw.type}` };
  }

  for (const kw of LOW_KEYWORDS) {
    if (text.includes(kw)) return { priority: 'low', reason: `Low-value: "${kw}"` };
  }

  return { priority: 'low', reason: 'No dark-pattern-relevant keywords' };
}

function fingerprint(raw: RawInteraction): string {
  return `${raw.type}:${raw.description.toLowerCase().trim().substring(0, 40)}:${Math.round(raw.scrollY / 100)}`;
}

// ─── Main ranker ─────────────────────────────────────────────────────────────

export function rankInteractions(
  rawElements: RawInteraction[],
  existingDetections: DetectedPattern[],
): RankedInteraction[] {
  const ranked: RankedInteraction[] = rawElements.map((raw) => {
    const { priority, reason } = scoreInteraction(raw, existingDetections);
    return {
      id: fingerprint(raw),
      description: raw.description,
      type: raw.type as RankedInteraction['type'],
      priority,
      reason,
      selector: raw.selector,
      scrollY: raw.scrollY,
    };
  });

  const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
  ranked.sort((a, b) => {
    const pDiff = (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
    return pDiff !== 0 ? pDiff : a.scrollY - b.scrollY;
  });

  debug(`Ranked ${ranked.length} interactions:`,
    ranked.map(r => `[${r.priority}] "${r.description}" (${r.reason})`));

  return ranked;
}

// ─── Enhanced in-tab discovery function ──────────────────────────────────────

/**
 * Designed to run inside chrome.scripting.executeScript.
 * Discovers interactive elements with scrollY for ranking.
 */
export const discoverInteractiveElementsInTab = (): Array<{
  description: string; type: string; scrollY: number; selector: string;
}> => {
  const found: Array<{ description: string; type: string; scrollY: number; selector: string }> = [];
  const seen = new Set<string>();

  const addUnique = (desc: string, type: string, el: Element) => {
    const key = `${type}:${desc.toLowerCase().trim().substring(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scrollY = Math.round(window.scrollY + rect.top);
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = Array.from(el.classList).slice(0, 2).map(c => `.${c}`).join('');
    found.push({ description: desc.substring(0, 60), type, scrollY, selector: `${tag}${id}${cls}` });
  };

  const expandKW = ['see more','show more','view all','view more','read more','load more','expand','show details','learn more'];
  const pricingKW = ['price','pricing','checkout','pay','subscribe','trial','buy now','add to cart','purchase','order now','terms','conditions','cancel','billing','total','fee','charge','cost'];

  const clickables = Array.from(document.querySelectorAll('button,a,[role="button"],details>summary,[onclick],[data-action]'));
  for (const el of clickables) {
    const text = (el.textContent || '').trim().toLowerCase();
    if (text.length > 80 || text.length === 0) continue;
    for (const kw of pricingKW) {
      if (text.includes(kw)) {
        const t = ['checkout','pay','purchase','order now','buy now'].some(k => text.includes(k)) ? 'checkout' : 'pricing';
        addUnique(text.substring(0, 60), t, el);
        break;
      }
    }
    for (const kw of expandKW) {
      if (text.includes(kw)) { addUnique(text.substring(0, 60), 'expand', el); break; }
    }
  }

  for (const d of Array.from(document.querySelectorAll('details:not([open])'))) {
    const s = d.querySelector('summary');
    if (s) { const t = (s.textContent || '').trim(); if (t.length > 0 && t.length <= 80) addUnique(t.substring(0, 60), 'accordion', s); }
  }
  for (const s of Array.from(document.querySelectorAll('select'))) {
    const lbl = s.getAttribute('aria-label') || s.name || '';
    if (lbl) addUnique(lbl.substring(0, 60), 'dropdown', s);
  }
  for (const el of Array.from(document.querySelectorAll('[data-toggle="modal"],[data-bs-toggle="modal"]'))) {
    const text = (el.textContent || '').trim();
    if (text.length > 0 && text.length <= 80) addUnique(text.substring(0, 60), 'modal', el);
  }

  return found.slice(0, 15);
};
