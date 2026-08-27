/**
 * 角色页 · 立绘 tab（10.3c 分行式，反馈 2.4#4）。
 * 按行组织（一行=一个角色/一个剧情阶段）：行标题可改名、行内横滚、可展开网格、每行导入；
 * 「设为当前」把立绘嵌卡数据换成卡面，旧卡面自动归档进「卡面」行（portrait-store）。
 * 网页版（IDB）与客户端（行文件夹）同构；用户手放的文件以「散图」只读展示，永不删改。
 * 图片按需读：视图只带路径，缩略图滚进可视区才取字节（PortraitThumb）。
 * 删图一律走系统回收站（客户端），批量管理可多选删除/移动到别的分行（0826 反馈 3）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Images, Plus, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight,
  Pencil, Trash2, Replace, CheckSquare, FolderInput, Check, ImageDown, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';
import type { CharacterPatch } from '@/lib/character-write';
import {
  loadPortraitViews, loadPortraitImage, createPortraitRow, renamePortraitRow, addPortraitFiles, setPortraitAsCard,
  rowTitleConflict, rowDirOf, ensureRowTitle, renamePortraitItem, removePortraitItems, removePortraitRow,
  movePortraitItems, replacePortraitItem,
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

/** 待确认的删除：整行 或 已选中的若干张 */
type PendingDelete =
  | { kind: 'row'; row: PortraitViewRow }
  | { kind: 'items'; itemIds: string[] };

/**
 * 缩略图：滚进可视区（提前 PRELOAD_MARGIN）才去读图片字节。
 * 上百张立绘的角色打开立绘 tab 时，不再一次性把整个立绘库解码进内存。
 * 网页版内嵌图（dataBase64 随记录来）本来就在内存里，`item.url` 已就绪，直接渲染。
 */
function PortraitThumb({
  item, onOpen, selectable, selected,
}: {
  item: PortraitViewItem;
  onOpen: (url: string) => void;
  selectable?: boolean;
  selected?: boolean;
}) {
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
      className={cn(
        'relative block w-full aspect-[3/4] rounded-md overflow-hidden border bg-elevated transition-colors',
        selected ? 'border-primary ring-2 ring-primary/40' : 'border-border',
      )}
      onClick={() => (selectable ? onOpen('') : url && onOpen(url))}
      aria-label={selectable ? `选择 ${item.name}` : url ? `放大 ${item.name}` : item.name}
      aria-pressed={selectable ? !!selected : undefined}
      data-portrait-thumb={item.name}
    >
      {url ? (
        <img src={url} alt={item.name} className="w-full h-full object-cover object-top" />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-[11px] text-muted-foreground/70">
          {failed ? '读不到图片' : ''}
        </span>
      )}
      {selectable && (
        <span
          className={cn(
            'absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border',
            selected ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background/80',
          )}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </span>
      )}
    </button>
  );
}

export function PortraitSection({ character, onPatch, onOpenImport }: PortraitSectionProps) {
  const { toast } = useToast();
  const [views, setViews] = useState<PortraitViewRow[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ rowId: string; index: number; item: PortraitViewItem; url: string } | null>(null);
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({});
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState<string>('');
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
  /** 可以作为移动目标的分行（散图是虚拟行，不能收东西） */
  const managedRows = useMemo(() => (views ?? []).filter((row) => !row.isStray), [views]);

  /** 改完记录后按落库结果重画视图（批量操作会同时动多行，逐条改本地态不划算） */
  const patchAndReload = useCallback(async (patch: CharacterPatch) => {
    const saved = await onPatch(patch);
    setViews(await loadPortraitViews(saved));
    return saved;
  }, [onPatch]);

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
      setLightbox((current) => current && current.item.itemId === item.itemId
        ? { ...current, item: { ...current.item, name: next.trim() } }
        : current);
    } catch (error) {
      toast({ title: '重命名失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  const handleReplaceItem = (item: PortraitViewItem) => {
    if (!item.itemId) return;
    replaceItemId.current = item.itemId;
    fileRef.current?.click();
  };

  // ---- 删除（单张 / 整行 / 批量走同一个确认框，两个按钮=删不删本地图片） ----

  const deleteTargetIds = useMemo(() => {
    if (!pendingDelete) return [];
    return pendingDelete.kind === 'row'
      ? pendingDelete.row.items.map((item) => item.itemId).filter((id): id is string => !!id)
      : pendingDelete.itemIds;
  }, [pendingDelete]);

  const runDelete = async (deleteFiles: boolean) => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    try {
      if (target.kind === 'row') {
        await patchAndReload((current) => removePortraitRow(current, target.row.rowId, deleteFiles));
        toast({
          title: `已删除分行「${target.row.title}」`,
          description: deleteFiles ? '图片已移入系统回收站，可从那里恢复。' : '图片文件留在原文件夹里，之后会按「散图」展示。',
        });
      } else {
        await patchAndReload((current) => removePortraitItems(current, target.itemIds, deleteFiles));
        setSelected(new Set());
        toast({
          title: `已删除 ${target.itemIds.length} 张立绘`,
          description: deleteFiles ? '图片已移入系统回收站，可从那里恢复。' : '图片文件留在原文件夹里，之后会按「散图」展示。',
        });
      }
      setLightbox(null);
    } catch (error) {
      toast({ title: '删除失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  // ---- 批量选择 ----

  const toggleSelected = (itemId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const runMove = async () => {
    const ids = [...selected];
    const target = moveTarget;
    setMoveOpen(false);
    if (!target || ids.length === 0) return;
    try {
      await patchAndReload((current) => movePortraitItems(current, ids, target));
      setSelected(new Set());
      toast({ title: `已移动 ${ids.length} 张到「${managedRows.find((row) => row.rowId === target)?.title ?? '目标分行'}」` });
    } catch (error) {
      toast({ title: '移动失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    }
  };

  // ---- 灯箱 ----

  const moveLightbox = useCallback(async (delta: number) => {
    if (!lightbox) return;
    const row = views?.find((entry) => entry.rowId === lightbox.rowId);
    if (!row || row.items.length < 2) return;
    const index = (lightbox.index + delta + row.items.length) % row.items.length;
    const item = row.items[index];
    const url = await loadPortraitImage(item);
    if (url) setLightbox({ rowId: row.rowId, index, item, url });
  }, [lightbox, views]);

  const lightboxRowSize = views?.find((row) => row.rowId === lightbox?.rowId)?.items.length ?? 0;

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
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">
          按行组织：一行可以是一个角色，也可以是剧情的一个阶段。行内横向滚动，也可展开成网格。
        </span>
        <div className="ml-auto flex gap-1.5 shrink-0">
          <Button
            variant={selectMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          >
            <CheckSquare className="w-3.5 h-3.5 mr-1" />
            {selectMode ? '退出批量' : '批量管理'}
          </Button>
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

      {selectMode && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-elevated px-3 py-2">
          <span className="text-xs text-muted-foreground">
            已选 {selected.size} 张{selected.size === 0 ? '（点缩略图勾选；散图是文件夹里手放的图，不参与批量）' : ''}
          </span>
          <div className="ml-auto flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0 || managedRows.length < 2}
              onClick={() => { setMoveTarget(''); setMoveOpen(true); }}
            >
              <FolderInput className="w-3.5 h-3.5 mr-1" />
              移动到分行
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={selected.size === 0}
              onClick={() => setPendingDelete({ kind: 'items', itemIds: [...selected] })}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              删除
            </Button>
          </div>
        </div>
      )}

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
                    <>
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
                      <Button
                        variant="ghost" size="sm" className="px-2 text-xs text-destructive hover:text-destructive"
                        title="删除这一行（可选择是否连图片一起删）"
                        onClick={() => setPendingDelete({ kind: 'row', row })}
                      >
                        <Trash2 className="w-3 h-3 mr-0.5" />
                        删除行
                      </Button>
                    </>
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
                      ? 'grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))]'
                      : 'flex overflow-x-auto scrollbar-thin pb-1',
                  )}
                >
                  {row.items.map((item, i) => {
                    const selectable = selectMode && !!item.itemId;
                    return (
                      <div key={item.itemId ?? `${row.rowId}-stray-${i}`} className={cn('group/pc', !open && 'w-40 shrink-0')}>
                        <PortraitThumb
                          item={item}
                          selectable={selectable}
                          selected={selectable && selected.has(item.itemId!)}
                          onOpen={(url) => {
                            if (selectMode) {
                              if (item.itemId) toggleSelected(item.itemId);
                              return;
                            }
                            setLightbox({ rowId: row.rowId, index: i, item, url });
                          }}
                        />
                        <div className="mt-1 flex items-center gap-1 text-[11px] leading-tight">
                          <span
                            className="min-w-0 truncate text-muted-foreground"
                            title={`${item.name}${item.source === 'replaced' ? '（被替换的旧卡面自动存档）' : item.source === 'stray' ? '（文件夹里的图片，未入库）' : ''}`}
                          >
                            {item.name}
                          </span>
                          {item.isCurrent ? (
                            <span className="ml-auto shrink-0 text-primary font-medium">当前</span>
                          ) : !selectMode && (
                            <button
                              className="ml-auto shrink-0 text-primary opacity-0 group-hover/pc:opacity-100 transition-opacity"
                              onClick={() => void handleSetCard(item)}
                              title="把这张图设为角色卡面（卡数据嵌入图内，原卡面自动存档）"
                            >
                              设为当前
                            </button>
                          )}
                        </div>
                        {item.itemId && !selectMode && (
                          <div className="mt-1 flex gap-1 opacity-0 group-hover/pc:opacity-100 focus-within:opacity-100 transition-opacity">
                            <button className="tap-target text-muted-foreground" onClick={() => void handleRenameItem(item)} title="重命名立绘" aria-label="重命名立绘"><Pencil className="w-3 h-3" /></button>
                            <button className="tap-target text-muted-foreground" onClick={() => handleReplaceItem(item)} title="替换立绘" aria-label="替换立绘"><Replace className="w-3 h-3" /></button>
                            <button className="tap-target text-destructive" onClick={() => setPendingDelete({ kind: 'items', itemIds: [item.itemId!] })} title="删除立绘" aria-label="删除立绘"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
            void patchAndReload((current) => replacePortraitItem(current, replaceId, files[0]))
              .catch((error) => toast({ title: '替换失败', description: error instanceof Error ? error.message : undefined, variant: 'destructive' }));
          } else {
            void handleImportFiles(files);
          }
        }}
      />

      {/* lightbox：图下方带操作条，放大着就能改名/替换/设卡面/删（0826 反馈 3） */}
      <Dialog open={!!lightbox} onOpenChange={(v) => !v && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2 bg-transparent border-0 shadow-none">
          <DialogTitle className="sr-only">{lightbox?.item.name}</DialogTitle>
          {lightbox && (
            <div className="space-y-2">
              <div className="relative flex items-center justify-center">
                <button className="tap-target absolute left-1 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 p-2" onClick={() => void moveLightbox(-1)} title="上一张" aria-label="上一张"><ChevronLeft className="w-5 h-5" /></button>
                <img src={lightbox.url} alt={lightbox.item.name} className="w-full max-h-[72vh] object-contain rounded-lg" />
                <button className="tap-target absolute right-1 top-1/2 -translate-y-1/2 z-10 rounded-full bg-background/80 p-2" onClick={() => void moveLightbox(1)} title="下一张" aria-label="下一张"><ChevronRight className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground" title={lightbox.item.name}>
                  {lightbox.item.name}
                  {lightboxRowSize > 1 && <span className="ml-1.5">{lightbox.index + 1}/{lightboxRowSize}</span>}
                </span>
                <div className="ml-auto flex flex-wrap gap-1.5">
                  {lightbox.item.isCurrent ? (
                    <span className="self-center text-xs text-primary">当前卡面</span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => void handleSetCard(lightbox.item)} title="把这张图设为角色卡面（卡数据嵌入图内，原卡面自动存档）">
                      <ImageDown className="w-3.5 h-3.5 mr-1" />
                      设为卡面
                    </Button>
                  )}
                  {lightbox.item.itemId && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => void handleRenameItem(lightbox.item)}>
                        <Pencil className="w-3.5 h-3.5 mr-1" />
                        重命名
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleReplaceItem(lightbox.item)}>
                        <Replace className="w-3.5 h-3.5 mr-1" />
                        替换
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setPendingDelete({ kind: 'items', itemIds: [lightbox.item.itemId!] })}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        删除
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setLightbox(null)}>
                    <X className="w-3.5 h-3.5 mr-1" />
                    关闭
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除确认：两个动作按钮分别对应删不删磁盘上的图片 */}
      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.kind === 'row'
                ? `删除分行「${pendingDelete.row.title}」？`
                : `删除 ${deleteTargetIds.length} 张立绘？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.kind === 'row' && pendingDelete.row.items.length > deleteTargetIds.length
                ? '这一行里用户手放的散图不会被删，文件夹会保留。'
                : ''}
              图片文件可以一起删掉（进系统回收站，能恢复），也可以留在文件夹里——留下的之后按「散图」只读展示。
              角色卡 PNG 本身不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>取消</AlertDialogCancel>
            <Button variant="outline" onClick={() => void runDelete(false)}>只删记录，保留图片</Button>
            <Button variant="destructive" onClick={() => void runDelete(true)}>连图片一起删</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 批量移动到别的分行 */}
      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>把 {selected.size} 张移动到</DialogTitle>
          </DialogHeader>
          <Select value={moveTarget} onValueChange={setMoveTarget}>
            <SelectTrigger>
              <SelectValue placeholder="选择目标分行" />
            </SelectTrigger>
            <SelectContent>
              {managedRows.map((row) => (
                <SelectItem key={row.rowId} value={row.rowId}>{row.title}（{row.items.length} 张）</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveOpen(false)}>取消</Button>
            <Button disabled={!moveTarget} onClick={() => void runMove()}>移动</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
