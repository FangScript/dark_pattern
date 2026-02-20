# Dark Pattern Hunter - Codebase Analysis & Conversion Guide

## Executive Summary

You're converting the **midscene.js** open-source automation framework into **Dark Pattern Hunter**, a specialized tool for detecting dark patterns in Pakistani e-commerce websites. The codebase already has significant dark pattern detection functionality built-in!

## Current State Analysis

### ✅ What's Already Built

1. **Dark Pattern Detection Component** (`apps/chrome-extension/src/extension/dataset-collection/index.tsx`)
   - Full dark pattern detection with 6 categories (Urgency, Scarcity, Social Proof, Forced Action, Misdirection, Obstruction)
   - Pakistani e-commerce specific prompts with Urdu language support
   - Screenshot + DOM capture functionality
   - AI analysis with retry logic
   - IndexedDB storage for dataset entries

2. **AI Integration** (`packages/core/src/ai-model/service-caller/index.ts`)
   - OpenAI SDK integration (ready for your initial phase!)
   - Support for custom base URLs (for local UI-TARS later)
   - Anthropic Claude support
   - Azure OpenAI support
   - Visual Language Model (VLM) support

3. **Chrome Extension Infrastructure**
   - Manifest v3 structure
   - Service worker (`apps/chrome-extension/src/scripts/worker.ts`)
   - Content scripts for page interaction
   - Screenshot capture via `chrome.tabs.captureVisibleTab`
   - DOM extraction via `chrome.scripting.executeScript`

4. **Data Storage** (`apps/chrome-extension/src/utils/datasetDB.ts`)
   - IndexedDB database for local storage
   - Dataset entry management
   - JSONL export functionality

### 🔄 What Needs Conversion

1. **Branding & Naming**
   - ✅ README.md - DONE
   - ✅ README.zh.md - DONE
   - ⚠️ Package names (`@darkpatternhunter/*` → `@darkpatternhunter/*`)
   - ⚠️ Manifest name ("Pattern Hunter" → "Dark Pattern Hunter")
   - ⚠️ Code comments and documentation

2. **AI Configuration**
   - Currently defaults to local UI-TARS server (`http://localhost:8000/v1`)
   - Need to switch to OpenAI API for Phase 1
   - Configuration is in `apps/chrome-extension/src/extension/popup/index.tsx` (lines 64-82)

3. **Core Functionality**
   - The dark pattern detection is already implemented!
   - Just needs OpenAI API key configuration

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│              Chrome Extension (Manifest v3)              │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   Popup UI   │  │ Service      │  │ Content      │ │
│  │   (React)    │  │ Worker       │  │ Scripts      │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                  │                  │          │
│         └──────────────────┼──────────────────┘          │
│                            │                             │
│                    ┌───────▼────────┐                    │
│                    │  Dataset        │                    │
│                    │  Collection     │                    │
│                    │  Component      │                    │
│                    └───────┬────────┘                    │
│                            │                             │
└────────────────────────────┼─────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              @darkpatternhunter/core Package                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  AI Model Service Caller                         │  │
│  │  - OpenAI SDK                                    │  │
│  │  - Anthropic SDK                                 │  │
│  │  - Custom Base URL (for UI-TARS)                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  callAIWithObjectResponse()                      │  │
│  │  - Handles JSON response parsing                 │  │
│  │  - Retry logic                                  │  │
│  │  - Error handling                               │  │
│  └──────────────────────────────────────────────────┘  │
│                                                           │
└─────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────┐
│              OpenAI API (Phase 1)                        │
│              OR                                          │
│              Local UI-TARS Server (Phase 2)              │
└─────────────────────────────────────────────────────────┘
```

## Key Files & Their Roles

### Chrome Extension

1. **`apps/chrome-extension/src/extension/popup/index.tsx`**
   - Main popup UI component
   - Mode switching (Playground, Bridge, Recorder, Dataset)
   - **AI config override** (lines 59-82) - THIS IS WHERE YOU SET OPENAI API KEY

2. **`apps/chrome-extension/src/extension/dataset-collection/index.tsx`**
   - Dark pattern detection UI
   - Page capture logic (`capturePageData`)
   - AI analysis (`analyzePageForDarkPatterns`)
   - Statistics and visualization

3. **`apps/chrome-extension/src/scripts/worker.ts`**
   - Service worker (background script)
   - Screenshot capture handler
   - Message passing between components

4. **`apps/chrome-extension/static/manifest.json`**
   - Extension manifest
   - Permissions and configuration

### Core Packages

1. **`packages/core/src/ai-model/service-caller/index.ts`**
   - AI client creation (`createChatClient`)
   - OpenAI/Anthropic/Azure initialization
   - Main AI call function (`callAI`)

2. **`packages/core/src/ai-model/index.ts`**
   - `callAIWithObjectResponse` - Used by dataset collection
   - Type definitions

3. **`packages/shared/src/env/types.ts`**
   - `IModelConfig` interface
   - Environment variable keys

## Conversion Plan

### Phase 1: OpenAI API Integration (Current Focus)

#### Step 1: Update AI Configuration

**File:** `apps/chrome-extension/src/extension/popup/index.tsx`

**Current Code (lines 64-72):**
```typescript
const uiTarsConfig: Record<string, string> = {
  [MIDSCENE_OPENAI_BASE_URL]: 'http://localhost:8000/v1',
  [MIDSCENE_OPENAI_API_KEY]: 'not-needed',
  [OPENAI_API_KEY]: 'not-needed',
  [MIDSCENE_MODEL_NAME]: 'ui-tars-1.5-7b',
  [MIDSCENE_VL_MODE]: 'vlm-ui-tars',
};
```

**Change to:**
```typescript
const openAIConfig: Record<string, string> = {
  [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1', // or undefined for default
  [MIDSCENE_OPENAI_API_KEY]: process.env.OPENAI_API_KEY || '', // Get from env or user input
  [OPENAI_API_KEY]: process.env.OPENAI_API_KEY || '',
  [MIDSCENE_MODEL_NAME]: 'gpt-4o', // or 'gpt-4-vision-preview' for vision
  [MIDSCENE_VL_MODE]: 'qwen-vl', // or undefined for non-VLM models
};
```

#### Step 2: Add API Key Input UI

Create a settings component where users can input their OpenAI API key. Store it in Chrome storage.

**File:** `apps/chrome-extension/src/extension/settings/index.tsx` (new file)

```typescript
import { useState } from 'react';
import { Input, Button, Card, message } from 'antd';

export function Settings() {
  const [apiKey, setApiKey] = useState('');
  
  const saveApiKey = async () => {
    await chrome.storage.local.set({ openaiApiKey: apiKey });
    message.success('API key saved');
  };
  
  // Load existing key on mount
  useEffect(() => {
    chrome.storage.local.get(['openaiApiKey'], (result) => {
      if (result.openaiApiKey) {
        setApiKey(result.openaiApiKey);
      }
    });
  }, []);
  
  return (
    <Card title="OpenAI Configuration">
      <Input.Password
        placeholder="Enter OpenAI API Key"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
      />
      <Button onClick={saveApiKey}>Save</Button>
    </Card>
  );
}
```

#### Step 3: Update Model Config Loading

**File:** `apps/chrome-extension/src/extension/popup/index.tsx`

Modify the `useEffect` that sets AI config to load from Chrome storage:

```typescript
useEffect(() => {
  chrome.storage.local.get(['openaiApiKey'], async (result) => {
    const apiKey = result.openaiApiKey || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.warn('OpenAI API key not configured');
      return;
    }
    
    const openAIConfig: Record<string, string> = {
      [MIDSCENE_OPENAI_BASE_URL]: 'https://api.openai.com/v1',
      [MIDSCENE_OPENAI_API_KEY]: apiKey,
      [OPENAI_API_KEY]: apiKey,
      [MIDSCENE_MODEL_NAME]: 'gpt-4o', // Use GPT-4o for vision
      [MIDSCENE_VL_MODE]: undefined, // GPT-4o handles vision natively
    };
    
    safeOverrideAIConfig(openAIConfig);
  });
}, [config]);
```

### Phase 2: Branding Updates

#### Step 1: Update Package Names

**Files to update:**
- `package.json` (root)
- `apps/chrome-extension/package.json`
- All `packages/*/package.json`

**Change:** `@darkpatternhunter/*` → `@darkpatternhunter/*`

**Note:** This is a large refactor. Consider doing this incrementally or keeping the package names but updating the branding in UI.

#### Step 2: Update Manifest

**File:** `apps/chrome-extension/static/manifest.json`

```json
{
  "name": "Dark Pattern Hunter",
  "description": "AI-powered browser extension to detect dark patterns and deceptive UI elements in Pakistani e-commerce websites.",
  "version": "1.0.0",
  ...
}
```

#### Step 3: Update Component Names

- `PlaygroundPopup` → `DarkPatternHunterPopup`
- `DatasetCollection` → `DarkPatternDetection` (or keep as is)

### Phase 3: Enhanced Features (Future)

1. **Rule-based Fallback** (FR-2, REL-2)
   - Add DOM pattern matching for common dark patterns
   - Use when AI is unavailable or too slow

2. **Visual Highlighting**
   - Draw bounding boxes on detected patterns
   - Add tooltips with pattern details

3. **User Reporting** (FR-4)
   - Add "Report False Positive/Negative" buttons
   - Send to backend for moderation

4. **Backend Integration**
   - MongoDB connection for dataset storage
   - User authentication
   - Admin dashboard

## Current Dark Pattern Detection Flow

```
User clicks "Analyze Current Page"
    │
    ▼
capturePageData()
    ├─► Wait for page load
    ├─► Capture screenshot (chrome.tabs.captureVisibleTab)
    ├─► Capture DOM (chrome.scripting.executeScript)
    └─► Get viewport metadata
    │
    ▼
analyzePageForDarkPatterns()
    ├─► Build prompt with DARK_PATTERN_PROMPT
    ├─► Include screenshot (base64)
    ├─► Include DOM (first 5000 chars)
    └─► Call callAIWithObjectResponse()
    │
    ▼
callAIWithObjectResponse() [@darkpatternhunter/core]
    ├─► Create OpenAI client
    ├─► Send request with image + text
    ├─► Parse JSON response
    └─► Filter by confidence > 0.7
    │
    ▼
storeDatasetEntry()
    ├─► Save to IndexedDB
    ├─► Include patterns, metadata, summary
    └─► Update statistics
```

## Environment Variables

The system uses these environment variable keys (defined in `packages/shared/src/env/types.ts`):

- `MIDSCENE_OPENAI_API_KEY` - OpenAI API key
- `MIDSCENE_OPENAI_BASE_URL` - Base URL (default: https://api.openai.com/v1)
- `MIDSCENE_MODEL_NAME` - Model name (e.g., "gpt-4o", "gpt-4-vision-preview")
- `MIDSCENE_VL_MODE` - Vision mode (optional)
- `OPENAI_API_KEY` - Alternative key name (for compatibility)

## Testing Checklist

- [ ] OpenAI API key can be configured
- [ ] Dark pattern detection works with GPT-4o
- [ ] Screenshot capture works on various sites
- [ ] DOM extraction works on SPAs
- [ ] IndexedDB storage persists data
- [ ] Statistics calculation is accurate
- [ ] JSONL export works
- [ ] Error handling for API failures
- [ ] Retry logic works correctly

## Next Steps

1. **Immediate:** Update AI config to use OpenAI API
2. **Short-term:** Add API key input UI
3. **Medium-term:** Update branding throughout codebase
4. **Long-term:** Add rule-based fallback, visual highlighting, backend integration

## Key Insights

1. **You're 80% done!** The dark pattern detection is already implemented.
2. **The architecture is solid** - separation of concerns is good.
3. **OpenAI integration is straightforward** - just change the config.
4. **The prompt is well-designed** - covers all 6 categories with Pakistani context.
5. **Storage is ready** - IndexedDB is set up for local dataset.

## Potential Issues & Solutions

### Issue 1: API Key Security
**Problem:** Storing API keys in Chrome storage is not ideal.
**Solution:** 
- Use Chrome's `chrome.storage.local` (encrypted at rest)
- Consider backend proxy for production
- Add key rotation mechanism

### Issue 2: Rate Limiting
**Problem:** OpenAI API has rate limits.
**Solution:**
- Implement request queuing
- Add exponential backoff
- Cache results per URL

### Issue 3: Cost Management
**Problem:** GPT-4o vision is expensive.
**Solution:**
- Use GPT-4o-mini for initial screening
- Only use GPT-4o for high-confidence cases
- Implement cost tracking

### Issue 4: SPA Navigation
**Problem:** Single Page Apps don't trigger page loads.
**Solution:**
- Listen to `history.pushState` events
- Use MutationObserver for DOM changes
- Add manual refresh button

## Resources

- **OpenAI Vision API Docs:** https://platform.openai.com/docs/guides/vision
- **Chrome Extension API:** https://developer.chrome.com/docs/extensions/reference/
- **IndexedDB Guide:** https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

---

**Last Updated:** 2025-01-XX
**Status:** Phase 1 (OpenAI Integration) - Ready to implement




