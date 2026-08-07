/** 存量迁移（10.0）：角色标签/nsfw 回填 + 故事物化字段回填，均幂等 */
import { describe, expect, it } from 'vitest';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { STCharacterCard } from '@/lib/png-parser';
import {
  ARCHIVE_SCHEMA_VERSION,
  migrateCharacterRecord,
  ensureStoryProps,
  needsArchiveMigrationWith,
  runArchiveMigrationWith,
  type ArchiveMigrationDependencies,
} from '@/lib/archive-migrate';

const card = { name: '测试' } as unknown as STCharacterCard;

describe('needsArchiveMigrationWith', () => {
  it('only requests migration for schema versions older than the current version', async () => {
    expect(await needsArchiveMigrationWith(async () => 1)).toBe(true);
    expect(await needsArchiveMigrationWith(async () => ARCHIVE_SCHEMA_VERSION)).toBe(false);
    expect(await needsArchiveMigrationWith(async () => ARCHIVE_SCHEMA_VERSION + 1)).toBe(false);
  });
});

function char(tags: string[], extra: Partial<ArchiveCharacter> = {}): ArchiveCharacter {
  return { id: 'c1', name: '测试', card, tags, status: '未开始', createdAt: 1, updatedAt: 2, ...extra };
}

function story(extra: Partial<ArchiveStory> = {}): ArchiveStory {
  return {
    id: 's1', title: '测试故事',
    session: { title: '测试故事', messages: [{ id: 'm1', role: 'assistant', content: '雨夜书店', timestamp: 1234 }], characters: [] } as unknown as ArchiveStory['session'],
    markers: [], meta: { modelsUsed: [], playTimeMs: null },
    createdAt: 1, updatedAt: 2, ...extra,
  };
}

describe('migrateCharacterRecord', () => {
  it('v1 标签映射 + NSFW 标签回填 nsfw 字段；updatedAt 不变', () => {
    const { record, changed } = migrateCharacterRecord(char(['评价/优秀', '卡面/NSFW']));
    expect(changed).toBe(true);
    expect(record.tags).toEqual(['评价/精品', '卡面/NSFW']);
    expect(record.nsfw).toBe(true);
    expect(record.updatedAt).toBe(2);
  });

  it('v2 形态零变化（幂等，不触发写库）', () => {
    const c = char(['评价/精品', '人物/少女']);
    const { changed } = migrateCharacterRecord(c);
    expect(changed).toBe(false);
  });

  it('已显式设过 nsfw 的不覆盖', () => {
    const { record } = migrateCharacterRecord(char(['卡面/NSFW', '其他/旧'], { nsfw: false }));
    expect(record.nsfw).toBe(false);
  });
});

describe('ensureStoryProps', () => {
  it('缺 wordCount 时回填物化字段；updatedAt 不变', () => {
    const { record, changed } = ensureStoryProps(story());
    expect(changed).toBe(true);
    expect(record.wordCount).toBe(4);
    expect(record.lastMessageAt).toBe(1234);
    expect(record.updatedAt).toBe(2);
  });

  it('已有 wordCount 直接跳过（幂等）', () => {
    const { changed } = ensureStoryProps(story({ wordCount: 4, lastMessageAt: 1234 }));
    expect(changed).toBe(false);
  });
});

describe('runArchiveMigrationWith', () => {
  it('任一记录失败时不写版本号；重跑不重复转换或产生重复数据', async () => {
    const characters = new Map([['c1', char(['评价/优秀'])]]);
    const stories = new Map([['s1', story()]]);
    let version = 1;
    let failStoryOnce = true;
    let characterWrites = 0;
    const deps: ArchiveMigrationDependencies = {
      getSchemaVersion: async () => version,
      setSchemaVersion: async (next) => { version = next; },
      listCharacterIds: async () => [...characters.keys()],
      getCharacter: async (id) => characters.get(id),
      saveCharacter: async (value) => { characterWrites++; characters.set(value.id, value); },
      listStoryIds: async () => [...stories.keys()],
      getStory: async (id) => stories.get(id),
      saveStory: async (value) => {
        if (failStoryOnce) { failStoryOnce = false; throw new Error('story write failed'); }
        stories.set(value.id, value);
      },
    };

    await expect(runArchiveMigrationWith(deps)).rejects.toThrow('story write failed');
    expect(version).toBe(1);
    expect(characters.get('c1')?.tags).toEqual(['评价/精品']);

    const result = await runArchiveMigrationWith(deps);
    expect(version).toBe(ARCHIVE_SCHEMA_VERSION);
    expect(result.charactersMigrated).toBe(0);
    expect(characterWrites).toBe(1);
    expect(characters.get('c1')?.tags).toEqual(['评价/精品']);
    expect(stories.get('s1')?.wordCount).toBe(4);
  });

  it('版本已是当前值时不再扫描或写库', async () => {
    let scanned = false;
    const deps: ArchiveMigrationDependencies = {
      getSchemaVersion: async () => ARCHIVE_SCHEMA_VERSION,
      setSchemaVersion: async () => { throw new Error('不应写版本'); },
      listCharacterIds: async () => { scanned = true; return []; },
      getCharacter: async () => undefined,
      saveCharacter: async () => {},
      listStoryIds: async () => { scanned = true; return []; },
      getStory: async () => undefined,
      saveStory: async () => {},
    };

    expect(await runArchiveMigrationWith(deps)).toEqual({
      characterCount: 0,
      charactersMigrated: 0,
      storiesBackfilled: 0,
      alreadyCurrent: true,
    });
    expect(scanned).toBe(false);
  });
});
