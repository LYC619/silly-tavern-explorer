import { Clock, Globe, Save, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorldBookImporter } from '@/components/worldbook/WorldBookImporter';
import { WorldBookExporter } from '@/components/worldbook/WorldBookExporter';
import { StagedWorldBookList } from '@/components/worldbook/StagedWorldBookList';
import type { WorldBook, WorldBookItem } from '@/types/worldbook';

export type WorldBookTab = 'edit' | 'quick';

interface WorldBookHeaderProps {
  worldbook: WorldBook | null;
  filename: string;
  cowCharacterName: string;
  /** 条目计数摘要（含 token 粗估），没有世界书时为 null */
  summary: { text: string; title: string } | null;
  activeTab: WorldBookTab;
  onTabChange: (tab: WorldBookTab) => void;
  onImport: (wb: WorldBook, name: string, sourceModifiedAt?: number) => void;
  onAppend: (wb: WorldBook) => void;
  onOpenAiDialog: () => void;
  savedItems: WorldBookItem[];
  stagedDialogOpen: boolean;
  onStagedDialogOpenChange: (open: boolean) => void;
  onRefreshStaged: () => void;
  onLoadStaged: (item: WorldBookItem) => void;
  onDeleteStaged: (item: WorldBookItem) => void;
  onSave: () => void;
  /** 页面自己挂的模态框（确认切换 / 确认删除）插在工具栏里，保持原有 DOM 位置 */
  children?: React.ReactNode;
}

const TabSwitcher = ({ value, onChange, mobile }: { value: WorldBookTab; onChange: (t: WorldBookTab) => void; mobile?: boolean }) => (
  <Tabs value={value} onValueChange={(v) => onChange(v as WorldBookTab)} className={mobile ? undefined : 'hidden sm:block'}>
    <TabsList className={mobile ? 'w-full h-8' : 'h-8'}>
      <TabsTrigger value="edit" className={mobile ? 'text-xs flex-1 h-6' : 'text-xs px-3 h-6'}>编辑模式</TabsTrigger>
      <TabsTrigger value="quick" className={mobile ? 'text-xs flex-1 h-6' : 'text-xs px-3 h-6'}>快速添加</TabsTrigger>
    </TabsList>
  </Tabs>
);

/** 世界书页内工具栏：标题 + 计数 + 模式切换 + 导入/AI/最近打开/保存/导出 */
export function WorldBookHeader({
  worldbook, filename, cowCharacterName, summary,
  activeTab, onTabChange,
  onImport, onAppend, onOpenAiDialog,
  savedItems, stagedDialogOpen, onStagedDialogOpenChange, onRefreshStaged, onLoadStaged, onDeleteStaged,
  onSave, children,
}: WorldBookHeaderProps) {
  return (
    <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center gap-2">
        <Globe className="w-5 h-5 text-primary" />
        <h1 className="font-semibold text-foreground text-lg mr-2 hidden sm:block">世界书编辑器</h1>
        {cowCharacterName && (
          <Badge variant="secondary" className="shrink-0" title="从角色页进入的处理：保存共享世界书时会生成该角色的派生副本，原资产不动">
            为「{cowCharacterName}」处理
          </Badge>
        )}

        {/* 条目计数 + token 粗估 + 世界书名 */}
        {summary && (
          <span className="text-xs text-muted-foreground truncate max-w-[340px] hidden md:inline" title={summary.title}>
            {summary.text}
          </span>
        )}

        <TabSwitcher value={activeTab} onChange={onTabChange} />

        <div className="flex-1" />

        <div data-tour="wb-import">
          <WorldBookImporter onImport={onImport} onAppend={onAppend} hasExisting={!!worldbook} />
        </div>

        {worldbook && (
          <Button data-tour="wb-ai" variant="outline" size="sm" onClick={onOpenAiDialog} title="根据聊天记录用 AI 提炼新设定，追加为新条目">
            <Sparkles className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">AI 追加</span>
          </Button>
        )}

        {/* 这里列的就是资产库里的世界书（按 updatedAt 倒序），不是另一套「暂存区」。
            叫「已暂存」会让人以为存在别处、还得再存一次才算数（0830 反馈条目 11）。 */}
        <Dialog open={stagedDialogOpen} onOpenChange={onStagedDialogOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-tour="wb-staged" onClick={onRefreshStaged} title="从资产库里换一本世界书来编辑">
              <Clock className="w-4 h-4 mr-1" /> <span className="hidden sm:inline">最近打开</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>最近打开的世界书</DialogTitle>
              <DialogDescription>都存在资产库里，按最近编辑排序。点一本切过去编辑。</DialogDescription>
            </DialogHeader>
            {savedItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">资产库里还没有世界书</p>
            ) : (
              <StagedWorldBookList items={savedItems} variant="dialog" onSelect={onLoadStaged} onDelete={onDeleteStaged} />
            )}
          </DialogContent>
        </Dialog>

        {children}

        {worldbook && activeTab === 'edit' && (
          <>
            <Button variant="outline" size="sm" onClick={onSave} className="hidden sm:inline-flex">
              <Save className="w-4 h-4 mr-1" /> 保存
            </Button>
            <WorldBookExporter worldbook={worldbook} filename={filename} />
          </>
        )}
      </div>

      {/* Mobile tab switcher */}
      <div className="sm:hidden px-4 pb-2">
        <TabSwitcher value={activeTab} onChange={onTabChange} mobile />
      </div>
    </header>
  );
}
