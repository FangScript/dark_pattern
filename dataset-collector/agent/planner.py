"""
agent/planner.py — Planning & Localization Layer
==================================================
Decomposes a full page into region subtasks for targeted detection:
  - Splits page into logical regions (header, product cards, checkout, etc.)
  - Crops the screenshot / DOM for each region
  - Maps dark pattern descriptions to DOM elements
  - Computes pixel-accurate bounding boxes from captured element data
  - Plans which interactions to run in each region
"""

import base64
import io
import logging
from dataclasses import dataclass, field
from typing import Optional

from PIL import Image

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import REGIONS, DOM_EXCERPT_CHARS
from capture.browser_capture import CaptureResult, ElementBBox

logger = logging.getLogger("planner")


@dataclass
class RegionTask:
    """A subtask for one page region to be sent to the AI Agent."""
    region_name: str                      # e.g. "header", "product_card"
    screenshot_crop: str                  # base64 PNG of the cropped area
    dom_excerpt: str                      # HTML substring for this region
    elements: list[ElementBBox]           # Elements within this region
    bbox: list[int]                       # Region bounding box [x, y, w, h]
    priority: int = 0                     # Higher = inspect first
    interaction_screenshots: list[str] = field(default_factory=list)


class Planner:
    """
    Takes a CaptureResult and produces a list of RegionTasks for the agent
    to analyze. Each RegionTask contains a cropped screenshot and DOM slice
    for one logical page region.
    """

    def plan(self, capture: CaptureResult) -> list[RegionTask]:
        """
        Decompose the captured page into region subtasks.
        
        Strategy:
          1. For each region in config.REGIONS, find matching elements
          2. Compute a bounding box that covers all matched elements
          3. Crop the screenshot to that region
          4. Extract the DOM excerpt around matched elements
          5. Always include a full_page fallback
        
        Returns list of RegionTask sorted by priority (highest first).
        """
        tasks: list[RegionTask] = []
        full_image = self._decode_screenshot(capture.screenshot)

        if full_image is None:
            logger.error("Failed to decode full-page screenshot")
            return [self._full_page_task(capture)]

        img_width, img_height = full_image.size

        for region_name, selectors in REGIONS.items():
            if region_name == "full_page":
                continue

            # Find elements matching this region's selectors
            matched = self._match_elements(capture.element_bboxes, selectors)
            if not matched:
                continue

            # Compute bounding box covering all matching elements
            region_bbox = self._compute_region_bbox(matched, img_width, img_height)
            if region_bbox is None:
                continue

            # Crop screenshot
            crop_b64 = self._crop_screenshot(full_image, region_bbox)

            # Extract DOM excerpt around matched elements
            dom_excerpt = self._extract_dom_excerpt(capture.html, matched)

            # Determine priority
            priority = self._region_priority(region_name, matched)

            # Gather any interaction screenshots that overlap with this region
            interaction_shots = self._find_interaction_screenshots(
                capture, region_name
            )

            tasks.append(RegionTask(
                region_name=region_name,
                screenshot_crop=crop_b64,
                dom_excerpt=dom_excerpt,
                elements=matched,
                bbox=region_bbox,
                priority=priority,
                interaction_screenshots=interaction_shots,
            ))

        # Always include a full-page fallback (catches patterns not in any region)
        tasks.append(self._full_page_task(capture))

        # Sort by priority descending
        tasks.sort(key=lambda t: t.priority, reverse=True)

        logger.info(
            f"Planned {len(tasks)} region tasks: "
            + ", ".join(f"{t.region_name}({len(t.elements)} els)" for t in tasks)
        )
        return tasks

    # ─── Element Matching ─────────────────────────────────────────────────

    def _match_elements(
        self, elements: list[ElementBBox], selectors: list[str]
    ) -> list[ElementBBox]:
        """
        Match elements to region selectors.
        A CSS selector like 'header' matches any element with tag 'header'
        or with that string in its selector path.
        """
        matched = []
        for el in elements:
            if not el.visible:
                continue
            full_selector = el.selector.lower()
            tag = el.tag.lower()
            for sel in selectors:
                sel_lower = sel.lower().strip(".")
                if (
                    tag == sel_lower
                    or sel_lower in full_selector
                    or (sel_lower.startswith("[") and sel_lower.rstrip("]").lstrip("[").split("=")[0] in full_selector)
                ):
                    matched.append(el)
                    break
        return matched

    # ─── Bounding Box Computation ─────────────────────────────────────────

    def _compute_region_bbox(
        self, elements: list[ElementBBox], img_w: int, img_h: int
    ) -> Optional[list[int]]:
        """
        Compute a bounding box [x, y, width, height] that encloses all
        elements, with 20px padding.
        """
        if not elements:
            return None

        x_min = min(el.x for el in elements)
        y_min = min(el.y for el in elements)
        x_max = max(el.x + el.width for el in elements)
        y_max = max(el.y + el.height for el in elements)

        # Add padding
        pad = 20
        x_min = max(0, int(x_min) - pad)
        y_min = max(0, int(y_min) - pad)
        x_max = min(img_w, int(x_max) + pad)
        y_max = min(img_h, int(y_max) + pad)

        width = x_max - x_min
        height = y_max - y_min
        if width < 10 or height < 10:
            return None

        return [x_min, y_min, width, height]

    # ─── Screenshot Cropping ──────────────────────────────────────────────

    def _decode_screenshot(self, b64: str) -> Optional[Image.Image]:
        """Decode a base64 PNG into a PIL Image."""
        try:
            data = base64.b64decode(b64)
            return Image.open(io.BytesIO(data))
        except Exception as e:
            logger.error(f"Failed to decode screenshot: {e}")
            return None

    def _crop_screenshot(
        self, img: Image.Image, bbox: list[int]
    ) -> str:
        """Crop a PIL image to [x, y, w, h] and return as base64 PNG."""
        x, y, w, h = bbox
        cropped = img.crop((x, y, x + w, y + h))
        buf = io.BytesIO()
        cropped.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")

    # ─── DOM Excerpt ──────────────────────────────────────────────────────

    def _extract_dom_excerpt(
        self, html: str, elements: list[ElementBBox]
    ) -> str:
        """
        Extract a DOM excerpt by finding HTML fragments that mention
        the text of matched elements. Limited to DOM_EXCERPT_CHARS.
        """
        excerpts = []
        remaining = DOM_EXCERPT_CHARS

        for el in elements:
            if remaining <= 0:
                break
            if not el.text:
                continue

            # Find the text in the HTML
            search_text = el.text[:50]  # First 50 chars
            idx = html.find(search_text)
            if idx >= 0:
                # Extract surrounding context (200 chars before/after)
                start = max(0, idx - 200)
                end = min(len(html), idx + len(search_text) + 200)
                excerpt = html[start:end]
                excerpts.append(f"<!-- {el.selector} -->\n{excerpt}")
                remaining -= len(excerpt)

        if not excerpts:
            # Fallback: take the first N chars of the full HTML
            return html[:DOM_EXCERPT_CHARS]

        return "\n\n".join(excerpts)

    # ─── Priority ─────────────────────────────────────────────────────────

    def _region_priority(self, region_name: str, elements: list[ElementBBox]) -> int:
        """
        Assign priority based on how known dark patterns are to appear:
          modal/checkout > product_card > header > sidebar > footer
        """
        priority_map = {
            "modal": 100,       # Highest — modals often contain dark patterns
            "checkout": 90,     # Cart/checkout is a hotspot
            "product_card": 80, # Price tricks, urgency banners
            "header": 60,       # Announcement bars, cookie notices
            "sidebar": 40,      # Recommended items, "people also bought"
            "footer": 20,       # Hidden terms, dark links
        }
        base = priority_map.get(region_name, 10)
        # Bonus for more elements (more potential patterns)
        return base + min(len(elements), 20)

    # ─── Interaction Screenshots ──────────────────────────────────────────

    def _find_interaction_screenshots(
        self, capture: CaptureResult, region_name: str
    ) -> list[str]:
        """
        Find interaction screenshots that are relevant to this region.
        For now, include screenshots from interactions that mention
        keywords related to this region.
        """
        relevant = []
        keywords = {
            "modal": ["modal", "popup", "dialog", "overlay"],
            "checkout": ["cart", "checkout", "order", "payment"],
            "header": ["header", "nav", "banner", "announce"],
            "product_card": ["product", "item", "card"],
            "sidebar": ["sidebar", "aside", "side"],
            "footer": ["footer", "bottom"],
        }
        region_keywords = keywords.get(region_name, [])

        for i, interaction in enumerate(capture.interactions):
            target_lower = interaction.target.lower()
            action_lower = interaction.action.lower()
            if any(kw in target_lower or kw in action_lower for kw in region_keywords):
                if i < len(capture.screenshots_after_interactions):
                    relevant.append(capture.screenshots_after_interactions[i])

        return relevant

    # ─── Full-Page Fallback ───────────────────────────────────────────────

    def _full_page_task(self, capture: CaptureResult) -> RegionTask:
        """Create a catch-all full-page region task."""
        return RegionTask(
            region_name="full_page",
            screenshot_crop=capture.screenshot,  # Full screenshot
            dom_excerpt=capture.html[:DOM_EXCERPT_CHARS],
            elements=capture.element_bboxes[:100],  # Limit elements
            bbox=[0, 0, capture.viewport["width"], capture.viewport["height"]],
            priority=5,  # Lowest priority
            interaction_screenshots=capture.screenshots_after_interactions[:3],
        )
