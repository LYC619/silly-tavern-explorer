import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('角色卡页内嵌阅读器契约', () => {
  it('聊天预览绑定最近的滚动容器，楼层跳转不依赖 window', () => {
    const source = read('src/components/chat/ChatPreview.tsx');
    expect(source).toContain("import { useVirtualizer } from '@tanstack/react-virtual'");
    expect(source).toContain('getScrollElement');
    expect(source).not.toContain('useWindowVirtualizer');
  });

  it('阅读模式隐藏冗余的会话标题统计行，并把导航栏置于阅读器内部', () => {
    const source = read('src/components/chat/ChatWorkbench.tsx');
    expect(source).toContain('readerMode ?');
    expect(source).toContain("position={readerMode ? 'sticky' : 'fixed'}");
    expect(source).not.toContain('navBarLeftClass="left-[29.5rem]"');
  });

  it('置顶栏使用实测高度逐层偏移，不依赖 top-10/top-16 等固定猜测', () => {
    const inline = read('src/components/character/InlineStoryReader.tsx');
    const workbench = read('src/components/chat/ChatWorkbench.tsx');
    const nav = read('src/components/chat/MessageNavBar.tsx');

    expect(inline).toContain('ResizeObserver');
    expect(inline).toContain('}, [storyId, loading]);');
    expect(inline).toContain('readerStickyTop={readerHeaderHeight}');
    expect(workbench).toContain('readerStickyTop?: number');
    expect(workbench).toContain('readerStickyTop + toolbarHeight + 8');
    expect(nav).toContain('stickyTop?: number');
    expect(nav).toContain('style={position ===');
    expect(workbench).not.toContain("readerMode ? 'top-10'");
    expect(nav).not.toContain("'sticky top-16 self-start'");
  });

  it('楼层跳转为上方置顶栏预留滚动空间，使目标楼层顶部完整露出', () => {
    const preview = read('src/components/chat/ChatPreview.tsx');
    const workbench = read('src/components/chat/ChatWorkbench.tsx');

    expect(preview).toContain('scrollPaddingStart?: number');
    expect(preview).toContain('scrollPaddingStart,');
    expect(workbench).toContain('scrollPaddingStart={readerMode ? readerStickyTop + toolbarHeight + 8 : 0}');
  });

  it('小说视图提供嵌入模式，角色卡页不会使用全屏 fixed 根节点', () => {
    const novel = read('src/components/reader/NovelView.tsx');
    const inline = read('src/components/character/InlineStoryReader.tsx');
    expect(novel).toContain('embedded?: boolean');
    expect(novel).toContain('className={embedded');
    expect(inline).toContain('embedded');
    expect(inline).toContain('{novelOpen ? (');
    expect(inline).toMatch(/\)\s*:\s*\(\s*<ChatWorkbench/);
  });

  it('嵌入小说视图按自身面板中线判断翻页方向', () => {
    const novel = read('src/components/reader/NovelView.tsx');
    expect(novel).toContain('event.currentTarget.getBoundingClientRect()');
    expect(novel).toContain('bounds.left + bounds.width / 2');
    expect(novel).not.toContain('event.clientX < window.innerWidth / 2');
  });

  it('NSFW 问号通过 Tooltip 提供完整说明，而不是只依赖原生 title', () => {
    const header = read('src/components/character/CharacterHeader.tsx');
    expect(header).toContain("from '@/components/ui/tooltip'");
    expect(header).toContain('<TooltipContent');
    expect(header).toContain('标记卡面尺度');
  });
});
