import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ScrollText, Settings, RefreshCw, BookmarkPlus, FileUp, Pencil, Library, Sparkles, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatImporter } from '@/components/ChatImporter';
import { ChatPreview } from '@/components/ChatPreview';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ExportButton } from '@/components/ExportButton';
import { DemoData } from '@/components/DemoData';
import { BatchMarkerImport } from '@/components/BatchMarkerImport';
import { ChapterMarkerDialog } from '@/components/ChapterMarkerDialog';
import { MessageEditDialog } from '@/components/MessageEditDialog';
import type { ChatSession, ExportSettings, ChapterMarker, ChatMessage } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';
import { saveBook, generateBookId, type BookItem } from '@/lib/bookshelf-db';
import { useToast } from '@/hooks/use-toast';

const defaultSettings: ExportSettings = {
  theme: 'elegant',
  showTimestamp: false,
  showAvatar: true,
  paperWidth: 600,
  fontSize: 15,
  prefixMode: 'name',
  regexRules: [...DEFAULT_REGEX_RULES],
};

const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(defaultSettings);
  const [markers, setMarkers] = useState<ChapterMarker[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [contentEditMode, setContentEditMode] = useState(false);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [messageEditDialogOpen, setMessageEditDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; index: number } | null>(null);
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number | null>(null);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);

  // Load book from navigation state (from bookshelf)
  useEffect(() => {
    const state = location.state as { book?: BookItem } | null;
    if (state?.book) {
      setSession(state.book.session);
      setMarkers(state.book.markers);
      setCurrentBookId(state.book.id);
      if (state.book.settings) {
        setSettings(state.book.settings);
      }
      // Clear the state to prevent reloading on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleReset = () => {
    setSession(null);
    setMarkers([]);
    setEditMode(false);
    setContentEditMode(false);
    setBatchImportOpen(false);
    setCurrentBookId(null);
  };

  const handleSaveToBookshelf = async () => {
    if (!session) return;
    try {
      const book: BookItem = {
        id: currentBookId || generateBookId(),
        title: session.title || session.character?.name || '未命名作品',
        session,
        markers,
        settings,
        createdAt: currentBookId ? Date.now() : Date.now(),
        updatedAt: Date.now(),
      };
      await saveBook(book);
      setCurrentBookId(book.id);
      toast({ title: '已保存到书架' });
    } catch (error) {
      toast({ title: '保存失败', variant: 'destructive' });
    }
  };

  const handleMessageClick = (messageId: string, messageIndex: number) => {
    if (batchImportOpen && activeChapterIndex !== null) {
      // 批量导入模式下，选择楼层
      setSelectedFloor(messageIndex + 1); // 楼层从1开始
    } else if (contentEditMode) {
      // 内容编辑模式
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMessageEditDialogOpen(true);
    } else if (editMode) {
      // 单个标记模式
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMarkerDialogOpen(true);
    }
  };

  const handleSaveMessage = (updatedMessage: ChatMessage) => {
    if (!session) return;
    setSession({
      ...session,
      messages: session.messages.map(msg => 
        msg.id === updatedMessage.id ? updatedMessage : msg
      ),
    });
  };

  const handleDeleteMessage = () => {
    if (!session || !selectedMessage) return;
    setSession({
      ...session,
      messages: session.messages.filter(msg => msg.id !== selectedMessage.id),
    });
    // 同时删除关联的章节标记
    setMarkers(prev => prev.filter(m => m.messageId !== selectedMessage.id));
  };

  // 重置 selectedFloor
  useEffect(() => {
    if (selectedFloor !== null) {
      const timer = setTimeout(() => setSelectedFloor(null), 100);
      return () => clearTimeout(timer);
    }
  }, [selectedFloor]);

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

  const handleBatchImport = (newMarkers: ChapterMarker[]) => {
    if (!session) return;
    const correctedMarkers = newMarkers.map(m => ({
      ...m,
      messageId: session.messages[m.messageIndex]?.id || m.messageId,
    }));
    setMarkers(prev => {
      const merged = [...prev];
      for (const marker of correctedMarkers) {
        const existing = merged.findIndex(m => m.messageIndex === marker.messageIndex);
        if (existing >= 0) {
          merged[existing] = marker;
        } else {
          merged.push(marker);
        }
      }
      return merged.sort((a, b) => a.messageIndex - b.messageIndex);
    });

    // 导入完成后，自动切到“章节标记”编辑模式，方便继续微调
    setBatchImportOpen(false);
    setEditMode(true);
  };

  const handleDeleteMarker = () => {
    if (selectedMessage) {
      setMarkers(prev => prev.filter(m => m.messageId !== selectedMessage.id));
    }
  };

  const selectedMarker = selectedMessage 
    ? markers.find(m => m.messageId === selectedMessage.id)
    : undefined;

  return (
    <div className="min-h-screen paper-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <ScrollText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">ST 对话美化器</h1>
              <p className="text-xs text-muted-foreground">SillyTavern Chat Beautifier</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Navigation Buttons */}
            <Button variant="ghost" size="sm" onClick={() => navigate('/bookshelf')}>
              <Library className="w-4 h-4 mr-2" />
              书架
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/ai-tools')}>
              <Sparkles className="w-4 h-4 mr-2" />
              AI工具
            </Button>

            <div className="w-px h-6 bg-border mx-1" />

            {!session && <DemoData onLoad={setSession} />}
            {session && (
              <>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  重新导入
                </Button>
                <Button variant="outline" size="sm" onClick={handleSaveToBookshelf}>
                  <Save className="w-4 h-4 mr-2" />
                  保存到书架
                </Button>
                <Button 
                  variant={contentEditMode ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => {
                    setContentEditMode(!contentEditMode);
                    if (!contentEditMode) {
                      setEditMode(false);
                      setBatchImportOpen(false);
                    }
                  }}
                  className={contentEditMode ? 'gold-gradient text-primary-foreground' : ''}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  {contentEditMode ? '退出编辑' : '编辑内容'}
                </Button>
                <Button 
                  variant={editMode ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => {
                    setEditMode(!editMode);
                    if (!editMode) {
                      setContentEditMode(false);
                      setBatchImportOpen(false);
                    }
                  }}
                  className={editMode ? 'gold-gradient text-primary-foreground' : ''}
                >
                  <BookmarkPlus className="w-4 h-4 mr-2" />
                  {editMode ? '退出标记' : '章节标记'}
                </Button>
                <Button 
                  variant={batchImportOpen ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => {
                    setBatchImportOpen(!batchImportOpen);
                    if (!batchImportOpen) {
                      setContentEditMode(false);
                      setEditMode(false);
                    }
                  }}
                  className={batchImportOpen ? 'gold-gradient text-primary-foreground' : ''}
                >
                  <FileUp className="w-4 h-4 mr-2" />
                  导入总结
                </Button>
                <ExportButton session={session} settings={settings} markers={markers} />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1">
        {!session ? (
          <div className="max-w-xl mx-auto animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl mb-3 text-gradient">美化你的对话记录</h2>
              <p className="text-muted-foreground">
                将 SillyTavern 的聊天记录转换为精美的图片，支持多种主题风格
              </p>
            </div>
            <ChatImporter onImport={setSession} />
            
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
            {/* Settings Panel (horizontal) */}
            <div className="mb-4 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3 text-muted-foreground">
                <Settings className="w-4 h-4" />
                <span className="font-display text-sm uppercase tracking-wider">设置</span>
              </div>
              <SettingsPanel settings={settings} onSettingsChange={setSettings} />
            </div>

            {/* Preview + Batch Import Row */}
            <div className="flex gap-4 items-start">
              {/* Preview Area */}
              <div className="flex-1 min-w-0">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    共 {session.messages.length} 条消息
                    {markers.length > 0 && (
                      <span className="ml-2 text-primary">· {markers.length} 个章节标记</span>
                    )}
                  </div>
                  {(editMode || batchImportOpen || contentEditMode) && (
                    <div className="text-sm text-primary animate-pulse">
                      {batchImportOpen 
                        ? '点击消息选择楼层' 
                        : contentEditMode 
                          ? '点击消息编辑内容'
                          : '点击消息添加章节标记'}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card/50">
                  <div className="flex justify-center py-6 px-4">
                    <div 
                      style={{ width: Math.min(settings.paperWidth, batchImportOpen ? 520 : settings.paperWidth) }}
                      className="shadow-warm rounded-lg overflow-hidden animate-fade-in"
                    >
                      <ChatPreview
                        session={session}
                        theme={settings.theme}
                        showTimestamp={settings.showTimestamp}
                        showAvatar={settings.showAvatar}
                        fontSize={settings.fontSize}
                        regexRules={settings.regexRules}
                        markers={markers}
                        onMessageClick={handleMessageClick}
                        editMode={editMode || batchImportOpen || contentEditMode}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Batch Import Sidebar */}
              {batchImportOpen && session && (
                <BatchMarkerImport
                  totalMessages={session.messages.length}
                  onImport={handleBatchImport}
                  isOpen={batchImportOpen}
                  onClose={() => setBatchImportOpen(false)}
                  selectedFloor={selectedFloor}
                  activeChapterIndex={activeChapterIndex}
                  onSetActiveChapter={setActiveChapterIndex}
                />
              )}
            </div>
          </div>
        )}
      </main>

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

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground flex-shrink-0">
        <p>SillyTavern 对话美化工具 · 让每一段对话都成为艺术</p>
      </footer>
    </div>
  );
};

export default Index;
