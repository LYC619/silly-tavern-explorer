import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EDITOR_STORY_CHANGE_EVENT,
  buildEditorStoryPath,
  editorStoryPathForNavKey,
  getEditorStoryId,
  matchesEditorStoryNav,
  setEditorStoryId,
} from '@/lib/editor-story-context';

afterEach(() => {
  localStorage.clear();
});

describe('当前编辑故事上下文', () => {
  it('读写并广播当前故事，空值会清除', () => {
    const eventSpy = vi.fn();
    window.addEventListener(EDITOR_STORY_CHANGE_EVENT, eventSpy);
    setEditorStoryId('story-42');
    expect(getEditorStoryId()).toBe('story-42');
    expect(eventSpy).toHaveBeenCalledTimes(1);
    setEditorStoryId(null);
    expect(getEditorStoryId()).toBeNull();
    window.removeEventListener(EDITOR_STORY_CHANGE_EVENT, eventSpy);
  });

  it('拒绝空白和非法故事 id，并生成统一深链', () => {
    setEditorStoryId('   ');
    expect(getEditorStoryId()).toBeNull();
    expect(buildEditorStoryPath('abc', 'read')).toBe('/story/abc?view=read');
    expect(buildEditorStoryPath('abc', 'volume')).toBe('/story/abc?view=volume');
    expect(buildEditorStoryPath('abc', 'tree')).toBe('/story/abc?view=tree');
  });

  it('为全局编辑区导航提供同一故事的三个视图', () => {
    expect(editorStoryPathForNavKey('chat', 'abc')).toBe('/story/abc?view=read');
    expect(editorStoryPathForNavKey('summary', 'abc')).toBe('/story/abc?view=volume');
    expect(editorStoryPathForNavKey('story-tree', 'abc')).toBe('/story/abc?view=tree');
    expect(matchesEditorStoryNav('summary', '/story/abc', '?view=diary')).toBe(true);
    expect(matchesEditorStoryNav('story-tree', '/story/abc', '?view=volume')).toBe(false);
  });
});
