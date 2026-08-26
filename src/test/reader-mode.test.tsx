import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatWorkbench } from '@/components/chat/ChatWorkbench';
import { RegexSidebar } from '@/components/chat/RegexSidebar';
import NovelView from '@/components/reader/NovelView';
import { buildStoryFromSession } from '@/lib/archive-db';
import { getDefaultExportSettings } from '@/lib/session-storage';
import type { ChatSession, RegexRule } from '@/types/chat';

const rule: RegexRule = {
  id: 'reader-rule',
  name: 'Reader rule',
  findRegex: 'secret',
  replaceString: '',
  placement: ['all'],
  disabled: false,
};

const session: ChatSession = {
  id: 'reader-session',
  title: 'Read only story',
  messages: [
    {
      id: 'm1',
      role: 'assistant',
      content: 'A secret paragraph.',
      rawData: {},
    },
  ],
  character: { name: 'Character' },
  user: { name: 'User' },
  createdAt: 1,
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  const originalConsoleError = console.error;
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args: Parameters<typeof console.error>) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    originalConsoleError(...args);
  });
});

afterAll(() => {
  consoleErrorSpy.mockRestore();
});

describe('readerMode capability boundary', () => {
  it('keeps reading tools but removes title and content editing affordances', () => {
    const settings = { ...getDefaultExportSettings(), regexRules: [rule] };
    const html = renderToStaticMarkup(
      <ChatWorkbench
        session={session}
        markers={[]}
        favorites={[]}
        settings={settings}
        onSessionChange={vi.fn()}
        onMarkersChange={vi.fn()}
        onFavoritesChange={vi.fn()}
        onSettingsChange={vi.fn()}
        readerMode
      />,
    );

    expect(html).toContain('外观');
    expect(html).toContain('正则');
    expect(html).toContain('导出');
    expect(html).not.toContain('点击重命名');
    expect(html).not.toContain('章节标记');
    expect(html).not.toContain('编辑本楼');
  });

  it('renders regex rules as inspectable but not editable in read-only mode', () => {
    const html = renderToStaticMarkup(
      <RegexSidebar
        rules={[rule]}
        onRulesChange={vi.fn()}
        isOpen
        readOnly
        onApplyToOriginal={vi.fn()}
      />,
    );

    expect(html).toContain('Reader rule');
    expect(html).toContain('导出正则');
    expect(html).not.toContain('快速添加');
    expect(html).not.toContain('手动添加');
    expect(html).not.toContain('预设管理');
    expect(html).not.toContain('导入正则');
    expect(html).not.toContain('应用到原文');
    expect(html).not.toContain('重置为默认');
    expect(html).not.toContain('删除规则');
  });

  it('keeps long regex content wrapped instead of splitting every character', () => {
    const html = renderToStaticMarkup(
      <RegexSidebar
        rules={[{ ...rule, name: '很长的正则规则名称', findRegex: 'a'.repeat(120) }]}
        onRulesChange={vi.fn()}
        isOpen
        readOnly
      />,
    );
    expect(html).toContain('break-words');
    expect(html).not.toContain('break-all');
  });

  it('keeps novel reading controls but hides write-producing AI actions', () => {
    const story = buildStoryFromSession(session, 'character-1');
    const html = renderToStaticMarkup(
      <NovelView
        session={{
          ...session,
          messages: [{ ...session.messages[0], content: 'A long paragraph. '.repeat(40) }],
        }}
        markers={[]}
        regexRules={[rule]}
        onClose={vi.fn()}
        onMarkersChange={vi.fn()}
        polish={{ story, branchId: null }}
        readOnly
      />,
    );

    expect(html).toContain('小说视图');
    expect(html).toContain('data-novel-spread="true"');
    expect(html).toContain('data-novel-page="left"');
    expect(html).toContain('data-novel-page="right"');
    expect(html).toMatch(/1–2 \/ \d+/);
    expect(html).not.toContain('flex h-full items-center justify-center overflow-y-auto');
    expect(html).not.toContain('AI 章节');
    expect(html).not.toContain('AI 润色本章');
  });
});
