import { useCallback, useEffect, useRef, useState } from 'react';
import { reconcileSelection } from '@/lib/library-query';
import type { ArchiveCharacter } from '@/types/archive';

export interface LibrarySelection {
  batchMode: boolean;
  enterBatchMode: () => void;
  exitBatchMode: () => void;
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  /** 普通/Ctrl 点=切换并记锚点；Shift 点=从锚点到当前整段并入选择集 */
  clickCharacter: (character: ArchiveCharacter, shiftKey: boolean) => void;
  /** 全选当前筛选结果；已经全选时反过来清空 */
  toggleSelectAll: () => void;
}

/**
 * 角色库的批量选择。
 *
 * 锚点存的是 `filtered` 里的下标，所以筛选/排序一变就必须清掉——
 * 否则 Shift 会跨越旧上下文连选出一段用户没看见的范围。翻页同理。
 */
export function useLibrarySelection(filtered: ArchiveCharacter[], page: number): LibrarySelection {
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchorRef = useRef<number | null>(null);

  // 筛选上下文改变时收缩选择集；排序或重新计算也必须清掉旧的 Shift 锚点
  useEffect(() => {
    setSelected((prev) => reconcileSelection(prev, filtered.map((c) => c.id)));
    anchorRef.current = null;
  }, [filtered]);
  useEffect(() => {
    anchorRef.current = null;
  }, [page]);

  const clickCharacter = useCallback((c: ArchiveCharacter, shiftKey: boolean) => {
    const idx = filtered.findIndex((x) => x.id === c.id);
    const anchor = anchorRef.current;
    if (shiftKey && anchor !== null && anchor >= 0 && anchor < filtered.length && idx >= 0) {
      const [lo, hi] = [Math.min(anchor, idx), Math.max(anchor, idx)];
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(filtered[i].id);
        return next;
      });
      return;
    }
    anchorRef.current = idx >= 0 ? idx : null;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  }, [filtered]);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelected(new Set());
    anchorRef.current = null;
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)));
  }, [filtered]);

  return {
    batchMode,
    enterBatchMode: useCallback(() => setBatchMode(true), []),
    exitBatchMode,
    selected,
    setSelected,
    clickCharacter,
    toggleSelectAll,
  };
}
