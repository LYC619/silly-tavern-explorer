import { describe, expect, it } from 'vitest';
import type { WorldBook } from '@/types/worldbook';
import { requireNonEmptyWorldBook } from '@/lib/character-import';

describe('character import validation', () => {
  it('rejects a world book with zero entries', () => {
    expect(() => requireNonEmptyWorldBook({ entries: {} })).toThrow('没有任何世界书条目');
  });

  it('accepts a world book with entries', () => {
    const book = { entries: { a: {} } } as unknown as WorldBook;
    expect(requireNonEmptyWorldBook(book)).toBe(book);
  });
});
