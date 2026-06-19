import { useState, useCallback } from 'react';
import { Upload, IdCard, User, FileText, MessageSquare, Tag, BookOpen, Sparkles, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  extractCharacterFromPng,
  parseCharacterCardJson,
  normalizeCharacterCard,
  type NormalizedCharacterCard,
} from '@/lib/png-parser';
import { characterBookToWorldBook } from '@/lib/character-book';
import { POSITION_LABELS } from '@/types/worldbook';

/** 一个带标题的只读文本块；内容为空时不渲染 */
function Field({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed rounded-md bg-secondary/40 p-3 border border-border">
        {value}
      </div>
    </div>
  );
}

export function CharacterCardViewer() {
  const { toast } = useToast();
  const [card, setCard] = useState<NormalizedCharacterCard | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadFile = useCallback(async (file: File) => {
    try {
      const lower = file.name.toLowerCase();
      let raw;
      if (lower.endsWith('.png')) {
        raw = await extractCharacterFromPng(file);
      } else if (lower.endsWith('.json')) {
        raw = parseCharacterCardJson(await file.text());
      } else {
        toast({ title: '请选择 .png 或 .json 角色卡文件', variant: 'destructive' });
        return;
      }
      setCard(normalizeCharacterCard(raw));
    } catch (e) {
      toast({
        title: '解析失败',
        description: e instanceof Error ? e.message : '文件不是有效的角色卡',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  }, [loadFile]);

  const worldBook = card?.characterBook ? characterBookToWorldBook(card.characterBook) : null;
  const bookEntries = worldBook ? Object.values(worldBook.entries) : [];

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* 拖放 / 选择 */}
      <Card>
        <CardContent className="pt-6">
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
          >
            <Upload className="w-8 h-8 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              拖入或点击选择角色卡（.png / .json，V1/V2/V3）
            </span>
            <span className="text-xs text-muted-foreground/70">仅查看，不修改、不写卡</span>
            <input
              type="file"
              accept=".png,.json,image/png,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </CardContent>
      </Card>

      {card && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="flex items-center gap-2">
                <IdCard className="w-5 h-5 text-primary" />
                {card.name}
                {card.nickname && (
                  <span className="text-sm font-normal text-muted-foreground">（{card.nickname}）</span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="uppercase">{card.spec}</Badge>
                {card.creator && <span className="text-xs text-muted-foreground">by {card.creator}</span>}
                {card.characterVersion && (
                  <span className="text-xs text-muted-foreground">v{card.characterVersion}</span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="space-y-4">
                {card.tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    {card.tags.map((t, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                )}

                <Field icon={User} label="描述 (description)" value={card.description} />
                <Field icon={User} label="性格 (personality)" value={card.personality} />
                <Field icon={Info} label="场景 (scenario)" value={card.scenario} />
                <Field icon={MessageSquare} label="开场白 (first_mes)" value={card.firstMessage} />

                {card.alternateGreetings.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <MessageSquare className="w-3.5 h-3.5" />
                      备选开场白 (alternate_greetings) · {card.alternateGreetings.length}
                    </div>
                    {card.alternateGreetings.map((g, i) => (
                      <div key={i} className="whitespace-pre-wrap text-sm leading-relaxed rounded-md bg-secondary/40 p-3 border border-border">
                        {g}
                      </div>
                    ))}
                  </div>
                )}

                <Field icon={FileText} label="对话示例 (mes_example)" value={card.messageExample} />
                <Field icon={Sparkles} label="系统提示 (system_prompt)" value={card.systemPrompt} />
                <Field icon={Sparkles} label="历史后指令 (post_history_instructions)" value={card.postHistoryInstructions} />
                <Field icon={FileText} label="作者备注 (creator_notes)" value={card.creatorNotes} />

                {/* 内嵌世界书 */}
                {bookEntries.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                      <BookOpen className="w-3.5 h-3.5" />
                      内嵌世界书 (character_book) · {bookEntries.length} 条
                    </div>
                    <div className="space-y-2">
                      {bookEntries.map((e) => (
                        <div key={e.uid} className="rounded-md border border-border p-3 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{e.comment || `条目 ${e.uid}`}</span>
                            {!e.enabled && <Badge variant="outline" className="text-xs">已禁用</Badge>}
                            {e.constant && <Badge variant="secondary" className="text-xs">常驻</Badge>}
                            <span className="text-xs text-muted-foreground">
                              {POSITION_LABELS[e.position] ?? `位置 ${e.position}`}
                            </span>
                          </div>
                          {e.key.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {e.key.map((k, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-mono">{k}</Badge>
                              ))}
                            </div>
                          )}
                          <div className="whitespace-pre-wrap text-xs text-muted-foreground leading-relaxed line-clamp-4">
                            {e.content}
                          </div>
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
