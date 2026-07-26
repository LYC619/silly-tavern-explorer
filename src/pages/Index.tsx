/**
 * 聊天处理页（2.0 阶段2 起 = 未绑定模式的统一聊天工作台，定稿第六章）。
 * 界面主体在 ChatWorkbench（与故事工作区同一套）；本页只负责：
 * 导入落地、书架自动同步、跨页指针、引导教程，以及「未绑定 → 绑定到角色」升级。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link2 } from 'lucide-react';
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
import type { ArchiveCharacter } from '@/types/archive';
import { saveBook, getBook, generateBookId, type BookItem } from '@/lib/bookshelf-db';
import { bindSessionToCharacter } from '@/lib/bind-story';
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
  const location = useLocation();
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
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [bindDialogOpen, setBindDialogOpen] = useState(false);

  // Auto-start tour for first-time visitors
  useEffect(() => {
    if (!isTourCompleted('home')) {
      // Load demo data and start tour
      setSession(demoSession);
      // Delay tour start to let DOM render
      const timer = setTimeout(() => setShowTour(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Load book from navigation state (from bookshelf) or session storage
  useEffect(() => {
    if (showTour) return; // Don't override demo data during tour
    const state = location.state as { book?: BookItem } | null;
    if (state?.book) {
      setSession(state.book.session);
      setMarkers(state.book.markers);
      setFavorites(state.book.favorites ?? []);
      setCurrentBookId(state.book.id);
      if (state.book.settings) {
        setSettings(state.book.settings);
      }
      window.history.replaceState({}, document.title);
    } else {
      // session 本体已不在 sessionStorage（见 SessionPointer 注释），凭指针从 IndexedDB 回读，
      // 再用指针里的 markers/favorites（最近一次未必已保存到书架的临时编辑态）覆盖。
      const pointer = loadSessionPointer();
      if (pointer?.currentBookId) {
        let cancelled = false;
        loadActiveSession().then(active => {
          if (cancelled || !active) return;
          setSession(active);
          setMarkers(pointer.markers ?? []);
          setFavorites(pointer.favorites ?? []);
          setCurrentBookId(pointer.currentBookId);
          // 记下离开时的楼层，等虚拟列表挂载后恢复一次（切路由页面整棵卸载，滚动必回顶）
          if (typeof pointer.lastFloor === 'number' && pointer.lastFloor > 0) {
            setRestoreFloor(pointer.lastFloor);
          }
        });
        return () => { cancelled = true; };
      }
    }
  }, [location.state, showTour]);

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
        saveSessionPointer({ currentBookId, markers, favorites, lastFloor: currentFloor });
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [session, markers, currentBookId, favorites, currentFloor]);

  // 保存设置变更到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // 自动同步书架：正则规则/楼层编辑/章节标记等处理状态随书保存（防抖），
  // 否则书架里的书永远停留在导入时的快照，重新打开会丢失之后的全部处理。
  const bookSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!session || !currentBookId) return;
    if (bookSyncTimerRef.current) clearTimeout(bookSyncTimerRef.current);
    bookSyncTimerRef.current = setTimeout(async () => {
      try {
        const existing = await getBook(currentBookId);
        if (!existing) return; // 书已被删除，不复活
        await saveBook({
          ...existing,
          title: session.title || session.character?.name || existing.title,
          session,
          markers,
          favorites,
          settings,
          updatedAt: Date.now(),
        });
      } catch { /* 自动同步失败不打扰用户，手动保存仍可用 */ }
    }, 800);
    return () => { if (bookSyncTimerRef.current) clearTimeout(bookSyncTimerRef.current); };
  }, [session, markers, favorites, settings, currentBookId]);

  const handleImport = async (newSession: ChatSession, stats?: ImportStats) => {
    setSession(newSession);
    setMarkers([]);
    setRestoreFloor(undefined);
    // Auto-save to bookshelf on import
    try {
      const bookId = generateBookId();
      const book: BookItem = {
        id: bookId,
        title: newSession.title || newSession.character?.name || '未命名作品',
        session: newSession,
        markers: [],
        favorites: [],
        settings,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveBook(book);
      setCurrentBookId(bookId);
      setFavorites([]);

      // Build description with swipes stats
      let description = '已自动保存到书架';
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
      toast({ title: '自动保存失败，请手动保存', variant: 'destructive' });
    }
  };

  const handleReset = () => {
    setSession(null);
    setMarkers([]);
    setFavorites([]);
    setCurrentBookId(null);
    setRestoreFloor(undefined);
    clearSessionState();
  };

  const handleSaveToBookshelf = async () => {
    if (!session) return;
    try {
      const now = Date.now();
      let createdAt = now;
      if (currentBookId) {
        const existing = await getBook(currentBookId);
        createdAt = existing?.createdAt ?? now;
      }
      const book: BookItem = {
        id: currentBookId || generateBookId(),
        title: session.title || session.character?.name || '未命名作品',
        session,
        markers,
        favorites,
        settings,
        createdAt,
        updatedAt: now,
      };
      await saveBook(book);
      setCurrentBookId(book.id);
      toast({ title: '已保存到书架' });
    } catch (error) {
      toast({ title: '保存失败', variant: 'destructive' });
    }
  };

  // 绑定到角色：原地升级为归档故事（成果带走，书架副本删除），跳故事工作区
  const handleBind = async (character: ArchiveCharacter) => {
    if (!session) return;
    try {
      const { story, carried } = await bindSessionToCharacter({
        characterId: character.id,
        session,
        markers,
        favorites,
        settings,
        bookId: currentBookId,
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
            <ChatImporter onImport={handleImport} />

            <div className="mt-4 flex justify-center">
              <DemoData onLoad={setSession} />
            </div>

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
          onSaveToBookshelf={handleSaveToBookshelf}
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
