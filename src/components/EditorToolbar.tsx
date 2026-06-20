import { RefreshCw, Save, BookmarkPlus, Regex } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoData } from '@/components/DemoData';
import { ExportButton } from '@/components/ExportButton';
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
  regexSidebarOpen: boolean;
  onLoadSession: (session: ChatSession) => void;
  onReset: () => void;
  onSaveToBookshelf: () => void;
  onToggleEditMode: () => void;
  onToggleRegex: () => void;
}

/**
 * 主编辑页顶栏右侧的操作组，按 处理 → 输入/输出 顺序分组：
 * - 处理：章节标记、正则规则（「编辑内容」铅笔已移到预览区右上角；「外观」已移到顶栏最左）
 * - 输入/输出（高频）：保存到书架、重新导入、导出（导出为唯一主 CTA，金色高亮，最右）
 */
export function EditorToolbar({
  session,
  settings,
  markers,
  editMode,
  regexSidebarOpen,
  onLoadSession,
  onReset,
  onSaveToBookshelf,
  onToggleEditMode,
  onToggleRegex,
}: EditorToolbarProps) {
  if (!session) {
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <DemoData onLoad={onLoadSession} />
      </div>
    );
  }

  const enabledRegexCount = settings.regexRules.filter(r => !r.disabled).length;

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {/* 处理：章节标记 / 正则（「编辑内容」已移到预览区右上角铅笔图标） */}
      <Button
        variant={editMode ? "default" : "outline"}
        size="sm"
        onClick={onToggleEditMode}
        className={editMode ? 'gold-gradient text-primary-foreground' : ''}
        data-tour="chapter-mark-btn"
      >
        <BookmarkPlus className="w-4 h-4 mr-1.5" />
        {editMode ? '退出标记' : '章节标记'}
      </Button>
      <Button
        variant={regexSidebarOpen ? 'secondary' : 'outline'}
        size="sm"
        onClick={onToggleRegex}
        className="gap-1.5"
        data-tour="regex-toggle"
      >
        <Regex className="w-4 h-4" />
        正则
        <span className="text-xs text-muted-foreground">({enabledRegexCount})</span>
      </Button>

      <div className="w-px h-6 bg-border mx-0.5" />

      {/* 输入/输出（高频，集中在右侧）：保存到书架 · 导入 · 导出(主CTA) */}
      <Button variant="outline" size="sm" onClick={onSaveToBookshelf}>
        <Save className="w-4 h-4 mr-1.5" />
        保存到书架
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-1.5" />
            导入
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
      <ExportButton session={session} settings={settings} markers={markers} />
    </div>
  );
}
