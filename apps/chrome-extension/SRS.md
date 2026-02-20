# Software Requirements Specification (SRS)
## Pattern Hunter Chrome Extension

**Version:** 0.139  
**Date:** January 2025  
**Document Type:** Software Requirements Specification

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Features](#3-system-features)
4. [External Interface Requirements](#4-external-interface-requirements)
5. [System Architecture](#5-system-architecture)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Data Models](#7-data-models)
8. [User Interface Requirements](#8-user-interface-requirements)

---

## 1. Introduction

### 1.1 Purpose

This document provides a comprehensive Software Requirements Specification (SRS) for the **Pattern Hunter** Chrome Extension. The extension is an AI-powered browser automation and dark pattern detection tool that enables users to interact with web pages using natural language instructions, record user interactions, control browsers programmatically, and build datasets for machine learning.

### 1.2 Scope

The Pattern Hunter extension is a Chrome browser extension (Manifest V3) that provides:

- **AI-Powered Web Automation**: Natural language control of web pages using visual language models
- **Dark Pattern Detection**: Automated identification of deceptive UI patterns on web pages
- **Interaction Recording**: Capture and replay user interactions for test generation
- **Bridge Mode**: Programmatic browser control via WebSocket connection
- **Dataset Collection**: Build ML datasets from webpage analysis

### 1.3 Definitions, Acronyms, and Abbreviations

- **VLM**: Visual Language Model - AI models that understand both images and text
- **UI-TARS**: A fine-tuned visual language model for UI understanding
- **DOM**: Document Object Model - HTML structure of web pages
- **CDP**: Chrome DevTools Protocol - Protocol for controlling Chrome browser
- **IndexedDB**: Browser-based database for storing large amounts of structured data
- **JSONL**: JSON Lines format - One JSON object per line, used for ML datasets
- **Dark Pattern**: Deceptive UI/UX design patterns that trick users into unintended actions

### 1.4 References

- Chrome Extension Manifest V3: https://developer.chrome.com/docs/extensions/mv3/
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- MidScene.js Documentation: https://midscenejs.com

---

## 2. Overall Description

### 2.1 Product Perspective

Pattern Hunter is a Chrome extension built on top of the MidScene.js framework. It integrates with:

- **Chrome Browser**: Uses Chrome DevTools Protocol for page control
- **AI Models**: Supports multiple visual language models (UI-TARS, Qwen3-VL, Gemini, GPT-4o)
- **Local Storage**: Uses IndexedDB for persistent data storage
- **WebSocket Server**: For Bridge Mode communication with external scripts

### 2.2 Product Functions

The extension provides four main operational modes:

1. **Playground Mode**: Interactive AI-powered web automation
2. **Recorder Mode**: Record user interactions and generate test scripts
3. **Bridge Mode**: Connect to external scripts via WebSocket
4. **Dataset Collection Mode**: Analyze pages and build ML datasets

### 2.3 User Classes and Characteristics

**Primary Users:**
- **Developers**: Automate web testing, generate test scripts
- **QA Engineers**: Record and replay test scenarios
- **Researchers**: Collect dark pattern datasets for ML training
- **Automation Engineers**: Control browsers programmatically

**User Characteristics:**
- Technical proficiency with browser extensions
- Understanding of AI/ML concepts (for dataset building)
- Familiarity with web development concepts

### 2.4 Operating Environment

- **Browser**: Google Chrome (latest stable version)
- **OS**: Windows, macOS, Linux
- **Manifest Version**: V3
- **Permissions Required**: 
  - `activeTab`: Access current tab
  - `tabs`: Manage browser tabs
  - `sidePanel`: Display side panel UI
  - `debugger`: Control browser via CDP
  - `scripting`: Inject content scripts

### 2.5 Design and Implementation Constraints

- Must comply with Chrome Extension Manifest V3 requirements
- Limited to Chrome browser (not Firefox, Safari, Edge)
- Requires AI model API access (local or remote)
- Storage limited by browser IndexedDB quotas
- Cannot access `chrome://` internal pages

---

## 3. System Features

### 3.1 Feature 1: Playground Mode

**Priority:** High  
**Description:** Interactive AI-powered web automation using natural language.

#### 3.1.1 Functional Requirements

**FR-1.1**: The system shall allow users to input natural language instructions to control web pages.

**FR-1.2**: The system shall capture page screenshots and DOM structure for AI analysis.

**FR-1.3**: The system shall execute AI-generated actions (click, type, scroll, etc.) on web pages.

**FR-1.4**: The system shall display execution history and results in a chat-like interface.

**FR-1.5**: The system shall support multiple AI models (UI-TARS, GPT-4o, Qwen3-VL, Gemini).

**FR-1.6**: The system shall persist conversation history in IndexedDB.

**FR-1.7**: The system shall provide visual feedback during action execution.

#### 3.1.2 Supported Actions

- **Click/Tap**: Click on elements identified by AI
- **Double Click**: Double-click interactions
- **Right Click**: Context menu interactions
- **Hover**: Hover over elements
- **Input**: Type text into form fields
- **Keyboard Press**: Press keyboard keys/combinations
- **Scroll**: Scroll page in any direction
- **Drag & Drop**: Drag elements to new locations
- **Long Press**: Long-press interactions (mobile)
- **Swipe**: Swipe gestures (mobile)

#### 3.1.3 Data Extraction

- **aiQuery**: Extract structured data from UI
- **aiString**: Extract text from elements
- **aiNumber**: Extract numeric values
- **aiBoolean**: Check true/false conditions
- **aiAsk**: Ask questions about page content

#### 3.1.4 Validation

- **aiAssert**: Verify conditions exist
- **aiWaitFor**: Wait for conditions to appear

### 3.2 Feature 2: Recorder Mode

**Priority:** Medium  
**Description:** Record user interactions and generate automated test scripts.

#### 3.2.1 Functional Requirements

**FR-2.1**: The system shall record all user interactions (clicks, inputs, scrolls) on web pages.

**FR-2.2**: The system shall store recording sessions in IndexedDB.

**FR-2.3**: The system shall allow users to create, edit, and delete recording sessions.

**FR-2.4**: The system shall generate test scripts (Playwright, YAML) from recorded interactions.

**FR-2.5**: The system shall display recorded events in a timeline view.

**FR-2.6**: The system shall automatically stop recording on page navigation/refresh.

**FR-2.7**: The system shall export recordings as JSON files.

**FR-2.8**: The system shall limit to 5 active recording sessions (auto-delete oldest).

#### 3.2.2 Recorded Event Types

- Mouse clicks (left, right, double)
- Keyboard input
- Scroll events
- Page navigation
- Element interactions
- Form submissions

#### 3.2.3 Script Generation

- **Playwright**: Generate Playwright test scripts
- **YAML**: Generate YAML automation scripts
- **JSON**: Export raw event data

### 3.3 Feature 3: Bridge Mode

**Priority:** Medium  
**Description:** Connect browser to external scripts via WebSocket for programmatic control.

#### 3.3.1 Functional Requirements

**FR-3.1**: The system shall establish WebSocket connection on port 8765 (default).

**FR-3.2**: The system shall listen for connection requests from external scripts.

**FR-3.3**: The system shall allow auto-connect option (persist user preference).

**FR-3.4**: The system shall display connection status and messages.

**FR-3.5**: The system shall store bridge messages in IndexedDB.

**FR-3.6**: The system shall support all Playground actions via bridge commands.

**FR-3.7**: The system shall handle connection retries automatically.

**FR-3.8**: The system shall allow manual connection/disconnection.

#### 3.3.2 Bridge Protocol

- **Connection**: WebSocket on `ws://localhost:8765`
- **Commands**: All Playground actions available via bridge
- **Status Messages**: Real-time status updates
- **Error Handling**: Automatic retry on connection failure

### 3.4 Feature 4: Dataset Collection Mode

**Priority:** High  
**Description:** Analyze web pages for dark patterns and build ML datasets.

#### 3.4.1 Functional Requirements

**FR-4.1**: The system shall capture full-page screenshots of web pages.

**FR-4.2**: The system shall capture DOM structure (first 10,000 characters stored).

**FR-4.3**: The system shall analyze pages using AI for dark pattern detection.

**FR-4.4**: The system shall store analysis results in IndexedDB.

**FR-4.5**: The system shall support batch processing of multiple URLs.

**FR-4.6**: The system shall export datasets in JSONL format.

**FR-4.7**: The system shall display detected patterns with severity levels.

**FR-4.8**: The system shall allow deletion of individual dataset entries.

**FR-4.9**: The system shall show progress during batch processing.

#### 3.4.2 Dark Pattern Types Detected

1. **Fake Scarcity**: "Only 3 left in stock!" messages
2. **Confirmshaming**: Negative option wording ("No thanks, I don't want to save")
3. **Forced Action**: Must sign up to continue
4. **Hidden Costs**: Fees added at checkout
5. **Sneak into Basket**: Items added without consent
6. **Misdirection**: Distracting from important information
7. **Roach Motel**: Easy to get in, hard to get out
8. **Privacy Zuckering**: Tricking users into sharing more data
9. **Bait and Switch**: Advertise one thing, deliver another
10. **Disguised Ads**: Ads that look like content
11. **Friend Spam**: Spam from social connections
12. **Price Comparison Prevention**: Hiding better deals
13. **Trick Questions**: Confusing checkbox wording
14. **Billing**: Hidden recurring charges

#### 3.4.3 Dataset Entry Structure

```typescript
interface DatasetEntry {
  id: string;                    // Unique entry ID
  url: string;                   // Page URL analyzed
  timestamp: number;              // Analysis timestamp
  screenshot?: string;            // Base64 encoded PNG
  dom?: string;                  // HTML structure (first 10k chars)
  patterns: DarkPattern[];       // Detected patterns
  metadata?: {
    pageTitle?: string;
    viewport?: { width: number; height: number };
    userAgent?: string;
  };
}

interface DarkPattern {
  type: string;                  // Pattern type name
  description: string;           // Detailed description
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;              // Where on page
  evidence: string;              // Specific evidence
  confidence?: number;           // 0-1 confidence score
  bbox?: [number, number, number, number]; // Bounding box
}
```

#### 3.4.4 Export Format

- **JSONL**: One JSON object per line
- **File Naming**: `dark-patterns-dataset-{timestamp}.jsonl`
- **Content**: All dataset entries with full data

---

## 4. External Interface Requirements

### 4.1 User Interfaces

#### 4.1.1 Extension Popup

- **Location**: Chrome toolbar icon click
- **Size**: Responsive, max-width 800px
- **Layout**: 
  - Top navigation bar with mode selector
  - Main content area (mode-specific)
  - Bottom action bar (when applicable)

#### 4.1.2 Mode Selector

- Dropdown menu with 4 modes:
  - Playground (Send icon)
  - Recorder (Video camera icon)
  - Bridge Mode (API icon)
  - Dataset Collection (Database icon)

#### 4.1.3 Playground UI

- Chat-like interface
- Input field for natural language instructions
- Message history display
- Action execution indicators
- Context preview (optional)

#### 4.1.4 Recorder UI

- Session list view
- Recording detail view
- Timeline of recorded events
- Export controls
- Session management (create, edit, delete)

#### 4.1.5 Bridge Mode UI

- Connection status indicator
- Message log display
- Auto-connect toggle
- Connect/Disconnect button

#### 4.1.6 Dataset Collection UI

- Statistics dashboard (total entries, patterns found)
- Current page analysis button
- Batch URL processing input
- Entry list with pattern details
- Export JSONL button
- Delete entry controls

### 4.2 Hardware Interfaces

- **None**: Extension runs entirely in browser environment

### 4.3 Software Interfaces

#### 4.3.1 Chrome APIs

- `chrome.tabs`: Tab management
- `chrome.debugger`: Chrome DevTools Protocol access
- `chrome.scripting`: Content script injection
- `chrome.storage`: Local storage (limited use)
- `chrome.runtime`: Extension lifecycle

#### 4.3.2 AI Model APIs

**Supported Models:**
- **UI-TARS**: Local server at `http://localhost:8000/v1`
- **OpenAI GPT-4o**: Via OpenAI API
- **Qwen3-VL**: Via compatible API
- **Gemini 2.5 Pro**: Via Google API

**API Requirements:**
- Vision capability (image + text input)
- JSON response format support
- HTTP/HTTPS communication

#### 4.3.3 Storage Interfaces

- **IndexedDB**: Primary storage for all persistent data
  - Playground conversations
  - Recording sessions
  - Bridge messages
  - Dataset entries

### 4.4 Communication Interfaces

#### 4.4.1 WebSocket (Bridge Mode)

- **Protocol**: WebSocket (ws://)
- **Port**: 8765 (default, configurable)
- **Message Format**: JSON
- **Connection**: Persistent, auto-reconnect

#### 4.4.2 HTTP/HTTPS (AI Models)

- **Protocol**: HTTP/HTTPS
- **Endpoints**: Model-specific
- **Authentication**: API keys (when required)
- **Format**: JSON request/response

---

## 5. System Architecture

### 5.1 Component Architecture

```
┌─────────────────────────────────────────────────┐
│           Chrome Extension Popup                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │Playground│  │ Recorder │  │  Bridge  │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│  ┌──────────────────────────────────────────┐   │
│  │      Dataset Collection                  │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│         Background Service Worker                │
│  - Tab management                                │
│  - Debugger attachment                           │
│  - Message routing                               │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│         Chrome DevTools Protocol (CDP)           │
│  - Page control                                  │
│  - Screenshot capture                            │
│  - DOM extraction                                 │
│  - Input simulation                               │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│              Web Pages                          │
│  - Content scripts injected                     │
│  - DOM access                                   │
│  - Event capture                                │
└─────────────────────────────────────────────────┘
```

### 5.2 Data Flow

#### 5.2.1 Playground Mode Flow

```
User Input (Natural Language)
    │
    ▼
AI Model (VLM) Analysis
    │
    ├─► Screenshot Analysis
    ├─► DOM Analysis
    └─► Action Planning
    │
    ▼
Action Execution (via CDP)
    │
    ├─► Click/Tap
    ├─► Input
    ├─► Scroll
    └─► Other Actions
    │
    ▼
Result Display
    │
    ▼
IndexedDB Storage (Conversation History)
```

#### 5.2.2 Dataset Collection Flow

```
User Triggers Analysis
    │
    ▼
Page Capture
    │
    ├─► Screenshot (Full Page)
    └─► DOM (First 10k chars)
    │
    ▼
AI Analysis (Dark Pattern Detection)
    │
    ├─► Visual Analysis
    ├─► DOM Analysis
    └─► Pattern Identification
    │
    ▼
Pattern Extraction
    │
    ├─► Type
    ├─► Severity
    ├─► Location
    └─► Evidence
    │
    ▼
IndexedDB Storage
    │
    ▼
Export (JSONL Format)
```

### 5.3 Storage Architecture

#### 5.3.1 IndexedDB Databases

**1. `midscene_dataset` (Dataset Collection)**
- Store: `dataset_entries`
- Key: `id` (string)
- Data: DatasetEntry objects

**2. `midscene-recorder` (Recorder)**
- Store: `recording-sessions`
- Key: `id` (string)
- Indexes: `createdAt`, `updatedAt`
- Store: `config`
- Key: `key` (string)

**3. `midscene_bridge` (Bridge Mode)**
- Store: `bridge_messages`
- Key: `id` (string)
- Data: Bridge message objects

**4. `chrome-extension-playground` (Playground)**
- Store: Conversation history
- Managed by Playground SDK

---

## 6. Non-Functional Requirements

### 6.1 Performance Requirements

**NFR-1**: Screenshot capture shall complete within 2 seconds for pages up to 1920x1080 resolution.

**NFR-2**: AI analysis response time shall be under 30 seconds for standard web pages.

**NFR-3**: IndexedDB operations shall complete within 1 second for datasets up to 1000 entries.

**NFR-4**: Extension popup shall load within 1 second.

**NFR-5**: Batch processing shall handle at least 10 URLs per minute.

### 6.2 Security Requirements

**NFR-6**: API keys shall never be stored in plain text (use Chrome secure storage).

**NFR-7**: Extension shall only access tabs user explicitly interacts with.

**NFR-8**: No data shall be transmitted to third parties except configured AI model APIs.

**NFR-9**: User data in IndexedDB shall remain local to user's browser.

### 6.3 Reliability Requirements

**NFR-10**: Extension shall handle network failures gracefully with user notifications.

**NFR-11**: Extension shall recover from IndexedDB errors without data loss.

**NFR-12**: Bridge Mode shall auto-reconnect on connection failure.

**NFR-13**: Extension shall not crash on invalid AI model responses.

### 6.4 Usability Requirements

**NFR-14**: UI shall be responsive and work on screens from 800px to 1920px width.

**NFR-15**: Error messages shall be clear and actionable.

**NFR-16**: Mode switching shall be intuitive (dropdown menu).

**NFR-17**: Progress indicators shall be shown for long-running operations.

### 6.5 Compatibility Requirements

**NFR-18**: Extension shall work on Chrome 120+ (Manifest V3 support).

**NFR-19**: Extension shall work on Windows, macOS, and Linux.

**NFR-20**: Extension shall support both HTTP and HTTPS web pages.

**NFR-21**: Extension shall not work on `chrome://` internal pages (by design).

### 6.6 Scalability Requirements

**NFR-22**: IndexedDB shall handle at least 10,000 dataset entries.

**NFR-23**: Extension shall support batch processing of 100+ URLs.

**NFR-24**: Conversation history shall support at least 1000 messages per session.

---

## 7. Data Models

### 7.1 Dataset Entry Model

```typescript
interface DatasetEntry {
  id: string;                    // Format: "entry-{timestamp}-{random}"
  url: string;                   // Full page URL
  timestamp: number;              // Unix timestamp (ms)
  screenshot?: string;           // Base64 PNG (data:image/png;base64,...)
  dom?: string;                  // HTML string (first 10,000 chars)
  patterns: DarkPattern[];       // Array of detected patterns
  metadata?: {
    pageTitle?: string;           // Document title
    viewport?: {
      width: number;              // Viewport width
      height: number;             // Viewport height
    };
    userAgent?: string;           // Browser user agent
  };
}
```

### 7.2 Dark Pattern Model

```typescript
interface DarkPattern {
  type: string;                  // Pattern type (e.g., "Fake Scarcity")
  description: string;           // Detailed description
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: string;              // Location on page (e.g., "header banner")
  evidence: string;              // Specific evidence text/element
  confidence?: number;           // 0-1 confidence score (optional)
  bbox?: [number, number, number, number]; // [x, y, width, height] (optional)
}
```

### 7.3 Recording Session Model

```typescript
interface RecordingSession {
  id: string;                    // Unique session ID
  name: string;                  // User-defined name
  createdAt: number;            // Creation timestamp
  updatedAt: number;             // Last update timestamp
  events: RecordingEvent[];       // Array of recorded events
  status: 'idle' | 'recording' | 'paused';
  generatedCode?: string;        // Generated test code
}

interface RecordingEvent {
  hashId: string;               // Unique event ID
  type: string;                  // Event type (click, input, etc.)
  timestamp: number;             // Event timestamp
  // ... event-specific data
}
```

### 7.4 Bridge Message Model

```typescript
interface BridgeMessage {
  id: string;                    // Message ID
  type: 'system' | 'status';     // Message type
  content: string;               // Message content
  timestamp: number;              // Timestamp
  time: string;                   // Formatted time (HH:mm:ss.SSS)
}
```

---

## 8. User Interface Requirements

### 8.1 Navigation

**UI-1**: Extension popup shall display a top navigation bar with:
- Mode selector dropdown (left side)
- Mode title (left side, next to selector)
- Configuration actions (right side)

**UI-2**: Mode selector shall persist user's last selected mode.

**UI-3**: Mode switching shall be instant (no page reload).

### 8.2 Playground Mode UI

**UI-4**: Playground shall display:
- Chat message history (scrollable)
- Input field at bottom
- Send button
- Clear conversation button
- Model configuration indicator

**UI-5**: Messages shall show:
- User prompts
- AI responses
- Action execution status
- Error messages (if any)

### 8.3 Recorder Mode UI

**UI-6**: Recorder list view shall show:
- Session cards with name, date, event count
- Create new session button
- Edit/Delete actions per session
- Export options

**UI-7**: Recorder detail view shall show:
- Recording controls (Start/Stop/Pause)
- Event timeline
- Export code button
- Session metadata

### 8.4 Bridge Mode UI

**UI-8**: Bridge Mode shall display:
- Connection status (visual indicator)
- Message log (scrollable)
- Auto-connect toggle
- Connect/Disconnect button
- Clear messages button

### 8.5 Dataset Collection UI

**UI-9**: Dataset Collection shall display:
- Statistics cards (Total Entries, Patterns Found)
- "Analyze Current Page" button
- Batch URL input (textarea)
- Progress indicator (during batch processing)
- Entry list with:
  - URL
  - Timestamp
  - Pattern count
  - Pattern details (expandable)
  - Delete button
- Export JSONL button

**UI-10**: Pattern display shall show:
- Pattern type (with color coding by severity)
- Severity badge
- Location
- Description
- Evidence

### 8.6 Error Handling UI

**UI-11**: Errors shall be displayed as:
- Toast notifications (Ant Design message)
- Inline error messages in relevant sections
- Console logging for debugging

**UI-12**: Loading states shall show:
- Spinner indicators
- Progress bars (for batch operations)
- Disabled buttons during operations

### 8.7 Responsive Design

**UI-13**: Extension popup shall be responsive:
- Minimum width: 400px
- Maximum width: 800px
- Scrollable content areas when needed
- Mobile-friendly touch targets (44x44px minimum)

---

## 9. Configuration Requirements

### 9.1 AI Model Configuration

**CFG-1**: Extension shall support configuration of:
- API Base URL
- API Key (optional, for local servers)
- Model Name
- Vision Mode (vlm-ui-tars, etc.)

**CFG-2**: Default configuration shall use:
- Base URL: `http://localhost:8000/v1`
- Model: `ui-tars-1.5-7b`
- Vision Mode: `vlm-ui-tars`

**CFG-3**: Configuration shall be stored in extension's environment config.

**CFG-4**: Configuration shall be accessible via NavActions component.

### 9.2 Extension Settings

**SET-1**: Extension shall remember:
- Last selected mode (localStorage)
- Auto-connect preference for Bridge Mode
- UI preferences (if any)

---

## 10. Testing Requirements

### 10.1 Functional Testing

**TEST-1**: All four modes shall be tested for basic functionality.

**TEST-2**: AI model integration shall be tested with at least one supported model.

**TEST-3**: IndexedDB operations shall be tested for all storage operations.

**TEST-4**: Export functionality shall be tested for all export formats.

### 10.2 Integration Testing

**TEST-5**: Chrome DevTools Protocol integration shall be tested.

**TEST-6**: WebSocket Bridge connection shall be tested.

**TEST-7**: Content script injection shall be tested.

### 10.3 Performance Testing

**TEST-8**: Screenshot capture performance shall be measured.

**TEST-9**: Batch processing performance shall be measured.

**TEST-10**: IndexedDB query performance shall be measured.

---

## 11. Deployment Requirements

### 11.1 Build Process

**DEP-1**: Extension shall be built using `rsbuild`.

**DEP-2**: Build output shall be in `dist/` directory.

**DEP-3**: Extension package shall be created as ZIP file.

**DEP-4**: Build process shall include:
- TypeScript compilation
- React component bundling
- Asset copying
- Manifest generation

### 11.2 Installation

**DEP-5**: Extension shall be installable via:
- Unpacked extension (development)
- Chrome Web Store (production)
- Packaged ZIP file (distribution)

### 11.3 Version Management

**DEP-6**: Version number shall be in `package.json` and `manifest.json`.

**DEP-7**: Version format: `MAJOR.MINOR.PATCH` (e.g., 0.139.0).

---

## 12. Maintenance and Support

### 12.1 Logging

**LOG-1**: Extension shall log:
- AI model API calls
- IndexedDB operations (errors)
- Bridge connection events
- User actions (anonymized)

**LOG-2**: Logs shall be accessible via Chrome DevTools console.

### 12.2 Error Reporting

**ERR-1**: Errors shall be logged to console with stack traces.

**ERR-2**: User-facing errors shall be displayed as notifications.

**ERR-3**: Critical errors shall prevent further operation until resolved.

---

## Appendix A: Glossary

- **Agent**: A proxy object that controls a browser page/device
- **CDP**: Chrome DevTools Protocol
- **Dark Pattern**: Deceptive UI/UX design pattern
- **DOM**: Document Object Model (HTML structure)
- **IndexedDB**: Browser-based NoSQL database
- **JSONL**: JSON Lines format (one JSON object per line)
- **Manifest V3**: Latest Chrome extension manifest format
- **VLM**: Visual Language Model (AI that understands images + text)
- **UI-TARS**: Fine-tuned visual language model for UI understanding

---

## Appendix B: Change History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-23 | System | Initial SRS document creation |

---

**End of Document**










