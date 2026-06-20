import { describe, it, expect } from 'vitest';
import { applyEditsToCard, exportCardJson, type CardEdits } from '@/lib/card-export';
import type { STCharacterCard } from '@/lib/png-parser';

const baseEdits: CardEdits = {
  name: 'Seraphina',
  nickname: 'Sera',
  description: 'edited desc',
  personality: 'kind',
  scenario: 'forest',
  firstMessage: 'Hello!',
  messageExample: '<START>',
  creatorNotes: 'note',
  systemPrompt: 'sys',
  postHistoryInstructions: 'jb',
  alternateGreetings: ['alt1', 'alt2'],
  tags: ['fantasy'],
  creator: 'me',
  characterVersion: '2.0',
};

describe('applyEditsToCard — V2', () => {
  it('writes edits into data and preserves unknown fields', () => {
    const raw: STCharacterCard = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: 'Old',
        description: 'old desc',
        extensions: { world: 'MyWorld', fav: true },
        character_book: { entries: [] },
        some_unknown: 'keep me',
      } as Record<string, unknown>,
    };
    const out = applyEditsToCard(raw, baseEdits);
    expect(out.data?.description).toBe('edited desc');
    expect(out.data?.first_mes).toBe('Hello!');
    expect(out.data?.alternate_greetings).toEqual(['alt1', 'alt2']);
    // 未编辑字段保留
    expect(out.data?.extensions).toEqual({ world: 'MyWorld', fav: true });
    expect(out.data?.character_book).toEqual({ entries: [] });
    expect((out.data as Record<string, unknown>).some_unknown).toBe('keep me');
    expect(out.spec).toBe('chara_card_v2');
    expect(out.spec_version).toBe('2.0');
  });

  it('does not mutate the original raw', () => {
    const raw: STCharacterCard = { spec: 'chara_card_v2', data: { name: 'Old', description: 'orig' } };
    applyEditsToCard(raw, baseEdits);
    expect(raw.data?.description).toBe('orig');
  });
});

describe('applyEditsToCard — V3', () => {
  it('preserves V3-only fields (assets/nickname/spec)', () => {
    const raw: STCharacterCard = {
      spec: 'chara_card_v3',
      spec_version: '3.0',
      data: {
        name: 'Old',
        assets: [{ type: 'icon', uri: 'embeded://main.png', name: 'main', ext: 'png' }],
        group_only_greetings: ['g1'],
      } as Record<string, unknown>,
    };
    const out = applyEditsToCard(raw, baseEdits);
    expect(out.spec).toBe('chara_card_v3');
    expect(out.data?.assets).toEqual([{ type: 'icon', uri: 'embeded://main.png', name: 'main', ext: 'png' }]);
    expect((out.data as Record<string, unknown>).group_only_greetings).toEqual(['g1']);
    expect(out.data?.nickname).toBe('Sera');
  });
});

describe('applyEditsToCard — V1 (flat)', () => {
  it('writes edits to top level when no data wrapper', () => {
    const raw: STCharacterCard = { name: 'Old', description: 'old', avatar: 'none' };
    const out = applyEditsToCard(raw, baseEdits);
    expect(out.description).toBe('edited desc');
    expect(out.first_mes).toBe('Hello!');
    expect(out.avatar).toBe('none'); // 未编辑字段保留
    expect(out.data).toBeUndefined();
  });
});

describe('exportCardJson', () => {
  it('serializes with 2-space indent', () => {
    const json = exportCardJson({ spec: 'chara_card_v2', data: { name: 'X' } });
    expect(json).toContain('\n  "spec"');
    expect(JSON.parse(json).data.name).toBe('X');
  });
});
