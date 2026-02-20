/// <reference types="chrome" />

import { uuid } from '@darkpatternhunter/shared/utils';
import type { WebUIContext } from '@darkpatternhunter/web';
import { captureTabScreenshot } from '../utils/screenshotCapture';

const workerMessageTypes = {
  SAVE_CONTEXT: 'save-context',
  GET_CONTEXT: 'get-context',
};

// save screenshot
interface WorkerRequestSaveContext {
  context: WebUIContext;
}

// get screenshot
interface WorkerRequestGetContext {
  id: string;
}

// console-browserify won't work in worker, so we need to use globalThis.console
const console = globalThis.console;

// Live Guard message types
const LIVE_GUARD_MESSAGES = {
  SCAN_PAGE: 'live-guard-scan-page',
  CLEAR_HIGHLIGHTS: 'live-guard-clear-highlights',
  SHOW_HIGHLIGHTS: 'live-guard-show-highlights',
  FOCUS_PATTERN: 'live-guard-focus-pattern',
} as const;

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// cache data between sidepanel and fullscreen playground
const cacheMap = new Map<string, WebUIContext>();

// Store connected ports for message forwarding
const connectedPorts = new Set<chrome.runtime.Port>();

// Listen for connections from extension pages
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'record-events') {
    connectedPorts.add(port);
    port.onDisconnect.addListener(() => {
      connectedPorts.delete(port);
    });
  } else {
    console.log('[ServiceWorker] Unknown port name:', port.name);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle Live Guard scan request
  if (request.action === LIVE_GUARD_MESSAGES.SCAN_PAGE) {
    console.log('[ServiceWorker] Live Guard scan request received');
    sendResponse({ success: true });
    return true;
  }

  // Handle Live Guard clear highlights request
  if (request.action === LIVE_GUARD_MESSAGES.CLEAR_HIGHLIGHTS) {
    console.log('[ServiceWorker] Live Guard clear highlights request received');
    sendResponse({ success: true });
    return true;
  }

  // Handle Live Guard focus pattern request
  if (request.action === LIVE_GUARD_MESSAGES.FOCUS_PATTERN) {
    console.log('[ServiceWorker] Live Guard focus pattern request received');
    sendResponse({ success: true });
    return true;
  }

  // Handle screenshot capture request
  if (request.action === 'captureScreenshot') {
    if (sender.tab && sender.tab.id !== undefined) {
      // Use debugger API for automatic operation without user interaction
      (async () => {
        try {
          const dataUrl = await captureTabScreenshot(sender.tab!.id!);
          sendResponse(dataUrl);
        } catch (error) {
          console.error(
            '[ServiceWorker] Failed to capture screenshot:',
            error,
          );
          sendResponse(null);
        }
      })();
      return true; // Keep the message channel open for async response
    } else {
      console.error('[ServiceWorker] No valid tab for screenshot capture');
      sendResponse(null);
      return true;
    }
  }

  // Handle dataset export download
  if (request.action === 'downloadDataset') {
    const { data, filename } = request;
    if (!data || !filename) {
      sendResponse({ success: false, error: 'Missing data or filename' });
      return true;
    }

    try {
      // Convert string data to blob URL (pretty JSON array)
      const blob = new Blob([data], { type: 'application/json' });
      const blobUrl = URL.createObjectURL(blob);

      // Use Chrome Downloads API
      chrome.downloads.download(
        {
          url: blobUrl,
          filename: filename,
          saveAs: true,
        },
        (downloadId) => {
          // Clean up blob URL after a short delay
          setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

          if (chrome.runtime.lastError) {
            console.error(
              '[ServiceWorker] Download error:',
              chrome.runtime.lastError,
            );
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
          } else {
            sendResponse({ success: true, downloadId });
          }
        },
      );
    } catch (error) {
      console.error('[ServiceWorker] Failed to create download:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    return true; // Keep the message channel open for async response
  }

  // Forward recording events to connected extension pages
  if (request.action === 'events' || request.action === 'event') {
    if (connectedPorts.size === 0) {
      console.warn(
        '[ServiceWorker] No connected ports to forward recording events to',
      );
    }

    connectedPorts.forEach((port) => {
      try {
        port.postMessage(request);
      } catch (error) {
        console.error(
          '[ServiceWorker] Failed to forward message to port:',
          error,
        );
        connectedPorts.delete(port); // Remove invalid port
      }
    });
    sendResponse({ success: true });
    return true;
  }

  switch (request.type) {
    case workerMessageTypes.SAVE_CONTEXT: {
      const payload: WorkerRequestSaveContext = request.payload;
      const { context } = payload;
      const id = uuid();
      cacheMap.set(id, context);
      sendResponse({ id });
      break;
    }
    case workerMessageTypes.GET_CONTEXT: {
      const payload: WorkerRequestGetContext = request.payload;
      const { id } = payload;
      const context = cacheMap.get(id) as WebUIContext;
      if (!context) {
        sendResponse({ error: 'Screenshot not found' });
      } else {
        sendResponse({ context });
      }

      break;
    }
    default:
      sendResponse({ error: 'Unknown message type' });
      break;
  }

  // Return true to indicate we will send a response asynchronously
  return true;
});
