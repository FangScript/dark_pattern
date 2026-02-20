/**
 * Dark Pattern Dataset Collector — Midscene-Powered Agent
 * =========================================================
 * Uses the FULL Midscene agent API on a headless Playwright browser:
 *
 *   agent.aiAction()   → high-level multi-step automation
 *   agent.aiBoolean()  → yes/no page state checks
 *   agent.aiQuery()    → structured data extraction (screenshot + DOM)
 *   agent.aiScroll()   → AI-guided scrolling
 *   agent.aiTap()      → click elements by visual description
 *   agent.aiHover()    → hover for tooltips/popovers
 *   agent.aiLocate()   → pixel-accurate element bounding boxes
 *
 * Produces:
 *   - JSON dataset entry  →  dataset-collector/data/verified/<id>.json
 *   - Midscene visual execution report (.html + .web-dump.json)
 *     Open the .html report in your browser to replay every step with screenshots!
 *
 * Usage:
 *   node scripts/collect-dark-patterns.mjs [URL] [--no-report] [--show-browser]
 *
 * Examples:
 *   node scripts/collect-dark-patterns.mjs https://www.daraz.pk
 *   node scripts/collect-dark-patterns.mjs https://www.telemart.pk --show-browser
 */

// Load env vars from .env.bridge
try {
  const { config } = await import('dotenv');
  config({ path: new URL('../.env.bridge', import.meta.url).pathname });
} catch {}

// Dynamic imports (monorepo workspace packages)
const { chromium } = await import('playwright');
const { PlaywrightAgent } = await import('@darkpatternhunter/web/playwright');
const { overrideAIConfig } = await import('@darkpatternhunter/shared/env');
const { default: fs } = await import('node:fs');
const { default: path } = await import('node:path');
const { fileURLToPath } = await import('node:url');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── 18-Category Taxonomy ─────────────────────────────────────────────────────
const TAXONOMY = [
  'Nagging',
  'Scarcity & Popularity',
  'FOMO / Urgency',
  'Reference Pricing',
  'Disguised Ads',
  'False Hierarchy',
  'Interface Interference',
  'Misdirection',
  'Hard To Close',
  'Obstruction',
  'Bundling',
  'Sneaking',
  'Hidden Information',
  'Subscription Trap',
  'Roach Motel',
  'Confirmshaming',
  'Forced Registration',
  'Gamification Pressure',
];

// ── AI Configuration ──────────────────────────────────────────────────────────
function configureAI() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.MIDSCENE_OPENAI_API_KEY;
  const model  = process.env.MODEL_NAME || process.env.MIDSCENE_VQA_MODEL_NAME || 'gpt-4o';
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.MIDSCENE_OPENAI_BASE_URL;

  if (!apiKey) {
    console.error('\n❌ No API key found. Add OPENAI_API_KEY to .env.bridge and retry.\n');
    process.exit(1);
  }

  overrideAIConfig({
    MIDSCENE_OPENAI_API_KEY: apiKey,
    MIDSCENE_VQA_MODEL_NAME: model,
    ...(baseUrl ? { MIDSCENE_OPENAI_BASE_URL: baseUrl } : {}),
  });

  console.log(`✔  AI ready  →  model=${model}`);
}

// ── Detection query (reused at each stage) ───────────────────────────────────
const TAXONOMY_LIST = TAXONOMY.map((t) => `"${t}"`).join(', ');

const DETECTION_QUERY = `{
  patterns: Array<{
    category: one of [${TAXONOMY_LIST}],
    evidence: "exact text or visual element description",
    severity: "low" | "medium" | "high" | "critical",
    location: "where on page (header / product card / modal / footer / etc.)",
    confidence: number between 0 and 1
  }>
}

Analyze the visible area for dark patterns using the taxonomy above.
Rules:
- Confidence > 0.70 only
- Only clear manipulation, not normal UX
- Text-only patterns welcome (hidden fees in fine print etc.)
- Be conservative — dataset precision > recall`;

// ── Main collector ────────────────────────────────────────────────────────────
async function collectDarkPatterns(url, { saveReport = true, headless = true } = {}) {
  const entryId   = `dp_${Date.now()}`;
  const agentSteps = [];
  const allPatterns = [];

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  MIDSCENE DARK PATTERN COLLECTOR`);
  console.log(`  URL    : ${url}`);
  console.log(`  Report : ${saveReport ? 'yes' : 'no'}  |  Browser: ${headless ? 'headless' : 'visible'}`);
  console.log(`${'═'.repeat(60)}\n`);

  const browser = await chromium.launch({ headless });
  const page    = await browser.newPage();

  /** @type {import('@darkpatternhunter/web/playwright').PlaywrightAgent} */
  const agent = new PlaywrightAgent(page, {
    groupName:        `Dark Pattern Scan — ${new URL(url).hostname}`,
    groupDescription: `Automated Midscene collection run — ${new Date().toISOString()}`,
    generateReport:   saveReport,
  });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1 — Navigate
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 1: Navigate');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);
    agentSteps.push('navigate');

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2 — aiAction: dismiss popups / cookie banners
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 2: aiAction — dismiss popups');
    try {
      await agent.aiAction(
        'If a cookie consent banner, privacy dialog, newsletter popup, app download ' +
        'prompt, or any overlay is visible, close it by clicking the close/reject/dismiss ' +
        'button. If none exist, do nothing.',
      );
      agentSteps.push('aiAction: dismiss popups');
    } catch { /* none found */ }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3 — aiQuery: initial viewport scan
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 3: aiQuery — initial viewport scan');
    const collected = []; // accumulates all pattern objects

    const initial = await agent.aiQuery(DETECTION_QUERY).catch(() => null);
    if (initial?.patterns?.length) {
      console.log(`   Found ${initial.patterns.length} patterns in initial view`);
      collected.push(...initial.patterns);
    }
    agentSteps.push('aiQuery: initial viewport');

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4 — aiScroll: scroll down in steps revealing lazy-loaded content
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 4: aiScroll — reveal hidden content');
    const pageHeight     = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = page.viewportSize()?.height ?? 900;
    const scrollSteps    = Math.min(Math.ceil(pageHeight / (viewportHeight * 0.7)), 8);

    for (let i = 1; i < scrollSteps; i++) {
      try {
        await agent.aiScroll(
          { scrollType: 'scrollDownOneScreen' },
          `scroll step ${i}/${scrollSteps} to reveal more content`,
        );
        await page.waitForTimeout(800);

        const scan = await agent.aiQuery(DETECTION_QUERY).catch(() => null);
        if (scan?.patterns?.length) {
          collected.push(...scan.patterns);
          console.log(`   Scroll ${i}: +${scan.patterns.length} patterns`);
        }
      } catch { break; }
    }
    agentSteps.push(`aiScroll: ${scrollSteps} steps`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5 — aiScroll back to top
    // ──────────────────────────────────────────────────────────────────────────
    await agent.aiScroll({ scrollType: 'scrollToTop' }).catch(() => {});
    await page.waitForTimeout(500);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 6 — aiBoolean + aiTap: interact to reveal hidden patterns
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 6: aiTap — expand/interact with elements');
    const tapChecks = [
      {
        check: 'Is there a "See More", "Show More", "View Details", or expandable accordion visible?',
        tap:   '"See More", "Show More", "View Details", or the expandable element',
        via:   'tap-expand',
      },
      {
        check: 'Is there a product with a countdown timer or urgency badge visible?',
        tap:   'the product that has a countdown timer or urgency badge',
        via:   'tap-urgency-product',
      },
      {
        check: 'Is there a dropdown (quantity, size, options) that might pre-select a paid option?',
        tap:   'the dropdown for quantity, size, or options',
        via:   'tap-dropdown',
      },
    ];

    for (const { check, tap, via } of tapChecks) {
      try {
        const has = await agent.aiBoolean(check);
        if (!has) continue;

        agentSteps.push(`aiBoolean: ${check.substring(0, 50)}`);

        await agent.aiTap(tap);
        await page.waitForTimeout(1000);

        const scan = await agent.aiQuery(DETECTION_QUERY).catch(() => null);
        if (scan?.patterns?.length) {
          collected.push(...scan.patterns);
          console.log(`   ${via}: +${scan.patterns.length} patterns`);
        }
        agentSteps.push(`aiTap: ${via}`);
      } catch { /* skip */ }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 7 — aiHover: expose tooltip-hidden patterns
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 7: aiHover — reveal tooltip/popover patterns');
    await agent.aiScroll({ scrollType: 'scrollToTop' }).catch(() => {});

    const hoverChecks = [
      'an information icon (ℹ), asterisk (*), or "?" that might reveal hidden fee details on hover',
      'a greyed-out or disabled button that might show obstruction messaging on hover',
    ];

    for (const target of hoverChecks) {
      try {
        const has = await agent.aiBoolean(`Is there ${target} visible?`);
        if (!has) continue;

        await agent.aiHover(target);
        await page.waitForTimeout(800);

        const scan = await agent.aiQuery(DETECTION_QUERY).catch(() => null);
        if (scan?.patterns?.length) {
          collected.push(...scan.patterns);
          console.log(`   Hover: +${scan.patterns.length} patterns`);
        }
        agentSteps.push(`aiHover: ${target.substring(0, 50)}`);
      } catch { /* skip */ }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 8 — aiLocate: get pixel-accurate bounding boxes for each pattern
    // ──────────────────────────────────────────────────────────────────────────
    console.log('→ Step 8: aiLocate — pin pixel-accurate bounding boxes');
    await agent.aiScroll({ scrollType: 'scrollToTop' }).catch(() => {});
    await page.waitForTimeout(300);

    // Deduplicate by evidence text
    const seen = new Set();
    const deduped = collected.filter((p) => {
      const validCat = TAXONOMY.find((t) => t.toLowerCase() === p.category?.toLowerCase());
      if (!validCat) return false;
      if ((p.confidence ?? 0) < 0.7) return false;
      const key = `${validCat}::${p.evidence?.substring(0, 60)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      p.category = validCat; // normalize casing
      return true;
    });

    console.log(`   Deduped: ${collected.length} → ${deduped.length} unique patterns`);

    for (const p of deduped) {
      let bbox = [0, 0, 0, 0];
      try {
        const located = await agent.aiLocate(
          `Locate the element representing this dark pattern:
           Category: ${p.category}
           Evidence: "${p.evidence}"
           Location hint: ${p.location}`,
        );
        if (located?.rect) {
          const r = located.rect;
          bbox = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
          console.log(`   ✔ Located [${p.category}] bbox=[${bbox.join(',')}]`);
        }
      } catch {
        console.log(`   ⚠ No bbox for: ${p.category}`);
      }

      allPatterns.push({
        category:   p.category,
        bbox,
        confidence: p.confidence,
        evidence:   p.evidence,
        severity:   p.severity ?? 'medium',
        location:   p.location,
        foundVia:   'aiLocate + aiQuery + aiScroll',
      });
    }
    agentSteps.push(`aiLocate: ${allPatterns.length} patterns`);

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 9 — Save dataset entry
    // ──────────────────────────────────────────────────────────────────────────
    const entry = {
      id:         entryId,
      url,
      timestamp:  new Date().toISOString(),
      patterns:   allPatterns,
      agentSteps,
      reportFile: agent.reportFile ?? null,
    };

    const dataDir  = path.resolve(__dirname, '../dataset-collector/data/verified');
    fs.mkdirSync(dataDir, { recursive: true });
    const outPath = path.join(dataDir, `${entryId}.json`);
    fs.writeFileSync(outPath, JSON.stringify(entry, null, 2));
    console.log(`\n✔  Dataset entry saved → ${outPath}`);

    // Report is auto-saved by Midscene after every ai* call
    if (agent.reportFile) {
      console.log(`✔  Midscene Visual Report → ${agent.reportFile}`);
      console.log('   Open in browser to REPLAY every agent step with screenshots!\n');
    }

    return entry;

  } finally {
    await browser.close();
  }
}

// ── Summary printer ───────────────────────────────────────────────────────────
function printSummary(entry) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  FINAL RESULTS');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  URL        : ${entry.url}`);
  console.log(`  Patterns   : ${entry.patterns.length}`);
  console.log(`  Agent steps: ${entry.agentSteps.join(' → ')}`);

  if (entry.patterns.length > 0) {
    console.log('\n  Detections:');
    for (const p of entry.patterns) {
      const box = p.bbox.every((v) => v === 0) ? '(no bbox)' : `[${p.bbox.join(',')}]`;
      console.log(`    [${p.severity.toUpperCase().padEnd(8)}] ${p.category.padEnd(30)} conf=${p.confidence.toFixed(2)}  ${box}`);
      console.log(`               "${p.evidence?.substring(0, 80)}"`);
    }
  } else {
    console.log('\n  No dark patterns detected above 0.70 confidence.');
  }

  if (entry.reportFile) {
    console.log(`\n  📊 Visual Report: ${entry.reportFile}`);
  }
  console.log(`${'═'.repeat(60)}\n`);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const targetUrl  = args.find((a) => !a.startsWith('--')) ?? 'https://www.daraz.pk';
const noReport   = args.includes('--no-report');
const showBrowser = args.includes('--show-browser');

configureAI();

collectDarkPatterns(targetUrl, { saveReport: !noReport, headless: !showBrowser })
  .then((entry) => { printSummary(entry); process.exit(0); })
  .catch((err)  => { console.error('\n❌ Fatal:', err.message); process.exit(1); });
