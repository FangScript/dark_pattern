# Dark Pattern Hunter — Project Documentation

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Installation & Setup](#installation--setup)
5. [Development Workflow](#development-workflow)
6. [Packages Overview](#packages-overview)
7. [Applications Overview](#applications-overview)
8. [Key Features](#key-features)
9. [API Overview](#api-overview)
10. [Testing](#testing)
11. [Build System](#build-system)
12. [Contributing](#contributing)
13. [Troubleshooting](#troubleshooting)

---

## 🎯 Project Overview

**Dark Pattern Hunter** is a visual-driven AI automation framework that helps you control web browsers, Android devices, iOS devices, and other interfaces using natural language. It uses visual language models (VLMs) to understand and interact with user interfaces from screenshots, reducing reliance on brittle DOM selectors.

### Core Philosophy

- **Visual-First**: Uses screenshots and visual understanding instead of DOM manipulation
- **AI-Powered**: Leverages visual language models (Qwen-VL, UI-TARS, Gemini, etc.)
- **Universal**: Works across web, mobile, and custom interfaces
- **Developer-Friendly**: JavaScript SDK, YAML scripting, and comprehensive debugging tools

### Version

Current Version: **0.30.8**

### Technology Stack

- **Language**: TypeScript
- **Runtime**: Node.js (>=18.19.0)
- **Package Manager**: pnpm (>=9.3.0)
- **Build System**: Nx + Rsbuild/Rslib
- **Testing**: Vitest, Playwright
- **UI Framework**: React + Ant Design
- **Monorepo**: pnpm workspaces

---

## 🏗️ Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Dark Pattern Hunter stack                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Web Apps   │  │  Mobile Apps │  │  CLI Tools    │     │
│  │              │  │              │  │               │     │
│  │ • Report     │  │ • Android    │  │ • CLI         │     │
│  │ • Playground │  │ • iOS        │  │ • MCP Server  │     │
│  │ • Extension  │  │              │  │               │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘     │
│         │                  │                  │               │
│         └──────────────────┼──────────────────┘              │
│                            │                                   │
│                    ┌───────▼────────┐                          │
│                    │  Core package  │                          │
│                    │ @darkpatternhunter/core                    │
│                    └───────┬────────┘                          │
│                            │                                   │
│         ┌──────────────────┼──────────────────┐              │
│         │                  │                  │               │
│  ┌──────▼──────┐  ┌───────▼──────┐  ┌───────▼──────┐        │
│  │   Web       │  │   Android    │  │     iOS      │        │
│  │ Integration │  │  Integration  │  │ Integration  │        │
│  └─────────────┘  └──────────────┘  └─────────────┘        │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Visual Language Model (VLM) Layer            │    │
│  │  • Qwen-VL • UI-TARS • Gemini • Doubao-Vision       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Package Dependencies

```
@darkpatternhunter/core (Core Engine)
    ├── @darkpatternhunter/shared (Shared utilities)
    ├── AI Model Integrations
    └── Agent & Device Abstractions
         │
         ├── @darkpatternhunter/web (Web Integration)
         │   ├── Puppeteer Integration
         │   ├── Playwright Integration
         │   └── Bridge Mode (Chrome Extension)
         │
         ├── @darkpatternhunter/android (Android Integration)
         │   └── ADB Integration
         │
         └── @darkpatternhunter/ios (iOS Integration)
             └── WebDriverAgent Integration
```

---

## 📁 Project Structure

### Monorepo Organization

This repository uses a **monorepo** layout managed by **pnpm workspaces** and **Nx**:

```
dark-pattern-hunter/
├── apps/                    # Application packages (UI apps)
│   ├── report/             # Report visualization app
│   ├── playground/         # Web playground app
│   ├── android-playground/ # Android playground app
│   ├── chrome-extension/   # Chrome extension
│   ├── recorder-form/      # Recorder form app
│   └── site/               # Documentation site
│
├── packages/               # Library packages
│   ├── core/               # Core engine
│   ├── web-integration/    # Web automation integration
│   ├── android/            # Android automation
│   ├── ios/                # iOS automation
│   ├── cli/                # Command-line interface
│   ├── visualizer/         # UI visualization components
│   ├── shared/             # Shared utilities
│   ├── playground/         # Playground SDK
│   ├── recorder/           # Recording utilities
│   ├── mcp/                # MCP server implementation
│   ├── webdriver/          # WebDriver utilities
│   └── evaluation/         # Evaluation tools
│
├── scripts/                # Build and utility scripts
├── .github/                # GitHub workflows
├── package.json            # Root package.json
├── pnpm-workspace.yaml     # pnpm workspace config
├── nx.json                 # Nx configuration
└── README.md               # Main README
```

---

## 📦 Packages Overview

### Core Packages

#### `@darkpatternhunter/core` - Core Engine

**Purpose**: Core automation engine for Dark Pattern Hunter.

**Key Features**:
- AI agent implementation
- Visual language model integration
- Device abstraction layer
- YAML script execution
- Report generation

**Main Exports**:
```typescript
import { Agent } from '@darkpatternhunter/core';
import { createAgent } from '@darkpatternhunter/core/agent';
import { Device } from '@darkpatternhunter/core/device';
```

**Key Modules**:
- `agent/` - AI agent implementation
- `ai-model/` - AI model integrations (OpenAI, Anthropic, etc.)
- `device/` - Device abstraction
- `yaml/` - YAML script parser and executor
- `tree/` - UI tree structure
- `report.ts` - Report generation

#### `@darkpatternhunter/shared` - Shared Utilities

**Purpose**: Common utilities and types shared across packages.

**Key Features**:
- Common types and interfaces
- Utility functions
- Constants
- Image processing utilities

#### `@darkpatternhunter/web` - Web Integration

**Purpose**: Web browser automation integration.

**Key Features**:
- Puppeteer integration
- Playwright integration
- Bridge mode (Chrome extension)
- Static mode (no browser)

**Main Exports**:
```typescript
import { createAgent } from '@darkpatternhunter/web/puppeteer';
import { createAgent } from '@darkpatternhunter/web/playwright';
import { AgentOverChromeBridge } from '@darkpatternhunter/web/bridge-mode';
```

**Integration Points**:
- `puppeteer/` - Puppeteer adapter
- `playwright/` - Playwright adapter
- `bridge-mode/` - Chrome extension bridge
- `static/` - Static mode (no browser)

#### `@darkpatternhunter/android` - Android Integration

**Purpose**: Android device automation.

**Key Features**:
- ADB integration
- Device control
- Screenshot capture
- Touch and input simulation

**Main Exports**:
```typescript
import { createAgent } from '@darkpatternhunter/android';
import { AndroidDevice } from '@darkpatternhunter/android';
```

**Dependencies**:
- `appium-adb` - ADB JavaScript bridge
- `yadb` - Fast text input tool

#### `@darkpatternhunter/ios` - iOS Integration

**Purpose**: iOS device and simulator automation.

**Key Features**:
- WebDriverAgent integration
- iOS Simulator support
- Device control
- Screenshot capture

**Main Exports**:
```typescript
import { createAgent } from '@darkpatternhunter/ios';
import { IOSDevice } from '@darkpatternhunter/ios';
```

#### `@darkpatternhunter/cli` - Command-Line Interface

**Purpose**: Command-line tooling for YAML-driven automation and related workflows (when present in your workspace checkout).

**Features** (typical):
- Run YAML scripts
- Batch execution
- HTTP server for reports
- Interactive mode

**Usage**: This fork’s published binaries may differ. Prefer `pnpm run` / Nx targets from the root `package.json`, and the `dph-playground` bin from `@darkpatternhunter/web` where applicable. For YAML execution, use the APIs under `@darkpatternhunter/core/yaml` from a small Node host script if no global CLI is installed.

#### `@darkpatternhunter/visualizer` - Visualization Components

**Purpose**: React components for visualizing automation execution.

**Key Components**:
- `UniversalPlayground` - Interactive playground
- `Player` - Execution replay player
- `Logo` - Branding component
- `NavActions` - Navigation actions
- `EnvConfig` - Environment configuration UI

**Usage**:
```typescript
import { UniversalPlayground, Player } from '@darkpatternhunter/visualizer';
```

#### `@darkpatternhunter/playground` - Playground SDK

**Purpose**: SDK for building playground applications.

**Features**:
- Playground server implementation
- SDK for client applications
- Storage providers (LocalStorage, IndexedDB)
- Context providers

#### `@darkpatternhunter/mcp` - MCP Server

**Purpose**: Model Context Protocol server implementation.

**Features**:
- MCP protocol implementation
- Tools for web automation
- Resource management
- Prompt templates

#### `@darkpatternhunter/recorder` - Recording Utilities

**Purpose**: Utilities for recording user interactions.

**Features**:
- Event recording
- Script generation
- Interaction capture

### Supporting Packages

- `@darkpatternhunter/webdriver` - WebDriver utilities
- `@darkpatternhunter/evaluation` - Evaluation and testing tools
- `@darkpatternhunter/android-playground` - Android playground server
- `@darkpatternhunter/ios-playground` - iOS playground server

---

## 🖥️ Applications Overview

### `apps/report` - Report Visualization App

**Purpose**: Visualize and debug automation execution reports.

**Features**:
- Interactive timeline
- Execution replay
- Screenshot viewer
- Action details panel
- Side-by-side comparison

**Tech Stack**:
- React + TypeScript
- Ant Design
- react-resizable-panels
- Less for styling

**Usage**:
```bash
cd apps/report
pnpm run dev
```

### `apps/playground` - Web Playground

**Purpose**: Interactive playground for testing web automation.

**Features**:
- Universal Playground integration
- Screenshot viewer
- Real-time execution
- Server connection management

**Tech Stack**:
- React + TypeScript
- Ant Design
- Socket.IO client

### `apps/android-playground` - Android Playground

**Purpose**: Interactive playground for Android device automation.

**Features**:
- Android device control
- Scrcpy integration (screen mirroring)
- Real-time device interaction
- Playground integration

**Tech Stack**:
- React + TypeScript
- Socket.IO
- Scrcpy server

### `apps/chrome-extension` - Chrome Extension

**Purpose**: Browser extension for quick automation experience.

**Features**:
- Bridge mode for browser control
- Popup interface
- Event recording
- Script generation

**Tech Stack**:
- React + TypeScript
- Chrome Extension APIs
- Content scripts

### `apps/recorder-form` - Recorder Form

**Purpose**: Form-based recorder for capturing interactions.

**Features**:
- Canvas-based selection
- Form recording
- Interaction capture

### `apps/site` - Documentation Site

**Purpose**: Official documentation website.

**Tech Stack**:
- RSPress (documentation framework)
- MDX for content
- Multi-language support (EN/ZH)

---

## 🚀 Installation & Setup

### Prerequisites

- **Node.js**: >=18.19.0 (recommended: 20.9.0)
- **pnpm**: >=9.3.0
- **Git**: For cloning the repository

### Installation Steps

1. **Clone the repository**:
```bash
git clone https://github.com/darkpatternhunter/dark-pattern-hunter.git
cd dark-pattern-hunter
```

2. **Enable pnpm**:
```bash
corepack enable
```

3. **Install dependencies**:
```bash
pnpm install
```

This will:
- Install all dependencies
- Create symlinks between packages
- Build all packages (via `prepare` script)

4. **Set up environment variables** (for AI testing):
Copy `env.example` to `.env` in the project root and update the values:
```bash
cp env.example .env
```
The file includes the OpenAI credentials plus real-time playground defaults (target URL, port, viewport, etc.).

### Verify Installation

```bash
# Check Node.js version
node -v  # Should be >=18.19.0

# Check pnpm version
pnpm -v  # Should be >=9.3.0

# Run tests
pnpm run test
```

### Real-time Playground Runner (custom sites)

Run a live Puppeteer session against any website and expose it to the Playground UI:

```bash
# Terminal 1 – frontend
pnpm --filter playground dev

# Terminal 2 – backend agent
pnpm playground:realtime --url https://www.daraz.pk/ --headed
```

The backend command picks defaults from `.env` (see `env.example`) and supports overrides via CLI flags:

| Flag | Description |
| --- | --- |
| `--url`, `-u` | Target website to automate |
| `--port`, `-p` | Preferred playground server port (auto-falls back if busy) |
| `--headed` | Launch browser window for debugging |
| `--open-browser` | Automatically open the Playground UI to the backend URL |
| `--viewport-width` / `--viewport-height` | Custom viewport dimensions |

The Playground UI now auto-connects to the backend using `PLAYGROUND_UI_SERVER_URL` (see `.env`). Update that value if you change the backend port/host, then restart the frontend build. No manual “Environment Config” steps are needed anymore.

---

## 💻 Development Workflow

### Development Commands

#### Build Commands

```bash
# Build all packages
pnpm run build

# Build without cache (if you see circular dependency issues)
pnpm run build:skip-cache

# Watch mode (build on file changes)
pnpm run dev
```

#### Build Individual Packages

```bash
# Build a specific package
npx nx build @darkpatternhunter/web

# Build with watch mode
npx nx build @darkpatternhunter/web --watch
```

#### Run Applications

```bash
# Run report app
cd apps/report
pnpm run dev

# Run playground
cd apps/playground
pnpm run dev

# Run Android playground
cd apps/android-playground
pnpm run dev
```

### Development Best Practices

1. **Use watch mode** for active development:
   ```bash
   pnpm run dev
   ```

2. **Build before testing**:
   ```bash
   pnpm run build
   pnpm run test
   ```

3. **Check linting**:
   ```bash
   pnpm run lint
   ```

4. **Format code** (automatic on commit via hooks):
   ```bash
   pnpm run format
   ```

---

## 🎨 Key Features

### 1. Visual-Driven Automation

Dark Pattern Hunter uses visual language models to understand UI from screenshots:

```typescript
// No DOM selectors needed!
await agent.aiClick('the login button');
await agent.aiTap('the submit button');
```

### 2. Multiple Integration Modes

#### Web - Puppeteer
```typescript
import { createAgent } from '@darkpatternhunter/web/puppeteer';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch();
const page = await browser.newPage();
const agent = await createAgent(page);
```

#### Web - Playwright
```typescript
import { createAgent } from '@darkpatternhunter/web/playwright';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const agent = await createAgent(page);
```

#### Web - Bridge Mode (Chrome Extension)
```typescript
import { AgentOverChromeBridge } from '@darkpatternhunter/web/bridge-mode';

const agent = new AgentOverChromeBridge();
await agent.connect();
```

#### Android
```typescript
import { createAgent } from '@darkpatternhunter/android';

const agent = await createAgent({
  deviceId: 'your-device-id'
});
```

#### iOS
```typescript
import { createAgent } from '@darkpatternhunter/ios';

const agent = await createAgent({
  deviceId: 'your-device-id'
});
```

### 3. Two Automation Styles

#### Auto Planning (High-Level)
```typescript
// Let AI plan and execute
await agent.aiAction('click all the records one by one. If one record contains the text "completed", skip it');
```

#### Workflow Style (Structured)
```typescript
// More control, better stability
const recordList = await agent.aiQuery('string[], the record list');
for (const record of recordList) {
  const hasCompleted = await agent.aiBoolean(`check if the record ${record} contains the text "completed"`);
  if (!hasCompleted) {
    await agent.aiTap(record);
  }
}
```

### 4. YAML Scripting

Write automation scripts in YAML:

```yaml
name: Login Test
steps:
  - action: aiClick
    prompt: "the login button"
  - action: aiType
    prompt: "the username field"
    text: "user@example.com"
  - action: aiType
    prompt: "the password field"
    text: "password123"
  - action: aiClick
    prompt: "the submit button"
```

Run YAML flows via a host script or package script that invokes `@darkpatternhunter/core` (this workspace may not ship a separate global CLI).

### 5. Visual Reports

Generate and view detailed execution reports:

```typescript
import { generateReport } from '@darkpatternhunter/core/report';

const report = await generateReport(executionData);
// Save report as HTML
```

### 6. Caching

Enable caching for faster re-execution:

```typescript
const agent = await createAgent(page, {
  cache: true,
  cacheDir: './cache'
});
```

---

## 🔌 API Overview

### Core Agent API

#### Interaction Methods

```typescript
// Click/Tap
await agent.aiClick(prompt: string, options?: ClickOptions);
await agent.aiTap(prompt: string, options?: TapOptions);

// Type/Input
await agent.aiType(prompt: string, text: string, options?: TypeOptions);

// Scroll
await agent.aiScroll(prompt: string, direction?: 'up' | 'down' | 'left' | 'right');

// Action (high-level planning)
await agent.aiAction(instruction: string);
```

#### Data Extraction

```typescript
// Query data
const data = await agent.aiQuery<T>(prompt: string, schema?: Schema);

// Boolean check
const result = await agent.aiBoolean(prompt: string);

// Extract text
const text = await agent.aiExtractText(prompt: string);
```

#### Utility Methods

```typescript
// Wait for element
await agent.aiWaitFor(prompt: string, timeout?: number);

// Locate element
const location = await agent.aiLocate(prompt: string);

// Assert
await agent.aiAssert(condition: string);
```

### Device API

```typescript
// Screenshot
const screenshot = await device.screenshot();

// Get UI tree
const tree = await device.getUITree();

// Get page info
const info = await device.getPageInfo();
```

---

## 🧪 Testing

### Unit Tests

```bash
# Run all unit tests
pnpm run test

# Run tests for a specific package
npx nx test @darkpatternhunter/web

# Run with AI features (requires .env)
pnpm run test:ai
```

### E2E Tests

```bash
# Run Playwright E2E tests
pnpm run e2e

# Run with cache
pnpm run e2e:cache

# Run with report generation
pnpm run e2e:report

# Run with UI mode
npx nx e2e @darkpatternhunter/web --ui
```

### Test Structure

```
packages/[package-name]/
├── tests/
│   ├── unit-test/     # Unit tests
│   └── ai/            # AI integration tests
```

---

## 🔧 Build System

### Nx Configuration

**Nx** orchestrates builds in this repo:

- **Task Dependencies**: Automatically handles build order
- **Caching**: Builds are cached for faster subsequent builds
- **Parallel Execution**: Builds run in parallel when possible

### Rsbuild/Rslib

- **Rsbuild**: For application builds (apps)
- **Rslib**: For library builds (packages)

### Build Outputs

- **ES Modules**: `dist/es/`
- **CommonJS**: `dist/lib/`
- **TypeScript Types**: `dist/types/`

---

## 🤝 Contributing

### Getting Started

1. **Fork the repository**
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/dark-pattern-hunter.git
   cd dark-pattern-hunter
   ```

3. **Create a branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **Make changes and test**:
   ```bash
   pnpm run build
   pnpm run test
   pnpm run lint
   ```

5. **Commit** (follows Conventional Commits):
   ```bash
   git commit -m "feat(scope): your commit message"
   ```

6. **Push and create PR**

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

**Types**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, etc.

**Scopes**: `web`, `android`, `ios`, `cli`, `core`, `mcp`, `bridge`, etc.

**Examples**:
- `feat(web): add screenshot caching`
- `fix(android): correct adb connection timeout`
- `docs(cli): update usage examples`

### Code Style

- **Linter**: Biome
- **Formatter**: Biome (auto-format on commit)
- **TypeScript**: Strict mode enabled

### Testing Requirements

- Add tests for new features
- Ensure all tests pass
- Run AI tests if modifying AI-related code

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

---

## 🐛 Troubleshooting

### Common Issues

#### 1. `REPLACE_ME_WITH_REPORT_HTML` in reports

**Cause**: Circular dependency issue

**Solution**:
```bash
pnpm run build:skip-cache
```

#### 2. Build failures

**Solution**:
```bash
# Clean and rebuild
rm -rf node_modules
rm -rf packages/*/dist
rm -rf apps/*/dist
pnpm install
pnpm run build
```

#### 3. Test failures with AI

**Solution**: Ensure `.env` file exists with valid API keys:
```env
OPENAI_API_KEY="your_key"
# Model and provider keys: copy variable names and values from env.example (see `@darkpatternhunter/shared/env` for identifiers).
```

#### 4. pnpm version mismatch

**Solution**:
```bash
corepack enable
corepack prepare pnpm@9.3.0 --activate
```

#### 5. Nx cache issues

**Solution**:
```bash
npx nx reset
pnpm run build
```

---

## 📚 Additional Resources

### Documentation

- **Official site & docs**: [https://darkpatternhunter.dev](https://darkpatternhunter.dev)
- **API reference**: [https://darkpatternhunter.dev/api](https://darkpatternhunter.dev/api)
- **Examples**: [https://github.com/darkpatternhunter/example](https://github.com/darkpatternhunter/example)

### Community

- **GitHub**: [darkpatternhunter/dark-pattern-hunter](https://github.com/darkpatternhunter/dark-pattern-hunter)

---

## 📝 License

Dark Pattern Hunter is [MIT licensed](./LICENSE).

---

## 🙏 Credits

Dark Pattern Hunter is built on top of amazing open-source projects:


- [Rsbuild](https://github.com/web-infra-dev/rsbuild) & [Rslib](https://github.com/web-infra-dev/rslib) - Build tools
- [UI-TARS](https://github.com/bytedance/ui-tars) - Open-source agent model
- [Qwen-VL](https://github.com/QwenLM/Qwen-VL) - Visual language model
- [scrcpy](https://github.com/Genymobile/scrcpy) - Android screen mirroring
- [Puppeteer](https://github.com/puppeteer/puppeteer) - Browser automation
- [Playwright](https://github.com/microsoft/playwright) - Browser automation & testing

---

## 📊 Project Statistics

- **Total Packages**: 13+ packages
- **Total Applications**: 6 applications
- **Lines of Code**: ~50,000+ (estimated)
- **Test Coverage**: Comprehensive unit and E2E tests
- **Supported Platforms**: Web, Android, iOS
- **Supported Models**: Qwen-VL, UI-TARS, Gemini, Doubao-Vision, and more

---

## 🎯 Quick Start Examples

### Example 1: Web Automation with Playwright

```typescript
import { createAgent } from '@darkpatternhunter/web/playwright';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://example.com');

const agent = await createAgent(page);
await agent.aiClick('the login button');
await agent.aiType('username field', 'user@example.com');
await agent.aiType('password field', 'password123');
await agent.aiClick('submit button');

await browser.close();
```

### Example 2: Android Automation

```typescript
import { createAgent } from '@darkpatternhunter/android';

const agent = await createAgent({ deviceId: 'device-id' });
await agent.aiTap('the settings icon');
await agent.aiScroll('down');
await agent.aiTap('the about option');
const version = await agent.aiQuery('string, the app version');
console.log('App version:', version);
```

### Example 3: YAML Script

```yaml
name: E-commerce Test
steps:
  - action: aiClick
    prompt: "the search box"
  - action: aiType
    prompt: "the search input"
    text: "laptop"
  - action: aiClick
    prompt: "the search button"
  - action: aiQuery
    prompt: "array of product names"
    saveAs: products
```

Run via your project’s script or core YAML API (see `@darkpatternhunter/core/yaml`).


---

**Made with ❤️ by the Dark Pattern Hunter team**
