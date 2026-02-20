"""
review/human_review.py — Human-in-the-Loop CLI Reviewer
=========================================================
Interactive terminal reviewer for weak labels:
  - Lists all weak/ entries pending review
  - Shows: category, confidence, evidence, location, bbox, interactions
  - Opens the cropped image for visual inspection
  - Reviewer actions: [a]pprove, [e]dit category, [r]eject, [s]kip
  - Saves progress so review can be resumed
"""

import json
import logging
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import TAXONOMY, WEAK_DIR
from dataset.manager import DatasetManager

logger = logging.getLogger("review")


class HumanReviewer:
    """
    Interactive CLI for reviewing weak labels.
    
    Usage:
        reviewer = HumanReviewer()
        reviewer.start()
    """

    def __init__(self):
        self.manager = DatasetManager()

    def start(self):
        """Start the interactive review session."""
        weak_labels = self.manager.list_weak()

        if not weak_labels:
            print("\n✅ No weak labels to review. All caught up!\n")
            return

        print("\n" + "═" * 60)
        print("  DARK PATTERN LABEL REVIEWER")
        print("═" * 60)
        print(f"\n  {len(weak_labels)} labels pending review\n")
        print("  Commands: [a]pprove  [e]dit category  [r]eject  [s]kip  [q]uit\n")
        print("─" * 60)

        reviewed = 0
        approved = 0
        rejected = 0

        for i, label in enumerate(weak_labels):
            det_id = label.get("id", "unknown")

            print(f"\n  [{i+1}/{len(weak_labels)}] Detection: {det_id}")
            print(f"  {'─' * 50}")
            print(f"  Category:    {label.get('category', 'N/A')}")
            print(f"  Confidence:  {label.get('confidence', 0):.2f}")
            print(f"  Severity:    {label.get('severity', 'N/A')}")
            print(f"  Location:    {label.get('location', 'N/A')}")
            print(f"  BBox:        {label.get('bbox', 'N/A')}")
            print(f"  Evidence:    {label.get('evidence', 'N/A')[:100]}")
            print(f"  URL:         {label.get('url', 'N/A')[:80]}")

            interactions = label.get("interactions", [])
            if interactions:
                print(f"  Interactions: {', '.join(interactions[:5])}")

            # Try to open the crop image for visual inspection
            crop_path = WEAK_DIR / f"{det_id}_crop.png"
            if crop_path.exists():
                print(f"  Crop image:  {crop_path}")
                self._open_image(crop_path)
            else:
                print(f"  Crop image:  (not available)")

            # Get user action
            while True:
                action = input("\n  Action [a/e/r/s/q]: ").strip().lower()

                if action == "a":
                    # Approve → move to verified
                    self.manager.promote_to_verified(det_id)
                    print(f"  ✅ Approved: {det_id}")
                    approved += 1
                    reviewed += 1
                    break

                elif action == "e":
                    # Edit category
                    print(f"\n  Available categories:")
                    for j, cat in enumerate(TAXONOMY):
                        print(f"    {j+1:2d}. {cat}")
                    
                    try:
                        choice = input("\n  Enter category number: ").strip()
                        idx = int(choice) - 1
                        if 0 <= idx < len(TAXONOMY):
                            new_cat = TAXONOMY[idx]
                            self.manager.update_category(det_id, new_cat)
                            self.manager.promote_to_verified(det_id)
                            print(f"  ✅ Updated to '{new_cat}' and approved: {det_id}")
                            approved += 1
                        else:
                            print("  ⚠️  Invalid choice, skipping")
                    except ValueError:
                        print("  ⚠️  Invalid input, skipping")
                    reviewed += 1
                    break

                elif action == "r":
                    # Reject
                    reason = input("  Rejection reason (optional): ").strip()
                    self.manager.reject(det_id, reason)
                    print(f"  ❌ Rejected: {det_id}")
                    rejected += 1
                    reviewed += 1
                    break

                elif action == "s":
                    # Skip
                    print(f"  ⏭️  Skipped: {det_id}")
                    reviewed += 1
                    break

                elif action == "q":
                    # Quit
                    print(f"\n  Session ended. Reviewed {reviewed} labels.")
                    print(f"  ✅ Approved: {approved}")
                    print(f"  ❌ Rejected: {rejected}")
                    print(f"  ⏭️  Skipped: {reviewed - approved - rejected}")
                    return

                else:
                    print("  ⚠️  Unknown action. Use [a]pprove, [e]dit, [r]eject, [s]kip, [q]uit")

        # Summary
        print("\n" + "═" * 60)
        print("  REVIEW COMPLETE")
        print("═" * 60)
        print(f"  Total reviewed: {reviewed}")
        print(f"  ✅ Approved:    {approved}")
        print(f"  ❌ Rejected:    {rejected}")
        print(f"  ⏭️  Skipped:    {reviewed - approved - rejected}")
        print("═" * 60 + "\n")

    def _open_image(self, path: Path):
        """Try to open an image file for visual inspection."""
        try:
            if sys.platform == "win32":
                os.startfile(str(path))
            elif sys.platform == "darwin":
                subprocess.run(["open", str(path)], check=False)
            else:
                subprocess.run(["xdg-open", str(path)], check=False)
        except Exception:
            pass  # Silently fail — image viewing is optional


# ─── CLI Entry Point ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    reviewer = HumanReviewer()
    reviewer.start()
