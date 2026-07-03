import { useEffect, useState } from 'react';
import { SlidersHorizontal, Globe, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { getAllPresets } from '@/lib/preset-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import type { PresetItem } from '@/types/preset';
import type { WorldBookItem, WorldBookEntry } from '@/types/worldbook';
import type { WorldbookMode } from '@/lib/summary-engine';

export interface AttachState {
  presetId: string | null;
  worldbookId: string | null;
  worldbookMode: WorldbookMode;
  worldbookUids: number[];
}

interface AttachPanelProps {
  value: AttachState;
  onChange: (next: AttachState) => void;
  /** 实时 token 估算（由父组件用引擎算好传入） */
  tokenEstimate: number;
}

const NONE = '__none__';

/** 挂载预设/世界书面板：选预设、选世界书 + 注入范围(constant/all/manual)，展示 token 估算 */
export function AttachPanel({ value, onChange, tokenEstimate }: AttachPanelProps) {
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [worldbooks, setWorldbooks] = useState<WorldBookItem[]>([]);

  useEffect(() => {
    getAllPresets().then(setPresets).catch(() => {});
    getAllWorldBooks().then(setWorldbooks).catch(() => {});
  }, []);

  const selectedWb = worldbooks.find((w) => w.id === value.worldbookId);
  const wbEntries: WorldBookEntry[] = selectedWb ? Object.values(selectedWb.worldbook.entries) : [];
  const enabledEntries = wbEntries.filter((e) => e.enabled !== false);
  const constantCount = enabledEntries.filter((e) => e.constant).length;

  const set = (patch: Partial<AttachState>) => onChange({ ...value, ...patch });

  const toggleUid = (uid: number) => {
    const has = value.worldbookUids.includes(uid);
    set({ worldbookUids: has ? value.worldbookUids.filter((u) => u !== uid) : [...value.worldbookUids, uid] });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">挂载设定（可选）</Label>
          <Badge variant="secondary" className="font-normal">
            约 {tokenEstimate.toLocaleString()} tokens
          </Badge>
        </div>

        {/* 预设 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />预设（决定上下文组装顺序）
          </Label>
          <Select
            value={value.presetId ?? NONE}
            onValueChange={(v) => set({ presetId: v === NONE ? null : v })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="不挂预设（用内置骨架）" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>不挂预设（用内置骨架）</SelectItem>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 世界书 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Globe className="w-3.5 h-3.5" />世界书
          </Label>
          <Select
            value={value.worldbookId ?? NONE}
            onValueChange={(v) => set({ worldbookId: v === NONE ? null : v, worldbookUids: [] })}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="不挂世界书" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>不挂世界书</SelectItem>
              {worldbooks.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.title}（{Object.keys(w.worldbook.entries).length} 条）
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedWb && (
            <div className="space-y-2 pt-1">
              <RadioGroup
                value={value.worldbookMode}
                onValueChange={(v) => set({ worldbookMode: v as WorldbookMode })}
                className="flex flex-wrap gap-3 text-sm"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="constant" id="wm-const" />
                  <Label htmlFor="wm-const" className="cursor-pointer">仅常驻（{constantCount} 条）</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="all" id="wm-all" />
                  <Label htmlFor="wm-all" className="cursor-pointer">全部启用（{enabledEntries.length} 条）</Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem value="manual" id="wm-manual" />
                  <Label htmlFor="wm-manual" className="cursor-pointer">手动勾选（{value.worldbookUids.length} 条）</Label>
                </div>
              </RadioGroup>

              {value.worldbookMode === 'manual' && (
                <ScrollArea className="h-40 border rounded-md p-2">
                  <div className="space-y-1">
                    {enabledEntries.map((e) => (
                      <label key={e.uid} className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-accent cursor-pointer text-sm">
                        <Checkbox
                          checked={value.worldbookUids.includes(e.uid)}
                          onCheckedChange={() => toggleUid(e.uid)}
                        />
                        {e.constant && <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">常驻</Badge>}
                        <span className="truncate text-muted-foreground">{e.comment || e.content.slice(0, 30) || '(无标题)'}</span>
                      </label>
                    ))}
                    {enabledEntries.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">该世界书没有启用的条目</p>
                    )}
                  </div>
                </ScrollArea>
              )}

              <p className="text-xs text-muted-foreground">
                大型世界书全部注入会占用大量 token，默认「仅常驻」。
              </p>
            </div>
          )}
        </div>

        {(value.presetId || value.worldbookId) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-muted-foreground"
            onClick={() => onChange({ presetId: null, worldbookId: null, worldbookMode: 'constant', worldbookUids: [] })}
          >
            <X className="w-3.5 h-3.5" />清除挂载
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
