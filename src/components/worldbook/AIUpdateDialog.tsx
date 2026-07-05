import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Sparkles, Loader2, StopCircle, Wand2, FileWarning, Pencil, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { loadAPIConfig } from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { ApiStatusLine } from '@/components/ai-tools/ApiStatusLine';
import { FloorRangePicker } from '@/components/summary/FloorRangePicker';
import { floorsToText } from '@/lib/story-tree-ai';
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

/** 增量更新默认提示词：在"提取世界书"基础上强调"只输出新设定、不重复已有条目"。可在弹窗内查看编辑。 */
export const DEFAULT_WB_UPDATE_PROMPT = `你是一个世界观设定提取专家。用户会提供一段角色扮演对话记录，以及【已有世界书条目清单】。
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

const PROMPT_LS_KEY = 'st-wb-update-prompt';

export function AIUpdateDialog({ open, onOpenChange, existingEntries, onAppend }: Props) {
  const { toast } = useToast();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [floorStart, setFloorStart] = useState(0);
  const [floorEnd, setFloorEnd] = useState(0);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_WB_UPDATE_PROMPT);
  const [promptOpen, setPromptOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // 提示词 localStorage 记忆（与故事树 AI 弹窗同款模式）
  useEffect(() => {
    const saved = localStorage.getItem(PROMPT_LS_KEY);
    if (saved) setCustomPrompt(saved);
  }, []);

  const handlePromptChange = (v: string) => {
    setCustomPrompt(v);
    localStorage.setItem(PROMPT_LS_KEY, v);
  };

  const handlePromptReset = () => {
    setCustomPrompt(DEFAULT_WB_UPDATE_PROMPT);
    localStorage.removeItem(PROMPT_LS_KEY);
    toast({ title: '已恢复默认提示词' });
  };

  // 打开时载入活跃聊天（API 配置统一在 AI 工具页维护，生成时即时读取）
  useEffect(() => {
    if (!open) return;
    setOutput('');
    loadActiveSession().then((s) => {
      setSession(s);
      setSessionLoaded(true);
      if (s) {
        setFloorStart(0);
        setFloorEnd(Math.max(0, s.messages.length - 1));
      }
    }).catch(() => setSessionLoaded(true));
  }, [open]);

  const floorCount = useMemo(
    () => (session ? Math.max(0, Math.min(floorEnd, session.messages.length - 1) - Math.max(0, floorStart) + 1) : 0),
    [session, floorStart, floorEnd]
  );

  // 已有条目摘要（标题 + 关键词），喂给 AI 防重复
  const existingSummary = useMemo(() => {
    if (existingEntries.length === 0) return '（当前世界书为空）';
    return existingEntries
      .map((e) => `- ${e.comment || '(无标题)'}${e.key.length ? `（关键词：${e.key.join('、')}）` : ''}`)
      .join('\n');
  }, [existingEntries]);

  const handleGenerate = useCallback(async () => {
    const config = loadAPIConfig(); // 生成时即时读取（配置在 AI 工具页维护）
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 工具」页配置后回来生成', variant: 'destructive' });
      return;
    }
    if (!session || floorCount === 0) {
      toast({ title: '请先选择要分析的楼层', variant: 'destructive' });
      return;
    }

    const userContent = `【已有世界书条目清单】（请勿重复这些设定）：\n${existingSummary}\n\n【对话记录】：\n${floorsToText(session, floorStart, floorEnd)}`;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setOutput('');
    try {
      await callOpenAIMessages(config, [
        { role: 'system', content: customPrompt.trim() || DEFAULT_WB_UPDATE_PROMPT },
        { role: 'user', content: userContent },
      ], {
        onChunk: (chunk) => setOutput((p) => p + chunk),
        signal: controller.signal,
      });
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
  }, [session, floorStart, floorEnd, floorCount, customPrompt, existingSummary, toast]);

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
      <DialogContent className="!max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI 按聊天内容追加世界书条目
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            根据聊天记录提炼<strong>新</strong>设定，<strong>追加</strong>为新条目（不改动现有条目）。想修改某一条，请在该条目编辑区用「AI 改写」。
          </p>

          <ApiStatusLine />

          {/* 无活跃聊天 */}
          {sessionLoaded && !session && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <FileWarning className="w-8 h-8" />
              <p className="text-sm">没有正在编辑的聊天记录。</p>
              <p className="text-xs">请先到「聊天处理」导入或从书架打开一份聊天记录，再回来使用此功能。</p>
            </div>
          )}

          {/* 楼层范围 + 提示词 + 生成 */}
          {session && (
            <>
              <FloorRangePicker
                total={session.messages.length}
                start={floorStart}
                end={floorEnd}
                onChange={(s, e) => { setFloorStart(s); setFloorEnd(e); }}
              />

              {/* 提示词查看/编辑 */}
              <div className="space-y-1">
                <button
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setPromptOpen((o) => !o)}
                >
                  <Pencil className="w-3 h-3" />
                  {promptOpen ? '收起提示词' : '查看/编辑提示词'}
                </button>
                {promptOpen && (
                  <div className="space-y-1.5">
                    <Textarea
                      value={customPrompt}
                      onChange={(e) => handlePromptChange(e.target.value)}
                      className="min-h-[30vh] font-mono text-xs"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        修改会自动记住。注意保留 {'{ "entries": ... }'} 的 JSON 输出约定，否则无法解析并入。
                      </p>
                      <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs" onClick={handlePromptReset}>
                        <RotateCcw className="w-3 h-3" />恢复默认
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {!loading ? (
                  <Button onClick={handleGenerate} className="gap-1.5" disabled={floorCount === 0}>
                    <Wand2 className="w-4 h-4" /> 生成新条目（{floorCount} 楼）
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
      </DialogContent>
    </Dialog>
  );
}
