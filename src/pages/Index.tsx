/**
 * 聊天处理页（2.0 阶段2 起 = 未绑定模式的统一聊天工作台，定稿第六章）。
 * 界面主体在 ChatWorkbench（与故事工作区同一套）；本页只负责：
 * 导入落地、自动落库、跨页指针、引导教程，以及「未绑定 → 绑定到角色」升级。
 * 阶段5 书架退役：未绑定聊天直接存为归档故事（characterId 为空），本页空态列出暂存记录。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, MessageSquare, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AppLayout } from '@/components/AppLayout';
import { ChatImporter, type ImportStats } from '@/components/chat/ChatImporter';
import { ChatWorkbench } from '@/components/chat/ChatWorkbench';
import { BindStoryDialog } from '@/components/chat/BindStoryDialog';
import { GuidedTour } from '@/components/GuidedTour';
import { HOME_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { demoSession, DemoData } from '@/components/DemoData';
import type { ChatSession, ExportSettings, ChapterMarker } from '@/types/chat';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import {
  buildStoryFromSession,
  saveArchiveStory,
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
  loadActiveSession,
  clearSessionState,
  getDefaultExportSettings,
  saveSettings,
} from '@/lib/session-storage';
import { APP_VERSION } from '@/components/GlobalSettings';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showTour, setShowTour] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(getDefaultExportSettings);
  const [markers, setMarkers] = useState<ChapterMarker[]>([]);
  // 收藏楼层（messageId），轻量书签用于跳转，不进导出
  const [favorites, setFavorites] = useState<string[]>([]);
  const [currentFloor, setCurrentFloor] = useState(0);
  // 从指针恢复会话时要跳回的楼层，交给 ChatWorkbench 挂载后消费
  const [restoreFloor, setRestoreFloor] = useState<number | undefined>(undefined);
  // 当前会话对应的未绑定归档故事 id（沿用旧称 bookId 的指针字段）
  const [currentStoryId, setCurrentStoryId] = useState<string | null>(null);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);
  // 空态展示的未绑定暂存列表（书架退役后临时聊天的家）
  const [unboundStories, setUnboundStories] = useState<ArchiveStory[]>([]);
  // 处理区入口交接来的文件（挂载时取一次，交给 ChatImporter 自动解析）
  const [handoffFile] = useState<File | null>(() => takePendingToolFile('chat'));

  // Auto-start tour for first-time visitors
  useEffect(() => {
    if (!isTourCompleted('home') && !handoffFile) {
      // Load demo data and start tour
      setSession(demoSession);
      // Delay tour start to let DOM render
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [handoffFile]);

  // 凭跨页指针恢复上次的会话（session 本体在 IndexedDB 的未绑定归档故事里）
  useEffect(() => {
    if (showTour || handoffFile) return; // Don't override demo data during tour
    const pointer = loadSessionPointer();
    if (pointer?.currentBookId) {
      let cancelled = false;
      loadActiveSession().then(active => {
        if (cancelled || !active) return;
        setSession(active);
        setMarkers(pointer.markers ?? []);
        setFavorites(pointer.favorites ?? []);
        setCurrentStoryId(pointer.currentBookId);
        // 记下离开时的楼层，等虚拟列表挂载后恢复一次（切路由页面整棵卸载，滚动必回顶）
        if (typeof pointer.lastFloor === 'number' && pointer.lastFloor > 0) {
          setRestoreFloor(pointer.lastFloor);
        }
      });
      return () => { cancelled = true; };
    }
  }, [showTour, handoffFile]);

  // 空态时列出未绑定暂存（最近修改在前，repo 已按 updatedAt 降序）
  useEffect(() => {
    if (session) return;
    let cancelled = false;
    getAllArchiveStories().then(all => {
      if (!cancelled) setUnboundStories(all.filter(s => !s.characterId));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [session]);

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
  useEffect(() => {
    if (!session || !currentStoryId) return;
    if (storySyncTimerRef.current) clearTimeout(storySyncTimerRef.current);
    storySyncTimerRef.current = setTimeout(async () => {
      try {
        const existing = await getArchiveStory(currentStoryId);
        if (!existing) return; // 故事已被删除，不复活
        let updated = updateBranchLine(existing, null, { session, markers, favorites });
        updated = {
          ...updated,
          title: session.title || existing.title,
          settings,
        };
        await saveArchiveStory(updated);
      } catch { /* 自动同步失败不打扰用户，下次修改会重试 */ }
    }, 800);
    return () => { if (storySyncTimerRef.current) clearTimeout(storySyncTimerRef.current); };
  }, [session, markers, favorites, settings, currentStoryId]);

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
      setFavorites([]);

      // Build description with swipes stats
      let description = '已自动暂存，绑定角色后进入故事工作区';
      if (stats && stats.swipesRemoved > 0) {
        const sizeStr = stats.swipesBytesEstimate < 1024
          ? `${stats.swipesBytesEstimate} B`
          : stats.swipesBytesEstimate < 1024 * 1024
            ? `${(stats.swipesBytesEstimate / 1024).toFixed(1)} KB`
            : `${(stats.swipesBytesEstimate / (1024 * 1024)).toFixed(1)} MB`;
        description = `导入 ${stats.totalMessages} 条消息 · 发现 ${stats.swipesRemoved} 条 swipes（约 ${sizeStr}），导出时将自动清除`;
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
    setRestoreFloor(undefined);
    clearSessionState();
  };

  // 打开一条未绑定暂存记录
  const handleOpenUnbound = (story: ArchiveStory) => {
    setSession(story.session);
    setMarkers(story.markers ?? []);
    setFavorites(story.favorites ?? []);
    if (story.settings) setSettings(story.settings);
    setCurrentStoryId(story.id);
    setRestoreFloor(story.lastFloor && story.lastFloor > 0 ? story.lastFloor : undefined);
  };

  const handleDeleteUnbound = async (id: string) => {
    try {
      await deleteArchiveStory(id);
      setUnboundStories(prev => prev.filter(s => s.id !== id));
      toast({ title: '已删除暂存记录' });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    }
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
      clearSessionState();
      toast({
        title: `已绑定到「${character.name}」`,
        description: carried > 0 ? `${carried} 条总结/故事树已一并带走` : undefined,
      });
      navigate(`/story/${story.id}`);
    } catch (error) {
      console.error('Bind failed:', error);
      toast({ title: '绑定失败', variant: 'destructive' });
    }
  };

  const handleFloorChange = useCallback((floor: number) => setCurrentFloor(floor), []);

  return (
    <AppLayout>
      {!session ? (
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
                      onClick={() => handleOpenUnbound(story)}
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
                        onClick={(e) => { e.stopPropagation(); handleDeleteUnbound(story.id); }}
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
      ) : (
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
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={() => setBindDialogOpen(true)}
              title="这份记录还没有归属的角色卡；绑定后升级为故事工作区，整理成果一并带走"
            >
              未绑定
            </Badge>
          }
          toolbarExtras={
            <Button variant="outline" size="sm" onClick={() => setBindDialogOpen(true)}>
              <Link2 className="w-4 h-4 mr-1.5" />
              绑定到角色
            </Button>
          }
        />
      )}

      <BindStoryDialog open={bindDialogOpen} onOpenChange={setBindDialogOpen} onSelect={handleBind} />

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

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground flex-shrink-0">
        <p>ST 聊天记录处理器 {APP_VERSION}</p>
        <p className="mt-1">
          <a href="https://github.com/LYC619/silly-tavern-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
          {' · MIT License'}
        </p>
      </footer>
    </AppLayout>
  );
};

export default Index;
