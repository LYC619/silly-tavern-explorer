import { describe, it, expect } from 'vitest';
import {
  parseKeys,
  normalizeEntry,
  parseWorldBook,
  exportWorldBook,
  DEFAULT_ENTRY,
} from '@/types/worldbook';

describe('parseKeys', () => {
  it('splits a comma-separated string into trimmed keys', () => {
    expect(parseKeys('alpha, beta ,  gamma')).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('passes through an array, trimming and dropping empties', () => {
    expect(parseKeys(['  a ', '', 'b'])).toEqual(['a', 'b']);
  });

  it('returns empty array for empty string', () => {
    expect(parseKeys('')).toEqual([]);
  });
});

describe('normalizeEntry', () => {
  it('fills missing fields from DEFAULT_ENTRY and sets uid', () => {
    const entry = normalizeEntry({}, 7);
    expect(entry.uid).toBe(7);
    expect(entry.position).toBe(DEFAULT_ENTRY.position);
    expect(entry.order).toBe(DEFAULT_ENTRY.order);
    expect(entry.enabled).toBe(true);
    expect(entry.key).toEqual([]);
  });

  it('parses comma-separated key strings into arrays', () => {
    const entry = normalizeEntry({ key: 'sword, shield', keysecondary: 'metal' }, 1);
    expect(entry.key).toEqual(['sword', 'shield']);
    expect(entry.keysecondary).toEqual(['metal']);
  });

  it('preserves explicit false/0 values rather than overriding with defaults', () => {
    const entry = normalizeEntry({ enabled: false, selective: false, order: 0 }, 2);
    expect(entry.enabled).toBe(false);
    expect(entry.selective).toBe(false);
    expect(entry.order).toBe(0);
  });

  it('keeps unknown passthrough fields', () => {
    const entry = normalizeEntry({ someFutureField: 'keep-me' }, 3);
    expect(entry.someFutureField).toBe('keep-me');
  });
});

describe('parseWorldBook', () => {
  it('parses entries given as a uid-keyed object', () => {
    const wb = parseWorldBook({
      name: 'Test Book',
      entries: {
        '0': { uid: 0, key: 'a', content: 'A' },
        '1': { uid: 1, key: 'b', content: 'B' },
      },
    });
    expect(Object.keys(wb.entries)).toHaveLength(2);
    expect(wb.entries['0'].content).toBe('A');
    expect(wb.entries['1'].key).toEqual(['b']);
  });

  it('parses entries given as an array, indexing by uid', () => {
    const wb = parseWorldBook({
      entries: [
        { uid: 5, key: 'x', content: 'X' },
        { uid: 9, key: 'y', content: 'Y' },
      ],
    });
    expect(wb.entries['5'].content).toBe('X');
    expect(wb.entries['9'].content).toBe('Y');
  });

  it('preserves top-level data (minus entries) in originalData for round-trip', () => {
    const wb = parseWorldBook({
      name: 'My Book',
      description: 'desc',
      entries: { '0': { uid: 0, content: 'c' } },
    });
    expect(wb.originalData?.name).toBe('My Book');
    expect(wb.originalData?.description).toBe('desc');
    expect(wb.originalData?.entries).toBeUndefined();
  });
});

describe('exportWorldBook (round-trip)', () => {
  it('re-emits keys joined back to comma-strings', () => {
    const wb = parseWorldBook({
      entries: { '0': { uid: 0, key: ['sword', 'shield'], content: 'c' } },
    });
    const out = JSON.parse(exportWorldBook(wb));
    expect(out.entries['0'].key).toBe('sword, shield');
  });

  it('preserves top-level metadata through parse → export', () => {
    const source = {
      name: 'RoundTrip',
      description: 'd',
      entries: { '0': { uid: 0, key: 'k', content: 'c' } },
    };
    const out = JSON.parse(exportWorldBook(parseWorldBook(source)));
    expect(out.name).toBe('RoundTrip');
    expect(out.description).toBe('d');
    expect(out.entries['0'].key).toBe('k');
    expect(out.entries['0'].content).toBe('c');
  });
});
