import { createServer } from 'node:net';
import { playgroundForAgent } from '@darkpatternhunter/playground';
import dotenv from 'dotenv';
import { PuppeteerAgent } from '../src/puppeteer';
import { launchPuppeteerPage } from '../src/puppeteer/agent-launcher';

dotenv.config({
  path: '../../.env',
});

async function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort: number) {
  const maxAttempts = 20;
  let attempts = 0;
  let port = startPort;

  while (!(await isPortAvailable(port))) {
    attempts++;
    if (attempts >= maxAttempts) {
      throw new Error(
        `Unable to find available port after ${maxAttempts} attempts starting from ${startPort}`,
      );
    }
    port++;
  }

  return port;
}

async function main() {
  await Promise.resolve(
    (async () => {
      const targetUrl =
        process.env.PLAYGROUND_TARGET_URL ??
        'https://lf3-static.bytednsdoc.com/obj/eden-cn/nupipfups/Midscene/contacts3.html';
      console.log(`🌐 Launching Puppeteer page: ${targetUrl}`);
      const { page } = await launchPuppeteerPage({
        url: targetUrl,
      });
      await page.setViewport({
        width: 1280,
        height: 768,
      });

      const agent = new PuppeteerAgent(page, {
        cacheId: process.env.PLAYGROUND_CACHE_ID ?? 'playground-workflow-test',
      });

      // 👀 launch playground for the agent
      const preferredPort = Number(process.env.PLAYGROUND_PORT ?? 5807);
      const port = await findAvailablePort(preferredPort);
      if (port !== preferredPort) {
        console.log(
          `⚠️  Port ${preferredPort} is in use, falling back to ${port}`,
        );
      }

      const openBrowser =
        (process.env.PLAYGROUND_OPEN_BROWSER ?? 'true').toLowerCase() !==
        'false';

      const server = await playgroundForAgent(agent).launch({
        port,
        openBrowser,
        verbose: true,
      });

      // Log the generated server ID for debugging
      console.log(`🔑 Generated Server ID: ${server.server.id}`);

      // Wait for server to start and close
      await new Promise((resolve) => setTimeout(resolve, 2000));
    })(),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
