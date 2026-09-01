/**
 * 导出阅读包：勾选要带哪些故事 → 打包 → 落盘。
 *
 * 落盘分三档（同 lib/text-file-export 的分法）：桌面端原生保存对话框、
 * Android 唤起系统分享面板（手机上「导出」的真实语义是发出去，不是选路径）、
 * 网页版浏览器下载。
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { buildReadingPack, suggestPackFileName } from '@/lib/reading-pack/export';
import { savePackBytes } from '@/lib/reading-pack/save';
import { getAllSummaries } from '@/lib/summary-db';
import { formatWordCount } from '@/lib/story-meta';
import { APP_VERSION } from '@/components/GlobalSettings';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';

interface ReadingPackExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  character: ArchiveCharacter;
  stories: ArchiveStory[];
}

export function ReadingPackExportDialog({
  open, onOpenChange, character, stories,
}: ReadingPackExportDialogProps) {
  const { toast } = useToast();
  // 默认全选
  const [picked, setPicked] = useState<Set<string>>(() => new Set(stories.map((s) => s.id)));
  const [busy, setBusy] = useState(false);

  // 每次打开重置成全选：上一次的勾选状态留着只会让人以为漏了故事
  useEffect(() => {
    if (open) setPicked(new Set(stories.map((s) => s.id)));
  }, [open, stories]);

  const selected = useMemo(() => stories.filter((s) => picked.has(s.id)), [stories, picked]);
  const totalWords = selected.reduce((sum, s) => sum + (s.wordCount ?? 0), 0);
  const allPicked = picked.size === stories.length && stories.length > 0;

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleExport = async () => {
    if (selected.length === 0) return;
    setBusy(true);
    try {
      // 只取被选故事的总结，过滤在 buildReadingPack 里
      const summaries = await getAllSummaries();
      const { bytes, manifest } = buildReadingPack({
        characters: [character],
        stories: selected,
        summaries,
        appVersion: APP_VERSION,
      });
      const fileName = suggestPackFileName(manifest);
      const outcome = await savePackBytes(bytes, fileName);
      if (outcome === 'cancelled') return;
      const sizeMb = (bytes.length / 1024 / 1024).toFixed(1);
      toast({
        title: outcome === 'shared' ? '已唤起分享' : '阅读包已导出',
        description: `${fileName}（${sizeMb} MB，${selected.length} 篇故事）`,
      });
      onOpenChange(false);
    } catch (e) {
      toast({
        title: '导出失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>导出阅读包</DialogTitle>
          <DialogDescription>
            把这张卡和选中的故事打成一个 .ste-reading 文件，在手机上导入即可阅读。
            带上正文、章节标记、书签、总结和评分；不带预设、世界书、正则规则。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>共 {stories.length} 篇故事</span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground transition-colors"
              onClick={() => setPicked(allPicked ? new Set() : new Set(stories.map((s) => s.id)))}
            >
              {allPicked ? '全不选' : '全选'}
            </button>
          </div>

          <ScrollArea className="max-h-64 rounded-md border border-border">
            <div className="divide-y divide-border">
              {stories.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent/50"
                >
                  <Checkbox
                    checked={picked.has(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                    aria-label={`选择故事「${s.title}」`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{s.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.session.messages.length} 楼
                      {s.wordCount !== undefined && ` · ${formatWordCount(s.wordCount)}`}
                      {(s.branches?.length ?? 0) > 0 && ` · ${s.branches!.length} 个分支`}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </ScrollArea>

          <p className="text-xs text-muted-foreground">
            已选 {selected.length} 篇
            {totalWords > 0 && ` · 约 ${formatWordCount(totalWords)}`}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          <Button onClick={() => void handleExport()} disabled={busy || selected.length === 0}>
            {busy
              ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />打包中…</>
              : <><Package className="mr-1.5 h-4 w-4" />导出</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
