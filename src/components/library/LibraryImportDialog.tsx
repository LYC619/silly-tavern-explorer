import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ImagePlus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { PreparedLibraryCharacterImport } from '@/lib/library-character-import';
import type { ManagedTagOption } from '@/lib/library-tag-preferences';
import { CHARACTER_TYPES } from '@/lib/archive-db';
import type { CharacterType } from '@/types/archive';

export interface LibraryImportTagSelection {
  applyTags: boolean;
  tags: string[];
  customTag?: string;
  type?: CharacterType;
}

interface LibraryImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PreparedLibraryCharacterImport[];
  failures: string[];
  tagOptions: ManagedTagOption[];
  busy: boolean;
  onConfirm: (selection: LibraryImportTagSelection) => void | Promise<void>;
}

export function LibraryImportDialog({
  open,
  onOpenChange,
  items,
  failures,
  tagOptions,
  busy,
  onConfirm,
}: LibraryImportDialogProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [customTag, setCustomTag] = useState('');
  const [applyToBatch, setApplyToBatch] = useState(true);
  const [type, setType] = useState<CharacterType | undefined>();
  const batchKey = items.map((item) => `${item.fileName}:${item.kind}`).join('|');

  useEffect(() => {
    if (!open) return;
    setPicked(new Set());
    setCustomTag('');
    setApplyToBatch(true);
    setType(undefined);
  }, [batchKey, open]);

  const groups = useMemo(() => {
    const map = new Map<string, ManagedTagOption[]>();
    for (const option of tagOptions) {
      if (option.category === '评价') continue;
      const group = map.get(option.category) ?? [];
      group.push(option);
      map.set(option.category, group);
    }
    return [...map.entries()];
  }, [tagOptions]);

  const batch = items.length > 1;
  const taggingEnabled = !batch || applyToBatch;
  const blankCount = items.filter((item) => item.kind === 'blank-image').length;

  const toggleTag = (raw: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(raw)) next.delete(raw);
      else next.add(raw);
      return next;
    });
  };

  const confirm = () => onConfirm({
    applyTags: taggingEnabled,
    tags: taggingEnabled ? [...picked] : [],
    customTag: taggingEnabled && customTag.trim() ? customTag.trim() : undefined,
    type,
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
        <DialogHeader>
          <DialogTitle>确认导入角色卡</DialogTitle>
          <DialogDescription>
            先确认文件处理结果，再选择是否添加 STE 本地标签。原角色卡内容不会因标签选择而改变。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 overflow-y-auto pr-1 scrollbar-thin md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 space-y-3">
            <div className="rounded-lg border border-[color:var(--border-normal)] bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text-body)]">
                <ImagePlus className="h-4 w-4 text-[color:var(--brand-hi)]" />
                待导入 {items.length} 张
              </div>
              {blankCount > 0 && (
                <p className="mt-1.5 text-xs leading-relaxed text-[color:var(--text-muted)]">
                  {blankCount} 张普通图片将创建为空白角色卡；封面会保留，并写入可被 SillyTavern 识别的 V2 元数据。
                </p>
              )}
            </div>

            <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
              {items.map((item) => (
                <div
                  key={`${item.fileName}:${item.character.id}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-[color:var(--hairline-inner)] px-2.5 py-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-[color:var(--text-body)]" title={item.fileName}>
                    {item.character.name}
                  </span>
                  <span className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px]',
                    item.kind === 'blank-image'
                      ? 'bg-[var(--brand-active-bg)] text-brand'
                      : 'bg-[var(--hover-overlay)] text-[color:var(--text-muted)]',
                  )}>
                    {item.kind === 'blank-image' ? '空白卡' : '角色卡'}
                  </span>
                </div>
              ))}
            </div>

            {failures.length > 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {failures.length} 个文件无法导入
                </div>
                <ul className="mt-1.5 max-h-24 space-y-1 overflow-y-auto pl-5">
                  {failures.map((failure) => <li key={failure} className="list-disc break-all">{failure}</li>)}
                </ul>
              </div>
            )}
          </section>

          <section className="min-w-0 rounded-lg border border-[color:var(--border-normal)] bg-[var(--bg-elevated)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <Tags className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--brand-hi)]" />
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--text-body)]">导入时添加标签</h3>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">只写入 STE 的本地整理标签，可多选。</p>
                </div>
              </div>
              {batch && (
                <Switch
                  checked={applyToBatch}
                  onCheckedChange={setApplyToBatch}
                  aria-label="统一为全部导入角色添加标签"
                />
              )}
            </div>

            {batch && (
              <p className="mt-2 rounded-md bg-[var(--hover-overlay)] px-2.5 py-2 text-xs text-[color:var(--text-muted)]">
                {applyToBatch ? `所选标签会统一添加给这 ${items.length} 张卡。` : '本次批量导入不添加标签。'}
              </p>
            )}

            <div data-library-import-type className="mt-3 rounded-md border border-[color:var(--hairline-inner)] bg-[var(--bg-canvas)] p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[color:var(--text-body)]">类型</p>
                  {type && (
                    <button
                      type="button"
                      className="text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)]"
                      onClick={() => setType(undefined)}
                    >
                      清除
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-[color:var(--text-muted)]">类型会统一应用到本批全部卡片，不受下方标签开关影响；不选择则保持未分类。</p>
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {CHARACTER_TYPES.map((option) => (
                    <button
                      type="button"
                      key={option}
                      aria-pressed={type === option}
                      onClick={() => setType((current) => current === option ? undefined : option)}
                      className={cn(
                        'min-w-0 rounded-md border px-1.5 py-1.5 text-xs transition-colors',
                        type === option
                          ? 'border-[color:var(--brand-hairline)] bg-[var(--brand-active-bg)] text-brand'
                          : 'border-[color:var(--border-normal)] text-[color:var(--text-body)] hover:bg-[var(--hover-overlay)]',
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
            </div>

            <div className={cn('mt-3 space-y-3 transition-opacity', !taggingEnabled && 'pointer-events-none opacity-40')}>
              <div className="max-h-52 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
                {groups.map(([category, options]) => (
                  <div key={category}>
                    <p className="mb-1.5 text-[11px] font-semibold text-[color:var(--text-muted)]">{category}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map((option) => (
                        <button
                          type="button"
                          key={option.raw}
                          aria-pressed={picked.has(option.raw)}
                          onClick={() => toggleTag(option.raw)}
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-xs transition-colors',
                            picked.has(option.raw)
                              ? 'border-transparent bg-[var(--brand-active-bg)] text-brand'
                              : 'border-[color:var(--border-normal)] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)]',
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-[color:var(--hairline-inner)] pt-3">
                <label htmlFor="library-import-custom-tag" className="text-[11px] font-semibold text-[color:var(--text-muted)]">
                  自定义标签（可选）
                </label>
                <Input
                  id="library-import-custom-tag"
                  value={customTag}
                  onChange={(event) => setCustomTag(event.target.value)}
                  placeholder="如：历史/三国，或 收藏"
                  className="mt-1.5 text-sm"
                />
                <p className="mt-1 text-[11px] text-[color:var(--text-faint)]">未知的一级标签会自动加入标签管理系统。</p>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
          <Button disabled={busy || items.length === 0} onClick={() => void confirm()}>
            {busy ? '正在导入…' : `导入 ${items.length} 张角色卡`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
