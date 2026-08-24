/**
 * 角色卡主页 · 简介区（2.0 阶段6，定稿第四章·简介）。
 * 主体是整理后的可读简介：未生成时显示原始 Description 的整理版；
 * AI 简介手动触发（范围=卡+勾选的关联世界书）→ 新结果先作草稿与当前版比较 →
 * 确认后替换并保留历史版本；源（关联世界书）变化时只提示「可能已过期」，不自动覆盖。
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { Sparkles, History, Pencil, Loader2, Square, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { MarkdownLite } from '@/components/MarkdownLite';
import { loadAPIConfig } from '@/components/ai-tools';
import { callOpenAIMessages } from '@/components/ai-tools/useOpenAI';
import { buildIntroMessages, describeReadScope } from '@/lib/character-ai';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import type { WorldBookItem } from '@/types/worldbook';
import type { ArchiveCharacter, IntroVersion } from '@/types/archive';
import type { CharacterPatch } from '@/lib/character-write';
import type { NormalizedCharacterCard } from '@/lib/png-parser';

interface IntroSectionProps {
  character: ArchiveCharacter;
  norm: NormalizedCharacterCard;
  onPatch: (patch: CharacterPatch) => Promise<ArchiveCharacter>;
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function IntroSection({ character, norm, onPatch }: IntroSectionProps) {
  const { toast } = useToast();
  const current = character.intro?.current;
  const history = character.intro?.history ?? [];

  // 关联世界书（勾选范围候选 + 过期检测）
  const [linkedWbs, setLinkedWbs] = useState<WorldBookItem[]>([]);
  useEffect(() => {
    const wbIds = (character.assets ?? []).filter((a) => a.kind === 'worldbook').map((a) => a.assetId);
    if (wbIds.length === 0) { setLinkedWbs([]); return; }
    getAllWorldBooks()
      .then((all) => setLinkedWbs(all.filter((w) => wbIds.includes(w.id))))
      .catch(() => setLinkedWbs([]));
  }, [character.assets]);

  const wbNames = useMemo(() => new Map(linkedWbs.map((w) => [w.id, w.title])), [linkedWbs]);

  // 过期检测（只提示不覆盖）：当前简介读过的世界书在生成之后被改过
  const stale = useMemo(() => {
    if (!current) return false;
    if (character.introStale) return true;
    return (current.readScope ?? []).some((s) => {
      const [kind, id] = s.split(':', 2);
      if (kind !== 'worldbook') return false;
      const wb = linkedWbs.find((w) => w.id === id);
      return !!wb && wb.updatedAt > current.createdAt;
    });
  }, [current, character.introStale, linkedWbs]);

  // ---- 生成对话框 ----
  const [genOpen, setGenOpen] = useState(false);
  const [pickedWbIds, setPickedWbIds] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftScope, setDraftScope] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef('');

  const openGenerate = () => {
    setDraft('');
    setPickedWbIds(linkedWbs.map((w) => w.id)); // 默认全选关联世界书
    setGenOpen(true);
  };

  const handleGenerate = async () => {
    const config = loadAPIConfig();
    if (!config.apiKey) {
      toast({ title: '请先配置 API Key', description: '前往「AI 配置」页配置后回来生成', variant: 'destructive' });
      return;
    }
    const worldbooks = linkedWbs
      .filter((w) => pickedWbIds.includes(w.id))
      .map((w) => ({ id: w.id, title: w.title, wb: w.worldbook }));
    const { messages, readScope } = buildIntroMessages({ norm, worldbooks });
    setDraftScope(readScope);
    setStreaming(true);
    setDraft('');
    outputRef.current = '';
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await callOpenAIMessages(config, messages, {
        onChunk: (chunk) => {
          outputRef.current += chunk;
          setDraft(outputRef.current);
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast({ title: '已停止生成' });
      } else {
        toast({ title: '生成失败', description: err instanceof Error ? err.message : '未知错误', variant: 'destructive' });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  /** 把一个新版本设为当前简介：旧 current 入历史栈（最新在前） */
  const adoptVersion = (version: IntroVersion) => onPatch({
      intro: {
        current: version,
        history: current ? [current, ...history] : history,
      },
      introStale: false,
    });

  const handleAdoptDraft = async () => {
    if (!draft.trim()) return;
    try {
      await adoptVersion({ content: draft.trim(), source: 'ai', readScope: draftScope, createdAt: Date.now() });
      setGenOpen(false);
      toast({ title: 'AI 简介已启用', description: current ? '旧版已存入历史' : undefined });
    } catch {
      // 父层已提示失败；保留草稿。
    }
  };

  // ---- 手动编辑 ----
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState('');
  const handleSaveEdit = async () => {
    const text = editDraft.trim();
    if (!text) return;
    try {
      await adoptVersion({ content: text, source: 'manual', createdAt: Date.now() });
      setEditOpen(false);
      toast({ title: '简介已保存' });
    } catch {
      // 父层已提示失败；保留编辑器。
    }
  };

  // ---- 历史 ----
  const [historyOpen, setHistoryOpen] = useState(false);
  const handleRestore = async (idx: number) => {
    const target = history[idx];
    if (!target || !current) return;
    await onPatch({
      intro: {
        current: target,
        history: [current, ...history.filter((_, i) => i !== idx)],
      },
    });
    toast({ title: '已恢复该版本', description: '此前的当前版已存入历史' });
  };

  const displayText = current?.content ?? norm.description;
  // 未配 API 时入口置灰+tooltip（10.3a；handleGenerate 里的 toast 仍留作兜底）
  const hasApiKey = !!loadAPIConfig().apiKey;

  return (
    <div className="space-y-2">
      {/* 简介正文 */}
      {displayText ? (
        <div className="text-sm leading-relaxed text-foreground/90 max-h-52 overflow-y-auto rounded-md bg-muted/40 p-3">
          {current ? (
            <MarkdownLite text={current.content} />
          ) : (
            <span className="whitespace-pre-wrap">{norm.description}</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">这张卡没有 Description，可以用 AI 从其他字段生成一份档案简介。</p>
      )}

      {/* 状态行 + 操作 */}
      <div className="flex items-center gap-2 flex-wrap">
        {current && (
          <Badge variant="outline" className="h-5 px-1.5 text-[11px] text-muted-foreground font-normal">
            {current.source === 'ai' ? 'AI 简介' : '手动整理'} · {fmtTime(current.createdAt)}
          </Badge>
        )}
        {stale && (
          <Badge variant="outline" className="h-5 px-1.5 text-[11px] gap-1 text-[color:var(--status-warn)] border-[color:var(--status-warn)]/40 font-normal">
            <TriangleAlert className="w-3 h-3" />
            可能已过期（关联世界书有更新）
          </Badge>
        )}
        <span title={hasApiKey ? undefined : '未配置 AI API：前往「AI 配置」页填好后可用'}>
          <Button variant="outline" size="sm" className="h-7 gap-1" disabled={!hasApiKey} onClick={openGenerate}>
            <Sparkles className="w-3.5 h-3.5" />
            {current ? '重新生成简介' : '生成 AI 简介'}
          </Button>
        </span>
        <Button
          variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground"
          onClick={() => { setEditDraft(current?.content ?? norm.description); setEditOpen(true); }}
        >
          <Pencil className="w-3.5 h-3.5" />编辑
        </Button>
        {history.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={() => setHistoryOpen(true)}>
            <History className="w-3.5 h-3.5" />历史 {history.length}
          </Button>
        )}
      </div>

      {/* ===== 生成对话框：范围勾选 → 流式草稿 → 与当前版比较 ===== */}
      <Dialog open={genOpen} onOpenChange={(v) => { if (!streaming) setGenOpen(v); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>生成 AI 简介</DialogTitle>
            <DialogDescription>
              AI 读取勾选的资料生成档案简介；生成结果先作草稿比较，确认后才替换当前简介。
            </DialogDescription>
          </DialogHeader>

          {/* 读取范围 */}
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <Label className="flex items-center gap-1.5 text-muted-foreground">
              <Checkbox checked disabled />
              角色卡（必选）
            </Label>
            {linkedWbs.map((w) => (
              <Label key={w.id} className="flex items-center gap-1.5 cursor-pointer">
                <Checkbox
                  checked={pickedWbIds.includes(w.id)}
                  onCheckedChange={(c) =>
                    setPickedWbIds((prev) => (c ? [...prev, w.id] : prev.filter((x) => x !== w.id)))
                  }
                />
                世界书「{w.title}」
              </Label>
            ))}
            {linkedWbs.length === 0 && (
              <span className="text-xs text-muted-foreground">（没有关联世界书；可先在下方「关联资产」区挂引用）</span>
            )}
            {!streaming ? (
              <Button size="sm" className="gap-1 ml-auto" onClick={handleGenerate}>
                <Sparkles className="w-3.5 h-3.5" />
                {draft ? '重新生成' : '开始生成'}
              </Button>
            ) : (
              <Button size="sm" variant="destructive" className="gap-1 ml-auto" onClick={() => abortRef.current?.abort()}>
                <Square className="w-3.5 h-3.5" />停止
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </Button>
            )}
          </div>

          {/* 草稿 vs 当前（布局铁律：flex-wrap + 行内 basis） */}
          <div className="flex gap-3 flex-wrap min-h-0 flex-1 overflow-y-auto">
            {current && (
              <div className="min-w-0 space-y-1" style={{ flex: '1 1 260px' }}>
                <p className="text-xs font-medium text-muted-foreground">当前简介（{fmtTime(current.createdAt)}）</p>
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm max-h-72 overflow-y-auto">
                  <MarkdownLite text={current.content} />
                </div>
              </div>
            )}
            <div className="min-w-0 space-y-1" style={{ flex: '1 1 260px' }}>
              <p className="text-xs font-medium text-muted-foreground">
                {streaming ? '正在生成…' : draft ? '新草稿' : '草稿（点「开始生成」）'}
              </p>
              <div className="rounded-md border border-primary/30 bg-card p-3 text-sm max-h-72 overflow-y-auto min-h-24">
                {draft ? <MarkdownLite text={draft} /> : (
                  <span className="text-xs text-muted-foreground">生成结果会出现在这里，与左侧当前版对照。</span>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" disabled={streaming} onClick={() => setGenOpen(false)}>放弃</Button>
            <Button disabled={streaming || !draft.trim()} onClick={handleAdoptDraft}>
              采用新简介{current ? '（旧版存入历史）' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 手动编辑 ===== */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>编辑简介</DialogTitle>
            <DialogDescription>支持 Markdown；保存后成为当前简介（旧版存入历史），不写回 ST 卡文件。</DialogDescription>
          </DialogHeader>
          <Textarea
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            className="min-h-64 font-mono text-sm"
            placeholder="写一份给自己看的档案简介……"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button disabled={!editDraft.trim()} onClick={handleSaveEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== 历史版本 ===== */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>简介历史（{history.length} 个版本）</DialogTitle>
            <DialogDescription>恢复某个版本时，当前版会存入历史，不会丢。</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 max-h-[60vh] pr-2">
            <div className="space-y-3">
              {history.map((v, i) => (
                <div key={`${v.createdAt}-${i}`} className="rounded-md border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal">
                      {v.source === 'ai' ? 'AI 生成' : '手动整理'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmtTime(v.createdAt)}</span>
                    {v.source === 'ai' && v.readScope && v.readScope.length > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        读取：{describeReadScope(v.readScope, wbNames)}
                      </span>
                    )}
                    <Button variant="outline" size="sm" className="h-6 ml-auto" onClick={() => { void handleRestore(i).catch(() => {}); }}>
                      恢复此版
                    </Button>
                  </div>
                  <div className="text-sm max-h-40 overflow-y-auto">
                    <MarkdownLite text={v.content} />
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
