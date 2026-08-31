import { useState } from 'react';
import { RefreshCw, BookmarkPlus, Regex, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoData } from '@/components/DemoData';
import { ExportButton } from '@/components/chat/ExportButton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useViewport } from '@/hooks/use-viewport';
import type { ChatSession, ExportSettings, ChapterMarker } from '@/types/chat';

interface EditorToolbarProps {
  session: ChatSession | null;
  settings: ExportSettings;
  markers: ChapterMarker[];
  editMode: boolean;
  regexSidebarOpen: boolean;
  /** 无 session 时的示例数据入口；工作区模式（session 恒存在）可不传 */
  onLoadSession?: (session: ChatSession) => void;
  /** 重新导入（清空当前记录）；不传则不显示——工作区里换文件走「导入与导出」界面 */
  onReset?: () => void;
  onToggleEditMode: () => void;
  onToggleRegex: () => void;
  /** 就地阅读（10.3b）：不显示章节标记按钮 */
  hideChapterMark?: boolean;
}

/**
 * 主编辑页顶栏右侧的操作组，按 处理 → 输入/输出 顺序分组：
 * - 处理：章节标记、正则规则（「编辑内容」铅笔已移到预览区右上角；「外观」已移到顶栏最左）
 * - 输入/输出（高频）：重新导入、导出（导出为唯一主 CTA，金色高亮，最右；编辑内容自动落库）
 *
 * 窄屏（<1024px）把「处理」那组和重新导入收进「更多」菜单，只留导出在外面。
 * 理由不是省空间那么简单：这几个按钮加上父页追加的小说视图/沉浸阅读，在 390px
 * 宽度下会摊成三行，把正文推到屏幕外——而手机上的第一优先级是读，
 * 章节标记和正则调试本来就是坐在电脑前干的事。
 */
export function EditorToolbar({
  session,
  settings,
  markers,
  editMode,
  regexSidebarOpen,
  onLoadSession,
  onReset,
  onToggleEditMode,
  onToggleRegex,
  hideChapterMark,
}: EditorToolbarProps) {
  // 重新导入的确认框在窄屏下由菜单项触发。菜单项不能直接当 AlertDialogTrigger：
  // 点击后菜单关闭会把触发器卸载，对话框跟着一起消失。所以把开关提上来，
  // 对话框渲染成两个分支共用的兄弟节点。
  const [resetOpen, setResetOpen] = useState(false);
  const { isCompact } = useViewport();

  if (!session) {
    return (
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {onLoadSession && <DemoData onLoad={onLoadSession} />}
      </div>
    );
  }

  const enabledRegexCount = settings.regexRules.filter(r => !r.disabled).length;

  /** 窄屏要收起来的那几项，顺序与桌面档一致 */
  const overflow = [
    ...(hideChapterMark ? [] : [{
      key: 'mark',
      label: editMode ? '退出章节标记' : '章节标记',
      icon: BookmarkPlus,
      onSelect: onToggleEditMode,
    }]),
    {
      key: 'regex',
      label: `正则规则（${enabledRegexCount}）`,
      icon: Regex,
      onSelect: onToggleRegex,
    },
    ...(onReset ? [{
      key: 'reset',
      label: '重新导入',
      icon: RefreshCw,
      onSelect: () => setResetOpen(true),
    }] : []),
  ];

  /** 两个分支共用：受控开关，不挂 Trigger */
  const resetDialog = onReset ? (
    <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认重新导入？</AlertDialogTitle>
          <AlertDialogDescription>
            重新导入会清空当前打开的记录。已导入的记录会自动暂存，可从空态页的「未绑定的暂存记录」再次打开。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onReset}>确认</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  if (isCompact) {
    return (
      // flex-nowrap：这一组绝不换行，超出交给外层横向滚动
      <div className="flex flex-nowrap items-center gap-2">
        {/* 只剩一项时不套菜单——一个条目的菜单比直接给按钮更费手 */}
        {overflow.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-editor-toolbar-more aria-label="更多操作">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {overflow.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.key} onSelect={item.onSelect}>
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          overflow.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.key}
                variant={item.key === 'regex' && regexSidebarOpen ? 'secondary' : 'outline'}
                size="sm"
                onClick={item.onSelect}
                aria-label={item.label}
              >
                <Icon className="w-4 h-4" />
              </Button>
            );
          })
        )}
        {/* 导出留在外面：它是这一组里唯一的主 CTA */}
        <ExportButton session={session} settings={settings} markers={markers} />
        {resetDialog}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {/* 处理：章节标记 / 正则（「编辑内容」已移到预览区右上角铅笔图标） */}
      {!hideChapterMark && (
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
      )}
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

      {/* 输入/输出（高频，集中在右侧）：导入 · 导出(主CTA) */}
      {onReset && (
        <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
          <RefreshCw className="w-4 h-4 mr-1.5" />
          导入
        </Button>
      )}
      <ExportButton session={session} settings={settings} markers={markers} />
      {resetDialog}
    </div>
  );
}
