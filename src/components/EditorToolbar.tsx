import { RefreshCw, Save, Pencil, BookmarkPlus, FileUp, Library, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { DemoData } from '@/components/DemoData';
import { ExportButton } from '@/components/ExportButton';
import type { ChatSession, ExportSettings, ChapterMarker } from '@/types/chat';

interface EditorToolbarProps {
  session: ChatSession | null;
  settings: ExportSettings;
  markers: ChapterMarker[];
  editMode: boolean;
  contentEditMode: boolean;
  batchImportOpen: boolean;
  onLoadSession: (session: ChatSession) => void;
  onReset: () => void;
  onSaveToBookshelf: () => void;
  onToggleContentEdit: () => void;
  onToggleEditMode: () => void;
  onToggleBatchImport: () => void;
}

export function EditorToolbar({
  session,
  settings,
  markers,
  editMode,
  contentEditMode,
  batchImportOpen,
  onLoadSession,
  onReset,
  onSaveToBookshelf,
  onToggleContentEdit,
  onToggleEditMode,
  onToggleBatchImport,
}: EditorToolbarProps) {
  const navigate = useNavigate();

  return (
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

      {!session && <DemoData onLoad={onLoadSession} />}
      {session && (
        <>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RefreshCw className="w-4 h-4 mr-2" />
            重新导入
          </Button>
          <Button variant="outline" size="sm" onClick={onSaveToBookshelf}>
            <Save className="w-4 h-4 mr-2" />
            保存到书架
          </Button>
          <Button 
            variant={contentEditMode ? "default" : "outline"} 
            size="sm" 
            onClick={onToggleContentEdit}
            className={contentEditMode ? 'gold-gradient text-primary-foreground' : ''}
          >
            <Pencil className="w-4 h-4 mr-2" />
            {contentEditMode ? '退出编辑' : '编辑内容'}
          </Button>
          <Button 
            variant={editMode ? "default" : "outline"} 
            size="sm" 
            onClick={onToggleEditMode}
            className={editMode ? 'gold-gradient text-primary-foreground' : ''}
          >
            <BookmarkPlus className="w-4 h-4 mr-2" />
            {editMode ? '退出标记' : '章节标记'}
          </Button>
          <Button 
            variant={batchImportOpen ? "default" : "outline"} 
            size="sm" 
            onClick={onToggleBatchImport}
            className={batchImportOpen ? 'gold-gradient text-primary-foreground' : ''}
          >
            <FileUp className="w-4 h-4 mr-2" />
            导入总结
          </Button>
          <ExportButton session={session} settings={settings} markers={markers} />
        </>
      )}
    </div>
  );
}
