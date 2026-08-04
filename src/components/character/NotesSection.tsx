/**
 * 角色页 · 备注 tab（10.3c，设计稿「备注」：角色级速记/玩卡心得，按时间列出）。
 * CRUD 全在本组件；变更通过 onChange 回写角色档案（notes 字段）。
 */
import { useState } from 'react';
import { StickyNote, Plus, PenLine, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { CharacterNote } from '@/types/archive';
import { formatListTime, formatFullTime } from '@/lib/time-display';

interface NotesSectionProps {
  notes: CharacterNote[];
  onChange: (notes: CharacterNote[]) => void;
}

export function NotesSection({ notes, onChange }: NotesSectionProps) {
  /** 编辑器：null=关闭；id 空=新建 */
  const [editor, setEditor] = useState<{ id?: string; body: string } | null>(null);
  const [toDelete, setToDelete] = useState<CharacterNote | null>(null);

  const sorted = [...notes].sort((a, b) => b.at - a.at);

  const handleSave = () => {
    if (!editor || !editor.body.trim()) return;
    const body = editor.body.trim();
    onChange(
      editor.id
        ? notes.map((n) => (n.id === editor.id ? { ...n, body } : n))
        : [...notes, { id: crypto.randomUUID(), body, at: Date.now() }],
    );
    setEditor(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">角色级速记（玩卡心得），不写入角色卡文件</span>
        <Button variant="outline" size="sm" className="h-7" onClick={() => setEditor({ body: '' })}>
          <Plus className="w-3.5 h-3.5 mr-1" />
          新建备注
        </Button>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
            <StickyNote className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">还没有备注</p>
          </CardContent>
        </Card>
      ) : (
        sorted.map((n) => (
          <Card key={n.id} className="group">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs text-muted-foreground" title={formatFullTime(n.at)}>
                  {formatFullTime(n.at)} · {formatListTime(n.at)}
                </span>
                <div className="ml-auto flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6" aria-label="编辑备注"
                    onClick={() => setEditor({ id: n.id, body: n.body })}
                  >
                    <PenLine className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" aria-label="删除备注"
                    onClick={() => setToDelete(n)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{n.body}</p>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!editor} onOpenChange={(v) => !v && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? '编辑备注' : '新建备注'}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editor?.body ?? ''}
            onChange={(e) => setEditor((cur) => (cur ? { ...cur, body: e.target.value } : cur))}
            placeholder="写点玩卡心得…"
            rows={6}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>取消</Button>
            <Button onClick={handleSave} disabled={!editor?.body.trim()}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这条备注？</AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3 whitespace-pre-wrap">
              {toDelete?.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) onChange(notes.filter((n) => n.id !== toDelete.id));
                setToDelete(null);
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
