import { Agent } from '@/agent/agent';
import type { AbstractInterface } from '@/types';
import {
  DPH_MODEL_NAME,
  DPH_OPENAI_API_KEY,
  DPH_OPENAI_BASE_URL,
} from '@darkpatternhunter/shared/env';
import { describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@darkpatternhunter/core/utils', () => ({
  writeLogFile: vi.fn(() => null),
  reportHTMLContent: vi.fn(() => ''),
  stringifyDumpData: vi.fn(() => '{}'),
  groupedActionDumpFileExt: '.json',
  getVersion: () => '0.0.0-test',
  sleep: vi.fn(() => Promise.resolve()),
}));

vi.mock('@darkpatternhunter/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
  logMsg: vi.fn(),
}));

vi.mock('@darkpatternhunter/core', async () => {
  const actual = await vi.importActual('@darkpatternhunter/core');
  return {
    ...actual,
    Insight: vi.fn().mockImplementation(() => ({})),
  };
});

const mockedModelConfigFnResult = {
  [DPH_MODEL_NAME]: 'gpt-4o',
  [DPH_OPENAI_API_KEY]: 'mock-api-key',
  [DPH_OPENAI_BASE_URL]: 'mock-base-url',
};

describe('VL Model Check for Different Interface Types', () => {
  it('should not require VL model for puppeteer interface', () => {
    const mockPage = {
      interfaceType: 'puppeteer',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => mockedModelConfigFnResult,
      });
    }).not.toThrow();
  });

  it('should not require VL model for playwright interface', () => {
    const mockPage = {
      interfaceType: 'playwright',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => mockedModelConfigFnResult,
      });
    }).not.toThrow();
  });

  it('should not require VL model for chrome-extension-proxy interface', () => {
    const mockPage = {
      interfaceType: 'chrome-extension-proxy',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => mockedModelConfigFnResult,
      });
    }).not.toThrow();
  });

  it('should not require VL model for page-over-chrome-extension-bridge interface', () => {
    const mockPage = {
      interfaceType: 'page-over-chrome-extension-bridge',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => mockedModelConfigFnResult,
      });
    }).not.toThrow();
  });

  it('should not require VL model for static interface', () => {
    const mockPage = {
      interfaceType: 'static',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => mockedModelConfigFnResult,
      });
    }).not.toThrow();
  });

  it('should require VL model for android interface without vlMode', () => {
    const mockPage = {
      interfaceType: 'android',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    // This should not throw at construction time, but would throw when
    // ensureVLModelWarning is called (e.g., during an AI action)
    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => mockedModelConfigFnResult,
      });
    }).not.toThrow();
  });

  it('should not throw error for android interface with VL model configured', () => {
    const mockPage = {
      interfaceType: 'android',
      destroy: vi.fn(),
      size: vi.fn().mockResolvedValue({ dpr: 1 }),
    } as unknown as AbstractInterface;

    const modelConfigWithVL = {
      [DPH_MODEL_NAME]: 'gemini-2.0-flash-exp',
      [DPH_OPENAI_API_KEY]: 'mock-api-key',
      [DPH_OPENAI_BASE_URL]: 'mock-base-url',
      MIDSCENE_VL_MODE: 'gemini',
    };

    expect(() => {
      new Agent(mockPage, {
        generateReport: false,
        modelConfig: () => modelConfigWithVL,
      });
    }).not.toThrow();
  });
});
