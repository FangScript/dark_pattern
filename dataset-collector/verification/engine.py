"""
verification/engine.py — Verification Engine
===============================================
Validates every detection through a multi-step pipeline:
  1. Visual confirmation — check the cropped bbox is non-empty
  2. DOM presence check — search DOM for evidence text
  3. Bounding box size check — reject too small or too large
  4. Overlap check — IoU deduplication against approved set
  5. Confidence threshold — reject below threshold
  6. Category validation — must be in taxonomy
  
Implements the loop: Detect → Interact → Verify → Retry → Approve
Automatically removes false positives.
"""

import base64
import io
import logging
from dataclasses import dataclass
from typing import Optional

from PIL import Image

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    CONFIDENCE_THRESHOLD, IOU_THRESHOLD, MIN_BBOX_AREA,
    MAX_BBOX_VIEWPORT_RATIO, VIEWPORT_WIDTH, VIEWPORT_HEIGHT,
    TAXONOMY, TAXONOMY_SET, SEVERITY_LEVELS,
)
from agent.dark_pattern_agent import Detection

logger = logging.getLogger("verification")


@dataclass
class VerificationResult:
    """Result of verifying a single detection."""
    passed: bool
    reason: str
    detection: Detection
    checks: dict  # Individual check results


class VerificationEngine:
    """
    Runs a multi-check verification pipeline on each Detection.
    
    Checks:
      1. confidence_check — Is confidence ≥ threshold?
      2. category_check — Is category in the 18-label taxonomy?
      3. bbox_size_check — Is the bbox a reasonable size?
      4. bbox_overlap_check — Does it overlap with existing approved detections?
      5. visual_check — Is the cropped region non-empty (not blank)?
      6. dom_presence_check — Can the evidence text be found in the DOM?
      7. severity_check — Is severity a valid level?
    """

    def __init__(self):
        self._approved: list[Detection] = []  # Approved detections for overlap checking

    def verify(
        self,
        detection: Detection,
        full_screenshot_b64: Optional[str] = None,
        dom_html: Optional[str] = None,
    ) -> VerificationResult:
        """
        Run all verification checks on a detection.
        
        Args:
            detection: The Detection to verify
            full_screenshot_b64: Full-page screenshot (for visual crop check)
            dom_html: Full DOM HTML (for DOM presence check)
        
        Returns:
            VerificationResult with pass/fail and reasons
        """
        checks = {}

        # 1. Confidence check
        checks["confidence"] = self._check_confidence(detection)

        # 2. Category check
        checks["category"] = self._check_category(detection)

        # 3. Bounding box size check
        checks["bbox_size"] = self._check_bbox_size(detection)

        # 4. Bounding box overlap check (against already-approved detections)
        checks["bbox_overlap"] = self._check_bbox_overlap(detection)

        # 5. Visual check (is the cropped area non-blank?)
        if full_screenshot_b64:
            checks["visual"] = self._check_visual(detection, full_screenshot_b64)
        else:
            checks["visual"] = (True, "Skipped — no screenshot provided")

        # 6. DOM presence check
        if dom_html:
            checks["dom_presence"] = self._check_dom_presence(detection, dom_html)
        else:
            checks["dom_presence"] = (True, "Skipped — no DOM provided")

        # 7. Severity check
        checks["severity"] = self._check_severity(detection)

        # Aggregate results
        failures = {k: v[1] for k, v in checks.items() if not v[0]}
        passed = len(failures) == 0

        if passed:
            detection.validated = True
            self._approved.append(detection)
            reason = "All checks passed"
        else:
            reason = "; ".join(failures.values())

        result = VerificationResult(
            passed=passed,
            reason=reason,
            detection=detection,
            checks={k: {"passed": v[0], "reason": v[1]} for k, v in checks.items()},
        )

        log_fn = logger.info if passed else logger.warning
        log_fn(
            f"Verification {'PASSED' if passed else 'FAILED'} for "
            f"{detection.id} ({detection.category}): {reason}"
        )

        return result

    def verify_batch(
        self,
        detections: list[Detection],
        full_screenshot_b64: Optional[str] = None,
        dom_html: Optional[str] = None,
    ) -> tuple[list[Detection], list[VerificationResult]]:
        """
        Verify a batch of detections.
        
        Returns:
            (approved_detections, all_results)
        """
        approved = []
        results = []

        for det in detections:
            result = self.verify(det, full_screenshot_b64, dom_html)
            results.append(result)
            if result.passed:
                approved.append(det)

        logger.info(
            f"Batch verification: {len(approved)}/{len(detections)} passed"
        )
        return approved, results

    def reset(self):
        """Reset approved detections (call between pages)."""
        self._approved = []

    # ─── Individual Checks ────────────────────────────────────────────────

    def _check_confidence(self, det: Detection) -> tuple[bool, str]:
        """Check if confidence meets the threshold."""
        if det.confidence < CONFIDENCE_THRESHOLD:
            return (
                False,
                f"Confidence {det.confidence:.2f} < threshold {CONFIDENCE_THRESHOLD}",
            )
        if det.confidence > 1.0:
            return False, f"Confidence {det.confidence} > 1.0 (invalid)"
        return True, f"Confidence {det.confidence:.2f} ≥ {CONFIDENCE_THRESHOLD}"

    def _check_category(self, det: Detection) -> tuple[bool, str]:
        """Check if category is in the 18-label taxonomy."""
        if det.category.lower() not in TAXONOMY_SET:
            return (
                False,
                f"Category '{det.category}' not in taxonomy. "
                f"Valid: {', '.join(TAXONOMY[:5])}...",
            )
        return True, f"Category '{det.category}' is valid"

    def _check_bbox_size(self, det: Detection) -> tuple[bool, str]:
        """
        Check bounding box is reasonable:
          - Not too small (< MIN_BBOX_AREA px²)
          - Not too large (> MAX_BBOX_VIEWPORT_RATIO of viewport)
          - Positive dimensions
        """
        if len(det.bbox) != 4:
            return False, f"Invalid bbox format (expected 4 values, got {len(det.bbox)})"

        x, y, w, h = det.bbox
        area = w * h

        if w <= 0 or h <= 0:
            return False, f"Non-positive bbox dimensions: {w}x{h}"

        if area < MIN_BBOX_AREA:
            return False, f"Bbox area {area}px² < minimum {MIN_BBOX_AREA}px²"

        viewport_area = VIEWPORT_WIDTH * VIEWPORT_HEIGHT
        ratio = area / viewport_area
        if ratio > MAX_BBOX_VIEWPORT_RATIO:
            return (
                False,
                f"Bbox covers {ratio*100:.0f}% of viewport "
                f"(max {MAX_BBOX_VIEWPORT_RATIO*100:.0f}%)",
            )

        if x < 0 or y < 0:
            return False, f"Negative bbox position: ({x}, {y})"

        return True, f"Bbox {w}x{h} ({area}px²) is valid"

    def _check_bbox_overlap(self, det: Detection) -> tuple[bool, str]:
        """
        Check if this detection overlaps significantly with an already-approved
        detection of the same category. If so, it's a duplicate.
        """
        for existing in self._approved:
            if det.category.lower() != existing.category.lower():
                continue

            iou = self._compute_iou(det.bbox, existing.bbox)
            if iou > IOU_THRESHOLD:
                if det.confidence > existing.confidence:
                    # This one is better — remove the old one and approve this
                    self._approved.remove(existing)
                    return True, f"Replaced weaker duplicate {existing.id} (IoU={iou:.2f})"
                else:
                    return (
                        False,
                        f"Duplicate of {existing.id} (IoU={iou:.2f}, "
                        f"existing conf={existing.confidence:.2f})",
                    )

        return True, "No overlapping duplicates"

    def _check_visual(
        self, det: Detection, screenshot_b64: str
    ) -> tuple[bool, str]:
        """
        Crop the detection bbox from the screenshot and check it's non-blank.
        A blank crop suggests the bbox coordinates are wrong.
        """
        try:
            img_data = base64.b64decode(screenshot_b64)
            img = Image.open(io.BytesIO(img_data))

            x, y, w, h = det.bbox
            crop = img.crop((x, y, x + w, y + h))

            # Check if crop is essentially blank (very low variance)
            import numpy as np
            arr = np.array(crop)
            if arr.std() < 5:  # Nearly uniform color (probably wrong bbox)
                return False, "Cropped region appears blank/uniform"

            return True, "Visual crop is non-blank"
        except Exception as e:
            return True, f"Visual check skipped (error: {e})"

    def _check_dom_presence(
        self, det: Detection, dom_html: str
    ) -> tuple[bool, str]:
        """
        Check if the detection's evidence text can be found in the DOM.
        This confirms the detected element actually exists on the page.
        """
        if not det.evidence or len(det.evidence) < 3:
            return True, "No evidence text to validate"

        # Search for the evidence text (case-insensitive)
        search_text = det.evidence.lower().strip()

        # Try exact match first
        if search_text in dom_html.lower():
            return True, f"Evidence text found in DOM"

        # Try partial match (first 30 chars)
        partial = search_text[:30]
        if partial in dom_html.lower():
            return True, f"Partial evidence text found in DOM (first 30 chars)"

        return False, f"Evidence text not found in DOM: '{det.evidence[:50]}...'"

    def _check_severity(self, det: Detection) -> tuple[bool, str]:
        """Check if severity is a valid level."""
        if det.severity.lower() not in [s.lower() for s in SEVERITY_LEVELS]:
            det.severity = "medium"  # Auto-fix
            return True, f"Severity auto-fixed to 'medium'"
        return True, f"Severity '{det.severity}' is valid"

    # ─── IoU Utility ──────────────────────────────────────────────────────

    def _compute_iou(self, bbox1: list[int], bbox2: list[int]) -> float:
        """Compute Intersection over Union for two [x, y, w, h] bboxes."""
        x1, y1, w1, h1 = bbox1
        x2, y2, w2, h2 = bbox2

        ax1, ay1, ax2, ay2 = x1, y1, x1 + w1, y1 + h1
        bx1, by1, bx2, by2 = x2, y2, x2 + w2, y2 + h2

        ix1, iy1 = max(ax1, bx1), max(ay1, by1)
        ix2, iy2 = min(ax2, bx2), min(ay2, by2)

        if ix2 <= ix1 or iy2 <= iy1:
            return 0.0

        intersection = (ix2 - ix1) * (iy2 - iy1)
        union = w1 * h1 + w2 * h2 - intersection
        return intersection / union if union > 0 else 0.0
