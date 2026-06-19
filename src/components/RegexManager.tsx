import { useState } from 'react';
import { Plus, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { RegexRule } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';

interface RegexManagerProps {
  rules: RegexRule[];
  onRulesChange: (rules: RegexRule[]) => void;
}

export function RegexManager({ rules, onRulesChange }: RegexManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleResetToDefault = () => {
    onRulesChange([...DEFAULT_REGEX_RULES]);
  };

  const handleAddRule = () => {
    const newRule: RegexRule = {
      id: crypto.randomUUID(),
      name: `自定义规则 ${rules.length + 1}`,
      findRegex: '',
      replaceString: '',
      placement: ['all'],
      disabled: false,
    };
    onRulesChange([...rules, newRule]);
    setEditingId(newRule.id);
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
      // 移除 'all' 并切换特定选项
      newPlacement = rule.placement.filter((p) => p !== 'all');
      if (checked) {
        if (!newPlacement.includes(placement)) {
          newPlacement.push(placement);
        }
      } else {
        newPlacement = newPlacement.filter((p) => p !== placement);
      }
      // 如果都没选，默认选 all
      if (newPlacement.length === 0) {
        newPlacement = ['all'];
      }
    }

    handleUpdateRule(id, { placement: newPlacement });
  };

  return (
    <Card className="p-4">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between text-left">
            <h3 className="font-display text-sm font-medium text-muted-foreground uppercase tracking-wider">
              正则清理规则
            </h3>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            使用正则表达式移除思维链、状态栏等无关内容
          </p>

          {/* 规则列表 */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
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
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!rule.disabled}
                      onCheckedChange={() => handleToggleRule(rule.id)}
                    />
                    <span
                      className={`text-sm font-medium ${
                        rule.disabled ? 'text-muted-foreground' : ''
                      }`}
                    >
                      {rule.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setEditingId(editingId === rule.id ? null : rule.id)
                      }
                    >
                      {editingId === rule.id ? '收起' : '编辑'}
                    </Button>
                    {!rule.id.startsWith('builtin-') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* 编辑区域 */}
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
                        placeholder="/pattern/flags"
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
                      <div className="flex items-center gap-4">
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
                          用户消息
                        </label>
                        <label className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={rule.placement.includes('assistant')}
                            onCheckedChange={(checked) =>
                              handlePlacementChange(rule.id, 'assistant', !!checked)
                            }
                          />
                          AI消息
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRule}
              className="flex-1"
            >
              <Plus className="w-3 h-3 mr-1" />
              添加规则
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetToDefault}
              className="flex-1"
            >
              <RotateCcw className="w-3 h-3 mr-1" />
              重置默认
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
