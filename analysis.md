## Comprehensive Architectural Analysis: Live Guard Module

### Module Overview
The Live Guard module provides real-time dark pattern detection and consumer protection for the active browser tab. It operates independently from the Dataset Module, focusing on in-situ analysis rather than stored dataset analysis.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         Chrome Extension (apps/chrome-extension)                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐ │
│  │ Sidebar UI (popup/index.tsx)                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │ │ Live Guard Component (live-guard/index.tsx)                    │ │ │
│  │ │ - analyzeCurrentPage()                                      │ │ │
│  │ │ - Captures screenshot + DOM via chrome.scripting.executeScript  │ │ │
│  │ │ - Calls AI via callAIWithObjectResponse()                   │ │ │
│  │ │ - Sends highlights to content script via chrome.tabs.sendMessage()   │ │
│  │ └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │ Content Script (guardHighlighter.ts)                           │ │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │ │ - Listens for SHOW_HIGHLIGHTS / CLEAR_HIGHLIGHTS messages    │ │ │
│  │ │ - Creates semi-transparent red overlays using bbox coordinates    │ │ │
│  │ │ - Implements scroll-aware positioning (window scroll/resize)   │ │
│  │ │ - Shows warning-themed tooltips on hover (yellow/orange)        │ │
│  │ │ - Uses high z-index (2147483647) for isolation            │ │
│  │ └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │ Service Worker (scripts/worker.ts)                                 │ │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │ │ - Handles SCAN_PAGE / CLEAR_HIGHLIGHTS messages                 │ │ │
│  │ │ - Forwards messages to content scripts                           │ │
│  │ └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │ Shared Packages                                                   │ │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │ │ @darkpatternhunter/core/ai-model                              │ │ │
│  │ │ - callAIWithObjectResponse() - AI inference engine            │ │ │
│  │ │ - AIActionType.EXTRACT_DATA - Action type for extraction     │ │ │
│  │ │ @darkpatternhunter/shared/env - Configuration management          │ │ │
│  │ │ - globalModelConfigManager.getModelConfig() - Model config    │ │ │
│  │ │ @darkpatternhunter/shared/logger - Debug logging               │ │ │
│  │ │ @darkpatternhunter/shared/utils - Utility functions             │ │ │
│  │ └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │ @darkpatternhunter/visualizer/store - State management              │ │ │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │ │ - useEnvConfig() - Zustand store for app state          │ │ │
│  │ │ - PopupTabType: 'playground' | 'bridge' | 'recorder' | 'dataset' | 'live-guard' │ │ │
│  │ │ - setPopupTab() - Updates current tab state                │ │ │
│  │ └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                               │ │
│  │ @darkpatternhunter/core - Type definitions                           │ │ │
│  │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │ │ - ChatCompletionMessageParam - OpenAI message format          │ │ │
│  │ │ - AIActionType enum - Action type enumeration             │ │ │
│  │ └─────────────────────────────────────────────────────────────────────┘ │ │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Internal Cohesion Analysis

#### 1. **Data Flow Architecture**

**Live Guard Component → Content Script Communication:**
- **Direct Messaging**: Uses [`chrome.tabs.sendMessage()`](apps/chrome-extension/src/extension/live-guard/index.tsx:236) to send `SHOW_HIGHLIGHTS` and `CLEAR_HIGHLIGHTS` messages directly to content script
- **No Service Worker Relay**: Unlike other modules (recorder, bridge), Live Guard bypasses the service worker for direct tab-to-content-script communication
- **Rationale**: This design reduces latency and simplifies the message flow for real-time protection use cases

**Content Script Isolation:**
- **Independent Execution**: [`guardHighlighter.ts`](apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts) runs independently in each tab's context
- **No External Dependencies**: Content script has no imports from extension packages, only uses Chrome APIs
- **Self-Contained State**: Manages its own overlay state using a `Map<string, PatternOverlay>` without external state management

#### 2. **External Coupling Analysis**

**Dependencies on Shared Packages:**
- **@darkpatternhunter/core/ai-model**: 
  - [`callAIWithObjectResponse()`](packages/core/src/ai-model/service-caller/index.ts:527) - Core AI inference
  - [`AIActionType.EXTRACT_DATA`](packages/core/src/ai-model/common.ts:28) - Action type for structured data extraction
- **@darkpatternhunter/shared/env**:
  - [`globalModelConfigManager.getModelConfig()`](apps/chrome-extension/src/extension/live-guard/index.tsx:160) - Model configuration
- **@darkpatternhunter/shared/logger**:
  - [`getDebug()`](apps/chrome-extension/src/extension/live-guard/index.tsx:13) - Debug logging
- **@darkpatternhunter/shared/utils**:
  - Utility functions for data parsing and validation

**Coupling with Visualizer Store:**
- **Loose Coupling**: Live Guard component uses [`useEnvConfig()`](apps/chrome-extension/src/extension/popup/index.tsx:47) but doesn't depend on `popupTab` state
- **State Independence**: Live Guard maintains its own `isScanning`, `detectedPatterns`, `error` state without using shared store
- **Rationale**: Live Guard is a standalone protection feature that doesn't need to integrate with the visualizer's playground/bridge/recorder state management

#### 3. **Integration Points**

**Sidebar Integration:**
- **Menu Item**: Added to [`menuItems`](apps/chrome-extension/src/extension/popup/index.tsx:117) array with `SafetyOutlined` icon
- **Render Case**: Added [`currentMode === 'live-guard'`](apps/chrome-extension/src/extension/popup/index.tsx:194) case in [`renderContent()`](apps/chrome-extension/src/extension/popup/index.tsx:171)
- **Type Extension**: Updated [`PopupTabType`](packages/visualizer/src/store/store.tsx:121) to include `'live-guard'`

**Content Script Registration:**
- **Manifest Configuration**: Removed `content_scripts` section from [`manifest.json`](apps/chrome-extension/static/manifest.json) because TypeScript files cannot be loaded as content scripts
- **Alternative**: Content script is loaded via programmatic injection or would need to be compiled to JavaScript

**Service Worker Message Handling:**
- **New Message Types**: Added [`LIVE_GUARD_MESSAGES`](apps/chrome-extension/src/scripts/worker.ts:13) constant with `SCAN_PAGE` and `CLEAR_HIGHLIGHTS` actions
- **Message Handlers**: Added handlers in [`chrome.runtime.onMessage`](apps/chrome-extension/src/scripts/worker.ts:46) listener for Live Guard messages
- **Forwarding**: Maintains existing message forwarding logic for recorder events

#### 4. **Design Patterns**

**Counter-Measure Generation:**
- **Pattern-Based**: Pre-defined counter-measures for each of the 14 dark pattern categories
- **Actionable Advice**: Each counter-measure starts with "✅ Action:" prefix and provides specific user guidance
- **Context-Aware**: Different advice for urgency/scarcity vs. hidden information vs. hard-to-close patterns

**Overlay Design:**
- **Visual Hierarchy**: Semi-transparent red overlays (rgba(255, 77, 79, 0.3)) with solid borders
- **Severity Indication**: Border color matches pattern severity (critical: #ff4d4f, high: #ff7a45, medium: #ffa940, low: #52c41a)
- **Positioning**: Absolute positioning based on bbox coordinates from AI response
- **Interactivity**: `pointer-events: auto` allows user interaction with overlays

**Tooltip Design:**
- **Warning Theme**: Yellow/orange gradient background (`linear-gradient(135deg, #fff7e6 0%, #ffc53d 100%)`)
- **Content Structure**: Three-tier display (pattern type, description, counter-measure)
- **Typography**: System fonts with appropriate weight hierarchy
- **Visibility**: Initially hidden (`opacity: 0; visibility: hidden`), shown on hover/click

**Scroll Awareness:**
- **Event Listeners**: [`window.addEventListener('scroll')`](apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts:231) and [`window.addEventListener('resize')`](apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts:237)
- **Debouncing**: 100ms timeout prevents excessive repositioning during scroll
- **Position Update**: [`updateOverlayPositions()`](apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts:197) recalculates overlay positions based on bbox

#### 5. **Data Structures**

**DetectedPattern Interface:**
```typescript
interface DetectedPattern {
  type: string;           // One of 14 dark pattern categories
  description: string;      // Human-readable explanation
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;         // Where on the page
  evidence: string;         // Specific text/visual elements
  confidence: number;        // 0.0 to 1.0 from AI
  bbox?: [number, number, number, number];  // [x, y, width, height] coordinates
  counterMeasure: string;   // Actionable advice for user
}
```

**LiveGuardDetectionResponse Interface:**
```typescript
interface LiveGuardDetectionResponse {
  patterns: DetectedPattern[];
  summary: {
    total_patterns: number;
    prevalence_score: number;
    primary_categories: string[];
  };
}
```

#### 6. **Potential Issues and Recommendations**

**Content Script Loading:**
- **Current Issue**: TypeScript files cannot be loaded as Chrome content scripts
- **Recommendation**: Either compile [`guardHighlighter.ts`](apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts) to JavaScript or use programmatic content script injection

**State Management Decoupling:**
- **Current Design**: Live Guard component maintains local state (`useState`) instead of using shared store
- **Recommendation**: Consider integrating with [`useEnvConfig()`](apps/chrome-extension/src/extension/popup/index.tsx:47) for consistency if Live Guard needs to share state with other components

**Error Handling:**
- **Current Implementation**: Basic try-catch in [`analyzeCurrentPage()`](apps/chrome-extension/src/extension/live-guard/index.tsx:127)
- **Recommendation**: Add more granular error handling with specific error types (network errors, AI API errors, DOM capture errors)

**Performance Considerations:**
- **Overlay Performance**: Current implementation creates DOM elements for each pattern; consider using a single container with CSS transforms for better performance
- **Memory Management**: Active overlays are stored in a `Map`; consider cleanup for tabs that are closed

### Summary

The Live Guard module demonstrates good separation of concerns with:
- **Clear data flow**: Sidebar → Content Script (direct messaging)
- **Isolated execution**: Content script runs independently with Chrome APIs
- **Minimal dependencies**: Only depends on core AI packages
- **User-focused design**: Counter-measures provide actionable consumer protection
- **Visual feedback**: Overlays and tooltips provide immediate, in-situ guidance

The architecture is well-suited for real-time protection use cases, with clear boundaries between the Live Guard UI, content script, and AI inference layers.