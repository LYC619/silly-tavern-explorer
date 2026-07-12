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
  const [mode, setMode] = useState<'full' | 'group' | 'smart'>('full');
  const [showDiff, setShowDiff] = useState(false);
  const groups = preset.promptOrder;
  const hasMultiGroups = groups.length > 1;
  // 按下标选组（character_id 可能重复，下标才能唯一定位），默认当前编辑中的分组
  const [groupIndex, setGroupIndex] = useState(() => {
    const i = groups.findIndex((g) => g.character_id === activeCharacterId);
    return i >= 0 ? i : 0;
  });
  const safeGroupIndex = Math.min(groupIndex, Math.max(groups.length - 1, 0));

  const exportedJson = useMemo(
    () => exportPreset(preset, { mode, activeCharacterId, groupIndex: safeGroupIndex }),
    [preset, mode, activeCharacterId, safeGroupIndex]
  );

  const diffParts = useMemo(() => {
    if (!showDiff || !originalPreset) return null;
    // 左右两侧用同一导出模式对比，避免 smart 模式把裁剪掉的条目全算成"删除"淹没真实改动
    const before = exportPreset(originalPreset, { mode, activeCharacterId, groupIndex: safeGroupIndex });
    // 行级 diff：改一个字段就是几行红/几行绿，比整段 JSON 字符流易定位
    return diffLines(before, exportedJson);
  }, [showDiff, originalPreset, exportedJson, mode, activeCharacterId, safeGroupIndex]);

  const base = sanitizeFilename(fileName || 'preset');
  const suffix = mode === 'smart' ? '_smart' : mode === 'group' ? `_group${safeGroupIndex + 1}` : '';

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-sm">导出模式</Label>
          <Select value={mode} onValueChange={(v) => setMode(v as 'full' | 'group' | 'smart')}>
            <SelectTrigger className="h-8 w-auto text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">完整导出（全部分组与条目）</SelectItem>
              {hasMultiGroups && <SelectItem value="group">分组导出（所选分组全部条目，含禁用）</SelectItem>}
              <SelectItem value="smart">智能导出（{hasMultiGroups ? '所选分组' : ''}仅启用条目）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {hasMultiGroups && mode !== 'full' && (
          <div className="flex items-center gap-2">
            <Label className="text-sm">分组</Label>
            <Select value={String(safeGroupIndex)} onValueChange={(v) => setGroupIndex(Number(v))}>
              <SelectTrigger className="h-8 w-auto text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((g, i) => (
                  <SelectItem key={i} value={String(i)}>
                    分组 {i + 1}（ID {g.character_id}，{g.order.filter((o) => o.enabled).length}/{g.order.length} 启用）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {hasMultiGroups && mode !== 'full' && (
        <p className="text-xs text-muted-foreground">
          该预设含 {groups.length} 个分组。有的作者用第一个分组做条目库、后面的分组才是完整结构，导出前请确认选对了分组。
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Button onClick={() => download(exportedJson, `${base}${suffix}.json`, 'application/json;charset=utf-8')}>
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
          <h3 className="text-sm font-medium mb-1">变更对比（导入时 ↔ 当前{mode === 'smart' ? '智能' : mode === 'group' ? '分组' : '完整'}导出）</h3>
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
