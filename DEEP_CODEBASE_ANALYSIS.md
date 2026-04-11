# Deep Codebase Analysis: Dark Pattern Hunter

## 🎯 Project Overview

**Dark Pattern Hunter** is a **visual-driven AI automation framework** that detects, analyzes, and documents manipulative UI patterns (dark patterns) across web, Android, and iOS platforms. Your specific implementation focuses on **Pakistani e-commerce websites** with support for **English, Urdu (Perso-Arabic), and Roman Urdu** languages.

---

## 🏗️ Architecture Overview

### **Monorepo Structure (Nx + pnpm workspaces)**

```
dark-pattern-hunter/
├── apps/
│   └── chrome-extension/          # Chrome Extension (Main UI)
├── packages/
│   ├── core/                      # Core AI agent & automation engine
│   ├── shared/                    # Shared utilities (DB, image processing, env)
│   ├── web-integration/           # Web automation (Puppeteer/Playwright)
│   ├── recorder/                  # UI recording components
│   ├── visualizer/                # Visualization tools
│   └── playground/                # Testing/development playground
```

---

## 🔍 Core Components Deep Dive

### 1. **Chrome Extension (`apps/chrome-extension/`)**

#### **Purpose:**
- **Primary interface** for dataset collection
- **Browser-based** dark pattern detection
- **Local storage** of collected data (IndexedDB)
- **Export functionality** for research datasets

#### **Key Files:**

##### **`src/extension/dataset-collection/index.tsx`** (Main Component)
**This is the heart of your dataset collection system.**

**What it does:**
1. **Captures page data:**
   - Screenshots via `chrome.tabs.captureVisibleTab()`
   - DOM extraction via `chrome.scripting.executeScript()`
   - Page metadata (title, viewport, user agent)

2. **AI-powered analysis:**
   - Sends screenshot + DOM to AI model (GPT-4o, UI-TARS, etc.)
   - Uses comprehensive dark pattern taxonomy (13+ categories)
   - Detects patterns in English, Urdu, and Roman Urdu
   - Returns structured JSON with patterns, severity, confidence

3. **Data storage:**
   - Stores entries in IndexedDB (`dph_dataset` database)
   - Each entry contains: URL, timestamp, screenshot, DOM, detected patterns, metadata

4. **Website crawling:**
   - **Quick Scan:** Current page only (~50-200 links)
   - **Deep Scan:** Scrolls page, waits for dynamic content, clicks "Load More" (~200-1000 links)
   - **Full Website Crawl:** Recursively visits ALL pages on the website (thousands of pages)

5. **Data export:**
   - **JSON (Full):** Complete dataset with all data
   - **Text Dataset (JSONL):** Flattened per-pattern format for training
   - **Bundle (ZIP):** Images + manifest + JSONL for complete dataset

**Key Functions:**
```typescript
// Main analysis function
analyzePageForDarkPatterns(screenshot, dom, modelConfig, url)
  → Calls AI model with visual prompt
  → Returns { patterns: DarkPattern[], summary: {...} }

// Page capture
capturePageData(tabId)
  → Captures screenshot (base64 PNG)
  → Extracts DOM (first 10k chars)
  → Collects metadata

// Recursive crawling
performRecursiveWebsiteCrawl(startTabId, startUrl)
  → Maintains visited URLs set
  → Queue-based BFS crawling
  → Normalizes URLs to avoid duplicates
  → Filters out API endpoints, static files
  → Real-time progress tracking
```

**Dark Pattern Taxonomy (13 categories):**
1. **Nagging** - Repetitive popups/banners; Dead End/Roach Motel
2. **Price Comparison Prevention** - Hiding/obfuscating comparison info
3. **Disguised Ad / Bait & Switch** - Ads styled as content
4. **Reference Pricing** - "was/now", strikethrough anchor price
5. **False Hierarchy** - Primary CTA overly dominant
6. **Bundling / Auto-add / Bad Defaults** - Pre-selected add-ons
7. **Pressured Selling / FOMO / Urgency** - Urgent language, timers
8. **Scarcity & Popularity** - Low stock/high demand indicators
9. **Hard To Close** - Tiny/hidden/misplaced close buttons
10. **Trick Questions / Confirmshaming** - Shaming/ambiguous opt-out
11. **Hidden Information** - Fees/terms in fine print
12. **Infinite Scrolling** - Endless feed without pagination
13. **Forced Ads** - Watch ads/pay to avoid; Autoplay media

##### **`src/utils/datasetDB.ts`** (Data Storage)
**IndexedDB wrapper for dataset entries.**

**Data Structure:**
```typescript
interface DatasetEntry {
  id: string;                    // Unique ID
  url: string;                   // Page URL
  timestamp: number;              // Unix timestamp
  screenshot?: string;            // Base64 PNG
  dom?: string;                   // HTML (first 10k chars)
  patterns: DarkPattern[];       // Detected patterns
  metadata?: {
    pageTitle?: string;
    viewport?: { width, height };
    userAgent?: string;
    researchContext?: {
      isPakistaniEcommerce?: boolean;
      siteName?: string;
      modelUsed?: string;         // e.g., "gpt-4o", "ui-tars"
      analysisVersion?: string;  // e.g., "2.2"
    };
  };
  summary?: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}

interface DarkPattern {
  type: string;                  // Pattern category
  description: string;           // Detailed description
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;              // Where on page
  evidence: string;               // Exact text/element
  confidence?: number;            // 0-1 score (filtered > 0.7)
  bbox?: [x, y, width, height];  // Optional bounding box
}
```

**Export Functions:**
- `exportDatasetAsJSON()` - Full JSON array
- `exportTextDatasetAsJSONL()` - Flattened per-pattern format (for training)
- `exportDatasetAsBundleZip()` - ZIP with images + manifest + JSONL

---

### 2. **Core Package (`packages/core/`)**

#### **Purpose:**
- **AI agent engine** for automation
- **Visual Language Model (VLM) integration**
- **Task planning and execution**
- **UI interaction methods**

#### **Key Components:**

##### **`src/agent/agent.ts`** (Main Agent Class)
**The automation brain.**

**Capabilities:**
- **Visual AI actions:** `aiTap()`, `aiType()`, `aiSwipe()`, `aiScroll()`
- **Data extraction:** `aiQuery()`, `aiBoolean()`, `aiExtract()`
- **Planning:** Auto-generates step-by-step plans from natural language
- **Caching:** Reuses screenshots/contexts for efficiency
- **Reporting:** Generates HTML reports with annotated screenshots

**Key Methods:**
```typescript
class Agent {
  // Visual interactions
  async aiTap(prompt: string) → Locates element from screenshot, clicks it
  async aiType(text: string) → Types text into focused input
  async aiScroll(direction: 'up' | 'down') → Scrolls page
  
  // Data extraction
  async aiQuery<T>(schema: string) → Extracts structured data
  async aiBoolean(prompt: string) → Returns true/false
  async aiExtract(options) → Extracts UI elements
  
  // Planning
  async aiAction(prompt: string) → Plans and executes multi-step actions
}
```

##### **`src/ai-model/service-caller/index.ts`** (AI Model Integration)
**Handles actual API calls to AI models.**

**Supported Models:**
1. **OpenAI (GPT-4o, GPT-4 Vision)**
   - Via `openai` SDK
   - Supports custom base URLs (for local models)
   - Vision API for image analysis

2. **Anthropic (Claude)**
   - Via `@anthropic-ai/sdk`
   - Vision support

3. **Azure OpenAI**
   - Key-based and keyless authentication
   - Enterprise deployments

4. **UI-TARS (Local)**
   - Custom base URL: `http://localhost:8000/v1`
   - Open-source visual agent model
   - Your planned model for fine-tuning

**Key Function:**
```typescript
async function createChatClient({ AIActionTypeValue, modelConfig })
  → Creates OpenAI/Anthropic client
  → Configures proxy (HTTP/SOCKS)
  → Returns client with model info
```

##### **`src/ai-model/index.ts`** (AI Model Interface)
**High-level API for AI calls.**

**Key Function:**
```typescript
callAIWithObjectResponse<T>(prompt, actionType, modelConfig)
  → Calls AI model with prompt
  → Parses JSON response
  → Validates schema
  → Returns typed object
```

**Used by dataset collection:**
```typescript
// In dataset-collection/index.tsx
const response = await callAIWithObjectResponse<{
  patterns: DarkPattern[];
  summary?: any;
}>(prompt, AIActionType.EXTRACT_DATA, modelConfig);
```

---

### 3. **Shared Package (`packages/shared/`)**

#### **Purpose:**
- **Common utilities** used across packages
- **IndexedDB management**
- **Image processing**
- **Environment configuration**

#### **Key Components:**

##### **`src/baseDB.ts`** (IndexedDB Manager)
**Database abstraction layer.**

```typescript
class IndexedDBManager {
  async getAll<T>(storeName, includeDeleted?) → Get all records
  async put(storeName, data) → Store/update record
  async delete(storeName, key) → Delete record
  async clear(storeName) → Clear all records
  async count(storeName) → Get record count
}
```

##### **`src/env/`** (Environment & Model Config)
**Model configuration management.**

```typescript
class ModelConfigManager {
  getModelConfig(name: 'default') → Returns IModelConfig
  setModelConfig(name, config) → Updates config
}

interface IModelConfig {
  modelName: string;              // e.g., "gpt-4o", "ui-tars"
  openaiApiKey?: string;
  openaiBaseURL?: string;         // For local models (UI-TARS)
  modelDescription?: string;
  vlMode?: 'high' | 'low' | 'auto';
  uiTarsModelVersion?: string;
  // ... proxy, Azure, Anthropic configs
}
```

---

## 🔄 Data Flow: How It Works

### **Single Page Analysis Flow:**

```
1. User clicks "Analyze Current Page"
   ↓
2. Extension captures:
   - Screenshot (base64 PNG)
   - DOM (HTML structure)
   - Metadata (title, viewport, URL)
   ↓
3. Builds AI prompt:
   - DARK_PATTERN_PROMPT (taxonomy + instructions)
   - Screenshot (image_url)
   - DOM text
   - URL context
   ↓
4. Calls AI model (GPT-4o/UI-TARS):
   - callAIWithObjectResponse()
   - Model analyzes visual + textual content
   - Returns JSON: { patterns: [...], summary: {...} }
   ↓
5. Filters patterns (confidence > 0.7)
   ↓
6. Stores in IndexedDB:
   - DatasetEntry with all data
   - Research metadata (site name, model used, version)
   ↓
7. Updates UI:
   - Shows detected patterns
   - Updates statistics
   - Adds to entry list
```

### **Batch Processing Flow:**

```
1. User clicks "Batch Process (Auto Crawl)"
   ↓
2. Choose crawling strategy:
   - Quick Scan / Deep Scan / Full Website Crawl
   ↓
3. Link Discovery:
   - Quick: Extract <a> tags from current page
   - Deep: Scroll, wait, click "Load More", extract all links
   - Full: Recursive BFS crawl of entire website
   ↓
4. URL Queue Processing:
   - For each URL:
     a. Open in new tab (background)
     b. Wait for page load
     c. Capture screenshot + DOM
     d. Analyze with AI
     e. Store entry
     f. Close tab
   ↓
5. Progress tracking:
   - Shows current/total
   - Displays current URL
   - Updates statistics
   ↓
6. Completion:
   - Shows success/fail counts
   - Updates entry list
```

### **Recursive Website Crawl Flow:**

```
1. Start from current page URL
   ↓
2. Initialize:
   - visitedUrls = Set()
   - urlQueue = [startUrl]
   ↓
3. While queue not empty:
   a. Dequeue next URL
   b. Normalize URL (remove fragments, trailing slashes)
   c. If already visited → skip
   d. Mark as visited
   e. Open in new tab
   f. Wait for load
   g. Extract all links from page
   h. Filter links (same origin, not API endpoints)
   i. Add new links to queue
   j. Capture + analyze page
   k. Store entry
   l. Close tab
   m. Update progress (discovered, visited, queue)
   ↓
4. Safety limits:
   - maxPages = 5000 (configurable)
   - delayBetweenPages = 2000ms
   - Filters out: /api/, /ajax/, static files, etc.
```

---

## 🤖 AI Model Integration

### **How AI Models Are Used:**

1. **Visual Analysis:**
   - Screenshot sent as `image_url` in message
   - Model "sees" the actual UI
   - Analyzes visual elements (buttons, popups, timers, badges)

2. **Textual Analysis:**
   - DOM structure sent as text
   - Model reads HTML content
   - Detects text-based patterns (urgency language, hidden fees)

3. **Multi-language Support:**
   - English: Standard detection
   - Urdu (Perso-Arabic): "زیادہ دیکھیں", "فوری خریدیں"
   - Roman Urdu: "Jaldi karein", "Aakhri mauqa", "Fori khareedain"

4. **Structured Output:**
   - Model returns JSON with exact schema
   - Validated by `assertSchema()`
   - Confidence scores filtered (> 0.7)

### **Prompt Engineering:**

The `DARK_PATTERN_PROMPT` includes:
- **Taxonomy:** 13 dark pattern categories
- **Language examples:** English, Urdu, Roman Urdu
- **Evidence requirements:** Exact text/element descriptions
- **Output format:** Strict JSON schema
- **Confidence threshold:** Only patterns > 0.7

---

## 📊 Statistics & Analytics

### **Calculated Statistics:**

```typescript
{
  totalEntries: number;              // Total pages scanned
  totalPatterns: number;              // Total patterns found
  prevalenceRate: number;             // % of pages with patterns
  pakistaniSitesScanned: number;     // PK e-commerce sites
  categoryBreakdown: Record<string, number>;  // Pattern type counts
}
```

### **UI Features:**

1. **Pattern Counts Card:**
   - Shows frequency of each pattern type
   - Sorted by count (highest first)
   - Tag-based display

2. **Filter by Pattern:**
   - Dropdown to filter entries by pattern type
   - "All Patterns" option
   - Real-time filtering

3. **Progress Tracking:**
   - Batch processing progress bar
   - Recursive crawl statistics (discovered/visited/queue)
   - Current URL display

---

## 🗄️ Data Storage & Export

### **Storage (IndexedDB):**
- **Database:** `dph_dataset`
- **Store:** `dataset_entries`
- **Key:** `id` (unique per entry)
- **Persistence:** Local browser storage (survives extension reloads)

### **Export Formats:**

1. **JSON (Full):**
   ```json
   [
     {
       "id": "entry-...",
       "url": "https://...",
       "timestamp": 1234567890,
       "screenshot": "data:image/png;base64,...",
       "dom": "<html>...",
       "patterns": [...],
       "metadata": {...},
       "summary": {...}
     }
   ]
   ```

2. **Text Dataset (JSONL):**
   - One line per pattern (flattened)
   - Format: `{ id, url, pattern_type, severity, evidence, description, ... }`
   - **Purpose:** Training data for fine-tuning

3. **Bundle (ZIP):**
   ```
   dataset-bundle.zip
   ├── manifest.json          # All entries metadata
   ├── processed.jsonl        # Flattened JSONL
   └── images/
       ├── entry_1.png
       ├── entry_2.png
       └── ...
   ```

---

## 🔧 Build & Development

### **Build System:**
- **Monorepo:** Nx + pnpm workspaces
- **Build Tool:** Rsbuild (Rust-based, fast)
- **TypeScript:** Full type safety
- **Bundling:** Webpack-like (via Rsbuild)

### **Build Commands:**
```bash
# Build all packages
pnpm run build

# Build Chrome extension only
cd apps/chrome-extension
pnpm run build

# Development (watch mode)
pnpm run dev
```

### **Extension Loading:**
1. Build: `pnpm run build` in `apps/chrome-extension`
2. Load unpacked: `chrome://extensions/` → Load unpacked → Select `apps/chrome-extension/dist`
3. Or use the packaged ZIP under `extension_output/` (name matches your build version)

---

## 🎯 Your Specific Use Case

### **Research Context:**
- **Focus:** Pakistani e-commerce dark patterns
- **Languages:** English, Urdu (Perso-Arabic), Roman Urdu
- **Phase 1:** Data collection with GPT-4o
- **Phase 2:** Fine-tune UI-TARS on collected data
- **Phase 3:** Deploy fine-tuned model

### **Current Status:**
- ✅ **Dataset Collection:** Fully functional
- ✅ **Multi-language Support:** English, Urdu, Roman Urdu
- ✅ **Website Crawling:** Quick, Deep, Full recursive crawl
- ✅ **Pattern Taxonomy:** 13 categories (aligned with CSV)
- ✅ **Statistics & Filtering:** Pattern frequency, filter by type
- ✅ **Export:** JSON, JSONL, ZIP bundle
- ✅ **AI Integration:** GPT-4o (current), UI-TARS ready

### **Next Steps (Your Plan):**
1. **Collect dataset** using GPT-4o (current phase)
2. **Export data** in JSONL format for training
3. **Fine-tune UI-TARS** on collected dataset
4. **Switch to fine-tuned UI-TARS** for future collection
5. **Evaluate** model performance on test set

---

## 🔑 Key Technical Concepts

### **1. Visual-Driven AI:**
- Uses **screenshots** instead of DOM selectors
- Models "see" the UI like humans
- More robust to UI changes
- Works across platforms (web, mobile)

### **2. Fully Automated:**
- **No scripts:** All detection by AI models
- **No dummy data:** Real screenshots, real DOM, real AI analysis
- **No hardcoded patterns:** AI identifies patterns dynamically

### **3. Monorepo Architecture:**
- **Shared code:** Core logic in `packages/core`
- **Platform-specific:** Extension in `apps/chrome-extension`
- **Reusable:** Same agent works for web, Android, iOS

### **4. IndexedDB Storage:**
- **Client-side:** No server required
- **Persistent:** Survives browser restarts
- **Large capacity:** Can store thousands of entries with screenshots

### **5. Recursive Crawling:**
- **BFS algorithm:** Breadth-first search of website
- **URL normalization:** Prevents duplicates
- **Smart filtering:** Skips API endpoints, static files
- **Progress tracking:** Real-time statistics

---

## 📝 Summary

**What you're building:**
A **research-grade dataset collection system** for Pakistani e-commerce dark patterns, using **AI-powered visual analysis** to automatically detect manipulative UI patterns across entire websites.

**How it works:**
1. **Capture** page screenshots and DOM
2. **Analyze** with AI models (GPT-4o → UI-TARS)
3. **Store** in IndexedDB with full metadata
4. **Export** for training/fine-tuning
5. **Crawl** entire websites recursively

**Key strengths:**
- ✅ Fully automated (no manual labeling)
- ✅ Multi-language support (English, Urdu, Roman Urdu)
- ✅ Comprehensive taxonomy (13+ pattern types)
- ✅ Scalable (recursive website crawling)
- ✅ Research-ready (structured exports, metadata)

**Your workflow:**
1. **Collect** → Use extension to scan Pakistani e-commerce sites
2. **Export** → Download JSONL for training
3. **Fine-tune** → Train UI-TARS on collected data
4. **Deploy** → Use fine-tuned model for future collection

---

This is a **production-ready, research-grade system** for automated dark pattern detection and dataset creation. The architecture is solid, the AI integration is robust, and the data pipeline is complete. You're ready to collect your dataset! 🚀

