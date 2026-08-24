/**
 * 批量打标签弹窗（10.2-B4）：给所选角色批量添加标签（并集，不覆盖已有）。
 * 选项 = 内置打底 ∪ 库里已出现的标签；也可输入「类别/xx」自建。
 * 评价档位标签不在此提供（评价随评分单向自动，避免批量打档位与各卡评分打架）。
 */
import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';
import { updateCharacter } from '@/lib/archive-db';
import { applyCharacterTagPatch } from '@/lib/character-tag-domain';
import {
  TAG_CATEGORIES, tagOptionsByCategory, parseTag, validateUserTagInput,
} from '@/lib/tag-taxonomy';

interface BatchTagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: ArchiveCharacter[];
  allCharacters: ArchiveCharacter[];
  onDone: () => void | Promise<void>;
}

export function BatchTagDialog({ open, onOpenChange, targets, allCharacters, onDone }: BatchTagDialogProps) {
  const { toast } = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);

  const options = useMemo(
    () => tagOptionsByCategory(allCharacters.flatMap((c) => c.tags)),
    [allCharacters],
  );
  /** 评价档位随评分自动维护，批量不提供 */
  const cats = TAG_CATEGORIES.filter((c) => c !== '评价');

  const togglePick = (raw: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(raw)) next.delete(raw);
      else next.add(raw);
      return next;
    });
  };

  const handleApply = async () => {
    const tags = new Set(picked);
    const c = custom.trim();
    if (c) {
      const raw = parseTag(c).raw;
      const rejected = validateUserTagInput(raw);
      if (rejected) {
        toast({ title: rejected, variant: 'destructive' });
        return;
      }
      tags.add(raw);
    }
    if (tags.size === 0 || targets.length === 0) return;
    setBusy(true);
    try {
      // Validate every target before writing any one of them.
      for (const ch of targets) {
        applyCharacterTagPatch(ch, { tags: [...ch.tags, ...tags] });
      }
      for (const ch of targets) {
        await updateCharacter(ch.id, (current) => {
          const merged = [...current.tags];
          for (const t of tags) if (!merged.includes(t)) merged.push(t);
          if (merged.length === current.tags.length) return undefined;
          return { ...applyCharacterTagPatch(current, { tags: merged }), updatedAt: Date.now() };
        });
      }
      toast({ title: `已为 ${targets.length} 张卡添加 ${tags.size} 个标签` });
      setPicked(new Set());
      setCustom('');
      await onDone();
      onOpenChange(false);
    } catch {
      toast({ title: '批量打标签失败', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>批量打标签</DialogTitle>
          <DialogDescription>给所选 {targets.length} 张卡添加标签（并集，不影响已有标签）。</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-1">
          {cats.map((cat) => {
            const opts = options[cat];
            if (opts.length === 0) return null;
            return (
              <section key={cat}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">{cat}</p>
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((o) => (
                    <button
                      key={o.raw}
                      onClick={() => togglePick(o.raw)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs border transition-colors',
                        picked.has(o.raw)
                          ? 'bg-brand-accent text-white border-transparent'
                          : 'border-[color:var(--border-normal)] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)]',
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          <section>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">自建（格式「类别/子标签」，无类别归未分类）</p>
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="如 世界观/蒸汽朋克"
              className="text-sm"
            />
          </section>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleApply} disabled={busy || (picked.size === 0 && !custom.trim())}>
            应用到 {targets.length} 张卡
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
