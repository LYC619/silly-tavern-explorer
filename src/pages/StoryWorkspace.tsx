/**
 * 故事工作区（2.0 阶段2，定稿第五章）。
 * 共享同一个故事上下文（角色卡/故事/分支/阅读位置），左侧二级栏切换三个一级界面：
 * 阅读与编辑 / 整理与记录（阶段3 已迁入）/ 导入与导出（阶段4 完整，此处先给导出）。
 * 布局铁律：分栏用 flex-wrap + 行内 basis，禁视口断点。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, BookOpenCheck, BookOpenText, NotebookText, ArrowDownUp, MessageSquare, Cpu } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ChatWorkbench, type ChatWorkbenchHandle } from '@/components/chat/ChatWorkbench';
import { IOPanel } from '@/components/workspace/IOPanel';
import { STUpdateHint } from '@/components/workspace/STUpdateHint';
import { BranchPanel } from '@/components/workspace/BranchPanel';
import { OutlinePanel } from '@/components/workspace/OutlinePanel';
import { ResourceRail } from '@/components/workspace/ResourceRail';
import { OrganizePanel, type OrganizeTarget } from '@/components/organize/OrganizePanel';
import ReaderView from '@/components/reader/ReaderView';
import NovelView from '@/components/reader/NovelView';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import {
  getArchiveStory,
  saveArchiveStory,
  getCharacter,
  getBranchLine,
  updateBranchLine,
  buildBranchFromSession,
} from '@/lib/archive-db';
import { parseJsonl, parseJson } from '@/lib/adapters/st';
import { getDefaultExportSettings } from '@/lib/session-storage';

type WorkspaceView = 'read' | 'organize' | 'io';

const VIEW_ITEMS: { key: WorkspaceView; label: string; icon: typeof BookOpenText; hint?: string }[] = [
  { key: 'read', label: '阅读与编辑', icon: BookOpenText },
  { key: 'organize', label: '整理与记录', icon: NotebookText },
  { key: 'io', label: '导入与导出', icon: ArrowDownUp },
];

const StoryWorkspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [story, setStory] = useState<ArchiveStory | null>(null);
  const [character, setCharacter] = useState<ArchiveCharacter | null>(null);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [view, setView] = useState<WorkspaceView>('read');
  const [immersive, setImmersive] = useState(false);
  const [novelOpen, setNovelOpen] = useState(false);
  const workbenchRef = useRef<ChatWorkbenchHandle>(null);
  // 整理与记录：资源栏点进来要打开的条目；从整理跳回聊天时待滚动的楼层
  const [organizeTarget, setOrganizeTarget] = useState<OrganizeTarget | null>(null);
  const pendingJumpRef = useRef<number | null>(null);

  // 持久化：只有真实修改（dirty）才落库，防抖 600ms；离开页面前有脏数据立即补存
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
    // 卸载兜底：防抖窗口内切走不丢最后一笔
    if (dirtyRef.current && storyRef.current) saveArchiveStory(storyRef.current).catch(() => {});
  }, []);

  // 加载故事 + 角色；记录 lastViewedAt（排序依据，不动 updatedAt）
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const s = await getArchiveStory(id);
        if (cancelled) return;
        if (!s) {
          setStory(null);
          return;
        }
        const withView: ArchiveStory = {
          ...s,
          settings: s.settings ?? getDefaultExportSettings(),
          lastViewedAt: Date.now(),
        };
        setStory(withView);
        saveArchiveStory(withView).catch(() => {});
        if (s.characterId) {
          const c = await getCharacter(s.characterId);
          if (!cancelled) setCharacter(c ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // 当前脉络（主线或分支）的数据切片
  const line = story ? getBranchLine(story, branchId) : undefined;

  const handleSessionChange = useCallback((next: ChatSession) => {
    mutateStory((cur) => {
      let updated = updateBranchLine(cur, branchId, { session: next });
      // 主线标题重命名跟随到故事标题（角色页列表/导出文件名都用它）
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

  // 整理与记录「跳回聊天对应楼层」：切分支（保留分支上下文）+ 回阅读视图，
  // 等 ChatWorkbench（按脉络 key 重挂）挂载渲染后再滚到楼层
  const handleJumpToChat = useCallback((bid: string | null, floor: number) => {
    pendingJumpRef.current = floor;
    setBranchId(bid);
    setView('read');
  }, []);

  useEffect(() => {
    if (view !== 'read' || pendingJumpRef.current === null) return;
    const floor = pendingJumpRef.current;
    pendingJumpRef.current = null;
    const t = setTimeout(() => workbenchRef.current?.scrollToFloor(floor), 120);
    return () => clearTimeout(t);
  }, [view, branchId]);

  // ---- 分支操作 ----

  const handleImportBranch = async (files: FileList | null) => {
    if (!files || files.length === 0 || !story) return;
    let ok = 0;
    let fail = 0;
    let lastId: string | null = null;
    const newBranches = [] as NonNullable<ArchiveStory['branches']>;
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        const isJsonl = file.name.endsWith('.jsonl') || content.trim().split('\n').length > 1;
        const { messages, metadata } = isJsonl ? parseJsonl(content) : parseJson(content);
        if (messages.length === 0) throw new Error('empty');
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.(jsonl|json)$/i, ''),
          messages,
          character: { name: metadata?.character_name || story.session.character.name },
          user: { name: metadata?.user_name || story.session.user.name },
          createdAt: Date.now(),
          rawMetadata: metadata,
        };
        const branch = buildBranchFromSession(session, session.title);
        newBranches.push(branch);
        lastId = branch.id;
        ok++;
      } catch {
        fail++;
      }
    }
    if (newBranches.length > 0) {
      mutateStory((cur) => ({
        ...cur,
        branches: [...(cur.branches ?? []), ...newBranches],
        updatedAt: Date.now(),
      }));
      setBranchId(lastId);
    }
    toast({ title: `导入分支：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}` });
  };

  const handleRenameBranch = (bid: string, name: string) => {
    mutateStory((cur) => ({
      ...cur,
      branches: (cur.branches ?? []).map((b) => (b.id === bid ? { ...b, name, updatedAt: Date.now() } : b)),
      updatedAt: Date.now(),
    }));
  };

  const handleDeleteBranch = (bid: string) => {
    mutateStory((cur) => ({
      ...cur,
      branches: (cur.branches ?? []).filter((b) => b.id !== bid),
      updatedAt: Date.now(),
    }));
    if (branchId === bid) setBranchId(null);
    toast({ title: '分支已删除' });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">加载中...</div>
      </AppLayout>
    );
  }

  if (!story || !line) {
    return (
      <AppLayout>
        <div className="flex flex-col min-h-[50vh] items-center justify-center gap-4">
          <BookOpen className="w-16 h-16 text-muted-foreground/50" />
          <p className="text-muted-foreground">找不到该故事</p>
          <Button onClick={() => navigate('/library')}>返回角色库</Button>
        </div>
      </AppLayout>
    );
  }

  const settings = story.settings ?? getDefaultExportSettings();
  const backTarget = story.characterId ? `/character/${story.characterId}` : '/library';
  const backLabel = character?.name ?? '角色库';

  return (
    <AppLayout>
      <div className="flex items-start flex-wrap">
        {/* ===== 左侧二级栏：故事上下文 + 三组导航 + 分支/章节/书签 ===== */}
        <aside className="w-56 basis-56 shrink-0 grow-0 border-r border-border bg-card/40 sticky top-0 h-screen overflow-y-auto p-3 space-y-4">
          <div>
            <Button variant="ghost" size="sm" className="px-1.5 -ml-1 text-muted-foreground" onClick={() => navigate(backTarget)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              {backLabel}
            </Button>
            <p className="font-display font-semibold text-sm mt-1 px-1.5 break-words">{story.title}</p>
            <p className="text-xs text-muted-foreground px-1.5 mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {line.session.messages.length} 楼
              </span>
              {story.meta.lastModel && (
                <span className="flex items-center gap-1 min-w-0">
                  <Cpu className="w-3 h-3 shrink-0" />
                  <span className="truncate">{story.meta.lastModel}</span>
                </span>
              )}
            </p>
          </div>

          <nav className="space-y-0.5">
            {VIEW_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    // 手动点导航进整理 = 清掉资源栏指定的条目，回「默认开最近修改」
                    if (item.key === 'organize') setOrganizeTarget(null);
                    setView(item.key);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="w-4 h-4" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.hint && <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">{item.hint}</Badge>}
                </button>
              );
            })}
          </nav>

          {view === 'read' && (
            <>
              <Separator />
              <BranchPanel
                story={story}
                activeBranchId={branchId}
                onSwitch={setBranchId}
                onImportBranch={handleImportBranch}
                onRenameBranch={handleRenameBranch}
                onDeleteBranch={handleDeleteBranch}
              />
              <Separator />
              <OutlinePanel
                session={line.session}
                markers={line.markers}
                favorites={line.favorites}
                onJump={(mid) => workbenchRef.current?.scrollToMessageId(mid)}
              />
            </>
          )}
        </aside>

        {/* ===== 主区 ===== */}
        <div className="flex-1 min-w-[24rem]">
          {view === 'read' && (
            <div className="flex items-start flex-wrap">
              <div className="flex-1 min-w-[20rem]">
                {/* key 按脉络切：换分支重挂工作台，UI 态（搜索/编辑模式/滚动）随之复位 */}
                <ChatWorkbench
                  key={branchId ?? 'trunk'}
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
                  navBarLeftClass="left-[20.75rem]"
                  titleBadge={
                    branchId !== null ? (
                      <Badge variant="secondary" className="shrink-0">
                        分支：{story.branches?.find((b) => b.id === branchId)?.name}
                      </Badge>
                    ) : undefined
                  }
                  toolbarExtras={
                    <>
                      <Button variant="outline" size="sm" onClick={() => setNovelOpen(true)} title="小说视图：拆句重排+用户楼层弱化/隐藏+场景分隔（Esc 退出）">
                        <BookOpenCheck className="w-4 h-4 mr-1.5" />
                        小说视图
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setImmersive(true)} title="沉浸式翻页阅读（Esc 退出）">
                        <BookOpen className="w-4 h-4 mr-1.5" />
                        沉浸阅读
                      </Button>
                    </>
                  }
                />
              </div>
              <div className="pr-4 pt-14">
                <ResourceRail
                  story={story}
                  floorCount={line.session.messages.length}
                  onJumpToFloor={(n) => workbenchRef.current?.scrollToFloor(n)}
                  onOpenOrganize={(target) => {
                    setOrganizeTarget(target);
                    setView('organize');
                  }}
                />
              </div>
            </div>
          )}

          {view === 'organize' && (
            <OrganizePanel
              key={organizeTarget ? `${organizeTarget.type}-${organizeTarget.id}` : 'auto'}
              story={story}
              characterName={character?.name}
              coverDataUrl={character?.pngBase64 ? `data:image/png;base64,${character.pngBase64}` : undefined}
              currentBranchId={branchId}
              initialTarget={organizeTarget}
              onJumpToChat={handleJumpToChat}
            />
          )}

          {view === 'io' && (
            <IOPanel
              story={story}
              branchId={branchId}
              line={line}
              settings={settings}
              onStoryUpdate={mutateStory}
            />
          )}
        </div>
      </div>

      {/* 检查 ST 更新（阶段7.4，仅客户端且有来源路径时出角落提示） */}
      <STUpdateHint story={story} onStoryUpdate={mutateStory} />

      {/* 小说视图（阶段6；三层管道，进度按 故事+脉络 记忆） */}
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

      {/* 沉浸式翻页阅读（覆盖层；翻页进度按 故事+脉络 记忆） */}
      {immersive && (
        <ReaderView
          messages={line.session.messages}
          markers={line.markers}
          regexRules={settings.regexRules}
          characterName={line.session.character.name}
          userName={line.session.user.name}
          onClose={() => setImmersive(false)}
          bookId={`${story.id}:${branchId ?? 'main'}`}
        />
      )}
    </AppLayout>
  );
};

export default StoryWorkspace;
