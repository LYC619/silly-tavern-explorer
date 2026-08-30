/**
 * 「ST 有更新」角落提示（2.0 阶段7.4，仅客户端）。
 * 开故事时读一次 sourcePath 轻量比楼层数；ST 端多楼 → 右下角提示，
 * 点「导入更新」走 4.2 合并规则落主线；「忽略」本次打开不再提示。
 * 来源文件读不到（被删/移动）不打扰——IOPanel 手动重导兜底。
 */
import { useEffect, useRef, useState } from 'react';
import { DownloadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { isTauri, readAbsText } from '@/lib/vault/tauri-fs';
import { compareSTText, mergeSTText, type STUpdateStatus } from '@/lib/vault/st-update';
import type { ArchiveStory } from '@/types/archive';

interface Props {
  story: ArchiveStory;
  onStoryUpdate: (fn: (cur: ArchiveStory) => ArchiveStory) => void;
}

export function STUpdateHint({ story, onStoryUpdate }: Props) {
  const { toast } = useToast();
  const [status, setStatus] = useState<STUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [merging, setMerging] = useState(false);
  // 比对用最新 story，但检查只随 故事/来源 变化跑一次——编辑楼层不触发重读
  const storyRef = useRef(story);
  storyRef.current = story;

  const sourcePath = story.sourcePath;
  useEffect(() => {
    if (!isTauri() || !sourcePath) return;
    let cancelled = false;
    readAbsText(sourcePath)
      .then((text) => {
        if (!cancelled) setStatus(compareSTText(text, storyRef.current));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [story.id, sourcePath]);

  if (!status?.hasUpdate || dismissed) return null;

  const handleApply = async () => {
    if (!sourcePath) return;
    setMerging(true);
    try {
      const text = await readAbsText(sourcePath);
      const { result } = mergeSTText(text, storyRef.current);
      if (result.changed) {
        // 以落库时的最新脉络为准再合一次（与 IOPanel 同款，防抖窗口内的编辑不被旧快照顶掉）
        onStoryUpdate((cur) => {
          const merged = mergeSTText(text, cur);
          return merged.result.changed ? merged.story : cur;
        });
      }
      toast({ title: '已导入 ST 更新', description: result.summary });
      setStatus(null);
    } catch {
      toast({ title: '导入失败', description: '无法读取来源文件，可到「导入与导出」手动重导', variant: 'destructive' });
    } finally {
      setMerging(false);
    }
  };

  return (
    // 同批量栏：桌面档 var 为 0px，等于原来的 bottom-6
    <Card className="fixed bottom-[calc(1.5rem+var(--mobile-tab-bar-h,0px)+env(safe-area-inset-bottom))] right-6 z-50 flex items-center gap-3 border-primary/40 p-3 shadow-lg">
      <DownloadCloud className="h-4 w-4 shrink-0 text-primary" />
      <span className="text-sm">
        ST 端有更新：多 {status.extraFloors} 楼（{status.steFloors} → {status.stFloors}）
      </span>
      <Button size="sm" onClick={handleApply} disabled={merging}>
        {merging ? '导入中…' : '导入更新'}
      </Button>
      <Button size="icon" variant="ghost" onClick={() => setDismissed(true)} aria-label="忽略本次更新提示">
        <X className="h-4 w-4" />
      </Button>
    </Card>
  );
}
