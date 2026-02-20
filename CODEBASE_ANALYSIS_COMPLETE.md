# Complete Codebase Analysis - Dark Pattern Hunter (Midscene.js)

## Executive Summary

**Dark Pattern Hunter** (formerly Midscene.js) is a visual-driven AI automation framework that enables browser, Android, and iOS automation using natural language and visual understanding. The codebase is a **monorepo** built with TypeScript, React, and modern build tools.

**Current Version:** 0.30.8  
**Package Manager:** pnpm 9.3.0  
**Node.js:** >=18.19.0  
**License:** MIT

---

## 🏗️ Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dark Pattern Hunter                       │
│                    (Monorepo Structure)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Apps       │  │   Packages   │  │   Shared      │     │
│  │              │  │              │  │   Utilities   │     │
│  │ • Extension  │  │ • Core       │  │               │     │
│  │ • Playground │  │ • Web        │  │               │     │
│  │ • Report     │  │ • Visualizer │  │               │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘     │
│         │                  │                  │               │
│         └──────────────────┼──────────────────┘              │
│                            │                                   │
│                    ┌───────▼────────┐                          │
│                    │  Core Engine    │                          │
│                    │  (Agent + AI)   │                          │
│                    └───────┬────────┘                          │
│                            │                                   │
│         ┌──────────────────┼──────────────────┐              │
│         │                  │                  │               │
│  ┌──────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐        │
│  │   Web       │  │   Android    │  │     iOS      │        │
│  │ Integration │  │ Integration  │  │ Integration  │        │
│  └─────────────┘  └──────────────┘  └─────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Visual Language Model (VLM) Layer            │    │
│  │  • OpenAI GPT-4o • UI-TARS • Qwen-VL • Gemini       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Package Dependency Graph

```
@darkpatternhunter/core
    ├── @darkpatternhunter/shared
    ├── @darkpatternhunter/recorder
    └── AI Model SDKs (OpenAI, Anthropic, etc.)
         │
         ├── @darkpatternhunter/web
         │   ├── @darkpatternhunter/core
         │   ├── @darkpatternhunter/playground
         │   └── @darkpatternhunter/shared
         │
         ├── @darkpatternhunter/visualizer
         │   ├── @darkpatternhunter/core
         │   ├── @darkpatternhunter/playground
         │   ├── @darkpatternhunter/web
         │   └── @darkpatternhunter/shared
         │
         └── apps/chrome-extension
             ├── @darkpatternhunter/core
             ├── @darkpatternhunter/visualizer
             ├── @darkpatternhunter/web
             ├── @darkpatternhunter/playground
             └── @darkpatternhunter/recorder
```

---

## 📁 Project Structure

### Root Level

```
midscene/
├── apps/                    # Application packages (UI apps)
│   └── chrome-extension/     # Chrome extension (main app)
│
├── packages/                 # Library packages
│   ├── core/                # Core engine (AI agent, models)
│   ├── web-integration/     # Web automation (Puppeteer/Playwright)
│   ├── visualizer/          # React UI components
│   ├── shared/              # Shared utilities
│   ├── playground/          # Playground SDK
│   └── recorder/            # Recording utilities
│
├── scripts/                  # Build and utility scripts
├── models/                   # Local AI model files
├── package.json             # Root package.json
├── pnpm-workspace.yaml      # pnpm workspace config
├── nx.json                   # Nx build configuration
└── README.md                 # Main documentation
```

---

## 📦 Package Details

### 1. `@darkpatternhunter/core` - Core Engine

**Purpose:** The heart of the framework - AI agent, visual understanding, and automation logic.

**Key Exports:**
```typescript
import { Agent, createAgent } from '@darkpatternhunter/core';
import { plan, describeUserPage } from '@darkpatternhunter/core';
import { callAIWithObjectResponse } from '@darkpatternhunter/core';
```

**Directory Structure:**
```
packages/core/src/
├── agent/                    # Agent implementation
│   ├── agent.ts             # Main Agent class (1277 lines)
│   ├── tasks.ts             # Task execution logic
│   ├── task-cache.ts        # Caching system
│   └── utils.ts             # Agent utilities
│
├── ai-model/                 # AI model integrations
│   ├── service-caller/      # API clients (OpenAI, Anthropic, etc.)
│   ├── prompt/              # Prompt templates
│   ├── llm-planning.ts      # High-level planning
│   ├── ui-tars-planning.ts  # UI-TARS specific planning
│   └── action-executor.ts   # Action execution
│
├── device/                   # Device abstraction
├── yaml/                     # YAML script parser/executor
├── tree.ts                   # UI tree structure
├── report.ts                 # Report generation
└── types.ts                  # TypeScript types
```

**Key Features:**
- **Agent Class:** Main automation interface with methods like `aiClick()`, `aiType()`, `aiQuery()`, `aiAction()`
- **AI Model Integration:** Supports OpenAI, Anthropic, Azure OpenAI, and custom VLM endpoints
- **Visual Understanding:** Uses screenshots + DOM context for UI understanding
- **YAML Scripting:** Execute automation scripts from YAML files
- **Caching:** Task-level caching for faster re-execution
- **Report Generation:** HTML reports with execution timeline

**Dependencies:**
- `openai` - OpenAI SDK
- `@anthropic-ai/sdk` - Anthropic Claude
- `@darkpatternhunter/shared` - Shared utilities
- `zod` - Schema validation
- `js-yaml` - YAML parsing

---

### 2. `@darkpatternhunter/web` - Web Integration

**Purpose:** Browser automation integration for Puppeteer and Playwright.

**Key Exports:**
```typescript
import { createAgent } from '@darkpatternhunter/web/puppeteer';
import { createAgent } from '@darkpatternhunter/web/playwright';
import { AgentOverChromeBridge } from '@darkpatternhunter/web/bridge-mode';
```

**Directory Structure:**
```
packages/web-integration/src/
├── puppeteer/               # Puppeteer adapter
├── playwright/               # Playwright adapter
├── bridge-mode/              # Chrome extension bridge
├── static/                   # Static mode (no browser)
└── common/                   # Shared web utilities
```

**Key Features:**
- **Puppeteer Integration:** Full Puppeteer support
- **Playwright Integration:** Full Playwright support
- **Bridge Mode:** Chrome extension communication
- **Static Mode:** Offline analysis without browser

**Dependencies:**
- `@darkpatternhunter/core` - Core engine
- `puppeteer` (peer) - Browser automation
- `playwright` (peer) - Browser automation
- `socket.io` - Real-time communication

---

### 3. `@darkpatternhunter/visualizer` - UI Components

**Purpose:** React components for visualizing automation execution and building UIs.

**Key Exports:**
```typescript
import { UniversalPlayground } from '@darkpatternhunter/visualizer';
import { Player } from '@darkpatternhunter/visualizer';
import { NavActions } from '@darkpatternhunter/visualizer';
```

**Directory Structure:**
```
packages/visualizer/src/
├── component/
│   ├── universal-playground/  # Main playground component
│   ├── player/                # Execution replay player
│   ├── prompt-input/          # Input component
│   ├── nav-actions/           # Navigation actions (GitHub, Help)
│   ├── env-config/            # Environment config UI
│   └── ...
├── hooks/                     # React hooks
├── store/                      # State management (Zustand)
└── utils/                     # Utilities
```

**Key Components:**
- **UniversalPlayground:** Interactive playground for testing automation
- **Player:** Replay execution with timeline
- **NavActions:** Navigation bar with GitHub/Help links
- **EnvConfig:** AI model configuration UI

**Dependencies:**
- `react` (peer) - React framework
- `antd` - UI component library
- `@darkpatternhunter/core` - Core engine
- `pixi.js` - Canvas rendering for player

---

### 4. `@darkpatternhunter/shared` - Shared Utilities

**Purpose:** Common utilities, types, and constants shared across packages.

**Key Exports:**
```typescript
import { imageInfoOfBase64 } from '@darkpatternhunter/shared/img';
import { getDebug } from '@darkpatternhunter/shared/logger';
import { MIDSCENE_MODEL_NAME } from '@darkpatternhunter/shared/env';
```

**Directory Structure:**
```
packages/shared/src/
├── env/                      # Environment configuration
├── img/                      # Image processing
├── extractor/                 # Data extraction
├── logger.ts                 # Logging utilities
└── utils.ts                  # Common utilities
```

---

### 5. `apps/chrome-extension` - Chrome Extension

**Purpose:** Browser extension for quick automation experience and dark pattern detection.

**Directory Structure:**
```
apps/chrome-extension/
├── src/
│   ├── extension/
│   │   ├── popup/            # Main popup UI
│   │   ├── dataset-collection/  # Dark pattern detection
│   │   ├── recorder/         # Recording functionality
│   │   └── bridge/           # Bridge mode UI
│   ├── scripts/
│   │   ├── worker.ts         # Service worker
│   │   └── event-recorder-bridge.ts
│   └── utils/
│       ├── datasetDB.ts      # IndexedDB storage
│       └── bridgeDB.ts
├── static/
│   └── manifest.json         # Extension manifest
└── dist/                     # Build output
```

**Key Features:**
- **Dark Pattern Detection:** Analyzes pages for manipulative UI patterns
- **Playground Mode:** Interactive automation testing
- **Recorder Mode:** Record user interactions
- **Bridge Mode:** Connect to external automation
- **Dataset Collection:** Store detected patterns

**Tech Stack:**
- React + TypeScript
- Ant Design UI
- Chrome Extension APIs (Manifest v3)
- IndexedDB for storage

---

## 🔄 Data Flow

### 1. Agent Action Flow

```
User calls agent.aiClick('login button')
    │
    ▼
Agent.aiClick() [agent.ts]
    │
    ▼
TaskExecutor.locate() [tasks.ts]
    │
    ├─► Capture screenshot
    ├─► Get DOM context
    └─► Build UI context
    │
    ▼
AI Model (plan/locate)
    │
    ├─► OpenAI GPT-4o
    ├─► UI-TARS
    └─► Qwen-VL
    │
    ▼
Parse location (bounding box or element ID)
    │
    ▼
Device.click(location)
    │
    ├─► Puppeteer: page.click()
    ├─► Playwright: page.click()
    └─► Android: adb input tap
    │
    ▼
Return result + screenshot
```

### 2. Dark Pattern Detection Flow

```
User clicks "Analyze Current Page" [chrome extension]
    │
    ▼
capturePageData() [dataset-collection/index.tsx]
    │
    ├─► chrome.tabs.captureVisibleTab() → Screenshot
    ├─► chrome.scripting.executeScript() → DOM
    └─► Get viewport metadata
    │
    ▼
analyzePageForDarkPatterns()
    │
    ├─► Build prompt with dark pattern categories
    ├─► Include screenshot (base64)
    └─► Include DOM (first 5000 chars)
    │
    ▼
callAIWithObjectResponse() [core/ai-model]
    │
    ├─► Create OpenAI client
    ├─► Send vision request (image + text)
    ├─► Parse JSON response
    └─► Filter by confidence > 0.7
    │
    ▼
storeDatasetEntry() [datasetDB.ts]
    │
    ├─► Save to IndexedDB
    ├─► Include patterns, metadata, summary
    └─► Update statistics
```

---

## 🎯 Key Components

### Agent Class (`packages/core/src/agent/agent.ts`)

**Main Methods:**
- `aiClick(prompt)` - Click element by description
- `aiType(prompt, text)` - Type into input field
- `aiQuery<T>(prompt, schema?)` - Extract structured data
- `aiBoolean(prompt)` - Boolean check
- `aiAction(instruction)` - High-level planning
- `aiWaitFor(prompt)` - Wait for condition
- `aiAssert(prompt)` - Assert condition
- `runYaml(script)` - Execute YAML script

**Example:**
```typescript
const agent = await createAgent(page);

// Click by description
await agent.aiClick('the login button');

// Extract data
const products = await agent.aiQuery<string[]>('list of product names');

// High-level action
await agent.aiAction('add all items to cart');
```

### AI Model Integration (`packages/core/src/ai-model/`)

**Supported Models:**
- **OpenAI:** GPT-4o, GPT-4 Vision, GPT-3.5
- **Anthropic:** Claude 3 Opus, Sonnet
- **Azure OpenAI:** Custom deployments
- **UI-TARS:** Local VLM server
- **Qwen-VL:** Alibaba visual model

**Configuration:**
```typescript
const modelConfig: IModelConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'https://api.openai.com/v1',
  vlMode: 'qwen-vl', // or 'vlm-ui-tars'
};
```

### Visual Understanding

The system uses **screenshots + DOM context** for UI understanding:

1. **Screenshot:** Full page screenshot (base64 encoded)
2. **DOM Context:** Simplified DOM tree (first 5000 chars)
3. **Metadata:** Viewport size, page URL, timestamp
4. **AI Analysis:** VLM analyzes screenshot + DOM to locate elements

**Advantages:**
- Works with any UI (web, mobile, custom)
- No need for selectors
- Understands visual layout
- Handles dynamic content

---

## 🔧 Build System

### Nx Configuration

- **Task Dependencies:** Automatic build order
- **Caching:** Builds cached for faster subsequent builds
- **Parallel Execution:** Builds run in parallel when possible

### Build Tools

- **Rsbuild:** For application builds (apps)
- **Rslib:** For library builds (packages)
- **Output Formats:** ES Modules, CommonJS, TypeScript types

### Build Commands

```bash
# Build all packages
pnpm run build

# Build with watch mode
pnpm run dev

# Build specific package
npx nx build @darkpatternhunter/core

# Skip cache (if circular dependency issues)
pnpm run build:skip-cache
```

---

## 🧪 Testing

### Test Structure

```
packages/[package-name]/
├── tests/
│   ├── unit-test/          # Unit tests
│   └── ai/                  # AI integration tests
```

### Test Commands

```bash
# Run all unit tests
pnpm run test

# Run AI tests (requires .env)
pnpm run test:ai

# Run E2E tests
pnpm run e2e

# Run with cache
pnpm run e2e:cache
```

---

## 📊 Code Statistics

### Package Sizes (Estimated)

- **@darkpatternhunter/core:** ~15,000 lines
- **@darkpatternhunter/web:** ~8,000 lines
- **@darkpatternhunter/visualizer:** ~10,000 lines
- **apps/chrome-extension:** ~5,000 lines
- **Total:** ~50,000+ lines of TypeScript

### Key Files

1. **`packages/core/src/agent/agent.ts`** - 1,277 lines (Main Agent class)
2. **`packages/core/src/agent/tasks.ts`** - 1,127 lines (Task execution)
3. **`packages/visualizer/src/component/universal-playground/index.tsx`** - Large component
4. **`apps/chrome-extension/src/extension/dataset-collection/index.tsx`** - Dark pattern detection

---

## 🔌 API Overview

### Core Agent API

#### Interaction Methods
```typescript
await agent.aiClick(prompt: string, options?: ClickOptions);
await agent.aiTap(prompt: string, options?: TapOptions);
await agent.aiType(prompt: string, text: string, options?: TypeOptions);
await agent.aiScroll(prompt: string, direction?: 'up' | 'down');
await agent.aiAction(instruction: string);
```

#### Data Extraction
```typescript
const data = await agent.aiQuery<T>(prompt: string, schema?: Schema);
const result = await agent.aiBoolean(prompt: string);
const text = await agent.aiExtractText(prompt: string);
```

#### Utility Methods
```typescript
await agent.aiWaitFor(prompt: string, timeout?: number);
const location = await agent.aiLocate(prompt: string);
await agent.aiAssert(condition: string);
```

---

## 🎨 UI Components

### UniversalPlayground

Interactive playground for testing automation:
- Real-time execution
- Screenshot viewer
- Action timeline
- Configuration panel

### Player

Execution replay player:
- Timeline navigation
- Before/after comparison
- Action details
- Screenshot gallery

### NavActions

Navigation bar component:
- GitHub link
- Help link (conditional)
- Environment config

---

## 🔐 Environment Configuration

### Environment Variables

Defined in `packages/shared/src/env/types.ts`:

- `MIDSCENE_OPENAI_API_KEY` - OpenAI API key
- `MIDSCENE_OPENAI_BASE_URL` - Base URL (default: https://api.openai.com/v1)
- `MIDSCENE_MODEL_NAME` - Model name (e.g., "gpt-4o")
- `MIDSCENE_VL_MODE` - Vision mode (optional)
- `OPENAI_API_KEY` - Alternative key name

### Configuration Flow

1. **Environment Variables:** Loaded from `.env` file
2. **Chrome Storage:** Extension stores config in `chrome.storage.local`
3. **UI Override:** Users can override via `EnvConfig` component
4. **Runtime:** Config applied via `ModelConfigManager`

---

## 🚀 Development Workflow

### Setup

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm run build

# Start watch mode
pnpm run dev
```

### Chrome Extension Development

```bash
cd apps/chrome-extension

# Build extension
pnpm run build

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select apps/chrome-extension/dist
```

### Testing

```bash
# Unit tests
pnpm run test

# AI tests (requires .env)
pnpm run test:ai

# E2E tests
pnpm run e2e
```

---

## 📝 Key Insights

### Strengths

1. **Modular Architecture:** Clean separation of concerns
2. **Type Safety:** Full TypeScript coverage
3. **Extensible:** Easy to add new AI models or integrations
4. **Visual-First:** Works with any UI, not just web
5. **Comprehensive:** Full automation + reporting + visualization

### Design Patterns

1. **Agent Pattern:** Central Agent class orchestrates all actions
2. **Adapter Pattern:** Device abstraction for different platforms
3. **Strategy Pattern:** Multiple AI models with same interface
4. **Observer Pattern:** Event-driven execution recording
5. **Factory Pattern:** `createAgent()` factory functions

### Technology Choices

- **Monorepo:** pnpm workspaces + Nx for build orchestration
- **TypeScript:** Full type safety
- **React:** UI components
- **Ant Design:** Consistent UI
- **Vitest:** Fast unit testing
- **Playwright:** E2E testing

---

## 🔮 Future Considerations

### Potential Enhancements

1. **Rule-Based Fallback:** DOM pattern matching when AI unavailable
2. **Visual Highlighting:** Draw bounding boxes on detected patterns
3. **Backend Integration:** MongoDB for dataset storage
4. **User Reporting:** Report false positives/negatives
5. **Cost Optimization:** Use cheaper models for initial screening

### Known Limitations

1. **API Costs:** Vision models are expensive
2. **Rate Limiting:** Need request queuing
3. **SPA Navigation:** Single Page Apps need special handling
4. **API Key Security:** Storing keys in Chrome storage

---

## 📚 Additional Resources

- **Documentation:** https://darkpatternhunter.dev
- **API Reference:** https://darkpatternhunter.dev/api
- **Examples:** https://github.com/darkpatternhunter/example
- **Discord:** https://discord.gg/2JyBHxszE4

---

**Last Updated:** 2025-01-XX  
**Status:** Production Ready (v0.30.8)

