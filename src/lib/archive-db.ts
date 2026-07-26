/**
 * 角色库 + 归档故事的数据层（2.0 阶段1）。
 * 实体定义见 @/types/archive；存储走统一仓库层（未来客户端换文件库后端无感）。
 */
import type { ArchiveCharacter, ArchiveStory, CharacterStatus } from '@/types/archive';
import type { ChatSession, ChatMessage } from '@/types/chat';
import type { STCharacterCard } from '@/lib/png-parser';
import { normalizeCharacterCard } from '@/lib/png-parser';
import { createIdbRepo } from '@/lib/repo/idb-repo';
import { extractModels, estimatePlayTime } from '@/lib/story-meta';

// ---------- 仓库 ----------

const characterRepo = createIdbRepo<ArchiveCharacter>('characters');
const storyRepo = createIdbRepo<ArchiveStory>('archiveStories');

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
