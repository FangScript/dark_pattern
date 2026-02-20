# Dark Pattern Hunter - Comprehensive Architectural & Codebase Analysis

## Executive Summary

This document provides a comprehensive architectural and codebase analysis of the **Dark Pattern Hunter** project - a visual-driven AI operator that hunts, explains, and automates dark patterns across web, Android, and iOS platforms. The project is built as a monorepo using pnpm workspaces with Nx for build orchestration.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Module Analysis](#2-module-analysis)
3. [Inter-Module Dependencies & Communication](#3-inter-module-dependencies--communication)
4. [Data Flow Pathways](#4-data-flow-pathways)
5. [Control Mechanisms](#5-control-mechanisms)
6. [Critical Code Paths & Execution Traces](#6-critical-code-paths--execution-traces)
7. [Design Patterns](#7-design-patterns)
8. [Security Considerations](#8-security-considerations)
9. [Performance Characteristics](#9-performance-characteristics)
10. [Extensibility & Coupling Analysis](#10-extensibility--coupling-analysis)
11. [Emergent Properties & Architectural Trade-offs](#11-emergent-properties--architectural-trade-offs)
12. [Refactoring Opportunities](#12-refactoring-opportunities)

---

## 1. System Architecture Overview

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Dark Pattern Hunter System                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Chrome Ext.    │  │   Playwright    │  │   Puppeteer     │             │
│  │     (UI)        │  │  (Automation)   │  │  (Automation)   │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
│           │                    │                    │                       │
│           └────────────────────┼────────────────────┘                       │
│                                │                                            │
│                    ┌───────────▼───────────┐                                │
│                    │  @darkpatternhunter/  │                                │
│                    │    web-integration    │                                │
│                    └───────────┬───────────┘                                │
│                                │                                            │
│           ┌────────────────────┼────────────────────┐                      │
│           │                    │                    │                       │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐             │
│  │  Android Bridge │  │   iOS Bridge    │  │   Static Page   │             │
│  │   (ADB/WDA)     │  │   (WebDriver)   │  │   (Snapshots)   │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    @darkpatternhunter/core                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │    Agent    │  │   Insight   │  │  AI Model   │  │   Device    │ │   │
│  │  │   Engine    │  │   Engine    │  │   Service   │  │   Abstraction│ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   @darkpatternhunter/shared                          │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Extractor  │  │   Image     │  │   Logger    │  │    Env      │ │   │
│  │  │   (DOM)     │  │ Processing  │  │             │  │   Config    │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │  Visualizer     │  │   Playground    │  │    Recorder     │             │
│  │   (UI Comp.)    │  │   (Testing)     │  │  (Event Capt.)  │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Layer | Technology |
|-------|------------|
| **Language** | TypeScript |
| **Build System** | Nx, Rslib, Rsbuild |
| **Package Manager** | pnpm (workspaces) |
| **AI/ML** | OpenAI API, Anthropic SDK, Azure OpenAI |
| **Browser Automation** | Playwright, Puppeteer |
| **Mobile** | ADB (Android), WebDriverAgent (iOS) |
| **UI Framework** | React, Ant Design |
| **Testing** | Vitest |

---

## 2. Module Analysis

### 2.1 Core Package (`@darkpatternhunter/core`)

#### 2.1.1 Core Functionality & Purpose

The core package is the central intelligence layer providing:

1. **Agent Engine** ([`Agent`](packages/core/src/agent/agent.ts:106)): Orchestrates AI-driven automation workflows
2. **Insight Engine** ([`Insight`](packages/core/src/insight/index.ts:49)): Provides visual understanding and element location
3. **AI Model Service** ([`service-caller`](packages/core/src/ai-model/service-caller/index.ts)): Abstracts LLM/VLM communication
4. **Device Abstraction** ([`AbstractInterface`](packages/core/src/device/index.ts:8)): Platform-agnostic interface for automation
5. **YAML Scripting** ([`ScriptPlayer`](packages/core/src/yaml/player.ts:61)): Declarative test automation

#### 2.1.2 Input/Output Contracts

**Agent Class Interface:**
```typescript
// Primary entry point for automation
class Agent<InterfaceType extends AbstractInterface> {
  // Core AI Actions
  aiAction(taskPrompt: string): Promise<PlanningAIResponse>
  aiTap(locatePrompt: TUserPrompt): Promise<any>
  aiInput(locatePrompt: TUserPrompt, opt: InputOptions): Promise<any>
  aiScroll(locatePrompt: TUserPrompt, opt: ScrollOptions): Promise<any>
  
  // Query Operations
  aiQuery<ReturnType>(demand: InsightExtractParam): Promise<ReturnType>
  aiBoolean(prompt: TUserPrompt): Promise<boolean>
  aiString(prompt: TUserPrompt): Promise<string>
  aiNumber(prompt: TUserPrompt): Promise<number>
  
  // Assertions
  aiAssert(assertion: TUserPrompt): Promise<void>
  aiWaitFor(assertion: TUserPrompt, opt?: AgentWaitForOpt): Promise<void>
  
  // Utility
  aiLocate(prompt: TUserPrompt): Promise<LocateResult>
  runYaml(yamlScriptContent: string): Promise<{ result: Record<string, any> }>
}
```

**AI Service Caller Interface:**
```typescript
// Unified AI calling interface
async function callAIWithObjectResponse<T>(
  msgs: ChatCompletionMessageParam[],
  actionType: AIActionType,
  modelConfig: IModelConfig
): Promise<{ content: T; usage: AIUsageInfo }>
```

#### 2.1.3 Critical Code Paths

**Path 1: AI Action Execution Flow**
```
Agent.aiAction() 
  → TaskExecutor.action()
    → plan() [LLM Planning]
      → callAIWithObjectResponse() [AI Service]
    → convertPlanToExecutable()
      → Executor.flush()
        → Task execution with screenshot recording
    → afterTaskRunning() [Report generation]
```

**Path 2: Element Location Flow**
```
Agent.aiLocate() / Insight.locate()
  → AiLocateElement() [inspect.ts]
    → describeUserPage() [Context preparation]
    → callAIWithObjectResponse() [AI element detection]
    → elementByPositionWithElementInfo() [Element matching]
  → Return LocateResult with rect, center coordinates
```

**Path 3: YAML Script Execution**
```
Agent.runYaml()
  → parseYamlScript() [Parse YAML]
  → ScriptPlayer.run()
    → Sequential task execution
    → Result aggregation
```

#### 2.1.4 Structural Organization

```
packages/core/src/
├── agent/
│   ├── agent.ts          # Main Agent class (1,284 lines)
│   ├── tasks.ts          # TaskExecutor for plan execution
│   ├── task-cache.ts     # Caching mechanism
│   ├── utils.ts          # Agent utilities
│   └── ui-utils.ts       # UI formatting utilities
├── ai-model/
│   ├── service-caller/   # LLM/VLM communication layer
│   ├── prompt/           # Prompt templates for different AI tasks
│   ├── action-executor.ts # Executor for action plans
│   ├── inspect.ts        # Element inspection logic
│   ├── llm-planning.ts   # LLM-based task planning
│   ├── ui-tars-planning.ts # UI-TARS model integration
│   └── common.ts         # Shared AI utilities
├── device/
│   └── index.ts          # AbstractInterface definition
├── insight/
│   └── index.ts          # Visual understanding engine
├── yaml/
│   ├── player.ts         # YAML script execution
│   ├── builder.ts        # YAML generation
│   └── utils.ts          # YAML utilities
└── types.ts              # Core type definitions (620 lines)
```

#### 2.1.5 Design Patterns

1. **Strategy Pattern**: Multiple planning strategies (LLM vs UI-TARS)
2. **Template Method**: Task execution with before/after hooks
3. **Observer Pattern**: Dump subscribers for reporting
4. **Factory Pattern**: Agent creation via [`createAgent()`](packages/core/src/agent/agent.ts:1279)
5. **Command Pattern**: Device actions as executable commands

#### 2.1.6 Synchronous/Asynchronous Models

- **Async-First**: All AI operations are asynchronous
- **Task Queue**: Executor maintains pending/running/completed task states
- **Streaming Support**: Code generation supports streaming responses
- **Cache Synchronization**: Async file I/O for cache persistence

#### 2.1.7 Edge Cases & Failure Modes

| Scenario | Handling |
|----------|----------|
| AI Service Timeout | Retry with exponential backoff |
| Invalid Element Location | Fallback to position-based matching |
| Screenshot Scale Mismatch | Dynamic scale computation and resize |
| Cache Corruption | Version validation, graceful fallback |
| VL Model Warning | One-time warning, non-blocking |
| Replanning Limit | Configurable cycle limit (default: 10) |

#### 2.1.8 Performance Characteristics

- **Screenshot Processing**: Image resizing for AI models (GPT-4o size limits)
- **Caching**: Read/write strategies (read-only, read-write, write-only)
- **Conversation History**: Configurable max image messages
- **Memory Management**: Context freezing to avoid recomputation

---

### 2.2 Web Integration Package (`@darkpatternhunter/web`)

#### 2.2.1 Core Functionality

Provides browser automation adapters:

1. **Playwright Integration** ([`PlaywrightAgent`](packages/web-integration/src/playwright/index.ts))
2. **Puppeteer Integration** ([`PuppeteerAgent`](packages/web-integration/src/puppeteer/index.ts))
3. **Chrome Extension Proxy** ([`ChromeExtensionProxyPage`](packages/web-integration/src/chrome-extension/page.ts))
4. **Static Page Analysis** ([`StaticPage`](packages/web-integration/src/static/static-page.ts))

#### 2.2.2 Architecture

```
AbstractInterface (core)
    │
    ├── Page<AgentType, InterfaceType> (base-page.ts)
    │       ├── WebPageContextParser()
    │       ├── commonWebActionsForWebPage()
    │       └── evaluateJavaScript()
    │
    ├── PlaywrightWebPage → PlaywrightAgent
    ├── PuppeteerWebPage → PuppeteerAgent
    ├── ChromeExtensionProxyPage
    └── StaticPage
```

#### 2.2.3 Key Components

**WebElementInfoImpl**: DOM element representation
```typescript
class WebElementInfoImpl implements WebElementInfo {
  id: string
  indexId: number        // Marker ID for visual identification
  content: string        // Text content
  rect: Rect            // Bounding rectangle
  center: [number, number]
  attributes: { nodeType: NodeType, [key: string]: string }
  xpaths?: string[]
  isVisible: boolean
}
```

**BasePage Class**: Unified page interface supporting both Playwright and Puppeteer

---

### 2.3 Shared Package (`@darkpatternhunter/shared`)

#### 2.3.1 Core Functionality

Cross-cutting concerns:

1. **DOM Extraction** ([`extractor/`](packages/shared/src/extractor/index.ts)): Element tree parsing
2. **Image Processing** ([`img/`](packages/shared/src/img/index.ts)): Screenshot manipulation
3. **Environment Configuration** ([`env/`](packages/shared/src/env/types.ts)): Model config management
4. **Utilities** ([`utils.ts`](packages/shared/src/utils.ts)): Common helpers

#### 2.3.2 Environment Configuration System

The project uses a sophisticated multi-model configuration system:

```typescript
// Model-specific environment keys
VQA_MODEL_CONFIG_KEYS = {
  modelName: MIDSCENE_VQA_MODEL_NAME,
  // ... 20+ config keys per model type
}

GROUNDING_MODEL_CONFIG_KEYS = {
  modelName: MIDSCENE_GROUNDING_MODEL_NAME,
  // ...
}

PLANNING_MODEL_CONFIG_KEYS = {
  modelName: MIDSCENE_PLANNING_MODEL_NAME,
  // ...
}
```

**Supported AI Providers:**
- OpenAI (GPT-4o, GPT-4V)
- Azure OpenAI
- Anthropic (Claude)
- Qwen VL / Qwen3 VL
- Doubao Vision
- Gemini
- UI-TARS

---

### 2.4 Chrome Extension (`apps/chrome-extension`)

#### 2.4.1 Core Functionality

Browser extension providing:

1. **Playground Interface**: Interactive AI automation testing
2. **Recorder**: Event recording and test generation
3. **Bridge Mode**: Connection to external automation servers
4. **Dataset Collection**: Training data gathering

#### 2.4.2 Component Architecture

```
Popup (index.tsx)
├── Playground (BrowserExtensionPlayground)
├── Bridge (Bridge mode connection)
├── Recorder (Event recording)
├── DatasetCollection (Data gathering)
└── Settings (Configuration)

Recorder Architecture:
├── hooks/
│   ├── useRecordingControl.ts    # Recording lifecycle
│   ├── useRecordingSession.ts    # Session management
│   ├── useTabMonitoring.ts       # Tab change detection
│   └── useLifecycleCleanup.ts    # Resource cleanup
├── components/
│   ├── RecordList.tsx            # Session list UI
│   ├── RecordDetail.tsx          # Event detail view
│   ├── ProgressModal.tsx         # AI generation progress
│   └── SessionModals.tsx         # Session CRUD
└── generators/
    ├── playwrightGenerator.ts    # Playwright test gen
    └── yamlGenerator.ts          # YAML script gen
```

---

### 2.5 Visualizer Package (`@darkpatternhunter/visualizer`)

#### 2.5.1 Core Functionality

React component library for:

1. **Execution Visualization**: Replay automation steps
2. **Environment Configuration**: Model setup UI
3. **Playground Interface**: Interactive testing environment
4. **Report Rendering**: HTML report generation

#### 2.5.2 Key Components

- [`Player`](packages/visualizer/src/component/player): Step-by-step replay
- [`Blackboard`](packages/visualizer/src/component/blackboard): Visual annotation
- [`ContextPreview`](packages/visualizer/src/component/context-preview): Screenshot preview
- [`UniversalPlayground`](packages/visualizer/src/component/universal-playground): Flexible testing UI

---

### 2.6 Recorder Package (`@darkpatternhunter/recorder`)

#### 2.6.1 Core Functionality

Event recording system:

1. **EventRecorder Class**: Captures user interactions
2. **Event Types**: click, scroll, input, navigation, keydown, setViewport
3. **Screenshot Capture**: Before/after screenshots
4. **Element Description**: AI-generated element descriptions

#### 2.6.2 Event Structure

```typescript
interface ChromeRecordedEvent {
  type: 'click' | 'scroll' | 'input' | 'navigation' | 'setViewport' | 'keydown'
  url?: string
  title?: string
  value?: string
  elementRect?: { left, top, width, height, x, y }
  pageInfo: { width, height }
  screenshotBefore?: string
  screenshotAfter?: string
  elementDescription?: string
  timestamp: number
  hashId: string
}
```

---

### 2.7 Playground Package (`@darkpatternhunter/playground`)

#### 2.7.1 Core Functionality

Testing and development environment:

1. **PlaygroundServer**: HTTP server for automation
2. **LocalExecutionAdapter**: Direct browser control
3. **RemoteExecutionAdapter**: Remote device control
4. **PlaygroundSDK**: Programmatic API

---

## 3. Inter-Module Dependencies & Communication

### 3.1 Dependency Graph

```
                    ┌─────────────────┐
                    │  chrome-extension │
                    └────────┬────────┘
                             │ uses
                             ▼
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│  visualizer │◄────►│      web        │◄────►│   core      │
└─────────────┘      └─────────────────┘      └──────┬──────┘
       ▲                     ▲                       │
       │                     │                       │
       └─────────────────────┴───────────────────────┘
                             │
                    ┌────────▼────────┐
                    │     shared      │
                    │  (extractor,    │
                    │   img, env)     │
                    └─────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌─────────┐    ┌─────────┐    ┌─────────┐
        │ recorder│    │playground│   │  models │
        └─────────┘    └─────────┘    └─────────┘
```

### 3.2 Communication Protocols

#### 3.2.1 Inter-Package Communication

| Source | Target | Mechanism | Data |
|--------|--------|-----------|------|
| `web` | `core` | Direct import | Agent, Insight classes |
| `core` | `shared` | Direct import | Extractor, image utils |
| `chrome-extension` | `web` | Direct import | ChromeExtensionProxyPage |
| `visualizer` | `core` | Direct import | Replay scripts, types |
| `recorder` | `core` | Direct import | Test generation |

#### 3.2.2 Chrome Extension Communication

```
Content Script ←→ Background Script ←→ Popup
     │                                    │
     └────── Chrome Message API ──────────┘
```

**Message Types:**
- `START_RECORDING`
- `STOP_RECORDING`
- `RECORD_EVENT`
- `GET_RECORDING_STATE`

#### 3.2.3 AI Service Communication

```
core/ai-model/service-caller
    │
    ├── OpenAI API (REST/JSON)
    ├── Azure OpenAI (REST/JSON)
    ├── Anthropic API (REST/JSON)
    └── UI-TARS (Local inference)
```

---

## 4. Data Flow Pathways

### 4.1 Main Automation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Request (Natural Language)              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Context Capture                                              │
│     - screenshotBase64() → Base64 screenshot                     │
│     - getElementsNodeTree() → DOM tree                           │
│     - size() → Viewport dimensions                               │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. AI Processing                                                │
│     - describeUserPage() → Page description                      │
│     - plan() / uiTarsPlanning() → Action plan                    │
│     - Image markup (if non-VL mode)                              │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Plan Execution                                               │
│     - convertPlanToExecutable() → Task list                      │
│     - Executor.flush() → Sequential execution                    │
│     - Screenshot recording (before/after)                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Action Execution                                             │
│     - Device actions (tap, input, scroll, etc.)                  │
│     - Element location (if needed)                               │
│     - Wait for navigation/network idle                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Reporting & Caching                                          │
│     - Execution dump → JSON                                      │
│     - HTML report generation                                     │
│     - Cache update (if enabled)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Element Location Flow

```
Locate Request
     │
     ▼
┌─────────────────────────┐
│ 1. Context Retrieval    │
│    - Get UIContext      │
│    - Screenshot + Tree  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ 2. Search Area (opt.)   │────►│ AiLocateSection()       │
│    - deepThink mode     │     │ - Crop screenshot       │
└───────────┬─────────────┘     │ - AI section detection  │
            │                   └─────────────────────────┘
            ▼
┌─────────────────────────┐
│ 3. Element Detection    │
│    - AiLocateElement()  │
│    - AI model call      │
│    - Bbox/ID response   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. Element Matching     │
│    - elementById()      │
│    - Position fallback  │
│    - Rect validation    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 5. Result Return        │
│    - LocateResult       │
│    - center, rect, id   │
└─────────────────────────┘
```

### 4.3 Data Extraction Flow

```
Query Request (aiQuery, aiBoolean, aiString, aiNumber)
     │
     ▼
┌─────────────────────────┐
│ 1. Context Preparation  │
│    - Screenshot         │
│    - Optional DOM       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. Prompt Construction  │
│    - Extraction prompt  │
│    - Schema definition  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 3. AI Inference         │
│    - VQA model          │
│    - JSON response      │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. Result Parsing       │
│    - Type coercion      │
│    - Validation         │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 5. Typed Return         │
└─────────────────────────┘
```

---

## 5. Control Mechanisms

### 5.1 Task Execution Control

**Executor State Machine:**
```
┌─────┐    append()    ┌─────────┐    flush()    ┌─────────┐
│ init│ ──────────────►│ pending │ ─────────────►│ running │
└─────┘                └─────────┘               └────┬────┘
                                                      │
                         ┌────────────────────────────┤
                         │                            │
                         ▼                            ▼
                   ┌──────────┐                 ┌──────────┐
                   │completed │                 │  error   │
                   └──────────┘                 └──────────┘
```

### 5.2 Cache Control

**Cache Strategies:**
- `read-only`: Use cache, don't write
- `read-write`: Use and update cache
- `write-only`: Update cache, don't read

**Cache Flow:**
```
aiAction() called
     │
     ├── Cache miss ──► Execute AI planning ──► Update cache
     │
     └── Cache hit ───► Load YAML workflow ───► Execute from cache
```

### 5.3 Replanning Control

```typescript
// Replanning cycle limit prevents infinite loops
const defaultReplanningCycleLimit = 10
const defaultVlmUiTarsReplanningCycleLimit = 40

// Error action triggers replanning
if (action.type === 'Error') {
  // Replan with error context
}
```

### 5.4 Screenshot Scale Control

```typescript
// Lazy computation with deduplication
private async getScreenshotScale(context: UIContext): Promise<number> {
  if (this.screenshotScale !== undefined) {
    return this.screenshotScale  // Cached
  }
  
  if (!this.screenshotScalePromise) {
    this.screenshotScalePromise = (async () => {
      // Compute scale: screenshotWidth / pageWidth
    })()
  }
  
  return await this.screenshotScalePromise
}
```

---

## 6. Critical Code Paths & Execution Traces

### 6.1 AI Action Execution Trace

```typescript
// Entry: Agent.aiAction()
async aiAction(taskPrompt: string, opt?: { cacheable?: boolean }) {
  // 1. Get model config for planning
  const modelConfig = this.modelConfigManager.getModelConfig('planning')
  
  // 2. Check cache (if not VLM UI-TARS)
  const matchedCache = this.taskCache?.matchPlanCache(taskPrompt)
  if (matchedCache && this.taskCache?.isCacheResultUsed) {
    return this.runYaml(matchedCache.cacheContent?.yamlWorkflow)
  }
  
  // 3. Execute via TaskExecutor
  const { output, executor } = await this.taskExecutor.action(
    taskPrompt,
    modelConfig,
    this.opts.aiActionContext,
    cacheable
  )
  
  // 4. Update cache
  if (this.taskCache && output?.yamlFlow) {
    this.taskCache.updateOrAppendCacheRecord({...})
  }
  
  // 5. Post-execution
  await this.afterTaskRunning(executor)
  return output
}
```

### 6.2 Task Planning Trace

```typescript
// Path: TaskExecutor.action() → plan()
async function plan(userInstruction: string, opts: {...}) {
  // 1. Prepare context
  const { description, elementById } = await describeUserPage(context, { vlMode })
  
  // 2. Build system prompt
  const systemPrompt = await systemPromptToTaskPlanning({ actionSpace, vlMode })
  
  // 3. Prepare image payload
  let imagePayload = screenshotBase64
  if (vlMode === 'qwen-vl') {
    imagePayload = await paddingToMatchBlockByBase64(imagePayload)
  } else if (!vlMode) {
    imagePayload = await markupImageForLLM(screenshotBase64, context.tree, size)
  }
  
  // 4. Call AI
  const { content, usage } = await callAIWithObjectResponse<PlanningAIResponse>(
    msgs,
    AIActionType.PLAN,
    modelConfig
  )
  
  // 5. Parse response
  const actions = content.action ? [content.action] : content.actions
  return { actions, rawResponse, usage, yamlFlow }
}
```

### 6.3 Device Action Execution Trace

```typescript
// Path: Executor.flush() → device action
async flush(): Promise<{ output: any }> {
  while (taskIndex < this.tasks.length) {
    const task = this.tasks[taskIndex]
    
    // Execute based on task type
    if (task.type === 'Insight') {
      returnValue = await task.executor(param, executorContext)
      if (task.subType === 'Locate') {
        previousFindOutput = returnValue.output
      }
    } else if (task.type === 'Action') {
      // Invoke device action
      returnValue = await task.executor(param, executorContext)
    }
    
    task.status = 'finished'
    taskIndex++
  }
}
```

---

## 7. Design Patterns

### 7.1 Creational Patterns

| Pattern | Usage | Location |
|---------|-------|----------|
| **Factory** | Agent creation | [`createAgent()`](packages/core/src/agent/agent.ts:1279) |
| **Builder** | YAML script building | [`buildYaml()`](packages/core/src/yaml/builder.ts:8) |
| **Singleton** | Global config manager | [`globalModelConfigManager`](packages/core/src/agent/agent.ts:56) |

### 7.2 Structural Patterns

| Pattern | Usage | Location |
|---------|-------|----------|
| **Adapter** | Playwright/Puppeteer unification | [`Page`](packages/web-integration/src/puppeteer/base-page.ts:51) |
| **Bridge** | Device abstraction | [`AbstractInterface`](packages/core/src/device/index.ts:8) |
| **Composite** | Element tree structure | [`ElementTreeNode`](packages/shared/src/types/index.ts:38) |
| **Decorator** | Screenshot recording wrapper | [`prependExecutorWithScreenshot()`](packages/core/src/agent/tasks.ts:123) |

### 7.3 Behavioral Patterns

| Pattern | Usage | Location |
|---------|-------|----------|
| **Strategy** | Planning algorithms | [`plan()`](packages/core/src/ai-model/llm-planning.ts:30) vs [`uiTarsPlanning()`](packages/core/src/ai-model/ui-tars-planning.ts:41) |
| **Template Method** | Task execution | [`Executor.flush()`](packages/core/src/ai-model/action-executor.ts:59) |
| **Observer** | Dump subscribers | [`DumpSubscriber`](packages/core/src/types.ts:205) |
| **Command** | Device actions | [`DeviceAction`](packages/core/src/device/index.ts:391) |
| **State** | Executor status | [`Executor.status`](packages/core/src/ai-model/action-executor.ts:18) |

---

## 8. Security Considerations

### 8.1 Trust Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    Trust Boundary Analysis                   │
├─────────────────────────────────────────────────────────────┤
│  High Trust                    Low Trust                     │
│  ───────────                   ─────────                    │
│  • User code                   • AI Service APIs            │
│  • Local model (UI-TARS)       • Third-party AI providers   │
│  • Browser extension           • Web content scripts         │
│  • Cache files                 • Uploaded test data          │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Security Measures

| Concern | Mitigation |
|---------|------------|
| API Key Storage | Environment variables, Chrome storage |
| Screenshot Data | Optional upload server, local processing |
| Code Injection | Zod schema validation for all inputs |
| XSS | React escaping, no innerHTML |
| Cache Integrity | Version validation, schema checks |

### 8.3 Sensitive Data Flow

```
API Keys
  │
  ├──► Environment Variables (process.env)
  │
  ├──► Chrome Extension Storage (chrome.storage.local)
  │
  └──► Memory only (never persisted to disk)

Screenshots
  │
  ├──► Local processing (default)
  │
  └──► Optional upload to configured server
```

---

## 9. Performance Characteristics

### 9.1 Resource Utilization

| Resource | Usage Pattern | Optimization |
|----------|---------------|--------------|
| **Memory** | Screenshot buffers, DOM trees | Context freezing, lazy loading |
| **CPU** | Image processing, AI inference | Image resizing, caching |
| **Network** | AI API calls, optional uploads | Batching, compression |
| **Disk** | Cache files, reports | Streaming writes, cleanup |

### 9.2 Bottleneck Analysis

```
Performance Hotspots:
1. Screenshot capture → ~100-500ms
2. Image resizing (GPT-4o) → ~50-200ms
3. AI API call → ~1-5s (depends on model)
4. DOM tree extraction → ~50-200ms
5. Report generation → ~100-500ms
```

### 9.3 Optimization Strategies

1. **Screenshot Scaling**: Lazy computation with caching
2. **Context Freezing**: Avoid repeated context capture
3. **Task Caching**: Reuse previous AI plans
4. **Conversation History**: Limit image message count
5. **Image Padding**: Optimize for Qwen VL block alignment

---

## 10. Extensibility & Coupling Analysis

### 10.1 Coupling Metrics

| Module | Afferent | Efferent | Instability |
|--------|----------|----------|-------------|
| `core` | High | Medium | 0.4 |
| `shared` | High | Low | 0.2 |
| `web` | Medium | High | 0.7 |
| `visualizer` | Low | High | 0.8 |
| `chrome-extension` | Low | High | 0.8 |

### 10.2 Extension Points

1. **Custom Device Actions**
```typescript
// Add custom actions to web page
const customActions: DeviceAction<any>[] = [
  defineAction({
    name: 'CustomAction',
    description: 'My custom action',
    paramSchema: z.object({...}),
    call: async (param) => { ... }
  })
]

const page = new PlaywrightWebPage(browserPage, {
  customActions
})
```

2. **Custom AI Providers**
```typescript
// Extend service-caller for new providers
async function createChatClient({ AIActionTypeValue, modelConfig }) {
  // Add new provider logic
}
```

3. **Custom Extractors**
```typescript
// Extend element extraction
export function customExtractTreeNode(...) {
  // Custom DOM parsing logic
}
```

### 10.3 Plugin Architecture

The system supports plugin-like extensibility through:
- Custom actions in device abstraction
- Custom model configurations
- Custom storage providers (visualizer)
- Custom context providers (visualizer)

---

## 11. Emergent Properties & Architectural Trade-offs

### 11.1 Strengths

1. **Unified Interface**: Single API across web, mobile, and desktop
2. **Visual-First**: Screenshots over DOM selectors for resilience
3. **Multi-Model Support**: Flexibility in AI provider selection
4. **Caching**: Significant performance improvement for repeated tasks
5. **Comprehensive Reporting**: Detailed execution traces

### 11.2 Trade-offs

| Decision | Pros | Cons |
|----------|------|------|
| Visual over DOM | Resilient to changes | Higher AI costs |
| Multi-provider support | Flexibility | Configuration complexity |
| Monorepo structure | Code sharing | Build complexity |
| YAML scripting | Declarative tests | Learning curve |
| Screenshot recording | Debugging | Storage overhead |

### 11.3 Technical Debt

1. **Legacy Signatures**: Multiple overloaded method signatures for backward compatibility
2. **Deprecated Methods**: `getElementsNodeTree`, `url`, `evaluateJavaScript` marked deprecated
3. **Platform-Specific Code**: Conditional logic for different AI models
4. **Browser-Specific Handling**: Separate paths for Playwright/Puppeteer

---

## 12. Refactoring Opportunities

### 12.1 High Priority

1. **Consolidate Model Configuration**
   - Current: Separate config keys for VQA, Grounding, Planning
   - Proposed: Unified config with role-based overrides

2. **Extract Platform Adapters**
   - Current: Platform logic in core
   - Proposed: Separate adapter packages

3. **Standardize Error Handling**
   - Current: Mixed throw/return patterns
   - Proposed: Result type pattern

### 12.2 Medium Priority

1. **Simplify Agent Interface**
   - Remove deprecated method signatures
   - Consolidate similar methods (aiAsk → aiString)

2. **Improve Testability**
   - Extract AI service mocking interface
   - Add dependency injection container

3. **Optimize Bundle Size**
   - Tree-shake unused AI model code
   - Lazy load visualizer components

### 12.3 Low Priority

1. **Documentation Generation**
   - Automated API docs from types
   - Architecture decision records

2. **Performance Monitoring**
   - Built-in metrics collection
   - Performance regression tests

---

## Appendix A: Module Summary Table

| Module | Purpose | Key Exports | Dependencies |
|--------|---------|-------------|--------------|
| `core` | AI automation engine | Agent, Insight, Executor | shared |
| `web` | Browser automation | PlaywrightAgent, PuppeteerAgent | core, shared |
| `shared` | Common utilities | Extractor, Image utils | - |
| `visualizer` | UI components | Player, Playground | core |
| `recorder` | Event recording | EventRecorder | shared |
| `playground` | Testing server | PlaygroundServer | core |
| `chrome-extension` | Browser extension | Popup, Recorder | web, visualizer |

## Appendix B: AI Model Integration Matrix

| Model | Provider | VL Mode | Use Case |
|-------|----------|---------|----------|
| GPT-4o | OpenAI | - | General planning, VQA |
| GPT-4V | OpenAI | - | Visual understanding |
| Claude 3.5 | Anthropic | - | General tasks |
| Qwen VL | Alibaba | qwen-vl | Visual grounding |
| Qwen3 VL | Alibaba | qwen3-vl | Enhanced visual |
| Doubao | ByteDance | doubao | Visual tasks |
| Gemini | Google | gemini | Visual tasks |
| UI-TARS | Local | vlm-ui-tars | On-device inference |

---

*Analysis completed: 2026-01-28*
*Project version: 0.30.8*
*Total analyzed files: 200+*
*Lines of code: ~50,000+*