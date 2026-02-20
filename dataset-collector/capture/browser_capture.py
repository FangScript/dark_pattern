"""
capture/browser_capture.py — Browser Capture & Interaction Layer
=================================================================
Uses Playwright (async) to:
  - Navigate to URLs with a real browser context
  - Capture full-page screenshots (PNG, base64)
  - Extract complete DOM (outerHTML) and visible text
  - Auto-scroll the entire page to trigger lazy-loaded content
  - Interact with all interactive elements (click, hover, expand)
  - Detect dynamically loaded content after interactions
  - Collect metadata (URL, timestamp, viewport, page title)
"""

import asyncio
import base64
import json
import logging
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

from playwright.async_api import async_playwright, Page, Browser, BrowserContext

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    VIEWPORT_WIDTH, VIEWPORT_HEIGHT, PAGE_LOAD_TIMEOUT_MS,
    SCROLL_PAUSE_MS, RAW_DIR,
)

logger = logging.getLogger("capture")

# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class InteractionRecord:
    """Records a single browser interaction."""
    action: str           # "scroll", "click", "hover", "expand"
    target: str           # CSS selector or description
    timestamp: str        # ISO 8601
    revealed_new: bool    # Whether this interaction revealed new content
    screenshot_after: Optional[str] = None  # base64 screenshot taken after interaction


@dataclass
class ElementBBox:
    """Bounding box of a DOM element."""
    selector: str
    tag: str
    text: str
    x: float
    y: float
    width: float
    height: float
    visible: bool


@dataclass
class CaptureResult:
    """Complete capture output for one page."""
    url: str
    html: str                        # Full DOM outerHTML
    screenshot: str                  # Full-page screenshot (base64 PNG)
    text: str                        # Visible text (innerText)
    timestamp: str                   # ISO 8601
    viewport: dict                   # {width, height}
    page_title: str
    user_agent: str
    element_bboxes: list[ElementBBox] = field(default_factory=list)
    interactions: list[InteractionRecord] = field(default_factory=list)
    screenshots_after_interactions: list[str] = field(default_factory=list)  # Additional screenshots

    def to_dict(self) -> dict:
        d = asdict(self)
        # Don't include huge base64 strings in the dict summary
        d["screenshot"] = f"<base64 PNG, {len(self.screenshot)} chars>"
        d["html"] = f"<HTML, {len(self.html)} chars>"
        for i, s in enumerate(d.get("screenshots_after_interactions", [])):
            d["screenshots_after_interactions"][i] = f"<base64 PNG, {len(s)} chars>"
        return d


# ─── Browser Manager ─────────────────────────────────────────────────────────

class BrowserCapture:
    """
    Manages a Playwright browser instance for capturing and interacting
    with web pages.
    
    Usage:
        async with BrowserCapture() as capture:
            result = await capture.capture_page("https://daraz.pk")
    """
    
    def __init__(self, headless: bool = True):
        self.headless = headless
        self._playwright = None
        self._browser: Optional[Browser] = None
    
    async def __aenter__(self):
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            headless=self.headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        return self
    
    async def __aexit__(self, *args):
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def _new_page(self) -> tuple[BrowserContext, Page]:
        """Create a new browser context and page with configured viewport."""
        context = await self._browser.new_context(
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
        )
        page = await context.new_page()
        return context, page

    # ─── Core Capture ─────────────────────────────────────────────────────

    async def capture_page(
        self,
        url: str,
        interact: bool = True,
        scroll: bool = True,
    ) -> CaptureResult:
        """
        Full capture pipeline for a single URL:
          1. Navigate to page
          2. Auto-scroll to trigger lazy content
          3. Interact with elements (click, hover, expand)
          4. Capture full-page screenshot
          5. Extract DOM, text, metadata, element bboxes
        
        Args:
            url: The page URL to capture
            interact: Whether to interact with page elements
            scroll: Whether to auto-scroll the page first
        
        Returns:
            CaptureResult with all captured data
        """
        context, page = await self._new_page()
        interactions: list[InteractionRecord] = []
        extra_screenshots: list[str] = []

        try:
            # 1. Navigate
            logger.info(f"Navigating to {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT_MS)
            # Wait for the page to visually settle (lazy images, ads, etc.)
            await page.wait_for_timeout(2000)

            # 2. Auto-scroll (reveals lazy-loaded content)
            if scroll:
                scroll_records = await self._auto_scroll(page)
                interactions.extend(scroll_records)

            # 3. Interact with interactive elements
            if interact:
                interaction_records, screenshots = await self._interact_with_elements(page)
                interactions.extend(interaction_records)
                extra_screenshots.extend(screenshots)

            # 4. Scroll back to top for final full-page screenshot
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(500)

            # 5. Capture full-page screenshot
            screenshot_bytes = await page.screenshot(full_page=True, type="png")
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

            # 6. Extract DOM
            html = await page.evaluate("document.documentElement.outerHTML")

            # 7. Extract visible text
            text = await page.evaluate("document.body.innerText")

            # 8. Extract element bounding boxes
            element_bboxes = await self._extract_element_bboxes(page)

            # 9. Collect metadata
            title = await page.title()
            user_agent = await page.evaluate("navigator.userAgent")
            timestamp = datetime.now(timezone.utc).isoformat()

            result = CaptureResult(
                url=url,
                html=html,
                screenshot=screenshot_b64,
                text=text,
                timestamp=timestamp,
                viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
                page_title=title,
                user_agent=user_agent,
                element_bboxes=element_bboxes,
                interactions=interactions,
                screenshots_after_interactions=extra_screenshots,
            )

            logger.info(
                f"Capture complete: {url} | "
                f"{len(element_bboxes)} elements | "
                f"{len(interactions)} interactions | "
                f"{len(extra_screenshots)} extra screenshots"
            )
            return result

        finally:
            await context.close()

    # ─── Auto-Scroll ──────────────────────────────────────────────────────

    async def _auto_scroll(self, page: Page) -> list[InteractionRecord]:
        """
        Gradually scroll the entire page from top to bottom.
        This reveals lazy-loaded content, infinite scroll items, and
        triggers scroll-activated animations/popups.
        """
        records = []
        logger.info("Auto-scrolling page...")

        scroll_height = await page.evaluate("document.body.scrollHeight")
        viewport_height = VIEWPORT_HEIGHT
        current_position = 0
        scroll_step = viewport_height // 2  # Scroll half a viewport at a time
        prev_height = scroll_height

        while current_position < scroll_height:
            current_position += scroll_step
            await page.evaluate(f"window.scrollTo(0, {current_position})")
            await page.wait_for_timeout(SCROLL_PAUSE_MS)

            # Check if new content loaded (page got taller)
            new_height = await page.evaluate("document.body.scrollHeight")
            revealed_new = new_height > prev_height

            records.append(InteractionRecord(
                action="scroll",
                target=f"scrollTo(0, {current_position})",
                timestamp=datetime.now(timezone.utc).isoformat(),
                revealed_new=revealed_new,
            ))

            if revealed_new:
                logger.info(f"  Scroll revealed new content: {prev_height} → {new_height}px")
                scroll_height = new_height  # Update target
                prev_height = new_height

        logger.info(f"  Scrolled {current_position}px in {len(records)} steps")
        return records

    # ─── Element Interactions ─────────────────────────────────────────────

    async def _interact_with_elements(self, page: Page) -> tuple[list[InteractionRecord], list[str]]:
        """
        Interact with all interactive elements to reveal hidden dark patterns:
          - Click buttons/links that might open modals, popups, dropdowns
          - Hover over elements to trigger tooltips/popovers
          - Expand accordion sections and collapsed content
          - Detect and dismiss cookie banners / notification prompts
          
        Returns:
            (interaction_records, screenshots_after_interactions)
        """
        records: list[InteractionRecord] = []
        screenshots: list[str] = []

        # ── 1. Expand accordions / collapsed sections ─────────────────────
        accordion_selectors = [
            "details:not([open])",
            "[data-toggle='collapse']:not(.show)",
            ".accordion-button.collapsed",
            ".collapsible:not(.active)",
            "[aria-expanded='false']",
            ".expandable:not(.expanded)",
        ]
        for selector in accordion_selectors:
            try:
                elements = await page.query_selector_all(selector)
                for i, el in enumerate(elements[:5]):  # Limit to 5 per type
                    visible = await el.is_visible()
                    if not visible:
                        continue
                    try:
                        await el.click(timeout=3000)
                        await page.wait_for_timeout(500)
                        
                        # Capture screenshot after expansion
                        shot = await page.screenshot(full_page=True, type="png")
                        shot_b64 = base64.b64encode(shot).decode("utf-8")
                        screenshots.append(shot_b64)
                        
                        records.append(InteractionRecord(
                            action="expand",
                            target=f"{selector}[{i}]",
                            timestamp=datetime.now(timezone.utc).isoformat(),
                            revealed_new=True,
                        ))
                        logger.info(f"  Expanded: {selector}[{i}]")
                    except Exception as e:
                        logger.debug(f"  Failed to expand {selector}[{i}]: {e}")
            except Exception:
                pass

        # ── 2. Click buttons that might reveal modals/popups ──────────────
        modal_trigger_selectors = [
            "button[data-toggle='modal']",
            "[data-bs-toggle='modal']",
            "button.popup-trigger",
            "a[href='#'][data-modal]",
            ".show-more-btn",
            ".view-details",
            ".read-more",
            "button:has-text('View')",
            "button:has-text('Details')",
            "button:has-text('Terms')",
            "button:has-text('See')",
        ]
        for selector in modal_trigger_selectors:
            try:
                elements = await page.query_selector_all(selector)
                for i, el in enumerate(elements[:3]):  # Limit to 3 per type
                    visible = await el.is_visible()
                    if not visible:
                        continue
                    try:
                        await el.click(timeout=3000)
                        await page.wait_for_timeout(800)

                        # Check if a modal/popup appeared
                        modal_visible = await page.evaluate("""
                            () => {
                                const modals = document.querySelectorAll(
                                    '.modal.show, [role="dialog"]:not([hidden]), ' +
                                    '.popup.active, .overlay.visible'
                                );
                                return modals.length > 0;
                            }
                        """)

                        if modal_visible:
                            shot = await page.screenshot(full_page=True, type="png")
                            shot_b64 = base64.b64encode(shot).decode("utf-8")
                            screenshots.append(shot_b64)

                            records.append(InteractionRecord(
                                action="click_modal",
                                target=f"{selector}[{i}]",
                                timestamp=datetime.now(timezone.utc).isoformat(),
                                revealed_new=True,
                            ))
                            logger.info(f"  Clicked modal trigger: {selector}[{i}]")

                            # Dismiss the modal after capturing
                            await self._dismiss_modal(page)
                    except Exception as e:
                        logger.debug(f"  Failed to click {selector}[{i}]: {e}")
            except Exception:
                pass

        # ── 3. Hover over elements to trigger tooltips/popovers ───────────
        hover_selectors = [
            "[data-tooltip]",
            "[title]",
            "[data-toggle='tooltip']",
            "[data-bs-toggle='tooltip']",
            ".has-tooltip",
            ".info-icon",
            ".help-icon",
            "abbr[title]",
        ]
        for selector in hover_selectors:
            try:
                elements = await page.query_selector_all(selector)
                for i, el in enumerate(elements[:5]):
                    visible = await el.is_visible()
                    if not visible:
                        continue
                    try:
                        await el.hover(timeout=3000)
                        await page.wait_for_timeout(500)

                        records.append(InteractionRecord(
                            action="hover",
                            target=f"{selector}[{i}]",
                            timestamp=datetime.now(timezone.utc).isoformat(),
                            revealed_new=True,
                        ))
                        logger.debug(f"  Hovered: {selector}[{i}]")
                    except Exception as e:
                        logger.debug(f"  Failed to hover {selector}[{i}]: {e}")
            except Exception:
                pass

        # ── 4. Click dropdown triggers ────────────────────────────────────
        dropdown_selectors = [
            "select",
            "[data-toggle='dropdown']",
            "[data-bs-toggle='dropdown']",
            ".dropdown-toggle",
        ]
        for selector in dropdown_selectors:
            try:
                elements = await page.query_selector_all(selector)
                for i, el in enumerate(elements[:3]):
                    visible = await el.is_visible()
                    if not visible:
                        continue
                    try:
                        await el.click(timeout=3000)
                        await page.wait_for_timeout(400)

                        shot = await page.screenshot(full_page=True, type="png")
                        shot_b64 = base64.b64encode(shot).decode("utf-8")
                        screenshots.append(shot_b64)

                        records.append(InteractionRecord(
                            action="expand_dropdown",
                            target=f"{selector}[{i}]",
                            timestamp=datetime.now(timezone.utc).isoformat(),
                            revealed_new=True,
                        ))
                        logger.info(f"  Expanded dropdown: {selector}[{i}]")
                        
                        # Click elsewhere to close
                        await page.click("body", position={"x": 10, "y": 10})
                        await page.wait_for_timeout(300)
                    except Exception as e:
                        logger.debug(f"  Failed to open dropdown {selector}[{i}]: {e}")
            except Exception:
                pass

        logger.info(
            f"  Interactions complete: {len(records)} actions, "
            f"{len(screenshots)} extra screenshots"
        )
        return records, screenshots

    # ─── Modal Dismissal ──────────────────────────────────────────────────

    async def _dismiss_modal(self, page: Page):
        """Try to close any visible modal/popup."""
        dismiss_selectors = [
            ".modal .close", ".modal .btn-close",
            "[aria-label='Close']", ".popup-close",
            ".modal-close", ".overlay-close",
            "button:has-text('Close')", "button:has-text('×')",
            "button:has-text('✕')", "button:has-text('No thanks')",
        ]
        for sel in dismiss_selectors:
            try:
                btn = await page.query_selector(sel)
                if btn and await btn.is_visible():
                    await btn.click(timeout=2000)
                    await page.wait_for_timeout(300)
                    return
            except Exception:
                pass
        
        # Fallback: press Escape
        try:
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)
        except Exception:
            pass

    # ─── Element Bounding Boxes ───────────────────────────────────────────

    async def _extract_element_bboxes(self, page: Page) -> list[ElementBBox]:
        """
        Extract bounding boxes for all significant DOM elements using
        getBoundingClientRect(). This provides pixel-accurate positions
        for the planner to use when localizing dark patterns.
        """
        bboxes_raw = await page.evaluate("""
            () => {
                const results = [];
                // Query interactive and content elements
                const selectors = [
                    'button', 'a', 'input', 'select', 'textarea',
                    'h1', 'h2', 'h3', 'h4', 'p', 'span', 'div', 'section',
                    'img', 'video', 'form', 'label',
                    '[role="alert"]', '[role="dialog"]', '[role="banner"]',
                    '.badge', '.tag', '.chip', '.price', '.discount',
                    '.timer', '.countdown', '.stock', '.rating',
                ];
                const seen = new Set();
                
                for (const sel of selectors) {
                    const elements = document.querySelectorAll(sel);
                    for (const el of elements) {
                        // Skip duplicates and invisible elements
                        if (seen.has(el)) continue;
                        seen.add(el);
                        
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 5 || rect.height < 5) continue; // Skip tiny
                        if (rect.width === 0 || rect.height === 0) continue;
                        
                        const style = window.getComputedStyle(el);
                        if (style.display === 'none' || style.visibility === 'hidden') continue;
                        if (parseFloat(style.opacity) < 0.1) continue;
                        
                        const text = (el.innerText || el.textContent || '').trim().substring(0, 200);
                        
                        results.push({
                            selector: el.tagName.toLowerCase() + 
                                     (el.id ? '#' + el.id : '') + 
                                     (el.className && typeof el.className === 'string' 
                                         ? '.' + el.className.trim().split(/\\s+/).join('.') 
                                         : ''),
                            tag: el.tagName.toLowerCase(),
                            text: text,
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            width: Math.round(rect.width),
                            height: Math.round(rect.height),
                            visible: rect.width > 0 && rect.height > 0,
                        });
                    }
                }
                return results;
            }
        """)

        return [ElementBBox(**b) for b in bboxes_raw]

    # ─── Save Raw Capture ─────────────────────────────────────────────────

    async def save_raw(self, result: CaptureResult, capture_id: str) -> dict:
        """
        Save raw capture data to disk.
        
        Returns dict with file paths for reference.
        """
        import aiofiles

        # Save full screenshot
        screenshot_path = RAW_DIR / f"{capture_id}_full.png"
        screenshot_bytes = base64.b64decode(result.screenshot)
        async with aiofiles.open(screenshot_path, "wb") as f:
            await f.write(screenshot_bytes)

        # Save DOM
        dom_path = RAW_DIR / f"{capture_id}_dom.html"
        async with aiofiles.open(dom_path, "w", encoding="utf-8") as f:
            await f.write(result.html)

        # Save metadata (without large base64 blobs)
        meta = {
            "url": result.url,
            "timestamp": result.timestamp,
            "viewport": result.viewport,
            "page_title": result.page_title,
            "user_agent": result.user_agent,
            "text_length": len(result.text),
            "dom_length": len(result.html),
            "element_count": len(result.element_bboxes),
            "interaction_count": len(result.interactions),
            "interactions": [
                {"action": ir.action, "target": ir.target, "revealed_new": ir.revealed_new}
                for ir in result.interactions
            ],
        }
        meta_path = RAW_DIR / f"{capture_id}_meta.json"
        async with aiofiles.open(meta_path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(meta, indent=2))

        # Save interaction screenshots
        for i, shot_b64 in enumerate(result.screenshots_after_interactions):
            shot_path = RAW_DIR / f"{capture_id}_interaction_{i}.png"
            async with aiofiles.open(shot_path, "wb") as f:
                await f.write(base64.b64decode(shot_b64))

        logger.info(f"Saved raw capture: {capture_id} → {RAW_DIR}")
        return {
            "screenshot": str(screenshot_path),
            "dom": str(dom_path),
            "metadata": str(meta_path),
        }
