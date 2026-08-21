import { useCallback } from 'react';
import { DEFAULT_ENTRY } from '@/types/worldbook';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import type { ToastActionElement } from '@/components/ui/toast';
import type { useToast } from '@/hooks/use-toast';

type SetWorldbook = React.Dispatch<React.SetStateAction<WorldBook | null>>;
type Toast = ReturnType<typeof useToast>['toast'];

interface UseWorldbookEntriesOptions {
  worldbook: WorldBook | null;
  setWorldbook: SetWorldbook;
  selectedUid: string | null;
  selectEntry: (key: string) => void;
  clearSelectedEntry: () => void;
  /** 追加/快速添加后要切回编辑模式，否则新条目在「快速添加」页看不见 */
  switchToEditTab: () => void;
  toast: Toast;
  renderUndoAction: (undo: () => void) => ToastActionElement;
}

export interface WorldbookEntryActions {
  updateEntry: (key: string, updated: WorldBookEntry) => void;
  toggleEnabled: (key: string, enabled: boolean) => void;
  addEntry: () => void;
  deleteEntry: (key: string) => void;
  /** 把另一本世界书的条目追加进来，key 与 uid 都顺延，避免覆盖 */
  appendWorldbook: (wb: WorldBook) => void;
  /** 快速添加：按 uid 作 key，保持与 ST 一致的映射 */
  quickAddEntries: (entries: WorldBookEntry[]) => void;
  applyPrefixCategorize: (updates: Record<string, { group: string; comment: string; order: number }>) => void;
}

/** 单条目与整书级别的条目增删改，全部走 setWorldbook 的函数式更新，不依赖挂载期快照 */
export function useWorldbookEntries({
  worldbook, setWorldbook, selectedUid, selectEntry, clearSelectedEntry,
  switchToEditTab, toast, renderUndoAction,
}: UseWorldbookEntriesOptions): WorldbookEntryActions {
  const updateEntry = useCallback((key: string, updated: WorldBookEntry) => {
    setWorldbook((prev) => (prev ? { ...prev, entries: { ...prev.entries, [key]: updated } } : prev));
  }, [setWorldbook]);

  const toggleEnabled = useCallback((key: string, enabled: boolean) => {
    setWorldbook((prev) => {
      if (!prev) return prev;
      const entry = prev.entries[key];
      return { ...prev, entries: { ...prev.entries, [key]: { ...entry, enabled } } };
    });
  }, [setWorldbook]);

  const addEntry = useCallback(() => {
    if (!worldbook) return;
    const maxUid = Object.values(worldbook.entries).reduce((max, e) => Math.max(max, e.uid), -1);
    const newUid = maxUid + 1;
    const key = String(newUid);
    const newEntry = { ...DEFAULT_ENTRY, uid: newUid, comment: '新条目' } as WorldBookEntry;
    setWorldbook((prev) => (prev ? { ...prev, entries: { ...prev.entries, [key]: newEntry } } : prev));
    selectEntry(key);
  }, [worldbook, setWorldbook, selectEntry]);

  const deleteEntry = useCallback((key: string) => {
    let removed: WorldBookEntry | undefined;
    setWorldbook((prev) => {
      if (!prev) return prev;
      removed = prev.entries[key];
      const { [key]: _dropped, ...rest } = prev.entries;
      return { ...prev, entries: rest };
    });
    if (selectedUid === key) clearSelectedEntry();
    if (removed) {
      const restore = removed;
      toast({
        title: '已删除条目',
        description: restore.comment || `条目 ${restore.uid}`,
        action: renderUndoAction(() => {
          setWorldbook((prev) => (prev ? { ...prev, entries: { ...prev.entries, [key]: restore } } : prev));
        }),
      });
    }
  }, [selectedUid, clearSelectedEntry, setWorldbook, toast, renderUndoAction]);

  const appendWorldbook = useCallback((wb: WorldBook) => {
    setWorldbook((prev) => {
      if (!prev) return wb;
      const maxKey = Math.max(-1, ...Object.keys(prev.entries).map(Number).filter((n) => !isNaN(n)));
      const maxUid = Object.values(prev.entries).reduce((max, e) => Math.max(max, e.uid), -1);
      const updated = { ...prev.entries };
      Object.values(wb.entries).forEach((e, i) => {
        updated[String(maxKey + 1 + i)] = { ...e, uid: maxUid + 1 + i };
      });
      return { ...prev, entries: updated };
    });
    const newCount = Object.keys(wb.entries).length;
    switchToEditTab();
    // 等状态更新完再提示，避免 toast 抢在列表刷新前弹出
    setTimeout(() => {
      toast({ title: '追加成功', description: `已追加 ${newCount} 个条目` });
    }, 0);
  }, [setWorldbook, switchToEditTab, toast]);

  const quickAddEntries = useCallback((newEntries: WorldBookEntry[]) => {
    setWorldbook((prev) => {
      const updated: Record<string, WorldBookEntry> = prev ? { ...prev.entries } : {};
      newEntries.forEach((e) => { updated[String(e.uid)] = e; });
      return prev ? { ...prev, entries: updated } : { entries: updated };
    });
    switchToEditTab();
    toast({ title: '已添加', description: `${newEntries.length} 个条目已添加到世界书` });
  }, [setWorldbook, switchToEditTab, toast]);

  const applyPrefixCategorize = useCallback((updates: Record<string, { group: string; comment: string; order: number }>) => {
    setWorldbook((prev) => {
      if (!prev) return prev;
      const updated = { ...prev.entries };
      Object.entries(updates).forEach(([key, { group, comment, order }]) => {
        if (updated[key]) updated[key] = { ...updated[key], group, comment, order };
      });
      return { ...prev, entries: updated };
    });
    toast({ title: '归类完成', description: `已更新 ${Object.keys(updates).length} 个条目的标签、前缀和 Order` });
  }, [setWorldbook, toast]);

  return { updateEntry, toggleEnabled, addEntry, deleteEntry, appendWorldbook, quickAddEntries, applyPrefixCategorize };
}
