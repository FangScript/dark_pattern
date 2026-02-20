"""
config.py — Centralized Configuration
======================================
All modules import from here. Edit this file to change model, thresholds,
paths, and taxonomy without touching any other module.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file if present (place OPENAI_API_KEY there)
load_dotenv(Path(__file__).parent / ".env")

# ── AI Model ──────────────────────────────────────────────────────────────────
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
MODEL_NAME: str = os.getenv("MODEL_NAME", "gpt-4o")
BASE_URL: str | None = os.getenv("OPENAI_BASE_URL", None) or None  # None = OpenAI default

# Qwen-VL via DashScope:
#   MODEL_NAME = "qwen-vl-max"
#   BASE_URL   = "https://dashscope.aliyuncs.com/compatible-mode/v1"

# Gemini via OpenAI-compatible endpoint:
#   MODEL_NAME = "gemini-2.0-flash"
#   BASE_URL   = "https://generativelanguage.googleapis.com/v1beta/openai/"

# ── Detection Thresholds ──────────────────────────────────────────────────────
CONFIDENCE_THRESHOLD: float = 0.70    # Reject detections below this
IOU_THRESHOLD: float = 0.30           # IoU above this → duplicate, keep higher-confidence one
MIN_BBOX_AREA: int = 100              # px² — reject tiny bounding boxes
MAX_BBOX_VIEWPORT_RATIO: float = 0.80 # Reject boxes covering > 80% of viewport

# ── Agent ─────────────────────────────────────────────────────────────────────
MAX_RETRIES: int = 3                  # Max VLM retries per region on verification failure
DOM_EXCERPT_CHARS: int = 4000         # Max DOM chars sent to VLM per region
AGENT_TIMEOUT_SECONDS: int = 120      # Per-URL timeout

# ── Pipeline ──────────────────────────────────────────────────────────────────
BATCH_CONCURRENCY: int = 4            # Parallel browser instances
DATASET_VERSION: str = "1.0"

# ── Dataset Splits ────────────────────────────────────────────────────────────
TRAIN_RATIO: float = 0.70
VAL_RATIO: float = 0.15
TEST_RATIO: float = 0.15              # Must sum to 1.0

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR: Path = Path(__file__).parent
DATA_DIR: Path = BASE_DIR / "data"

RAW_DIR: Path      = DATA_DIR / "raw"
WEAK_DIR: Path     = DATA_DIR / "weak"
VERIFIED_DIR: Path = DATA_DIR / "verified"
TRAIN_DIR: Path    = DATA_DIR / "train"
VAL_DIR: Path      = DATA_DIR / "val"
TEST_DIR: Path     = DATA_DIR / "test"
LOGS_DIR: Path     = BASE_DIR / "logs"

# Create all directories on import
for _d in [RAW_DIR, WEAK_DIR, VERIFIED_DIR, TRAIN_DIR, VAL_DIR, TEST_DIR, LOGS_DIR]:
    _d.mkdir(parents=True, exist_ok=True)

# ── Browser ───────────────────────────────────────────────────────────────────
VIEWPORT_WIDTH: int = 1920
VIEWPORT_HEIGHT: int = 1080
PAGE_LOAD_TIMEOUT_MS: int = 30_000
SCROLL_PAUSE_MS: int = 500            # Pause between scroll steps for lazy-load

# ── Dark Pattern Taxonomy (18 categories — canonical labels) ──────────────────
TAXONOMY: list[str] = [
    "Nagging",
    "Scarcity & Popularity",
    "FOMO / Urgency",
    "Reference Pricing",
    "Disguised Ads",
    "False Hierarchy",
    "Interface Interference",
    "Misdirection",
    "Hard To Close",
    "Obstruction",
    "Bundling",
    "Sneaking",
    "Hidden Information",
    "Subscription Trap",
    "Roach Motel",
    "Confirmshaming",
    "Forced Registration",
    "Gamification Pressure",
]

TAXONOMY_SET: set[str] = {t.lower() for t in TAXONOMY}

# ── Page Regions for Subtask Planning ─────────────────────────────────────────
# Each region maps to CSS selectors used to locate it in the DOM
REGIONS: dict[str, list[str]] = {
    "header": ["header", "nav", "[role='banner']", ".header", "#header", ".top-bar", ".announcement-bar"],
    "product_card": [".product-card", ".product-item", "[data-product]", ".item-card", ".product-box"],
    "checkout": ["#checkout", ".checkout", ".cart", ".order-summary", "[data-checkout]"],
    "modal": [".modal", "[role='dialog']", ".popup", ".overlay", ".lightbox", "[aria-modal='true']"],
    "footer": ["footer", "[role='contentinfo']", ".footer", "#footer"],
    "sidebar": ["aside", ".sidebar", "[role='complementary']", ".side-panel"],
    "full_page": ["body"],  # Fallback — analyze entire page
}

# ── Severity Levels ───────────────────────────────────────────────────────────
SEVERITY_LEVELS: list[str] = ["low", "medium", "high", "critical"]

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
