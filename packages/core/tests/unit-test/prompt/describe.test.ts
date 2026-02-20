import { elementDescriberInstruction } from '@/ai-model/prompt/describe';
import { describe, expect, it, vi } from 'vitest';

describe('elementDescriberInstruction', () => {
  vi.mock('@darkpatternhunter/shared/env', () => ({
    getPreferredLanguage: vi.fn().mockReturnValue('English'),
  }));

  it('should return the correct instruction', () => {
    expect(elementDescriberInstruction()).toMatchSnapshot();
  });
});
