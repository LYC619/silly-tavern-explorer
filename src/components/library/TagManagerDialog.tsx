import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GripVertical, HelpCircle, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ManagedTagRow } from '@/components/library/ManagedTagRow';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter, CharacterType } from '@/types/archive';
import { CHARACTER_TYPES, updateCharacter } from '@/lib/archive-db';
import { applyCharacterTagPatch, applyCharacterTypePatch } from '@/lib/character-tag-domain';
import {
  CATEGORY_HELP,
  validateUserTagInput,
  type TagCategory,
} from '@/lib/tag-taxonomy';
import {
  addCustomTagDefinition,
  addCustomCategory,
  buildManagedTagOptions,
  getTagCategories,
  moveTag,
  removeCustomTagDefinition,
  setTagVisibility,
  type LibraryTagPreferences,
  type ManagedTagOption,
} from '@/lib/library-tag-preferences';

interface TagManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: ArchiveCharacter[];
  selectedCharacters: ArchiveCharacter[];
  preferences: LibraryTagPreferences;
  onPreferencesChange: (next: LibraryTagPreferences) => void | Promise<void>;
  onChanged: () => void | Promise<void>;
}

type DropEdge = 'before' | 'after';
type PointerTarget = { kind: 'tag' | 'category'; raw: string; edge: DropEdge };

function previewInsertion<T>(
  items: readonly T[],
  draggedRaw: string,
  targetRaw: string,
  edge: DropEdge,
  rawOf: (item: T) => string,
): T[] {
  const next = items.filter((item) => rawOf(item) !== draggedRaw);
  const targetIndex = next.findIndex((item) => rawOf(item) === targetRaw);
  const dragged = items.find((item) => rawOf(item) === draggedRaw);
  if (!dragged || targetIndex < 0) return [...items];
  next.splice(targetIndex + (edge === 'after' ? 1 : 0), 0, dragged);
  return next;
}

export function TagManagerDialog({
  open,
  onOpenChange,
  characters,
  selectedCharacters,
  preferences,
  onPreferencesChange,
  onChanged,
}: TagManagerDialogProps) {
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState<TagCategory | '类型'>('人物');
  const [newLabel, setNewLabel] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const pointerDragRef = useRef<{
    kind: 'tag' | 'category';
    raw: string;
    pointerId: number;
    handle: HTMLElement;
  } | null>(null);
  const pointerDropTargetRef = useRef<PointerTarget | null>(null);
  const [pointerDragging, setPointerDragging] = useState<{ kind: 'tag' | 'category'; raw: string } | null>(null);
  const [pointerDropTarget, setPointerDropTarget] = useState<PointerTarget | null>(null);
  const [assignmentRaw, setAssignmentRaw] = useState<string | null>(null);
  const [assignmentType, setAssignmentType] = useState<CharacterType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ManagedTagOption | null>(null);

  const options = useMemo(
    () => buildManagedTagOptions(characters.flatMap((character) => character.tags), preferences),
    [characters, preferences],
  );
  const activeOptions = useMemo(
    () => options.filter((option) => option.category === activeCategory),
    [activeCategory, options],
  );
  const categories = useMemo(() => [...getTagCategories(preferences), '未分类' as TagCategory], [preferences]);
  const assignmentOption = options.find((option) => option.raw === assignmentRaw) ?? null;
  const typeCounts = useMemo(() => {
    const counts = new Map<CharacterType, number>(CHARACTER_TYPES.map((type) => [type, 0]));
    for (const character of characters) {
      if (character.type) counts.set(character.type, (counts.get(character.type) ?? 0) + 1);
    }
    return counts;
  }, [characters]);
  const previewCategories = useMemo(() => {
    if (pointerDragging?.kind !== 'category' || pointerDropTarget?.kind !== 'category') return categories;
    return previewInsertion(categories, pointerDragging.raw, pointerDropTarget.raw, pointerDropTarget.edge, String);
  }, [categories, pointerDragging, pointerDropTarget]);
  const previewOptions = useMemo(() => {
    if (pointerDragging?.kind !== 'tag' || pointerDropTarget?.kind !== 'tag') return activeOptions;
    return previewInsertion(activeOptions, pointerDragging.raw, pointerDropTarget.raw, pointerDropTarget.edge, (option) => option.raw);
  }, [activeOptions, pointerDragging, pointerDropTarget]);

  const savePreferences = useCallback(async (next: LibraryTagPreferences, message?: string) => {
    setBusy(true);
    try {
      await onPreferencesChange(next);
      if (message) toast({ title: message });
    } catch {
      toast({ title: '标签设置保存失败', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  }, [onPreferencesChange, toast]);

  const handleAdd = async () => {
    if (activeCategory === '类型') return;
    try {
      const next = addCustomTagDefinition(preferences, activeCategory, newLabel);
      await savePreferences(next, `已新增「${newLabel.trim()}」`);
      setNewLabel('');
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '无法新增标签', variant: 'destructive' });
    }
  };

  const handleAddCategory = async () => {
    try {
      const label = newCategory.trim();
      const next = addCustomCategory(preferences, label);
      await savePreferences(next, `已新增标签组「${label}」`);
      setNewCategory('');
      setActiveCategory(label);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : '无法新增标签组', variant: 'destructive' });
    }
  };

  const handleMove = async (raw: string, targetCategoryIndex: number) => {
    const target = activeOptions[targetCategoryIndex];
    if (!target) return;
    const allRaws = options.map((option) => option.raw);
    const targetIndex = allRaws.indexOf(target.raw);
    await savePreferences(moveTag(preferences, allRaws, raw, targetIndex));
  };

  const handleDrop = useCallback(async (draggedRaw: string, targetRaw: string, edge: DropEdge) => {
    if (!draggedRaw || draggedRaw === targetRaw) return;
    const allRaws = options.map((option) => option.raw);
    const ordered = previewInsertion(allRaws, draggedRaw, targetRaw, edge, String);
    const leftovers = preferences.order.filter((raw) => !ordered.includes(raw));
    await savePreferences({ ...preferences, order: [...ordered, ...leftovers] });
  }, [options, preferences, savePreferences]);

  const handleDropCategory = useCallback(async (draggedCategory: string, targetCategory: string, edge: DropEdge) => {
    if (!draggedCategory || draggedCategory === targetCategory || targetCategory === '未分类') return;
    const ordered = previewInsertion(
      categories.filter((category) => category !== '未分类'),
      draggedCategory,
      targetCategory,
      edge,
      String,
    );
    await savePreferences({ ...preferences, categoryOrder: ordered });
  }, [categories, preferences, savePreferences]);

  const clearPointerDrag = useCallback(() => {
    const drag = pointerDragRef.current;
    if (drag) {
      try {
        if (drag.handle.hasPointerCapture?.(drag.pointerId)) {
          drag.handle.releasePointerCapture?.(drag.pointerId);
        }
      } catch { /* WebView may have released capture before pointerup bubbles. */ }
    }
    pointerDragRef.current = null;
    pointerDropTargetRef.current = null;
    setPointerDragging(null);
    setPointerDropTarget(null);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, []);

  const startPointerDrag = (
    drag: { kind: 'tag' | 'category'; raw: string },
    event: React.PointerEvent<HTMLElement>,
  ) => {
    if (busy || event.button !== 0) return;
    const handle = event.currentTarget;
    try { handle.setPointerCapture?.(event.pointerId); } catch { /* older WebView fallback */ }
    pointerDragRef.current = { ...drag, pointerId: event.pointerId, handle };
    setPointerDragging(drag);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  };

  useEffect(() => {
    const resolvePointerTarget = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return null;
      const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      if (drag.kind === 'tag') {
        const row = element?.closest<HTMLElement>('[data-managed-tag]');
        const raw = row?.dataset.managedTag;
        if (!raw || raw === drag.raw || !activeOptions.some((option) => option.raw === raw)) return null;
        const rect = row.getBoundingClientRect();
        return { kind: 'tag' as const, raw, edge: event.clientY < rect.top + rect.height / 2 ? 'before' as const : 'after' as const };
      }
      const row = element?.closest<HTMLElement>('[data-tag-category-row]');
      const raw = row?.dataset.tagCategoryRow;
      if (!raw || raw === drag.raw || raw === '未分类') return null;
      const rect = row.getBoundingClientRect();
      return { kind: 'category' as const, raw, edge: event.clientY < rect.top + rect.height / 2 ? 'before' as const : 'after' as const };
    };
    const movePointerDrag = (event: PointerEvent) => {
      if (!pointerDragRef.current) return;
      const target = resolvePointerTarget(event);
      pointerDropTargetRef.current = target;
      setPointerDropTarget((current) => (
        current?.kind === target?.kind && current?.raw === target?.raw && current?.edge === target?.edge ? current : target
      ));
    };
    const finishPointerDrag = (event: PointerEvent) => {
      const drag = pointerDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const target = pointerDropTargetRef.current ?? resolvePointerTarget(event);
      clearPointerDrag();
      if (!target || target.kind !== drag.kind) return;
      if (drag.kind === 'tag') void handleDrop(drag.raw, target.raw, target.edge);
      else void handleDropCategory(drag.raw, target.raw, target.edge);
    };
    const cancelPointerDrag = () => {
      if (pointerDragRef.current) clearPointerDrag();
    };
    window.addEventListener('pointermove', movePointerDrag);
    window.addEventListener('pointerup', finishPointerDrag);
    window.addEventListener('pointercancel', cancelPointerDrag);
    return () => {
      window.removeEventListener('pointermove', movePointerDrag);
      window.removeEventListener('pointerup', finishPointerDrag);
      window.removeEventListener('pointercancel', cancelPointerDrag);
      if (pointerDragRef.current) clearPointerDrag();
    };
  }, [activeOptions, clearPointerDrag, handleDrop, handleDropCategory]);

  const assignSelectedTag = async () => {
    if (!assignmentOption || selectedCharacters.length === 0) return;
    // 类型/评价档位不允许当普通标签分配：类型走类型面板，档位随评分自动。
    const rejected = validateUserTagInput(assignmentOption.raw);
    if (rejected) {
      toast({ title: rejected, variant: 'destructive' });
      return;
    }
    const targets = selectedCharacters.filter((character) => !character.tags.includes(assignmentOption.raw));
    if (targets.length === 0) {
      toast({ title: `所选角色卡都已有「${assignmentOption.label}」` });
      return;
    }
    setBusy(true);
    try {
      for (const character of targets) {
        applyCharacterTagPatch(character, { tags: [...character.tags, assignmentOption.raw] });
      }
      for (const character of targets) {
        await updateCharacter(character.id, (current) => {
          if (current.tags.includes(assignmentOption.raw)) return undefined;
          return {
            ...applyCharacterTagPatch(current, { tags: [...current.tags, assignmentOption.raw] }),
            updatedAt: Date.now(),
          };
        });
      }
      await onChanged();
      toast({
        title: `已为 ${targets.length} 张卡添加「${assignmentOption.label}」`,
        description: targets.length < selectedCharacters.length
          ? `${selectedCharacters.length - targets.length} 张卡原本已有该标签，已跳过。`
          : undefined,
      });
    } catch (error) {
      toast({
        title: '批量添加标签失败',
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const assignSelectedType = async () => {
    if (!assignmentType || selectedCharacters.length === 0) return;
    const targets = selectedCharacters.filter((character) => (
      character.type !== assignmentType || character.tags.some((raw) => raw.startsWith('类型/'))
    ));
    if (targets.length === 0) {
      toast({ title: `所选角色卡都已是类型「${assignmentType}」` });
      return;
    }
    setBusy(true);
    try {
      for (const character of targets) {
        await updateCharacter(character.id, (current) => ({
          ...applyCharacterTypePatch(current, assignmentType),
          updatedAt: Date.now(),
        }));
      }
      await onChanged();
      toast({ title: `已为 ${targets.length} 张卡设置类型「${assignmentType}」` });
    } catch {
      toast({ title: '批量设置类型失败', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const deleteCustomTag = async (option: ManagedTagOption) => {
    setBusy(true);
    try {
      const owners = characters.filter((character) => character.tags.includes(option.raw));
      for (const owner of owners) {
        applyCharacterTagPatch(owner, { tags: owner.tags.filter((tag) => tag !== option.raw) });
      }
      for (const owner of owners) {
        await updateCharacter(owner.id, (current) => ({
          ...applyCharacterTagPatch(current, { tags: current.tags.filter((tag) => tag !== option.raw) }),
          updatedAt: Date.now(),
        }));
      }
      await onPreferencesChange(removeCustomTagDefinition(preferences, option.raw));
      await onChanged();
      setPendingDelete(null);
      toast({ title: owners.length > 0
        ? `已删除标签，并从 ${owners.length} 张角色卡上移除`
        : '已删除自定义标签' });
    } catch {
      toast({ title: '删除标签失败', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = (option: ManagedTagOption) => {
    if (option.count > 0) setPendingDelete(option);
    else void deleteCustomTag(option);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-4xl overflow-hidden grid-rows-[auto_minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>标签管理</DialogTitle>
            <DialogDescription>
              新增自定义标签、调整左侧显示顺序，或隐藏暂时不需要的标签。隐藏不会修改任何角色卡。
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 grid-cols-[13rem_minmax(0,1fr)] overflow-hidden rounded-xl border border-[color:var(--border-normal)]">
            <aside className="flex min-h-0 flex-col overflow-hidden border-r border-[color:var(--border-normal)] bg-[var(--bg-elevated)] p-2">
              <div className="min-h-0 flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => {
                  setActiveCategory('类型');
                  setAssignmentRaw(null);
                }}
                className={cn(
                  'mb-2 flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-sm font-semibold',
                  activeCategory === '类型'
                    ? 'border-[color:var(--brand)] bg-[var(--brand-active-bg)] text-brand'
                    : 'border-[color:var(--hairline-inner)] bg-[var(--bg-elevated)] text-[color:var(--text-body)] hover:bg-[var(--hover-overlay)]',
                )}
              >
                <span>类型</span>
                <span className="text-[11px] font-normal opacity-70">互斥</span>
              </button>
              {previewCategories.map((category) => {
                const count = options.filter((option) => option.category === category).length;
                return (
                  <div
                    key={category}
                    data-tag-category-row={category}
                    data-pointer-drop-edge={pointerDropTarget?.kind === 'category'
                      && pointerDropTarget.raw === category ? pointerDropTarget.edge : undefined}
                    className={cn(
                      'relative mb-1 flex h-10 w-full items-center rounded-lg transition-[background-color,transform] duration-150',
                      activeCategory === category ? 'bg-[var(--brand-active-bg)]' : 'hover:bg-[var(--hover-overlay)]',
                      pointerDragging?.kind === 'category' && pointerDragging.raw === category && 'opacity-50',
                    )}
                  >
                    {pointerDropTarget?.kind === 'category' && pointerDropTarget.raw === category && (
                      <span
                        data-tag-category-insertion-line
                        className={cn(
                          'pointer-events-none absolute left-1 right-1 z-10 h-0.5 rounded-full bg-[var(--brand)] shadow-[0_0_0_2px_var(--bg-elevated)]',
                          pointerDropTarget.edge === 'before' ? '-top-[3px]' : '-bottom-[3px]',
                        )}
                      />
                    )}
                    {category !== '未分类' && (
                      <span
                        data-tag-category-drag-handle={category}
                        title="拖拽调整一级标签顺序"
                        draggable={false}
                        onDragStart={(event) => event.preventDefault()}
                        className="ml-1 flex h-8 w-6 shrink-0 touch-none select-none cursor-grab items-center justify-center text-[color:var(--text-faint)] active:cursor-grabbing"
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          startPointerDrag({ kind: 'category', raw: category }, event);
                        }}
                      >
                        <GripVertical className="h-4 w-4" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveCategory(category);
                        setAssignmentType(null);
                      }}
                      className={cn(
                        'flex h-full min-w-0 flex-1 items-center justify-between px-2 text-left text-sm',
                        activeCategory === category ? 'text-brand' : 'text-[color:var(--text-body)]',
                      )}
                    >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate" title={category}>{category}</span>
                      <span title={CATEGORY_HELP[category as keyof typeof CATEGORY_HELP] ?? '自定义标签组'} className="shrink-0 cursor-help">
                        <HelpCircle className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="text-xs opacity-65">{count}</span>
                    </button>
                  </div>
                );
              })}
              </div>
              <div className="mt-2 shrink-0 border-t border-[color:var(--border-normal)] pt-2">
                <p className="mb-1 text-[11px] text-[color:var(--text-muted)]">新建一级标签</p>
                <div className="flex items-center gap-1">
                  <Input
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newCategory.trim()) void handleAddCategory();
                    }}
                    placeholder="如：历史"
                    className="min-w-0 text-xs"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="shrink-0"
                    aria-label="新增一级标签"
                    disabled={busy || !newCategory.trim()}
                    onClick={() => void handleAddCategory()}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col bg-[var(--bg-canvas)]">
              {activeCategory !== '类型' && (
              <div className="shrink-0 border-b border-[color:var(--border-normal)] p-3">
                <p className="mb-2 text-xs text-[color:var(--text-muted)]">
                  新增到“{activeCategory}”分类；新标签创建后可稍后批量分配给角色。
                </p>
                <div className="flex items-center gap-2">
                  <Input size="lg"
                    value={newLabel}
                    onChange={(event) => setNewLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && newLabel.trim()) void handleAdd();
                    }}
                    placeholder="输入标签名称"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={busy || !newLabel.trim()}
                    onClick={() => void handleAdd()}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    新增标签
                  </Button>
                </div>
              </div>
              )}

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {activeCategory === '类型' ? (
                  <div className="grid grid-cols-2 gap-2.5" data-managed-type-grid>
                    {CHARACTER_TYPES.map((type) => (
                      <button
                        type="button"
                        key={type}
                        aria-label={`选择类型 ${type}`}
                        aria-pressed={assignmentType === type}
                        onClick={() => {
                          setAssignmentType((current) => current === type ? null : type);
                          setAssignmentRaw(null);
                        }}
                        className={cn(
                          'flex min-h-14 items-center justify-between rounded-lg border px-3 text-left transition-colors',
                          assignmentType === type
                            ? 'border-[color:var(--brand)] bg-[var(--brand-active-bg)] text-brand'
                            : 'border-[color:var(--border-normal)] bg-[var(--bg-elevated)] text-[color:var(--text-body)] hover:bg-[var(--hover-overlay)]',
                        )}
                      >
                        <span className="font-medium">{type}</span>
                        <span className="text-xs opacity-65">{typeCounts.get(type) ?? 0} 张</span>
                      </button>
                    ))}
                  </div>
                ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {previewOptions.map((option, index) => (
                    <ManagedTagRow
                      key={option.raw}
                      option={option}
                      index={index}
                      total={previewOptions.length}
                      busy={busy}
                      selected={assignmentRaw === option.raw}
                      dropEdge={pointerDropTarget?.kind === 'tag' && pointerDropTarget.raw === option.raw
                        ? pointerDropTarget.edge
                        : undefined}
                      onVisibilityChange={(raw, visible) => {
                        void savePreferences(setTagVisibility(preferences, raw, visible));
                      }}
                      onMove={(raw, targetIndex) => void handleMove(raw, targetIndex)}
                      onPointerDown={(event) => startPointerDrag({ kind: 'tag', raw: option.raw }, event)}
                      onSelect={(raw) => {
                        setAssignmentRaw((current) => current === raw ? null : raw);
                        setAssignmentType(null);
                      }}
                      onDelete={requestDelete}
                    />
                  ))}
                </div>
                )}
                {activeCategory !== '类型' && activeOptions.length === 0 && (
                  <p className="py-12 text-center text-sm text-[color:var(--text-muted)]">这个分类还没有标签</p>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[color:var(--border-normal)] bg-[var(--bg-elevated)] px-3 py-2.5">
                <div className="min-w-0 text-xs text-[color:var(--text-muted)]">
                  {assignmentType ? (
                    <>
                      已选类型：<span className="font-medium text-[color:var(--text-body)]">{assignmentType}</span>
                      {selectedCharacters.length === 0 && (
                        <span className="ml-2 text-[color:var(--text-faint)]">请先在角色库开启批量管理并选择角色卡</span>
                      )}
                    </>
                  ) : assignmentOption ? (
                    <>
                      已选标签：<span className="font-medium text-[color:var(--text-body)]">{assignmentOption.raw}</span>
                      {selectedCharacters.length === 0 && (
                        <span className="ml-2 text-[color:var(--text-faint)]">请先在角色库开启批量管理并选择角色卡</span>
                      )}
                    </>
                  ) : '点击标签名称选择要批量添加的标签'}
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0"
                  disabled={busy || (!assignmentOption && !assignmentType) || selectedCharacters.length === 0}
                  onClick={() => void (assignmentType ? assignSelectedType() : assignSelectedTag())}
                >
                  添加到已选 {selectedCharacters.length} 张卡
                </Button>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(next) => !next && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除“{pendingDelete?.label}”？</AlertDialogTitle>
            <AlertDialogDescription>
              这将从 {pendingDelete?.count ?? 0} 张角色卡上移除该标签。角色卡和故事不会被删除，此操作只影响 STE 的本地整理标签。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => pendingDelete && void deleteCustomTag(pendingDelete)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
