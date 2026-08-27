import type { SummarySurfaceKind } from '@/types/summary';
import { scopedGet, scopedRemove, scopedSet } from '@/lib/vault/vault-scope';

export const EDITOR_STORY_CHANGE_EVENT = 'ste-editor-story-change';

// 这两个键按库隔离（scopedKey）：存的是库内故事 id。
// 跨库共享时换到 B 库会拿着 A 库的 id 去找故事，指向的东西根本不存在——
// 这不是偏好串味，是直接的正确性问题。
const STORAGE_KEY = 'ste-current-editor-story-id';
const SUMMARY_KIND_STORAGE_KEY = 'ste-editor-summary-kind-history';

export type EditorStoryView = 'read' | 'io' | SummarySurfaceKind | 'tree';

const SUMMARY_KINDS = new Set<SummarySurfaceKind>(['volume', 'diary', 'diy', 'mini']);

export function isSummarySurfaceKind(value: string | null | undefined): value is SummarySurfaceKind {
  return !!value && SUMMARY_KINDS.has(value as SummarySurfaceKind);
}

export function parseEditorStoryView(value: string | null | undefined): EditorStoryView | null {
  if (value === 'read' || value === 'io' || value === 'tree' || isSummarySurfaceKind(value)) return value;
  return null;
}

function normalizeStoryId(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || /[\s/?#]/u.test(id)) return null;
  return id;
}

/** 当前编辑故事是跨页面的轻量 UI 状态，不参与归档数据写入。 */
export function getEditorStoryId(): string | null {
  return normalizeStoryId(scopedGet(STORAGE_KEY));
}

export function setEditorStoryId(value: string | null): void {
  const id = normalizeStoryId(value);
  // scoped* 自带 try/catch：存不下时同窗口事件仍需派发，让内存中的导航保持同步。
  if (id) scopedSet(STORAGE_KEY, id);
  else scopedRemove(STORAGE_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EDITOR_STORY_CHANGE_EVENT, { detail: { storyId: id } }));
  }
}

interface SummaryKindMemory {
  storyId: string;
  kind: SummarySurfaceKind;
}

function readSummaryKindHistory(): SummaryKindMemory[] {
  try {
    const parsed = JSON.parse(scopedGet(SUMMARY_KIND_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SummaryKindMemory => {
      if (!item || typeof item !== 'object') return false;
      const entry = item as Partial<SummaryKindMemory>;
      return normalizeStoryId(entry.storyId) !== null && isSummarySurfaceKind(entry.kind);
    });
  } catch {
    return [];
  }
}

export function getEditorSummaryKind(storyId: string): SummarySurfaceKind | null {
  const id = normalizeStoryId(storyId);
  if (!id) return null;
  return readSummaryKindHistory().find((entry) => entry.storyId === id)?.kind ?? null;
}

export function setEditorSummaryKind(storyId: string, kind: SummarySurfaceKind): void {
  const id = normalizeStoryId(storyId);
  if (!id || !isSummarySurfaceKind(kind)) return;
  // 存不下时 URL 仍是权威来源（scopedSet 内部已吞掉异常）。
  const history = readSummaryKindHistory().filter((entry) => entry.storyId !== id);
  scopedSet(SUMMARY_KIND_STORAGE_KEY, JSON.stringify([{ storyId: id, kind }, ...history].slice(0, 50)));
}

export function buildEditorStoryPath(storyId: string, view: EditorStoryView): string {
  const id = normalizeStoryId(storyId);
  if (!id) throw new Error('故事 ID 无效');
  return `/story/${encodeURIComponent(id)}?view=${view}`;
}

export function buildEditorChatPath(storyId: string): string {
  const id = normalizeStoryId(storyId);
  if (!id) throw new Error('故事 ID 无效');
  return `/chat?storyId=${encodeURIComponent(id)}`;
}

/** 显式路由最高优先；共享记忆其次；旧聊天指针只作为迁移兜底。 */
export function resolveEditorStoryId(
  explicitId: string | null | undefined,
  legacyId: string | null | undefined,
): string | null {
  return normalizeStoryId(explicitId) ?? getEditorStoryId() ?? normalizeStoryId(legacyId);
}

export function editorStoryPathForNavKey(key: string, storyId: string | null): string | null {
  if (!storyId) return null;
  if (key === 'chat') return buildEditorChatPath(storyId);
  if (key === 'summary') return buildEditorStoryPath(storyId, getEditorSummaryKind(storyId) ?? 'volume');
  if (key === 'story-tree') return buildEditorStoryPath(storyId, 'tree');
  return null;
}

export function editorDestinationPath(key: string, storyId: string | null, fallback: string): string {
  return editorStoryPathForNavKey(key, storyId) ?? fallback;
}

export function matchesEditorStoryNav(key: string, pathname: string, search: string): boolean {
  if (key === 'chat' && pathname.startsWith('/chat')) return true;
  if (!pathname.startsWith('/story/')) return false;
  const view = new URLSearchParams(search).get('view') ?? 'read';
  if (key === 'story-tree') return view === 'tree';
  if (key === 'summary') return isSummarySurfaceKind(view);
  if (key === 'chat') return view === 'read' || view === 'io';
  return false;
}
