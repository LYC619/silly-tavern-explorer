import { useState, useMemo } from 'react';
import { GripVertical, Trash2, ChevronDown, ChevronRight, Plus, Search, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import type { NormalizedPreset, OrderEntry, PromptBlock, PromptOrderGroup } from '@/types/preset';
import {
  collectReferencedIds, isUnreferenced, isEmptyDisabled,
  substituteVars, estimateTokens, getActiveOrder,
} from '@/lib/preset-parser';
import { RoleBadge, MarkerBadge, UnreferencedBadge, EmptyBadge, roleBorderClass } from './PresetRoleBadge';
import { AIRewriteContent } from '@/components/worldbook/AIRewriteContent';

/** 预设提示词块的 AI 改写语境 */
const PRESET_REWRITE_SYSTEM = `你是一个 SillyTavern 预设（Chat Completion Preset）提示词调优助手。用户会给你一段提示词块的当前内容，以及修改要求。
请按要求改写这段提示词，直接输出改写后的【完整提示词正文】，不要任何解释、不要代码块包裹。
注意：这是发送给大语言模型的指令/系统提示，保持其作为"指令"的清晰与可执行性；保留 {{char}}、{{user}} 等占位宏不要替换掉。`;

const PRESET_REWRITE_PRESETS = [
  '让指令更清晰明确',
  '精简冗余表述',
  '强调中文回复',
  '加强角色扮演沉浸感',
];

interface PromptEditorProps {
  preset: NormalizedPreset;
  activeCharacterId: number;
  onCharacterIdChange: (id: number) => void;
  /** 改激活顺序（进历史栈） */
  onOrderChange: (order: OrderEntry[]) => void;
  /** 改 prompt 块内容（不进历史栈） */
  onBlockContentChange: (identifier: string, content: string) => void;
  /** 改 prompt 块名称 */
  onBlockNameChange: (identifier: string, name: string) => void;
  /** 改 prompt 块角色类型 */
  onBlockRoleChange: (identifier: string, role: 'system' | 'user' | 'assistant') => void;
  /** 手动新建提示词块，返回新块 identifier */
  onAddBlock: (name: string) => string;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function PromptEditor({
  preset, activeCharacterId, onCharacterIdChange,
  onOrderChange, onBlockContentChange, onBlockNameChange, onAddBlock, onUndo, onRedo, canUndo, canRedo,
}: PromptEditorProps) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState('');
  const [charName, setCharName] = useState('{{char}}');
  const [userName, setUserName] = useState('{{user}}');

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const order = getActiveOrder(preset, activeCharacterId);
  const blockMap = useMemo(() => {
    const m = new Map<string, PromptBlock>();
    preset.prompts.forEach((p) => m.set(p.identifier, p));
    return m;
  }, [preset.prompts]);
  const referenced = useMemo(() => collectReferencedIds(preset.promptOrder), [preset.promptOrder]);
  const orderIds = useMemo(() => new Set(order.map((o) => o.identifier)), [order]);

  const charIds = preset.promptOrder.map((g) => g.character_id);

  // 提示词库：不在当前激活 order 里的 prompt（按搜索过滤）
  const libraryBlocks = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    return preset.prompts.filter((p) => {
      if (orderIds.has(p.identifier)) return false;
      if (!q) return true;
      return (p.name ?? '').toLowerCase().includes(q) || p.identifier.toLowerCase().includes(q);
    });
  }, [preset.prompts, orderIds, librarySearch]);

  // ---- 激活顺序操作 ----
  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null); setDragOverIndex(null); return;
    }
    const reordered = [...order];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    onOrderChange(reordered);
    setDragIndex(null); setDragOverIndex(null);
  };

  const toggleEnabled = (identifier: string) => {
    onOrderChange(order.map((o) => (o.identifier === identifier ? { ...o, enabled: !o.enabled } : o)));
  };

  const removeFromOrder = (identifier: string) => {
    onOrderChange(order.filter((o) => o.identifier !== identifier));
    toast({
      title: '已从激活顺序移除',
      action: <ToastAction altText="撤销" onClick={onUndo}>撤销</ToastAction>,
    });
  };

  const addToOrder = (identifier: string) => {
    onOrderChange([...order, { identifier, enabled: true }]);
  };

  // ---- 实时预览 ----
  const previewBlocks = useMemo(
    () => order.filter((o) => o.enabled).map((o) => blockMap.get(o.identifier)).filter(Boolean) as PromptBlock[],
    [order, blockMap]
  );
  const totalTokens = useMemo(
    () => previewBlocks.reduce((sum, b) => sum + (b.marker ? 0 : estimateTokens(substituteVars(b.content ?? '', charName, userName))), 0),
    [previewBlocks, charName, userName]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 左：激活顺序 + 提示词库 */}
      <div className="space-y-4">
        {/* 工具条：多角色组切换 + 撤销/重做 */}
        <div className="flex items-center gap-2 flex-wrap">
          {charIds.length > 1 && (
            <Select value={String(activeCharacterId)} onValueChange={(v) => onCharacterIdChange(Number(v))}>
              <SelectTrigger className="h-8 w-auto text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {charIds.map((id) => (
                  <SelectItem key={id} value={String(id)} className="text-xs">
                    角色组 {id}{id === 100000 ? '（默认）' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onUndo} disabled={!canUndo} aria-label="撤销">
              <Undo2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRedo} disabled={!canRedo} aria-label="重做">
              <Redo2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 激活顺序 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium">激活顺序（{order.length}）</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const id = onAddBlock('新提示词块');
                setExpandedId(id);
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> 新建块
            </Button>
          </div>
          <ScrollArea className="h-[420px] pr-2">
            <div className="space-y-1.5">
              {order.map((entry, index) => {
                const block = blockMap.get(entry.identifier);
                const expanded = expandedId === entry.identifier;
                const empty = block && isEmptyDisabled(block, order);
                return (
                  <div
                    key={entry.identifier}
                    draggable
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    className={`rounded-lg border bg-secondary/30 border-l-2 ${block ? roleBorderClass(block) : 'border-l-border'} ${
                      dragOverIndex === index && dragIndex !== index ? 'border-primary border-dashed' : 'border-border'
                    } ${dragIndex === index ? 'opacity-50' : ''} ${!entry.enabled ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-center gap-2 p-2">
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0" />
                      <button
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setExpandedId(expanded ? null : entry.identifier)}
                        aria-label={expanded ? '收起' : '展开'}
                      >
                        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <span className="text-sm truncate flex-1 min-w-0">{block?.name ?? entry.identifier}</span>
                      {block?.marker ? <MarkerBadge /> : <RoleBadge role={block?.role} />}
                      {empty && <EmptyBadge />}
                      <Switch checked={entry.enabled} onCheckedChange={() => toggleEnabled(entry.identifier)} className="scale-90" />
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeFromOrder(entry.identifier)} aria-label="移除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    {expanded && (
                      <div className="px-2 pb-2 pt-1 border-t border-border/50">
                        {block?.marker ? (
                          <p className="text-xs text-muted-foreground py-1">系统插槽，运行时由 SillyTavern 动态填充，无可编辑内容。</p>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Input
                                value={block?.name ?? ''}
                                onChange={(e) => onBlockNameChange(entry.identifier, e.target.value)}
                                placeholder="块名称"
                                className="h-7 text-xs flex-1"
                              />
                              <AIRewriteContent
                                content={block?.content ?? ''}
                                onResult={(text) => onBlockContentChange(entry.identifier, text)}
                                systemPrompt={PRESET_REWRITE_SYSTEM}
                                quickPresets={PRESET_REWRITE_PRESETS}
                                title="AI 改写本提示词块"
                                compact
                              />
                            </div>
                            <Textarea
                              value={block?.content ?? ''}
                              onChange={(e) => onBlockContentChange(entry.identifier, e.target.value)}
                              placeholder="提示词内容"
                              className="text-xs min-h-[80px] font-mono"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {order.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">当前角色组无激活条目</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* 提示词库 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-sm font-medium">提示词库（{libraryBlocks.length}）</h3>
            <div className="ml-auto relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)} placeholder="搜索" className="h-7 pl-7 text-xs w-36" />
            </div>
          </div>
          <ScrollArea className="h-[160px] pr-2">
            <div className="space-y-1.5">
              {libraryBlocks.map((block) => (
                <div key={block.identifier} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-secondary/20">
                  <span className="text-sm truncate flex-1 min-w-0">{block.name || block.identifier}</span>
                  {block.marker ? <MarkerBadge /> : <RoleBadge role={block.role} />}
                  {isUnreferenced(block, referenced) && <UnreferencedBadge />}
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => addToOrder(block.identifier)} aria-label="加入激活顺序">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
              {libraryBlocks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">没有未激活的提示词</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* 右：实时预览 */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-sm font-medium">实时预览</h3>
          <span className="text-xs text-muted-foreground">~{totalTokens} tokens</span>
          <div className="ml-auto flex items-center gap-1">
            <Label className="text-xs text-muted-foreground">char</Label>
            <Input value={charName} onChange={(e) => setCharName(e.target.value)} className="h-7 text-xs w-24" />
            <Label className="text-xs text-muted-foreground">user</Label>
            <Input value={userName} onChange={(e) => setUserName(e.target.value)} className="h-7 text-xs w-24" />
          </div>
        </div>
        <ScrollArea className="h-[600px] pr-2">
          <div className="space-y-2">
            {previewBlocks.map((block, i) => (
              <div key={`${block.identifier}-${i}`} className={`rounded-md border border-l-2 ${roleBorderClass(block)} bg-card p-2.5`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium">{block.name || block.identifier}</span>
                  {block.marker ? <MarkerBadge /> : <RoleBadge role={block.role} />}
                </div>
                {block.marker ? (
                  <p className="text-xs text-muted-foreground italic">[ {block.name || block.identifier} ]</p>
                ) : (
                  <p className="text-xs whitespace-pre-wrap leading-relaxed text-foreground/90">
                    {substituteVars(block.content ?? '', charName, userName) || <span className="text-muted-foreground italic">（空）</span>}
                  </p>
                )}
              </div>
            ))}
            {previewBlocks.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">无启用的条目可预览</p>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
