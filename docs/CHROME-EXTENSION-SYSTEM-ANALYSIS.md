# Chrome Extension — System Analysis (Dark Pattern Hunter)

This document describes how the **Dark Pattern Hunter** Chrome extension fits in the monorepo, how major features connect, and where data flows. It is written for developers and researchers extending detection, UI, or exports.

---

## 1. Role in the monorepo

The repository is **Dark Pattern Hunter**: visual-first tooling to detect and explain manipulative UI (“dark patterns”) on the web (and related automation stacks). The **Chrome extension** under `apps/chrome-extension/` is the in-browser surface: side panel UI, optional dataset collection, **Live Guard** real-time scanning, and integration with shared packages:

| Package | Role in extension |
|--------|-------------------|
| `@darkpatternhunter/core` | `callAIWithObjectResponse`, model action types |
| `@darkpatternhunter/shared` | logging, DB helpers, utilities |
| `@darkpatternhunter/web` / others | bridge, playground, recorder as bundled features |

Root **README** positions the product as VLM-driven; this extension implements **hybrid VLM + DOM grounding** for localization (see `docs/DOM-GROUNDING-ARCHITECTURE.md`).

---

## 2. Manifest and runtime shape (MV3)

Source: `apps/chrome-extension/static/manifest.json` (copied to `dist/` on build).

- **Permissions:** `activeTab`, `tabs`, `sidePanel`, `debugger`, `scripting`, `downloads`, `storage`, plus broad `host_permissions` for analysis targets.
- **Side panel:** default path `index.html` — main React app (modes: recorder, dataset, Live Guard, settings, etc.).
- **Background:** service worker `scripts/worker.js` — context cache, screenshot helpers, message stubs for Live Guard actions.
- **Content scripts:** `scripts/guard-highlighter.js` — **Live Guard** overlays on arbitrary pages (`<all_urls>`).

**Why `debugger`:** `Page.captureScreenshot` with `scaleFactor: 1` (see `src/utils/screenshotCapture.ts`) for stable, CSS-pixel-aligned images used by VLMs and bbox math.

**Why `scripting`:** injected functions for scroll, viewport lock, DOM snippets, clicks, and **batch DOM grounding** (`chrome.scripting.executeScript`).

---

## 3. Source layout (high-signal paths)

```
apps/chrome-extension/src/
├── extension/
│   ├── live-guard/          # Live Guard UI + scan orchestration
│   │   ├── index.tsx        # Phased scan, AI calls, messaging to content script
│   │   └── guardHighlighter.ts   # Content script: Shadow DOM overlays
│   ├── dataset-collection/  # Dataset UI, agent loop integration
│   ├── popup/               # Mode switcher, mounts Live Guard
│   └── recorder/            # Recording / bridge-related UI
├── utils/
│   ├── agentAnalysis.ts     # Phased agent: multi-viewport capture + VLM + DOM grounding
│   ├── autoLabeling.ts      # VLM auto-labels; optional DOM grounding before NMS
│   ├── domEvidenceGrounding.ts   # Shared evidence → bbox engine (injected + batch)
│   ├── analysisEngine.ts    # IndexedDB entry analysis (prompts, taxonomy)
│   ├── coordinateMapping.ts # Normalized VLM bbox → DOM + elementFromPoint snap
│   ├── datasetDB.ts         # AutoLabel, DatasetEntry, viewport_screenshots
│   ├── screenshotCapture.ts
│   └── yoloDarknetExport.ts # Training export paths
├── scripts/worker.ts        # Service worker source
└── hooks/, components/      # AI config, playground, etc.
```

Build: `rsbuild.config.ts` emits **web** bundles (side panel) and **iife** bundles (worker, guard-highlighter, etc.).

---

## 4. Taxonomy and AI outputs

**18 dark-pattern categories** are canonical across:

- `analysisEngine.ts` (`getDarkPatternPrompt`, `DARK_PATTERN_CATEGORIES`)
- `autoLabeling.ts` (`DARK_PATTERN_TAXONOMY`, strict auto-label prompt)
- Live Guard prompts in `live-guard/index.tsx`

Structured model output typically includes: **type/category**, **description**, **severity**, **location**, **evidence**, **confidence**, **bbox** (format depends on feature — see grounding doc).

---

## 5. Live Guard — end-to-end flow

**UI:** `extension/popup/index.tsx` → mode `live-guard` → `extension/live-guard/index.tsx`.

**Scan phases (simplified):**

1. **Viewport lock** — inject CSS so layout behaves like a fixed minimum width (e.g. 1280px) for consistent screenshots.
2. **Phase 0** — heuristic popup dismiss, scroll to top.
3. **Phase 1** — scroll by ~85% viewport height, capture up to N viewports; record `scrollY` and screenshot dimensions per capture.
4. **Phase 2** — for each capture: restore `scrollY`, optional DOM excerpt, **VLM analysis**, then **DOM grounding** on evidence (`groundPatternsWithDOM` from `utils/domEvidenceGrounding.ts`).
5. **Phase 3–4** — expand/accordion/select heuristics, re-capture, re-analyze + ground.
6. **Deduplicate**, then **`chrome.tabs.sendMessage`** with `SHOW_HIGHLIGHTS` and pattern list.

**Content script:** `guardHighlighter.ts` listens for `SHOW_HIGHLIGHTS`, `CLEAR_HIGHLIGHTS`, `FOCUS_PATTERN`. Overlays live in a **Shadow DOM** host on `document.body`, full document height.

**Highlight logic:**

- If **`bboxSource === 'dom'`** — bbox is applied as **direct document-space CSS pixels** (no normalized VLM mapping).
- Else — `coordinateMapping.getCanvasToDomCoords` (normalized 0–1000 → pixels, DPR, scroll metadata) plus optional **elementFromPoint** snap when the snapped element is not huge vs. the AI box.

---

## 6. Dataset and agent pipeline

**Agent loop:** `utils/agentAnalysis.ts` — `runAgentLoop(tabId, onProgress)`:

- Same broad phased idea as Live Guard (scan viewports, analyze, interact, re-analyze).
- **Vision path:** `autoLabelScreenshot` with **`domGrounding: { tabId, scrollY }`** so bboxes are **refined from evidence in the live DOM** and expressed in **viewport-relative pixels** (aligned to each screenshot).
- **DOM-only path:** `autoLabelDOMOnly` then **`groundAutoLabelsViewportRelative`** so labels gain boxes when evidence matches page text.

**Storage model:** `datasetDB.ts` — `DatasetEntry` with optional `viewport_screenshots[]` (each viewport = one training image; patterns carry bboxes relative to that image). **`AutoLabel`** may include **`bboxSource: 'dom' | 'vlm'`** for provenance.

**Offline analysis of stored entries:** `analysisEngine.ts` — screenshot + DOM excerpt + global model config; does not use the same injected grounding path as the live tab (entries are historical).

---

## 7. Coordinate systems (mental model)

| Space | Used for |
|--------|-----------|
| **VLM normalized 0–1000** | Legacy Live Guard model output; mapped via `coordinateMapping.ts` when `bboxSource !== 'dom'` |
| **Screenshot / viewport CSS px** | Debugger capture at `scaleFactor: 1`; agent/YOLO boxes per viewport image |
| **Document CSS px (mixed x/y in grounded Live Guard box)** | Grounding returns `left` (viewport-x) and `top + scrollY` (document-y) for overlay positioning in the highlighter |
| **Viewport-relative after `groundingBoxToViewportRelative`** | Dataset auto-labels after grounding for training exports |

Details and diagrams of the hybrid pipeline: **`docs/DOM-GROUNDING-ARCHITECTURE.md`**.

---

## 8. Build and install

```bash
cd apps/chrome-extension
pnpm run build
```

Output: `dist/` loadable as unpacked extension; pack script may emit `dark-pattern-hunter-extension-v*.zip`.

---

## 9. Limitations (honest)

- Text grounding does not see **shadow roots** inside components, **canvas**, or **cross-origin iframes** as first-class targets.
- **Evidence** quality drives hit rate; vague evidence falls back to **VLM bbox**.
- **Horizontal scroll** + mixed coordinate conventions can misalign edge cases; dataset path uses viewport-relative grounding explicitly.

---

## 10. Related documents

- **`docs/DOM-GROUNDING-ARCHITECTURE.md`** — evidence-based localization, APIs, and contracts.
- **`apps/chrome-extension/README.md`** — dev setup and directory notes.

---

*Last updated to reflect shared `domEvidenceGrounding` integration across Live Guard, `autoLabeling`, and `agentAnalysis`.*
