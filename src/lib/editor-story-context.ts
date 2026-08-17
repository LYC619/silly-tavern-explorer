export const EDITOR_STORY_CHANGE_EVENT = 'ste-editor-story-change';

const STORAGE_KEY = 'ste-current-editor-story-id';

export type EditorStoryView = 'read' | 'volume' | 'tree';

function normalizeStoryId(value: string | null | undefined): string | null {
  const id = value?.trim();
  if (!id || /[\s/?#]/u.test(id)) return null;
  return id;
}

/** 当前编辑故事是跨页面的轻量 UI 状态，不参与归档数据写入。 */
export function getEditorStoryId(): string | null {
  try {
    return normalizeStoryId(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function setEditorStoryId(value: string | null): void {
  const id = normalizeStoryId(value);
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同窗口事件仍需派发，让内存中的导航保持同步。
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EDITOR_STORY_CHANGE_EVENT, { detail: { storyId: id } }));
  }
}

export function buildEditorStoryPath(storyId: string, view: EditorStoryView): string {
  const id = normalizeStoryId(storyId);
  if (!id) throw new Error('故事 ID 无效');
  return `/story/${encodeURIComponent(id)}?view=${view}`;
}

export function editorStoryPathForNavKey(key: string, storyId: string | null): string | null {
  if (!storyId) return null;
  if (key === 'chat') return buildEditorStoryPath(storyId, 'read');
  if (key === 'summary') return buildEditorStoryPath(storyId, 'volume');
  if (key === 'story-tree') return buildEditorStoryPath(storyId, 'tree');
  return null;
}

export function matchesEditorStoryNav(key: string, pathname: string, search: string): boolean {
  if (!pathname.startsWith('/story/')) return false;
  const view = new URLSearchParams(search).get('view') ?? 'read';
  if (key === 'story-tree') return view === 'tree';
  if (key === 'summary') return view === 'volume' || view === 'diary' || view === 'diy';
  if (key === 'chat') return view === 'read' || view === 'io';
  return false;
}
