import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import type { ToastActionElement } from '@/components/ui/toast';
import type { useToast } from '@/hooks/use-toast';
import { shouldIgnoreGlobalShortcut } from '@/lib/keyboard-shortcuts';
import type { EntryPair } from '@/hooks/use-entry-filters';

type SetWorldbook = React.Dispatch<React.SetStateAction<WorldBook | null>>;
type ToastFn = ReturnType<typeof useToast>['toast'];

interface UseBatchSelectionOptions {
  /** 当前显示顺序，Shift 连选按它取段 */
  filteredEntries: EntryPair[];
  worldbook: WorldBook | null;
  setWorldbook: SetWorldbook;
  /** 批量删除/转移可能把正在编辑的条目一起带走 */
  selectedUid: string | null;
  clearSelectedEntry: () => void;
  toast: ToastFn;
  /** 渲染「撤销」按钮，交给调用方以免 hook 依赖具体 UI 组件 */
  renderUndoAction: (undo: () => void) => ToastActionElement;
}

export interface BatchSelection {
  batchMode: boolean;
  enterBatchMode: () => void;
  exitBatchMode: () => void;
  batchSelected: Set<string>;
  setBatchSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  selectAll: () => void;
  deselectAll: () => void;
  toggleBatchItem: (key: string, checked: boolean, shiftKey?: boolean) => void;
  /** 对选中条目套一个补丁；返回 null 表示这条不改 */
  applyBatch: (
    patch: (entry: WorldBookEntry) => Partial<WorldBookEntry> | null,
    toastOpts: { title: string; description: string },
  ) => void;
  /** 从当前世界书移除选中条目，返回被移除的条数 */
  removeSelected: () => number;
  /** 取选中条目的实体（按 key 顺序，缺失的跳过） */
  selectedEntries: () => WorldBookEntry[];
}

/**
 * 条目批量模式：选择集、Shift 连选、以及「快照 → 打补丁 → 带撤销的 toast」这套
 * 四个批量操作完全一致的骨架（前缀 / 位置 / 策略 / 启用）。
 */
export function useBatchSelection({
  filteredEntries,
  worldbook,
  setWorldbook,
  selectedUid,
  clearSelectedEntry,
  toast,
  renderUndoAction,
}: UseBatchSelectionOptions): BatchSelection {
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());

  const enterBatchMode = useCallback(() => setBatchMode(true), []);
  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setBatchSelected(new Set());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldIgnoreGlobalShortcut(e)) return;
      if (e.key === 'Escape' && batchMode) exitBatchMode();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [batchMode, exitBatchMode]);

  const selectAll = useCallback(
    () => setBatchSelected(new Set(filteredEntries.map(([k]) => k))),
    [filteredEntries],
  );
  const deselectAll = useCallback(() => setBatchSelected(new Set()), []);

  const lastBatchKeyRef = useRef<string | null>(null);
  const toggleBatchItem = useCallback((key: string, checked: boolean, shiftKey?: boolean) => {
    // Shift 连选：从上次点击的条目到当前条目（按当前过滤后的显示顺序）整段设为 checked
    if (shiftKey && lastBatchKeyRef.current) {
      const order = filteredEntries.map(([k]) => k);
      const from = order.indexOf(lastBatchKeyRef.current);
      const to = order.indexOf(key);
      if (from !== -1 && to !== -1) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        const range = order.slice(lo, hi + 1);
        setBatchSelected((prev) => {
          const next = new Set(prev);
          range.forEach((k) => (checked ? next.add(k) : next.delete(k)));
          return next;
        });
        lastBatchKeyRef.current = key;
        return;
      }
    }
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
    lastBatchKeyRef.current = key;
  }, [filteredEntries]);

  const batchUndoRef = useRef<WorldBook | null>(null);
  const undoBatch = useCallback(() => {
    if (batchUndoRef.current) {
      setWorldbook(batchUndoRef.current);
      batchUndoRef.current = null;
      toast({ title: '已撤销' });
    }
  }, [setWorldbook, toast]);

  const applyBatch = useCallback<BatchSelection['applyBatch']>((patch, toastOpts) => {
    batchUndoRef.current = worldbook;
    setWorldbook((prev) => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach((key) => {
        const entry = updated[key];
        if (!entry) return;
        const delta = patch(entry);
        if (delta) updated[key] = { ...entry, ...delta };
      });
      return { ...prev, entries: updated };
    });
    toast({ ...toastOpts, action: renderUndoAction(undoBatch) });
  }, [batchSelected, worldbook, setWorldbook, toast, undoBatch, renderUndoAction]);

  const removeSelected = useCallback(() => {
    const count = batchSelected.size;
    setWorldbook((prev) => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      batchSelected.forEach((key) => { delete updated[key]; });
      return { ...prev, entries: updated };
    });
    if (selectedUid && batchSelected.has(selectedUid)) clearSelectedEntry();
    setBatchSelected(new Set());
    return count;
  }, [batchSelected, selectedUid, clearSelectedEntry, setWorldbook]);

  const selectedEntries = useCallback(
    () => (worldbook ? [...batchSelected].map((k) => worldbook.entries[k]).filter(Boolean) : []),
    [batchSelected, worldbook],
  );

  return {
    batchMode, enterBatchMode, exitBatchMode,
    batchSelected, setBatchSelected, selectAll, deselectAll, toggleBatchItem,
    applyBatch, removeSelected, selectedEntries,
  };
}
