/**
 * 角色库 + 归档故事的数据层（2.0 阶段1）。
 * 实体定义见 @/types/archive；存储走统一仓库层（未来客户端换文件库后端无感）。
 */
import type { ArchiveCharacter, ArchiveStory, CharacterStatus, CharacterType, StoryStatus, StoryBranch } from '@/types/archive';
import type { ChatSession, ChatMessage, ChapterMarker } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';
import { normalizeCharacterCard } from '@/lib/png-parser';
import { createRepo, getCurrentRepo } from '@/lib/repo';
import { extractModels, estimatePlayTime, computeStoryProps } from '@/lib/story-meta';
import { KeyedSerialQueue } from '@/lib/keyed-serial-queue';
import { bytesToBase64 } from '@/lib/utils';
import {
  normalizeLibraryTagPreferences,
  type LibraryTagPreferences,
} from '@/lib/library-tag-preferences';

// ---------- 仓库 ----------

const characterRepo = createRepo<ArchiveCharacter>('characters');
const storyRepo = createRepo<ArchiveStory>('archiveStories');
interface ArchiveMetaRecord {
  id: string;
  schemaVersion: number;
  updatedAt: number;
  libraryTags?: LibraryTagPreferences;
  [key: string]: unknown;
}
const archiveMetaRepo = createRepo<ArchiveMetaRecord>('archiveMeta');
const characterWrites = new KeyedSerialQueue();
const storyWrites = new KeyedSerialQueue();

export async function getAllCharacters(): Promise<ArchiveCharacter[]> {
  return characterRepo.list();
}

export async function getCharacter(id: string): Promise<ArchiveCharacter | undefined> {
  return characterRepo.get(id);
}

export async function saveCharacter(item: ArchiveCharacter): Promise<void> {
  const repo = getCurrentRepo<ArchiveCharacter>('characters');
  return characterWrites.enqueue(item.id, () => repo.put(item));
}

export async function updateCharacter(
  id: string,
  updater: (current: ArchiveCharacter) => Partial<ArchiveCharacter> | undefined | Promise<Partial<ArchiveCharacter> | undefined>,
): Promise<ArchiveCharacter | undefined> {
  const repo = getCurrentRepo<ArchiveCharacter>('characters');
  return characterWrites.enqueue(id, async () => {
    const current = await repo.get(id);
    if (!current) return undefined;
    const patch = await updater(current);
    if (!patch) return current;
    const next: ArchiveCharacter = { ...current, ...patch, id: current.id };
    // patch 没碰 pngBase64 → 卡片.png 不必重写（markCharacterViewed 这类只盖时间戳的改动）
    await repo.put(next, { derivedUnchanged: next.pngBase64 === current.pngBase64 });
    return next;
  });
}

/** 记录角色页访问；复用角色写入队列，且不把访问行为计为内容修改。 */
export async function markCharacterViewed(id: string, viewedAt = Date.now()): Promise<ArchiveCharacter | undefined> {
  return updateCharacter(id, () => ({ lastViewedAt: viewedAt }));
}

export async function deleteCharacter(id: string): Promise<void> {
  const repo = getCurrentRepo<ArchiveCharacter>('characters');
  return characterWrites.enqueue(id, () => repo.remove(id));
}

export async function getAllArchiveStories(): Promise<ArchiveStory[]> {
  return storyRepo.list();
}

export async function getArchiveStory(id: string): Promise<ArchiveStory | undefined> {
  return storyRepo.get(id);
}

export async function saveArchiveStory(item: ArchiveStory): Promise<void> {
  const repo = getCurrentRepo<ArchiveStory>('archiveStories');
  return storyWrites.enqueue(item.id, () => repo.put(item));
}

/**
 * 按故事 ID 串行应用局部修改。updater 在队列内读取最新记录，避免并发页面用旧快照整对象覆盖彼此的字段。
 *
 * patch 没碰 session/branches 时告知后端跳过派生的 ST 工作版（聊天.jsonl / 分支·*.jsonl）：
 * 「打开故事盖个 lastViewedAt」不该把主线加每条分支整体重新序列化一遍。
 * 判据是引用比较，只在 patch 确实没带这两个字段时才成立——宁可多写一次，不会漏写。
 */
export async function updateArchiveStory(
  id: string,
  updater: (current: ArchiveStory) => Partial<ArchiveStory> | undefined | Promise<Partial<ArchiveStory> | undefined>,
): Promise<ArchiveStory | undefined> {
  const repo = getCurrentRepo<ArchiveStory>('archiveStories');
  return storyWrites.enqueue(id, async () => {
    const current = await repo.get(id);
    if (!current) return undefined;
    const patch = await updater(current);
    if (!patch) return current;
    const next: ArchiveStory = { ...current, ...patch, id: current.id };
    const derivedUnchanged = next.session === current.session && next.branches === current.branches;
    await repo.put(next, { derivedUnchanged });
    return next;
  });
}

export async function deleteArchiveStory(id: string): Promise<void> {
  const repo = getCurrentRepo<ArchiveStory>('archiveStories');
  return storyWrites.enqueue(id, () => repo.remove(id));
}

const ARCHIVE_SCHEMA_META_ID = 'archive-schema';
/** 元信息记录是 read-modify-write，统一排队防止 schemaVersion 与标签偏好并发互相覆盖。 */
const metaWrites = new KeyedSerialQueue();

export async function getArchiveSchemaVersion(): Promise<number> {
  return (await archiveMetaRepo.get(ARCHIVE_SCHEMA_META_ID))?.schemaVersion ?? 1;
}

export async function setArchiveSchemaVersion(schemaVersion: number): Promise<void> {
  const repo = getCurrentRepo<ArchiveMetaRecord>('archiveMeta');
  return metaWrites.enqueue(ARCHIVE_SCHEMA_META_ID, async () => {
    const current = await repo.get(ARCHIVE_SCHEMA_META_ID);
    await repo.put({
      ...current,
      id: ARCHIVE_SCHEMA_META_ID,
      schemaVersion,
      updatedAt: Date.now(),
    });
  });
}

export async function getLibraryTagPreferences(): Promise<LibraryTagPreferences> {
  const current = await archiveMetaRepo.get(ARCHIVE_SCHEMA_META_ID);
  return normalizeLibraryTagPreferences(current?.libraryTags);
}

export async function saveLibraryTagPreferences(preferences: LibraryTagPreferences): Promise<void> {
  const repo = getCurrentRepo<ArchiveMetaRecord>('archiveMeta');
  return metaWrites.enqueue(ARCHIVE_SCHEMA_META_ID, async () => {
    const current = await repo.get(ARCHIVE_SCHEMA_META_ID);
    await repo.put({
      ...current,
      id: ARCHIVE_SCHEMA_META_ID,
      schemaVersion: current?.schemaVersion ?? 1,
      libraryTags: normalizeLibraryTagPreferences(preferences),
      updatedAt: Date.now(),
    });
  });
}

/** 某角色名下的全部故事（未排序，展示排序用 sortStoriesForDisplay） */
export async function getStoriesByCharacter(characterId: string): Promise<ArchiveStory[]> {
  const all = await storyRepo.list();
  return all.filter((s) => s.characterId === characterId);
}

export function generateCharacterId(): string {
  return `char_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function generateArchiveStoryId(): string {
  return `astory_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------- 实体构建 ----------

/**
 * 从角色卡构建角色库条目（定稿第四章）。
 * subtitle 取 creator_notes 首行（通常是作者的一句话介绍）；标签取卡内 tags 作初始 STE 标签的参考，
 * 但 STE 本地标签独立维护（不写回卡），初始为空。
 */
export function buildCharacterFromCard(card: STCharacterCard, pngBase64?: string): ArchiveCharacter {
  const n = normalizeCharacterCard(card);
  const now = Date.now();
  return {
    id: generateCharacterId(),
    name: n.name || '未命名角色',
    subtitle: n.creatorNotes.split('\n')[0]?.trim().slice(0, 80) || undefined,
    card,
    pngBase64,
    tags: [],
    status: '未开始',
    createdAt: now,
    updatedAt: now,
  };
}

/** 计算/刷新故事的归档元数据（导入与再导入时调用） */
export function computeStoryMeta(messages: ChatMessage[]): ArchiveStory['meta'] {
  const { modelsUsed, lastModel } = extractModels(messages);
  const play = estimatePlayTime(messages);
  return {
    modelsUsed,
    lastModel,
    playTimeMs: play ? play.totalMs : null,
    sessionCount: play?.sessionCount,
  };
}

/** 从聊天会话构建归档故事；characterId 省略 = 未绑定（临时） */
export function buildStoryFromSession(session: ChatSession, characterId?: string): ArchiveStory {
  const now = Date.now();
  return {
    id: generateArchiveStoryId(),
    characterId,
    title: session.title || '未命名故事',
    session,
    markers: [],
    meta: computeStoryMeta(session.messages),
    ...computeStoryProps(session.messages),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------- 分支（定稿第五章：分支=同故事脉络，主线=故事本体字段） ----------

export function generateBranchId(): string {
  return `branch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function buildBranchFromSession(session: ChatSession, name: string): StoryBranch {
  const now = Date.now();
  return {
    id: generateBranchId(),
    name: name || session.title || '未命名分支',
    session,
    markers: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** 一条脉络（主线或分支）的可编辑数据切片；settings 是故事级共享的，不在切片里 */
export interface BranchLine {
  session: ChatSession;
  markers: ChapterMarker[];
  favorites: string[];
  lastFloor?: number;
}

/** 取某条脉络的数据切片；branchId=null 为主线；分支不存在返回 undefined */
export function getBranchLine(story: ArchiveStory, branchId: string | null): BranchLine | undefined {
  if (branchId === null) {
    return { session: story.session, markers: story.markers, favorites: story.favorites ?? [], lastFloor: story.lastFloor };
  }
  const b = story.branches?.find((x) => x.id === branchId);
  return b ? { session: b.session, markers: b.markers, favorites: b.favorites ?? [], lastFloor: b.lastFloor } : undefined;
}

/** 取最近查看的脉络；旧归档或失效分支记录均回退主线。 */
export function getLastViewedLine(story: ArchiveStory): { branchId: string | null; line: BranchLine } {
  const branchId = story.lastViewedBranchId ?? null;
  const line = getBranchLine(story, branchId);
  if (line) return { branchId, line };
  return { branchId: null, line: getBranchLine(story, null)! };
}

/** null means an explicit mainline request; undefined restores the last valid line. */
export function resolveInitialBranchId(
  story: ArchiveStory,
  requestedBranchId: string | null | undefined,
): string | null {
  if (requestedBranchId === null) return null;
  if (requestedBranchId && getBranchLine(story, requestedBranchId)) return requestedBranchId;
  return getLastViewedLine(story).branchId;
}

/**
 * 把某条脉络的修改写回故事（返回新对象，不改入参）。
 * 内容变化（session/markers/favorites）才 bump updatedAt——lastFloor 只是阅读位置，不算内容修改；
 * 主线 session 变化时同步重算 meta（模型/时长）。分支不存在时原样返回。
 */
export function updateBranchLine(story: ArchiveStory, branchId: string | null, patch: Partial<BranchLine>): ArchiveStory {
  const touchesContent = patch.session !== undefined || patch.markers !== undefined || patch.favorites !== undefined;
  const now = Date.now();
  if (branchId === null) {
    return {
      ...story,
      ...(patch.session !== undefined
        ? { session: patch.session, meta: computeStoryMeta(patch.session.messages), ...computeStoryProps(patch.session.messages) }
        : {}),
      ...(patch.markers !== undefined ? { markers: patch.markers } : {}),
      ...(patch.favorites !== undefined ? { favorites: patch.favorites } : {}),
      ...(patch.lastFloor !== undefined ? { lastFloor: patch.lastFloor } : {}),
      ...(touchesContent ? { updatedAt: now } : {}),
    };
  }
  if (!story.branches?.some((b) => b.id === branchId)) return story;
  return {
    ...story,
    branches: story.branches.map((b) =>
      b.id === branchId
        ? {
            ...b,
            ...(patch.session !== undefined ? { session: patch.session } : {}),
            ...(patch.markers !== undefined ? { markers: patch.markers } : {}),
            ...(patch.favorites !== undefined ? { favorites: patch.favorites } : {}),
            ...(patch.lastFloor !== undefined ? { lastFloor: patch.lastFloor } : {}),
            ...(touchesContent ? { updatedAt: now } : {}),
          }
        : b,
    ),
    ...(touchesContent ? { updatedAt: now } : {}),
  };
}

// ---------- 展示规则（定稿第四章） ----------

/**
 * 故事列表排序：有查看记录的按最近查看在前；都没看过的按创建时间升序（≈故事编号）排在后面。
 * （初次导入全部无记录 → 全按创建序；开始翻看后，看过的浮到前面。）
 */
export function sortStoriesForDisplay(stories: ArchiveStory[]): ArchiveStory[] {
  const viewed = stories.filter((s) => s.lastViewedAt !== undefined).sort((a, b) => b.lastViewedAt! - a.lastViewedAt!);
  const fresh = stories.filter((s) => s.lastViewedAt === undefined).sort((a, b) => a.createdAt - b.createdAt);
  return [...viewed, ...fresh];
}

/** @deprecated 五档状态 10.0 起废弃（→ 角色类型 + 故事状态），暂留供迁移弹窗文案与旧档案读取 */
export const CHARACTER_STATUSES: CharacterStatus[] = ['未开始', '进行中', '暂停', '已完成', '已弃置'];

/** 角色类型全部取值（10.0，互斥；顺序即 UI 显示顺序） */
export const CHARACTER_TYPES: CharacterType[] = ['人物', '剧情', '玩法', '综合', '同人'];

/** 故事状态全部取值（10.0，四档；顺序即 UI 显示顺序） */
export const STORY_STATUSES: StoryStatus[] = ['未开始', '进行中', '已完结', '已搁置'];

/** ArrayBuffer → 纯 base64（无 data: 前缀），导入 PNG 卡时存原图用 */
export function abToBase64(buf: ArrayBuffer): string {
  return bytesToBase64(buf);
}
