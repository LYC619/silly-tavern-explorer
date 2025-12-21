import { useState, useRef } from 'react';
import { ScrollText, Settings, RefreshCw, BookmarkPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatImporter } from '@/components/ChatImporter';
import { ChatPreview } from '@/components/ChatPreview';
import { SettingsPanel } from '@/components/SettingsPanel';
import { ExportButton } from '@/components/ExportButton';
import { TxtExportButton } from '@/components/TxtExportButton';
import { DemoData } from '@/components/DemoData';
import { ChapterMarkerDialog } from '@/components/ChapterMarkerDialog';
import type { ChatSession, ExportSettings, ChapterMarker } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';

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
  const [session, setSession] = useState<ChatSession | null>(null);
  const [settings, setSettings] = useState<ExportSettings>(defaultSettings);
  const [markers, setMarkers] = useState<ChapterMarker[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [markerDialogOpen, setMarkerDialogOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<{ id: string; index: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const handleReset = () => {
    setSession(null);
    setMarkers([]);
    setEditMode(false);
  };

  const handleMessageClick = (messageId: string, messageIndex: number) => {
    setSelectedMessage({ id: messageId, index: messageIndex });
    setMarkerDialogOpen(true);
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

  const selectedMarker = selectedMessage 
    ? markers.find(m => m.messageId === selectedMessage.id)
    : undefined;

  return (
    <div className="min-h-screen paper-bg">
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
            {!session && <DemoData onLoad={setSession} />}
            {session && (
              <>
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  重新导入
                </Button>
                <Button 
                  variant={editMode ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setEditMode(!editMode)}
                  className={editMode ? 'gold-gradient text-primary-foreground' : ''}
                >
                  <BookmarkPlus className="w-4 h-4 mr-2" />
                  {editMode ? '退出标记' : '章节标记'}
                </Button>
                <TxtExportButton session={session} settings={settings} markers={markers} />
                <ExportButton previewRef={previewRef} filename={session.title} />
                <ExportButton previewRef={previewRef} filename={session.title} />
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
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
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Settings Sidebar */}
            <aside className="lg:w-72 flex-shrink-0">
              <div className="lg:sticky lg:top-24">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Settings className="w-4 h-4" />
                  <span className="font-display text-sm uppercase tracking-wider">设置</span>
                </div>
                <SettingsPanel settings={settings} onSettingsChange={setSettings} />
              </div>
            </aside>

            {/* Preview Area */}
            <div className="flex-1 min-w-0">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
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
              
              <ScrollArea className="h-[calc(100vh-220px)]">
                <div 
                  className="flex justify-center pb-8"
                  style={{ padding: '1rem' }}
                >
                  <div 
                    style={{ width: settings.paperWidth }}
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
                      editMode={editMode}
                    />
                  </div>
                </div>
              </ScrollArea>
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

      {/* Footer */}
      <footer className="border-t border-border mt-auto py-6 text-center text-sm text-muted-foreground">
        <p>SillyTavern 对话美化工具 · 让每一段对话都成为艺术</p>
      </footer>
    </div>
  );
};

export default Index;
