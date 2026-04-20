# Dark Pattern Hunter — Deep Application Documentation

This document describes the **Dark Pattern Hunter** monorepo at an architectural and operational level: what each major part does, how data flows between them, and how to build, configure, and troubleshoot the system.

---

## 1. Purpose and product scope

**Dark Pattern Hunter** is an AI-assisted toolkit for detecting deceptive UI patterns (“dark patterns”) in web pages. The primary deliverable in this repository is a **Chrome extension (Manifest V3)** that:

- Runs a **visual-language agent** over the active tab (screenshots + DOM context) to find suspicious UI elements.
- Supports **dataset collection** (labeling and export for training/evaluation).
- Provides **Live Guard** (continuous or on-demand checks with optional on-page highlighting via a content script).
- Integrates **Supabase** for authentication (email/password and Google sign-in).

The monorepo also contains **shared libraries** (`@darkpatternhunter/core`, `@darkpatternhunter/shared`) used by the extension and potentially by other apps (e.g. web, visualizer, recorder packages exist under `apps/` and `packages/`).

---

## 2. Repository layout (monorepo)

| Path | Role |
|------|------|
| `apps/chrome-extension/` | Main Chrome MV3 extension (side panel UI, service worker, content scripts, build via Rspack). |
| `packages/core/` | Published SDK-style package: dark pattern detection framework, AI model hooks, agent, device adapters (see `package.json` exports). |
| `packages/shared/` | Shared types/utilities consumed by apps. |
| `apps/web`, `apps/visualizer`, `apps/recorder`, `apps/android-playground` | Additional surfaces or demos; not required to run the Chrome extension. |
| `docs/` | Long-form documentation (this file). |

**Package manager:** `pnpm` with workspaces (`pnpm-workspace.yaml`: `apps/*`, `packages/*`).

**Task runner / graph:** Nx (`nx.json`, `project.json` per package). Common tasks are defined in root `package.json` (e.g. `pnpm nx run chrome-extension:build`).

---

## 3. Chrome extension — high-level architecture

### 3.1 Manifest and surfaces

Defined in `apps/chrome-extension/static/manifest.json`:

- **Manifest V3** (`manifest_version: 3`).
- **Side panel** (`side_panel.default_path`: `index.html`) — primary UI when the user opens the extension from the toolbar in a supported configuration.
- **Action** — toolbar button; title “Dark Pattern Hunter”.
- **Background** — `scripts/worker.js` (compiled from `src/scripts/worker.ts`): **service worker** for long-lived tasks, tab messaging, OAuth helper flows, and bridge-style RPC to content contexts.
- **Content scripts** — e.g. `scripts/guard-highlighter.js` injected on `<all_urls>` at `document_idle` for Live Guard overlays.

**Permissions (summary):** `activeTab`, `tabs`, `sidePanel`, `debugger`, `scripting`, `downloads`, `storage`, `identity`, plus broad `host_permissions` (including `https://*.supabase.co/*` and localhost for local LLM gateways).

**CSP:** Extension pages allow `'self'` and `'wasm-unsafe-eval'` for WebAssembly used by underlying libraries.

### 3.2 UI entry and routing

- **Rspack** bundles the side panel (and related chunks) from `apps/chrome-extension/src/index.tsx`, which mounts `App`.
- `App.tsx` renders `PlaygroundPopup` from `src/extension/popup/`.

The popup/side-panel shell (`extension/popup/index.tsx`) provides:

- **Mode switcher** (dropdown): Dataset Collection, Live Guard, Settings (with **role-based** visibility via `getAllowedModes(role)`).
- **Non-admin users** are steered toward **Live Guard** and **Settings** only; other modes fall back to Live Guard in `renderContent()`.
- **AI config bootstrap:** On load, reads stored OpenAI API key from `chrome.storage.local` and calls `safeOverrideAIConfig` with either OpenAI endpoints or a **local UI-TARS** preset (`http://localhost:8000/v1`, `MIDSCENE_VL_MODE: 'vlm-ui-tars'`).
- **Supabase session sync:** Listens to `chrome.storage.onChanged` for keys `supabaseSession` and the Supabase auth storage key (see `getSupabaseAuthStorageKey()` in `src/lib/supabaseClient.ts`) so the UI updates when the service worker completes OAuth.

### 3.3 Major feature modules (extension)

| Module | Location | Responsibility |
|--------|----------|----------------|
| **Dataset Collection** | `src/extension/dataset-collection/` | Collect runs, view history, export JSON/JSONL/training bundles, manage IndexedDB-backed dataset store. |
| **Live Guard** | `src/extension/live-guard/` | Configure and run on-page guarding; coordinates with highlighter; uses hybrid/VLM-oriented analysis path. |
| **Settings** | `src/extension/settings/` | API keys, auth (email/Google), role display, sign out. |
| **Env / model** | `src/extension/env/` | `EnvConfig` UI for model name and environment hints. |

Supporting utilities live under `src/utils/` (agent, auto-labeling, dataset DB, coordinate mapping, analysis engine, etc.) and `src/lib/` (Supabase client, auth, bridge messaging).

---

## 4. Service worker (`worker.ts`)

The background service worker is the **central hub** for:

1. **Installation / startup** — e.g. ensuring default side panel behavior, optional session restore hooks.
2. **Message routing** — `chrome.runtime.onMessage` listeners for actions such as:
   - `start-debugger`, `stop-debugger`, `debugger-status` (Chrome DevTools Protocol attachment for capture/analysis).
   - `call-action` / planning-style RPC used by the agent pipeline to run steps in the page context.
   - **Google OAuth** — `google-oauth-start`: opens `chrome.identity.launchWebAuthFlow` with the Supabase authorize URL; completion URL is parsed and exchanged for a session (PKCE path).
3. **Storage** — Writing refreshed `supabaseSession` and related keys so the UI can react without holding tokens only in memory.

**Important:** OAuth that depends on `chrome.identity` should run here (or complete here) because the redirect URL is tied to the extension ID and the flow must integrate with Chrome’s identity API.

---

## 5. Content scripts and Live Guard highlighting

- **Guard highlighter** bundle (`src/scripts/guard-highlighter.ts` → `guard-highlighter.js`) runs in the **page world** context as a content script.
- It listens for messages (e.g. highlight/clear) and draws overlays for detections **without** replacing the page’s own scripts.

**Live Guard** (`live-guard/index.tsx`) sends commands such as `DPH_GUARD_HIGHLIGHT` / `DPH_GUARD_CLEAR` with payload shapes defined in `src/extension/messaging/guardHighlighter.ts` (message types, rect conversion, scroll/viewport gating).

**Coordinate pipeline (conceptual):**

1. Model outputs often include **normalized bounding boxes** (e.g. 0–1 relative to screenshot/crop).
2. `coordinateMapping.ts` maps those to **viewport pixel rects** using scroll position, DPR, and optional “snap” logic.
3. **Viewport meta** (`getViewportMeta` and related helpers) supplies scroll dimensions, inner sizes, and safe caps when the DOM does not expose sane values — documented inline in code for deterministic behavior vs. heuristics.

---

## 6. Authentication (Supabase + Chrome)

### 6.1 Clients and storage

- `src/lib/supabaseClient.ts` creates the browser Supabase client with:
  - `flowType: 'pkce'` (required for reliable `chrome.identity.launchWebAuthFlow` completion — implicit/hash flows are fragile because the redirect often **strips the URL hash**).
  - A **custom auth storage adapter** backed by `chrome.storage.local` so sessions survive restarts consistently in the extension context.
- `getSupabaseAuthStorageKey()` aligns with Supabase’s `sb-<project-ref>-auth-token` pattern for cross-component listeners.

### 6.2 Google sign-in path

1. UI calls `signInWithGoogle()` in `src/lib/auth.ts`.
2. Extension sends a message to the service worker to start the flow.
3. Worker builds authorize URL (Supabase `/auth/v1/authorize` with `prompt=consent`, PKCE code challenge, redirect to `chrome.identity.getRedirectURL('supabase-auth')`).
4. `chrome.identity.launchWebAuthFlow` returns a redirect URL containing **`?code=`** (PKCE).
5. `googleIdentityOAuth.ts` parses the redirect; **`supabase.auth.exchangeCodeForSession`** establishes the session; session is persisted via the storage adapter.
6. Popup listens for storage changes to refresh UI.

**Operational checklist (Supabase dashboard):**

- Add the Chrome extension redirect URL to **Redirect URLs**:  
  `https://<extension-id>.chromiumapp.org/supabase-auth`  
  (exact value from `chrome.identity.getRedirectURL('supabase-auth')` on a loaded extension).
- Ensure **Google provider** is enabled and OAuth client credentials match your Google Cloud console (authorized redirect URIs must include Supabase’s callback if required by your setup).

### 6.3 Email/password

Handled via standard `signInWithPassword` / `signUp` on the same Supabase client, with errors surfaced in the Settings UI.

### 6.4 Roles

`src/lib/roles.ts` and `getAllowedModes` gate UI capabilities (e.g. admin vs non-admin). Session metadata or profile fields from Supabase may drive `role` in the popup.

---

## 7. Detection and analysis pipelines

### 7.1 Agent analysis (`src/utils/agentAnalysis.ts`)

Orchestrates **multi-phase** analysis of a tab: planning, execution of Midscene-style actions, screenshot capture, and consolidation into structured **dark pattern** results. It interacts with:

- **Debugger attachment** (service worker) for faithful rendering/capture when needed.
- **LLM/VLM** configuration injected via `safeOverrideAIConfig` (OpenAI vs local UI-TARS).

### 7.2 Hybrid / VLM-oriented path

The codebase includes a **hybrid** path that prefers **VLM-first** interpretation (screenshot + prompts) with **normalized bounding boxes**, optional light DOM grounding, **scroll/viewport gating**, and optional coordinate snap. Key touchpoints include:

- `analysisEngine.ts` — prompts and consolidation.
- `autoLabeling.ts` — automatic label proposals from model output.
- `coordinateMapping.ts` — bbox normalization → viewport mapping.
- Live Guard UI + `guardHighlighter.ts` — user-visible highlighting driven by mapped rects.

Exact prompt strings and phase counts evolve; treat `agentAnalysis.ts` and `analysisEngine.ts` as **source of truth** for behavior.

### 7.3 Effective patterns and labeling

`getEffectivePatterns` (and related helpers) merge **default pattern taxonomy** with **user overrides** from storage so exports and training labels reflect the curator’s taxonomy.

---

## 8. Dataset collection and persistence

### 8.1 Storage layer

`src/utils/datasetDB.ts` (Dexie/IndexedDB) stores:

- **Runs** — metadata for each collection/analysis session.
- **Snapshots / labels** — structures used for training and evaluation exports.

### 8.2 Exports

The Dataset UI exposes multiple export shapes, including:

- **Training-oriented JSON** — simplified label/bbox records suitable for fine-tuning pipelines.
- **Full JSON** — richer diagnostic payload.
- **Text JSONL** — line-delimited textual records for NLP-style tasks.
- **Bundle manifest** — describes packaged artifacts for reproducibility.

`collectTrainingLabels` and manifest fields (e.g. `labels` in bundles) should be kept aligned with the hybrid export contract when changing schema.

---

## 9. Messaging and “bridge” patterns

`src/lib/bridge.ts` (and related message types under `src/extension/messaging/`) define **typed RPC** between:

- Side panel / popup scripts
- Service worker
- Content scripts (injected or pre-declared)

Use these channels instead of ad-hoc `postMessage` when extending features so permissions and listeners stay centralized.

---

## 10. Build, run, and debug

### 10.1 Prerequisites

- Node.js compatible with the repo’s `engines` field (see root `package.json`).
- `pnpm` installed globally.

### 10.2 Install

```bash
pnpm install
```

### 10.3 Build the extension

From repository root:

```bash
pnpm nx run chrome-extension:build
```

Output is emitted under `apps/chrome-extension/dist/` (see `apps/chrome-extension/project.json` for `outputPath` and executor details).

### 10.4 Load unpacked

1. Open Chrome → **Extensions** → enable **Developer mode**.
2. **Load unpacked** → select `apps/chrome-extension/dist` (or the path your build writes to).
3. Pin the extension and open the **side panel** from the toolbar context menu if needed.

### 10.5 Local VLM (optional)

If no OpenAI key is stored, the popup defaults AI base URL to `http://localhost:8000/v1` with UI-TARS-style VL mode. You must run a compatible OpenAI-compatible server on that host.

### 10.6 Troubleshooting

| Symptom | Likely cause | Direction |
|---------|----------------|-----------|
| Google login completes but session missing | Redirect URL mismatch or hash-based implicit flow | Use PKCE path; verify Supabase redirect allowlist includes `chrome.identity` redirect. |
| Highlight offset / wrong boxes | DPR/scroll mismatch | Inspect `coordinateMapping.ts` and viewport meta defaults. |
| Empty exports | IndexedDB cleared or run not finalized | Check `datasetDB` transactions and UI export preconditions. |
| Debugger errors | Tab restrictions or missing permission | Confirm MV3 `debugger` permission and user gesture policies. |

---

## 11. Security and privacy notes

- The extension requests **broad host access** to analyze arbitrary sites; treat stored **API keys** and **Supabase sessions** as sensitive (`chrome.storage.local` is not encrypted at rest by Chrome).
- **Incognito** behavior is `split` in the manifest — separate extension state from normal windows; document for users if you ship publicly.
- Prefer **minimal retention** of screenshots and DOM dumps in dataset exports when sharing artifacts.

---

## 12. Key file index (quick reference)

| Concern | Files |
|---------|--------|
| Manifest | `apps/chrome-extension/static/manifest.json` |
| Service worker | `apps/chrome-extension/src/scripts/worker.ts` |
| Side panel UI shell | `apps/chrome-extension/src/extension/popup/index.tsx` |
| Supabase + PKCE storage | `apps/chrome-extension/src/lib/supabaseClient.ts` |
| Google OAuth helpers | `apps/chrome-extension/src/lib/googleIdentityOAuth.ts`, `auth.ts` |
| Agent orchestration | `apps/chrome-extension/src/utils/agentAnalysis.ts` |
| Analysis / prompts | `apps/chrome-extension/src/utils/analysisEngine.ts` |
| Coordinates | `apps/chrome-extension/src/utils/coordinateMapping.ts` |
| Dataset DB / exports | `apps/chrome-extension/src/utils/datasetDB.ts` |
| Live Guard | `apps/chrome-extension/src/extension/live-guard/index.tsx` |
| Highlighter protocol | `apps/chrome-extension/src/extension/messaging/guardHighlighter.ts` |
| Core SDK (external API) | `packages/core/src/**`, `packages/core/package.json` exports |

---

## 13. Maintaining this document

When you change:

- **Manifest permissions** or new surfaces → update §3 and §11.
- **Auth flows** → update §6 and Supabase checklist.
- **Export schemas** → update §8 and any consumer docs.
- **New major modules** → add a row to §3.3 and §12.

For a shorter user-facing overview, keep `apps/chrome-extension/README.md` aligned with shipped features and modes.
