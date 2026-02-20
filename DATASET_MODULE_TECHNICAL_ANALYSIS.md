# Dataset Module - Comprehensive Technical Analysis

## Executive Summary

This document provides an exhaustive technical analysis of the dataset collection module within the Dark Pattern Hunter Chrome extension. The module enables systematic collection, annotation, and export of dark pattern training data for machine learning model development.

**Primary Files Analyzed:**
- `apps/chrome-extension/src/extension/dataset-collection/index.tsx` (1,600+ lines)
- `apps/chrome-extension/src/utils/datasetDB.ts` (400+ lines)
- `apps/chrome-extension/src/extension/dataset-collection/BboxEditor.tsx` (300+ lines)
- `packages/shared/src/baseDB.ts` (158 lines)
- `packages/shared/src/env/constants.ts` (300+ lines)

---

## Table of Contents

1. [Architecture & Data Flow](#1-architecture--data-flow)
2. [TypeScript Interfaces & Data Structures](#2-typescript-interfaces--data-structures)
3. [IndexedDB Schema Design](#3-indexeddb-schema-design)
4. [UI/UX Implementation Patterns](#4-uiux-implementation-patterns)
5. [AI/ML Pipeline Integration](#5-aiml-pipeline-integration)
6. [Data Export/Import Mechanisms](#6-data-exportimport-mechanisms)
7. [Error Handling & Validation](#7-error-handling--validation)
8. [Performance Optimization](#8-performance-optimization)
9. [Security & Privacy Considerations](#9-security--privacy-considerations)
10. [Extension Points & Customization](#10-extension-points--customization)

---

## 1. Architecture & Data Flow

### 1.1 System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Dataset Collection Architecture                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    React Component Layer                             │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │   │
│  │  │  Dataset    │  │  BboxEditor │  │  Statistics │  │   Export    │ │   │
│  │  │ Collection  │  │  (Canvas)   │  │   Panel     │  │   Modals    │ │   │
│  │  │  (Main)     │  │             │  │             │  │             │ │   │
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘  └─────────────┘ │   │
│  │         │                │                                           │   │
│  │         └────────────────┘                                           │   │
│  │                   │                                                  │   │
│  └───────────────────┼──────────────────────────────────────────────────┘   │
│                      │                                                      │
│                      ▼                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Data Access Layer                                 │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │   │
│  │  │   datasetDB.ts  │  │  imageCrop.ts   │  │  bboxOverlay.ts     │ │   │
│  │  │  (CRUD Ops)     │  │  (Canvas API)   │  │  (Visualization)    │ │   │
│  │  └────────┬────────┘  └─────────────────┘  └─────────────────────┘ │   │
│  │           │                                                        │   │
│  └───────────┼────────────────────────────────────────────────────────┘   │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Storage Layer (IndexedDB)                         │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  Database: midscene_dataset                                  │   │   │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │   │   │
│  │  │  │  Object Store: dataset_entries                         │ │   │   │
│  │  │  │  - Key: id (string)                                    │ │   │   │
│  │  │  │  - Index: timestamp (non-unique)                       │ │   │   │
│  │  │  └─────────────────────────────────────────────────────────┘ │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Chrome Extension Integration                      │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │   │
│  │  │  Tabs API   │  │ Scripting   │  │  Downloads  │  │  Storage   │ │   │
│  │  │  (Capture)  │  │  (Inject)   │  │  (Export)   │  │  (Local)   │ │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Core AI Integration                               │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  @darkpatternhunter/core/ai-model                            │   │   │
│  │  │  - callAIWithObjectResponse()                                │   │   │
│  │  │  - AIActionType.EXTRACT_DATA                                 │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Dataset Collection Data Flow                          │
└─────────────────────────────────────────────────────────────────────────────┘

PHASE 1: PAGE CAPTURE
─────────────────────
User clicks "Analyze Current Page"
           │
           ▼
    ┌──────────────┐
    │ getCurrentTab│  [chrome.tabs.query]
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │capturePageData│
    │              │
    │ ┌──────────┐ │     ┌─────────────────┐
    │ │Screenshot│ │────►│ captureVisibleTab│ [chrome.tabs API]
    │ └──────────┘ │     └─────────────────┘
    │ ┌──────────┐ │
    │ │   DOM    │ │────►│ executeScript    │ [chrome.scripting]
    │ └──────────┘ │     └─────────────────┘
    │ ┌──────────┐ │
    │ │ Viewport │ │────►│ executeScript    │
    │ └──────────┘ │     └─────────────────┘
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ PageData     │
    │ {screenshot, │
    │  dom,        │
    │  metadata}   │
    └──────┬───────┘

PHASE 2: AI ANALYSIS
────────────────────
           │
           ▼
    ┌──────────────┐
    │analyzePageFor│
    │DarkPatterns  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │Build Prompt  │────► DARK_PATTERN_PROMPT (60+ lines)
    │with taxonomy │      13 pattern types
    └──────┬───────┘      Multi-language support
           │
           ▼
    ┌──────────────┐
    │callAIWithObj │────►│ @darkpatternhunter/core/ai-model
    │ectResponse   │      │ AIActionType.EXTRACT_DATA
    └──────┬───────┘      │ 3 retries with backoff
           │
           ▼
    ┌──────────────┐
    │Parse Response│
    │Validate bbox │────►│ Confidence > 0.7 filter
    │Crop images   │      │ bbox validation
    └──────┬───────┘      │ image cropping
           │
           ▼
    ┌──────────────┐
    │{patterns,   │
    │ summary}     │
    └──────┬───────┘

PHASE 3: STORAGE
────────────────
           │
           ▼
    ┌──────────────┐
    │Create Entry  │
    │DatasetEntry  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │storeDataset  │────►│ IndexedDB.put()
    │Entry         │      │ midscene_dataset
    └──────┬───────┘      │ dataset_entries store
           │
           ▼
    ┌──────────────┐
    │Update UI     │
    │Statistics    │
    └──────────────┘

PHASE 4: EXPORT (Optional)
──────────────────────────
User selects export format
           │
           ▼
    ┌──────────────┐
    │Export Format │
    │Selection     │────►│ JSON / JSONL / ZIP / UI-TARS / COCO / YOLO
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │Generate File │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │chrome.down-  │────►│ User downloads file
    │loads.download│
    └──────────────┘
```

### 1.3 Chrome Extension Integration Points

| API | Permission | Usage | Location |
|-----|------------|-------|----------|
| `chrome.tabs.query` | `tabs` | Get active tab | `getCurrentTab()` |
| `chrome.tabs.captureVisibleTab` | `activeTab` | Screenshot capture | `capturePageData()` |
| `chrome.scripting.executeScript` | `scripting` | DOM extraction | `capturePageData()` |
| `chrome.tabs.create` | `tabs` | Open URLs for crawling | `processUrlQueue()` |
| `chrome.tabs.remove` | `tabs` | Close tabs after capture | `processUrlQueue()` |
| `chrome.downloads.download` | `downloads` | Export dataset | `handleExportBundle()` |
| `chrome.storage.local` | `storage` | Settings persistence | Popup configuration |

---

## 2. TypeScript Interfaces & Data Structures

### 2.1 Core Dataset Types

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 9-44)

```typescript
/**
 * Primary dataset entry interface
 * Represents a single analyzed webpage with detected dark patterns
 */
export interface DatasetEntry {
  /** Unique identifier: entry-${timestamp}-${random} */
  id: string;
  
  /** URL of the analyzed page */
  url: string;
  
  /** Unix timestamp of analysis */
  timestamp: number;
  
  /** Full page screenshot as base64 data URL */
  screenshot?: string;
  
  /** First 10,000 characters of HTML for context */
  dom?: string;
  
  /** Array of detected dark patterns */
  patterns: DarkPattern[];
  
  /** Additional metadata about the analysis */
  metadata?: {
    pageTitle?: string;
    viewport?: { width: number; height: number };
    userAgent?: string;
    researchContext?: {
      isPakistaniEcommerce?: boolean;
      siteName?: string;
      modelUsed?: string;
      analysisVersion?: string;
    };
  };
  
  /** Aggregated statistics from AI analysis */
  summary?: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}
```

### 2.2 Dark Pattern Annotation Type

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 35-44)

```typescript
/**
 * Individual dark pattern detection
 * Aligned with the 13-type taxonomy
 */
export interface DarkPattern {
  /** Pattern type from taxonomy */
  type: string;
  
  /** Human-readable description */
  description: string;
  
  /** Severity classification */
  severity: 'low' | 'medium' | 'high' | 'critical';
  
  /** Location on page (header, product card, etc.) */
  location: string;
  
  /** Exact text/element evidence */
  evidence: string;
  
  /** AI confidence score (0.0 - 1.0) */
  confidence?: number;
  
  /** Bounding box [x, y, width, height] in pixels */
  bbox?: [number, number, number, number];
  
  /** Cropped image showing only this pattern */
  croppedImage?: string;
}
```

### 2.3 UI-TARS Training Format

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 277-291)

```typescript
/**
 * UI-TARS fine-tuning format
 * Individual cropped image per pattern for model training
 */
export interface UITarsTrainingExample {
  /** Path to cropped image */
  image_path: string;
  
  /** Pattern type */
  pattern_type: string;
  
  /** Original bbox coordinates */
  bbox: [number, number, number, number];
  
  /** Human-readable label */
  label: string;
  
  /** Severity level */
  severity: string;
  
  /** Evidence text */
  evidence: string;
  
  /** Associated metadata */
  metadata: {
    url: string;
    page_title?: string;
    site_name?: string;
    original_entry_id?: string;
  };
}

/**
 * Standard UI-TARS format for training
 */
interface UITarsStandardExample {
  prompt: string;
  label: string;
  image_path: string;
  category: string;
  bbox: [number, number, number, number];
  image_id: number;
  annotation_id: number;
}
```

### 2.4 Text-Only Export Format

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 166-182)

```typescript
/**
 * Flattened text-only format for NLP training
 * One record per detected pattern
 */
export interface TextPatternExample {
  id: string;
  url: string;
  page_title?: string;
  site_name?: string;
  pattern_type: string;
  severity: DarkPattern['severity'];
  label: string;
  evidence: string;
  description: string;
  dom_excerpt?: string;
  research_tags?: {
    isPakistaniEcommerce?: boolean;
    modelUsed?: string;
    analysisVersion?: string;
  };
}
```

### 2.5 Export Bundle Format

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 224-233)

```typescript
/**
 * Exported dataset record for bundle creation
 */
export interface ExportedDatasetRecord {
  id: string;
  url: string;
  timestamp: number;
  image_path: string | null;
  dom_excerpt?: string;
  patterns: DarkPattern[];
  summary?: DatasetEntry['summary'];
  metadata?: DatasetEntry['metadata'];
}
```

### 2.6 Bounding Box Types

**File**: `apps/chrome-extension/src/utils/bboxOverlay.ts` (Lines 6-51)

```typescript
/**
 * Visual styling for bounding box rendering
 */
export interface BboxStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  labelBgColor: string;
  labelTextColor: string;
}

/**
 * Bounding box annotation for visualization
 */
export interface BboxAnnotation {
  bbox: [number, number, number, number];
  label: string;
  severity: string;
  id?: string;
}

/**
 * Severity-based color coding
 */
export const SEVERITY_COLORS: Record<string, BboxStyle> = {
  critical: {
    strokeColor: '#ff0000',
    fillColor: 'rgba(255, 0, 0, 0.15)',
    strokeWidth: 3,
    labelBgColor: '#ff0000',
    labelTextColor: '#ffffff',
  },
  high: { /* orange */ },
  medium: { /* yellow */ },
  low: { /* green */ },
};
```

### 2.7 BboxEditor Component Types

**File**: `apps/chrome-extension/src/extension/dataset-collection/BboxEditor.tsx` (Lines 34-51)

```typescript
interface BboxEditorProps {
  screenshot: string;
  patterns: DarkPattern[];
  onSave: (patterns: DarkPattern[]) => void;
  onCancel: () => void;
}

interface EditableBox {
  id: string;
  bbox: [number, number, number, number];
  label: string;
  severity: string;
  description: string;
  evidence: string;
  isNew?: boolean;
}

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null;
```

### 2.8 Component State Types

**File**: `apps/chrome-extension/src/extension/dataset-collection/index.tsx` (Lines 124-159)

```typescript
// Main component state
const [entries, setEntries] = useState<DatasetEntry[]>([]);
const [analyzing, setAnalyzing] = useState(false);
const [exportingBundle, setExportingBundle] = useState(false);
const [progress, setProgress] = useState<{
  current: number;
  total: number;
  url: string;
  status: string;
} | null>(null);
const [urlQueue, setUrlQueue] = useState<string[]>([]);
const [isProcessingQueue, setIsProcessingQueue] = useState(false);
const [modelConfigError, setModelConfigError] = useState<string | null>(null);
const [filterPattern, setFilterPattern] = useState<string>('ALL');
const [isRecursiveCrawling, setIsRecursiveCrawling] = useState(false);
const [crawlProgress, setCrawlProgress] = useState<{
  discovered: number;
  visited: number;
  queue: number;
  currentUrl: string;
} | null>(null);
const [statistics, setStatistics] = useState<{
  totalEntries: number;
  totalPatterns: number;
  prevalenceRate: number;
  pakistaniSitesScanned: number;
  categoryBreakdown: Record<string, number>;
}>({...});
const [editingEntry, setEditingEntry] = useState<DatasetEntry | null>(null);
const [showBboxEditor, setShowBboxEditor] = useState(false);
```

---

## 3. IndexedDB Schema Design

### 3.1 Database Configuration

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 4-7)

```typescript
// Database configuration constants
const DB_NAME = 'midscene_dataset';           // Database name
const DB_VERSION = 1;                          // Schema version
const DATASET_ENTRIES_STORE = 'dataset_entries'; // Object store name
```

### 3.2 IndexedDB Manager Class

**File**: `packages/shared/src/baseDB.ts` (Lines 1-108)

```typescript
/**
 * Generic IndexedDB manager with Promise-based API
 * Provides CRUD operations with transaction management
 */
export class IndexedDBManager {
  private dbPromise: Promise<IDBDatabase>;
  private dbName: string;
  private version: number;
  private storeConfigs: Array<{ name: string; keyPath: string }>;

  constructor(
    dbName: string,
    version: number,
    storeConfigs: Array<{ name: string; keyPath: string }>,
  ) {
    this.dbName = dbName;
    this.version = version;
    this.storeConfigs = storeConfigs;
    this.dbPromise = this.initDB();
  }

  /**
   * Initialize database and create object stores
   */
  private initDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores if they don't exist
        this.storeConfigs.forEach(({ name, keyPath }) => {
          if (!db.objectStoreNames.contains(name)) {
            const store = db.createObjectStore(name, { keyPath });
            // Create timestamp index for sorting
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        });
      };
    });
  }
}
```

### 3.3 Schema Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    IndexedDB Schema                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Database: midscene_dataset                                     │
│  Version: 1                                                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Object Store: dataset_entries                         │   │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │   │
│  │                                                         │   │
│  │  Key Path: id (string)                                 │   │
│  │                                                         │   │
│  │  Indexes:                                               │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Name: timestamp                               │   │   │
│  │  │  Key Path: timestamp                           │   │   │
│  │  │  Unique: false                                 │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  Record Structure:                                    │   │
│  │  {                                                    │   │
│  │    id: string,                                        │   │
│  │    url: string,                                       │   │
│  │    timestamp: number,                                 │   │
│  │    screenshot?: string,    // Base64 PNG              │   │
│  │    dom?: string,           // HTML excerpt            │   │
│  │    patterns: DarkPattern[],                           │   │
│  │    metadata?: {...},                                  │   │
│  │    summary?: {...}                                    │   │
│  │  }                                                    │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 CRUD Operations

**File**: `apps/chrome-extension/src/utils/datasetDB.ts` (Lines 77-147)

```typescript
/**
 * Create/Update - Store dataset entry
 */
export const storeDatasetEntry = async (entry: DatasetEntry): Promise<void> => {
  await withErrorHandling(async () => {
    const data: IndexedDBDatasetEntry = {
      id: entry.id,
      url: entry.url,
      timestamp: entry.timestamp,
      screenshot: entry.screenshot,
      dom: entry.dom,
      patterns: entry.patterns,
      metadata: entry.metadata,
      summary: entry.summary,
    };

    await datasetDbManager.put(DATASET_ENTRIES_STORE, data);
  }, 'Failed to store dataset entry');
};

/**
 * Read - Get all entries sorted by timestamp
 */
export const getDatasetEntries = async (): Promise<DatasetEntry[]> => {
  return (
    (await withErrorHandling(
      async () => {
        const entries = await datasetDbManager.getAll<IndexedDBDatasetEntry>(
          DATASET_ENTRIES_STORE,
          true, // sortByTimestamp
        );

        return entries.map((entry) => ({
          id: entry.id,
          url: entry.url,
          timestamp: entry.timestamp,
          screenshot: entry.screenshot,
          dom: entry.dom,
          patterns: entry.patterns,
          metadata: entry.metadata,
          summary: entry.summary,
        }));
      },
      'Failed to get dataset entries from IndexedDB',
      [],
    )) ?? []
  );
};

/**
 * Delete - Remove single entry
 */
export const deleteDatasetEntry = async (id: string): Promise<void> => {
  await withErrorHandling(
    () => datasetDbManager.delete(DATASET_ENTRIES_STORE, id),
    'Failed to delete dataset entry',
  );
};

/**
 * Delete All - Clear entire store
 */
export const clearDatasetEntries = async (): Promise<void> => {
  await withErrorHandling(
    () => datasetDbManager.clear(DATASET_ENTRIES_STORE),
    'Failed to clear dataset entries',
  );
};

/**
 * Count - Get total entries
 */
export const getDatasetEntryCount = async (): Promise<number> => {
  return (
    (await withErrorHandling(
      () => datasetDbManager.count(DATASET_ENTRIES_STORE),
      'Failed to get dataset entry count',
      0,
    )) ?? 0
  );
};
```

### 3.5 Transaction Management

**File**: `packages/shared/src/baseDB.ts` (Lines 40-53)

```typescript
/**
 * Generic transaction wrapper
 * Handles store retrieval and transaction lifecycle
 */
private async withTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  operation: (stores: IDBObjectStore | IDBObjectStore[]) => Promise<T>,
): Promise<T> {
  const db = await this.dbPromise;
  const transaction = db.transaction(storeNames, mode);

  const stores = Array.isArray(storeNames)
    ? storeNames.map((name) => transaction.objectStore(name))
    : transaction.objectStore(storeNames);

  return operation(stores);
}
```

### 3.6 Versioning Strategy

The current schema uses **version 1** with the following upgrade strategy:

```typescript
// Future schema upgrades would increment DB_VERSION
// and add migration logic in onupgradeneeded:

request.onupgradeneeded = (event) => {
  const db = (event.target as IDBOpenDBRequest).result;
  const oldVersion = event.oldVersion;
  const newVersion = event.newVersion;

  if (oldVersion < 1) {
    // Initial schema creation
    const store = db.createObjectStore('dataset_entries', { keyPath: 'id' });
    store.createIndex('timestamp', 'timestamp', { unique: false });
  }

  if (oldVersion < 2) {
    // Future: Add new indexes
    // const store = request.transaction.objectStore('dataset_entries');
    // store.createIndex('url', 'url', { unique: false });
  }
};
```

---

## 4. UI/UX Implementation Patterns

### 4.1 Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DatasetCollection Component                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Header Section                                         │   │
│  │  - Title: "Dataset Collection"                          │   │
│  │  - Statistics cards (entries, patterns, prevalence)     │   │
│  │  - Category breakdown                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Action Bar                                             │   │
│  │  - [Analyze Current Page]                               │   │
│  │  - [Auto Crawl Links]                                   │   │
│  │  - [Batch Process URLs]                                 │   │
│  │  - Filter dropdown (pattern type)                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Progress Indicators (conditional)                      │   │
│  │  - Single page analysis progress                        │   │
│  │  - Batch processing progress                            │   │
│  │  - Recursive crawling progress                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Dataset Entries List                                   │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  Entry Card                                     │   │   │
│  │  │  ├─ Screenshot thumbnail                        │   │   │
│  │  │  ├─ URL + timestamp                             │   │   │
│  │  │  ├─ Pattern count badges                        │   │   │
│  │  │  ├─ Pattern list with severity colors           │   │   │
│  │  │  ├─ [View] [Edit Bboxes] [Delete] actions       │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Export Section                                         │   │
│  │  - [Export as JSON]                                     │   │
│  │  - [Export Text Dataset]                                │   │
│  │  - [Export Full Bundle (ZIP)]                           │   │
│  │  - [Export for UI-TARS Training]                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 State Management Pattern

The component uses **React useState** for local state management:

```typescript
// State initialization pattern
const [entries, setEntries] = useState<DatasetEntry[]>([]);
const [analyzing, setAnalyzing] = useState(false);
const [progress, setProgress] = useState<ProgressType | null>(null);

// Data loading on mount
useEffect(() => {
  loadEntries();
  validateModelConfig();
}, []);

// Derived state computation
useEffect(() => {
  calculateStatistics();
}, [entries]);

// Filtered entries (computed, not stored)
const filteredEntries =
  filterPattern === 'ALL'
    ? entries
    : entries.filter((entry) =>
        entry.patterns.some((p) => p.type === filterPattern),
      );
```

### 4.3 User Interaction Flows

#### Flow 1: Single Page Analysis

```
User clicks "Analyze Current Page"
           │
           ▼
    ┌──────────────┐
    │ Validate AI  │
    │ Config       │
    └──────┬───────┘
           │ Error
           ▼
    ┌──────────────┐
    │ Check if     │
    │ Pakistani site│
    └──────┬───────┘
           │ Not Pakistani
           ▼
    ┌──────────────┐
    │ Show confirm │
    │ dialog       │
    └──────┬───────┘
           │ Continue
           ▼
    ┌──────────────┐
    │ performAnalysis│
    │              │
    │ 1. Capture   │
    │ 2. AI analyze│
    │ 3. Store     │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Show success │
    │ with stats   │
    └──────────────┘
```

#### Flow 2: Batch Processing

```
User clicks "Batch Process URLs"
           │
           ▼
    ┌──────────────┐
    │ Show modal   │
    │ with textarea│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Parse URLs   │
    │ (one/line)   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ processUrlQueue│
    │              │
    │ For each URL:│
    │ - Create tab │
    │ - Wait load  │
    │ - Capture    │
    │ - Analyze    │
    │ - Store      │
    │ - Close tab  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Show results │
    │ (success/fail│
    │  counts)     │
    └──────────────┘
```

#### Flow 3: Bounding Box Editing

```
User clicks "Edit Bboxes" on entry
           │
           ▼
    ┌──────────────┐
    │ Open modal   │
    │ with BboxEditor│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Canvas loads │
    │ with image   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ User can:    │
    │ - Click+drag │
    │   to create  │
    │ - Click box  │
    │   to select  │
    │ - Drag to    │
    │   move       │
    │ - Drag handles│
    │   to resize  │
    │ - Delete box │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Click Save   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Update entry │
    │ in IndexedDB │
    └──────────────┘
```

### 4.4 Form Handling Patterns

**Modal-based Form for Batch Processing**:

```typescript
const handleBatchProcess = () => {
  Modal.confirm({
    title: 'Batch Process URLs',
    content: (
      <div>
        <p>Enter URLs to process (one per line):</p>
        <textarea
          id="url-input"
          style={{ width: '100%', minHeight: '200px', fontFamily: 'monospace' }}
          placeholder="https://example.com&#10;https://example2.com"
        />
      </div>
    ),
    onOk: () => {
      const input = document.getElementById('url-input') as HTMLTextAreaElement;
      const urls = input.value
        .split('\n')
        .map((u) => u.trim())
        .filter((u) => u && u.startsWith('http'));

      if (urls.length === 0) {
        message.error('No valid URLs provided');
        return;
      }

      setUrlQueue(urls);
      processUrlQueue();
    },
  });
};
```

### 4.5 Progress Indication

**Multi-level Progress Tracking**:

```typescript
// Single page analysis
message.loading({ content: 'Capturing page data...', key: 'analysis', duration: 0 });
message.loading({ content: 'Analyzing for dark patterns with AI...', key: 'analysis', duration: 0 });
message.destroy('analysis');
message.success({ content: `Found ${patterns.length} dark pattern(s)`, duration: 5 });

// Batch processing
setProgress({
  current: i + 1,
  total: urlQueue.length,
  url,
  status: 'Processing...',
});

// Recursive crawling
setCrawlProgress({
  discovered: allDiscoveredUrls.size,
  visited: visitedUrls.size,
  queue: urlQueue.length - currentIndex,
  currentUrl: currentUrl,
});
```

---

## 5. AI/ML Pipeline Integration

### 5.1 Model Configuration Integration

**File**: `apps/chrome-extension/src/extension/dataset-collection/index.tsx` (Lines 172-187)

```typescript
/**
 * Validates that AI model is properly configured
 * Uses the same configuration system as the core agent
 */
const validateModelConfig = () => {
  try {
    const config = globalModelConfigManager.getModelConfig('default');
    if (!config || !config.modelName) {
      setModelConfigError('AI model not configured. Please configure in settings.');
      return;
    }
    if (!config.openaiApiKey && !config.openaiBaseURL) {
      setModelConfigError('OpenAI API key or base URL not configured.');
      return;
    }
    setModelConfigError(null);
  } catch (error) {
    setModelConfigError('Failed to validate model configuration.');
  }
};
```

### 5.2 AI Service Call

**File**: `apps/chrome-extension/src/extension/dataset-collection/index.tsx` (Lines 337-481)

```typescript
/**
 * Core AI analysis function
 * Integrates with @darkpatternhunter/core AI service
 */
const analyzePageForDarkPatterns = async (
  screenshot: string,
  dom: string,
  modelConfig: IModelConfig,
  url: string,
  retries = 3,
): Promise<{ patterns: DarkPattern[]; summary?: any }> => {
  // Build multimodal prompt
  const messageContent: AIArgs[0]['content'] = [
    {
      type: 'image_url',
      image_url: {
        url: screenshot,
        detail: 'high',
      },
    },
    {
      type: 'text',
      text: `${DARK_PATTERN_PROMPT}\n\nURL: ${url}\n\nDOM (first 5000 chars):\n${dom.substring(0, 5000)}`,
    },
  ];

  const prompt: AIArgs = [
    {
      role: 'system',
      content: 'You are a dark pattern detection expert...',
    },
    {
      role: 'user',
      content: messageContent,
    },
  ];

  // Call AI with retry logic
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await callAIWithObjectResponse<{
        patterns: DarkPattern[];
        summary?: {...};
      }>(prompt, AIActionType.EXTRACT_DATA, modelConfig);

      // Validate and process response
      const patterns = response.content.patterns || [];
      const validPatterns = patterns.filter(p => {
        // Confidence threshold
        if (p.confidence !== undefined && p.confidence <= 0.7) {
          return false;
        }
        // Bbox validation (if present)
        if (p.bbox) {
          if (!Array.isArray(p.bbox) || p.bbox.length !== 4) {
            delete p.bbox;
            return true;
          }
          // Normalize to integers
          p.bbox = p.bbox.map(Math.round);
        }
        return true;
      });

      // Crop individual images for each pattern
      const patternsWithCroppedImages = await Promise.all(
        validPatterns.map(async (pattern) => {
          if (pattern.bbox) {
            try {
              const croppedImage = await cropImageFromBbox(screenshot, pattern.bbox);
              return { ...pattern, croppedImage };
            } catch (error) {
              console.error(`Failed to crop image for pattern "${pattern.type}":`, error);
              return pattern;
            }
          }
          return pattern;
        })
      );

      return { patterns: patternsWithCroppedImages, summary: response.content.summary };
    } catch (error) {
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
};
```

### 5.3 VQA and Grounding Model Configuration

**File**: `packages/shared/src/env/constants.ts` (Lines 116-219)

```typescript
/**
 * VQA (Visual Question Answering) Model Configuration Keys
 * Used for data extraction and query operations
 */
export const VQA_MODEL_CONFIG_KEYS: IModelConfigKeys = {
  modelName: MIDSCENE_VQA_MODEL_NAME,
  socksProxy: MIDSCENE_VQA_OPENAI_SOCKS_PROXY,
  httpProxy: MIDSCENE_VQA_OPENAI_HTTP_PROXY,
  openaiBaseURL: MIDSCENE_VQA_OPENAI_BASE_URL,
  openaiApiKey: MIDSCENE_VQA_OPENAI_API_KEY,
  openaiExtraConfig: MIDSCENE_VQA_OPENAI_INIT_CONFIG_JSON,
  openaiUseAzureDeprecated: MIDSCENE_VQA_OPENAI_USE_AZURE,
  useAzureOpenai: MIDSCENE_VQA_USE_AZURE_OPENAI,
  azureOpenaiScope: MIDSCENE_VQA_AZURE_OPENAI_SCOPE,
  azureOpenaiKey: MIDSCENE_VQA_AZURE_OPENAI_KEY,
  azureOpenaiEndpoint: MIDSCENE_VQA_AZURE_OPENAI_ENDPOINT,
  azureOpenaiApiVersion: MIDSCENE_VQA_AZURE_OPENAI_API_VERSION,
  azureOpenaiDeployment: MIDSCENE_VQA_AZURE_OPENAI_DEPLOYMENT,
  azureExtraConfig: MIDSCENE_VQA_AZURE_OPENAI_INIT_CONFIG_JSON,
  useAnthropicSdk: MIDSCENE_VQA_USE_ANTHROPIC_SDK,
  anthropicApiKey: MIDSCENE_VQA_ANTHROPIC_API_KEY,
  vlMode: MIDSCENE_VQA_VL_MODE,
} as const;

/**
 * Grounding Model Configuration Keys
 * Used for element location and bounding box detection
 */
export const GROUNDING_MODEL_CONFIG_KEYS: IModelConfigKeys = {
  modelName: MIDSCENE_GROUNDING_MODEL_NAME,
  socksProxy: MIDSCENE_GROUNDING_OPENAI_SOCKS_PROXY,
  httpProxy: MIDSCENE_GROUNDING_OPENAI_HTTP_PROXY,
  openaiBaseURL: MIDSCENE_GROUNDING_OPENAI_BASE_URL,
  openaiApiKey: MIDSCENE_GROUNDING_OPENAI_API_KEY,
  openaiExtraConfig: MIDSCENE_GROUNDING_OPENAI_INIT_CONFIG_JSON,
  // ... Azure and Anthropic configs
  vlMode: MIDSCENE_GROUNDING_VL_MODE,
} as const;

/**
 * Planning Model Configuration Keys
 * Used for task planning and action sequencing
 */
export const PLANNING_MODEL_CONFIG_KEYS: IModelConfigKeys = {
  modelName: MIDSCENE_PLANNING_MODEL_NAME,
  // ... similar structure
  vlMode: MIDSCENE_PLANNING_VL_MODE,
} as const;
```

### 5.4 Training Data Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    Training Data Pipeline                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Dataset Collection (Chrome Extension)                          │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │  Raw Dataset    │  (IndexedDB)                               │
│  │  - screenshots  │                                            │
│  │  - bboxes       │                                            │
│  │  - metadata     │                                            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐     ┌─────────────────┐                   │
│  │ Export Formats  │────►│ UI-TARS Format  │                   │
│  │                 │     │ - prompt/label  │                   │
│  │ - COCO          │     │ - bbox          │                   │
│  │ - YOLO          │     │ - image_path    │                   │
│  │ - JSONL         │     └────────┬────────┘                   │
│  │ - Text-only     │              │                             │
│  └─────────────────┘              ▼                             │
│                          ┌─────────────────┐                   │
│                          │ Model Training  │                   │
│                          │ - UI-TARS       │                   │
│                          │ - YOLO          │                   │
│                          │ - Custom VLM    │                   │
│                          └─────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Data Export/Import Mechanisms

### 6.1 Export Format Matrix

| Format | Use Case | File Extension | Structure |
|--------|----------|----------------|-----------|
| **JSON** | Full dataset backup | `.json` | Array of DatasetEntry |
| **JSONL** | Line-delimited JSON | `.jsonl` | One JSON object per line |
| **ZIP Bundle** | Complete export with images | `.zip` | `manifest.json` + `images/` + `processed.jsonl` |
| **UI-TARS** | UI-TARS model training | `.zip` | `processed.jsonl` + `images/` + `dataset_info.json` |
| **COCO** | Object detection training | `.json` | COCO standard format |
| **YOLO** | YOLO model training | `.zip` | Images + `.txt` annotations + `dataset.yaml` |
| **Text-only** | NLP classification | `.jsonl` | Flattened TextPatternExample |

### 6.2 Export Implementations

**JSON Export** (`datasetDB.ts` Lines 155-163):
```typescript
export const exportDatasetAsJSON = async (
  pretty: boolean | number = 2,
): Promise<string> => {
  const entries = await getDatasetEntries();
  const spacing =
    typeof pretty === 'number' && pretty >= 0 ? pretty : pretty ? 2 : undefined;
  return JSON.stringify(entries, null, spacing);
};
```

**ZIP Bundle Export** (`datasetDB.ts` Lines 235-275):
```typescript
export const exportDatasetAsBundleZip = async (): Promise<Blob> => {
  const entries = await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');
  const manifest: ExportedDatasetRecord[] = [];
  const jsonlLines: string[] = [];

  entries.forEach((entry, index) => {
    const safeId = sanitizeFilename(entry.id, `entry_${index + 1}`);
    const imageFileName = `${safeId}.png`;
    let imagePath: string | null = null;

    if (entry.screenshot && imagesFolder) {
      const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
      const base64Payload = match ? match[2] : null;
      if (base64Payload) {
        imagesFolder.file(imageFileName, base64Payload, { base64: true });
        imagePath = `images/${imageFileName}`;
      }
    }

    const exportedRecord: ExportedDatasetRecord = {
      id: entry.id,
      url: entry.url,
      timestamp: entry.timestamp,
      image_path: imagePath,
      dom_excerpt: entry.dom,
      patterns: entry.patterns,
      summary: entry.summary,
      metadata: entry.metadata,
    };

    manifest.push(exportedRecord);
    jsonlLines.push(JSON.stringify(exportedRecord));
  });

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('processed.jsonl', jsonlLines.join('\n'));

  return zip.generateAsync({ type: 'blob' });
};
```

**UI-TARS Export** (`datasetDB.ts` Lines 293-400):
```typescript
export const exportForUITarsFineTuning = async (): Promise<Blob> => {
  const entries = await getDatasetEntries();
  const zip = new JSZip();
  const imagesFolder = zip.folder('images');

  interface UITarsStandardExample {
    prompt: string;
    label: string;
    image_path: string;
    category: string;
    bbox: [number, number, number, number];
    image_id: number;
    annotation_id: number;
  }

  const jsonlLines: string[] = [];
  let imageIdCounter = 0;
  let annotationIdCounter = 0;

  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
    const entry = entries[entryIndex];

    if (!entry.screenshot || !entry.patterns?.length) continue;

    const { w: width, h: height } = await getImageDimensions(entry.screenshot);

    const safeId = sanitizeFilename(entry.id, `entry_${entryIndex + 1}`);
    const imageFileName = `${safeId}.png`;

    if (imagesFolder) {
      const match = entry.screenshot.match(/^data:(.*?);base64,(.*)$/);
      const base64Payload = match ? match[2] : null;
      if (base64Payload) {
        imagesFolder.file(imageFileName, base64Payload, { base64: true });
      }
    }

    const currentImageId = imageIdCounter++;

    entry.patterns.forEach((pattern) => {
      if (!pattern.bbox || pattern.bbox.length !== 4) return;

      const [x, y, w, h] = pattern.bbox;

      // Normalize coordinates
      const normX = (x / width).toFixed(3);
      const normY = (y / height).toFixed(3);
      const normW = (w / width).toFixed(3);
      const normH = (h / height).toFixed(3);

      const systemPrompt =
        '[SYSTEM] You are UI-TARS, an assistant that detects deceptive dark patterns...\n\n[INSTRUCTION] Analyze this webpage screenshot...\n\n[SCREENSHOT] ' +
        imagePath +
        '\n\n[RESPONSE]';

      const category = pattern.type.toUpperCase().replace(/ /g, '_');

      const label = `I detected a ${pattern.type.toLowerCase()} dark pattern...`;

      const example: UITarsStandardExample = {
        prompt: systemPrompt,
        label: label,
        image_path: imagePath,
        category: category,
        bbox: [x, y, w, h],
        image_id: currentImageId,
        annotation_id: annotationIdCounter++,
      };

      jsonlLines.push(JSON.stringify(example));
    });
  }

  zip.file('processed.jsonl', jsonlLines.join('\n'));
  zip.file('dataset_info.json', JSON.stringify({
    total_images: imageIdCounter,
    total_annotations: annotationIdCounter,
    created_at: new Date().toISOString(),
    format: 'uitars_standard_web',
  }, null, 2));

  return zip.generateAsync({ type: 'blob' });
};
```

### 6.3 COCO Format Export

**File**: `apps/chrome-extension/src/utils/cocoYoloExport.ts` (Lines 88-175)

```typescript
/**
 * COCO (Common Objects in Context) format export
 * Standard format for object detection models
 */
export const exportAsCOCO = async (): Promise<string> => {
  const entries = await getDatasetEntries();

  const cocoFormat: COCOFormat = {
    info: {
      description: 'Dark Patterns Dataset',
      version: '1.0',
      year: new Date().getFullYear(),
      contributor: 'Dark Pattern Hunter',
      date_created: new Date().toISOString(),
    },
    images: [],
    annotations: [],
    categories: DARK_PATTERN_CATEGORIES.map((cat, idx) => ({
      id: idx + 1,
      name: cat.name,
      supercategory: cat.supercategory,
    })),
  };

  let imageId = 1;
  let annotationId = 1;

  entries.forEach((entry) => {
    if (!entry.screenshot) return;

    const imageFileName = `image_${imageId}.png`;

    cocoFormat.images.push({
      id: imageId,
      file_name: imageFileName,
      width: entry.metadata?.viewport?.width || 1920,
      height: entry.metadata?.viewport?.height || 1080,
      date_captured: new Date(entry.timestamp).toISOString(),
    });

    entry.patterns.forEach((pattern) => {
      if (!pattern.bbox) return;

      const categoryId = DARK_PATTERN_CATEGORIES.findIndex(
        (cat) => cat.name === pattern.type
      ) + 1;

      cocoFormat.annotations.push({
        id: annotationId++,
        image_id: imageId,
        category_id: categoryId || 1,
        bbox: pattern.bbox, // [x, y, width, height]
        area: pattern.bbox[2] * pattern.bbox[3],
        segmentation: [],
        iscrowd: 0,
        attributes: {
          severity: pattern.severity,
          confidence: pattern.confidence,
          description: pattern.description,
        },
      });
    });

    imageId++;
  });

  return JSON.stringify(cocoFormat, null, 2);
};
```

---

## 7. Error Handling & Validation

### 7.1 Error Handling Strategy

**File**: `packages/shared/src/baseDB.ts` (Lines 110-131)

```typescript
/**
 * Generic error handler wrapper with quota management
 */
export const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  errorMessage: string,
  defaultValue?: T,
  onQuotaExceeded?: () => Promise<void>,
): Promise<T | undefined> => {
  try {
    return await operation();
  } catch (e) {
    console.error(errorMessage, e);
    if (
      e instanceof Error &&
      e.name === 'QuotaExceededError' &&
      onQuotaExceeded
    ) {
      console.log('Storage quota exceeded, running cleanup...');
      await onQuotaExceeded();
    }
    return defaultValue;
  }
};
```

### 7.2 Validation Rules

**Bounding Box Validation** (`index.tsx` Lines 391-434):
```typescript
const validPatterns = patterns.filter(p => {
  // Filter by confidence threshold
  if (p.confidence !== undefined && p.confidence <= 0.7) {
    return false;
  }

  // Relaxed Bounding Box Validation:
  // We allow patterns WITHOUT bbox (text-only patterns)
  // But IF bbox is present, it must be valid.

  if (p.bbox) {
    if (!Array.isArray(p.bbox) || p.bbox.length !== 4) {
      console.warn(`Pattern "${p.type}" has invalid bbox format, removing bbox`, p.bbox);
      delete p.bbox;
      return true;
    }

    const [x, y, width, height] = p.bbox;
    if (
      typeof x !== 'number' || typeof y !== 'number' ||
      typeof width !== 'number' || typeof height !== 'number' ||
      x < 0 || y < 0 || width <= 0 || height <= 0 ||
      !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(width) || !Number.isFinite(height)
    ) {
      console.warn(`Pattern "${p.type}" has invalid bbox values, removing bbox`, p.bbox);
      delete p.bbox;
      return true;
    }

    // Normalize bbox to integers
    p.bbox = [
      Math.round(x),
      Math.round(y),
      Math.round(width),
      Math.round(height)
    ];
  }

  return true;
});
```

**URL Validation** (`pakistaniSites.ts` Lines 36-51):
```typescript
export function validateUrl(url: string): { valid: boolean; error?: string } {
  if (!url || !url.trim()) {
    return { valid: false, error: 'URL is required' };
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { valid: false, error: 'URL must start with http:// or https://' };
  }

  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
```

### 7.3 Retry Logic

**AI Analysis Retry** (`index.tsx` Lines 370-481):
```typescript
let lastError: Error | null = null;

for (let attempt = 1; attempt <= retries; attempt++) {
  try {
    const response = await callAIWithObjectResponse<...>(...);
    // Process response
    return { patterns: patternsWithCroppedImages, summary };
  } catch (error: any) {
    lastError = error;
    console.error(`Analysis attempt ${attempt} failed:`, error);

    if (attempt < retries) {
      // Exponential backoff: 1s, 2s, 3s
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

// All retries failed
throw new Error(`Failed to analyze page after ${retries} attempts: ${lastError?.message}`);
```

### 7.4 Edge Cases Handled

| Edge Case | Handling |
|-----------|----------|
| Chrome internal pages | Blocked with error message |
| Non-Pakistani sites | Confirmation dialog |
| Page load timeout | 15s timeout, continue anyway |
| AI service failure | 3 retries with backoff |
| Invalid bounding boxes | Strip bbox, keep pattern |
| Low confidence patterns | Filtered out (< 0.7) |
| Storage quota exceeded | Cleanup old entries |
| Image cropping failure | Return pattern without crop |
| Empty dataset export | Warning message |
| Missing model config | Modal with instructions |

---

## 8. Performance Optimization

### 8.1 Lazy Loading Strategies

**Image Loading in BboxEditor** (`BboxEditor.tsx` Lines 94-108):
```typescript
useEffect(() => {
  if (!screenshot) return;

  const img = new Image();
  img.onload = () => {
    imageRef.current = img;
    // Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => redrawCanvas());
  };
  img.onerror = () => {
    message.error('Failed to load screenshot image');
  };
  img.src = screenshot;
}, [screenshot]);
```

### 8.2 Pagination & Memory Management

**No Explicit Pagination** - Uses virtual scrolling via Ant Design List:
```typescript
<List
  dataSource={filteredEntries}
  renderItem={(entry) => (
    <List.Item>
      {/* Entry card */}
    </List.Item>
  )}
/>
```

**Storage Cleanup** (`baseDB.ts` Lines 134-158):
```typescript
export const createCleanupFunction = <
  T extends { id: string; timestamp: number },
>(
  dbManager: IndexedDBManager,
  storeName: string,
  maxItems: number,
) => {
  return async (): Promise<void> => {
    try {
      const results = await dbManager.getAll<T>(storeName);

      if (results.length > maxItems) {
        const toDelete = results
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(0, results.length - maxItems);

        await Promise.all(
          toDelete.map((item) => dbManager.delete(storeName, item.id)),
        );
      }
    } catch (e) {
      console.error(`Failed to cleanup ${storeName}:`, e);
    }
  };
};
```

### 8.3 Batch Processing Optimization

**Sequential Processing with Delay** (`index.tsx` Lines 641-730):
```typescript
for (let i = 0; i < urlQueue.length; i++) {
  const url = urlQueue[i];
  
  // Update progress
  setProgress({ current: i + 1, total: urlQueue.length, url, status: 'Processing...' });

  try {
    // Open, capture, analyze, close
    const tab = await chrome.tabs.create({ url, active: false });
    await waitForPageLoad(tab.id!, 15000);
    const { screenshot, dom } = await capturePageData(tab.id!);
    const { patterns } = await analyzePageForDarkPatterns(screenshot, dom, modelConfig, url);
    await storeDatasetEntry(entry);
    await chrome.tabs.remove(tab.id!);
    
    successCount++;
  } catch (error) {
    failCount++;
  }
}
```

### 8.4 Image Processing Optimization

**Canvas-based Cropping** (`imageCrop.ts`):
```typescript
export async function cropImageFromBbox(
  imageDataUrl: string,
  bbox: [number, number, number, number],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      const [x, y, width, height] = bbox;
      
      // Create canvas sized to bbox
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      // Draw cropped portion only
      ctx.drawImage(
        img,
        x, y, width, height,  // Source rectangle
        0, 0, width, height   // Destination rectangle
      );
      
      // Export as PNG with 95% quality
      const croppedDataUrl = canvas.toDataURL('image/png', 0.95);
      resolve(croppedDataUrl);
    };
    
    img.src = imageDataUrl;
  });
}
```

---

## 9. Security & Privacy Considerations

### 9.1 Data Storage Security

**Local-Only Storage**:
- All data stored in browser's IndexedDB
- No cloud synchronization
- No external data transmission except AI analysis

**Data Minimization**:
```typescript
// DOM storage limited to first 10k characters
dom: dom.substring(0, 10000)
```

### 9.2 AI Data Transmission

**Screenshot Transmission**:
- Screenshots sent to configured AI provider (OpenAI/Azure/Anthropic)
- No persistent storage on AI provider (per API terms)
- Base64 encoding for transmission

**Prompt Design for Privacy**:
```typescript
// DOM excerpt limited and contextual
const prompt = `${DARK_PATTERN_PROMPT}\n\nURL: ${url}\n\nDOM (first 5000 chars):\n${dom.substring(0, 5000)}`;
```

### 9.3 Permission Model

**Required Permissions** (`manifest.json`):
```json
{
  "permissions": [
    "activeTab",
    "tabs",
    "scripting",
    "downloads",
    "storage"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

### 9.4 Sensitive Data Handling

| Data Type | Storage | Transmission | Retention |
|-----------|---------|--------------|-----------|
| Screenshots | IndexedDB (local) | AI provider only | Until user deletes |
| DOM content | IndexedDB (10k chars) | AI provider only (5k chars) | Until user deletes |
| URLs | IndexedDB | AI provider only | Until user deletes |
| API Keys | Chrome storage | Never | Persistent |
| Export files | User download | User-controlled | User-controlled |

---

## 10. Extension Points & Customization

### 10.1 Pattern Taxonomy Customization

**Current Taxonomy** (`BboxEditor.tsx` Lines 15-30):
```typescript
const PATTERN_TYPES = [
  'Nagging',
  'Dead End/Roach Motel',
  'Price Comparison Prevention',
  'Disguised Ad / Bait & Switch',
  'Reference Pricing',
  'False Hierarchy',
  'Bundling / Auto-add / Bad Defaults',
  'Pressured Selling / FOMO / Urgency',
  'Scarcity & Popularity',
  'Hard To Close',
  'Trick Questions / Confirmshaming',
  'Hidden Information',
  'Infinite Scrolling',
  'Forced Ads / Autoplay',
];
```

**Extension Point**: Modify `PATTERN_TYPES` array and update `DARK_PATTERN_PROMPT` to include new pattern definitions.

### 10.2 Site Detection Customization

**Pakistani Sites List** (`pakistaniSites.ts` Lines 3-21):
```typescript
export const PAKISTANI_ECOMMERCE_SITES = [
  'daraz.pk',
  'yayvo.com',
  'telemart.pk',
  // ... more sites
];
```

**Extension Point**: Add new domains to support other regional e-commerce research.

### 10.3 AI Prompt Customization

**Prompt Template** (`index.tsx` Lines 61-122):
```typescript
const DARK_PATTERN_PROMPT = `You are a Dark Pattern Detection AI expert...

Taxonomy: [...]
Language coverage: English + Urdu + Roman Urdu
Evidence requirements: [...]
Output format: {...}`;
```

**Extension Points**:
- Modify taxonomy for different pattern categories
- Add language support (currently English/Urdu/Roman Urdu)
- Adjust confidence thresholds
- Change output schema

### 10.4 Export Format Extension

**Adding New Export Format**:
```typescript
// In datasetDB.ts
export const exportAsCustomFormat = async (): Promise<Blob> => {
  const entries = await getDatasetEntries();
  // Transform to custom format
  const customData = entries.map(entry => ({
    // Custom structure
  }));
  // Generate file
  return new Blob([JSON.stringify(customData)]);
};
```

### 10.5 Bounding Box Editor Hooks

**BboxEditor Customization Points**:
```typescript
interface BboxEditorProps {
  screenshot: string;
  patterns: DarkPattern[];
  onSave: (patterns: DarkPattern[]) => void;  // Custom save handler
  onCancel: () => void;                       // Custom cancel handler
}

// Severity colors can be extended:
export const SEVERITY_COLORS: Record<string, BboxStyle> = {
  critical: { /* ... */ },
  high: { /* ... */ },
  medium: { /* ... */ },
  low: { /* ... */ },
  info: { /* Add new severity level */ },
};
```

### 10.6 Research Context Extension

**Metadata Extension** (`datasetDB.ts` Lines 21-26):
```typescript
researchContext?: {
  isPakistaniEcommerce?: boolean;
  siteName?: string;
  modelUsed?: string;
  analysisVersion?: string;
  // Add custom fields:
  researcherId?: string;
  studyGroup?: string;
  customTags?: string[];
};
```

---

## Appendix A: File Reference Guide

| File | Purpose | Key Exports |
|------|---------|-------------|
| `dataset-collection/index.tsx` | Main component | `DatasetCollection`, `analyzeCurrentPage` |
| `dataset-collection/BboxEditor.tsx` | Bounding box editor | `BboxEditor`, `EditableBox` |
| `utils/datasetDB.ts` | Database operations | `DatasetEntry`, `DarkPattern`, CRUD functions |
| `utils/imageCrop.ts` | Image manipulation | `cropImageFromBbox` |
| `utils/bboxOverlay.ts` | Visualization | `drawBboxesOnImage`, `SEVERITY_COLORS` |
| `utils/pakistaniSites.ts` | Site detection | `isPakistaniEcommerceSite`, `PAKISTANI_ECOMMERCE_SITES` |
| `utils/cocoYoloExport.ts` | ML export formats | `exportAsCOCO`, `exportAsYOLO` |
| `shared/baseDB.ts` | Generic IndexedDB | `IndexedDBManager`, `withErrorHandling` |

## Appendix B: Database Schema Version History

| Version | Date | Changes |
|---------|------|---------|
| 1 | Initial | Base schema with `dataset_entries` store and `timestamp` index |

---

*Analysis completed: 2026-01-28*
*Module version: 2.1 (Roman Urdu support)*
*Total lines analyzed: 3,000+*