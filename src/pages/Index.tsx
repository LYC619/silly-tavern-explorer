import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { ChatImporter, type ImportStats } from '@/components/ChatImporter';
import { ChatPreview, type ChatPreviewHandle } from '@/components/ChatPreview';
import { MessageNavBar, type FavoriteItem } from '@/components/MessageNavBar';
import { MessageSearchBar } from '@/components/MessageSearchBar';
import { EditorToolbar } from '@/components/EditorToolbar';
import { ChapterMarkerDialog } from '@/components/ChapterMarkerDialog';
import { MessageEditDialog } from '@/components/MessageEditDialog';
import { RegexSidebar } from '@/components/RegexSidebar';
import { GuidedTour } from '@/components/GuidedTour';
import { HOME_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { demoSession } from '@/components/DemoData';
import type { ChatSession, ExportSettings, ChapterMarker, ChatMessage, RegexRule } from '@/types/chat';
import { saveBook, getBook, generateBookId, type BookItem } from '@/lib/bookshelf-db';
import {
  saveSessionPointer,
  loadSessionPointer,
  loadActiveSession,
  clearSessionState,
  getInitialRegexRules,
  saveSettings,
  loadSettings,
} from '@/lib/session-storage';
import { SettingsPanel } from '@/components/SettingsPanel';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

const getDefaultSettings = (): ExportSettings => {
  const saved = loadSettings();
  if (saved) {
    return {
      ...saved,
      regexRules: getInitialRegexRules(),
    };
  }
  return {
    theme: 'elegant',
    showTimestamp: false,
    showAvatar: true,
    paperWidth: 600,
    fontSize: 15,
    prefixMode: 'name',
    regexRules: getInitialRegexRules(),
    cleanPluginCache: true,
    exportRange: 'all',
    recentCount: 100,
    customStart: 1,
    customEnd: 100,
  };
};

const Index = () => {
  const location = useLocation();
  const { toast } = useToast();
  const [showTour, setShowTour] = useState(false);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(getDefaultSettings);
  const [markers, setMarkers] = useState<ChapterMarker[]>([]);
  // 收藏楼层（messageId），轻量书签用于跳转，不进导出
  const [favorites, setFavorites] = useState<string[]>([]);
  // 跳楼层：ChatPreview 命令式句柄 + 当前顶部可见楼层 + messageId→楼层号映射
  const previewRef = useRef<ChatPreviewHandle>(null);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [currentFloorMsgId, setCurrentFloorMsgId] = useState<string | null>(null);
  const [floorCount, setFloorCount] = useState(0);
  const [floorMap, setFloorMap] = useState<Map<string, number>>(new Map());
  // 全文搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState({ total: 0, current: 0 });
  const handleSearchResult = useCallback((total: number, current: number) => {
    setSearchResult({ total, current });
  }, []);
  const [editMode, setEditMode] = useState(false);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [messageEditDialogOpen, setMessageEditDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; index: number } | null>(null);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [regexSidebarOpen, setRegexSidebarOpen] = useState(false);
  // 正在主界面原地预览的正则规则（点侧栏「预览」时设置，再次点取消）
  const [previewRule, setPreviewRule] = useState<RegexRule | null>(null);

  // 任意方式载入聊天记录（导入/从书架编辑/恢复上次会话）后，自动展开正则框一次，
  // 让用户第一时间看到清理工具；之后用户可自由关闭，不会被反复强制打开。
  const regexAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (session && !regexAutoOpenedRef.current) {
      regexAutoOpenedRef.current = true;
      setRegexSidebarOpen(true);
    }
  }, [session]);

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
  }, []);

  // 保存「跨页临时态」到 sessionStorage（防抖）。
  // 现在只存轻量指针(currentBookId+markers+favorites)，session 本体在 IndexedDB，
  // 永远不会触及 5MB 配额，故不再需要 quota 提示。settings 已单独持久化到 localStorage。
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (session) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveSessionPointer({ currentBookId, markers, favorites });
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [session, markers, currentBookId, favorites]);

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
    setEditMode(false);
    setCurrentBookId(null);
    setRegexSidebarOpen(false);
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

  // 章节标记模式：点任意楼弹出章节标记对话框
  const handleMessageClick = useCallback((messageId: string, messageIndex: number) => {
    if (editMode) {
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMarkerDialogOpen(true);
    }
  }, [editMode]);

  // 点某楼右上角铅笔：直接打开该楼编辑窗口（不经「编辑模式」，所见即点）
  const handleEditMessage = useCallback((messageId: string, messageIndex: number) => {
    setSelectedMessage({ id: messageId, index: messageIndex });
    setMessageEditDialogOpen(true);
  }, []);

  const handleSaveMessage = (updatedMessage: ChatMessage) => {
    if (!session) return;
    // 快照编辑前的整条消息，用于撤销（删段/改内容/改说话人都走这里）
    const prevMessage = session.messages.find(msg => msg.id === updatedMessage.id);
    setSession({
      ...session,
      messages: session.messages.map(msg =>
        msg.id === updatedMessage.id ? updatedMessage : msg
      ),
    });
    if (!prevMessage) return;
    const changed =
      prevMessage.content !== updatedMessage.content ||
      prevMessage.name !== updatedMessage.name ||
      prevMessage.role !== updatedMessage.role;
    if (!changed) return;
    toast({
      title: '已修改该楼',
      action: (
        <ToastAction altText="撤销修改" onClick={() => {
          setSession(cur => cur
            ? { ...cur, messages: cur.messages.map(m => m.id === prevMessage.id ? prevMessage : m) }
            : cur
          );
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  const handleDeleteMessage = () => {
    if (!session || !selectedMessage) return;
    const delId = selectedMessage.id;
    // 快照被删数据用于撤销：消息本身+原位置、联动删除的章节标记、收藏归属
    const delIndex = session.messages.findIndex(m => m.id === delId);
    const delMessage = session.messages[delIndex];
    if (!delMessage) return;
    const delMarkers = markers.filter(m => m.messageId === delId);
    const wasFavorite = favorites.includes(delId);

    setSession({
      ...session,
      messages: session.messages.filter(msg => msg.id !== delId),
    });
    setMarkers(prev => prev.filter(m => m.messageId !== delId));
    setFavorites(prev => prev.filter(id => id !== delId));

    toast({
      title: '已删除该楼',
      description: delMarkers.length > 0 ? '连同其章节标记一并删除' : undefined,
      action: (
        <ToastAction altText="撤销删除" onClick={() => {
          // 把消息插回原位置，并恢复其标记/收藏
          setSession(cur => {
            if (!cur) return cur;
            if (cur.messages.some(m => m.id === delId)) return cur; // 已存在则不重复插
            const msgs = [...cur.messages];
            msgs.splice(Math.min(delIndex, msgs.length), 0, delMessage);
            return { ...cur, messages: msgs };
          });
          if (delMarkers.length > 0) {
            setMarkers(prev => [...prev, ...delMarkers].sort((a, b) => a.messageIndex - b.messageIndex));
          }
          if (wasFavorite) {
            setFavorites(prev => prev.includes(delId) ? prev : [...prev, delId]);
          }
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  // 收藏/取消收藏某楼（messageId）。轻量书签，仅用于跳转，不进导出。
  const handleToggleFavorite = useCallback((messageId: string) => {
    setFavorites(prev =>
      prev.includes(messageId)
        ? prev.filter(id => id !== messageId)
        : [...prev, messageId]
    );
  }, []);

  // ChatPreview 上报顶部可见楼层
  const handleVisibleFloorChange = useCallback((floor: number, messageId: string | null) => {
    setCurrentFloor(floor);
    setCurrentFloorMsgId(messageId);
  }, []);

  // ChatPreview 上报楼层映射（顺序变化时），同步总楼层数
  const handleFloorMapChange = useCallback((map: Map<string, number>) => {
    setFloorMap(map);
    setFloorCount(map.size);
  }, []);

  // 收藏列表项：按 messageId 解析楼层号 + 正文片段
  const favoriteItems = useMemo<FavoriteItem[]>(() => {
    if (!session) return [];
    const byId = new Map(session.messages.map(m => [m.id, m]));
    return favorites
      .map(id => {
        const msg = byId.get(id);
        const snippet = (msg?.content ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || '（空消息）';
        return { messageId: id, floor: floorMap.get(id) ?? null, snippet };
      })
      // 按楼层排序，未解析到楼层的排最后
      .sort((a, b) => (a.floor ?? Infinity) - (b.floor ?? Infinity));
  }, [favorites, floorMap, session]);

  const handleSaveMarker = (marker: ChapterMarker) => {
    setMarkers(prev => {
      const existing = prev.findIndex(m => m.messageId === marker.messageId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = marker;
        return updated;
      }
      return [...prev, marker].sort((a, b) => a.messageIndex - b.messageIndex);
    });
  };

  const handleDeleteMarker = () => {
    if (!selectedMessage) return;
    const delId = selectedMessage.id;
    const delMarkers = markers.filter(m => m.messageId === delId);
    if (delMarkers.length === 0) return;
    setMarkers(prev => prev.filter(m => m.messageId !== delId));
    toast({
      title: '已删除章节标记',
      action: (
        <ToastAction altText="撤销删除" onClick={() => {
          setMarkers(prev =>
            prev.some(m => m.messageId === delId)
              ? prev
              : [...prev, ...delMarkers].sort((a, b) => a.messageIndex - b.messageIndex)
          );
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  const handleToggleEditMode = () => {
    setEditMode(!editMode);
  };

  const selectedMarker = selectedMessage 
    ? markers.find(m => m.messageId === selectedMessage.id)
    : undefined;

  return (
    <AppLayout
      leftActions={
        <>
          {/* 外观设置（顶栏最左常驻，popover 从左展开不遮正文） */}
          <SettingsPanel settings={settings} onSettingsChange={setSettings} />
          {/* 全文搜索：仅在有记录且不在章节标记模式时显示 */}
          {session && !editMode && (
            <MessageSearchBar
              query={searchQuery}
              onQueryChange={setSearchQuery}
              total={searchResult.total}
              current={searchResult.current}
              onNext={() => previewRef.current?.nextMatch()}
              onPrev={() => previewRef.current?.prevMatch()}
            />
          )}
        </>
      }
      actions={
        <EditorToolbar
          session={session}
          settings={settings}
          markers={markers}
          editMode={editMode}
          regexSidebarOpen={regexSidebarOpen}
          onLoadSession={setSession}
          onReset={handleReset}
          onSaveToBookshelf={handleSaveToBookshelf}
          onToggleEditMode={handleToggleEditMode}
          onToggleRegex={() => setRegexSidebarOpen(!regexSidebarOpen)}
        />
      }
    >
      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {!session ? (
          <div className="max-w-xl mx-auto animate-fade-in">
            {/* Tour replaces old onboarding */}
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl mb-3 text-gradient">处理你的对话记录</h2>
              <p className="text-muted-foreground">
                导入 SillyTavern 聊天记录，支持正则清理、章节标记、范围导出和多种阅读主题
              </p>
            </div>
            <ChatImporter onImport={handleImport} />
            
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
        ) : (
          <div className="flex flex-col">
            {/* Preview + Sidebars Row */}
            <div className="flex gap-4 items-start">
              {/* Preview Area */}
              <div className="flex-1 min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground shrink-0">
                    共 {session.messages.length} 条消息
                    {markers.length > 0 && (
                      <span className="ml-2 text-primary">· {markers.length} 个章节标记</span>
                    )}
                  </div>
                  {editMode && (
                    <div className="text-sm text-primary animate-pulse">
                      点击消息添加章节标记
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card/50" data-tour="chat-preview">
                  {/* 左侧悬浮竖向跳转条（fixed 自定位，不随滚动消失、不压缩阅读区） */}
                  <MessageNavBar
                    floorCount={floorCount}
                    currentFloor={currentFloor}
                    currentMessageId={currentFloorMsgId}
                    favorites={favoriteItems}
                    onJumpToFloor={(n) => previewRef.current?.scrollToFloor(n)}
                    onPrev={() => previewRef.current?.scrollToFloor(currentFloor - 1)}
                    onNext={() => previewRef.current?.scrollToFloor(currentFloor + 1)}
                    onToggleFavorite={handleToggleFavorite}
                    onJumpToMessageId={(id) => previewRef.current?.scrollToMessageId(id)}
                  />
                  <div className="flex justify-center py-6 px-4">
                    <div
                      style={{ width: settings.paperWidth, maxWidth: '100%' }}
                      className="shadow-warm rounded-lg overflow-hidden animate-fade-in"
                    >
                      <ChatPreview
                        ref={previewRef}
                        session={session}
                        theme={settings.theme}
                        showTimestamp={settings.showTimestamp}
                        showAvatar={settings.showAvatar}
                        fontSize={settings.fontSize}
                        regexRules={settings.regexRules}
                        markers={markers}
                        onMessageClick={handleMessageClick}
                        onEditMessage={handleEditMessage}
                        editMode={editMode}
                        fontFamily={settings.fontFamily}
                        previewRule={previewRule}
                        onVisibleFloorChange={handleVisibleFloorChange}
                        onFloorMapChange={handleFloorMapChange}
                        searchQuery={searchQuery}
                        onSearchResult={handleSearchResult}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Regex Sidebar */}
              <RegexSidebar
                rules={settings.regexRules}
                onRulesChange={(rules) => setSettings({ ...settings, regexRules: rules })}
                isOpen={regexSidebarOpen}
                onClose={() => { setRegexSidebarOpen(false); setPreviewRule(null); }}
                sampleMessages={session.messages}
                onPreviewChange={setPreviewRule}
                previewId={previewRule?.id ?? null}
              />
            </div>
          </div>
        )}
      </div>

      {/* Chapter Marker Dialog */}
      {selectedMessage && (
        <ChapterMarkerDialog
          open={markerDialogOpen}
          onOpenChange={setMarkerDialogOpen}
          messageId={selectedMessage.id}
          messageIndex={selectedMessage.index}
          existingMarker={selectedMarker}
          onSave={handleSaveMarker}
          onDelete={selectedMarker ? handleDeleteMarker : undefined}
        />
      )}

      {/* Message Edit Dialog */}
      {selectedMessage && session && (
        <MessageEditDialog
          open={messageEditDialogOpen}
          onOpenChange={setMessageEditDialogOpen}
          message={session.messages.find(m => m.id === selectedMessage.id) || null}
          onSave={handleSaveMessage}
          onDelete={handleDeleteMessage}
        />
      )}

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
        <p>ST 聊天记录处理器 v0.10.2</p>
        <p className="mt-1">
          <a href="https://github.com/LYC619/silly-tavern-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
          {' · MIT License'}
        </p>
      </footer>
    </AppLayout>
  );
};

export default Index;
