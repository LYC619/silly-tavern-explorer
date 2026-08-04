/**
 * 角色页 · 立绘 tab（10.3c 分行式，反馈 2.4#4，替代旧只读图墙 IllustrationSection）。
 * 按行组织（一行=一个角色/一个剧情阶段）：行标题可改名、行内横滚、可展开网格、每行导入；
 * 「设为当前」把立绘嵌卡数据换成卡面，旧卡面自动归档进「卡面」行（portrait-store）。
 * 网页版（IDB）与客户端（行文件夹）同构；用户手放的文件以「散图」只读展示。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Images, Plus, Upload, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';
import {
  loadPortraitViews, createPortraitRow, renamePortraitRow, addPortraitFiles, setPortraitAsCard,
  rowTitleConflict, rowDirOf, ensureRowTitle,
  type PortraitViewRow, type PortraitViewItem,
} from '@/lib/portrait-store';

interface PortraitSectionProps {
  character: ArchiveCharacter;
  onPatch: (patch: Partial<ArchiveCharacter>) => Promise<void> | void;
  /** 打开统一导入弹窗（预选立绘类） */
  onOpenImport: () => void;
}

export function PortraitSection({ character, onPatch, onOpenImport }: PortraitSectionProps) {
  const { toast } = useToast();
  const [views, setViews] = useState<PortraitViewRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<PortraitViewItem | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRowId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPortraitViews(character).then((v) => {
      if (!cancelled) setViews(v);
    });
    return () => {
      cancelled = true;
    };
  }, [character]);

  const rows = character.portraitRows ?? [];

  const handleAddRow = async () => {
    await onPatch(await createPortraitRow(character, ensureRowTitle(rows, '新分行')));
  };

  const handleRename = async (rowId: string, title: string) => {
    const row = rows.find((r) => r.id === rowId);
    const next = title.trim();
    if (!row || !next || next === row.title) return;
    if (rowTitleConflict(rows, next, rowId)) {
      toast({ title: '行名与其他行重复', description: `「${rowDirOf(next)}」已被占用`, variant: 'destructive' });
      setViews((v) => (v ? [...v] : v)); // 触发重渲染让 input 还原
      return;
    }
    try {
      await onPatch(await renamePortraitRow(character, rowId, next));
    } catch {
      toast({ title: '改名失败', description: '目标文件夹可能已被占用', variant: 'destructive' });
    }
  };

  const handleImportFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const { patch, ok, fail } = await addPortraitFiles(character, importRowId.current, files);
    if (ok > 0) await onPatch(patch);
    toast({ title: `导入 ${ok} 张${fail ? `，失败 ${fail} 张` : ''}` });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSetCard = async (item: PortraitViewItem) => {
    try {
      await onPatch(await setPortraitAsCard(character, item));
      toast({ title: '已设为当前卡面', description: '原卡面不在立绘库时会自动存入「卡面」行。' });
    } catch {
      toast({ title: '设为卡面失败', variant: 'destructive' });
    }
  };

  const toggleExpand = useCallback((rowId: string) => {
    setExpanded((cur) => {
      const next = new Set(cur);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          按行组织：一行可以是一个角色，也可以是剧情的一个阶段。行内横向滚动，也可展开成网格。
        </span>
        <div className="ml-auto flex gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="h-7" onClick={() => void handleAddRow()}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            新建分行
          </Button>
          <Button variant="outline" size="sm" className="h-7" onClick={onOpenImport}>
            <Upload className="w-3.5 h-3.5 mr-1" />
            导入立绘
          </Button>
        </div>
      </div>

      {views === null ? (
        <p className="text-sm text-muted-foreground py-6 text-center">加载中…</p>
      ) : views.length === 0 ? (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
            <Images className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">还没有立绘</p>
            <p className="text-xs text-muted-foreground/70">点「导入立绘」添加图片；被替换的旧卡面也会自动存到这里。</p>
          </CardContent>
        </Card>
      ) : (
        views.map((row) => {
          const open = expanded.has(row.rowId);
          return (
            <div key={row.rowId} className="rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="flex items-center gap-2 mb-2">
                {row.isStray ? (
                  <span className="text-sm font-medium text-muted-foreground" title="立绘文件夹根目录里的图片（未入库，只读展示）">
                    {row.title}
                  </span>
                ) : (
                  <input
                    key={row.title}
                    defaultValue={row.title}
                    aria-label="分行标题"
                    className="h-7 w-40 rounded-md border border-transparent bg-transparent px-2 text-sm font-medium hover:border-border focus:border-ring focus:outline-none transition-colors"
                    onBlur={(e) => void handleRename(row.rowId, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                  />
                )}
                <span className="text-xs text-muted-foreground shrink-0">{row.items.length} 张</span>
                <div className="ml-auto flex gap-1 shrink-0">
                  {row.items.length > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => toggleExpand(row.rowId)}>
                      {open ? <ChevronUp className="w-3.5 h-3.5 mr-0.5" /> : <ChevronDown className="w-3.5 h-3.5 mr-0.5" />}
                      {open ? '收起' : '展开'}
                    </Button>
                  )}
                  {!row.isStray && (
                    <Button
                      variant="ghost" size="sm" className="h-6 px-2 text-xs"
                      onClick={() => {
                        importRowId.current = row.rowId;
                        fileRef.current?.click();
                      }}
                    >
                      <Upload className="w-3 h-3 mr-0.5" />
                      导入
                    </Button>
                  )}
                </div>
              </div>

              {row.items.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">这一行还没有图片，点右上角「导入」添加。</p>
              ) : (
                <div
                  className={cn(
                    'gap-2.5',
                    open
                      ? 'grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))]'
                      : 'flex overflow-x-auto scrollbar-thin pb-1',
                  )}
                >
                  {row.items.map((item, i) => (
                    <div key={item.itemId ?? `${row.rowId}-stray-${i}`} className={cn('group/pc', !open && 'w-28 shrink-0')}>
                      <button
                        className="block w-full aspect-[3/4] rounded-md overflow-hidden border border-border bg-elevated"
                        onClick={() => setLightbox(item)}
                        aria-label={`放大 ${item.name}`}
                      >
                        <img src={item.url} alt={item.name} loading="lazy" className="w-full h-full object-cover object-top" />
                      </button>
                      <div className="mt-1 flex items-center gap-1 text-[11px] leading-tight">
                        <span
                          className="min-w-0 truncate text-muted-foreground"
                          title={`${item.name}${item.source === 'replaced' ? '（被替换的旧卡面自动存档）' : item.source === 'stray' ? '（文件夹里的图片，未入库）' : ''}`}
                        >
                          {item.name}
                        </span>
                        {item.isCurrent ? (
                          <span className="ml-auto shrink-0 text-primary font-medium">当前</span>
                        ) : (
                          <button
                            className="ml-auto shrink-0 text-primary opacity-0 group-hover/pc:opacity-100 transition-opacity"
                            onClick={() => void handleSetCard(item)}
                            title="把这张图设为角色卡面（卡数据嵌入图内，原卡面自动存档）"
                          >
                            设为当前
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void handleImportFiles(Array.from(e.target.files ?? []))}
      />

      {/* lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-0 shadow-none">
          <DialogTitle className="sr-only">{lightbox?.name}</DialogTitle>
          {lightbox && <img src={lightbox.url} alt={lightbox.name} className="w-full max-h-[85vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
