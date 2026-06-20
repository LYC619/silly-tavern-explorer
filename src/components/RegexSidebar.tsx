import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp, Regex, GripVertical, Eye, Bookmark, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RegexQuickAdd } from '@/components/RegexQuickAdd';
import { HelpCard } from '@/components/HelpCard';
import type { RegexRule } from '@/types/chat';
import type { ChatMessage } from '@/types/chat';
import { DEFAULT_REGEX_RULES } from '@/types/chat';
import {
  saveCustomRegexRules,
  saveBuiltinRuleStates,
  loadRegexPresets,
  addRegexPreset,
  deleteRegexPreset,
  type RegexPreset,
} from '@/lib/session-storage';
import { applyRegexRules } from '@/lib/regex-processor';
import { parseSTRegexImport, exportSTRegex } from '@/lib/st-regex-interop';
import { useToast } from '@/hooks/use-toast';

interface RegexSidebarProps {
  rules: RegexRule[];
  onRulesChange: (rules: RegexRule[]) => void;
  isOpen: boolean;
  onClose: () => void;
  sampleMessages?: ChatMessage[];
  /** 切换正在预览的规则：传 null 表示退出预览。预览效果在主界面阅读区原地高亮显示。 */
  onPreviewChange?: (rule: RegexRule | null) => void;
  /** 当前正在预览的规则 id（由父级持有，便于跨组件高亮按钮状态） */
  previewId?: string | null;
}

export function RegexSidebar({ rules, onRulesChange, isOpen, onClose, sampleMessages = [], onPreviewChange, previewId = null }: RegexSidebarProps) {
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [presets, setPresets] = useState<RegexPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetOpen, setPresetOpen] = useState(false);
  // 记录刚添加、需要滚动到可见区的规则 id
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const newRuleRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // 添加规则后滚动到新规则位置（否则用户在列表上方时完全感知不到末尾新增了规则）
  useEffect(() => {
    if (scrollToId && newRuleRef.current) {
      newRuleRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollToId(null);
    }
  }, [scrollToId, rules]);

  // 加载已保存的预设
  useEffect(() => {
    setPresets(loadRegexPresets());
  }, []);

  // 保存规则变更到 localStorage
  useEffect(() => {
    saveCustomRegexRules(rules);
    saveBuiltinRuleStates(rules);
  }, [rules]);

  const handleResetToDefault = () => {
    onRulesChange([...DEFAULT_REGEX_RULES]);
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name) {
      toast({ title: '请输入预设名称', variant: 'destructive' });
      return;
    }
    const updated = addRegexPreset(name, rules);
    setPresets(updated);
    setPresetName('');
    toast({ title: '已保存预设', description: `「${name}」包含 ${rules.length} 条规则` });
  };

  const handleLoadPreset = (preset: RegexPreset) => {
    onRulesChange(JSON.parse(JSON.stringify(preset.rules)));
    setPresetOpen(false);
    toast({ title: '已加载预设', description: `「${preset.name}」（${preset.rules.length} 条规则）` });
  };

  const handleDeletePreset = (id: string) => {
    setPresets(deleteRegexPreset(id));
  };

  // 导入 SillyTavern 正则脚本 .json（单脚本 / 数组 / {scripts:[]}）
  const handleImportST = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const imported = parseSTRegexImport(json);
      if (imported.length === 0) {
        toast({ title: '未发现可导入的规则', variant: 'destructive' });
        return;
      }
      // 按 id 去重合并：已存在的 id 覆盖，新 id 追加
      const byId = new Map(rules.map((r) => [r.id, r]));
      imported.forEach((r) => byId.set(r.id, r));
      onRulesChange(Array.from(byId.values()));
      toast({ title: '已导入 ST 正则', description: `导入 ${imported.length} 条规则` });
    } catch (e) {
      toast({
        title: '导入失败',
        description: e instanceof Error ? e.message : '文件不是有效的 JSON',
        variant: 'destructive',
      });
    }
  };

  // 导出当前规则为 ST 正则脚本 .json
  const handleExportST = () => {
    if (rules.length === 0) {
      toast({ title: '当前没有规则可导出', variant: 'destructive' });
      return;
    }
    const json = exportSTRegex(rules);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rules.length === 1 ? `${rules[0].name || 'regex'}.json` : 'regex-scripts.json';
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: '已导出 ST 正则', description: `导出 ${rules.length} 条规则` });
  };

  const handleAddRule = (rule?: RegexRule) => {
    if (rule) {
      onRulesChange([...rules, rule]);
      setEditingId(rule.id);
      setScrollToId(rule.id);
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
      setScrollToId(newRule.id);
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

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const reordered = [...rules];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onRulesChange(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
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
          <HelpCard>
            正则规则用于自动清理 AI 输出中的杂项内容（如思维链 &lt;thinking&gt;、状态栏标签等）。可通过「快速添加」按标签包裹或指定内容快速生成规则，也可手动添加。规则按用户消息和助手消息分别应用，处理后导出的文件会更干净。
          </HelpCard>
          <span className="text-xs text-muted-foreground">
            ({enabledCount}/{rules.length} 启用)
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
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
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              ref={rule.id === scrollToId ? newRuleRef : undefined}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={() => handleDrop(index)}
              onDragEnd={handleDragEnd}
              className={`p-3 rounded-lg border transition-colors ${
                rule.disabled
                  ? 'bg-muted/30 border-muted'
                  : 'bg-secondary/30 border-border'
              } ${dragOverIndex === index && dragIndex !== index ? 'border-primary border-dashed' : ''} ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
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
                    aria-label={editingId === rule.id ? '收起' : '展开编辑'}
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
                      aria-label="删除规则"
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

                  {/* 在主界面阅读区原地预览该规则效果 */}
                  {rule.findRegex && onPreviewChange && (
                    <Button
                      variant={previewId === rule.id ? 'secondary' : 'outline'}
                      size="sm"
                      className="w-full gap-1 h-7 text-xs"
                      onClick={() => onPreviewChange(previewId === rule.id ? null : rule)}
                    >
                      <Eye className="w-3 h-3" />
                      {previewId === rule.id ? '退出预览' : '在正文中预览'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer Actions */}
      <div className="p-4 border-t border-border space-y-2" data-tour="regex-quickadd">
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
        <Popover open={presetOpen} onOpenChange={setPresetOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full gap-1">
              <Bookmark className="w-3 h-3" />
              预设管理
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="start" side="top">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">保存当前规则为预设</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <Input
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSavePreset(); }}
                    placeholder="预设名称"
                    className="h-8 text-sm"
                  />
                  <Button size="sm" className="h-8 shrink-0" onClick={handleSavePreset}>
                    保存
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-2">
                <Label className="text-xs">已保存的预设</Label>
                {presets.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic mt-1.5">暂无预设</p>
                ) : (
                  <div className="mt-1.5 space-y-1 max-h-48 overflow-y-auto">
                    {presets.map((preset) => (
                      <div
                        key={preset.id}
                        className="flex items-center gap-1 rounded border border-border px-2 py-1"
                      >
                        <button
                          className="flex-1 min-w-0 text-left text-sm hover:text-primary"
                          onClick={() => handleLoadPreset(preset)}
                          title={`加载「${preset.name}」`}
                        >
                          <span className="truncate block">{preset.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {preset.rules.length} 条规则
                          </span>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 shrink-0"
                          onClick={() => handleDeletePreset(preset.id)}
                          aria-label="删除预设"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportST(file);
              e.target.value = ''; // 允许重复选择同一文件
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1"
            onClick={() => importInputRef.current?.click()}
            title="导入 SillyTavern 正则脚本 .json"
          >
            <Download className="w-3 h-3" />
            导入正则
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1"
            onClick={handleExportST}
            title="导出为 SillyTavern 正则脚本 .json"
          >
            <Upload className="w-3 h-3" />
            导出正则
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
