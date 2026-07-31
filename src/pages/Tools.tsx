/**
 * 编辑区入口页（2.1-P3，按新前端交接包 demo ③ 重做外壳；原"处理区"仅标签改名）：
 * - 左侧 220px 二级列表：工作类型（五工具+计数）/ 最近打开（最近查看的故事）
 * - 右侧画布：大拖放区 + 类型确认弹窗（复用既有逻辑，"虚线占位=复用现有布局"）
 * 丢文件后弹类型选择（程序给默认猜测，用户确认），随后分流到对应工具页。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, ScrollText, Globe, IdCard, SlidersHorizontal, Regex, BookOpenText,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { guessFileType, TOOL_TYPE_LABELS, type ToolFileType } from '@/lib/file-type-guess';
import { setPendingToolFile } from '@/lib/tool-handoff';
import { STImportCard } from '@/components/tools/STImportCard';
import { getAllCharacters, getAllArchiveStories } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import type { ArchiveStory } from '@/types/archive';

interface ToolEntry {
  type: ToolFileType;
  label: string;
  desc: string;
  icon: typeof ScrollText;
  path: string;
}

const TOOLS: ToolEntry[] = [
  { type: 'chat', label: '聊天处理', desc: '正则清理、编辑、章节、导出与阅读', icon: ScrollText, path: '/chat' },
  { type: 'worldbook', label: '世界书', desc: '条目浏览、编辑、批量整理、AI 追加', icon: Globe, path: '/worldbook' },
  { type: 'card', label: '角色卡', desc: '查看与编辑卡内字段，PNG/JSON 回写', icon: IdCard, path: '/card-viewer' },
  { type: 'preset', label: '预设', desc: '提示词块可视化编辑与导出', icon: SlidersHorizontal, path: '/preset' },
  { type: 'regex', label: '正则', desc: '规则管理、批量导入、可视化生效预览', icon: Regex, path: '/regex' },
];

const Tools = () => {
  const navigate = useNavigate();
  const [dragOver, setDragOver] = useState(false);
  // 待确认的文件 + 程序猜测（null = 没猜出来，让用户自己选）
  const [pending, setPending] = useState<{ file: File; guess: ToolFileType | null } | null>(null);
  const [chosenType, setChosenType] = useState<ToolFileType>('chat');
  /** 二级列表计数与最近打开（加载失败静默为 0/空，不挡工具入口） */
  const [counts, setCounts] = useState<Partial<Record<ToolFileType, number>>>({});
  const [recent, setRecent] = useState<ArchiveStory[]>([]);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    const [stories, wbs, cards, presets, regexes] = await Promise.all([
      getAllArchiveStories().catch(() => []),
      getAllWorldBooks().catch(() => []),
      getAllCharacters().catch(() => []),
      getAllPresets().catch(() => []),
      getAllRegexCollections().catch(() => []),
    ]);
    setCounts({
      chat: stories.length,
      worldbook: wbs.length,
      card: cards.length,
      preset: presets.length,
      regex: regexes.length,
    });
    setRecent(
      stories
        .filter((s) => s.lastViewedAt !== undefined)
        .sort((a, b) => b.lastViewedAt! - a.lastViewedAt!)
        .slice(0, 3),
    );
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSTChanged = useCallback(() => {
    setStatusRefreshKey((key) => key + 1);
    void loadData();
  }, [loadData]);

  const handleFile = useCallback(async (file: File) => {
    // .json 需要读内容嗅探；其他类型看扩展名即可
    let content: string | undefined;
    if (file.name.toLowerCase().endsWith('.json')) {
      try {
        content = await file.text();
      } catch { /* 读失败按无内容处理 */ }
    }
    const guess = guessFileType(file.name, content);
    setPending({ file, guess });
    setChosenType(guess ?? 'chat');
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleConfirm = () => {
    if (!pending) return;
    const target = TOOLS.find((t) => t.type === chosenType);
    if (!target) return;
    setPendingToolFile(chosenType, pending.file);
    setPending(null);
    navigate(target.path);
  };

  return (
    <AppLayout statusRefreshKey={statusRefreshKey}>
      <div className="h-full flex overflow-hidden">
        {/* ===== 左侧 220px 二级列表（demo .editor-sublist）===== */}
        <aside className="w-[var(--editor-sublist-width)] shrink-0 overflow-y-auto scrollbar-thin py-3 px-2 border-r border-[color:var(--border-subtle)]">
          <div>
            <div className="text-[10px] tracking-[1.2px] text-[color:var(--text-faint)] px-2.5 pt-1 pb-1.5">工作类型</div>
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.type}
                  onClick={() => navigate(tool.path)}
                  title={tool.desc}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)] transition-colors"
                >
                  <Icon className="w-3.5 h-3.5 opacity-70 shrink-0" />
                  <span className="flex-1 text-left">{tool.label}</span>
                  {counts[tool.type] !== undefined && (
                    <span className="text-[10px] opacity-50">{counts[tool.type]}</span>
                  )}
                </button>
              );
            })}
          </div>
          {recent.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-[color:var(--hairline-inner)]">
              <div className="text-[10px] tracking-[1.2px] text-[color:var(--text-faint)] px-2.5 pb-1.5">最近打开</div>
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/story/${s.id}`)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)] transition-colors"
                >
                  <BookOpenText className="w-3.5 h-3.5 opacity-70 shrink-0" />
                  <span className="flex-1 text-left truncate" title={s.title}>{s.title}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ===== 右侧画布：拖放区 + ST 接入卡（客户端） ===== */}
        <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-4">
          <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
            <div>
              <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">编辑区</h1>
              <p className="text-[11px] text-[color:var(--text-faint)] mt-1">
                丢进来一个文件，或从左侧打开工具。处理完可入库归档，也可以只导出、不留档。
              </p>
            </div>

            {/* 大拖放区 */}
            <div
              className={cn(
                'relative rounded-xl border-[1.5px] border-dashed p-10 transition-all duration-300 cursor-pointer bg-elevated',
                dragOver ? 'border-brand bg-[var(--brand-active-bg)] scale-[1.01]' : 'border-[color:var(--border-normal)] hover:border-[color:var(--brand-hairline)]',
              )}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('tools-file-input')?.click()}
              data-tour="tools-dropzone"
            >
              <input
                id="tools-file-input"
                type="file"
                accept=".jsonl,.json,.txt,.png"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
              />
              <div className="flex flex-col items-center gap-3 text-center">
                <div className={cn('w-12 h-12 rounded-full flex items-center justify-center transition-colors bg-[var(--brand-active-bg)] text-brand')}>
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">拖入文件开始处理</h2>
                  <p className="text-xs text-[color:var(--text-muted)] mt-1">
                    聊天记录 (.jsonl/.json/.txt) · 角色卡 (.png/.json) · 世界书 / 预设 / 正则 (.json)
                  </p>
                </div>
              </div>
            </div>

            {/* 客户端专属：首次接入 ST（网页版 isTauri=false 不渲染）；P4 将随首页置顶卡整合 */}
            <STImportCard onChanged={handleSTChanged} />
          </div>
        </div>
      </div>

      {/* 类型确认：程序猜测 + 用户拍板（选择器即适配层） */}
      <Dialog open={!!pending} onOpenChange={(v) => { if (!v) setPending(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>这是什么文件？</DialogTitle>
            <DialogDescription>
              {pending?.file.name}
              {pending?.guess
                ? ` — 看起来像${TOOL_TYPE_LABELS[pending.guess]}，确认后进入对应工具`
                : ' — 没认出来，请选择用哪个工具处理'}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={chosenType} onValueChange={(v) => setChosenType(v as ToolFileType)} className="space-y-2">
            {TOOLS.map((tool) => (
              <div
                key={tool.type}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-accent/50 cursor-pointer"
                onClick={() => setChosenType(tool.type)}
              >
                <RadioGroupItem value={tool.type} id={`type-${tool.type}`} />
                <Label htmlFor={`type-${tool.type}`} className="cursor-pointer flex-1">
                  {TOOL_TYPE_LABELS[tool.type]}
                  {pending?.guess === tool.type && (
                    <span className="ml-2 text-xs text-primary">（猜测）</span>
                  )}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>取消</Button>
            <Button onClick={handleConfirm}>确认并处理</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Tools;
