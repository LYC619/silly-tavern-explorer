import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, X } from 'lucide-react';
import type { WorldBookEntry } from '@/types/worldbook';
import { POSITION_LABELS, SELECTIVE_LOGIC_LABELS, ROLE_LABELS } from '@/types/worldbook';

interface Props {
  entry: WorldBookEntry;
  onChange: (updated: WorldBookEntry) => void;
}

function TagInput({ tags, onChange, dashed = false, placeholder = '' }: {
  tags: string[];
  onChange: (tags: string[]) => void;
  dashed?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTags = (raw: string) => {
    const newTags = raw.split(',').map(t => t.trim()).filter(t => t && !tags.includes(t));
    if (newTags.length) onChange([...tags, ...newTags]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTags(input);
      setInput('');
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {tags.map((t, i) => (
          <Badge
            key={i}
            variant={dashed ? 'outline' : 'secondary'}
            className={`text-xs cursor-pointer ${dashed ? 'border-dashed' : ''}`}
            onClick={() => onChange(tags.filter((_, idx) => idx !== i))}
          >
            {t}
            <X className="w-3 h-3 ml-1" />
          </Badge>
        ))}
      </div>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) { addTags(input); setInput(''); } }}
        placeholder={placeholder}
        className="h-8 text-sm"
      />
    </div>
  );
}

export function EntryEditor({ entry, onChange }: Props) {
  const update = <K extends keyof WorldBookEntry>(key: K, value: WorldBookEntry[K]) => {
    onChange({ ...entry, [key]: value });
  };

  return (
    <div className="space-y-4 p-4 overflow-y-auto">
      <h3 className="font-semibold text-base text-foreground">编辑条目</h3>

      {/* Title */}
      <div className="space-y-1">
        <Label>标题 / Memo</Label>
        <Input value={entry.comment} onChange={(e) => update('comment', e.target.value)} className="h-8" />
      </div>

      {/* Enabled */}
      <div className="flex items-center gap-2">
        <Label>启用</Label>
        <Switch checked={entry.enabled} onCheckedChange={(v) => update('enabled', v)} />
      </div>

      {/* Strategy — single atomic update */}
      <div className="space-y-1">
        <Label>策略</Label>
        <div className="flex gap-2">
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={!entry.constant && !entry.vectorized}
              onChange={() => onChange({ ...entry, constant: false, vectorized: false })} />
            🟢 关键词
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={entry.constant}
              onChange={() => onChange({ ...entry, constant: true, vectorized: false })} />
            🔵 常驻
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={entry.vectorized}
              onChange={() => onChange({ ...entry, vectorized: true, constant: false })} />
            🔗 向量
          </label>
        </div>
      </div>

      {/* Keywords */}
      <div className="space-y-1">
        <Label>关键词 (Key)</Label>
        <TagInput tags={entry.key} onChange={(t) => update('key', t)} placeholder="逗号分隔或回车添加" />
      </div>

      {/* Secondary keywords */}
      <div className="space-y-1">
        <Label>可选过滤词 (Optional Filter)</Label>
        <TagInput tags={entry.keysecondary} onChange={(t) => update('keysecondary', t)} dashed placeholder="可选过滤词" />
        <Select value={String(entry.selectiveLogic)} onValueChange={(v) => update('selectiveLogic', Number(v))}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SELECTIVE_LOGIC_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      <div className="space-y-1">
        <Label>内容 (Content)</Label>
        <Textarea value={entry.content} onChange={(e) => update('content', e.target.value)} rows={8} className="text-sm" />
      </div>

      {/* Position */}
      <div className="space-y-1">
        <Label>插入位置</Label>
        <Select value={String(entry.position)} onValueChange={(v) => update('position', Number(v))}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(POSITION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Depth & Role (only for @D) */}
      {entry.position === 6 && (
        <div className="flex gap-3">
          <div className="space-y-1 flex-1">
            <Label>深度 (Depth)</Label>
            <Input type="number" value={entry.depth} onChange={(e) => update('depth', Number(e.target.value))} className="h-8" />
          </div>
          <div className="space-y-1 flex-1">
            <Label>角色 (Role)</Label>
            <Select value={String(entry.role)} onValueChange={(v) => update('role', Number(v))}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Order */}
      <div className="space-y-1">
        <Label>Order</Label>
        <Input type="number" value={entry.order} onChange={(e) => update('order', Number(e.target.value))} className="h-8" />
      </div>

      {/* Probability */}
      <div className="space-y-1">
        <Label>触发概率: {entry.probability}%</Label>
        <Slider value={[entry.probability]} min={0} max={100} step={1} onValueChange={([v]) => update('probability', v)} />
      </div>

      {/* Group */}
      <div className="space-y-1">
        <Label>Inclusion Group</Label>
        <Input value={entry.group} onChange={(e) => update('group', e.target.value)} className="h-8" placeholder="分组名称" />
      </div>

      {/* Advanced: Timing */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="w-4 h-4" />
          高级：时效设置
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label>Sticky (轮次)</Label>
            <Input type="number" value={entry.sticky} onChange={(e) => update('sticky', Number(e.target.value))} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label>Cooldown (轮次)</Label>
            <Input type="number" value={entry.cooldown} onChange={(e) => update('cooldown', Number(e.target.value))} className="h-8" />
          </div>
          <div className="space-y-1">
            <Label>Delay (轮次)</Label>
            <Input type="number" value={entry.delay} onChange={(e) => update('delay', Number(e.target.value))} className="h-8" />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Advanced: Recursion */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="w-4 h-4" />
          高级：递归设置
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">排除递归 (Exclude Recursion)</Label>
            <Switch checked={entry.excludeRecursion} onCheckedChange={(v) => update('excludeRecursion', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">阻止后续递归 (Prevent Recursion)</Label>
            <Switch checked={entry.preventRecursion} onCheckedChange={(v) => update('preventRecursion', v)} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">延迟到递归时激活 (Delay Until Recursion)</Label>
            <Switch checked={entry.delayUntilRecursion} onCheckedChange={(v) => update('delayUntilRecursion', v)} />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
