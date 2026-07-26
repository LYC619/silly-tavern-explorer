/**
 * 角色库 + 归档故事的数据层（2.0 阶段1）。
 * 实体定义见 @/types/archive；存储走统一仓库层（未来客户端换文件库后端无感）。
 */
import type { ArchiveCharacter, ArchiveStory, CharacterStatus, StoryBranch } from '@/types/archive';
import type { ChatSession, ChatMessage, ChapterMarker } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';
import { normalizeCharacterCard } from '@/lib/png-parser';
import { createRepo } from '@/lib/repo';
import { extractModels, estimatePlayTime } from '@/lib/story-meta';

// ---------- 仓库 ----------

const characterRepo = createRepo<ArchiveCharacter>('characters');
const storyRepo = createRepo<ArchiveStory>('archiveStories');

export async function getAllCharacters(): Promise<ArchiveCharacter[]> {
  return characterRepo.list();
}

export async function getCharacter(id: string): Promise<ArchiveCharacter | undefined> {
  return characterRepo.get(id);
}

export async function saveCharacter(item: ArchiveCharacter): Promise<void> {
  return characterRepo.put(item);
}

export async function deleteCharacter(id: string): Promise<void> {
  return characterRepo.remove(id);
}

export async function getAllArchiveStories(): Promise<ArchiveStory[]> {
  return storyRepo.list();
}

export async function getArchiveStory(id: string): Promise<ArchiveStory | undefined> {
  return storyRepo.get(id);
}

export async function saveArchiveStory(item: ArchiveStory): Promise<void> {
  return storyRepo.put(item);
}

export async function deleteArchiveStory(id: string): Promise<void> {
  return storyRepo.remove(id);
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
      ...(patch.session !== undefined ? { session: patch.session, meta: computeStoryMeta(patch.session.messages) } : {}),
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

/** 统一状态的全部取值（顺序即 UI 显示顺序） */
export const CHARACTER_STATUSES: CharacterStatus[] = ['未开始', '进行中', '暂停', '已完成', '已弃置'];

/** ArrayBuffer → 纯 base64（无 data: 前缀），导入 PNG 卡时存原图用 */
export function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
