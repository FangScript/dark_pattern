import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StaticPageAgent, StaticPage } from '@darkpatternhunter/web/static';
import { describe, expect, it } from 'vitest';

const dumpFilePath = join(__dirname, '../../fixtures/ui-context.json');
const context = readFileSync(dumpFilePath, { encoding: 'utf-8' });
const contextJson = JSON.parse(context);

describe(
  'static page agent',
  {
    timeout: 30 * 1000,
  },
  () => {
    it('agent should work', async () => {
      const page = new StaticPage(contextJson);

      const agent = new StaticPageAgent(page);
      const content = await agent.aiQuery('tell me the content of the page');
      expect(content).toBeDefined();

      agent.writeOutActionDumps();
    });
  },
);
