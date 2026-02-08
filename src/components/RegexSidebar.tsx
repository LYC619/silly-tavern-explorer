import { useState, useEffect } from 'react';
import { X, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp, Regex } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RegexQuickAdd } from '@/components/RegexQuickAdd';
import type { RegexRule } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';
import { saveCustomRegexRules, saveBuiltinRuleStates } from '@/lib/session-storage';

interface RegexSidebarProps {
  rules: RegexRule[];
  onRulesChange: (rules: RegexRule[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function RegexSidebar({ rules, onRulesChange, isOpen, onClose }: RegexSidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);

  // 保存规则变更到 localStorage
  useEffect(() => {
    saveCustomRegexRules(rules);
    saveBuiltinRuleStates(rules);
  }, [rules]);

  const handleResetToDefault = () => {
    onRulesChange([...DEFAULT_REGEX_RULES]);
  };

  const handleAddRule = (rule?: RegexRule) => {
    if (rule) {
      onRulesChange([...rules, rule]);
      setEditingId(rule.id);
    } else {
      const newRule: RegexRule = {
        id: crypto.randomUUID(),
        name: `自定义规则 ${rules.filter(r => !r.id.startsWith('builtin-')).length + 1}`,
        findRegex: '',
        replaceString: '',
        placement: ['all'],
        disabled: false,
      };
      onRulesChange([...rules, newRule]);
      setEditingId(newRule.id);
    }
  };

  const handleUpdateRule = (id: string, updates: Partial<RegexRule>) => {
    onRulesChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule))
    );
  };

  const handleDeleteRule = (id: string) => {
    onRulesChange(rules.filter((rule) => rule.id !== id));
  };

  const handleToggleRule = (id: string) => {
    const rule = rules.find((r) => r.id === id);
    if (rule) {
      handleUpdateRule(id, { disabled: !rule.disabled });
    }
  };

  const handlePlacementChange = (
    id: string,
    placement: 'all' | 'user' | 'assistant',
    checked: boolean
  ) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;

    let newPlacement: ('all' | 'user' | 'assistant')[];

    if (placement === 'all') {
      newPlacement = checked ? ['all'] : [];
    } else {
      newPlacement = rule.placement.filter((p) => p !== 'all');
      if (checked) {
        if (!newPlacement.includes(placement)) {
          newPlacement.push(placement);
        }
      } else {
        newPlacement = newPlacement.filter((p) => p !== placement);
      }
      if (newPlacement.length === 0) {
        newPlacement = ['all'];
      }
    }

    handleUpdateRule(id, { placement: newPlacement });
  };

  if (!isOpen) return null;

  const enabledCount = rules.filter(r => !r.disabled).length;

  return (
    <aside className="w-80 flex-shrink-0 border border-border rounded-lg bg-card flex flex-col h-[calc(100vh-200px)] sticky top-24 animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Regex className="w-4 h-4 text-primary" />
          <h3 className="font-display font-medium">正则清理规则</h3>
          <span className="text-xs text-muted-foreground">
            ({enabledCount}/{rules.length} 启用)
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Description */}
      <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border">
        使用正则表达式移除思维链、状态栏等无关内容
      </div>

      {/* Rules List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`p-3 rounded-lg border transition-colors ${
                rule.disabled
                  ? 'bg-muted/30 border-muted'
                  : 'bg-secondary/30 border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Switch
                    checked={!rule.disabled}
                    onCheckedChange={() => handleToggleRule(rule.id)}
                  />
                  <span
                    className={`text-sm font-medium truncate ${
                      rule.disabled ? 'text-muted-foreground' : ''
                    }`}
                    title={rule.name}
                  >
                    {rule.name}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setEditingId(editingId === rule.id ? null : rule.id)
                    }
                  >
                    {editingId === rule.id ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </Button>
                  {!rule.id.startsWith('builtin-') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => handleDeleteRule(rule.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Edit Area */}
              {editingId === rule.id && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="space-y-1.5">
                    <Label className="text-xs">规则名称</Label>
                    <Input
                      value={rule.name}
                      onChange={(e) =>
                        handleUpdateRule(rule.id, { name: e.target.value })
                      }
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">匹配正则</Label>
                    <Textarea
                      value={rule.findRegex}
                      onChange={(e) =>
                        handleUpdateRule(rule.id, { findRegex: e.target.value })
                      }
                      placeholder="/pattern/flags 或纯 pattern"
                      className="text-xs font-mono min-h-[60px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">替换为</Label>
                    <Input
                      value={rule.replaceString}
                      onChange={(e) =>
                        handleUpdateRule(rule.id, {
                          replaceString: e.target.value,
                        })
                      }
                      placeholder="留空表示删除"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">应用于</Label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={rule.placement.includes('all')}
                          onCheckedChange={(checked) =>
                            handlePlacementChange(rule.id, 'all', !!checked)
                          }
                        />
                        全部
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={rule.placement.includes('user')}
                          onCheckedChange={(checked) =>
                            handlePlacementChange(rule.id, 'user', !!checked)
                          }
                        />
                        用户
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={rule.placement.includes('assistant')}
                          onCheckedChange={(checked) =>
                            handlePlacementChange(rule.id, 'assistant', !!checked)
                          }
                        />
                        AI
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border space-y-2">
        <div className="flex items-center gap-2">
          <RegexQuickAdd onAddRule={handleAddRule} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAddRule()}
            className="flex-1 gap-1"
          >
            <Plus className="w-3 h-3" />
            手动添加
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetToDefault}
          className="w-full gap-1"
        >
          <RotateCcw className="w-3 h-3" />
        重置为默认
        </Button>
      </div>
    </aside>
  );
}
