/**
 * 就地阅读（10.3b，对照 character-detail.html）：在角色页故事 tab 内打开正文。
 * - 顶部：返回故事列表 + 故事名下拉切换（含分支）+ 状态 chip + 「在编辑器中打开」
 * - 正文：ChatWorkbench readerMode（保留 外观/搜索/楼层跳转/正则/导出/小说视图；
 *   无章节标记钮、无沉浸阅读钮——插图4 保留清单）
 * - 持久化沿用工作区模式：dirty+防抖 600ms，卸载兜底补存；lastViewedAt/lastFloor 照记
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, BookOpenCheck, ChevronDown, ExternalLink, GitBranch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatWorkbench, type ChatWorkbenchHandle } from '@/components/chat/ChatWorkbench';
import NovelView from '@/components/reader/NovelView';
import type { ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import {
  getArchiveStory, saveArchiveStory, getBranchLine, updateBranchLine,
} from '@/lib/archive-db';
import { getDefaultExportSettings } from '@/lib/session-storage';

interface InlineStoryReaderProps {
  storyId: string;
  /** 同角色下的全部故事（下拉切换用，按展示序） */
  stories: ArchiveStory[];
  onSwitchStory: (id: string) => void;
  onBack: () => void;
  /** 「在编辑器中打开」→ /story/:id */
  onOpenEditor: (id: string) => void;
  /** 进入时直接打开的分支（列表分支行点入）；不传则恢复上次看的脉络 */
  initialBranchId?: string;
}

export function InlineStoryReader({ storyId, stories, onSwitchStory, onBack, onOpenEditor, initialBranchId }: InlineStoryReaderProps) {
  const [story, setStory] = useState<ArchiveStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [novelOpen, setNovelOpen] = useState(false);
  const workbenchRef = useRef<ChatWorkbenchHandle>(null);

  // 持久化：与工作区同款 dirty+防抖（600ms），卸载兜底补存
  const dirtyRef = useRef(false);
  const storyRef = useRef<ArchiveStory | null>(null);
  useEffect(() => { storyRef.current = story; }, [story]);
  const mutateStory = useCallback((fn: (cur: ArchiveStory) => ArchiveStory) => {
    setStory((cur) => {
      if (!cur) return cur;
      const next = fn(cur);
      if (next !== cur) dirtyRef.current = true;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!story || !dirtyRef.current) return;
    const t = setTimeout(() => {
      dirtyRef.current = false;
      saveArchiveStory(story).catch(() => { dirtyRef.current = true; });
    }, 600);
    return () => clearTimeout(t);
  }, [story]);
  useEffect(() => () => {
    if (dirtyRef.current && storyRef.current) saveArchiveStory(storyRef.current).catch(() => {});
  }, []);

  // 加载 + 记 lastViewedAt（切换故事 id 时重挂）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const s = await getArchiveStory(storyId);
        if (cancelled) return;
        if (!s) { setStory(null); return; }
        const restoredBranchId =
          (initialBranchId && s.branches?.some((b) => b.id === initialBranchId) ? initialBranchId : null)
          ?? (s.lastViewedBranchId && s.branches?.some((b) => b.id === s.lastViewedBranchId)
            ? s.lastViewedBranchId
            : null);
        setBranchId(restoredBranchId);
        const withView: ArchiveStory = {
          ...s,
          settings: s.settings ?? getDefaultExportSettings(),
          lastViewedAt: Date.now(),
          lastViewedBranchId: restoredBranchId ?? undefined,
        };
        setStory(withView);
        saveArchiveStory(withView).catch(() => {});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storyId, initialBranchId]);

  const line = story ? getBranchLine(story, branchId) : undefined;

  const handleSessionChange = useCallback((next: ChatSession) => {
    mutateStory((cur) => {
      let updated = updateBranchLine(cur, branchId, { session: next });
      if (branchId === null && next.title && next.title !== cur.title) {
        updated = { ...updated, title: next.title };
      }
      return updated;
    });
  }, [mutateStory, branchId]);

  const handleMarkersChange = useCallback((next: ArchiveStory['markers']) => {
    mutateStory((cur) => updateBranchLine(cur, branchId, { markers: next }));
  }, [mutateStory, branchId]);

  const handleFavoritesChange = useCallback((next: string[]) => {
    mutateStory((cur) => updateBranchLine(cur, branchId, { favorites: next }));
  }, [mutateStory, branchId]);

  const handleFloorChange = useCallback((floor: number) => {
    mutateStory((cur) => updateBranchLine(cur, branchId, { lastFloor: floor }));
  }, [mutateStory, branchId]);

  const handleSettingsChange = useCallback((next: NonNullable<ArchiveStory['settings']>) => {
    mutateStory((cur) => ({ ...cur, settings: next, updatedAt: Date.now() }));
  }, [mutateStory]);

  const handleSwitchBranch = useCallback((nextBranchId: string | null) => {
    setBranchId(nextBranchId);
    mutateStory((cur) => {
      if ((cur.lastViewedBranchId ?? null) === nextBranchId) return cur;
      return { ...cur, lastViewedBranchId: nextBranchId ?? undefined };
    });
  }, [mutateStory]);

  if (loading) {
    return <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>;
  }
  if (!story || !line) {
    return (
      <div className="py-16 flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">找不到该故事</p>
        <Button variant="outline" size="sm" onClick={onBack}>返回故事列表</Button>
      </div>
    );
  }

  const settings = story.settings ?? getDefaultExportSettings();
  const currentBranchName = branchId !== null
    ? story.branches?.find((b) => b.id === branchId)?.name
    : null;

  return (
    <div className="flex flex-col">
      {/* ===== 阅读顶栏：返回 + 故事名下拉（含分支）+ 状态 + 在编辑器中打开 ===== */}
      <div className="flex items-center gap-2 flex-wrap py-1.5">
        <Button variant="ghost" size="sm" className="px-1.5 text-muted-foreground" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          故事列表
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="font-display font-semibold max-w-72">
              <span className="truncate">
                {story.title}
                {currentBranchName ? ` · ${currentBranchName}` : ''}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto min-w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">切换故事</DropdownMenuLabel>
            {stories.map((s) => (
              <div key={s.id}>
                <DropdownMenuItem
                  className={s.id === story.id && branchId === null ? 'bg-primary/10 text-primary' : ''}
                  onClick={() => (s.id === story.id ? handleSwitchBranch(null) : onSwitchStory(s.id))}
                >
                  <span className="truncate">{s.title}</span>
                </DropdownMenuItem>
                {/* 当前故事的分支列出在其下（含分支切换） */}
                {s.id === story.id && (story.branches ?? []).map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    className={branchId === b.id ? 'bg-primary/10 text-primary pl-6' : 'pl-6'}
                    onClick={() => handleSwitchBranch(b.id)}
                  >
                    <GitBranch className="w-3.5 h-3.5 mr-1.5 shrink-0 opacity-60" />
                    <span className="truncate">{b.name}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
          {story.status ?? '未开始'}
        </Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => onOpenEditor(story.id)} title="进入故事工作区（编辑器）：分支/整理与记录/导入导出">
          <ExternalLink className="w-4 h-4 mr-1.5" />
          在编辑器中打开
        </Button>
      </div>

      <div className="border-b border-border" />

      {/* ===== 正文（key 按 故事+脉络 切换重挂） ===== */}
      <ChatWorkbench
        key={`${story.id}:${branchId ?? 'trunk'}`}
        ref={workbenchRef}
        session={line.session}
        markers={line.markers}
        favorites={line.favorites}
        settings={settings}
        onSessionChange={handleSessionChange}
        onMarkersChange={handleMarkersChange}
        onFavoritesChange={handleFavoritesChange}
        onSettingsChange={handleSettingsChange}
        onFloorChange={handleFloorChange}
        initialFloor={line.lastFloor}
        readerMode
        navBarLeftClass="left-[29.5rem]"
        toolbarExtras={
          <Button variant="outline" size="sm" onClick={() => setNovelOpen(true)} title="小说视图：拆句重排+用户楼层弱化/隐藏+场景分隔（Esc 退出）">
            <BookOpenCheck className="w-4 h-4 mr-1.5" />
            小说视图
          </Button>
        }
      />

      {novelOpen && (
        <NovelView
          session={line.session}
          markers={line.markers}
          regexRules={settings.regexRules}
          onClose={() => setNovelOpen(false)}
          onMarkersChange={handleMarkersChange}
          progressKey={`${story.id}:${branchId ?? 'main'}`}
          polish={{ story, branchId }}
        />
      )}
    </div>
  );
}
