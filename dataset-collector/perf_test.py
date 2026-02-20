"""
perf_test.py — Performance & Log Monitor for Dataset Collector
================================================================
Runs a full capture dry-run and prints detailed timing for every stage.
No AI API key required — this tests capture + planning only.

Usage:  python perf_test.py [URL]
"""

import asyncio
import sys
import time
import os
import json
from datetime import datetime, timezone

# ── Coloured terminal output (works on Windows 10+) ─────────────────────────
RESET  = "\033[0m"
BOLD   = "\033[1m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RED    = "\033[91m"
DIM    = "\033[2m"
BLUE   = "\033[94m"

def hdr(msg):  print(f"\n{BOLD}{CYAN}{'═'*60}{RESET}\n{BOLD}{CYAN}  {msg}{RESET}\n{BOLD}{CYAN}{'═'*60}{RESET}")
def ok(msg):   print(f"  {GREEN}✔{RESET}  {msg}")
def info(msg): print(f"  {CYAN}→{RESET}  {msg}")
def warn(msg): print(f"  {YELLOW}⚠{RESET}  {msg}")
def err(msg):  print(f"  {RED}✘{RESET}  {msg}")
def dim(msg):  print(f"  {DIM}{msg}{RESET}")
def timing(label, seconds): 
    bar_len = min(int(seconds * 5), 40)
    bar = "█" * bar_len + "░" * (40 - bar_len)
    color = GREEN if seconds < 3 else YELLOW if seconds < 8 else RED
    print(f"  {DIM}{label:<30}{RESET} {color}{seconds:6.2f}s{RESET}  {DIM}{bar}{RESET}")


async def run_perf_test(url: str):
    start_total = time.perf_counter()

    hdr("DARK PATTERN COLLECTOR — PERFORMANCE TEST")
    print(f"  {DIM}URL    : {url}{RESET}")
    print(f"  {DIM}Time   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}")

    timings = {}
    issues = []

    # ── 1. Import check ───────────────────────────────────────────────────────
    hdr("STEP 1 / 5  ·  Module Imports")
    t = time.perf_counter()
    try:
        from config import (VIEWPORT_WIDTH, VIEWPORT_HEIGHT, TAXONOMY,
                            REGIONS, CONFIDENCE_THRESHOLD, DOM_EXCERPT_CHARS,
                            IOU_THRESHOLD, MIN_BBOX_AREA)
        from capture.browser_capture import BrowserCapture
        from agent.planner import Planner
        from dataset.manager import DatasetManager
        from verification.engine import VerificationEngine

        ok(f"All modules imported OK")
        ok(f"Taxonomy   : {len(TAXONOMY)} dark pattern categories")
        ok(f"Regions    : {len(REGIONS)} page regions configured")
        ok(f"Viewport   : {VIEWPORT_WIDTH} × {VIEWPORT_HEIGHT} px")
        ok(f"Confidence : ≥ {CONFIDENCE_THRESHOLD}")
        ok(f"IoU thresh : {IOU_THRESHOLD}")
        ok(f"Min bbox   : {MIN_BBOX_AREA} px²")
    except ImportError as e:
        err(f"Import failed: {e}")
        return
    timings["imports"] = time.perf_counter() - t
    timing("Module imports", timings["imports"])

    # ── 2. Browser Launch ────────────────────────────────────────────────────
    hdr("STEP 2 / 5  ·  Browser Launch + Navigation")
    t = time.perf_counter()
    capture_result = None
    try:
        async with BrowserCapture(headless=True) as cap:
            timings["browser_launch"] = time.perf_counter() - t
            timing("Browser launch", timings["browser_launch"])
            ok(f"Chromium launched (headless)")

            info(f"Navigating to {url} ...")
            t2 = time.perf_counter()
            capture_result = await cap.capture_page(url, interact=True, scroll=True)
            timings["capture"] = time.perf_counter() - t2

            # Save raw
            t3 = time.perf_counter()
            capture_id = f"perf_{int(time.time())}"
            await cap.save_raw(capture_result, capture_id)
            timings["save_raw"] = time.perf_counter() - t3

            ok(f"Page captured in {timings['capture']:.2f}s")
            ok(f"Raw data saved  in {timings['save_raw']:.2f}s")
    except Exception as e:
        err(f"Capture failed: {e}")
        issues.append(("Capture", str(e)))
        capture_result = None

    if capture_result:
        # Print capture stats
        print()
        info(f"  Screenshot  : {len(capture_result.screenshot):,} chars (base64 PNG)")
        info(f"  DOM size    : {len(capture_result.html):,} chars")
        info(f"  Visible text: {len(capture_result.text):,} chars")
        info(f"  Page title  : {capture_result.page_title[:60]}")
        info(f"  Elements    : {len(capture_result.element_bboxes):,} DOM elements extracted")
        info(f"  Interactions: {len(capture_result.interactions):,} browser actions performed")
        info(f"  Extra shots : {len(capture_result.screenshots_after_interactions):,} post-interaction screenshots")

        if capture_result.interactions:
            print()
            dim("  Interaction breakdown:")
            from collections import Counter
            action_counts = Counter(ir.action for ir in capture_result.interactions)
            for action, count in sorted(action_counts.items()):
                revealed = sum(1 for ir in capture_result.interactions
                              if ir.action == action and ir.revealed_new)
                dim(f"    {action:<25} {count:3d}x   ({revealed} revealed new content)")

    # ── 3. Planner ────────────────────────────────────────────────────────────
    hdr("STEP 3 / 5  ·  Region Planning")
    if capture_result:
        t = time.perf_counter()
        try:
            planner = Planner()
            region_tasks = planner.plan(capture_result)
            timings["planning"] = time.perf_counter() - t
            timing("Region planning", timings["planning"])
            ok(f"Planned {len(region_tasks)} region tasks")
            print()
            dim("  Region breakdown (priority order):")
            for task in region_tasks:
                crop_kb = len(task.screenshot_crop) * 3 // 4 // 1024
                dom_kb  = len(task.dom_excerpt) // 1024
                dim(f"    {task.region_name:<20} priority={task.priority:3d}  "
                    f"elements={len(task.elements):3d}  "
                    f"crop={crop_kb:3d}KB  dom={dom_kb:3d}KB")
        except Exception as e:
            err(f"Planning failed: {e}")
            issues.append(("Planning", str(e)))
            timings["planning"] = 0
    else:
        warn("Skipped (no capture result)")

    # ── 4. Dataset Manager ────────────────────────────────────────────────────
    hdr("STEP 4 / 5  ·  Dataset Manager")
    t = time.perf_counter()
    try:
        manager = DatasetManager()
        stats = manager.stats()
        timings["dataset_init"] = time.perf_counter() - t
        timing("Dataset manager init", timings["dataset_init"])
        ok(f"Dataset manager ready")
        print()
        info(f"  Version    : {stats['version']}")
        info(f"  Weak labels: {stats['total_weak']}")
        info(f"  Verified   : {stats['total_verified']}")
        info(f"  URLs done  : {stats['total_urls']}")
        if stats['categories']:
            dim("  Category breakdown:")
            for cat, count in sorted(stats['categories'].items(), key=lambda x: -x[1]):
                dim(f"    {cat:<35} {count:3d}")
    except Exception as e:
        err(f"Dataset manager failed: {e}")
        issues.append(("Dataset", str(e)))

    # ── 5. Verification Engine ────────────────────────────────────────────────
    hdr("STEP 5 / 5  ·  Verification Engine")
    t = time.perf_counter()
    try:
        verifier = VerificationEngine()
        # Create a dummy detection to test the engine
        from agent.dark_pattern_agent import Detection
        dummy = Detection(
            id="dp_test_001",
            url=url,
            category="FOMO / Urgency",
            bbox=[100, 100, 300, 80],
            confidence=0.85,
            evidence="Only 2 left in stock",
            severity="high",
            location="product_card",
            timestamp=datetime.now(timezone.utc).isoformat(),
        )
        result = verifier.verify(
            dummy,
            full_screenshot_b64=capture_result.screenshot if capture_result else None,
            dom_html=capture_result.html if capture_result else None,
        )
        timings["verifier"] = time.perf_counter() - t
        timing("Verifier (1 detection)", timings["verifier"])

        if result.passed:
            ok(f"Dummy detection passed ALL checks")
        else:
            warn(f"Dummy failed: {result.reason}")
        print()
        dim("  Check details:")
        for check_name, check_data in result.checks.items():
            icon = GREEN + "✔" + RESET if check_data["passed"] else RED + "✘" + RESET
            dim(f"    {icon} {check_name:<22} {check_data['reason'][:60]}")
    except Exception as e:
        err(f"Verifier failed: {e}")
        issues.append(("Verifier", str(e)))

    # ── Summary ───────────────────────────────────────────────────────────────
    total = time.perf_counter() - start_total
    timings["TOTAL"] = total

    hdr("PERFORMANCE SUMMARY")
    print(f"  {BOLD}Stage timings:{RESET}")
    for label, secs in timings.items():
        timing(label, secs)

    print()
    pct_capture = timings.get("capture", 0) / total * 100
    pct_plan    = timings.get("planning", 0) / total * 100
    print(f"  {DIM}Time budget:{RESET}")
    dim(f"    Browser capture  : {pct_capture:.0f}%")
    dim(f"    Region planning  : {pct_plan:.0f}%")
    dim(f"    Overhead/IO      : {100-pct_capture-pct_plan:.0f}%")

    print()
    if issues:
        hdr("⚠  ISSUES DETECTED")
        for stage, msg in issues:
            err(f"{stage}: {msg}")
    else:
        ok(f"{BOLD}All stages passed. Pipeline ready for VLM analysis.{RESET}")
        info(f"Next step: set OPENAI_API_KEY in .env and run without --dry-run")

    print(f"\n  {BOLD}Total wall-clock time: {total:.2f}s{RESET}")
    print(f"  {DIM}(VLM analysis adds ~5–30s per region depending on model){RESET}\n")

    # Save performance log to JSON
    log = {
        "url": url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "timings_seconds": timings,
        "capture_stats": {
            "screenshot_chars": len(capture_result.screenshot) if capture_result else 0,
            "dom_chars": len(capture_result.html) if capture_result else 0,
            "elements": len(capture_result.element_bboxes) if capture_result else 0,
            "interactions": len(capture_result.interactions) if capture_result else 0,
        } if capture_result else {},
        "issues": [{"stage": s, "error": m} for s, m in issues],
    }
    os.makedirs("logs", exist_ok=True)
    log_path = f"logs/perf_{int(time.time())}.json"
    with open(log_path, "w") as f:
        json.dump(log, f, indent=2)
    dim(f"  Log saved → {log_path}")


if __name__ == "__main__":
    url = sys.argv[1] if len(sys.argv) > 1 else "https://www.daraz.pk"
    os.system("color")  # Enable ANSI colors on Windows
    asyncio.run(run_perf_test(url))
