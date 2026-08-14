import { describe, expect, it } from 'vitest';
import type { ArchiveCharacter } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';
import { applyCharacterTagPatch, applyCharacterTypePatch } from '@/lib/character-tag-domain';

const card = {} as STCharacterCard;

function character(extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return {
    id: 'c1', name: '测试', card, tags: [], status: '未开始', createdAt: 1, updatedAt: 1, ...extra,
  };
}

describe('character tag domain', () => {
  it('keeps the NSFW field and tag synchronized in both directions', () => {
    expect(applyCharacterTagPatch(character(), { tags: ['卡面/NSFW'] })).toMatchObject({
      tags: ['卡面/NSFW'], nsfw: true,
    });
    expect(applyCharacterTagPatch(character({ tags: ['卡面/NSFW'], nsfw: true }), { nsfw: false })).toMatchObject({
      tags: [], nsfw: false,
    });
  });

  it('derives one mutually exclusive rating tier from a rating', () => {
    expect(applyCharacterTagPatch(character({ tags: ['评价/低创', '人物/少女'] }), { rating: 8 })).toMatchObject({
      tags: ['人物/少女', '评价/精品'], rating: 8,
    });
    expect(() => applyCharacterTagPatch(
      character({ tags: ['评价/精品'], rating: 8 }),
      { tags: ['评价/神作'] },
    )).toThrow('评价档位');
  });

  it('rejects unknown rating tiers instead of storing an invalid label', () => {
    expect(() => applyCharacterTagPatch(character(), { tags: ['评价/神作'] })).toThrow('评价档位');
  });

  it('stores Type in the mutually exclusive field and removes malformed legacy Type tags', () => {
    expect(applyCharacterTypePatch(
      character({ tags: ['类型/剧情', '人物/少女'], type: '剧情' }),
      '人物',
    )).toEqual({ type: '人物', tags: ['人物/少女'] });
  });
});
