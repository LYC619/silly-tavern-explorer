import { useMemo } from 'react';
import { IdCard, User, FileText, MessageSquare, Tag, BookOpen, Sparkles, Info, Upload, Plus, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { characterBookToWorldBook } from '@/lib/character-book';
import { POSITION_LABELS } from '@/types/worldbook';
import type { NormalizedCharacterCard } from '@/lib/png-parser';
import type { CardEdits } from '@/lib/card-export';

/** 可编辑文本字段；多行用 textarea，单行用 input */
function EditableField({
  icon: Icon, label, value, onChange, multiline = true,
}: {
  icon: typeof User; label: string; value: string;
  onChange: (v: string) => void; multiline?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      {multiline ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} className="text-sm min-h-[80px] leading-relaxed" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
      )}
    </div>
  );
}

interface CharacterCardViewerProps {
  card: NormalizedCharacterCard | null;
  edits: CardEdits | null;
  onEditChange: <K extends keyof CardEdits>(key: K, value: CardEdits[K]) => void;
  onLoadFile: (file: File) => void;
}

export function CharacterCardEditor({ card, edits, onEditChange, onLoadFile }: CharacterCardViewerProps) {
  // 内嵌世界书（只读展示，编辑用独立的世界书编辑器）
  const bookEntries = useMemo(() => {
    if (!card?.characterBook) return [];
    const wb = characterBookToWorldBook(card.characterBook);
    return Object.values(wb.entries);
  }, [card?.characterBook]);

  const setArrayItem = (key: 'tags' | 'alternateGreetings', i: number, v: string) => {
    if (!edits) return;
    const next = [...edits[key]];
    next[i] = v;
    onEditChange(key, next);
  };
  const addArrayItem = (key: 'tags' | 'alternateGreetings') => {
    if (!edits) return;
    onEditChange(key, [...edits[key], '']);
  };
  const removeArrayItem = (key: 'tags' | 'alternateGreetings', i: number) => {
    if (!edits) return;
    onEditChange(key, edits[key].filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-4">
      {/* 拖放 / 选择导入 */}
      <Card>
        <CardContent className="pt-6">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onLoadFile(f); }}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border hover:border-primary/50 p-6 cursor-pointer transition-colors"
          >
            <Upload className="w-7 h-7 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">拖入或点击选择角色卡（.png / .json，V1/V2/V3）</span>
            <span className="text-xs text-muted-foreground/70">可编辑核心字段并导出；PNG 导入可回写图片</span>
            <input type="file" accept=".png,.json,image/png,application/json" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onLoadFile(f); e.target.value = ''; }} />
          </label>
        </CardContent>
      </Card>

      {card && edits && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="w-5 h-5 text-primary" />
              {edits.name || '未命名角色'}
              <Badge variant="outline" className="uppercase ml-1">{card.spec}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[64vh] pr-3">
              <div className="space-y-4">
                {/* 基本信息：单行字段 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <EditableField icon={IdCard} label="名称 (name)" value={edits.name} onChange={(v) => onEditChange('name', v)} multiline={false} />
                  <EditableField icon={IdCard} label="昵称 (nickname)" value={edits.nickname} onChange={(v) => onEditChange('nickname', v)} multiline={false} />
                  <EditableField icon={User} label="作者 (creator)" value={edits.creator} onChange={(v) => onEditChange('creator', v)} multiline={false} />
                  <EditableField icon={Info} label="版本 (character_version)" value={edits.characterVersion} onChange={(v) => onEditChange('characterVersion', v)} multiline={false} />
                </div>

                {/* 标签 */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Tag className="w-3.5 h-3.5" /> 标签 (tags)
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => addArrayItem('tags')} aria-label="添加标签">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {edits.tags.map((t, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input value={t} onChange={(e) => setArrayItem('tags', i, e.target.value)} className="h-7 text-xs w-32" />
                        <button onClick={() => removeArrayItem('tags', i)} className="text-muted-foreground hover:text-destructive" aria-label="删除标签">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    {edits.tags.length === 0 && <span className="text-xs text-muted-foreground">无标签</span>}
                  </div>
                </div>

                <EditableField icon={User} label="描述 (description)" value={edits.description} onChange={(v) => onEditChange('description', v)} />
                <EditableField icon={User} label="性格 (personality)" value={edits.personality} onChange={(v) => onEditChange('personality', v)} />
                <EditableField icon={Info} label="场景 (scenario)" value={edits.scenario} onChange={(v) => onEditChange('scenario', v)} />
                <EditableField icon={MessageSquare} label="开场白 (first_mes)" value={edits.firstMessage} onChange={(v) => onEditChange('firstMessage', v)} />

                {/* 备选开场白（数组） */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <MessageSquare className="w-3.5 h-3.5" /> 备选开场白 (alternate_greetings) · {edits.alternateGreetings.length}
                    <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" onClick={() => addArrayItem('alternateGreetings')} aria-label="添加备选开场白">
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {edits.alternateGreetings.map((g, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <Textarea value={g} onChange={(e) => setArrayItem('alternateGreetings', i, e.target.value)} className="text-sm min-h-[60px] flex-1" />
                      <button onClick={() => removeArrayItem('alternateGreetings', i)} className="text-muted-foreground hover:text-destructive mt-2" aria-label="删除">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <EditableField icon={FileText} label="对话示例 (mes_example)" value={edits.messageExample} onChange={(v) => onEditChange('messageExample', v)} />
                <EditableField icon={Sparkles} label="系统提示 (system_prompt)" value={edits.systemPrompt} onChange={(v) => onEditChange('systemPrompt', v)} />
                <EditableField icon={Sparkles} label="历史后指令 (post_history_instructions)" value={edits.postHistoryInstructions} onChange={(v) => onEditChange('postHistoryInstructions', v)} />
                <EditableField icon={FileText} label="作者备注 (creator_notes)" value={edits.creatorNotes} onChange={(v) => onEditChange('creatorNotes', v)} />

                {/* 内嵌世界书（只读，编辑请用世界书编辑器） */}
                {bookEntries.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <BookOpen className="w-3.5 h-3.5" />
                      内嵌世界书 (character_book) · {bookEntries.length} 条（只读，导出时原样保留）
                    </div>
                    <div className="space-y-2">
                      {bookEntries.map((e) => (
                        <div key={e.uid} className="rounded-md border border-border p-3 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{e.comment || `条目 ${e.uid}`}</span>
                            {!e.enabled && <Badge variant="outline" className="text-xs">已禁用</Badge>}
                            {e.constant && <Badge variant="secondary" className="text-xs">常驻</Badge>}
                            <span className="text-xs text-muted-foreground">{POSITION_LABELS[e.position] ?? `位置 ${e.position}`}</span>
                          </div>
                          {e.key.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {e.key.map((k, i) => <Badge key={i} variant="outline" className="text-xs font-mono">{k}</Badge>)}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed line-clamp-4">{e.content}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
