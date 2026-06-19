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
  saveSessionState, 
  loadSessionState, 
  clearSessionState,
  getInitialRegexRules,
  saveSettings,
  loadSettings,
} from '@/lib/session-storage';
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
  const [contentEditMode, setContentEditMode] = useState(false);
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
      const savedState = loadSessionState();
      if (savedState?.session) {
        setSession(savedState.session);
        setMarkers(savedState.markers);
        setFavorites(savedState.favorites ?? []);
        setCurrentBookId(savedState.currentBookId);
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

  // 保存状态到 sessionStorage（防抖）
  // 注意：依赖不含 settings——否则改字号/宽度/主题等纯样式操作会触发对整份(可能数十万字)
  // session 的 JSON.stringify，造成「松手卡一下」。settings 本身已单独持久化到 localStorage，
  // 这里用 ref 取其最新值随 session/markers 变化时一并存即可。
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // 只在首次配额溢出时提示一次，避免每次防抖保存都弹 toast 刷屏
  const quotaWarnedRef = useRef(false);
  useEffect(() => {
    if (session) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const ok = saveSessionState({ session, markers, currentBookId, settings: settingsRef.current, favorites });
        if (!ok && !quotaWarnedRef.current) {
          quotaWarnedRef.current = true;
          toast({
            title: '临时缓存已满，跨页可能丢失编辑',
            description: '这份记录较大，超出浏览器临时存储上限。请点「保存到书架」持久化，避免切换页面后丢失改动。',
            variant: 'destructive',
          });
        }
      }, 500);
    }
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [session, markers, currentBookId, favorites, toast]);

  // 保存设置变更到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

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
    setContentEditMode(false);
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

  const handleMessageClick = useCallback((messageId: string, messageIndex: number) => {
    if (contentEditMode) {
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMessageEditDialogOpen(true);
    } else if (editMode) {
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMarkerDialogOpen(true);
    }
  }, [contentEditMode, editMode]);

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

  const handleToggleContentEdit = () => {
    setContentEditMode(!contentEditMode);
    if (!contentEditMode) {
      setEditMode(false);
    }
  };

  const handleToggleEditMode = () => {
    setEditMode(!editMode);
    if (!editMode) {
      setContentEditMode(false);
    }
  };

  const selectedMarker = selectedMessage 
    ? markers.find(m => m.messageId === selectedMessage.id)
    : undefined;

  return (
    <AppLayout
      actions={
        <EditorToolbar
          session={session}
          settings={settings}
          markers={markers}
          editMode={editMode}
          contentEditMode={contentEditMode}
          regexSidebarOpen={regexSidebarOpen}
          onLoadSession={setSession}
          onReset={handleReset}
          onSaveToBookshelf={handleSaveToBookshelf}
          onToggleContentEdit={handleToggleContentEdit}
          onToggleEditMode={handleToggleEditMode}
          onToggleRegex={() => setRegexSidebarOpen(!regexSidebarOpen)}
          onSettingsChange={setSettings}
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
                  {(editMode || contentEditMode) ? (
                    <div className="text-sm text-primary animate-pulse">
                      {contentEditMode
                        ? '点击消息编辑内容'
                        : '点击消息添加章节标记'}
                    </div>
                  ) : (
                    <MessageSearchBar
                      query={searchQuery}
                      onQueryChange={setSearchQuery}
                      total={searchResult.total}
                      current={searchResult.current}
                      onNext={() => previewRef.current?.nextMatch()}
                      onPrev={() => previewRef.current?.prevMatch()}
                    />
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
                        editMode={editMode || contentEditMode}
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
        <p>ST 聊天记录处理器 v0.9</p>
        <p className="mt-1">
          <a href="https://github.com/LYC619/silly-tavern-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
          {' · MIT License'}
        </p>
      </footer>
    </AppLayout>
  );
};

export default Index;
