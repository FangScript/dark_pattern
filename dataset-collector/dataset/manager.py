"""
dataset/manager.py — Dataset Manager
=======================================
Persistent storage for labeled dark pattern samples:
  - Assigns unique IDs (dp_XXXXX, auto-incrementing)
  - Saves to appropriate folder: raw/, weak/, verified/
  - Stores JSON metadata + PNG crop + full screenshot reference
  - Maintains dataset versions via dataset_version.json manifest
  - Exports JSONL for training
  - Stratified train/val/test splitting
  - Incremental updates (append-only)
"""

import base64
import json
import logging
import os
import random
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    DATA_DIR, RAW_DIR, WEAK_DIR, VERIFIED_DIR,
    TRAIN_DIR, VAL_DIR, TEST_DIR,
    DATASET_VERSION, TRAIN_RATIO, VAL_RATIO, TEST_RATIO,
)
from agent.dark_pattern_agent import Detection

logger = logging.getLogger("dataset")


class DatasetManager:
    """
    Manages the full lifecycle of labeled dark pattern samples:
      raw capture → weak labels → verified → train/val/test export
    
    Usage:
        manager = DatasetManager()
        manager.save_weak(detection, screenshot_b64)
        manager.promote_to_verified("dp_00001")
        manager.export_jsonl("train")
        manager.split_dataset()
    """

    def __init__(self):
        """Initialize the dataset manager and load existing manifest."""
        self._manifest_path = DATA_DIR / "dataset_version.json"
        self._id_counter = 1  # set before _load_manifest to avoid AttributeError
        self._manifest = self._load_manifest()
        self._id_counter = self._manifest.get("next_id", 1)

    # ─── Manifest Management ──────────────────────────────────────────────

    def _load_manifest(self) -> dict:
        """Load or create the dataset version manifest."""
        if self._manifest_path.exists():
            with open(self._manifest_path, "r") as f:
                return json.load(f)
        
        manifest = {
            "version": DATASET_VERSION,
            "created": datetime.now(timezone.utc).isoformat(),
            "updated": datetime.now(timezone.utc).isoformat(),
            "next_id": 1,
            "total_raw": 0,
            "total_weak": 0,
            "total_verified": 0,
            "total_exported": 0,
            "urls_processed": [],
        }
        self._save_manifest(manifest)
        return manifest

    def _save_manifest(self, manifest: Optional[dict] = None):
        """Save manifest to disk."""
        m = manifest or self._manifest
        m["updated"] = datetime.now(timezone.utc).isoformat()
        m["next_id"] = self._id_counter
        with open(self._manifest_path, "w") as f:
            json.dump(m, f, indent=2)

    # ─── Save Detections ──────────────────────────────────────────────────

    def save_weak(
        self,
        detection: Detection,
        full_screenshot_b64: Optional[str] = None,
        crop_screenshot_b64: Optional[str] = None,
    ) -> str:
        """
        Save a detection as a weak (unverified) label.
        
        Saves:
          - weak/{id}.json — metadata
          - weak/{id}_crop.png — cropped dark pattern image
          - raw/{id}_full.png — full-page screenshot (if provided)
        
        Returns: detection ID
        """
        det_id = detection.id

        # Save metadata JSON
        meta = detection.to_dict()
        meta["status"] = "weak"
        meta["saved_at"] = datetime.now(timezone.utc).isoformat()

        meta_path = WEAK_DIR / f"{det_id}.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        # Save crop image
        if crop_screenshot_b64:
            crop_path = WEAK_DIR / f"{det_id}_crop.png"
            with open(crop_path, "wb") as f:
                f.write(base64.b64decode(crop_screenshot_b64))

        # Save full screenshot
        if full_screenshot_b64:
            full_path = RAW_DIR / f"{det_id}_full.png"
            with open(full_path, "wb") as f:
                f.write(base64.b64decode(full_screenshot_b64))

        self._manifest["total_weak"] = self._manifest.get("total_weak", 0) + 1
        self._save_manifest()

        logger.info(f"Saved weak label: {det_id} ({detection.category})")
        return det_id

    def save_batch(
        self,
        detections: list[Detection],
        full_screenshot_b64: Optional[str] = None,
    ) -> list[str]:
        """Save a batch of detections as weak labels."""
        ids = []
        for det in detections:
            det_id = self.save_weak(det, full_screenshot_b64)
            ids.append(det_id)
        logger.info(f"Saved batch of {len(ids)} weak labels")
        return ids

    # ─── Promote to Verified ──────────────────────────────────────────────

    def promote_to_verified(self, det_id: str) -> bool:
        """
        Move a weak label to the verified folder.
        Updates the metadata to mark as validated.
        """
        weak_meta_path = WEAK_DIR / f"{det_id}.json"
        if not weak_meta_path.exists():
            logger.error(f"Weak label not found: {det_id}")
            return False

        # Load and update metadata
        with open(weak_meta_path, "r") as f:
            meta = json.load(f)
        
        meta["status"] = "verified"
        meta["validated"] = True
        meta["verified_at"] = datetime.now(timezone.utc).isoformat()

        # Save to verified/
        verified_meta_path = VERIFIED_DIR / f"{det_id}.json"
        with open(verified_meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)

        # Copy crop image if exists
        weak_crop = WEAK_DIR / f"{det_id}_crop.png"
        if weak_crop.exists():
            shutil.copy2(weak_crop, VERIFIED_DIR / f"{det_id}_crop.png")

        # Remove from weak/
        weak_meta_path.unlink()
        if weak_crop.exists():
            weak_crop.unlink()

        self._manifest["total_weak"] = max(0, self._manifest.get("total_weak", 0) - 1)
        self._manifest["total_verified"] = self._manifest.get("total_verified", 0) + 1
        self._save_manifest()

        logger.info(f"Promoted to verified: {det_id}")
        return True

    def reject(self, det_id: str, reason: str = "") -> bool:
        """
        Reject a weak label (remove from dataset).
        Logs the rejection reason for audit.
        """
        weak_meta_path = WEAK_DIR / f"{det_id}.json"
        if not weak_meta_path.exists():
            logger.error(f"Weak label not found: {det_id}")
            return False

        # Log rejection
        logger.info(f"Rejected: {det_id} — reason: {reason}")

        # Remove files
        weak_meta_path.unlink()
        weak_crop = WEAK_DIR / f"{det_id}_crop.png"
        if weak_crop.exists():
            weak_crop.unlink()

        self._manifest["total_weak"] = max(0, self._manifest.get("total_weak", 0) - 1)
        self._save_manifest()
        return True

    def update_category(self, det_id: str, new_category: str) -> bool:
        """Update the category of a weak label (human correction)."""
        # Check in weak/ first, then verified/
        for dir_path in [WEAK_DIR, VERIFIED_DIR]:
            meta_path = dir_path / f"{det_id}.json"
            if meta_path.exists():
                with open(meta_path, "r") as f:
                    meta = json.load(f)
                meta["category"] = new_category
                meta["edited_at"] = datetime.now(timezone.utc).isoformat()
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f, indent=2, ensure_ascii=False)
                logger.info(f"Updated category for {det_id} → {new_category}")
                return True
        
        logger.error(f"Label not found: {det_id}")
        return False

    # ─── List Labels ──────────────────────────────────────────────────────

    def list_weak(self) -> list[dict]:
        """List all weak (unverified) label metadata."""
        return self._list_labels(WEAK_DIR)

    def list_verified(self) -> list[dict]:
        """List all verified label metadata."""
        return self._list_labels(VERIFIED_DIR)

    def _list_labels(self, directory: Path) -> list[dict]:
        """Load all JSON metadata files from a directory."""
        labels = []
        for f in sorted(directory.glob("*.json")):
            try:
                with open(f, "r") as fh:
                    labels.append(json.load(fh))
            except Exception as e:
                logger.warning(f"Failed to load {f}: {e}")
        return labels

    # ─── URL Tracking ─────────────────────────────────────────────────────

    def is_url_processed(self, url: str) -> bool:
        """Check if a URL has already been processed (for caching)."""
        return url in self._manifest.get("urls_processed", [])

    def mark_url_processed(self, url: str):
        """Mark a URL as processed."""
        urls = self._manifest.get("urls_processed", [])
        if url not in urls:
            urls.append(url)
            self._manifest["urls_processed"] = urls
            self._save_manifest()

    # ─── JSONL Export ─────────────────────────────────────────────────────

    def export_jsonl(self, split: str = "all") -> str:
        """
        Export labels to JSONL format.
        
        Args:
            split: "train", "val", "test", or "all" (exports verified labels)
        
        Returns:
            Path to the exported JSONL file
        """
        if split == "all":
            labels = self.list_verified()
            output_path = DATA_DIR / "all_labels.jsonl"
        elif split in ("train", "val", "test"):
            split_dir = {"train": TRAIN_DIR, "val": VAL_DIR, "test": TEST_DIR}[split]
            labels = self._list_labels(split_dir)
            output_path = split_dir / "labels.jsonl"
        else:
            raise ValueError(f"Invalid split: {split}")

        with open(output_path, "w", encoding="utf-8") as f:
            for label in labels:
                # Write the clean schema that matches the required output
                entry = {
                    "id": label.get("id", ""),
                    "url": label.get("url", ""),
                    "bbox": label.get("bbox", []),
                    "category": label.get("category", ""),
                    "confidence": label.get("confidence", 0),
                    "validated": label.get("validated", False),
                    "timestamp": label.get("timestamp", ""),
                    "version": label.get("version", DATASET_VERSION),
                    "severity": label.get("severity", ""),
                    "evidence": label.get("evidence", ""),
                    "location": label.get("location", ""),
                    "interactions": label.get("interactions", []),
                }
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        self._manifest["total_exported"] = len(labels)
        self._save_manifest()

        logger.info(f"Exported {len(labels)} labels to {output_path}")
        return str(output_path)

    # ─── Train/Val/Test Split ─────────────────────────────────────────────

    def split_dataset(self, seed: int = 42) -> dict:
        """
        Split verified labels into train/val/test sets.
        Uses stratified sampling by category to maintain class balance.
        
        Returns:
            Dict with counts per split
        """
        labels = self.list_verified()
        if not labels:
            logger.warning("No verified labels to split")
            return {"train": 0, "val": 0, "test": 0}

        # Group by category for stratified split
        by_category: dict[str, list[dict]] = defaultdict(list)
        for label in labels:
            cat = label.get("category", "unknown")
            by_category[cat].append(label)

        random.seed(seed)
        train_labels, val_labels, test_labels = [], [], []

        for cat, cat_labels in by_category.items():
            random.shuffle(cat_labels)
            n = len(cat_labels)
            n_train = max(1, int(n * TRAIN_RATIO))
            n_val = max(0, int(n * VAL_RATIO))
            # Rest goes to test
            train_labels.extend(cat_labels[:n_train])
            val_labels.extend(cat_labels[n_train:n_train + n_val])
            test_labels.extend(cat_labels[n_train + n_val:])

        # Clear split directories
        for d in [TRAIN_DIR, VAL_DIR, TEST_DIR]:
            for f in d.glob("*"):
                f.unlink()

        # Save to split directories
        for label in train_labels:
            self._save_to_split(label, TRAIN_DIR)
        for label in val_labels:
            self._save_to_split(label, VAL_DIR)
        for label in test_labels:
            self._save_to_split(label, TEST_DIR)

        result = {
            "train": len(train_labels),
            "val": len(val_labels),
            "test": len(test_labels),
        }
        logger.info(f"Dataset split: {result}")
        return result

    def _save_to_split(self, label: dict, split_dir: Path):
        """Save a label and its crop to a split directory."""
        det_id = label.get("id", "unknown")
        
        # Save metadata
        with open(split_dir / f"{det_id}.json", "w", encoding="utf-8") as f:
            json.dump(label, f, indent=2, ensure_ascii=False)

        # Copy crop if exists
        for source_dir in [VERIFIED_DIR, WEAK_DIR]:
            crop = source_dir / f"{det_id}_crop.png"
            if crop.exists():
                shutil.copy2(crop, split_dir / f"{det_id}_crop.png")
                break

    # ─── Statistics ───────────────────────────────────────────────────────

    def stats(self) -> dict:
        """Get dataset statistics."""
        weak = self.list_weak()
        verified = self.list_verified()

        # Category distribution
        categories = defaultdict(int)
        for label in verified + weak:
            categories[label.get("category", "unknown")] += 1

        return {
            "version": DATASET_VERSION,
            "total_weak": len(weak),
            "total_verified": len(verified),
            "total_urls": len(self._manifest.get("urls_processed", [])),
            "categories": dict(categories),
        }
