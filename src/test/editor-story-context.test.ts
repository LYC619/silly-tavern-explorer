import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EDITOR_STORY_CHANGE_EVENT,
  buildEditorChatPath,
  buildEditorStoryPath,
  editorDestinationPath,
  editorStoryPathForNavKey,
  getEditorSummaryKind,
  getEditorStoryId,
  matchesEditorStoryNav,
  parseEditorStoryView,
  resolveEditorStoryId,
  setEditorSummaryKind,
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
    expect(buildEditorChatPath('abc')).toBe('/chat?storyId=abc');
    expect(editorStoryPathForNavKey('chat', 'abc')).toBe('/chat?storyId=abc');
    expect(editorStoryPathForNavKey('summary', 'abc')).toBe('/story/abc?view=volume');
    expect(editorStoryPathForNavKey('story-tree', 'abc')).toBe('/story/abc?view=tree');
    expect(editorDestinationPath('summary', 'abc', '/tools?focus=summary')).toBe('/story/abc?view=volume');
    expect(editorDestinationPath('worldbook', 'abc', '/tools?focus=worldbook')).toBe('/tools?focus=worldbook');
    expect(matchesEditorStoryNav('chat', '/chat', '?storyId=abc')).toBe(true);
    expect(matchesEditorStoryNav('summary', '/story/abc', '?view=diary')).toBe(true);
    expect(matchesEditorStoryNav('story-tree', '/story/abc', '?view=volume')).toBe(false);
  });

  it('记住每个故事的总结二级类型，并支持小总结深链与高亮', () => {
    setEditorSummaryKind('abc', 'diary');
    expect(getEditorSummaryKind('abc')).toBe('diary');
    expect(editorStoryPathForNavKey('summary', 'abc')).toBe('/story/abc?view=diary');

    setEditorSummaryKind('abc', 'mini');
    expect(getEditorSummaryKind('abc')).toBe('mini');
    expect(buildEditorStoryPath('abc', 'mini')).toBe('/story/abc?view=mini');
    expect(parseEditorStoryView('mini')).toBe('mini');
    expect(matchesEditorStoryNav('summary', '/story/abc', '?view=mini')).toBe(true);
  });

  it('显式故事优先，其次共享记忆，最后兼容旧聊天指针', () => {
    setEditorStoryId('remembered');
    expect(resolveEditorStoryId('explicit', 'legacy')).toBe('explicit');
    expect(resolveEditorStoryId(null, 'legacy')).toBe('remembered');
    setEditorStoryId(null);
    expect(resolveEditorStoryId(null, 'legacy')).toBe('legacy');
    expect(resolveEditorStoryId('bad/id', 'legacy')).toBe('legacy');
  });
});
