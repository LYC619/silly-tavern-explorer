import { useState, useMemo } from 'react';
import { Tags, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import type { WorldBookEntry } from '@/types/worldbook';

interface Props {
  entries: Record<string, WorldBookEntry>;
  onApply: (updates: Record<string, { group: string; comment: string; order: number }>) => void;
  startOrder?: number;
  stepOrder?: number;
}

const NEW_TAG_VALUE = '__new__';

export function PrefixCategorize({ entries, onApply, startOrder = 100, stepOrder = 10 }: Props) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startOrder);
  const [step, setStep] = useState(stepOrder);
  const [newTagInput, setNewTagInput] = useState('');
  const [addedTags, setAddedTags] = useState<string[]>([]);

  // Collect existing tags from all entries
  const existingTags = useMemo(() => {
    const tags = new Set<string>();
    Object.values(entries).forEach(e => {
      if (e.group && e.group.trim()) tags.add(e.group.trim());
    });
    return Array.from(tags).sort();
  }, [entries]);

  // All available tags = existing + user-added
  const allTags = useMemo(() => {
    const combined = new Set([...existingTags, ...addedTags]);
    return Array.from(combined).sort();
  }, [existingTags, addedTags]);

  // Untagged entries
  const untaggedEntries = useMemo(() => {
    return Object.entries(entries).filter(([, e]) => !e.group || !e.group.trim());
  }, [entries]);

  // Assignment state: key -> tag
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const handleOpen = () => {
    // Reset assignments with default "未分类"
    const defaults: Record<string, string> = {};
    untaggedEntries.forEach(([key]) => { defaults[key] = '未分类'; });
    setAssignments(defaults);
    setAddedTags([]);
    setNewTagInput('');
    setStart(startOrder);
    setStep(stepOrder);
    setOpen(true);
  };

  const handleAssign = (key: string, value: string) => {
    if (value === NEW_TAG_VALUE) return; // handled by input
    setAssignments(prev => ({ ...prev, [key]: value }));
  };

  const handleBulkAssign = (tag: string) => {
    if (tag === NEW_TAG_VALUE) return;
    setAssignments(prev => {
      const updated = { ...prev };
      untaggedEntries.forEach(([key]) => { updated[key] = tag; });
      return updated;
    });
  };

  const handleAddNewTag = () => {
    const tag = newTagInput.trim();
    if (tag && !allTags.includes(tag)) {
      setAddedTags(prev => [...prev, tag]);
    }
    setNewTagInput('');
  };

  /** Remove prefix like "tag--" from comment */
  const stripPrefix = (comment: string): string => {
    return comment.replace(/^[^-]+-{2}/, '');
  };

  const handleApply = () => {
    // Build all entries (tagged + newly assigned) sorted by tag then title
    const allEntriesList = Object.entries(entries).map(([key, entry]) => {
      const isUntagged = !entry.group || !entry.group.trim();
      const assignedTag = isUntagged ? (assignments[key] || '未分类') : entry.group.trim();
      const rawTitle = stripPrefix(entry.comment);
      const newComment = `${assignedTag}--${rawTitle}`;
      return { key, entry, tag: assignedTag, newComment, rawTitle, isUntagged };
    });

    // Sort: by tag name, then by raw title
    allEntriesList.sort((a, b) => {
      const tagCmp = a.tag.localeCompare(b.tag);
      if (tagCmp !== 0) return tagCmp;
      return a.rawTitle.localeCompare(b.rawTitle);
    });

    // Build updates
    const updates: Record<string, { group: string; comment: string; order: number }> = {};
    allEntriesList.forEach((item, i) => {
      if (item.isUntagged) {
        updates[item.key] = {
          group: item.tag,
          comment: item.newComment,
          order: start + i * step,
        };
      } else {
        // Already tagged: only update order and prefix
        updates[item.key] = {
          group: item.tag,
          comment: item.newComment,
          order: start + i * step,
        };
      }
    });

    onApply(updates);
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={handleOpen}>
        <Tags className="w-4 h-4 mr-1" /> 前缀归类
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>前缀归类</DialogTitle>
            <DialogDescription>
              为未分类条目分配标签，并自动添加「标签--标题」前缀、按标签排序、重新编号 Order。
            </DialogDescription>
          </DialogHeader>

          {untaggedEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">所有条目均已有标签，无需操作。</p>
          ) : (
            <>
              {/* Bulk assign + add new tag */}
              <div className="flex gap-2 items-end flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">将所有未分类条目设为</Label>
                  <Select onValueChange={handleBulkAssign}>
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="选择标签" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTags.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                      <SelectItem value="未分类">未分类</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">添加新标签</Label>
                  <div className="flex gap-1">
                    <Input
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddNewTag(); } }}
                      placeholder="新标签名"
                      className="h-8 w-32 text-xs"
                    />
                    <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={handleAddNewTag} disabled={!newTagInput.trim()}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {allTags.map(t => (
                    <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
              </div>

              {/* Entry list */}
              <ScrollArea className="flex-1 min-h-0 max-h-[40vh] border rounded-md">
                <div className="p-2 space-y-1.5">
                  {untaggedEntries.map(([key, entry]) => (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      <span className="truncate flex-1 text-foreground" title={entry.comment}>
                        {entry.comment || '(无标题)'}
                      </span>
                      <Select value={assignments[key] || '未分类'} onValueChange={(v) => handleAssign(key, v)}>
                        <SelectTrigger className="h-7 w-32 text-xs shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {allTags.map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                          <SelectItem value="未分类">未分类</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {/* Order settings */}
              <div className="flex gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">起始 Order</Label>
                  <Input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} className="h-8 w-24" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">步长</Label>
                  <Input type="number" value={step} onChange={(e) => setStep(Number(e.target.value))} className="h-8 w-24" />
                </div>
                <p className="text-xs text-muted-foreground pb-1">
                  {untaggedEntries.length} 个未分类条目，共 {Object.keys(entries).length} 个条目将重新编号
                </p>
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={handleApply} disabled={untaggedEntries.length === 0}>应用</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
