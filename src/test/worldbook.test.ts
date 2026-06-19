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
    expect(out.entries['0'].key).toEqual(['sword', 'shield']);
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
    expect(out.entries['0'].key).toEqual(['k']);
    expect(out.entries['0'].content).toBe('c');
  });

  it('forces record-key === String(uid) even if source key mismatched', () => {
    // 源记录键 "99" 与 uid 5 不一致（ST 拒导入的根因）
    const wb = parseWorldBook({ entries: { '99': { uid: 5, content: 'c' } } });
    const out = JSON.parse(exportWorldBook(wb));
    expect(Object.keys(out.entries)).toEqual(['5']);
    expect(out.entries['5'].uid).toBe(5);
  });

  it('writes ST-style disable (inverted) and drops internal enabled', () => {
    const wb = parseWorldBook({ entries: { '0': { uid: 0, disable: true, content: 'c' } } });
    expect(wb.entries['0'].enabled).toBe(false); // 导入读对
    const out = JSON.parse(exportWorldBook(wb));
    expect(out.entries['0'].disable).toBe(true); // 导出写回 disable
    expect(out.entries['0'].enabled).toBeUndefined(); // 不泄漏内部字段
  });
});

describe('normalizeEntry — ST disable 反义', () => {
  it('reads ST disable:true as enabled:false', () => {
    expect(normalizeEntry({ disable: true }, 0).enabled).toBe(false);
  });
  it('reads ST disable:false as enabled:true', () => {
    expect(normalizeEntry({ disable: false }, 0).enabled).toBe(true);
  });
  it('falls back to enabled field when disable absent', () => {
    expect(normalizeEntry({ enabled: false }, 0).enabled).toBe(false);
  });
  it('defaults to enabled:true when neither present', () => {
    expect(normalizeEntry({}, 0).enabled).toBe(true);
  });
});

describe('normalizeEntry — 老格式字段名 / position', () => {
  it('maps snake_case legacy names to canonical fields', () => {
    const e = normalizeEntry({
      keys: ['a'],
      secondary_keys: ['b'],
      insertion_order: 50,
      case_sensitive: true,
      scan_depth: 10,
      exclude_recursion: true,
      group_weight: 30,
      automation_id: 'auto',
    }, 0);
    expect(e.key).toEqual(['a']);
    expect(e.keysecondary).toEqual(['b']);
    expect(e.order).toBe(50);
    expect(e.caseSensitive).toBe(true);
    expect(e.scanDepth).toBe(10);
    expect(e.excludeRecursion).toBe(true);
    expect(e.groupWeight).toBe(30);
    expect(e.automationId).toBe('auto');
    // 老字段名清理掉，不污染
    expect((e as Record<string, unknown>).keys).toBeUndefined();
    expect((e as Record<string, unknown>).insertion_order).toBeUndefined();
  });

  it('maps string position enums to numbers', () => {
    expect(normalizeEntry({ position: 'before_char' }, 0).position).toBe(0);
    expect(normalizeEntry({ position: 'after_char' }, 0).position).toBe(1);
    expect(normalizeEntry({ position: 'at_depth' }, 0).position).toBe(6);
  });

  it('treats legacy position:-1 as disabled', () => {
    const e = normalizeEntry({ position: -1 }, 0);
    expect(e.enabled).toBe(false);
  });

  it('collapses deprecated selectiveLogic:4 (XOR) to 0', () => {
    expect(normalizeEntry({ selectiveLogic: 4 }, 0).selectiveLogic).toBe(0);
  });

  it('uses entry top-level name as comment fallback (NAI style)', () => {
    expect(normalizeEntry({ name: 'My Memo' }, 0).comment).toBe('My Memo');
  });

  it('preserves comment over name when both present', () => {
    expect(normalizeEntry({ name: 'n', comment: 'c' }, 0).comment).toBe('c');
  });
});

describe('parseKeys — 边界', () => {
  it('filters out null/undefined elements in arrays', () => {
    expect(parseKeys(['a', null, undefined, 'b'] as unknown)).toEqual(['a', 'b']);
  });
  it('keeps regex-style key strings intact (no slash stripping)', () => {
    expect(parseKeys(['/dark.*night/i'])).toEqual(['/dark.*night/i']);
  });
});
