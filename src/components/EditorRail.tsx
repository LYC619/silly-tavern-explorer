/**
 * 编辑区窄工具栏（0816 反馈）：固定在全局侧栏右侧，编辑区内所有页面共用。
 * 聊天处理、总结和故事树共享当前故事；没有记忆时分别回落到各自选择/导入页。
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen, IdCard, MessageSquare, Network, ScrollText, SlidersHorizontal, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_AREAS } from '@/lib/navigation-model';
import {
  EDITOR_STORY_CHANGE_EVENT,
  editorStoryPathForNavKey,
  getEditorStoryId,
  matchesEditorStoryNav,
} from '@/lib/editor-story-context';

const EDITOR_PREFIXES = NAV_AREAS.find((area) => area.key === 'editor')?.prefixes ?? [];

interface RailItem {
  key: string;
  label: string;
  icon: LucideIcon;
  /** 没有当前故事（或本项不吃故事上下文）时的落点 */
  fallbackPath: string;
  /** 命中当前故事时深链进对应故事视图 */
  storyNav?: boolean;
  /** 按路径前缀判定高亮 */
  prefix?: string;
  /** 在 /tools 选择页上按 focus 参数判定高亮 */
  focus?: string;
}

const RAIL_ITEMS: RailItem[] = [
  { key: 'chat', label: '聊天处理', icon: MessageSquare, fallbackPath: '/chat', storyNav: true, prefix: '/chat' },
  { key: 'summary', label: '总结', icon: ScrollText, fallbackPath: '/tools?focus=summary', storyNav: true, focus: 'summary' },
  { key: 'story-tree', label: '故事树', icon: Network, fallbackPath: '/tools?focus=story-tree', storyNav: true, focus: 'story-tree' },
  { key: 'worldbook', label: '世界书', icon: BookOpen, fallbackPath: '/tools?focus=worldbook', prefix: '/worldbook', focus: 'worldbook' },
  { key: 'card', label: '角色卡', icon: IdCard, fallbackPath: '/card-viewer', prefix: '/card-viewer' },
  { key: 'preset', label: '预设', icon: SlidersHorizontal, fallbackPath: '/tools?focus=preset', prefix: '/preset', focus: 'preset' },
];

export function EditorRail() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const [storyId, setStoryId] = useState<string | null>(() => getEditorStoryId());

  useEffect(() => {
    const sync = () => setStoryId(getEditorStoryId());
    window.addEventListener(EDITOR_STORY_CHANGE_EVENT, sync);
    return () => window.removeEventListener(EDITOR_STORY_CHANGE_EVENT, sync);
  }, []);

  if (!EDITOR_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  const focusParam = pathname.startsWith('/tools') ? new URLSearchParams(search).get('focus') : null;

  return (
    <nav
      data-editor-rail
      aria-label="编辑区工具"
      className="w-16 shrink-0 overflow-y-auto border-r border-[color:var(--border-subtle)] bg-chrome px-1.5 py-2"
    >
      <div className="flex flex-col gap-1">
        {RAIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = (item.storyNav ? matchesEditorStoryNav(item.key, pathname, search) : false)
            || (item.prefix ? pathname.startsWith(item.prefix) : false)
            || (item.focus ? focusParam === item.focus : false);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate((item.storyNav ? editorStoryPathForNavKey(item.key, storyId) : null) ?? item.fallbackPath)}
              title={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex w-full flex-col items-center gap-1 rounded-md px-1 py-2 transition-colors',
                active
                  ? 'bg-[var(--brand-active-bg)] text-brand'
                  : 'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
              )}
            >
              {active && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full bg-brand-accent" />}
              <Icon className="w-[18px] h-[18px]" />
              <span className="whitespace-nowrap text-[10px] leading-none">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
