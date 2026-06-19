import { RefreshCw, Save, Pencil, BookmarkPlus, Library, Sparkles, Moon, Sun, Globe } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { DemoData } from '@/components/DemoData';
import { ExportButton } from '@/components/ExportButton';
import { GlobalSettings } from '@/components/GlobalSettings';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { ChatSession, ExportSettings, ChapterMarker } from '@/types/chat';

interface EditorToolbarProps {
  session: ChatSession | null;
  settings: ExportSettings;
  markers: ChapterMarker[];
  editMode: boolean;
  contentEditMode: boolean;
  onLoadSession: (session: ChatSession) => void;
  onReset: () => void;
  onSaveToBookshelf: () => void;
  onToggleContentEdit: () => void;
  onToggleEditMode: () => void;
}

export function EditorToolbar({
  session,
  settings,
  markers,
  editMode,
  contentEditMode,
  onLoadSession,
  onReset,
  onSaveToBookshelf,
  onToggleContentEdit,
  onToggleEditMode,
}: EditorToolbarProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      {/* Global Settings */}
      <GlobalSettings data-tour="global-settings" />

      {/* Dark mode toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="h-8 w-8"
        aria-label={theme === 'dark' ? '切换到日间模式' : '切换到夜间模式'}
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4" />
        ) : (
          <Moon className="w-4 h-4" />
        )}
      </Button>

      {/* Navigation Buttons */}
      <Button variant="ghost" size="sm" onClick={() => navigate('/bookshelf')}>
        <Library className="w-4 h-4 mr-2" />
        书架
      </Button>
      <Button variant="ghost" size="sm" onClick={() => navigate('/ai-tools')}>
        <Sparkles className="w-4 h-4 mr-2" />
        AI工具
      </Button>
      <Button variant="ghost" size="sm" onClick={() => navigate('/worldbook')}>
        <Globe className="w-4 h-4 mr-2" />
        世界书
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      {!session && <DemoData onLoad={onLoadSession} />}
      {session && (
        <>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                重新导入
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认重新导入？</AlertDialogTitle>
                <AlertDialogDescription>
                  当前的编辑内容、章节标记等未保存的修改将全部丢失。如需保留，请先保存到书架。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={onReset}>确认</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="outline" size="sm" onClick={onSaveToBookshelf}>
            <Save className="w-4 h-4 mr-2" />
            保存到书架
          </Button>
          <Button 
            variant={contentEditMode ? "default" : "outline"} 
            size="sm" 
            onClick={onToggleContentEdit}
            className={contentEditMode ? 'gold-gradient text-primary-foreground' : ''}
            data-tour="content-edit-btn"
          >
            <Pencil className="w-4 h-4 mr-2" />
            {contentEditMode ? '退出编辑' : '编辑内容'}
          </Button>
          <Button 
            variant={editMode ? "default" : "outline"} 
            size="sm" 
            onClick={onToggleEditMode}
            className={editMode ? 'gold-gradient text-primary-foreground' : ''}
            data-tour="chapter-mark-btn"
          >
            <BookmarkPlus className="w-4 h-4 mr-2" />
            {editMode ? '退出标记' : '章节标记'}
          </Button>
          <ExportButton session={session} settings={settings} markers={markers} />
        </>
      )}
    </div>
  );
}
