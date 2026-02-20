"""
pipeline.py — Top-Level Orchestrator
=======================================
Coordinates the full dark pattern dataset collection pipeline:
  capture → plan → detect → verify → store → export

Features:
  - Single URL analysis
  - Batch processing from URL file
  - Parallel browser instances (async)
  - Cached re-analysis (skip already-processed URLs)
  - Incremental dataset updates
  - Structured JSON logging per run
  - Human review integration
  - JSONL export and train/val/test split

Usage:
  python pipeline.py --url https://daraz.pk
  python pipeline.py --urls urls.txt --concurrency 4
  python pipeline.py --review
  python pipeline.py --export --split train
  python pipeline.py --stats
  python pipeline.py --url https://daraz.pk --dry-run
"""

import asyncio
import argparse
import base64
import io
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

# Ensure the project root is in sys.path
sys.path.insert(0, os.path.dirname(__file__))

from config import (
    BATCH_CONCURRENCY, LOGS_DIR, DATA_DIR, OPENAI_API_KEY,
    LOG_LEVEL, DATASET_VERSION,
)
from capture.browser_capture import BrowserCapture, CaptureResult
from agent.planner import Planner
from agent.dark_pattern_agent import DarkPatternAgent, Detection
from verification.engine import VerificationEngine, VerificationResult
from dataset.manager import DatasetManager
from review.human_review import HumanReviewer

logger = logging.getLogger("pipeline")


# ─── Core Pipeline ───────────────────────────────────────────────────────────

async def analyze_url(
    url: str,
    capture: BrowserCapture,
    agent: DarkPatternAgent,
    verifier: VerificationEngine,
    manager: DatasetManager,
    dry_run: bool = False,
    headless: bool = True,
) -> list[Detection]:
    """
    Full pipeline for a single URL:
      1. Capture page (screenshot, DOM, interactions)
      2. Plan region subtasks
      3. Detect dark patterns via VLM
      4. Verify detections
      5. Store results
    
    Args:
        url: The page URL to analyze
        capture: BrowserCapture instance
        agent: DarkPatternAgent instance
        verifier: VerificationEngine instance
        manager: DatasetManager instance
        dry_run: If True, capture only (no VLM calls)
        headless: Whether to run browser in headless mode
    
    Returns:
        List of verified Detection objects
    """
    run_id = f"run_{int(time.time())}"
    logger.info(f"[{run_id}] Starting analysis of {url}")

    # Check if already processed (cached)
    if manager.is_url_processed(url):
        logger.info(f"[{run_id}] URL already processed (cached), skipping: {url}")
        return []

    # ── Step 1: Capture ──────────────────────────────────────────────────
    logger.info(f"[{run_id}] Step 1: Capturing page...")
    capture_result = await capture.capture_page(url, interact=True, scroll=True)
    
    # Save raw capture
    capture_id = f"capture_{int(time.time())}"
    await capture.save_raw(capture_result, capture_id)
    logger.info(
        f"[{run_id}] Captured: {len(capture_result.element_bboxes)} elements, "
        f"{len(capture_result.interactions)} interactions"
    )

    if dry_run:
        logger.info(f"[{run_id}] Dry run — skipping VLM analysis")
        manager.mark_url_processed(url)
        return []

    # ── Step 2–3: Plan & Detect ──────────────────────────────────────────
    logger.info(f"[{run_id}] Step 2–3: Planning & detecting...")
    raw_detections = await agent.analyze(capture_result)
    logger.info(f"[{run_id}] Raw detections: {len(raw_detections)}")

    if not raw_detections:
        logger.info(f"[{run_id}] No dark patterns detected")
        manager.mark_url_processed(url)
        return []

    # ── Step 4: Verify ───────────────────────────────────────────────────
    logger.info(f"[{run_id}] Step 4: Verifying detections...")
    verifier.reset()
    approved, results = verifier.verify_batch(
        raw_detections,
        full_screenshot_b64=capture_result.screenshot,
        dom_html=capture_result.html,
    )
    logger.info(f"[{run_id}] Verified: {len(approved)}/{len(raw_detections)} passed")

    # ── Step 5: Store ────────────────────────────────────────────────────
    logger.info(f"[{run_id}] Step 5: Storing results...")
    for det in approved:
        # Crop the detection from the screenshot
        crop_b64 = _crop_detection(capture_result.screenshot, det.bbox)
        det.screenshot_crop = crop_b64
        manager.save_weak(det, capture_result.screenshot, crop_b64)

    manager.mark_url_processed(url)

    # ── Log Run Summary ──────────────────────────────────────────────────
    run_log = {
        "run_id": run_id,
        "url": url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_elements": len(capture_result.element_bboxes),
        "total_interactions": len(capture_result.interactions),
        "raw_detections": len(raw_detections),
        "verified_detections": len(approved),
        "detections": [d.to_dict() for d in approved],
    }
    log_path = LOGS_DIR / f"{run_id}.json"
    with open(log_path, "w") as f:
        json.dump(run_log, f, indent=2)

    logger.info(f"[{run_id}] Complete: {len(approved)} dark patterns stored")
    return approved


def _crop_detection(screenshot_b64: str, bbox: list[int]) -> str:
    """Crop a detection's bounding box from the full-page screenshot."""
    try:
        img_data = base64.b64decode(screenshot_b64)
        img = Image.open(io.BytesIO(img_data))
        x, y, w, h = bbox
        
        # Clamp to image bounds
        x = max(0, min(x, img.width - 1))
        y = max(0, min(y, img.height - 1))
        w = min(w, img.width - x)
        h = min(h, img.height - y)
        
        if w <= 0 or h <= 0:
            return ""
        
        crop = img.crop((x, y, x + w, y + h))
        buf = io.BytesIO()
        crop.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        logger.warning(f"Failed to crop detection: {e}")
        return ""


# ─── Batch Processing ────────────────────────────────────────────────────────

async def analyze_batch(
    urls: list[str],
    concurrency: int = BATCH_CONCURRENCY,
    dry_run: bool = False,
    headless: bool = True,
) -> dict:
    """
    Process multiple URLs with parallel browser instances.
    
    Args:
        urls: List of URLs to analyze
        concurrency: Max parallel browser instances
        dry_run: If True, capture only
        headless: Run browsers headlessly
    
    Returns:
        Summary dict with total results
    """
    logger.info(f"Batch analysis: {len(urls)} URLs, concurrency={concurrency}")

    agent = DarkPatternAgent()
    verifier = VerificationEngine()
    manager = DatasetManager()

    semaphore = asyncio.Semaphore(concurrency)
    all_detections: list[Detection] = []
    errors: list[dict] = []

    async def process_one(url: str):
        async with semaphore:
            try:
                async with BrowserCapture(headless=headless) as capture:
                    detections = await analyze_url(
                        url, capture, agent, verifier, manager,
                        dry_run=dry_run, headless=headless,
                    )
                    all_detections.extend(detections)
            except Exception as e:
                logger.error(f"Failed to process {url}: {e}")
                errors.append({"url": url, "error": str(e)})

    # Process all URLs with concurrency limit
    tasks = [process_one(url) for url in urls]
    await asyncio.gather(*tasks)

    summary = {
        "total_urls": len(urls),
        "successful": len(urls) - len(errors),
        "failed": len(errors),
        "total_detections": len(all_detections),
        "errors": errors,
    }

    logger.info(
        f"Batch complete: {summary['successful']}/{summary['total_urls']} URLs, "
        f"{summary['total_detections']} total detections"
    )
    return summary


# ─── CLI Entry Point ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Dark Pattern Dataset Collector — Pipeline Orchestrator",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    
    # Analysis modes
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--url", type=str, help="Analyze a single URL")
    group.add_argument("--urls", type=str, help="Path to file with URLs (one per line)")
    group.add_argument("--review", action="store_true", help="Start human review session")
    group.add_argument("--export", action="store_true", help="Export dataset to JSONL")
    group.add_argument("--stats", action="store_true", help="Show dataset statistics")
    group.add_argument("--split", action="store_true", help="Split verified labels into train/val/test")
    
    # Options
    parser.add_argument("--concurrency", type=int, default=BATCH_CONCURRENCY,
                       help=f"Parallel browser instances (default: {BATCH_CONCURRENCY})")
    parser.add_argument("--dry-run", action="store_true",
                       help="Capture pages only, no VLM analysis")
    parser.add_argument("--no-headless", action="store_true",
                       help="Show browser window (not headless)")
    parser.add_argument("--export-split", type=str, default="all",
                       choices=["all", "train", "val", "test"],
                       help="Which split to export (default: all)")
    parser.add_argument("--model", type=str, default=None,
                       help="Override AI model name")
    parser.add_argument("--verbose", action="store_true",
                       help="Enable verbose logging")

    args = parser.parse_args()

    # Setup logging
    level = logging.DEBUG if args.verbose else getattr(logging, LOG_LEVEL, logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    # Override model if specified
    if args.model:
        import config
        config.MODEL_NAME = args.model

    # ── Mode: Review ─────────────────────────────────────────────────────
    if args.review:
        reviewer = HumanReviewer()
        reviewer.start()
        return

    # ── Mode: Export ──────────────────────────────────────────────────────
    if args.export:
        manager = DatasetManager()
        path = manager.export_jsonl(args.export_split)
        print(f"\n✅ Exported to: {path}\n")
        return

    # ── Mode: Stats ──────────────────────────────────────────────────────
    if args.stats:
        manager = DatasetManager()
        stats = manager.stats()
        print("\n" + "═" * 50)
        print("  DATASET STATISTICS")
        print("═" * 50)
        print(f"  Version:      {stats['version']}")
        print(f"  Weak labels:  {stats['total_weak']}")
        print(f"  Verified:     {stats['total_verified']}")
        print(f"  URLs:         {stats['total_urls']}")
        print(f"\n  Categories:")
        for cat, count in sorted(stats["categories"].items(), key=lambda x: -x[1]):
            print(f"    {cat}: {count}")
        print("═" * 50 + "\n")
        return

    # ── Mode: Split ──────────────────────────────────────────────────────
    if args.split:
        manager = DatasetManager()
        result = manager.split_dataset()
        print(f"\n✅ Split complete: train={result['train']}, val={result['val']}, test={result['test']}\n")
        return

    # ── Mode: Single URL ─────────────────────────────────────────────────
    if args.url:
        if not OPENAI_API_KEY and not args.dry_run:
            print("\n❌ ERROR: OPENAI_API_KEY not set in .env")
            print("   Create dataset-collector/.env with: OPENAI_API_KEY=sk-...\n")
            sys.exit(1)

        print(f"\n🔍 Analyzing: {args.url}\n")
        headless = not args.no_headless

        async def _run():
            agent = DarkPatternAgent()
            verifier = VerificationEngine()
            manager = DatasetManager()
            async with BrowserCapture(headless=headless) as capture:
                return await analyze_url(
                    args.url, capture, agent, verifier, manager,
                    dry_run=args.dry_run, headless=headless,
                )

        detections = asyncio.run(_run())
        
        print(f"\n{'═' * 50}")
        print(f"  RESULTS: {len(detections)} dark patterns detected")
        print(f"{'═' * 50}")
        for d in detections:
            print(f"\n  {d.id}: {d.category}")
            print(f"  Confidence: {d.confidence:.2f} | Severity: {d.severity}")
            print(f"  BBox: {d.bbox}")
            print(f"  Evidence: {d.evidence[:80]}")
            if d.interactions:
                print(f"  Revealed by: {', '.join(d.interactions[:3])}")
        print(f"{'═' * 50}\n")
        return

    # ── Mode: Batch URLs ─────────────────────────────────────────────────
    if args.urls:
        if not OPENAI_API_KEY and not args.dry_run:
            print("\n❌ ERROR: OPENAI_API_KEY not set in .env")
            sys.exit(1)

        url_file = Path(args.urls)
        if not url_file.exists():
            print(f"\n❌ URL file not found: {args.urls}\n")
            sys.exit(1)

        urls = [line.strip() for line in url_file.read_text().splitlines() if line.strip() and not line.startswith("#")]
        print(f"\n🔍 Batch analysis: {len(urls)} URLs, concurrency={args.concurrency}\n")

        summary = asyncio.run(
            analyze_batch(urls, concurrency=args.concurrency,
                         dry_run=args.dry_run, headless=not args.no_headless)
        )

        print(f"\n{'═' * 50}")
        print(f"  BATCH RESULTS")
        print(f"{'═' * 50}")
        print(f"  URLs processed: {summary['successful']}/{summary['total_urls']}")
        print(f"  Total detections: {summary['total_detections']}")
        if summary['errors']:
            print(f"  Errors: {len(summary['errors'])}")
            for err in summary['errors'][:5]:
                print(f"    ❌ {err['url']}: {err['error'][:60]}")
        print(f"{'═' * 50}\n")
        return

    # No mode specified
    parser.print_help()


if __name__ == "__main__":
    main()
