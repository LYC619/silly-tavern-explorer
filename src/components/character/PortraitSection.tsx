/**
 * 角色页 · 立绘 tab（10.3c 分行式，反馈 2.4#4，替代旧只读图墙 IllustrationSection）。
 * 按行组织（一行=一个角色/一个剧情阶段）：行标题可改名、行内横滚、可展开网格、每行导入；
 * 「设为当前」把立绘嵌卡数据换成卡面，旧卡面自动归档进「卡面」行（portrait-store）。
 * 网页版（IDB）与客户端（行文件夹）同构；用户手放的文件以「散图」只读展示。
 * 图片按需读：视图只带路径，缩略图滚进可视区才取字节（PortraitThumb）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Images, Plus, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight, Pencil, Trash2, Replace } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';
import type { CharacterPatch } from '@/lib/character-write';
import {
  loadPortraitViews, loadPortraitImage, createPortraitRow, renamePortraitRow, addPortraitFiles, setPortraitAsCard,
  rowTitleConflict, rowDirOf, ensureRowTitle, renamePortraitItem, removePortraitItem, replacePortraitItem,
  type PortraitViewRow, type PortraitViewItem,
} from '@/lib/portrait-store';
import { LOADING_LABEL } from '@/lib/ui-copy';

interface PortraitSectionProps {
  character: ArchiveCharacter;
  onPatch: (patch: CharacterPatch) => Promise<ArchiveCharacter>;
  /** 打开统一导入弹窗（预选立绘类） */
  onOpenImport: () => void;
}

/** 提前一屏开始读，滚起来看不出在加载 */
const PRELOAD_MARGIN = '300px';

/**
 * 缩略图：滚进可视区（提前 PRELOAD_MARGIN）才去读图片字节。
 * 上百张立绘的角色打开立绘 tab 时，不再一次性把整个立绘库解码进内存。
 * 网页版内嵌图（dataBase64 随记录来）本来就在内存里，`item.url` 已就绪，直接渲染。
 */
function PortraitThumb({ item, onOpen }: { item: PortraitViewItem; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState(item.url);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (url || !el) return;
    let cancelled = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect(); // 读一次就够，之后由 url 状态兜住
      void loadPortraitImage(item).then((loaded) => {
        if (cancelled) return;
        if (loaded) setUrl(loaded);
        else setFailed(true); // 文件刚被挪走：说出来，别留个点不动的空框
      });
    }, { rootMargin: PRELOAD_MARGIN });
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [item, url]);

  return (
    <button
      ref={ref}
      className="block w-full aspect-[3/4] rounded-md overflow-hidden border border-border bg-elevated"
      onClick={() => url && onOpen(url)}
      aria-label={url ? `放大 ${item.name}` : item.name}
      data-portrait-thumb={item.name}
    >
      {url ? (
        <img src={url} alt={item.name} className="w-full h-full object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-[11px] text-muted-foreground/70">
          {failed ? '读不到图片' : ''}
        </span>
      )}
    </button>
  );
}

export function PortraitSection({ character, onPatch, onOpenImport }: PortraitSectionProps) {
  const { toast } = useToast();
  const [views, setViews] = useState<PortraitViewRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ rowId: string; index: number; name: string; url: string } | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const importRowId = useRef<string | null>(null);
  const replaceItemId = useRef<string | null>(null);

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
    try {
      await onPatch(async (current) => createPortraitRow(
        current,
        ensureRowTitle(current.portraitRows ?? [], '新分行'),
      ));
    } catch {
      // 父层已提示失败。
    }
  };

  const handleRename = async (rowId: string, title: string) => {
    const row = rows.find((r) => r.id === rowId);
    const next = title.trim();
    if (!row) return;
    if (!next) {
      setRenameDrafts((drafts) => ({ ...drafts, [rowId]: row.title }));
      toast({ title: '分行名称不能为空', variant: 'destructive' });
      return;
    }
    if (next === row.title) {
      setRenameDrafts((drafts) => ({ ...drafts, [rowId]: row.title }));
      return;
    }
    if (rowTitleConflict(rows, next, rowId)) {
      toast({ title: '行名与其他行重复', description: `「${rowDirOf(next)}」已被占用`, variant: 'destructive' });
      setRenameDrafts((drafts) => ({ ...drafts, [rowId]: row.title }));
      return;
    }
    try {
      await onPatch((current) => renamePortraitRow(current, rowId, next));
      setRenameDrafts((drafts) => {
        const updated = { ...drafts };
        delete updated[rowId];
        return updated;
      });
    } catch {
      setRenameDrafts((drafts) => ({ ...drafts, [rowId]: row.title }));
    }
  };

  const handleImportFiles = async (files: File[]) => {
    if (files.length === 0) return;
    let imported = { ok: 0, fail: 0 };
    try {
      await onPatch(async (current) => {
        const result = await addPortraitFiles(current, importRowId.current, files);
        imported = { ok: result.ok, fail: result.fail };
        return result.ok > 0 ? result.patch : undefined;
      });
      toast({ title: `导入 ${imported.ok} 张${imported.fail ? `，失败 ${imported.fail} 张` : ''}` });
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      // 父层已提示失败；保留文件输入供重试。
    }
  };

  const handleSetCard = async (item: PortraitViewItem) => {
    try {
      await onPatch((current) => setPortraitAsCard(current, item));
      toast({ title: '已设为当前卡面', description: '原卡面不在立绘库时会自动存入「卡面」行。' });
    } catch {
      // 父层已提示失败。
    }
  };

  const handleRenameItem = async (item: PortraitViewItem) => {
    if (!item.itemId) return;
    const next = window.prompt('重命名立绘', item.name);
    if (next == null || next.trim() === item.name) return;
    try {
      await onPatch((current) => renamePortraitItem(current, item.itemId!, next));
      setViews((current) => current?.map((row) => ({ ...row, items: row.items.map((entry) => entry.itemId === item.itemId ? { ...entry, name: next.trim() } : entry) })) ?? null);
    } catch (error) {
      toast({ title: '重命名失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const handleRemoveItem = async (item: PortraitViewItem) => {
    if (!item.itemId || !window.confirm(`确定删除「${item.name}」？此操作不可撤销。`)) return;
    try {
      await onPatch((current) => removePortraitItem(current, item.itemId!));
      setViews((current) => current?.map((row) => ({ ...row, items: row.items.filter((entry) => entry.itemId !== item.itemId) })) ?? null);
      setLightbox(null);
      toast({ title: '立绘已删除' });
    } catch (error) {
      toast({ title: '删除失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const handleReplaceItem = (item: PortraitViewItem) => {
    if (!item.itemId) return;
    replaceItemId.current = item.itemId;
    fileRef.current?.click();
  };

  const openLightbox = async (row: PortraitViewRow, index: number) => {
    const item = row.items[index];
    if (!item) return;
    const url = await loadPortraitImage(item);
    if (url) setLightbox({ rowId: row.rowId, index, name: item.name, url });
  };

  const moveLightbox = useCallback(async (delta: number) => {
    if (!lightbox) return;
    const row = views?.find((entry) => entry.rowId === lightbox.rowId);
    if (!row || row.items.length < 2) return;
    const index = (lightbox.index + delta + row.items.length) % row.items.length;
    const item = row.items[index];
    const url = await loadPortraitImage(item);
    if (url) setLightbox({ rowId: row.rowId, index, name: item.name, url });
  }, [lightbox, views]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLElement && event.target.isContentEditable) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); void moveLightbox(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); void moveLightbox(1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, moveLightbox]);

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
          <Button variant="outline" size="sm" onClick={() => void handleAddRow()}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            新建分行
          </Button>
          <Button variant="outline" size="sm" onClick={onOpenImport}>
            <Download className="w-3.5 h-3.5 mr-1" />
            导入立绘
          </Button>
        </div>
      </div>

      {views === null ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{LOADING_LABEL}</p>
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
                    value={renameDrafts[row.rowId] ?? row.title}
                    onChange={(event) => setRenameDrafts((drafts) => ({
                      ...drafts,
                      [row.rowId]: event.target.value,
                    }))}
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
                    <Button variant="ghost" size="sm" className="px-2 text-xs" onClick={() => toggleExpand(row.rowId)}>
                      {open ? <ChevronUp className="w-3.5 h-3.5 mr-0.5" /> : <ChevronDown className="w-3.5 h-3.5 mr-0.5" />}
                      {open ? '收起' : '展开'}
                    </Button>
                  )}
                  {!row.isStray && (
                    <Button
                      variant="ghost" size="sm" className="px-2 text-xs"
                      onClick={() => {
                        importRowId.current = row.rowId;
                        fileRef.current?.click();
                      }}
                    >
                      <Download className="w-3 h-3 mr-0.5" />
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
                      <PortraitThumb item={item} onOpen={(url) => setLightbox({ rowId: row.rowId, index: i, name: item.name, url })} />
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
                      {item.itemId && (
                        <div className="mt-1 flex gap-1 opacity-0 group-hover/pc:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button className="tap-target text-muted-foreground" onClick={() => void handleRenameItem(item)} title="重命名立绘" aria-label="重命名立绘"><Pencil className="w-3 h-3" /></button>
                          <button className="tap-target text-muted-foreground" onClick={() => handleReplaceItem(item)} title="替换立绘" aria-label="替换立绘"><Replace className="w-3 h-3" /></button>
                          <button className="tap-target text-destructive" onClick={() => void handleRemoveItem(item)} title="删除立绘" aria-label="删除立绘"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      )}
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
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          const replaceId = replaceItemId.current;
          replaceItemId.current = null;
          if (replaceId && files[0]) {
            void onPatch((current) => replacePortraitItem(current, replaceId, files[0])).then((saved) => {
              setViews(null);
              return loadPortraitViews(saved).then(setViews);
            }).catch((error) => toast({ title: '替换失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }));
          } else {
            void handleImportFiles(files);
          }
        }}
      />

      {/* lightbox */}
      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-0 shadow-none">
          <DialogTitle className="sr-only">{lightbox?.name}</DialogTitle>
          {lightbox && (
            <div className="relative flex items-center justify-center">
              <button className="tap-target absolute left-1 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 p-2" onClick={() => void moveLightbox(-1)} title="上一张" aria-label="上一张"><ChevronLeft className="w-5 h-5" /></button>
              <img src={lightbox.url} alt={lightbox.name} className="w-full max-h-[85vh] object-contain rounded-lg" />
              <button className="tap-target absolute right-1 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 p-2" onClick={() => void moveLightbox(1)} title="下一张" aria-label="下一张"><ChevronRight className="w-5 h-5" /></button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
