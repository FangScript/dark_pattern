const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:net');
const minimist = require('minimist');

const { playgroundForAgent } = require('../packages/playground/dist/lib');
const {
  launchPuppeteerPage,
} = require('../packages/web-integration/dist/lib/puppeteer/agent-launcher');
const {
  PuppeteerAgent,
} = require('../packages/web-integration/dist/lib/puppeteer');

const ENV_PATH = path.resolve(__dirname, '../.env');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      return;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] ??= value;
  });
}

loadEnv(ENV_PATH);

const args = minimist(process.argv.slice(2), {
  string: ['url', 'port', 'cache-id', 'viewport-width', 'viewport-height'],
  boolean: ['headed', 'open-browser'],
  alias: {
    url: 'u',
    port: 'p',
  },
});

function logStep(message) {
  console.log(`[playground] ${message}`);
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  const maxAttempts = 20;
  let attempts = 0;
  let port = startPort;

  while (!(await isPortAvailable(port))) {
    attempts += 1;
    if (attempts >= maxAttempts) {
      throw new Error(
        `Unable to find available port after ${maxAttempts} attempts starting from ${startPort}`,
      );
    }
    port += 1;
  }

  return port;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
  }
  return fallback;
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const targetUrl =
    args.url || process.env.PLAYGROUND_TARGET_URL || 'https://www.daraz.pk/';

  const viewportWidth = parseNumber(
    args['viewport-width'] || process.env.PLAYGROUND_VIEWPORT_WIDTH,
    1440,
  );
  const viewportHeight = parseNumber(
    args['viewport-height'] || process.env.PLAYGROUND_VIEWPORT_HEIGHT,
    768,
  );

  const headed = parseBoolean(
    args.headed ?? process.env.PLAYGROUND_HEADED,
    false,
  );

  const openBrowser = parseBoolean(
    args['open-browser'] ?? process.env.PLAYGROUND_OPEN_BROWSER,
    false,
  );

  const cacheId =
    args['cache-id'] || process.env.PLAYGROUND_CACHE_ID || 'dark-pattern-dev';

  logStep(`Target URL: ${targetUrl}`);
  logStep(`Viewport: ${viewportWidth}x${viewportHeight}`);
  logStep(`Headed mode: ${headed}`);

  const { page, freeFn } = await launchPuppeteerPage(
    {
      url: targetUrl,
      viewportWidth,
      viewportHeight,
    },
    {
      headed,
      keepWindow: headed,
    },
  );

  const agent = new PuppeteerAgent(page, {
    cacheId,
  });

  const preferredPort = parseNumber(
    args.port || process.env.PLAYGROUND_PORT,
    5807,
  );
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logStep(`Port ${preferredPort} busy, using ${port} instead`);
  }

  const server = await playgroundForAgent(agent).launch({
    port,
    openBrowser,
    verbose: true,
  });

  logStep(`Playground server ready on http://127.0.0.1:${server.port}`);
  logStep(
    'Frontend auto-connects using PLAYGROUND_UI_SERVER_URL (rebuild if you change it)',
  );

  let shuttingDown = false;
  async function cleanup() {
    if (shuttingDown) return;
    shuttingDown = true;
    logStep('Shutting down playground server...');
    await server.close();
    freeFn.forEach(({ fn }) => {
      try {
        fn();
      } catch (error) {
        console.error('Failed to release resource:', error);
      }
    });
    process.exit(0);
  }

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((error) => {
  console.error('Failed to start real-time playground:', error);
  process.exit(1);
});
