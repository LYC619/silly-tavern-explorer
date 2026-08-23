/**
 * 故事工作区左栏·分支面板（定稿 5.1 / task 2.4）。
 * 分支=同一故事的不同发展脉络（各自消息/章节/收藏/阅读位置），主线=故事本体。
 * 分支来源：把 ST 里同一故事的另一份聊天文件导入为分支。
 */
import { useRef, useState } from 'react';
import { GitBranch, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
import { cn } from '@/lib/utils';
import type { ArchiveStory } from '@/types/archive';

interface BranchPanelProps {
  story: ArchiveStory;
  /** null = 主线 */
  activeBranchId: string | null;
  onSwitch: (branchId: string | null) => void;
  onImportBranch: (files: FileList | null) => void;
  onRenameBranch: (branchId: string, name: string) => void;
  onDeleteBranch: (branchId: string) => void;
}

export function BranchPanel({ story, activeBranchId, onSwitch, onImportBranch, onRenameBranch, onDeleteBranch }: BranchPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const branches = story.branches ?? [];

  const row = (opts: { id: string | null; name: string; count: number; lastFloor?: number }) => {
    const active = activeBranchId === opts.id;
    return (
      <div
        key={opts.id ?? 'trunk'}
        className={cn(
          'group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors',
          active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent/60 text-foreground/90',
        )}
        onClick={() => onSwitch(opts.id)}
      >
        <GitBranch className="w-3.5 h-3.5 shrink-0 opacity-60" />
        <span className="flex-1 min-w-0 truncate" title={opts.name}>{opts.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {opts.count} 楼{opts.lastFloor ? ` · 读到 #${opts.lastFloor}` : ''}
        </span>
        {opts.id !== null && (
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0">
            <button
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setRenameTarget({ id: opts.id!, name: opts.name }); }}
              aria-label="重命名分支"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: opts.id!, name: opts.name }); }}
              aria-label="删除分支"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-medium text-muted-foreground">分支</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs text-muted-foreground"
          onClick={() => fileRef.current?.click()}
          title="把 ST 里同一故事的另一份聊天文件（JSONL/JSON）导入为分支"
        >
          <Plus className="w-3 h-3 mr-0.5" />
          导入分支
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".jsonl,.json"
          multiple
          className="hidden"
          onChange={(e) => { onImportBranch(e.target.files); e.target.value = ''; }}
        />
      </div>
      {row({ id: null, name: '主线', count: story.session.messages.length, lastFloor: story.lastFloor })}
      {branches.map((b) =>
        row({ id: b.id, name: b.name, count: b.session.messages.length, lastFloor: b.lastFloor }),
      )}

      {/* 重命名 */}
      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">重命名分支</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTarget?.name ?? ''}
            onChange={(e) => setRenameTarget((t) => (t ? { ...t, name: e.target.value } : t))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && renameTarget?.name.trim()) {
                onRenameBranch(renameTarget.id, renameTarget.name.trim());
                setRenameTarget(null);
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameTarget(null)}>取消</Button>
            <Button
              size="sm"
              disabled={!renameTarget?.name.trim()}
              onClick={() => {
                if (renameTarget?.name.trim()) onRenameBranch(renameTarget.id, renameTarget.name.trim());
                setRenameTarget(null);
              }}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除分支「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              该分支的消息、章节标记和收藏将一并删除，无法恢复（不影响主线与其他分支）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (deleteTarget) onDeleteBranch(deleteTarget.id); setDeleteTarget(null); }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
