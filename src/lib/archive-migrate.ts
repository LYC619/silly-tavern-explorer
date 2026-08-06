/**
 * 存量数据迁移（10.0，0801 整改）：按持久化 schema 版本执行，失败可重试。
 * - 角色：v1 标签 → v2 分类法（migrateLegacyTags）；'卡面/NSFW' 标签在场时回填 nsfw 字段
 * - 故事：wordCount / lastMessageAt 物化回填（缺字段才算，此后由 archive-db 保存路径增量维护）
 * 幂等依据：迁移函数对 v2 形态输入零变化 → 不写库；不 bump updatedAt（迁移不是用户编辑）。
 * 旧五档 status 不删不转（类型语义对不上）：字段留档，UI 于 10.2/10.3 移除，弹窗说明去向。
 */
import {
  getAllCharacters,
  getCharacter,
  saveCharacter,
  getAllArchiveStories,
  getArchiveStory,
  saveArchiveStory,
  getArchiveSchemaVersion,
  setArchiveSchemaVersion,
} from '@/lib/archive-db';
import { migrateLegacyTags, NSFW_TAG } from '@/lib/tag-taxonomy';
import { computeStoryProps } from '@/lib/story-meta';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';

export interface MigrationResult {
  /** 库里角色总数（弹窗条件：>0 才值得说明） */
  characterCount: number;
  /** 标签/nsfw 有实际变化的角色数 */
  charactersMigrated: number;
  /** 回填了物化字段的故事数 */
  storiesBackfilled: number;
  alreadyCurrent: boolean;
}

export const ARCHIVE_SCHEMA_VERSION = 2;

export interface ArchiveMigrationDependencies {
  getSchemaVersion: () => Promise<number>;
  setSchemaVersion: (version: number) => Promise<void>;
  listCharacterIds: () => Promise<string[]>;
  getCharacter: (id: string) => Promise<ArchiveCharacter | undefined>;
  saveCharacter: (value: ArchiveCharacter) => Promise<void>;
  listStoryIds: () => Promise<string[]>;
  getStory: (id: string) => Promise<ArchiveStory | undefined>;
  saveStory: (value: ArchiveStory) => Promise<void>;
}

export function migrateCharacterRecord(c: ArchiveCharacter): { record: ArchiveCharacter; changed: boolean } {
  const { tags, changed: tagsChanged } = migrateLegacyTags(c.tags);
  const nsfwFromTag = tags.includes(NSFW_TAG);
  const nsfwChanged = nsfwFromTag && c.nsfw === undefined;
  if (!tagsChanged && !nsfwChanged) return { record: c, changed: false };
  return {
    record: { ...c, tags, ...(nsfwChanged ? { nsfw: true } : {}) },
    changed: true,
  };
}

export function ensureStoryProps(s: ArchiveStory): { record: ArchiveStory; changed: boolean } {
  if (s.wordCount !== undefined) return { record: s, changed: false };
  return { record: { ...s, ...computeStoryProps(s.session.messages) }, changed: true };
}

export async function runArchiveMigrationWith(deps: ArchiveMigrationDependencies): Promise<MigrationResult> {
  if (await deps.getSchemaVersion() >= ARCHIVE_SCHEMA_VERSION) {
    return {
      characterCount: 0,
      charactersMigrated: 0,
      storiesBackfilled: 0,
      alreadyCurrent: true,
    };
  }

  const [characterIds, storyIds] = await Promise.all([deps.listCharacterIds(), deps.listStoryIds()]);
  let charactersMigrated = 0;
  for (const id of characterIds) {
    const c = await deps.getCharacter(id);
    if (!c) continue;
    const { record, changed } = migrateCharacterRecord(c);
    if (changed) {
      await deps.saveCharacter(record);
      charactersMigrated++;
    }
  }
  let storiesBackfilled = 0;
  for (const id of storyIds) {
    const s = await deps.getStory(id);
    if (!s) continue;
    const { record, changed } = ensureStoryProps(s);
    if (changed) {
      await deps.saveStory(record);
      storiesBackfilled++;
    }
  }
  await deps.setSchemaVersion(ARCHIVE_SCHEMA_VERSION);
  return {
    characterCount: characterIds.length,
    charactersMigrated,
    storiesBackfilled,
    alreadyCurrent: false,
  };
}

export async function runArchiveMigration(): Promise<MigrationResult> {
  return runArchiveMigrationWith({
    getSchemaVersion: getArchiveSchemaVersion,
    setSchemaVersion: setArchiveSchemaVersion,
    listCharacterIds: async () => (await getAllCharacters()).map((c) => c.id),
    getCharacter,
    saveCharacter,
    listStoryIds: async () => (await getAllArchiveStories()).map((s) => s.id),
    getStory: getArchiveStory,
    saveStory: saveArchiveStory,
  });
}
