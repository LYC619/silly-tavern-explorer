import { RefreshCw, Save, Pencil, BookmarkPlus, Regex } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoData } from '@/components/DemoData';
import { ExportButton } from '@/components/ExportButton';
import { SettingsPanel } from '@/components/SettingsPanel';
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
  regexSidebarOpen: boolean;
  onLoadSession: (session: ChatSession) => void;
  onReset: () => void;
  onSaveToBookshelf: () => void;
  onToggleContentEdit: () => void;
  onToggleEditMode: () => void;
  onToggleRegex: () => void;
  onSettingsChange: (settings: ExportSettings) => void;
}

/**
 * 主编辑页的单行工具栏，按 输入 → 处理 → 外观 → 输出 的逻辑顺序分组：
 * - 输入/输出（高频）：重新导入、保存到书架、导出（导出为唯一主 CTA，金色高亮，最右）
 * - 处理：编辑内容、章节标记、正则规则
 * - 外观：收进 SettingsPanel 的「外观」popover
 */
export function EditorToolbar({
  session,
  settings,
  markers,
  editMode,
  contentEditMode,
  regexSidebarOpen,
  onLoadSession,
  onReset,
  onSaveToBookshelf,
  onToggleContentEdit,
  onToggleEditMode,
  onToggleRegex,
  onSettingsChange,
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
      {/* 外观设置（最左，收进 popover） */}
      <SettingsPanel settings={settings} onSettingsChange={onSettingsChange} />

      <div className="w-px h-6 bg-border mx-0.5" />

      {/* 处理：编辑内容 / 章节标记 / 正则 */}
      <Button
        variant={contentEditMode ? "default" : "outline"}
        size="sm"
        onClick={onToggleContentEdit}
        className={contentEditMode ? 'gold-gradient text-primary-foreground' : ''}
        data-tour="content-edit-btn"
      >
        <Pencil className="w-4 h-4 mr-1.5" />
        {contentEditMode ? '退出编辑' : '编辑内容'}
      </Button>
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
