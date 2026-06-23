import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sparkles, Loader2, StopCircle, Wand2, FileWarning } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  callOpenAI, loadAPIConfig, saveAPIConfig, clearAPIConfig,
  APIConfigCard, FloorSelector, DEFAULT_API_URL, DEFAULT_MODEL,
  type APIConfig,
} from '@/components/ai-tools';
import { loadActiveSession } from '@/lib/session-storage';
import { parseWorldBook } from '@/types/worldbook';
import type { WorldBook, WorldBookEntry } from '@/types/worldbook';
import type { ChatSession } from '@/types/chat';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingEntries: WorldBookEntry[];
  onAppend: (wb: WorldBook) => void;
}

/** 增量更新的 system prompt：在"提取世界书"基础上强调"只输出新设定、不重复已有条目" */
const SYSTEM_PROMPT = `你是一个世界观设定提取专家。用户会提供一段角色扮演对话记录，以及【已有世界书条目清单】。
请从对话中提炼出【新出现】或【有重要更新】的世界观设定，输出为世界书 JSON 格式，用于追加到已有世界书。

严格要求：
- 只输出一个 JSON 对象，格式为 { "entries": { "0": {...}, "1": {...}, ... } }，不要任何解释文字
- 【不要重复已有条目清单中已覆盖的设定】，只输出对话里新增/更新的内容；若对话中没有值得新增的设定，输出 { "entries": {} }
- 每个条目字段：
  - key: 关键词数组（触发该条目的关键词）
  - keysecondary: 次要关键词数组（可为空）
  - content: 详细的设定描述
  - comment: 条目标题/简短标识
  - constant: false
  - vectorized: false
  - enabled: true
  - position: 4
  - order: 从 100 起递增

提炼这些类型的设定：角色特征（外貌/性格/能力/背景的新变化）、地点/场景、物品/道具、世界规则、组织/阵营、重要事件/历史。
只输出 JSON。`;

export function AIUpdateDialog({ open, onOpenChange, existingEntries, onAppend }: Props) {
  const { toast } = useToast();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [config, setConfig] = useState<APIConfig>({ apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL });
  const [showConfig, setShowConfig] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // 打开时载入活跃聊天 + API 配置
  useEffect(() => {
    if (!open) return;
    setConfig(loadAPIConfig());
    setOutput('');
    loadActiveSession().then((s) => {
      setSession(s);
      setSessionLoaded(true);
      if (s) setSelectedIndices(new Set(s.messages.map((_, i) => i))); // 默认全选
    }).catch(() => setSessionLoaded(true));
  }, [open]);

  const handleConfigSave = (c: APIConfig) => { saveAPIConfig(c); setConfig(c); setShowConfig(false); };
  const handleConfigClear = () => { clearAPIConfig(); setConfig({ apiKey: '', apiUrl: DEFAULT_API_URL, model: DEFAULT_MODEL }); };

  // 已有条目摘要（标题 + 关键词），喂给 AI 防重复
  const existingSummary = useMemo(() => {
    if (existingEntries.length === 0) return '（当前世界书为空）';
    return existingEntries
      .map((e) => `- ${e.comment || '(无标题)'}${e.key.length ? `（关键词：${e.key.join('、')}）` : ''}`)
      .join('\n');
  }, [existingEntries]);

  const selectedContent = useMemo(() => {
    if (!session) return '';
    return session.messages
      .filter((_, i) => selectedIndices.has(i))
      .map((m, idx) => {
        const name = m.role === 'user'
          ? (session.user?.name || m.name || 'User')
          : (session.character?.name || m.name || 'Character');
        return `[#${idx + 1} ${name}]\n${m.content}`;
      })
      .join('\n\n');
  }, [session, selectedIndices]);

  const handleGenerate = useCallback(async () => {
    if (!config.apiKey) { setShowConfig(true); toast({ title: '请先配置 API Key', variant: 'destructive' }); return; }
    if (!selectedContent.trim()) { toast({ title: '请先选择要分析的楼层', variant: 'destructive' }); return; }

    const userContent = `【已有世界书条目清单】（请勿重复这些设定）：\n${existingSummary}\n\n【对话记录】：\n${selectedContent}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setOutput('');
    try {
      await callOpenAI(config, userContent, SYSTEM_PROMPT, (chunk) => setOutput((p) => p + chunk), controller.signal);
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        toast({ title: '已停止生成' });
      } else {
        toast({ title: '生成失败', description: e instanceof Error ? e.message : '请检查 API 配置', variant: 'destructive' });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [config, selectedContent, existingSummary, toast]);

  const handleStop = () => abortRef.current?.abort();

  // 解析 AI 输出为 WorldBook
  const parsed = useMemo(() => {
    if (!output) return null;
    try {
      const jsonStr = output.replace(/^```json?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
      const json = JSON.parse(jsonStr);
      if (!json || typeof json !== 'object' || !json.entries) return null;
      const wb = parseWorldBook(json);
      return { wb, count: Object.keys(wb.entries).length };
    } catch {
      return null;
    }
  }, [output]);

  const handleAppend = () => {
    if (!parsed) return;
    if (parsed.count === 0) {
      toast({ title: 'AI 未提炼出新设定', description: '对话中没有可新增的世界观条目' });
      return;
    }
    onAppend(parsed.wb);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI 按聊天内容更新世界书
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4">
            {/* API 配置：无 key 或用户主动展开时显示 */}
            {(showConfig || !config.apiKey) && (
              <APIConfigCard savedConfig={config} onConfigSave={handleConfigSave} onConfigClear={handleConfigClear} />
            )}

            {/* 无活跃聊天 */}
            {sessionLoaded && !session && (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                <FileWarning className="w-8 h-8" />
                <p className="text-sm">没有正在编辑的聊天记录。</p>
                <p className="text-xs">请先到「聊天处理」导入或从书架打开一份聊天记录，再回来使用此功能。</p>
              </div>
            )}

            {/* 楼层选择 + 生成 */}
            {session && (
              <>
                <FloorSelector
                  messages={session.messages}
                  characterName={session.character?.name}
                  userName={session.user?.name}
                  selectedIndices={selectedIndices}
                  onSelectionChange={setSelectedIndices}
                />

                <div className="flex items-center gap-2">
                  {!loading ? (
                    <Button onClick={handleGenerate} className="gap-1.5">
                      <Wand2 className="w-4 h-4" /> 生成新条目
                    </Button>
                  ) : (
                    <Button variant="destructive" onClick={handleStop} className="gap-1.5">
                      <StopCircle className="w-4 h-4" /> 停止
                    </Button>
                  )}
                  {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground">
                    已有 {existingEntries.length} 条 · AI 只提炼新设定、避免重复
                  </span>
                </div>

                {/* 输出 */}
                {output && (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">AI 输出：</div>
                    <pre className="text-xs whitespace-pre-wrap rounded-md border border-border bg-secondary/30 p-3 max-h-60 overflow-auto">{output}</pre>
                    {!loading && (
                      parsed ? (
                        <Button onClick={handleAppend} className="gap-1.5">
                          <Sparkles className="w-4 h-4" /> 并入世界书（{parsed.count} 条新条目）
                        </Button>
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">AI 返回的内容不是有效的世界书 JSON，可点「停止」后重试或调整选择范围。</p>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
