/**
 * 导入阅读包：选文件 → 看清会写什么/覆盖什么 → 确认后写库。
 *
 * 两段式来自 DataSource 抽象（lib/data-source），云同步和手机端 ST zip 将来走同一套。
 * 不省这一步的理由：导入会覆盖本地条目，而本地条目上攒着用户的阅读进度和评分。
 */
import { useRef, useState } from 'react';
import { AlertTriangle, FileDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  readingPackSource,
  type ImportPlan, type ImportPlanRow, type ReadingPackInput,
} from '@/lib/data-source';
import { READING_PACK_EXT } from '@/types/reading-pack';
import { RUNTIME_LABEL } from '@/lib/runtime';
import {
  getAllArchiveStories, getAllCharacters, getArchiveStory, saveArchiveStory, saveCharacter,
} from '@/lib/archive-db';
import { getAllSummaries, saveSummary } from '@/lib/summary-db';

interface ReadingPackImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 导入完成后让调用方刷新列表 */
  onImported?: () => void;
}

const ACTION_LABEL: Record<ImportPlanRow['action'], string> = {
  add: '新增',
  overwrite: '覆盖',
  skip: '跳过',
};

function PlanSection({ title, rows }: { title: string; rows: ImportPlanRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{title}（{rows.length}）</p>
      <div className="divide-y divide-border rounded-md border border-border">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
            <Badge
              variant="outline"
              className={
                row.action === 'overwrite'
                  ? 'border-[var(--status-warn-bg)] text-[color:var(--status-warn)]'
                  : row.action === 'skip' ? 'text-muted-foreground'
                  : 'border-primary/50 text-primary'
              }
            >
              {ACTION_LABEL[row.action]}
            </Badge>
            <span className="min-w-0 flex-1 truncate" title={row.label}>{row.label}</span>
            {row.reason && <span className="shrink-0 text-muted-foreground">{row.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReadingPackImportDialog({
  open, onOpenChange, onImported,
}: ReadingPackImportDialogProps) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  // 留住 inspect 用的那份 input 原样喂给 apply：接口约定「plan 必须来自同一次 inspect
  // 的同一份 input」，现场重造一个（尤其是把 existing 造成空数组）迟早出事。
  const [input, setInput] = useState<ReadingPackInput | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const origin = input?.origin ?? '';

  const reset = () => { setInput(null); setPlan(null); };

  const handlePick = async (file: File) => {
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const [characters, stories, summaries] = await Promise.all([
        getAllCharacters(), getAllArchiveStories(), getAllSummaries(),
      ]);
      const nextInput: ReadingPackInput = {
        bytes: buf,
        origin: file.name,
        existing: {
          characters: characters.map((c) => ({ id: c.id, updatedAt: c.updatedAt })),
          stories: stories.map((s) => ({ id: s.id, updatedAt: s.updatedAt })),
          summaries: summaries.map((s) => ({ id: s.id, updatedAt: s.updatedAt })),
        },
      };
      const next = await readingPackSource.inspect(nextInput);
      setInput(nextInput);
      setPlan(next);
    } catch (e) {
      reset();
      toast({
        title: '读取阅读包失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      // 清空 input，否则再选同一个文件不触发 change
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleApply = async () => {
    if (!input || !plan) return;
    setBusy(true);
    try {
      const result = await readingPackSource.apply(input, plan, {
        saveCharacter,
        saveStory: saveArchiveStory,
        saveSummary,
        getStory: getArchiveStory,
      });
      const { characters, stories, summaries } = result.written;
      toast({
        title: '阅读包已导入',
        description: `角色 ${characters} · 故事 ${stories} · 总结 ${summaries}`
          + (result.skipped > 0 ? ` · 跳过 ${result.skipped}` : ''),
      });
      if (result.warnings.length > 0) {
        toast({ title: '有几处需要留意', description: result.warnings.slice(0, 3).join('；') });
      }
      onImported?.();
      onOpenChange(false);
      reset();
    } catch (e) {
      toast({
        title: '导入失败',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>导入阅读包</DialogTitle>
          <DialogDescription>
            选一个 {READING_PACK_EXT} 文件。同一个包重复导入不会重复写入，
            也不会覆盖你在这台设备上的阅读进度。
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept={READING_PACK_EXT + ',application/zip'}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handlePick(file);
          }}
        />

        {!plan ? (
          <div className="py-6 text-center">
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy
                ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />读取中…</>
                : <><FileDown className="mr-1.5 h-4 w-4" />选择阅读包</>}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <p className="truncate font-medium text-foreground" title={origin}>{origin}</p>
              {plan.producedBy && (
                <p>
                  来自{RUNTIME_LABEL[plan.producedBy.runtime as keyof typeof RUNTIME_LABEL]
                    ?? plan.producedBy.runtime} {plan.producedBy.appVersion}
                </p>
              )}
              <p>
                新增 {plan.totals.add} · 覆盖 {plan.totals.overwrite} · 跳过 {plan.totals.skip}
              </p>
            </div>

            {plan.totals.overwrite > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-[color:var(--status-warn)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                有 {plan.totals.overwrite} 条会被包里的版本覆盖（包里更新）。
                阅读进度不受影响，仍按本机记录。
              </p>
            )}

            <ScrollArea className="max-h-64">
              <div className="space-y-2 pr-2">
                <PlanSection title="角色" rows={plan.characters} />
                <PlanSection title="故事" rows={plan.stories} />
                <PlanSection title="总结" rows={plan.summaries} />
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>取消</Button>
          {plan && (
            <>
              <Button variant="ghost" onClick={reset} disabled={busy}>换个文件</Button>
              <Button
                onClick={() => void handleApply()}
                disabled={busy || plan.totals.add + plan.totals.overwrite === 0}
              >
                {busy
                  ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />写入中…</>
                  : `确认导入（${plan.totals.add + plan.totals.overwrite} 条）`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
