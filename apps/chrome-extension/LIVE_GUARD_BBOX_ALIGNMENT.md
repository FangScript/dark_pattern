# Live Guard BBox Alignment Fix

## Problem

Live Guard highlights were appearing near the top of the page instead of the true element location, especially after scanning multiple scroll positions.

## Root Cause

The highlight pipeline mixed coordinate spaces:

- Pattern boxes are stored in **document-space** (`docLeft`, `docTop`).
- During render/scroll sync, they are converted to **viewport/client-space** (`left = docLeft - scrollX`, `top = docTop - scrollY`).

This conversion requires the overlay host to be viewport-pinned.  
Previously, the Shadow DOM host (`#live-guard-shadow-host`) used:

- `position: absolute`
- full-page/document sizing

That caused coordinate mismatch and top-biased placement.

## Fix Applied

File updated: `apps/chrome-extension/src/extension/live-guard/guardHighlighter.ts`

### 1) Make host viewport-fixed

Changed host style from document-absolute to viewport-fixed:

- `position: absolute` -> `position: fixed`
- `width: 100%` -> `width: 100vw`
- `height: 100%` -> `height: 100vh`

### 2) Remove document-height stretching

Removed logic that stretched the host to full document height and replaced it with a fixed-viewport host.

## Why This Works

Highlights now follow a consistent model:

1. Compute/store rectangles in **document-space**.
2. Convert to **client-space** on each scroll/resize.
3. Render inside a **fixed viewport overlay host**.

This keeps overlays aligned across:

- long pages
- multi-viewport captures
- scrolling after scan
- focus/hover interactions

## Validation Checklist

After reloading the extension:

1. Open a long page with content across top/middle/bottom.
2. Run Live Guard scan.
3. Scroll to middle and bottom sections.
4. Confirm highlights remain on the correct UI elements.
5. Hover pattern cards in the panel and verify focus highlight jumps to the correct element.
6. Click **Clear Highlights** and re-scan to confirm no stale overlay state.

## Build Status

Extension rebuild after the fix completed successfully:

- Command: `pnpm run build` (inside `apps/chrome-extension`)
- Result: success (`exit_code: 0`)
- Package output: `apps/chrome-extension/extension/dark-pattern-hunter-extension-v1.0.0.zip`

## Notes

- This fix addresses the critical top-viewport misalignment caused by host positioning.
- If any site still shows drift, next investigation should target:
  - per-pattern viewport filtering/index mapping
  - element snap fallback behavior for oversized containers
  - site-specific CSS transforms (rare, but possible)

