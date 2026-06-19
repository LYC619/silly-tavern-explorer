import { describe, it, expect } from 'vitest';
import {
  normalizeCharacterCard,
  parseCharacterCardJson,
  getCharacterName,
  getFirstMessage,
  type STCharacterCard,
} from '@/lib/png-parser';
import { characterBookToWorldBook, isCharacterBook } from '@/lib/character-book';

describe('normalizeCharacterCard — 版本探测', () => {
  it('detects V1 (flat, no spec)', () => {
    const card: STCharacterCard = { name: 'Sera', description: 'd', first_mes: 'hi' };
    const n = normalizeCharacterCard(card);
    expect(n.spec).toBe('v1');
    expect(n.name).toBe('Sera');
    expect(n.description).toBe('d');
    expect(n.firstMessage).toBe('hi');
  });

  it('detects V2 by spec', () => {
    const card: STCharacterCard = {
      spec: 'chara_card_v2', spec_version: '2.0',
      data: { name: 'Bob', description: 'desc', personality: 'kind', scenario: 's', first_mes: 'yo', tags: ['a'] },
    };
    const n = normalizeCharacterCard(card);
    expect(n.spec).toBe('v2');
    expect(n.name).toBe('Bob');
    expect(n.personality).toBe('kind');
    expect(n.tags).toEqual(['a']);
  });

  it('detects V2 when data present but spec missing', () => {
    const card: STCharacterCard = { data: { name: 'X' } };
    expect(normalizeCharacterCard(card).spec).toBe('v2');
  });

  it('detects V3 and reads new fields', () => {
    const card: STCharacterCard = {
      spec: 'chara_card_v3', spec_version: '3.0',
      data: {
        name: 'V3', nickname: 'Vee',
        group_only_greetings: ['hey group'],
        alternate_greetings: ['alt1', 'alt2'],
        assets: [{ type: 'icon', name: 'main', uri: 'embeded://main.png', ext: 'png' }],
      },
    };
    const n = normalizeCharacterCard(card);
    expect(n.spec).toBe('v3');
    expect(n.nickname).toBe('Vee');
    expect(n.groupOnlyGreetings).toEqual(['hey group']);
    expect(n.alternateGreetings).toEqual(['alt1', 'alt2']);
    expect(n.assets).toHaveLength(1);
  });

  it('falls back to safe defaults for missing fields', () => {
    const n = normalizeCharacterCard({ data: {} });
    expect(n.name).toBe('Character');
    expect(n.description).toBe('');
    expect(n.tags).toEqual([]);
    expect(n.alternateGreetings).toEqual([]);
  });
});

describe('legacy accessors stay backward-compatible', () => {
  it('getCharacterName / getFirstMessage work on V2', () => {
    const card: STCharacterCard = { data: { name: 'N', first_mes: 'F' } };
    expect(getCharacterName(card)).toBe('N');
    expect(getFirstMessage(card)).toBe('F');
  });
  it('parseCharacterCardJson parses JSON text', () => {
    const card = parseCharacterCardJson('{"name":"J","first_mes":"hi"}');
    expect(card.name).toBe('J');
  });
});

describe('characterBookToWorldBook — 内嵌世界书映射', () => {
  it('converts a character_book (snake_case + extensions) to WorldBook', () => {
    const book = {
      name: "Sera's World",
      entries: [
        {
          keys: ['castle', 'fortress'],
          secondary_keys: ['dark'],
          comment: 'Castle lore',
          content: 'The castle...',
          enabled: true,
          insertion_order: 100,
          position: 'before_char',
          extensions: { position: 0, depth: 4, exclude_recursion: true, case_sensitive: true },
        },
      ],
    };
    const wb = characterBookToWorldBook(book);
    expect(wb).not.toBeNull();
    const e = wb!.entries['0'];
    expect(e.key).toEqual(['castle', 'fortress']);
    expect(e.keysecondary).toEqual(['dark']);
    expect(e.order).toBe(100);
    expect(e.enabled).toBe(true);
    expect(e.position).toBe(0); // extensions.position 数字优先
    expect(e.excludeRecursion).toBe(true);
    expect(e.caseSensitive).toBe(true);
  });

  it('maps enabled:false → entry.enabled false', () => {
    const wb = characterBookToWorldBook({ entries: [{ keys: ['x'], content: 'c', enabled: false }] });
    expect(wb!.entries['0'].enabled).toBe(false);
  });

  it('handles object-form entries via parseWorldBook', () => {
    const wb = characterBookToWorldBook({ entries: { '0': { uid: 0, key: 'k', content: 'c' } } });
    expect(wb!.entries['0'].key).toEqual(['k']);
  });

  it('returns null for non-book input', () => {
    expect(characterBookToWorldBook(null)).toBeNull();
    expect(characterBookToWorldBook({ foo: 1 })).toBeNull();
  });
});

describe('isCharacterBook', () => {
  it('recognizes by entries array', () => {
    expect(isCharacterBook({ entries: [] })).toBe(true);
  });
  it('recognizes by spec fields', () => {
    expect(isCharacterBook({ scan_depth: 50 })).toBe(true);
  });
  it('rejects plain objects', () => {
    expect(isCharacterBook({ a: 1 })).toBe(false);
    expect(isCharacterBook(null)).toBe(false);
  });
});
