/**
 * 聊天处理页（2.0 阶段2 起 = 未绑定模式的统一聊天工作台，定稿第六章）。
 * 界面主体在 ChatWorkbench（与故事工作区同一套）；本页只负责：
 * 导入落地、自动落库、跨页指针、引导教程，以及「未绑定 → 绑定到角色」升级。
 * 阶段5 书架退役：未绑定聊天直接存为归档故事（characterId 为空），本页空态列出暂存记录。
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Link2, MessageSquare, Trash2, Clock, BookOpenCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/AppLayout';
import { ChatImporter, type ImportStats } from '@/components/chat/ChatImporter';
import { ChatWorkbench } from '@/components/chat/ChatWorkbench';
import { RecentStoryBar } from '@/components/chat/RecentStoryBar';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import NovelView from '@/components/reader/NovelView';
import { BindStoryDialog } from '@/components/chat/BindStoryDialog';
import { GuidedTour } from '@/components/GuidedTour';
import { HOME_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { demoSession, DemoData } from '@/components/DemoData';
import type { ChatSession, ExportSettings, ChapterMarker } from '@/types/chat';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import {
  buildStoryFromSession,
  saveArchiveStory,
  updateArchiveStory,
  getArchiveStory,
  getAllArchiveStories,
  deleteArchiveStory,
  updateBranchLine,
} from '@/lib/archive-db';
import { bindSessionToCharacter } from '@/lib/bind-story';
import { takePendingToolFile } from '@/lib/tool-handoff';
import {
  saveSessionPointer,
  loadSessionPointer,
  clearSessionState,
  getDefaultExportSettings,
  saveSettings,
} from '@/lib/session-storage';
import { useToast } from '@/hooks/use-toast';
import {
  buildEditorChatPath,
  getEditorStoryId,
  resolveEditorStoryId,
  setEditorStoryId,
} from '@/lib/editor-story-context';
import { pickRecentEditorStories } from '@/lib/home-layout';
import { executeDeleteAction } from '@/lib/destructive-action';

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const routeStoryId = searchParams.get('storyId');
  const [showTour, setShowTour] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(getDefaultExportSettings);
  const [markers, setMarkers] = useState<ChapterMarker[]>([]);
  // 收藏楼层（messageId），轻量书签用于跳转，不进导出
  const [favorites, setFavorites] = useState<string[]>([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  // 从指针恢复会话时要跳回的楼层，交给 ChatWorkbench 挂载后消费
  const [restoreFloor, setRestoreFloor] = useState<number | undefined>(undefined);
  // 当前会话对应的归档故事 id（兼容旧指针字段 currentBookId）。
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  // 小说视图（阶段6）：未绑定聊天也可用；润色上下文用当前暂存的归档故事
  const [novelStory, setNovelStory] = useState<ArchiveStory | null>(null);
  const [novelOpen, setNovelOpen] = useState(false);
  const [allStories, setAllStories] = useState<ArchiveStory[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ArchiveStory | null>(null);
  // 处理区入口交接来的文件（挂载时取一次，交给 ChatImporter 自动解析）
  const [handoffFile] = useState<File | null>(() => takePendingToolFile('chat'));

  const recentStories = useMemo(() => pickRecentEditorStories(allStories), [allStories]);
  const unboundStories = useMemo(() => allStories.filter((story) => !story.characterId), [allStories]);
  const currentStory = useMemo(
    () => allStories.find((story) => story.id === currentStoryId) ?? null,
    [allStories, currentStoryId],
  );

  const refreshStories = useCallback(async () => {
    try {
      setAllStories(await getAllArchiveStories());
    } catch {
      setAllStories([]);
    }
  }, []);

  const hydrateStory = useCallback((story: ArchiveStory, pointer = loadSessionPointer()) => {
    setSession(story.session);
    setMarkers(story.markers ?? []);
    setFavorites(story.favorites ?? []);
    if (story.settings) setSettings(story.settings);
    setCurrentStoryId(story.id);
    setEditorStoryId(story.id);
    const lastFloor = pointer?.currentBookId === story.id ? pointer.lastFloor : story.lastFloor;
    setRestoreFloor(typeof lastFloor === 'number' && lastFloor > 0 ? lastFloor : undefined);
  }, []);

  // Auto-start tour for first-time visitors; an explicit or remembered story always wins.
  useEffect(() => {
    const hasRememberedStory = !!(routeStoryId || getEditorStoryId() || loadSessionPointer()?.currentBookId);
    if (!isTourCompleted('home') && !handoffFile && !hasRememberedStory) {
      // Load demo data and start tour
      setSession(demoSession);
      // Delay tour start to let DOM render
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [handoffFile, routeStoryId]);

  // 显式 storyId > 编辑区共享记忆 > 旧聊天指针；三种入口最终加载同一条归档故事。
  useEffect(() => {
    if (showTour || handoffFile) return; // Don't override demo data during tour
    const pointer = loadSessionPointer();
    const targetId = resolveEditorStoryId(routeStoryId, pointer?.currentBookId);
    if (!targetId) return;
    let cancelled = false;
    getArchiveStory(targetId).then((story) => {
      if (cancelled) return;
      if (!story) {
        if (getEditorStoryId() === targetId) setEditorStoryId(null);
        if (routeStoryId) toast({ title: '找不到这条故事', variant: 'destructive' });
        return;
      }
      hydrateStory(story, pointer);
    }).catch(() => {
      if (!cancelled && routeStoryId) toast({ title: '故事加载失败', variant: 'destructive' });
    });
    return () => { cancelled = true; };
  }, [handoffFile, hydrateStory, routeStoryId, showTour, toast]);

  useEffect(() => { void refreshStories(); }, [refreshStories]);

  // 检测 AI 生成的章节标记
  useEffect(() => {
    const aiMarkers = sessionStorage.getItem('ai-chapter-markers');
    if (aiMarkers) {
      sessionStorage.removeItem('ai-chapter-markers');
      try {
        const parsed = JSON.parse(aiMarkers) as ChapterMarker[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMarkers(prev => {
            const merged = [...prev];
            for (const marker of parsed) {
              const existing = merged.findIndex(m => m.messageIndex === marker.messageIndex);
              if (existing >= 0) {
                merged[existing] = marker;
              } else {
                merged.push(marker);
              }
            }
            return merged.sort((a, b) => a.messageIndex - b.messageIndex);
          });
          toast({ title: `已导入 ${parsed.length} 个 AI 生成的章节标记` });
        }
      } catch { /* ignore */ }
    }
  }, [toast]);

  // 保存「跨页临时态」到 sessionStorage（防抖）。只存轻量指针，session 本体在 IndexedDB。
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (session) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveSessionPointer({ currentBookId: currentStoryId, markers, favorites, lastFloor: currentFloor });
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [session, markers, currentStoryId, favorites, currentFloor]);

  // 保存设置变更到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // 自动落库：正则规则/楼层编辑/章节标记等处理状态随未绑定故事保存（防抖），
  // 否则暂存的记录永远停留在导入时的快照，重新打开会丢失之后的全部处理。
  const storySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistCurrentStory = useCallback(async () => {
    if (!session || !currentStoryId) return;
    await updateArchiveStory(currentStoryId, (current) => {
      const updated = updateBranchLine(current, null, { session, markers, favorites });
      return {
        ...updated,
        title: session.title || current.title,
        settings,
      };
    });
  }, [currentStoryId, favorites, markers, session, settings]);

  useEffect(() => {
    if (!session || !currentStoryId) return;
    if (storySyncTimerRef.current) clearTimeout(storySyncTimerRef.current);
    storySyncTimerRef.current = setTimeout(() => {
      void persistCurrentStory().catch(() => { /* 自动同步失败不打扰用户，下次修改会重试 */ });
    }, 800);
    return () => { if (storySyncTimerRef.current) clearTimeout(storySyncTimerRef.current); };
  }, [currentStoryId, persistCurrentStory, session]);

  const handleImport = async (newSession: ChatSession, stats?: ImportStats) => {
    setSession(newSession);
    setMarkers([]);
    setRestoreFloor(undefined);
    // 导入即存为未绑定归档故事（书架退役后的暂存地），随编辑自动同步
    try {
      const story = buildStoryFromSession(newSession);
      story.settings = settings;
      await saveArchiveStory(story);
      setCurrentStoryId(story.id);
      setEditorStoryId(story.id);
      setFavorites([]);
      await refreshStories();
      navigate(buildEditorChatPath(story.id), { replace: true });

      // Build description with swipes stats
      let description = '已自动暂存，绑定角色后进入故事工作区';
      if (stats && stats.swipesRemoved > 0) {
        const sizeStr = stats.swipesBytesEstimate < 1024
          ? `${stats.swipesBytesEstimate} B`
          : stats.swipesBytesEstimate < 1024 * 1024
            ? `${(stats.swipesBytesEstimate / 1024).toFixed(1)} KB`
            : `${(stats.swipesBytesEstimate / (1024 * 1024)).toFixed(1)} MB`;
        description = `导入 ${stats.totalMessages} 楼 · 发现 ${stats.swipesRemoved} 条 swipes（约 ${sizeStr}），导出时将自动清除`;
      }
      toast({ title: '导入成功', description });
    } catch (error) {
      console.error('Auto-save failed:', error);
      toast({ title: '自动暂存失败', variant: 'destructive' });
    }
  };

  const handleReset = () => {
    setSession(null);
    setMarkers([]);
    setFavorites([]);
    setCurrentStoryId(null);
    setEditorStoryId(null);
    setRestoreFloor(undefined);
    clearSessionState();
    // 清掉 ?storyId，否则加载 effect 在刷新/重挂时会按显式路由复活刚关闭的会话
    navigate('/chat', { replace: true });
  };

  const handleOpenStory = async (story: ArchiveStory) => {
    try {
      await persistCurrentStory();
    } catch {
      toast({ title: '当前故事保存失败，已取消切换', variant: 'destructive' });
      return;
    }
    // story 来自挂载时的 allStories 快照。点当前故事时路由不变、加载 effect 不重跑，
    // 用陈旧快照 hydrate 会在 800ms 后被自动落库写回，覆盖本次会话的全部编辑；
    // 因此必须以刚 persist 过的库内数据为准。读失败时中止切换，绝不用陈旧快照顶替。
    let fresh: ArchiveStory | null = null;
    try {
      fresh = await getArchiveStory(story.id) ?? null;
    } catch {
      fresh = null;
    }
    if (!fresh) {
      toast({ title: '故事读取失败，已取消切换', variant: 'destructive' });
      return;
    }
    hydrateStory(fresh);
    navigate(buildEditorChatPath(story.id));
  };

  const handleDeleteUnbound = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const deleted = await executeDeleteAction(async () => {
      await deleteArchiveStory(target.id);
      setAllStories((current) => current.filter((story) => story.id !== target.id));
      if (target.id === currentStoryId) handleReset();
    }, {
      onSuccess: () => toast({ title: `已删除暂存故事「${target.title}」` }),
      onFailure: () => toast({ title: '删除暂存故事失败', variant: 'destructive' }),
    });
    if (deleted) setDeleteTarget(null);
  };

  // 绑定到角色：未绑定故事补上 characterId 原地升级，总结/故事树成果带走，跳故事工作区
  const handleBind = async (character: ArchiveCharacter) => {
    if (!session) return;
    try {
      const { story, carried } = await bindSessionToCharacter({
        characterId: character.id,
        storyId: currentStoryId,
        session,
        markers,
        favorites,
        settings,
      });
      setCurrentStoryId(story.id);
      setEditorStoryId(story.id);
      setAllStories((current) => [story, ...current.filter((item) => item.id !== story.id)]);
      toast({
        title: `已绑定到「${character.name}」`,
        description: carried > 0 ? `${carried} 条总结/故事树已一并带走` : undefined,
      });
      navigate(buildEditorChatPath(story.id), { replace: true });
    } catch (error) {
      console.error('Bind failed:', error);
      toast({ title: '绑定失败', variant: 'destructive' });
    }
  };

  const handleFloorChange = useCallback((floor: number) => setCurrentFloor(floor), []);

  const handleOpenNovel = async () => {
    // 润色成果要挂在归档故事上；暂存故事在 IDB 里即时读一份（demo 数据无故事则只读不润色）
    if (currentStoryId) {
      try {
        const story = await getArchiveStory(currentStoryId);
        setNovelStory(story ?? null);
      } catch {
        setNovelStory(null);
      }
    } else {
      setNovelStory(null);
    }
    setNovelOpen(true);
  };

  return (
    <AppLayout>
      {!session ? (
        <div className="flex h-full min-h-0 flex-col">
          <RecentStoryBar stories={recentStories} activeStoryId={currentStoryId} onSelect={(story) => void handleOpenStory(story)} />
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-6">
              <div className="max-w-xl mx-auto animate-fade-in">
            {/* Tour replaces old onboarding */}
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl mb-3 text-gradient">处理你的对话记录</h2>
              <p className="text-muted-foreground">
                导入 SillyTavern 聊天记录，支持正则清理、章节标记、范围导出和多种阅读主题
              </p>
            </div>
            <ChatImporter onImport={handleImport} initialFile={handoffFile} />

            <div className="mt-4 flex justify-center">
              <DemoData onLoad={setSession} />
            </div>

            {/* 未绑定暂存列表：书架退役后，临时聊天的唯一入口 */}
            {unboundStories.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">未绑定的暂存记录</h3>
                <div className="space-y-2">
                  {unboundStories.map((story) => (
                    <div
                      key={story.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border card-elevated cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => void handleOpenStory(story)}
                    >
                      <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{story.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{story.session.messages.length} 楼</span>
                          {story.meta.lastModel && <span className="truncate">{story.meta.lastModel}</span>}
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(story.updatedAt).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(story); }}
                        aria-label="删除暂存记录"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              {[
                { label: '典雅书籍', desc: '装饰边框' },
                { label: '小说排版', desc: '经典引号' },
                { label: '社交气泡', desc: '聊天风格' },
                { label: '极简主义', desc: '清爽干净' },
              ].map((item, i) => (
                <div key={i} className="p-4 rounded-lg bg-card border border-border card-elevated">
                  <div className="font-display font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.desc}</div>
                </div>
              ))}
            </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          {/* 工作态不再放最近故事栏（用户拍板：只在导入前需要）；切故事走全局菜单/窄工具栏 */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ChatWorkbench
              session={session}
              markers={markers}
              favorites={favorites}
              settings={settings}
              onSessionChange={setSession}
              onMarkersChange={setMarkers}
              onFavoritesChange={setFavorites}
              onSettingsChange={setSettings}
              onFloorChange={handleFloorChange}
              initialFloor={restoreFloor}
              onReset={handleReset}
              titleBadge={
                <Badge
                  variant="outline"
                  className="shrink-0 text-muted-foreground"
                  title={currentStory?.characterId ? '这条故事已经绑定角色卡' : '这条故事尚未绑定角色卡'}
                >
                  {currentStory?.characterId ? '已绑定' : '未绑定'}
                </Badge>
              }
              toolbarExtras={
                <>
                  <Button variant="outline" size="sm" onClick={handleOpenNovel} title="小说视图：拆句重排+用户楼层弱化/隐藏+场景分隔（Esc 退出）">
                    <BookOpenCheck className="w-4 h-4 mr-1.5" />
                    小说视图
                  </Button>
                  {!currentStory?.characterId && (
                    <Button variant="outline" size="sm" onClick={() => setBindDialogOpen(true)}>
                      <Link2 className="w-4 h-4 mr-1.5" />
                      绑定到角色
                    </Button>
                  )}
                </>
              }
            />
          </div>
        </div>
      )}

      {/* 小说视图（未绑定模式；成果挂当前暂存故事，绑定时随 id 带走） */}
      {novelOpen && session && (
        <NovelView
          session={session}
          markers={markers}
          regexRules={settings.regexRules}
          onClose={() => setNovelOpen(false)}
          onMarkersChange={setMarkers}
          favorites={favorites}
          onFavoritesChange={setFavorites}
          initialFloor={restoreFloor ?? currentFloor}
          onFloorChange={handleFloorChange}
          progressKey={currentStoryId ? `${currentStoryId}:main` : undefined}
          polish={novelStory ? { story: novelStory, branchId: null } : undefined}
        />
      )}

      <BindStoryDialog open={bindDialogOpen} onOpenChange={setBindDialogOpen} onSelect={handleBind} />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        title={`删除暂存故事「${deleteTarget?.title ?? ''}」？`}
        description={`此操作不可恢复，将删除正文、章节标记、收藏与处理设置。当前共 ${deleteTarget?.session.messages.length ?? 0} 楼。`}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => void handleDeleteUnbound()}
      />

      {/* Guided Tour */}
      {showTour && (
        <GuidedTour
          steps={HOME_TOUR_STEPS}
          module="home"
          onComplete={() => {
            setTourCompleted('home');
            setShowTour(false);
            toast({ title: '引导完成！', description: '您可以清除示例数据并导入自己的文件。' });
          }}
          onSkip={() => {
            setTourCompleted('home');
            setShowTour(false);
          }}
        />
      )}

    </AppLayout>
  );
};

export default Index;
