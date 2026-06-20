import { useState, useMemo } from 'react';
import { diffJson } from 'diff';
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
    const before = exportPreset(originalPreset, { mode: 'full' });
    try {
      return diffJson(JSON.parse(before), JSON.parse(exportedJson));
    } catch {
      return null;
    }
  }, [showDiff, originalPreset, exportedJson]);

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
          <h3 className="text-sm font-medium mb-2">变更对比（导入时 ↔ 当前完整导出）</h3>
          <ScrollArea className="h-[420px]">
            {diffParts === null ? (
              <p className="text-xs text-muted-foreground">无法生成对比</p>
            ) : diffParts.every((p) => !p.added && !p.removed) ? (
              <p className="text-xs text-muted-foreground">没有变更</p>
            ) : (
              <pre className="text-xs font-mono leading-relaxed">
                {diffParts.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.added
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                        : part.removed
                          ? 'bg-red-500/15 text-red-700 dark:text-red-400'
                          : 'text-muted-foreground'
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </pre>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
