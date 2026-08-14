import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, ListTree } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatBytes } from '@/lib/storage-utils';
import {
  buildImportManifestNotice,
  buildImportResultStatus,
  groupUnresolvedRelationships,
  IMPORT_POLICY_SUMMARY,
} from '@/lib/vault/st-import-presentation';
import type { STImportSummary } from '@/lib/vault/st-import';

const STATUS_LABELS: Record<STImportSummary['details'][number]['status'], string> = {
  imported: '已导入',
  archived: '已归档',
  linked: '已关联',
  skipped: '已跳过',
  failed: '失败',
  unresolved: '未解析',
};

const RELATION_LABELS: Record<string, string> = {
  embedded: '卡内嵌',
  primary: '主绑定',
  extra: '额外链接',
  global: '全局启用',
  chat: '对话级',
};

interface STImportResultDialogProps {
  result: STImportSummary | null;
  onClose: () => void;
}

interface MetricProps {
  label: string;
  value: number;
  note?: string;
}

function Metric({ label, value, note }: MetricProps) {
  return (
    <div className="min-w-[7rem] flex-1 border-l-2 border-border pl-3">
      <p className="text-xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}{note ? ` · ${note}` : ''}</p>
    </div>
  );
}

export function STImportResultDialog({ result, onClose }: STImportResultDialogProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => { setDetailsOpen(false); }, [result]);
  if (!result) return null;

  const unresolvedGroups = groupUnresolvedRelationships(result.unresolvedRelationships);
  const status = buildImportResultStatus({
    failed: result.failed,
    unresolved: result.unresolvedRelationships.length,
    warnings: result.scanWarnings.length,
  });
  const manifestNotice = buildImportManifestNotice(result.details);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pt-6 pr-12">
          <DialogTitle>导入完成</DialogTitle>
          <DialogDescription>{manifestNotice.description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto border-y border-border px-6 py-4">
          <div className="flex items-start gap-3 rounded border border-border bg-muted/30 p-3">
            {status.needsAttention
              ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />}
            <div>
              <p className="text-sm font-medium">{status.title}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{status.description}</p>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-foreground">重复导入规则：</span>{IMPORT_POLICY_SUMMARY}
            </p>
          </div>

          <div className="my-5">
            <p className="mb-3 text-xs font-medium text-muted-foreground">本次写入</p>
            <div className="flex flex-wrap gap-x-5 gap-y-4">
              <Metric label="角色" value={result.characters} />
              <Metric label="故事" value={result.stories} />
              <Metric label="世界书" value={result.worldbooks} />
              <Metric label="预设" value={result.presets} />
              <Metric label="正则" value={result.regexes} />
              <Metric label="其他资产" value={result.archivedFiles} note={formatBytes(result.archiveBytes)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 border-y border-border py-3 text-xs text-muted-foreground">
            <span>恢复关联 <strong className="font-medium text-foreground">{result.relationships}</strong></span>
            <span>已有内容跳过 <strong className="font-medium text-foreground">{result.skipped}</strong></span>
            <span>处理失败 <strong className="font-medium text-foreground">{result.failed}</strong></span>
            <span>未解析引用 <strong className="font-medium text-foreground">{result.unresolvedRelationships.length}</strong></span>
          </div>

          {unresolvedGroups.length > 0 && (
            <section className="border-t border-border pt-4">
              <div className="mb-3">
                <h3 className="text-sm font-medium">需要确认的世界书引用</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  已按世界书名称合并 {result.unresolvedRelationships.length} 处引用；这不会撤销其他已导入内容。
                </p>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {unresolvedGroups.map((group) => (
                  <div key={`${group.reason}-${group.name}`} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium">{group.name}</p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        影响：{group.owners.slice(0, 3).join('、')}
                        {group.owners.length > 3 ? ` 等 ${group.owners.length} 项` : ''}
                        {' · '}关系：{group.relations.map((relation) => RELATION_LABELS[relation] ?? relation).join('、')}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground sm:text-right">
                      {group.count} 处引用 · {group.reason === 'ambiguous' ? '存在同名候选' : '来源中未找到'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen} className="mt-4 border-t border-border pt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-1 text-sm">
                <span className="flex items-center gap-2"><ListTree className="h-4 w-4" />查看完整处理明细（{result.details.length}）</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 max-h-[32vh] overflow-y-auto border-y border-border py-2">
                {result.details.map((item, index) => (
                  <div key={`${item.status}-${item.kind}-${item.name}-${index}`} className="grid grid-cols-[4.5rem_5.5rem_minmax(0,1fr)] gap-2 py-1.5 text-xs">
                    <span className="text-muted-foreground">{STATUS_LABELS[item.status]}</span>
                    <span>{item.kind}</span>
                    <span className="min-w-0 break-all">
                      <span className="block">{item.name}{item.target ? ` → ${RELATION_LABELS[item.target] ?? item.target}` : ''}</span>
                      {item.sourcePath && <span className="mt-0.5 block text-[10px] text-muted-foreground">{item.sourcePath}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {!!result.scanWarnings.length && (
            <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
              为保护目录边界，扫描时跳过了 {result.scanWarnings.length} 个符号链接、非法路径名或过深目录；具体路径见完整清单。
            </p>
          )}

          {result.archivedFiles > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              其他资产已保存 {result.archivedFiles} 个文件，共 {formatBytes(result.archiveBytes)}；可在“附属库 → 其他”查看，扩展代码不会在本应用中执行。
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4">
          <Button onClick={onClose}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
