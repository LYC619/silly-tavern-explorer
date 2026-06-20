import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { NormalizedPreset } from '@/types/preset';
import { collectReferencedIds, detectSourceModel } from '@/lib/preset-parser';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}

const PARAM_LABELS: { key: string; label: string }[] = [
  { key: 'temperature', label: 'Temperature' },
  { key: 'top_p', label: 'Top P' },
  { key: 'top_k', label: 'Top K' },
  { key: 'min_p', label: 'Min P' },
  { key: 'frequency_penalty', label: 'Frequency Penalty' },
  { key: 'presence_penalty', label: 'Presence Penalty' },
];

export function PresetOverview({ preset }: { preset: NormalizedPreset }) {
  const od = preset.originalData;
  const { source, model } = detectSourceModel(od);

  const stats = useMemo(() => {
    const group = preset.promptOrder[0];
    const enabled = group ? group.order.filter((o) => o.enabled).length : 0;
    const total = group ? group.order.length : 0;
    const referenced = collectReferencedIds(preset.promptOrder);
    const unreferenced = preset.prompts.filter((p) => !referenced.has(p.identifier)).length;
    return { enabled, total, unreferenced };
  }, [preset]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        <Stat label="API 来源" value={source || '—'} />
        <Stat label="模型" value={model || '—'} />
        <Stat label="最大上下文" value={(od.openai_max_context as number) ?? '—'} />
        <Stat label="最大回复 Token" value={(od.openai_max_tokens as number) ?? '—'} />
        <Stat label="提示词块" value={preset.prompts.length} />
        <Stat label="激活条目" value={`${stats.enabled} / ${stats.total}`} />
        <Stat label="角色组" value={preset.promptOrder.length} />
        <Stat label="未引用块" value={stats.unreferenced} />
      </div>

      <Card>
        <CardContent className="pt-4">
          <h3 className="text-sm font-medium mb-2">采样参数</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PARAM_LABELS.filter((p) => od[p.key] !== undefined).map((p) => (
              <Stat key={p.key} label={p.label} value={String(od[p.key])} />
            ))}
          </div>
          {preset.regexRules.length > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              内嵌正则脚本：{preset.regexRules.length} 条（见「正则」标签页）
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
