/**
 * 存量数据迁移（10.0，0801 整改）：增量幂等，App 启动后台跑一次。
 * - 角色：v1 标签 → v2 分类法（migrateLegacyTags）；'卡面/NSFW' 标签在场时回填 nsfw 字段
 * - 故事：wordCount / lastMessageAt 物化回填（缺字段才算，此后由 archive-db 保存路径增量维护）
 * 幂等依据：迁移函数对 v2 形态输入零变化 → 不写库；不 bump updatedAt（迁移不是用户编辑）。
 * 旧五档 status 不删不转（类型语义对不上）：字段留档，UI 于 10.2/10.3 移除，弹窗说明去向。
 */
import { getAllCharacters, saveCharacter, getAllArchiveStories, saveArchiveStory } from '@/lib/archive-db';
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

export async function runArchiveMigration(): Promise<MigrationResult> {
  const [characters, stories] = await Promise.all([getAllCharacters(), getAllArchiveStories()]);
  let charactersMigrated = 0;
  for (const c of characters) {
    const { record, changed } = migrateCharacterRecord(c);
    if (changed) {
      await saveCharacter(record);
      charactersMigrated++;
    }
  }
  let storiesBackfilled = 0;
  for (const s of stories) {
    const { record, changed } = ensureStoryProps(s);
    if (changed) {
      await saveArchiveStory(record);
      storiesBackfilled++;
    }
  }
  return { characterCount: characters.length, charactersMigrated, storiesBackfilled };
}
