/**
 * 标签管理弹窗（10.2-B1）：内置标签分组展示（含问号说明，只读）+ 自定义标签管理（用量+删除）。
 * 删除自定义标签 = 从所有角色上摘掉该标签（内置标签不可删）。
 */
import { useMemo, useState } from 'react';
import { HelpCircle, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { ArchiveCharacter } from '@/types/archive';
import { saveCharacter } from '@/lib/archive-db';
import {
  TAG_CATEGORIES, BUILTIN_TAGS, CATEGORY_HELP, makeTag, parseTag, type TagCategory,
} from '@/lib/tag-taxonomy';

interface TagManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  characters: ArchiveCharacter[];
  /** 删除自定义标签落库后回调（父组件重载列表） */
  onChanged: () => void;
}

export function TagManagerDialog({ open, onOpenChange, characters, onChanged }: TagManagerDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  /** 库里出现过的自定义标签（非内置），按类别归组，带用量 */
  const customByCategory = useMemo(() => {
    const usage = new Map<string, number>();
    for (const c of characters) for (const t of c.tags) usage.set(t, (usage.get(t) ?? 0) + 1);
    const out = new Map<TagCategory, { raw: string; label: string; count: number }[]>();
    for (const [raw, count] of usage) {
      const p = parseTag(raw);
      if (BUILTIN_TAGS[p.category].some((l) => makeTag(p.category, l) === raw)) continue;
      const list = out.get(p.category) ?? [];
      list.push({ raw, label: p.label, count });
      out.set(p.category, list);
    }
    for (const list of out.values()) list.sort((a, b) => b.count - a.count);
    return out;
  }, [characters]);

  const handleDeleteCustom = async (raw: string) => {
    setBusy(true);
    try {
      const owners = characters.filter((c) => c.tags.includes(raw));
      for (const c of owners) {
        await saveCharacter({ ...c, tags: c.tags.filter((t) => t !== raw), updatedAt: Date.now() });
      }
      toast({ title: `已从 ${owners.length} 张卡上移除「${raw}」` });
      onChanged();
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>标签管理</DialogTitle>
          <DialogDescription>
            内置标签是打底分类（不可删）；自定义标签来自你在卡上输入的「类别/xx」，删除会从所有卡上摘掉。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto space-y-4 pr-1">
          {TAG_CATEGORIES.filter((cat) => cat !== '未分类' || (customByCategory.get(cat)?.length ?? 0) > 0).map((cat) => (
            <section key={cat}>
              <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                {cat}
                <span title={CATEGORY_HELP[cat]} className="cursor-help text-[color:var(--text-faint)]">
                  <HelpCircle className="w-3 h-3" />
                </span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {BUILTIN_TAGS[cat].map((label) => (
                  <span
                    key={label}
                    className="px-2 py-0.5 rounded-full text-xs bg-[var(--hover-overlay)] text-[color:var(--text-muted)]"
                  >
                    {label}
                  </span>
                ))}
                {(customByCategory.get(cat) ?? []).map((t) => (
                  <span
                    key={t.raw}
                    className="pl-2 pr-1 py-0.5 rounded-full text-xs border border-dashed border-[color:var(--border-normal)] text-[color:var(--text-body)] flex items-center gap-1"
                  >
                    {t.label}
                    <span className="text-[10px] text-[color:var(--text-faint)]">{t.count}</span>
                    <button
                      aria-label={`删除标签 ${t.raw}`}
                      disabled={busy}
                      onClick={() => handleDeleteCustom(t.raw)}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[color:var(--text-faint)] hover:text-destructive"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {BUILTIN_TAGS[cat].length === 0 && (customByCategory.get(cat)?.length ?? 0) === 0 && (
                  <span className="text-xs text-[color:var(--text-faint)]">暂无</span>
                )}
              </div>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
