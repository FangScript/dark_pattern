import fs from 'node:fs';
import path from 'node:path';
import { AgentOverChromeBridge } from '@darkpatternhunter/web/bridge-mode';

function loadEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const sep = trimmed.indexOf('=');
    if (sep === -1) return;
    const key = trimmed.slice(0, sep).trim();
    let value = trimmed.slice(sep + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadEnv(path.resolve(__dirname, '.env'));

async function main() {
  console.log('🔌 Starting Midscene bridge demo...');

  const agent = new AgentOverChromeBridge();

  try {
    console.log(
      '🧠 Connecting to a new Chrome tab at https://www.daraz.pk/ ...',
    );
    await agent.connectNewTabWithUrl('https://www.daraz.pk/');

    console.log('🤖 Asking the model to analyze the page for dark patterns...');
    const result = await agent.ai(`
You are a dark-pattern analysis expert.
You are currently looking at the homepage of Daraz (an e-commerce site).

1. Briefly describe what you see on the page (layout, key sections).
2. Identify any potential dark patterns (e.g., fake scarcity, confirmshaming, forced action, hidden costs, sneak into basket, misdirection, etc.).
3. For each suspected dark pattern, return a short JSON object with:
   - "type": short label
   - "location": where on the page (e.g., banner, product card, popup)
   - "reason": why you think it’s a dark pattern.

Return your final answer as a short explanation followed by a JSON array named "patterns".
    `);

    console.log('\n🧾 Dark pattern analysis result:\n');
    console.log(result);
  } finally {
    console.log('\n🧹 Cleaning up bridge connection...');
    await agent.destroy();
  }
}

main().catch((error) => {
  console.error('❌ Bridge demo failed:', error);
  process.exit(1);
});
