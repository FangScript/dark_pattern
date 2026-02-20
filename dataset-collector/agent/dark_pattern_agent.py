"""
agent/dark_pattern_agent.py — AI Agent Layer
==============================================
Multi-step reasoning agent that coordinates detection:
  1. Plan → identify which regions to inspect
  2. Detect → call VLM per region with screenshot + DOM slice
  3. Localize → refine bounding boxes via element lookup
  4. Verify → pass to Verification Engine
  5. Retry → re-query on failed verifications
  6. Approve → pass verified detections to Dataset Manager

The agent maintains task context, conversation history, and tracks
which interactions revealed new dark patterns.
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from openai import OpenAI

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    OPENAI_API_KEY, MODEL_NAME, BASE_URL, TAXONOMY, TAXONOMY_SET,
    CONFIDENCE_THRESHOLD, MAX_RETRIES, DATASET_VERSION,
)
from capture.browser_capture import CaptureResult, ElementBBox
from agent.planner import Planner, RegionTask

logger = logging.getLogger("agent")


# ─── Detection Data Class ────────────────────────────────────────────────────

@dataclass
class Detection:
    """A single dark pattern detection ready for verification & storage."""
    id: str                         # "dp_00123"
    url: str
    category: str                   # Exact taxonomy label
    bbox: list[int]                 # [x, y, width, height]
    confidence: float
    evidence: str                   # Exact text or element proving the pattern
    severity: str                   # "low" | "medium" | "high" | "critical"
    location: str                   # Region name
    screenshot_crop: Optional[str] = None   # base64 cropped image
    validated: bool = False
    timestamp: str = ""
    version: str = DATASET_VERSION
    interactions: list[str] = field(default_factory=list)  # What revealed this

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "category": self.category,
            "bbox": self.bbox,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "severity": self.severity,
            "location": self.location,
            "validated": self.validated,
            "timestamp": self.timestamp,
            "version": self.version,
            "interactions": self.interactions,
        }


# ─── VLM Prompt Template ─────────────────────────────────────────────────────

DETECTION_PROMPT = """You are a dark pattern detection expert analyzing a {region} section of a Pakistani e-commerce webpage.

## Strict Taxonomy (use ONLY these exact labels)
{taxonomy_list}

## Task
Analyze the provided screenshot and DOM excerpt for dark patterns. For each pattern:
1. Identify the exact category from the taxonomy above
2. Provide the bounding box [x, y, width, height] in pixels relative to the cropped image
3. Report the exact text evidence
4. Rate confidence (0.0–1.0) and severity (low/medium/high/critical)

## Element Context
The following DOM elements are in this region:
{element_context}

## Interaction Context
The following interactions were performed on this page:
{interaction_context}

## Output Format
Return ONLY valid JSON (no markdown, no explanation):
{{
  "patterns": [
    {{
      "category": "Exact Taxonomy Label",
      "bbox": [x, y, width, height],
      "confidence": 0.85,
      "severity": "medium",
      "evidence": "Quoted text from the page",
      "location": "{region}"
    }}
  ]
}}

If no dark patterns are found, return: {{"patterns": []}}
"""

RETRY_PROMPT = """Your previous detection for the region "{region}" was rejected because:
- {rejection_reason}

Please re-analyze the same screenshot more carefully. Remember:
- Confidence must be ≥ {threshold}
- Category must be one of the 18 taxonomy labels
- Bounding box must be realistic (not too small, not covering the whole page)
- Evidence must be actual text visible on the page

Return ONLY valid JSON with the same format as before.
"""


# ─── Agent ────────────────────────────────────────────────────────────────────

class DarkPatternAgent:
    """
    Coordinates the full detection pipeline:
      capture → plan → detect → localize → verify → store
    
    Manages task context and conversation history for multi-turn reasoning.
    """

    def __init__(self, id_counter_start: int = 1):
        """
        Args:
            id_counter_start: Starting number for detection IDs
        """
        if not OPENAI_API_KEY:
            raise ValueError(
                "OPENAI_API_KEY not set. Add it to dataset-collector/.env"
            )

        client_kwargs = {"api_key": OPENAI_API_KEY}
        if BASE_URL:
            client_kwargs["base_url"] = BASE_URL

        self.client = OpenAI(**client_kwargs)
        self.model = MODEL_NAME
        self.planner = Planner()
        self._id_counter = id_counter_start
        self._history: list[dict] = []  # Conversation history per URL

    def _next_id(self) -> str:
        """Generate the next detection ID (dp_00001, dp_00002, ...)."""
        did = f"dp_{self._id_counter:05d}"
        self._id_counter += 1
        return did

    # ─── Main Entry Point ─────────────────────────────────────────────────

    async def analyze(self, capture: CaptureResult) -> list[Detection]:
        """
        Full analysis pipeline for one captured page.
        
        Steps:
          1. Plan region subtasks
          2. For each region (by priority): detect → localize → verify
          3. Retry failed detections up to MAX_RETRIES
          4. Return all approved detections
        
        Args:
            capture: CaptureResult from BrowserCapture
        
        Returns:
            List of Detection objects ready for dataset storage
        """
        self._history = []  # Reset history for this URL
        all_detections: list[Detection] = []

        # 1. Plan region subtasks
        region_tasks = self.planner.plan(capture)
        logger.info(f"Analyzing {len(region_tasks)} regions for {capture.url}")

        # 2. Analyze each region
        for task in region_tasks:
            try:
                detections = await self._analyze_region(task, capture)
                all_detections.extend(detections)
            except Exception as e:
                logger.error(f"Error analyzing region {task.region_name}: {e}")
                continue

        # 3. Deduplicate (same pattern detected in multiple regions)
        unique = self._deduplicate(all_detections)

        logger.info(
            f"Analysis complete for {capture.url}: "
            f"{len(unique)} unique detections from {len(all_detections)} raw"
        )
        return unique

    # ─── Region Analysis ──────────────────────────────────────────────────

    async def _analyze_region(
        self, task: RegionTask, capture: CaptureResult
    ) -> list[Detection]:
        """
        Analyze a single region with retry logic.
        
        Loop: Detect → Validate → Retry → Approve
        """
        detections: list[Detection] = []

        # Build the prompt
        element_context = self._format_element_context(task.elements)
        interaction_context = self._format_interaction_context(capture.interactions)
        taxonomy_list = "\n".join(f"  {i+1}. {t}" for i, t in enumerate(TAXONOMY))

        prompt = DETECTION_PROMPT.format(
            region=task.region_name,
            taxonomy_list=taxonomy_list,
            element_context=element_context,
            interaction_context=interaction_context,
            threshold=CONFIDENCE_THRESHOLD,
        )

        # Call VLM with the region's cropped screenshot
        raw_result = self._call_vlm(prompt, task.screenshot_crop)
        if raw_result is None:
            return []

        # Parse and validate detections
        patterns = self._parse_vlm_response(raw_result)

        for pattern in patterns:
            detection = self._pattern_to_detection(
                pattern, task, capture
            )
            if detection is None:
                continue

            # Validate
            valid, reason = self._basic_validate(detection)
            if valid:
                detections.append(detection)
            else:
                # Retry with refined prompt
                logger.info(
                    f"  Detection rejected ({reason}), retrying..."
                )
                retry_detection = await self._retry_detection(
                    task, capture, reason
                )
                if retry_detection:
                    detections.append(retry_detection)

        # Also analyze interaction screenshots for this region
        for i, iso_screenshot in enumerate(task.interaction_screenshots):
            try:
                interaction_prompt = DETECTION_PROMPT.format(
                    region=f"{task.region_name} (after interaction {i+1})",
                    taxonomy_list=taxonomy_list,
                    element_context=element_context,
                    interaction_context=interaction_context,
                    threshold=CONFIDENCE_THRESHOLD,
                )
                result = self._call_vlm(interaction_prompt, iso_screenshot)
                if result:
                    for pat in self._parse_vlm_response(result):
                        det = self._pattern_to_detection(pat, task, capture)
                        if det:
                            det.interactions.append(f"interaction_{i}")
                            valid, _ = self._basic_validate(det)
                            if valid:
                                detections.append(det)
            except Exception as e:
                logger.debug(f"  Error on interaction screenshot {i}: {e}")

        logger.info(
            f"  Region '{task.region_name}': {len(detections)} detections"
        )
        return detections

    # ─── Retry Logic ──────────────────────────────────────────────────────

    async def _retry_detection(
        self, task: RegionTask, capture: CaptureResult, reason: str
    ) -> Optional[Detection]:
        """Retry detection with a refined prompt, up to MAX_RETRIES."""
        for attempt in range(MAX_RETRIES):
            retry_prompt = RETRY_PROMPT.format(
                region=task.region_name,
                rejection_reason=reason,
                threshold=CONFIDENCE_THRESHOLD,
            )
            result = self._call_vlm(retry_prompt, task.screenshot_crop)
            if result is None:
                continue

            patterns = self._parse_vlm_response(result)
            for pat in patterns:
                det = self._pattern_to_detection(pat, task, capture)
                if det:
                    valid, reason = self._basic_validate(det)
                    if valid:
                        logger.info(f"    Retry {attempt+1} succeeded")
                        return det

        logger.info(f"    All {MAX_RETRIES} retries failed")
        return None

    # ─── VLM Communication ────────────────────────────────────────────────

    def _call_vlm(self, prompt: str, screenshot_b64: str) -> Optional[str]:
        """
        Call the VLM with a text prompt + screenshot image.
        Returns the raw text response or None on error.
        """
        try:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{screenshot_b64}",
                                "detail": "high",
                            },
                        },
                    ],
                }
            ]

            # Add conversation history for multi-turn context
            full_messages = self._history + messages

            response = self.client.chat.completions.create(
                model=self.model,
                messages=full_messages,
                max_tokens=4096,
                temperature=0.1,  # Low temp for consistency
            )

            result = response.choices[0].message.content.strip()

            # Update history
            self._history.append(messages[0])
            self._history.append({"role": "assistant", "content": result})

            # Keep history manageable (last 6 turns)
            if len(self._history) > 12:
                self._history = self._history[-12:]

            return result

        except Exception as e:
            logger.error(f"VLM call failed: {e}")
            return None

    # ─── Response Parsing ─────────────────────────────────────────────────

    def _parse_vlm_response(self, raw: str) -> list[dict]:
        """Parse VLM JSON response into list of pattern dicts."""
        # Strip markdown code fences if present
        text = raw.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if len(lines) > 2 else text

        try:
            data = json.loads(text)
            return data.get("patterns", [])
        except json.JSONDecodeError:
            # Try to find JSON within the response
            start = text.find("{")
            end = text.rfind("}") + 1
            if start >= 0 and end > start:
                try:
                    data = json.loads(text[start:end])
                    return data.get("patterns", [])
                except json.JSONDecodeError:
                    pass
            logger.warning(f"Failed to parse VLM response:\n{text[:200]}")
            return []

    # ─── Pattern → Detection Conversion ───────────────────────────────────

    def _pattern_to_detection(
        self, pattern: dict, task: RegionTask, capture: CaptureResult
    ) -> Optional[Detection]:
        """Convert a parsed pattern dict into a Detection object."""
        try:
            category = pattern.get("category", "")
            bbox = pattern.get("bbox", [0, 0, 0, 0])
            confidence = float(pattern.get("confidence", 0))
            evidence = str(pattern.get("evidence", ""))
            severity = str(pattern.get("severity", "medium"))
            location = str(pattern.get("location", task.region_name))

            if not category or confidence <= 0:
                return None

            # Adjust bbox from region-relative to page-absolute
            region_x, region_y = task.bbox[0], task.bbox[1]
            abs_bbox = [
                bbox[0] + region_x,
                bbox[1] + region_y,
                bbox[2] if len(bbox) > 2 else 0,
                bbox[3] if len(bbox) > 3 else 0,
            ]

            # Build the interactions list
            interaction_actions = [
                ir.action for ir in capture.interactions if ir.revealed_new
            ]

            return Detection(
                id=self._next_id(),
                url=capture.url,
                category=category,
                bbox=abs_bbox,
                confidence=confidence,
                evidence=evidence,
                severity=severity,
                location=location,
                timestamp=datetime.now(timezone.utc).isoformat(),
                interactions=interaction_actions,
            )
        except Exception as e:
            logger.warning(f"Failed to convert pattern to Detection: {e}")
            return None

    # ─── Basic Validation ─────────────────────────────────────────────────

    def _basic_validate(self, det: Detection) -> tuple[bool, str]:
        """
        Quick validation checks before sending to the full Verification Engine.
        Returns (passed, reason).
        """
        # Check confidence threshold
        if det.confidence < CONFIDENCE_THRESHOLD:
            return False, f"Confidence {det.confidence} < threshold {CONFIDENCE_THRESHOLD}"

        # Check category is in taxonomy
        if det.category.lower() not in TAXONOMY_SET:
            return False, f"Category '{det.category}' not in taxonomy"

        # Check bbox is reasonable
        if len(det.bbox) != 4:
            return False, f"Invalid bbox format: {det.bbox}"
        _, _, w, h = det.bbox
        if w <= 0 or h <= 0:
            return False, f"Invalid bbox size: {w}x{h}"

        # Check severity
        valid_severities = {"low", "medium", "high", "critical"}
        if det.severity.lower() not in valid_severities:
            det.severity = "medium"  # Fix silently

        return True, ""

    # ─── Deduplication ────────────────────────────────────────────────────

    def _deduplicate(self, detections: list[Detection]) -> list[Detection]:
        """
        Remove duplicate detections across regions.
        Two detections are duplicates if they have the same category
        and overlapping bounding boxes (IoU > 0.3).
        """
        if not detections:
            return []

        from config import IOU_THRESHOLD
        unique: list[Detection] = []

        for det in detections:
            is_dup = False
            for existing in unique:
                if det.category.lower() == existing.category.lower():
                    iou = self._compute_iou(det.bbox, existing.bbox)
                    if iou > IOU_THRESHOLD:
                        # Keep the one with higher confidence
                        if det.confidence > existing.confidence:
                            unique.remove(existing)
                            unique.append(det)
                        is_dup = True
                        break
            if not is_dup:
                unique.append(det)

        return unique

    def _compute_iou(self, bbox1: list[int], bbox2: list[int]) -> float:
        """Compute Intersection over Union for two [x, y, w, h] bboxes."""
        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2

        # Convert to [x1, y1, x2, y2]
        ax1, ay1, ax2, ay2 = x1, y1, x1 + w1, y1 + h1
        bx1, by1, bx2, by2 = x2, y2, x2 + w2, y2 + h2

        # Intersection
        ix1 = max(ax1, bx1)
        iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2)
        iy2 = min(ay2, by2)

        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0

        intersection = (ix2 - ix1) * (iy2 - iy1)
        area1 = w1 * h1
        area2 = w2 * h2
        union = area1 + area2 - intersection

        return intersection / union if union > 0 else 0.0

    # ─── Context Formatting ───────────────────────────────────────────────

    def _format_element_context(self, elements: list[ElementBBox]) -> str:
        """Format element bboxes into a text context for the VLM."""
        if not elements:
            return "(No DOM elements in this region)"

        lines = []
        for el in elements[:30]:  # Limit to 30
            text_preview = el.text[:80] if el.text else "(no text)"
            lines.append(
                f"  <{el.tag}> @ [{el.x},{el.y},{el.width},{el.height}]: "
                f'"{text_preview}"'
            )
        return "\n".join(lines)

    def _format_interaction_context(self, interactions: list) -> str:
        """Format interaction records into text context."""
        if not interactions:
            return "(No interactions performed)"

        lines = []
        for ir in interactions:
            revealed = "→ revealed new content" if ir.revealed_new else ""
            lines.append(f"  {ir.action}: {ir.target} {revealed}")
        return "\n".join(lines[:20])
