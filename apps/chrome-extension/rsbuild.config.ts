import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSvgr } from '@rsbuild/plugin-svgr';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { version } from '../../packages/visualizer/package.json';

function readDotEnvFile(filePath: string): Record<string, string> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const out: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1]!;
      let value = m[2] ?? '';
      // strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

const localEnv = readDotEnvFile(path.resolve(__dirname, '.env'));

export default defineConfig({
  tools: {
    rspack: {
      watchOptions: {
        ignored: /\.git/,
      },
      plugins: [
        new (require('@rspack/core').ProvidePlugin)({
          React: ['react'],
        }),
      ],
    },
  },
  environments: {
    web: {
      source: {
        entry: {
          index: './src/index.tsx',
          popup: './src/extension/popup/index.tsx',
        },
      },
      output: {
        target: 'web',
        sourceMap: true,
      },
    },
    iife: {
      source: {
        entry: {
          worker: './src/scripts/worker.ts',
          'stop-water-flow': './src/scripts/stop-water-flow.ts',
          'water-flow': './src/scripts/water-flow.ts',
          'event-recorder-bridge': './src/scripts/event-recorder-bridge.ts',
          'guard-highlighter': './src/extension/live-guard/guardHighlighter.ts',
        },
      },
      output: {
        target: 'web-worker',
        sourceMap: true,
        filename: {
          js: '../../scripts/[name].js',
        },
      },
    },
  },
  dev: {
    writeToDisk: true,
  },
  output: {
    polyfill: 'entry',
    injectStyles: true,
    copy: [
      { from: './static', to: './' },
      {
        from: path.resolve(__dirname, '../../packages/shared/dist-inspect'),
        to: 'scripts',
      },
      {
        from: path.resolve(
          __dirname,
          '../../packages/recorder/dist/recorder-iife.js',
        ),
        to: 'scripts',
      },
    ],
    sourceMap: true,
    externals: ['sharp'],
  },
  source: {
    define: {
      __SDK_VERSION__: JSON.stringify(version),
      // Ensure extension bundles actually receive these values (Rspack doesn't auto-load .env here).
      'process.env.REACT_APP_SUPABASE_URL': JSON.stringify(
        process.env.REACT_APP_SUPABASE_URL ?? localEnv.REACT_APP_SUPABASE_URL ?? '',
      ),
      'process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY': JSON.stringify(
        process.env.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
          localEnv.REACT_APP_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
          '',
      ),
      'process.env.REACT_APP_ENABLE_DATASET_CLOUD_SYNC': JSON.stringify(
        process.env.REACT_APP_ENABLE_DATASET_CLOUD_SYNC ??
          localEnv.REACT_APP_ENABLE_DATASET_CLOUD_SYNC ??
          '',
      ),
    },
  },
  resolve: {
    alias: {
      async_hooks: path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
      'node:async_hooks': path.join(
        __dirname,
        '../../packages/shared/src/polyfills/async-hooks.ts',
      ),
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
    },
  },
  plugins: [
    pluginReact(),
    pluginNodePolyfill(),
    pluginLess(),
    pluginSvgr(),
    pluginTypeCheck(),
  ],
});
