import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { RegexRule } from '@/types/chat';

interface PresetRegexEditorProps {
  rules: RegexRule[];
  onRulesChange: (rules: RegexRule[]) => void;
}

/** 解析 /pattern/flags 或裸 pattern 为 RegExp（测试区用，固定补 g） */
function buildRegExp(findRegex: string): RegExp {
  const m = findRegex.match(/^\/(.*)\/([gimsuy]*)$/);
  if (m) {
    const flags = m[2].includes('g') ? m[2] : m[2] + 'g';
    return new RegExp(m[1], flags);
  }
  return new RegExp(findRegex, 'g');
}

export function PresetRegexEditor({ rules, onRulesChange }: PresetRegexEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const [testInput, setTestInput] = useState('');

  const updateRule = (id: string, updates: Partial<RegexRule>) =>
    onRulesChange(rules.map((r) => (r.id === id ? { ...r, ...updates } : r)));

  // placement 多选互斥（与 RegexSidebar 一致：'all' 与 user/assistant 互斥，清空回落 ['all']）
  const handlePlacement = (id: string, key: 'all' | 'user' | 'assistant', checked: boolean) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    let next: ('all' | 'user' | 'assistant')[];
    if (key === 'all') {
      next = checked ? ['all'] : [];
    } else {
      next = rule.placement.filter((p) => p !== 'all');
      if (checked) next = [...next, key];
      else next = next.filter((p) => p !== key);
    }
    if (next.length === 0) next = ['all'];
    updateRule(id, { placement: next });
  };

  const testResult = useMemo(() => {
    if (!testId || !testInput) return testInput;
    const rule = rules.find((r) => r.id === testId);
    if (!rule) return testInput;
    try {
      return testInput.replace(buildRegExp(rule.findRegex), rule.replaceString);
    } catch {
      return '[正则无效]';
    }
  }, [testId, testInput, rules]);

  if (rules.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">该预设没有内嵌正则脚本（extensions.regex_scripts）</p>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 规则列表 */}
      <ScrollArea className="h-[600px] pr-2">
        <div className="space-y-1.5">
          {rules.map((rule) => {
            const expanded = expandedId === rule.id;
            return (
              <div key={rule.id} className={`rounded-lg border ${rule.disabled ? 'bg-muted/30 border-muted' : 'bg-secondary/30 border-border'}`}>
                <div className="flex items-center gap-2 p-2">
                  <button className="text-muted-foreground hover:text-foreground shrink-0" onClick={() => setExpandedId(expanded ? null : rule.id)}>
                    {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="text-sm truncate flex-1 min-w-0">{rule.name}</span>
                  <button
                    className={`shrink-0 ${testId === rule.id ? 'text-primary' : 'text-muted-foreground'} hover:text-foreground`}
                    onClick={() => setTestId(testId === rule.id ? null : rule.id)}
                    aria-label="测试此规则"
                  >
                    <FlaskConical className="w-4 h-4" />
                  </button>
                  <Switch checked={!rule.disabled} onCheckedChange={(c) => updateRule(rule.id, { disabled: !c })} className="scale-90" />
                </div>
                {expanded && (
                  <div className="space-y-3 px-2 pb-2 pt-1 border-t border-border/50">
                    <div className="space-y-1.5">
                      <Label className="text-xs">规则名称</Label>
                      <Input value={rule.name} onChange={(e) => updateRule(rule.id, { name: e.target.value })} className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">匹配正则</Label>
                      <Textarea value={rule.findRegex} onChange={(e) => updateRule(rule.id, { findRegex: e.target.value })}
                        placeholder="/pattern/flags 或纯 pattern" className="text-xs font-mono min-h-[60px]" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">替换为</Label>
                      <Input value={rule.replaceString} onChange={(e) => updateRule(rule.id, { replaceString: e.target.value })}
                        placeholder="留空表示删除" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">应用于</Label>
                      <div className="flex items-center gap-3 flex-wrap">
                        {(['all', 'user', 'assistant'] as const).map((k) => (
                          <label key={k} className="flex items-center gap-1.5 text-xs">
                            <Checkbox checked={rule.placement.includes(k)} onCheckedChange={(c) => handlePlacement(rule.id, k, !!c)} />
                            {k === 'all' ? '全部' : k === 'user' ? '用户' : 'AI'}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* 实时测试区 */}
      <div>
        <h3 className="text-sm font-medium mb-2">
          实时测试{testId ? `：${rules.find((r) => r.id === testId)?.name ?? ''}` : '（点规则旁的烧瓶图标选中）'}
        </h3>
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label className="text-xs">输入样例</Label>
            <Textarea value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder="粘贴一段文本，查看选中规则的替换效果" className="text-xs min-h-[180px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">替换结果</Label>
            <pre className="text-xs whitespace-pre-wrap rounded-md border border-border bg-secondary/30 p-3 min-h-[180px]">{testResult}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}
