import { useState, useMemo } from 'react';
import { diffLines } from 'diff';
import { Download, FileText, GitCompare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { NormalizedPreset } from '@/types/preset';
import { exportPreset, exportPresetMarkdown } from '@/lib/preset-parser';

/** 文件名清洗（与 ExportButton 一致，去非法字符/开头点，限长） */
function sanitizeFilename(name: string): string {
  const cleaned = (name || '')
    .replace(/[/\\:*?"<>|-]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 100);
  return cleaned || 'preset';
}

interface PresetExportProps {
  preset: NormalizedPreset;
  /** 导入时的原始预设（用于 Diff 对比） */
  originalPreset: NormalizedPreset | null;
  activeCharacterId: number;
  fileName: string;
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function PresetExport({ preset, originalPreset, activeCharacterId, fileName }: PresetExportProps) {
  const [mode, setMode] = useState<'full' | 'smart'>('full');
  const [showDiff, setShowDiff] = useState(false);

  const exportedJson = useMemo(
    () => exportPreset(preset, { mode, activeCharacterId }),
    [preset, mode, activeCharacterId]
  );

  const diffParts = useMemo(() => {
    if (!showDiff || !originalPreset) return null;
    // 左右两侧用同一导出模式对比，避免 smart 模式把裁剪掉的条目全算成"删除"淹没真实改动
    const before = exportPreset(originalPreset, { mode, activeCharacterId });
    // 行级 diff：改一个字段就是几行红/几行绿，比整段 JSON 字符流易定位
    return diffLines(before, exportedJson);
  }, [showDiff, originalPreset, exportedJson, mode, activeCharacterId]);

  const base = sanitizeFilename(fileName || 'preset');

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm">导出模式</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'full' | 'smart')}>
            <SelectTrigger className="h-8 w-auto text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">完整导出（保留全部条目与字段）</SelectItem>
              <SelectItem value="smart">智能导出（仅当前组启用条目）</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => download(exportedJson, `${base}${mode === 'smart' ? '_smart' : ''}.json`, 'application/json;charset=utf-8')}>
          <Download className="w-4 h-4 mr-1.5" /> 导出 JSON
        </Button>
        <Button variant="outline" onClick={() => download(exportPresetMarkdown(preset, fileName), `${base}.md`, 'text/markdown;charset=utf-8')}>
          <FileText className="w-4 h-4 mr-1.5" /> 导出 Markdown
        </Button>
        {originalPreset && (
          <Button variant="ghost" onClick={() => setShowDiff((s) => !s)}>
            <GitCompare className="w-4 h-4 mr-1.5" /> {showDiff ? '隐藏' : '查看'}变更对比
          </Button>
        )}
      </div>

      {showDiff && originalPreset && (
        <div>
          <h3 className="text-sm font-medium mb-1">变更对比（导入时 ↔ 当前{mode === 'smart' ? '智能' : '完整'}导出）</h3>
          <p className="text-xs text-muted-foreground mb-2">
            <span className="text-emerald-600 dark:text-emerald-400">绿色 = 新增/改后</span>，
            <span className="text-red-600 dark:text-red-400">红色 = 原值/删除</span>；灰色为未变行
          </p>
          <ScrollArea className="h-[420px] rounded-md border">
            {diffParts === null ? (
              <p className="text-xs text-muted-foreground p-3">无法生成对比</p>
            ) : diffParts.every((p) => !p.added && !p.removed) ? (
              <p className="text-xs text-muted-foreground p-3">没有变更</p>
            ) : (
              <pre className="text-xs font-mono leading-relaxed p-2">
                {diffParts.flatMap((part, i) => {
                  const sign = part.added ? '+' : part.removed ? '-' : ' ';
                  const cls = part.added
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                    : part.removed
                      ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                      : 'text-muted-foreground';
                  // 每个 part 可能含多行，逐行加 +/- 前缀，便于阅读
                  const lines = part.value.replace(/\n$/, '').split('\n');
                  return lines.map((ln, j) => (
                    <span key={`${i}-${j}`} className={`block ${cls}`}>{sign} {ln}</span>
                  ));
                })}
              </pre>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
