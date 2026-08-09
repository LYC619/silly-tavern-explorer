/**
 * 编辑区入口页（2.1-P3，按新前端交接包 demo ③ 重做外壳；原"处理区"仅标签改名）：
 * - 左侧 220px 二级列表：工作类型（五工具+计数）/ 最近打开（最近查看的故事）
 * - 右侧画布：大拖放区 + 类型确认弹窗（复用既有逻辑，"虚线占位=复用现有布局"）
 * 丢文件后弹类型选择（程序给默认猜测，用户确认），随后分流到对应工具页。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  UploadCloud, ScrollText, Globe, IdCard, SlidersHorizontal, Regex, BookOpenText, Network,
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
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import {
  buildEditorStoryPickerItems,
  EDITOR_TOOL_COPY,
  pickRecentlyViewedStories,
  storyWorkspaceViewForEditorFocus,
} from '@/lib/home-layout';

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

const ORGANIZE_ENTRIES = [
  { focus: 'summary', label: '总结', desc: EDITOR_TOOL_COPY.summary, icon: BookOpenText },
  { focus: 'story-tree', label: '故事树', desc: EDITOR_TOOL_COPY.storyTree, icon: Network },
] as const;

const Tools = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus');
  const focusView = storyWorkspaceViewForEditorFocus(focus);
  const focusCopy = focus === 'summary'
    ? { title: '总结', description: EDITOR_TOOL_COPY.summary, action: '进入分卷总结' }
    : focus === 'story-tree'
      ? { title: '故事树', description: EDITOR_TOOL_COPY.storyTree, action: '打开故事树' }
      : null;
  const [dragOver, setDragOver] = useState(false);
  // 待确认的文件 + 程序猜测（null = 没猜出来，让用户自己选）
  const [pending, setPending] = useState<{ file: File; guess: ToolFileType | null } | null>(null);
  const [chosenType, setChosenType] = useState<ToolFileType>('chat');
  /** 二级列表计数与最近打开（加载失败静默为 0/空，不挡工具入口） */
  const [counts, setCounts] = useState<Partial<Record<ToolFileType, number>>>({});
  const [stories, setStories] = useState<ArchiveStory[]>([]);
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [recent, setRecent] = useState<ArchiveStory[]>([]);
  const [storyQuery, setStoryQuery] = useState('');

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
    const sortedStories = [...stories]
      .sort((a, b) => (b.lastViewedAt ?? b.updatedAt) - (a.lastViewedAt ?? a.updatedAt));
    setStories(sortedStories);
    setCharacters(cards);
    setRecent(pickRecentlyViewedStories(sortedStories));
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSTChanged = useCallback(() => {
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

  const openStory = useCallback((storyId: string) => {
    navigate(`/story/${storyId}`, focusView ? { state: { view: focusView } } : undefined);
  }, [focusView, navigate]);

  const storyPickerItems = buildEditorStoryPickerItems(stories, characters, storyQuery);

  return (
    <AppLayout>
      <div className="h-full flex overflow-hidden">
        {/* ===== 左侧 220px 二级列表（demo .editor-sublist）===== */}
        <aside className="w-[var(--editor-sublist-width)] shrink-0 overflow-y-auto scrollbar-thin py-3 px-2 border-r border-[color:var(--border-subtle)]">
          <div>
            <div className="text-[10px] tracking-[1.2px] text-[color:var(--text-muted)] px-2.5 pt-1 pb-1.5">工作类型</div>
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
          <div className="mt-2.5 border-t border-[color:var(--hairline-inner)] pt-2.5">
            <div className="px-2.5 pb-1.5 text-[10px] tracking-[1.2px] text-[color:var(--text-muted)]">整理与记录</div>
            {ORGANIZE_ENTRIES.map((entry) => {
              const Icon = entry.icon;
              const active = focus === entry.focus;
              return (
                <button
                  key={entry.focus}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => navigate(`/tools?focus=${entry.focus}`)}
                  title={entry.desc}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors',
                    active
                      ? 'bg-[var(--brand-active-bg)] text-brand'
                      : 'text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]',
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="flex-1 text-left">{entry.label}</span>
                </button>
              );
            })}
          </div>
          {recent.length > 0 && (
            <div className="mt-2.5 pt-2.5 border-t border-[color:var(--hairline-inner)]">
              <div className="text-[10px] tracking-[1.2px] text-[color:var(--text-muted)] px-2.5 pb-1.5">最近故事</div>
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => openStory(s.id)}
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
              <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">
                {focusCopy ? `${focusCopy.title} · 编辑区` : '编辑区'}
              </h1>
              <p className="text-[11px] text-[color:var(--text-muted)] mt-1">
                {focusCopy?.description ?? '丢进来一个文件，或从左侧打开工具。处理完可入库归档，也可以只导出、不留档。'}
              </p>
              {focusCopy && (
                <div className="mt-3 rounded-lg border border-[color:var(--brand-hairline)] bg-[var(--brand-active-bg)] px-3 py-2 text-xs text-[color:var(--text-body)]" data-editor-focus={focus}>
                  选择一个故事后会直接进入对应工作台，不再先落到阅读页。
                </div>
              )}
            </div>

            {focusCopy && (
              <section className="rounded-xl border border-[color:var(--border-normal)] bg-elevated p-4" data-editor-story-picker>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">选择要处理的故事</h2>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">从全部故事中选择后，直接打开「{focusCopy.title}」视图。</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate('/chat')}>导入新聊天</Button>
                </div>
                {stories.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="search"
                      value={storyQuery}
                      onChange={(event) => setStoryQuery(event.target.value)}
                      placeholder="搜索故事或角色"
                      aria-label="搜索故事或角色"
                      className="min-w-0 flex-1 rounded-md border border-[color:var(--border-normal)] bg-chrome px-2.5 py-1.5 text-xs text-[color:var(--text-body)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-brand focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring"
                    />
                    <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                      {storyPickerItems.length}/{stories.length} 个故事
                    </span>
                  </div>
                )}
                {storyPickerItems.length > 0 ? (
                  <div className="mt-3 max-h-[24rem] overflow-y-auto pr-1 scrollbar-thin">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {storyPickerItems.map(({ story, characterName }) => (
                      <button
                        key={story.id}
                        type="button"
                        onClick={() => openStory(story.id)}
                        aria-label={`${story.title} · ${characterName}`}
                        className="flex min-w-0 flex-col items-start rounded-lg bg-chrome px-3 py-3 text-left transition-colors hover:bg-elevated-strong"
                      >
                        <span className="w-full truncate text-sm font-medium text-[color:var(--text-body)]" title={story.title}>{story.title}</span>
                        <span className="mt-1 w-full truncate text-[11px] text-[color:var(--text-muted)]" title={characterName}>
                          {characterName} · {story.session.messages.length} 楼 · {focusCopy.action}
                        </span>
                      </button>
                    ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg bg-chrome px-4 py-5 text-center">
                    <p className="text-sm text-[color:var(--text-body)]">{stories.length > 0 ? '没有匹配的故事' : '还没有可以整理的故事'}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {stories.length > 0 ? '换一个标题或角色关键词试试。' : `先导入一份聊天记录，再回来生成${focusCopy.title}。`}
                    </p>
                  </div>
                )}
              </section>
            )}

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

            {/* 客户端专属：复用首页的 ST 扫描与导入逻辑，仅收紧为命令入口 */}
            <div className="flex justify-end">
              <STImportCard variant="compact" onChanged={handleSTChanged} />
            </div>
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
