/**
 * Bridge Mode Runner — Dark Pattern Hunter
 *
 * HOW TO USE:
 * 1. Load the extension in Chrome (see README below)
 * 2. Open any Pakistani e-commerce site in Chrome
 * 3. Open the extension popup → click the "Bridge" tab → click "Allow Connection"
 * 4. Run this script: node scripts/bridge-runner.mjs
 *
 * The script will connect to your live Chrome tab and analyze it for dark patterns.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Load env vars from .env.bridge if it exists
try {
  const { config } = await import('dotenv');
  config({ path: new URL('../.env.bridge', import.meta.url).pathname });
} catch {}

const { AgentOverChromeBridge, overrideAIConfig } = await import(
  '@darkpatternhunter/web/bridge-mode'
);

// ─── AI Model Configuration ────────────────────────────────────────────────
// Set your API key here OR in .env.bridge file (recommended)
// Supported: OpenAI, Qwen-VL (via OpenAI-compatible endpoint), Gemini, Anthropic

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const MODEL_NAME    = process.env.MIDSCENE_MODEL_NAME || 'gpt-4o';
const BASE_URL      = process.env.OPENAI_BASE_URL || '';   // leave empty for OpenAI default

if (!OPENAI_API_KEY) {
  console.error('\n❌ ERROR: No API key found.');
  console.error('   Create a .env.bridge file in the project root with:');
  console.error('   OPENAI_API_KEY=sk-...\n');
  process.exit(1);
}

overrideAIConfig({
  OPENAI_API_KEY,
  MIDSCENE_MODEL_NAME: MODEL_NAME,
  ...(BASE_URL ? { OPENAI_BASE_URL: BASE_URL } : {}),
});

// ─── Dark Pattern Taxonomy ─────────────────────────────────────────────────
const TAXONOMY = [
  'Nagging', 'Scarcity & Popularity', 'FOMO / Urgency', 'Reference Pricing',
  'Disguised Ads', 'False Hierarchy', 'Interface Interference', 'Misdirection',
  'Hard To Close', 'Obstruction', 'Bundling', 'Sneaking', 'Hidden Information',
  'Subscription Trap', 'Roach Motel', 'Confirmshaming', 'Forced Registration',
  'Gamification Pressure',
];

const DETECTION_QUERY = `
Analyze this Pakistani e-commerce webpage for dark patterns.

Use ONLY these 18 taxonomy labels (exact spelling):
${TAXONOMY.map((t, i) => `${i + 1}. ${t}`).join('\n')}

For each detected pattern return:
{
  "patterns": [
    {
      "category": "Exact Taxonomy Label",
      "bbox": [x, y, width, height],
      "confidence": 0.85,
      "severity": "low|medium|high|critical",
      "evidence": "Exact text or element proving the pattern",
      "location": "Where on page (header, product card, modal, etc.)"
    }
  ],
  "summary": {
    "total_patterns": 0,
    "prevalence_score": 0.0,
    "primary_categories": []
  }
}

Rules:
- Only include patterns with confidence > 0.7
- Provide tight bounding boxes [x, y, width, height] in pixels
- Return valid JSON only, no markdown
`;

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🌉 Dark Pattern Hunter — Bridge Mode');
  console.log('─'.repeat(50));
  console.log(`   Model: ${MODEL_NAME}`);
  console.log('─'.repeat(50));
  console.log('\n⏳ Waiting for Chrome Extension to connect...');
  console.log('   → Open Chrome Extension popup → Bridge tab → "Allow Connection"\n');

  const agent = new AgentOverChromeBridge({
    serverListeningTimeout: 60000, // wait up to 60s for extension to connect
  });

  try {
    // Connect to the currently active tab in Chrome
    await agent.connectCurrentTab();
    console.log('✅ Connected to Chrome tab!\n');

    // Get the current URL
    const pageInfo = await agent.aiQuery(
      'What is the URL and title of this page? Return { url: string, title: string }',
    );
    console.log(`📄 Page: ${pageInfo?.title || 'Unknown'}`);
    console.log(`🔗 URL:  ${pageInfo?.url || 'Unknown'}\n`);

    // Run dark pattern detection
    console.log('🔍 Analyzing for dark patterns...\n');
    const result = await agent.aiQuery(DETECTION_QUERY);

    // ─── Display Results ───────────────────────────────────────────────────
    console.log('═'.repeat(50));
    console.log('  DARK PATTERN DETECTION RESULTS');
    console.log('═'.repeat(50));

    if (!result || !result.patterns || result.patterns.length === 0) {
      console.log('\n✅ No dark patterns detected on this page.\n');
    } else {
      const patterns = result.patterns;
      const summary  = result.summary || {};

      console.log(`\n⚠️  Found ${patterns.length} dark pattern(s)\n`);
      console.log(`   Prevalence Score: ${((summary.prevalence_score || 0) * 100).toFixed(0)}%`);
      if (summary.primary_categories?.length) {
        console.log(`   Primary Types:    ${summary.primary_categories.join(', ')}`);
      }
      console.log('');

      patterns.forEach((p, i) => {
        const severity = p.severity?.toUpperCase() || 'UNKNOWN';
        const conf     = p.confidence ? `${(p.confidence * 100).toFixed(0)}%` : 'N/A';
        const bbox     = p.bbox ? `[${p.bbox.join(', ')}]` : 'No bbox';

        console.log(`  ${i + 1}. ${p.category}`);
        console.log(`     Severity:   ${severity}  |  Confidence: ${conf}`);
        console.log(`     Location:   ${p.location || 'Unknown'}`);
        console.log(`     BBox:       ${bbox}`);
        console.log(`     Evidence:   ${p.evidence || 'N/A'}`);
        console.log('');
      });
    }

    console.log('═'.repeat(50));
    console.log('\n✅ Analysis complete!\n');

    // Save results to a JSON file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = `bridge-results-${timestamp}.json`;
    const { writeFileSync } = await import('fs');
    writeFileSync(
      outputFile,
      JSON.stringify({ pageInfo, result, timestamp: new Date().toISOString() }, null, 2),
    );
    console.log(`💾 Results saved to: ${outputFile}\n`);

  } catch (err) {
    console.error('\n❌ Error:', err.message || err);
    if (err.message?.includes('no-client-connected') || err.message?.includes('no extension connected')) {
      console.error('\n   Make sure to:');
      console.error('   1. Open Chrome with the extension loaded');
      console.error('   2. Click "Allow Connection" in the Bridge tab of the extension popup\n');
    }
  } finally {
    await agent.destroy().catch(() => {});
    console.log('🔌 Bridge disconnected.\n');
    process.exit(0);
  }
}

main();
