/**
 * 角色页 · 统一导入弹窗（10.3c，对照设计稿：先选类型，再选择/拖入文件）。
 * 六类见 lib/character-import IMPORT_KINDS；引用类额外支持直接粘贴文本。
 * 即选即导（逐文件容错），结果通过 onDone 交给页面落库+刷新。
 */
import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  IMPORT_KINDS, type CharacterImportKind,
} from '@/lib/character-import';

interface CharacterImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时预选的类型（按当前 tab） */
  initialKind: CharacterImportKind;
  /** 页面在角色写入队列内读取最新档案、执行导入并落库。 */
  onImport: (kind: CharacterImportKind, files: File[]) => Promise<void>;
  onPasteQuote: (title: string, body: string) => Promise<void>;
}

export function CharacterImportDialog({
  open, onOpenChange, initialKind, onImport, onPasteQuote,
}: CharacterImportDialogProps) {
  const [kind, setKind] = useState<CharacterImportKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [quoteTitle, setQuoteTitle] = useState('');
  const [quoteBody, setQuoteBody] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setKind(initialKind);
  }, [open, initialKind]);

  const meta = IMPORT_KINDS.find((k) => k.kind === kind)!;

  const runImport = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    try {
      await onImport(kind, files);
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      // 父层已提示失败；保留所选内容供重试。
    } finally {
      setBusy(false);
    }
  };

  const handlePasteQuote = async () => {
    const body = quoteBody.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await onPasteQuote(quoteTitle.trim() || '引用', body);
      setQuoteTitle('');
      setQuoteBody('');
    } catch {
      // 父层已提示失败；保留标题和正文。
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>导入</DialogTitle>
          <DialogDescription>先选类型，再选择文件；导入的内容会归到这张角色卡下。</DialogDescription>
        </DialogHeader>

        {/* 六类选择 */}
        <div className="grid grid-cols-2 gap-1.5">
          {IMPORT_KINDS.map((k) => (
            <button
              key={k.kind}
              className={cn(
                'rounded-lg border px-3 py-2 text-left transition-colors',
                k.kind === kind
                  ? 'border-primary/60 bg-primary/10'
                  : 'border-border hover:bg-accent/40',
              )}
              disabled={busy}
              onClick={() => setKind(k.kind)}
            >
              <p className="text-sm font-medium">{k.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{k.desc}</p>
            </button>
          ))}
        </div>

        {/* 拖放/点选 */}
        <button
          className={cn(
            'rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm text-muted-foreground transition-colors',
            dragOver ? 'border-primary/60 bg-primary/5' : 'border-border hover:bg-accent/30',
          )}
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void runImport(Array.from(e.dataTransfer.files));
          }}
        >
          <Upload className="w-5 h-5 mx-auto mb-2 opacity-60" />
          {busy ? '导入中…' : <>把文件拖到这里，或点击选择<br /><span className="text-[11px]">当前类型：{meta.label}</span></>}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={meta.accept}
          className="hidden"
          onChange={(e) => void runImport(Array.from(e.target.files ?? []))}
        />

        {/* 引用：直接粘贴 */}
        {kind === 'quote' && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">或直接粘贴文本：</p>
            <Input
              value={quoteTitle}
              onChange={(e) => setQuoteTitle(e.target.value)}
              placeholder="引用标题（可空）"
              className="h-8"
              disabled={busy}
            />
            <Textarea
              value={quoteBody}
              onChange={(e) => setQuoteBody(e.target.value)}
              placeholder="粘贴摘录、语料片段…（空行分段）"
              rows={4}
              disabled={busy}
            />
            <Button size="sm" onClick={() => void handlePasteQuote()} disabled={busy || !quoteBody.trim()}>
              添加引用
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
