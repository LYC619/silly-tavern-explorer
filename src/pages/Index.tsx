import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { ScrollText, Settings, Regex } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatImporter } from '@/components/ChatImporter';
import { ChatPreview } from '@/components/ChatPreview';
import { SettingsPanel } from '@/components/SettingsPanel';
import { EditorToolbar } from '@/components/EditorToolbar';
import { ChapterMarkerDialog } from '@/components/ChapterMarkerDialog';
import { MessageEditDialog } from '@/components/MessageEditDialog';
import { RegexSidebar } from '@/components/RegexSidebar';
import { GuidedTour } from '@/components/GuidedTour';
import { HOME_TOUR_STEPS, isTourCompleted, setTourCompleted } from '@/lib/tour-steps';
import { demoSession } from '@/components/DemoData';
import type { ChatSession, ExportSettings, ChapterMarker, ChatMessage } from '@/types/chat';
import { saveBook, generateBookId, type BookItem } from '@/lib/bookshelf-db';
import { 
  saveSessionState, 
  loadSessionState, 
  clearSessionState,
  getInitialRegexRules,
  saveSettings,
  loadSettings,
} from '@/lib/session-storage';
import { useToast } from '@/hooks/use-toast';

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
  const [editMode, setEditMode] = useState(false);
  const [contentEditMode, setContentEditMode] = useState(false);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [messageEditDialogOpen, setMessageEditDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; index: number } | null>(null);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [regexSidebarOpen, setRegexSidebarOpen] = useState(false);

  // Load book from navigation state (from bookshelf) or session storage
  useEffect(() => {
    const state = location.state as { book?: BookItem } | null;
    if (state?.book) {
      setSession(state.book.session);
      setMarkers(state.book.markers);
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
        setCurrentBookId(savedState.currentBookId);
      }
    }
  }, [location.state]);

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

  // 保存状态到 sessionStorage
  useEffect(() => {
    if (session) {
      saveSessionState({ session, markers, currentBookId, settings });
    }
  }, [session, markers, currentBookId, settings]);

  // 保存设置变更到 localStorage
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleReset = () => {
    setSession(null);
    setMarkers([]);
    setEditMode(false);
    setContentEditMode(false);
    setCurrentBookId(null);
    setRegexSidebarOpen(false);
    clearSessionState();
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
    if (contentEditMode) {
      setSelectedMessage({ id: messageId, index: messageIndex });
      setMessageEditDialogOpen(true);
    } else if (editMode) {
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
    setMarkers(prev => prev.filter(m => m.messageId !== selectedMessage.id));
  };

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
    if (selectedMessage) {
      setMarkers(prev => prev.filter(m => m.messageId !== selectedMessage.id));
    }
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
    <div className="min-h-screen paper-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
              <ScrollText className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">ST 聊天记录处理器</h1>
              <p className="text-xs text-muted-foreground">SillyTavern Chat Processor</p>
            </div>
          </div>

          <EditorToolbar
            session={session}
            settings={settings}
            markers={markers}
            editMode={editMode}
            contentEditMode={contentEditMode}
            onLoadSession={setSession}
            onReset={handleReset}
            onSaveToBookshelf={handleSaveToBookshelf}
            onToggleContentEdit={handleToggleContentEdit}
            onToggleEditMode={handleToggleEditMode}
          />
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1">
        {!session ? (
          <div className="max-w-xl mx-auto animate-fade-in">
            {/* Tour replaces old onboarding */}
            <div className="text-center mb-8">
              <h2 className="font-display text-3xl mb-3 text-gradient">处理你的对话记录</h2>
              <p className="text-muted-foreground">
                导入 SillyTavern 聊天记录，支持正则清理、章节标记、范围导出和多种阅读主题
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
          <div className="flex flex-col h-full">
            {/* Settings Panel (horizontal) */}
            <div className="mb-4 flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Settings className="w-4 h-4" />
                  <span className="font-display text-sm uppercase tracking-wider">设置</span>
                </div>
                <Button
                  variant={regexSidebarOpen ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setRegexSidebarOpen(!regexSidebarOpen)}
                  className="gap-2"
                  data-tour="regex-toggle"
                >
                  <Regex className="w-4 h-4" />
                  正则规则
                  <span className="text-xs text-muted-foreground">
                    ({settings.regexRules.filter(r => !r.disabled).length})
                  </span>
                </Button>
              </div>
              <SettingsPanel settings={settings} onSettingsChange={setSettings} />
            </div>

            {/* Preview + Sidebars Row */}
            <div className="flex gap-4 items-start flex-1 min-h-0">
              {/* Preview Area */}
              <div className="flex-1 min-w-0">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    共 {session.messages.length} 条消息
                    {markers.length > 0 && (
                      <span className="ml-2 text-primary">· {markers.length} 个章节标记</span>
                    )}
                  </div>
                  {(editMode || contentEditMode) && (
                    <div className="text-sm text-primary animate-pulse">
                      {contentEditMode 
                        ? '点击消息编辑内容'
                        : '点击消息添加章节标记'}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-border bg-card/50" data-tour="chat-preview">
                  <div className="flex justify-center py-6 px-4">
                    <div 
                      style={{ width: Math.min(settings.paperWidth, regexSidebarOpen ? 520 : settings.paperWidth) }}
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
                        editMode={editMode || contentEditMode}
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
                onClose={() => setRegexSidebarOpen(false)}
              />
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
        <p>ST 聊天记录处理器 v0.8</p>
        <p className="mt-1">
          <a href="https://github.com/LYC619/silly-tavern-explorer" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
          {' · MIT License'}
        </p>
      </footer>
    </div>
  );
};

export default Index;
