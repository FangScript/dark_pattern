# Live Guard Module - Deep Technical Documentation

This document is the source of truth for the Live Guard implementation in this repo.

---

## 1) What Live Guard Does

Live Guard is the extension-side safety module that detects dark patterns on the active webpage and overlays visual warnings.

High-level capability:

- scans multiple page viewports,
- runs VLM inference per viewport screenshot,
- converts model boxes to on-page overlays,
- provides side-panel interaction (focus, clear, progress),
- supports real-time analyst workflow (scan -> inspect -> focus).

---

## 2) Current Locked Detection Pipeline

Current product decision:

`Screenshot -> VLM -> normalized bbox -> mapping -> highlight`

Explicitly **not** in this pipeline:

- no DOM grounding,
- no evidence matching,
- no `element_hint`,
- no heavy post-grounding confidence pass.

Allowed post-process:

- optional **light snap** in content script only (safe/local geometry refinement).

---

## 3) File Map

### Core module files

- Side panel module:  
  `apps/chrome-extension/src/extension/live-guard/index.tsx`
- Content script highlighter:  
  `apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts`
- Side panel styles:  
  `apps/chrome-extension/src/extension/live-guard/index.less`

### Dependencies used by module

- Prompt + taxonomy source:  
  `apps/chrome-extension/src/utils/analysisEngine.ts`
- AI provider/model config:  
  `apps/chrome-extension/src/utils/aiConfig.ts`
- AI config readiness hook:  
  `apps/chrome-extension/src/hooks/useGlobalAIConfig.ts`
- Screenshot capture:  
  `apps/chrome-extension/src/utils/screenshotCapture.ts`
- Extension wiring / content script registration:  
  `apps/chrome-extension/static/manifest.json`

---

## 4) Runtime Topology

Live Guard runs across two execution contexts:

1. **Extension side panel (React)**  
   Handles scan orchestration, AI calls, pattern list UI.
2. **Webpage content script (Shadow DOM renderer)**  
   Receives pattern list and renders overlays/masks/focus behavior.

Bridge between them:

- `chrome.tabs.sendMessage(...)` with Live Guard action messages.

---

## 5) Message Contract

### Message names

- `live-guard-show-highlights`
- `live-guard-clear-highlights`
- `live-guard-focus-pattern`
- `live-guard-unfocus-pattern`

### Typical payload for show

```ts
{
  action: "live-guard-show-highlights",
  patterns: DetectedPattern[],
  isNormalized: true
}
```

### `DetectedPattern` shape used at runtime

- `type: string`
- `description: string`
- `severity: 'low' | 'medium' | 'high' | 'critical'`
- `location: string`
- `evidence: string`
- `confidence: number`
- `bbox?: [x, y, w, h]` (normalized 0..1000 after coercion)
- `bboxSource?: 'vlm' | 'dom'` (`vlm` for current flow)
- `counterMeasure: string`
- `scrollY?: number` (capture scroll origin)
- `screenshotSize?: { width; height }`
- `viewportWidth?: number`
- `viewportHeight?: number`
- `viewportIndex?: number`
- `viewportId?: string`

---

## 6) Scan Lifecycle (Side Panel)

Entry function:

- `analyzeCurrentPage()` in `index.tsx`

### Phase breakdown

1. **Readiness check**  
   Validates provider/model/API readiness via `useGlobalAIConfig`.
2. **Viewport normalization prep**  
   Injects CSS to lock minimum width to `TARGET_VIEWPORT_WIDTH=1280`.
3. **Phase 0 - cleanup**  
   Dismisses common popups and scrolls top.
4. **Phase 1 - capture**  
   Scroll-captures viewport images (`MAX_VIEWPORTS=5`, `SCROLL_STEP=0.9`).
5. **Early stop controls**  
   Stops near bottom or on near-duplicate screenshot similarity (`>0.98`).
6. **Phase 2 - analyze each capture**  
   Calls model with screenshot and strict bbox instructions.
7. **Phase 3/4 - interaction expansion**  
   Finds likely expand/dropdown/accordion controls, clicks, rescans.
8. **Finalize**  
   Deduplicates patterns, stores in panel state, sends to content script.

---

## 7) AI Prompt Contract (Most Critical)

Live Guard requests strict JSON and strict bbox behavior:

- box format: `[x1, y1, x2, y2]` normalized `0..1000`
- must be tight and specific to deceptive UI element
- must avoid full-screen/container-style boxes
- minimum geometry expectation enforced in prompt

Call path:

- `callAIWithObjectResponse(..., AIActionType.EXTRACT_DATA, modelConfig)`

System prompt base:

- `getDarkPatternPrompt('english')`

---

## 8) BBox Coercion Rules

Function:

- `coerceLiveGuardBbox(...)` in `index.tsx`

Current behavior:

1. validates shape (`length === 4`) and finite numbers,
2. repairs inverted axes (`x2 < x1`, `y2 < y1`),
3. clamps all values to `[0,1000]`,
4. computes width/height,
5. rejects likely garbage:
   - too small (`<10`),
   - too large (`>900`),
6. emits normalized `[x, y, w, h]` for mapping.

Returned `null` boxes are dropped from final pattern list.

---

## 9) Coordinate Mapping Model (Content Script)

Reference file:

- `guardHighlighter.ts`

### Mapping math

Given normalized `[x, y, w, h]` and capture viewport size:

- `px = (x / 1000) * viewportWidth`
- `py = (y / 1000) * viewportHeight`
- `pw = (w / 1000) * viewportWidth`
- `ph = (h / 1000) * viewportHeight`

Document anchoring:

- `docLeft = px`
- `docTop = py + scrollY` (capture origin)

Rendering uses stored document coordinates and converts to client coordinates on scroll:

- `left = docLeft - window.scrollX`
- `top = docTop - window.scrollY`

---

## 10) Overlay Renderer Architecture

### Shadow host

- id: `live-guard-shadow-host`
- `position: fixed`
- viewport-sized
- high z-index

Why fixed host:

- keeps client-space rendering stable while source rectangles remain document-space.

### Elements rendered

- one highlight per pattern (`.live-guard-highlight`) or badge fallback,
- optional tooltip on hover,
- 4-piece blur mask for focus mode (`.live-guard-focus-mask`).

---

## 11) Focus UX (Current Behavior)

Side panel pattern cards trigger:

- `onMouseEnter` -> `FOCUS_PATTERN`
- `onMouseLeave` -> `UNFOCUS_PATTERN`

Content script focus behavior:

- shows only selected highlight,
- dims/blurs rest of viewport with 4 mask panes,
- applies emphasized style to focused box.

Unfocus behavior:

- removes blur mask,
- restores all highlights visibility.

Important note:

- focus navigation currently uses highlight `scrollIntoView` behavior (overlay-based), which may vary by page context.

---

## 12) Deduplication Logic

Current dedupe in `index.tsx`:

- same `type`,
- `|scrollY diff| < 200`,
- bbox overlap threshold `> 0.6`.

Goal:

- remove repeated detections across adjacent captures while retaining distinct instances.

---

## 13) Screenshot Capture Fidelity

Capture utility:

- `captureTabScreenshot(tabId)`

Primary path:

- Chrome Debugger API: `Page.captureScreenshot`
- uses `scaleFactor: 1`

Why:

- keeps model-visible pixel geometry aligned with post-mapping assumptions.

Fallback:

- `chrome.tabs.captureVisibleTab(...)` if debugger capture fails.

---

## 14) Configuration and Model Selection

Model config source:

- `getActiveModelConfig()` in `aiConfig.ts`

Supported providers:

- OpenAI
- OpenRouter
- Local OpenAI-compatible endpoint (LM Studio style)

Readiness checks:

- done by `useGlobalAIConfig` (provider-specific requirements + local server reachability).

---

## 15) Manifest and Injection

`manifest.json` registers:

- side panel host page,
- content script `scripts/guard-highlighter.js` on `<all_urls>`,
- required permissions (`tabs`, `scripting`, `debugger`, `storage`, etc.).

Injection timing:

- `run_at: document_idle`.

---

## 16) Error Handling and Fallbacks

### In scanning

- missing active tab -> hard fail with message,
- per-viewport capture/analyze failures -> logged and continue where possible,
- model call failures -> empty array for that viewport.

### In rendering

- invalid/missing bbox -> badge fallback,
- missing metadata -> best-effort mapping using viewport defaults.

---

## 17) Debugging Playbook

If highlights are wrong:

1. verify `bbox` values are sane (`x,y,w,h` within 0..1000),
2. verify pattern has correct `scrollY` from capture,
3. confirm viewport dimensions from capture metadata,
4. inspect `dataset.docTop/docLeft` on generated highlight nodes,
5. compare expected client position after scroll conversion.

If too many duplicate detections:

1. inspect screenshot similarity cutoff behavior (`>0.98`),
2. adjust dedupe overlap and scroll thresholds,
3. verify interaction rescans are not creating near-identical snapshots.

If focus behaves unexpectedly:

1. inspect `FOCUS_PATTERN` and `UNFOCUS_PATTERN` message traffic,
2. confirm selected index exists in `currentHighlights`,
3. inspect focus mask rect calculations in viewport bounds.

---

## 18) QA Checklist

Use this after Live Guard changes:

1. Build extension (`pnpm run build`).
2. Reload extension in browser.
3. Scan a long page (top/middle/bottom content).
4. Confirm bboxes visible after scan.
5. Hover each card:
   - only target bbox visible,
   - blur mask active outside target.
6. Hover leave:
   - blur clears,
   - all bboxes visible again.
7. Validate multiple provider modes (OpenAI/local/OpenRouter).
8. Validate at least one dynamic page with expanding sections.

---

## 19) Known Constraints / Risks

1. `scrollIntoView` focus navigation can be page-dependent.
2. Interactive click heuristics may trigger non-target actions on noisy UIs.
3. VLM bbox quality remains the dominant quality factor.
4. Very heavy pages may cause capture timing variability.

---

## 20) Ownership Guide

If you need to change:

- prompt quality / bbox strictness -> `live-guard/index.tsx` prompt block
- scan depth and capture behavior -> `live-guard/index.tsx` constants and phase loop
- bbox geometry and rendering -> `live-guard/guardHighlighter.ts`
- provider/model behavior -> `utils/aiConfig.ts`
- capture behavior -> `utils/screenshotCapture.ts`
- injection and permissions -> `static/manifest.json`

---

## 21) Related Docs

- `apps/chrome-extension/LIVE_GUARD_BBOX_ALIGNMENT.md` (targeted alignment fix note)


