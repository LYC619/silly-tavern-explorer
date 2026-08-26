import { describe, expect, it } from 'vitest';
import { normalizeStoryTitle } from '@/lib/story-rename';

describe('normalizeStoryTitle', () => {
  it('trims a non-empty title', () => {
    expect(normalizeStoryTitle('  新故事  ')).toBe('新故事');
  });

  it('rejects an empty title', () => {
    expect(() => normalizeStoryTitle('  ')).toThrow('故事名称不能为空');
  });
});
