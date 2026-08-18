/**
 * 统一聊天工作台（2.0 阶段2，定稿 5.1 / 第六章）。
 * 聊天处理页（未绑定）与故事工作区（已绑定）共用的同一套阅读与编辑界面：
 * 预览/搜索/每楼编辑/swipe 切换/章节标记/收藏/正则侧栏/隐藏楼与 OOC 开关/标题改名。
 *
 * 数据态（session/markers/favorites/settings）由父页持有并负责持久化
 * （聊天处理页 → 书架自动同步；工作区 → 归档故事防抖落库），
 * 本组件只持 UI 态。父页切换数据源（如切分支）时应换 key 重挂，内部 UI 态随之复位。
 */
import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Eye, EyeOff, Pencil, MessageSquareDashed } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ChatPreview, type ChatPreviewHandle } from '@/components/chat/ChatPreview';
import { MessageNavBar, type FavoriteItem } from '@/components/chat/MessageNavBar';
import { MessageSearchBar } from '@/components/chat/MessageSearchBar';
import { EditorToolbar } from '@/components/chat/EditorToolbar';
import { ChapterMarkerDialog } from '@/components/chat/ChapterMarkerDialog';
import { MessageEditDialog } from '@/components/chat/MessageEditDialog';
import { RegexSidebar } from '@/components/chat/RegexSidebar';
import { SettingsPanel } from '@/components/chat/SettingsPanel';
import { applyRegexRules } from '@/lib/regex-processor';
import { selectSwipe, syncEditedMessage, isOOCMessage } from '@/lib/chat-edit';
import type { ChatSession, ExportSettings, ChapterMarker, ChatMessage, RegexRule } from '@/types/chat';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

export interface ChatWorkbenchHandle {
  /** 跳到第 floor 楼（0-based，与界面 #N 一致） */
  scrollToFloor: (floor: number) => void;
  /** 按 messageId 跳转（章节/书签列表用） */
  scrollToMessageId: (messageId: string) => void;
}

interface ChatWorkbenchProps {
  session: ChatSession;
  markers: ChapterMarker[];
  favorites: string[];
  settings: ExportSettings;
  onSessionChange?: (next: ChatSession) => void;
  onMarkersChange?: (next: ChapterMarker[]) => void;
  onFavoritesChange: (next: string[]) => void;
  onSettingsChange: (next: ExportSettings) => void;
  /** 顶部可见楼层变化（父页存阅读位置） */
  onFloorChange?: (floor: number) => void;
  /** 挂载后恢复到的楼层（等虚拟列表就绪后跳一次） */
  initialFloor?: number;
  /** 标题行左侧徽标位（「未绑定」横幅 / 分支名等） */
  titleBadge?: React.ReactNode;
  /** 工具条右侧追加动作（绑定按钮 / 沉浸阅读等） */
  toolbarExtras?: React.ReactNode;
  /** 重新导入（清空当前记录）；不传则不显示 */
  onReset?: () => void;
  /** 就地阅读模式（10.3b）：只保留阅读增强和非破坏性操作 */
  readerMode?: boolean;
  /** 就地阅读返回栏的实测高度；工作台工具栏与楼层栏按此向下堆叠。 */
  readerStickyTop?: number;
}

export const ChatWorkbench = forwardRef<ChatWorkbenchHandle, ChatWorkbenchProps>(function ChatWorkbench(
  {
    session, markers, favorites, settings,
    onSessionChange, onMarkersChange, onFavoritesChange, onSettingsChange,
    onFloorChange, initialFloor, titleBadge, toolbarExtras, onReset, readerMode,
    readerStickyTop = 0,
  },
  ref,
) {
  const { toast } = useToast();
  // 撤销闭包/连续操作要读「最新」数据，props 在闭包里会过期，走 ref 中转
  const sessionRef = useRef(session);
  const markersRef = useRef(markers);
  const favoritesRef = useRef(favorites);
  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { markersRef.current = markers; }, [markers]);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  const mutateSession = useCallback((fn: (cur: ChatSession) => ChatSession) => {
    if (readerMode) return;
    onSessionChange?.(fn(sessionRef.current));
  }, [onSessionChange, readerMode]);
  const mutateMarkers = useCallback((fn: (cur: ChapterMarker[]) => ChapterMarker[]) => {
    if (readerMode) return;
    onMarkersChange?.(fn(markersRef.current));
  }, [onMarkersChange, readerMode]);
  const mutateFavorites = useCallback((fn: (cur: string[]) => string[]) => {
    onFavoritesChange(fn(favoritesRef.current));
  }, [onFavoritesChange]);

  // 跳楼层：ChatPreview 命令式句柄 + 当前顶部可见楼层 + messageId→楼层号映射
  const previewRef = useRef<ChatPreviewHandle>(null);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [currentFloorMsgId, setCurrentFloorMsgId] = useState<string | null>(null);
  const [floorCount, setFloorCount] = useState(0);
  const [floorMap, setFloorMap] = useState<Map<string, number>>(new Map());
  const onFloorChangeRef = useRef(onFloorChange);
  useEffect(() => { onFloorChangeRef.current = onFloorChange; }, [onFloorChange]);
  const floorMessageIds = useMemo(() => {
    const ids: Array<string | undefined> = [];
    floorMap.forEach((floor, messageId) => { ids[floor] = messageId; });
    return ids;
  }, [floorMap]);
  const jumpToFloor = useCallback((floor: number) => {
    if (floorCount <= 0) return;
    const target = Math.min(Math.max(floor, 0), floorCount - 1);
    setCurrentFloor(target);
    setCurrentFloorMsgId(floorMessageIds[target] ?? null);
    onFloorChangeRef.current?.(target);
    previewRef.current?.scrollToFloor(target);
  }, [floorCount, floorMessageIds]);
  const jumpToMessageId = useCallback((messageId: string) => {
    const target = floorMap.get(messageId);
    if (target !== undefined) {
      setCurrentFloor(target);
      setCurrentFloorMsgId(messageId);
      onFloorChangeRef.current?.(target);
    }
    previewRef.current?.scrollToMessageId(messageId);
  }, [floorMap]);
  // 待恢复的楼层号；等 ChatPreview 首次上报楼层映射后消费一次
  const pendingRestoreFloorRef = useRef<number | null>(
    typeof initialFloor === 'number' && initialFloor > 0 ? initialFloor : null,
  );
  // 全文搜索
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState({ total: 0, current: 0 });
  const handleSearchResult = useCallback((total: number, current: number) => {
    setSearchResult({ total, current });
  }, []);
  const [editMode, setEditMode] = useState(false);
  // 隐藏楼 / OOC 注释楼：分开标类型、分开开关（默认全展示，归档场景倾向保留一切）
  const [showHidden, setShowHidden] = useState(true);
  const [showOOC, setShowOOC] = useState(true);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [messageEditDialogOpen, setMessageEditDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; index: number } | null>(null);
  const [regexSidebarOpen, setRegexSidebarOpen] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(0);

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const measure = () => setToolbarHeight(toolbar.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);
  // 正在主界面原地预览的正则规则（点侧栏「预览」时设置，再次点取消）
  const [previewRule, setPreviewRule] = useState<RegexRule | null>(null);

  // 载入记录后自动展开正则框一次，让用户第一时间看到清理工具；之后可自由关闭
  // （就地阅读模式不自动弹：阅读场景以正文为主）
  const regexAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!regexAutoOpenedRef.current) {
      regexAutoOpenedRef.current = true;
      if (!readerMode) setRegexSidebarOpen(true);
    }
  }, [readerMode]);

  // 恢复滚动位置：楼层映射首次就绪（虚拟列表已挂载）后跳一次，
  // 稍作延迟等首帧布局/scrollMargin 测量稳定，否则 scrollToIndex 会落点偏移。
  useEffect(() => {
    const floor = pendingRestoreFloorRef.current;
    if (floor == null || floorCount === 0) return;
    pendingRestoreFloorRef.current = null;
    const t = setTimeout(() => {
      jumpToFloor(floor);
    }, 150);
    return () => clearTimeout(t);
  }, [floorCount, jumpToFloor]);

  useImperativeHandle(ref, () => ({
    scrollToFloor: jumpToFloor,
    scrollToMessageId: jumpToMessageId,
  }), [jumpToFloor, jumpToMessageId]);

  // 章节标记模式：点任意楼弹出章节标记对话框
  const handleMessageClick = useCallback((messageId: string, messageIndex: number) => {
    if (!readerMode && editMode) {
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMarkerDialogOpen(true);
    }
  }, [editMode, readerMode]);

  // 点某楼右上角铅笔：直接打开该楼编辑窗口（不经「编辑模式」，所见即点）
  const handleEditMessage = useCallback((messageId: string, messageIndex: number) => {
    if (readerMode) return;
    setSelectedMessage({ id: messageId, index: messageIndex });
    setMessageEditDialogOpen(true);
  }, [readerMode]);

  const handleSaveMessage = (updatedMessage: ChatMessage) => {
    if (readerMode) return;
    // 同步 rawData.mes + swipes[swipe_id]：STE 里改完导回 ST 不被旧 swipe 文本顶掉
    const synced = syncEditedMessage(updatedMessage);
    // 快照编辑前的整条消息，用于撤销（删段/改内容/改说话人都走这里）
    const prevMessage = sessionRef.current.messages.find(msg => msg.id === synced.id);
    mutateSession(cur => ({
      ...cur,
      messages: cur.messages.map(msg => (msg.id === synced.id ? synced : msg)),
    }));
    if (!prevMessage) return;
    const changed =
      prevMessage.content !== synced.content ||
      prevMessage.name !== synced.name ||
      prevMessage.role !== synced.role;
    if (!changed) return;
    toast({
      title: '已修改该楼',
      action: (
        <ToastAction altText="撤销修改" onClick={() => {
          mutateSession(cur => ({
            ...cur,
            messages: cur.messages.map(m => (m.id === prevMessage.id ? prevMessage : m)),
          }));
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  const handleDeleteMessage = () => {
    if (readerMode) return;
    if (!selectedMessage) return;
    const delId = selectedMessage.id;
    const cur = sessionRef.current;
    // 快照被删数据用于撤销：消息本身+原位置、联动删除的章节标记、收藏归属
    const delIndex = cur.messages.findIndex(m => m.id === delId);
    const delMessage = cur.messages[delIndex];
    if (!delMessage) return;
    const delMarkers = markersRef.current.filter(m => m.messageId === delId);
    const wasFavorite = favoritesRef.current.includes(delId);

    mutateSession(c => ({ ...c, messages: c.messages.filter(msg => msg.id !== delId) }));
    mutateMarkers(prev => prev.filter(m => m.messageId !== delId));
    mutateFavorites(prev => prev.filter(id => id !== delId));

    toast({
      title: '已删除该楼',
      description: delMarkers.length > 0 ? '连同其章节标记一并删除' : undefined,
      action: (
        <ToastAction altText="撤销删除" onClick={() => {
          // 把消息插回原位置，并恢复其标记/收藏
          mutateSession(c => {
            if (c.messages.some(m => m.id === delId)) return c; // 已存在则不重复插
            const msgs = [...c.messages];
            msgs.splice(Math.min(delIndex, msgs.length), 0, delMessage);
            return { ...c, messages: msgs };
          });
          if (delMarkers.length > 0) {
            mutateMarkers(prev => [...prev, ...delMarkers].sort((a, b) => a.messageIndex - b.messageIndex));
          }
          if (wasFavorite) {
            mutateFavorites(prev => (prev.includes(delId) ? prev : [...prev, delId]));
          }
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  // 切换某楼 swipe 候选：content/mes/swipe_id/时间戳 同步（lib/chat-edit 纯函数）
  const handleSwipeSelect = useCallback((messageId: string, targetId: number) => {
    if (readerMode) return;
    mutateSession(cur => ({
      ...cur,
      messages: cur.messages.map(m => (m.id === messageId ? selectSwipe(m, targetId) : m)),
    }));
  }, [mutateSession, readerMode]);

  // 收藏/取消收藏某楼（messageId）。轻量书签，仅用于跳转，不进导出。
  const handleToggleFavorite = useCallback((messageId: string) => {
    mutateFavorites(prev =>
      prev.includes(messageId) ? prev.filter(id => id !== messageId) : [...prev, messageId],
    );
  }, [mutateFavorites]);

  // ChatPreview 上报顶部可见楼层
  const handleVisibleFloorChange = useCallback((floor: number, messageId: string | null) => {
    setCurrentFloor(floor);
    setCurrentFloorMsgId(messageId);
    onFloorChangeRef.current?.(floor);
  }, []);

  // ChatPreview 上报楼层映射（顺序变化时），同步总楼层数
  const handleFloorMapChange = useCallback((map: Map<string, number>) => {
    setFloorMap(map);
    setFloorCount(map.size);
  }, []);

  // 收藏列表项：按 messageId 解析楼层号 + 正文片段
  const favoriteItems = useMemo<FavoriteItem[]>(() => {
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

  // 隐藏楼 / OOC 楼计数（决定是否显示各自的显隐开关）
  const { hiddenCount, oocCount } = useMemo(() => {
    let hidden = 0;
    let ooc = 0;
    for (const m of session.messages) {
      if (!m.hidden) continue;
      if (isOOCMessage(m)) ooc++;
      else hidden++;
    }
    return { hiddenCount: hidden, oocCount: ooc };
  }, [session]);

  // 标题就地重命名（父页持久化会随 session.title 自动保存）
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const startTitleEdit = () => {
    if (readerMode) return;
    setTitleDraft(session.title);
    setTitleEditing(true);
  };
  const commitTitleEdit = () => {
    if (readerMode) return;
    setTitleEditing(false);
    const next = titleDraft.trim();
    if (!next || next === session.title) return;
    mutateSession(cur => ({ ...cur, title: next }));
    toast({ title: '已重命名', description: next });
  };

  const handleSaveMarker = (marker: ChapterMarker) => {
    if (readerMode) return;
    mutateMarkers(prev => {
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
    if (readerMode) return;
    if (!selectedMessage) return;
    const delId = selectedMessage.id;
    const delMarkers = markersRef.current.filter(m => m.messageId === delId);
    if (delMarkers.length === 0) return;
    mutateMarkers(prev => prev.filter(m => m.messageId !== delId));
    toast({
      title: '已删除章节标记',
      action: (
        <ToastAction altText="撤销删除" onClick={() => {
          mutateMarkers(prev =>
            prev.some(m => m.messageId === delId)
              ? prev
              : [...prev, ...delMarkers].sort((a, b) => a.messageIndex - b.messageIndex),
          );
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  // 正则「应用到原文」：把当前启用规则的处理结果写回消息原文（含 rawData.mes 与当前 swipe，
  // 保证导回 ST 也生效），父页持久化随 onSessionChange 落库；应用后自动停用这些规则。
  const handleApplyRegexToOriginal = () => {
    if (readerMode) return;
    const cur = sessionRef.current;
    const activeRules = settings.regexRules.filter(r => !r.disabled);
    if (activeRules.length === 0) {
      toast({ title: '没有已启用的正则规则', variant: 'destructive' });
      return;
    }
    const prevMessages = cur.messages;
    const prevRules = settings.regexRules;
    let changed = 0;
    const nextMessages = cur.messages.map(msg => {
      const next = applyRegexRules(msg.content, activeRules, msg.role === 'user').trim();
      if (next === msg.content) return msg;
      changed++;
      return syncEditedMessage({ ...msg, content: next });
    });
    if (changed === 0) {
      toast({ title: '没有需要修改的楼层', description: '当前启用的规则对原文没有产生改动' });
      return;
    }
    mutateSession(c => ({ ...c, messages: nextMessages }));
    onSettingsChange({ ...settings, regexRules: prevRules.map(r => (r.disabled ? r : { ...r, disabled: true })) });
    toast({
      title: `已将正则结果写入 ${changed} 个楼层的原文`,
      description: '用过的规则已自动停用；持久化与导出均使用新文本',
      action: (
        <ToastAction altText="撤销应用" onClick={() => {
          mutateSession(c => ({ ...c, messages: prevMessages }));
          onSettingsChange({ ...settings, regexRules: prevRules });
        }}>
          撤销
        </ToastAction>
      ),
    });
  };

  const selectedMarker = selectedMessage
    ? markers.find(m => m.messageId === selectedMessage.id)
    : undefined;

  return (
    <div className="flex flex-col">
      {/* 工作台自带工具条（不占用 AppLayout header 槽，工作区/聊天处理页共用） */}
      <div
        ref={toolbarRef}
        className={`sticky z-40 border-b border-border bg-card/60 backdrop-blur-sm ${readerMode ? '' : 'top-0'}`}
        style={readerMode ? { top: readerStickyTop } : undefined}
      >
        <div className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
          {/* 左侧常驻：外观 + 搜索（popover 从左展开不遮正文） */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} />
            {!editMode && (
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
          {/* 右侧操作：处理 + 输入输出 + 父页追加 */}
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <EditorToolbar
              session={session}
              settings={settings}
              markers={markers}
              editMode={editMode}
              regexSidebarOpen={regexSidebarOpen}
              onReset={readerMode ? undefined : onReset}
              onToggleEditMode={() => { if (!readerMode) setEditMode(!editMode); }}
              onToggleRegex={() => setRegexSidebarOpen(!regexSidebarOpen)}
              hideChapterMark={readerMode}
            />
            {toolbarExtras}
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        {/* Preview + Sidebars Row */}
        <div className="flex gap-4 items-start">
          {/* Preview Area */}
          <div className="flex-1 min-w-0">
            {!readerMode && <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0 flex-wrap">
                {titleBadge}
                {!readerMode && titleEditing ? (
                  <Input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTitleEdit();
                      if (e.key === 'Escape') setTitleEditing(false);
                    }}
                    className="h-7 w-64 max-w-full"
                    placeholder="作品标题"
                  />
                ) : readerMode ? (
                  <span className="truncate max-w-[16rem] font-medium text-foreground">
                    {session.title || '未命名作品'}
                  </span>
                ) : (
                  <button
                    onClick={startTitleEdit}
                    className="group flex items-center gap-1 min-w-0"
                    title="点击重命名（标题会自动保存，并用于导出文件名）"
                  >
                    <span className="truncate max-w-[16rem] font-medium text-foreground">{session.title || '未命名作品'}</span>
                    <Pencil className="w-3 h-3 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity" />
                  </button>
                )}
                <span className="shrink-0">共 {session.messages.length} 条消息</span>
                {markers.length > 0 && (
                  <span className="text-primary shrink-0">· {markers.length} 个章节标记</span>
                )}
                {hiddenCount > 0 && (
                  <button
                    onClick={() => setShowHidden(v => !v)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                    title="这些楼层在 SillyTavern 里被 Hide，仍会正常导入；点击切换是否展示"
                  >
                    {showHidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    {showHidden ? '隐藏' : '显示'} {hiddenCount} 个隐藏楼层
                  </button>
                )}
                {oocCount > 0 && (
                  <button
                    onClick={() => setShowOOC(v => !v)}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
                    title="OOC/注释楼（ST 的 /comment），与隐藏楼层独立开关"
                  >
                    <MessageSquareDashed className="w-3.5 h-3.5" />
                    {showOOC ? '隐藏' : '显示'} {oocCount} 条 OOC
                  </button>
                )}
              </div>
              {!readerMode && editMode && (
                <div className="text-sm text-primary animate-pulse">
                  点击消息添加章节标记
                </div>
              )}
            </div>}

            <div
              data-chat-preview-shell
              className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
              data-tour="chat-preview"
            >
              {/* 楼层工具由正文卡片持有，不再依赖全局侧栏宽度计算视口坐标。 */}
              <MessageNavBar
                floorCount={floorCount}
                currentFloor={currentFloor}
                currentMessageId={currentFloorMsgId}
                favorites={favoriteItems}
                onJumpToFloor={jumpToFloor}
                onPrev={() => jumpToFloor(currentFloor - 1)}
                onNext={() => jumpToFloor(currentFloor + 1)}
                onToggleFavorite={handleToggleFavorite}
                onJumpToMessageId={jumpToMessageId}
                stickyTop={readerStickyTop + toolbarHeight + 8}
              />
              <div className={`flex min-w-0 flex-1 justify-center py-3 ${readerMode ? 'px-1' : 'pr-3'}`}>
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
                    onMessageClick={readerMode ? undefined : handleMessageClick}
                    onEditMessage={readerMode ? undefined : handleEditMessage}
                    onSwipeSelect={readerMode ? undefined : handleSwipeSelect}
                    editMode={readerMode ? false : editMode}
                    fontFamily={settings.fontFamily}
                    previewRule={previewRule}
                    onVisibleFloorChange={handleVisibleFloorChange}
                    onFloorMapChange={handleFloorMapChange}
                    searchQuery={searchQuery}
                    onSearchResult={handleSearchResult}
                    showHidden={showHidden}
                    showOOC={showOOC}
                    scrollPaddingStart={readerMode ? readerStickyTop + toolbarHeight + 8 : 0}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Regex Sidebar */}
          <RegexSidebar
            rules={settings.regexRules}
            onRulesChange={(rules) => { if (!readerMode) onSettingsChange({ ...settings, regexRules: rules }); }}
            readOnly={readerMode}
            isOpen={regexSidebarOpen}
            onClose={() => { setRegexSidebarOpen(false); setPreviewRule(null); }}
            sampleMessages={session.messages}
            onPreviewChange={setPreviewRule}
            previewId={previewRule?.id ?? null}
            onApplyToOriginal={readerMode ? undefined : handleApplyRegexToOriginal}
          />
        </div>
      </div>

      {/* Chapter Marker Dialog */}
      {!readerMode && selectedMessage && (
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
      {!readerMode && selectedMessage && (
        <MessageEditDialog
          open={messageEditDialogOpen}
          onOpenChange={setMessageEditDialogOpen}
          message={session.messages.find(m => m.id === selectedMessage.id) || null}
          onSave={handleSaveMessage}
          onDelete={handleDeleteMessage}
        />
      )}
    </div>
  );
});
