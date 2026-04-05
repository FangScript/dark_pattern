# DOM Grounding Architecture — Hybrid VLM + Browser Layout

This document explains the **research-oriented localization strategy**: the vision-language model (VLM) is asked primarily for **what** (category + evidence text); the **browser** supplies **where** (layout boxes from the live DOM). VLM **bounding boxes** are **fallback** when grounding fails or evidence does not match visible text.

---

## 1. Design principle

| Approach | Localization error profile |
|----------|----------------------------|
| VLM-only bbox | Often tens of pixels off; inconsistent across viewports |
| **Evidence + DOM** | Tight alignment to real nodes when text matches |

**Rule of thumb:** Do not trust the model’s pixel coordinates as the sole source of truth when the page’s DOM is available and evidence is textual.

---

## 2. Shared implementation

**Module:** `apps/chrome-extension/src/utils/domEvidenceGrounding.ts`

### 2.1 Injected function: `locateEvidenceBatchInPage`

- **Runs in the page world** (passed to `chrome.scripting.executeScript` as `func`).
- **Must be self-contained** — no closure over extension variables.
- **Algorithm (summary):**
  - For each evidence string, build **needle candidates**: full trimmed string → first long token → two-word phrase.
  - `TreeWalker` over `document.body` text nodes; case-insensitive `includes` matching.
  - Climb from text parent to a node with minimum **client** width/height.
  - Skip elements with `display: none` or `visibility: hidden`.
  - Score candidates: bonus for full-string match in node text, plus area, minus distance to viewport center; keep best element per needle tier (stop at first tier with hits).
- **Return shape per match:** `[left, top + scrollY, width, height]` using `getBoundingClientRect()`:
  - `left` is **viewport-relative X** (client rect).
  - `top + scrollY` is **document Y** (page scroll).

This mixed form matches how **Live Guard** already positioned VLM-snapped overlays (`rect.left`, `rect.top + scrollY`).

### 2.2 `groundPatternsWithDOM(tabId, patterns)`

- Used by **Live Guard** after each viewport’s VLM response (with tab already scrolled to that viewport’s `scrollY`).
- One **`executeScript`** per batch of patterns.
- On success: sets **`pattern.bbox`** to the grounding rectangle above and **`bboxSource: 'dom'`**.
- On failure: keeps original VLM **`bbox`**, sets **`bboxSource: 'vlm'`**.

### 2.3 `groundingBoxToViewportRelative(box, scrollY, imgW, imgH)`

- Converts grounding output to **viewport-relative** pixels for a screenshot of size `imgW × imgH`:
  - `y_viewport = box[1] - scrollY` (undo document Y).
  - `x_viewport = box[0]` (client left).
- **Clamps** intersection to the image; rejects boxes smaller than 10×10 px after clamp.

### 2.4 `groundAutoLabelsViewportRelative(tabId, labels, scrollY, imgW, imgH)`

- Used by the **dataset agent** and (indirectly) **`autoLabelScreenshot`** when DOM grounding is enabled.
- Returns **`AutoLabel[]`** with updated **`bbox`** and **`bboxSource`** when grounding + clamp succeed.

---

## 3. Live Guard integration

**File:** `extension/live-guard/index.tsx`

- After `analyzeViewport` returns patterns, calls **`groundPatternsWithDOM(tabId, patterns)`** (Phase 2 and Phase 4).
- **Critical invariant:** `scrollToY(tabId, cap.scrollY)` runs **before** DOM read and grounding so layout matches the captured viewport.

**File:** `extension/live-guard/guardHighlighter.ts`

- If **`bboxSource === 'dom'`** and bbox is valid → overlay **`left` / `top` / `width` / `height`** from **`pattern.bbox` directly** — **no** `getCanvasToDomCoords`, **no** second addition of `scrollY`.
- Otherwise → existing normalized VLM mapping + optional `elementFromPoint` snap.

**Message:** `SHOW_HIGHLIGHTS` may mix patterns; per-pattern **`bboxSource`** drives the branch. Global `isNormalized` is adjusted per pattern when building overlay metadata (`isNormalized: false` for DOM-sourced boxes).

---

## 4. Dataset / auto-labeling integration

**File:** `utils/autoLabeling.ts`

- **`autoLabelScreenshot(screenshot, dom?, modelName?, domGrounding?)`**
  - Optional **`domGrounding: { tabId, scrollY }`**.
  - Flow: VLM → validate bboxes → **`groundAutoLabelsViewportRelative`** → **NMS** → cap count.
  - Ensures deduplication (**NMS**) runs on **post-grounding** boxes.

**Prompt:** Evidence field described as **verbatim or near-verbatim visible UI text** to improve grounding hit rate.

**File:** `utils/agentAnalysis.ts`

- **`analyzeScreenshot(..., scrollY)`** passes **`scrollY`** from each viewport capture (phase 2) or current meta (phase 4) into:
  - **`autoLabelScreenshot(..., { tabId, scrollY })`** for vision, or
  - **`groundAutoLabelsViewportRelative`** after **`autoLabelDOMOnly`**.

**Schema:** `datasetDB.AutoLabel` includes optional **`bboxSource?: 'dom' | 'vlm'`** for exports and auditing.

---

## 5. Data contracts (quick reference)

| Consumer | Bbox space | `bboxSource` |
|----------|------------|----------------|
| Live Guard overlay (DOM) | Document-anchored CSS px (see §2.1) | `dom` |
| Live Guard overlay (fallback) | Normalized 0–1000 → mapped | `vlm` |
| `AutoLabel` after agent grounding | Viewport-relative vs. screenshot | `dom` or `vlm` |

---

## 6. Failure modes and fallbacks

1. **No text match** → keep VLM bbox, `bboxSource: 'vlm'`.
2. **Evidence too generic** → wrong or first match; mitigated by scoring; future: stricter evidence prompts or multi-match UI.
3. **Element off-screen / clamp removes box** → fallback to VLM bbox.
4. **Icons, images of text, canvas** → usually no text node; VLM fallback.
5. **`executeScript` blocked (CSP, permissions)** → all patterns treated as `vlm` where applicable.

---

## 7. Performance

- **Batch:** one injection per viewport / per batch of labels (not one script per pattern).
- **Future:** content-script single round-trip, or worker orchestration, if profiling shows hot paths on heavy pages.

---

## 8. Out of scope (current code)

- **Stored dataset re-analysis** (`analysisEngine.ts`) does not re-run live tab grounding (no live `tabId` for that entry).
- **dataset-collection** direct calls to `autoLabelScreenshot` without `domGrounding` remain VLM-only unless wired with `tabId` + `scrollY`.

---

*This architecture is the intended “publishable” differentiator: hybrid **semantic evidence** + **geometric DOM truth** instead of VLM-only localization.*
