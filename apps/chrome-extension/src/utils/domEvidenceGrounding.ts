/**
 * Evidence → DOM bbox grounding (injected TreeWalker + batch executeScript).
 * Used by Live Guard (document-mixed coords for overlay) and dataset agent (viewport-relative bboxes).
 */

import type { AutoLabel } from './datasetDB';

export type BboxSource = 'dom' | 'vlm';

/**
 * Runs in the isolated world of the target page. Do not reference extension scope.
 */
export function locateEvidenceBatchInPage(
  evidenceStrings: string[],
): Array<[number, number, number, number] | null> {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;

  function isElementVisible(el: Element): boolean {
    const st = window.getComputedStyle(el as HTMLElement);
    return st.display !== 'none' && st.visibility !== 'hidden';
  }

  function climbToMinSize(start: HTMLElement | null): HTMLElement | null {
    let cur: HTMLElement | null = start;
    while (cur && cur !== document.body) {
      const r = cur.getBoundingClientRect();
      if (r.width >= 24 && r.height >= 12) {
        return cur;
      }
      cur = cur.parentElement;
    }
    return start;
  }

  function locateOne(evidenceRaw: string): [number, number, number, number] | null {
    const trimmed = evidenceRaw.trim();
    if (!trimmed) {
      return null;
    }
    const lowerFull = trimmed.toLowerCase();
    const words = lowerFull.split(/\s+/).filter((w) => w.length > 2);
    const needles: string[] = [lowerFull];
    if (words[0] && words[0] !== lowerFull) {
      needles.push(words[0]);
    }
    if (words.length >= 2) {
      const pair = `${words[0]} ${words[1]}`;
      if (!needles.includes(pair)) {
        needles.push(pair);
      }
    }

    const scores = new Map<Element, number>();

    for (const needle of needles) {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
      );
      let node: Node | null = walker.nextNode();
      while (node) {
        const tc = (node.textContent || '').toLowerCase();
        if (tc.includes(needle)) {
          let el: HTMLElement | null = node.parentElement;
          if (el) {
            el = climbToMinSize(el) || el;
            if (isElementVisible(el)) {
              const rect = el.getBoundingClientRect();
              if (rect.width >= 20 && rect.height >= 10) {
                const area = rect.width * rect.height;
                const mx = rect.left + rect.width / 2;
                const my = rect.top + rect.height / 2;
                const dist = Math.hypot(mx - cx, my - cy);
                const exactBonus = tc.includes(lowerFull) ? 1e6 : 0;
                const score = exactBonus + area - dist * 2;
                const prev = scores.get(el) ?? -Infinity;
                if (score > prev) {
                  scores.set(el, score);
                }
              }
            }
          }
        }
        node = walker.nextNode();
      }
      if (scores.size > 0) {
        break;
      }
    }

    if (scores.size === 0) {
      return null;
    }

    let bestEl: Element | null = null;
    let bestScore = -Infinity;
    for (const [el, sc] of scores) {
      if (sc > bestScore) {
        bestScore = sc;
        bestEl = el;
      }
    }
    if (!bestEl) {
      return null;
    }
    const r = (bestEl as HTMLElement).getBoundingClientRect();
    const sy = window.scrollY || document.documentElement.scrollTop || 0;
    return [
      Math.round(r.left),
      Math.round(r.top + sy),
      Math.round(r.width),
      Math.round(r.height),
    ];
  }

  return evidenceStrings.map((s) => locateOne(s));
}

function clampViewportBbox(
  x: number,
  y: number,
  w: number,
  h: number,
  imgW: number,
  imgH: number,
): [number, number, number, number] | null {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(x + w, imgW);
  const y1 = Math.min(y + h, imgH);
  const w0 = x1 - x0;
  const h0 = y1 - y0;
  if (w0 < 10 || h0 < 10) {
    return null;
  }
  return [Math.round(x0), Math.round(y0), Math.round(w0), Math.round(h0)];
}

/**
 * Convert grounding output [left, docY, w, h] to bbox relative to viewport screenshot (scale 1).
 */
export function groundingBoxToViewportRelative(
  box: [number, number, number, number],
  scrollY: number,
  imgW: number,
  imgH: number,
): [number, number, number, number] | null {
  const [left, docTop, w, h] = box;
  const yVp = docTop - scrollY;
  return clampViewportBbox(left, yVp, w, h, imgW, imgH);
}

export async function groundAutoLabelsViewportRelative(
  tabId: number,
  labels: AutoLabel[],
  scrollY: number,
  imgWidth: number,
  imgHeight: number,
): Promise<AutoLabel[]> {
  if (labels.length === 0) {
    return labels;
  }

  const evidenceList = labels.map((p) => (p.evidence || '').trim());

  let row: Array<[number, number, number, number] | null> | undefined;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: locateEvidenceBatchInPage,
      args: [evidenceList],
    });
    row = results[0]?.result as
      | Array<[number, number, number, number] | null>
      | undefined;
  } catch {
    return labels.map((l) => ({ ...l, bboxSource: 'vlm' as BboxSource }));
  }

  if (!row || row.length !== labels.length) {
    return labels.map((l) => ({ ...l, bboxSource: 'vlm' as BboxSource }));
  }

  return labels.map((l, i) => {
    const b = row![i];
    if (!b) {
      return { ...l, bboxSource: 'vlm' as BboxSource };
    }
    const vp = groundingBoxToViewportRelative(b, scrollY, imgWidth, imgHeight);
    if (vp) {
      return { ...l, bbox: vp, bboxSource: 'dom' as BboxSource };
    }
    return { ...l, bboxSource: 'vlm' as BboxSource };
  });
}

export async function groundPatternsWithDOM<
  T extends {
    evidence: string;
    bbox?: [number, number, number, number];
    bboxSource?: BboxSource;
  },
>(tabId: number, patterns: T[]): Promise<T[]> {
  if (patterns.length === 0) {
    return patterns;
  }

  const evidenceList = patterns.map((p) => (p.evidence || '').trim());

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: locateEvidenceBatchInPage,
      args: [evidenceList],
    });

    const row = results[0]?.result as
      | Array<[number, number, number, number] | null>
      | undefined;

    if (!row || row.length !== patterns.length) {
      return patterns.map((p) =>
        Object.assign({}, p, { bboxSource: 'vlm' as BboxSource }),
      );
    }

    return patterns.map((p, i) => {
      const b = row[i];
      const ok =
        b &&
        b.length === 4 &&
        Number.isFinite(b[0]) &&
        Number.isFinite(b[1]) &&
        Number.isFinite(b[2]) &&
        Number.isFinite(b[3]) &&
        b[2] > 0 &&
        b[3] > 0;
      if (ok) {
        return Object.assign({}, p, {
          bbox: b,
          bboxSource: 'dom' as BboxSource,
        });
      }
      return Object.assign({}, p, { bboxSource: 'vlm' as BboxSource });
    });
  } catch {
    return patterns.map((p) =>
      Object.assign({}, p, { bboxSource: 'vlm' as BboxSource }),
    );
  }
}
