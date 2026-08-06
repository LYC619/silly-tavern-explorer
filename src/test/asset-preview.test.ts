import { describe, expect, it } from 'vitest';
import { buildQuotePreview } from '@/lib/asset-preview';

describe('quote asset preview', () => {
  it('keeps every paragraph instead of truncating after eight', () => {
    const body = Array.from({ length: 10 }, (_, index) => `第 ${index + 1} 段`).join('\n\n');
    const preview = buildQuotePreview(body);
    expect(preview.count).toBe(10);
    expect(preview.entries).toHaveLength(10);
    expect(preview.entries[9].body).toBe('第 10 段');
  });
});
