/**
 * Screenshot Capture Utility
 * Provides automatic screenshot capture without requiring activeTab invocation
 * Uses Chrome Debugger API which works with debugger permission
 */

/**
 * Capture a screenshot of a tab using Debugger API
 * This works automatically without requiring user interaction
 * @param tabId - Tab ID to capture from
 * @returns Screenshot data URL
 */
export async function captureTabScreenshot(tabId: number): Promise<string> {
  try {
    // Attach debugger
    await chrome.debugger.attach({ tabId }, '1.3');

    try {
      // Capture screenshot using Debugger API
      // scaleFactor: 1 forces capture at CSS pixel resolution (DPR=1)
      // This is critical: the VLM processes the image and returns pixel coordinates
      // relative to the image it sees. OpenAI resizes images before processing,
      // and if we capture at 2× device pixels the VLM coords will be ~2× off.
      // Forcing DPR=1 ensures VLM bbox coordinates map 1:1 onto the saved image.
      const result = await chrome.debugger.sendCommand(
        { tabId },
        'Page.captureScreenshot',
        {
          format: 'png',
          quality: 0.9,
          fromSurface: true,
          captureBeyondViewport: false,
          scaleFactor: 1,
        },
      );

      if (!result || typeof result !== 'object' || !('data' in result)) {
        throw new Error('Failed to capture screenshot with Debugger API');
      }

      const screenshotData = (result as { data: string }).data;
      return `data:image/png;base64,${screenshotData}`;
    } finally {
      // Always detach debugger
      await chrome.debugger.detach({ tabId });
    }
  } catch (error) {
    // Fallback: try to get windowId and use captureVisibleTab
    // This requires activeTab invocation but might work if extension was invoked
    const tab = await chrome.tabs.get(tabId);
    if (tab.windowId) {
      return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(
          tab.windowId!,
          { format: 'png', quality: 90 },
          (dataUrl) => {
            if (chrome.runtime.lastError) {
              reject(
                new Error(
                  `Failed to capture screenshot: ${chrome.runtime.lastError.message}. Extension may need to be invoked first.`,
                ),
              );
            } else if (!dataUrl) {
              reject(new Error('Failed to capture screenshot'));
            } else {
              resolve(dataUrl);
            }
          },
        );
      });
    }
    throw new Error(
      `Failed to capture screenshot: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
