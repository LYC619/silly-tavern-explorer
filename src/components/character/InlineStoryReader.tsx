/**
 * 就地阅读（10.3b，对照 character-detail.html）：在角色页故事 tab 内打开正文。
 * - 顶部：返回故事列表 + 故事名下拉切换（含分支）+ 状态 chip + 「在编辑器中打开」
 * - 正文：ChatWorkbench readerMode（保留 外观/搜索/楼层跳转/正则/导出/小说视图；
 *   无章节标记钮、无沉浸阅读钮——插图4 保留清单）
 * - 持久化沿用工作区模式：dirty+防抖 600ms，卸载兜底补存；lastViewedAt/lastFloor 照记
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
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
import {
  getArchiveStory, updateArchiveStory, getBranchLine, updateBranchLine,
} from '@/lib/archive-db';
import { getDefaultExportSettings } from '@/lib/session-storage';
import { StoryDraftSaver, flushBeforeStoryTransition } from '@/lib/story-draft-save';
import { useToast } from '@/hooks/use-toast';
import { LOADING_LABEL } from '@/lib/ui-copy';

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
  const { toast } = useToast();
  const [story, setStory] = useState<ArchiveStory | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [novelOpen, setNovelOpen] = useState(false);
  const workbenchRef = useRef<ChatWorkbenchHandle>(null);
  const readerHeaderRef = useRef<HTMLDivElement>(null);
  const [readerHeaderHeight, setReaderHeaderHeight] = useState(0);

  useLayoutEffect(() => {
    const header = readerHeaderRef.current;
    if (!header) return;
    const measure = () => setReaderHeaderHeight(header.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, [storyId, loading]);

  const storyRef = useRef<ArchiveStory | null>(null);
  const saverRef = useRef(new StoryDraftSaver(updateArchiveStory));
  const mutateStory = useCallback((fn: (cur: ArchiveStory) => ArchiveStory) => {
    const current = storyRef.current;
    if (!current) return;
    const next = fn(current);
    if (next === current) return;
    storyRef.current = next;
    saverRef.current.queueMutation(current.id, (latest) => fn(latest));
    setStory(next);
  }, []);

  useEffect(() => {
    if (!story || !saverRef.current.isDirty()) return;
    const t = setTimeout(() => {
      void saverRef.current.flush().catch((error: unknown) => {
        toast({
          title: '保存故事失败',
          description: error instanceof Error ? error.message : '请检查库目录是否可写',
          variant: 'destructive',
        });
      });
    }, 600);
    return () => clearTimeout(t);
  }, [story, toast]);
  useEffect(() => () => {
    void saverRef.current.flush().catch(() => {});
  }, []);

  // 加载 + 记 lastViewedAt（切换故事 id 时重挂）
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const s = await getArchiveStory(storyId);
        if (cancelled) return;
        if (!s) {
          storyRef.current = null;
          setStory(null);
          return;
        }
        const restoredBranchId =
          (initialBranchId && s.branches?.some((b) => b.id === initialBranchId) ? initialBranchId : null)
          ?? (s.lastViewedBranchId && s.branches?.some((b) => b.id === s.lastViewedBranchId)
            ? s.lastViewedBranchId
            : null);
        setBranchId(restoredBranchId);
        const viewedAt = Date.now();
        const withView = await updateArchiveStory(s.id, (current) => ({
          settings: current.settings ?? getDefaultExportSettings(),
          lastViewedAt: viewedAt,
          lastViewedBranchId: restoredBranchId ?? undefined,
        }));
        if (cancelled || !withView) return;
        saverRef.current = new StoryDraftSaver(updateArchiveStory);
        storyRef.current = withView;
        setStory(withView);
      } catch (error) {
        if (!cancelled) {
          toast({
            title: '读取故事失败',
            description: error instanceof Error ? error.message : '请稍后重试',
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storyId, initialBranchId, toast]);

  const transitionAfterFlush = useCallback(async (transition: () => void) => {
    try {
      await flushBeforeStoryTransition(saverRef.current, transition);
    } catch (error) {
      toast({
        title: '故事尚未保存，已取消离开',
        description: error instanceof Error ? error.message : '请检查库目录是否可写后重试',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const line = story ? getBranchLine(story, branchId) : undefined;

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
    return <div className="py-16 text-center text-sm text-muted-foreground">{LOADING_LABEL}</div>;
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
      <div ref={readerHeaderRef} data-reader-header className="sticky top-0 z-50 flex items-center gap-2 flex-wrap border-b border-border bg-background/95 py-1.5 backdrop-blur-sm">
        <Button variant="ghost" size="sm" className="px-1.5 text-muted-foreground" onClick={() => void transitionAfterFlush(onBack)}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          故事列表
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="font-display font-semibold max-w-72">
              <span className="truncate" title={story.title}>
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
                  onClick={() => (
                    s.id === story.id
                      ? handleSwitchBranch(null)
                      : void transitionAfterFlush(() => onSwitchStory(s.id))
                  )}
                >
                  <span className="truncate" title={s.title}>{s.title}</span>
                </DropdownMenuItem>
                {/* 当前故事的分支列出在其下（含分支切换） */}
                {s.id === story.id && (story.branches ?? []).map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    className={branchId === b.id ? 'bg-primary/10 text-primary pl-6' : 'pl-6'}
                    onClick={() => handleSwitchBranch(b.id)}
                  >
                    <GitBranch className="w-3.5 h-3.5 mr-1.5 shrink-0 opacity-60" />
                    <span className="truncate" title={b.name}>{b.name}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
          {story.status ?? '未开始'}
        </Badge>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => void transitionAfterFlush(() => onOpenEditor(story.id))} title="进入故事工作区（编辑器）：分支/整理与记录/导入导出">
          <ExternalLink className="w-4 h-4 mr-1.5" />
          在编辑器中打开
        </Button>
      </div>

      <div className="border-b border-border" />

      {/* 小说视图替换普通正文，保持在角色页内；不追加到长聊天底部。 */}
      {novelOpen ? (
        <NovelView
          session={line.session}
          markers={line.markers}
          regexRules={settings.regexRules}
          onClose={() => setNovelOpen(false)}
          favorites={line.favorites}
          onFavoritesChange={handleFavoritesChange}
          initialFloor={line.lastFloor}
          onFloorChange={handleFloorChange}
          progressKey={`${story.id}:${branchId ?? 'main'}`}
          embedded
          readOnly
        />
      ) : (
        <ChatWorkbench
          key={`${story.id}:${branchId ?? 'trunk'}`}
          ref={workbenchRef}
          session={line.session}
          markers={line.markers}
          favorites={line.favorites}
          settings={settings}
          onFavoritesChange={handleFavoritesChange}
          onSettingsChange={handleSettingsChange}
          onFloorChange={handleFloorChange}
          initialFloor={line.lastFloor}
          readerMode
          readerStickyTop={readerHeaderHeight}
          toolbarExtras={
            <Button variant="outline" size="sm" onClick={() => setNovelOpen(true)} title="小说视图：拆句重排+用户楼层弱化/隐藏+场景分隔（Esc 退出）">
              <BookOpenCheck className="w-4 h-4 mr-1.5" />
              小说视图
            </Button>
          }
        />
      )}
    </div>
  );
}
