/** 聊天处理外的编辑区入口选择页：总结/故事树选故事，世界书/预设选资产；全局编辑区导航由 AppLayout 唯一提供。 */
import { useState, useEffect, useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarRange, MessageSquare, Search, UploadCloud } from 'lucide-react';
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
import { guessFileType, TOOL_TYPE_LABELS, type ToolFileType } from '@/lib/file-type-guess';
import { setPendingToolFile } from '@/lib/tool-handoff';
import { getAllArchiveStories } from '@/lib/archive-db';
import { listCharacterIndex, type CharacterIndexEntry } from '@/lib/archive-index';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import {
  buildEditorStoryPickerItems,
  EDITOR_TOOL_COPY,
  storyWorkspaceViewForEditorFocus,
} from '@/lib/home-layout';
import { buildEditorStoryPath, getEditorStoryId, setEditorStoryId } from '@/lib/editor-story-context';
import { LOADING_LABEL } from '@/lib/ui-copy';

interface ToolEntry {
  type: ToolFileType;
  label: string;
  path: string;
}

const TOOLS: ToolEntry[] = [
  { type: 'chat', label: '聊天处理', path: '/chat' },
  { type: 'worldbook', label: '世界书', path: '/worldbook' },
  { type: 'card', label: '角色卡', path: '/card-viewer' },
  { type: 'preset', label: '预设', path: '/preset' },
  { type: 'regex', label: '正则', path: '/regex' },
];

/** 左侧介绍栏的分工具卖点（0816 反馈：选择页左介绍右选择） */
const FOCUS_COPY: Record<string, { title: string; description: string; points: string[]; importLabel: string }> = {
  summary: {
    title: '总结',
    description: EDITOR_TOOL_COPY.summary,
    points: ['分卷总结：按楼层范围提炼剧情', '角色日记：以角色视角回顾经历', 'DIY 创作：用自定义提示词自由生成'],
    importLabel: '导入新聊天',
  },
  'story-tree': {
    title: '故事树',
    description: EDITOR_TOOL_COPY.storyTree,
    points: ['把人物、事件和伏笔整理成脉络', '支持 JSON / Markdown 导入导出', '与聊天处理、总结共用当前故事'],
    importLabel: '导入新聊天',
  },
  worldbook: {
    title: '世界书',
    description: EDITOR_TOOL_COPY.worldbook,
    points: ['编辑条目内容与触发关键词', '导入的世界书自动暂存，可随时切换', '支持 ST 世界书 JSON'],
    importLabel: '导入世界书',
  },
  preset: {
    title: '预设',
    description: EDITOR_TOOL_COPY.preset,
    points: ['调整提示词块与插入顺序', '编辑生成参数与正则规则', '支持 ST 预设 JSON'],
    importLabel: '导入预设',
  },
};

/** 资产选择卡的统一展示模型（世界书/预设共用一套卡片渲染） */
interface AssetPickerItem {
  id: string;
  title: string;
  meta: string;
  importedAt: number;
  updatedAt: number;
  sourceModifiedAt?: number;
  autoSaved?: boolean;
}

function formatStoryDate(value?: number): string {
  if (!value || !Number.isFinite(value)) return '时间未知';
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const Tools = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus');
  const focusView = storyWorkspaceViewForEditorFocus(focus);
  // 世界书/预设走资产选择（0816 二轮反馈：不用再去附属库里找）
  const assetFocus = focus === 'worldbook' || focus === 'preset' ? focus : null;
  const focusCopy = focus ? FOCUS_COPY[focus] ?? null : null;
  const [dragOver, setDragOver] = useState(false);
  // 待确认的文件 + 程序猜测（null = 没猜出来，让用户自己选）
  const [pending, setPending] = useState<{ file: File; guess: ToolFileType | null } | null>(null);
  const [chosenType, setChosenType] = useState<ToolFileType>('chat');
  const [stories, setStories] = useState<ArchiveStory[]>([]);
  const [characters, setCharacters] = useState<CharacterIndexEntry[]>([]);
  const [assetItems, setAssetItems] = useState<AssetPickerItem[]>([]);
  /** 首次读完之前不能显示「还没有可以处理的故事」——那是明确的误导 */
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (assetFocus === 'worldbook') {
        const items = await getAllWorldBooks().catch(() => []);
        setAssetItems(items.map((item) => ({
          id: item.id,
          title: item.title,
          meta: `${Object.keys(item.worldbook.entries).length} 个条目`,
          importedAt: item.createdAt,
          updatedAt: item.updatedAt,
          sourceModifiedAt: item.sourceModifiedAt,
          autoSaved: item.autoSaved,
        })));
        return;
      }
      if (assetFocus === 'preset') {
        const items = await getAllPresets().catch(() => []);
        setAssetItems(items.map((item) => ({
          id: item.id,
          title: item.title,
          meta: `${item.preset.prompts.length} 个提示词`,
          importedAt: item.createdAt,
          updatedAt: item.updatedAt,
          sourceModifiedAt: item.sourceModifiedAt,
          autoSaved: item.autoSaved,
        })));
        return;
      }
      // 故事这边仍要完整读：选择器要按消息时间戳算游玩起止（computeStoryTimeRange），
      // 楼数与标题之外真的用到了正文。角色只用到 id→名字，走轻量列表。
      const [stories, cards] = await Promise.all([
        getAllArchiveStories().catch(() => []),
        listCharacterIndex().catch(() => []),
      ]);
      const sortedStories = [...stories]
        .sort((a, b) => (b.lastViewedAt ?? b.updatedAt) - (a.lastViewedAt ?? a.updatedAt));
      setStories(sortedStories);
      setCharacters(cards);
    } finally {
      setLoading(false);
    }
  }, [assetFocus]);

  useEffect(() => { void loadData(); }, [loadData]);

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
    if (!focusView) return;
    setEditorStoryId(storyId);
    navigate(buildEditorStoryPath(storyId, focusView));
  }, [focusView, navigate]);

  // 资产用附属库同款 ?assetId= 深链打开编辑器
  const openAsset = useCallback((assetId: string) => {
    if (!assetFocus) return;
    const toolPath = assetFocus === 'worldbook' ? '/worldbook' : '/preset';
    navigate(`${toolPath}?assetId=${encodeURIComponent(assetId)}`);
  }, [assetFocus, navigate]);

  const storyPickerItems = buildEditorStoryPickerItems(stories, characters, query);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredAssetItems = normalizedQuery
    ? assetItems.filter((item) => item.title.toLocaleLowerCase().includes(normalizedQuery))
    : assetItems;
  // 「继续上次」：故事入口共用同一个当前故事，进来先给一键续接（0816 反馈）
  const currentStoryId = getEditorStoryId();
  const lastStory = !assetFocus && currentStoryId ? stories.find((story) => story.id === currentStoryId) : undefined;
  const listTotal = assetFocus ? assetItems.length : stories.length;

  // 编辑区一级入口沿用 7 月 26 日前的直接工作台模式；本页仅承载正式入口的选择器。
  if (!focusView && !assetFocus) return <Navigate to="/chat" replace />;

  return (
    <AppLayout>
      <div
        className="relative h-full min-h-0 overflow-hidden px-5 py-4"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false); }}
        onDrop={handleDrop}
      >
        <input
          id="tools-file-input"
          type="file"
          accept=".jsonl,.json,.txt,.png"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
        />

        {focusCopy && (
          <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-nowrap overflow-hidden items-stretch gap-4 animate-fade-in">
            {/* ===== 左：功能介绍与导入说明 ===== */}
            <aside className="flex min-h-0 basis-[16.5rem] grow-0 shrink-0 flex-col gap-3 rounded-lg border border-[color:var(--border-normal)] bg-elevated p-4">
              <div className="shrink-0">
                <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">
                  {focusCopy.title}
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
                  {focusCopy.description}
                </p>
              </div>
              <ul className="space-y-1.5 text-xs text-[color:var(--text-body)]">
                {focusCopy.points.map((point) => (
                  <li key={point} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-accent" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto shrink-0 rounded-md bg-chrome p-3">
                <p className="text-xs font-medium text-[color:var(--text-primary)]">支持导入</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--text-muted)]">
                  聊天记录 (.jsonl/.json/.txt) · 角色卡 (.png/.json) · 世界书 / 预设 / 正则 (.json)
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">把文件拖进本页任意位置即可开始。</p>
              </div>
            </aside>

            {/* ===== 右：选择或导入 ===== */}
            <section
              className="flex min-h-0 min-w-[24rem] flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--border-normal)] bg-elevated p-4"
              data-editor-story-picker
              data-editor-focus={focus}
            >
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">
                    {assetFocus ? `选择要编辑的${focusCopy.title}` : '选择要处理的故事'}
                  </h2>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {assetFocus ? '按最近更新排序，点击直接进入编辑器。' : '默认显示最近 10 个故事，更早内容可通过搜索找到。'}
                  </p>
                </div>
                {/* 0816 反馈：导入直接选文件（也可整页拖入），不再跳走 */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-tour="tools-dropzone"
                  onClick={() => document.getElementById('tools-file-input')?.click()}
                >
                  <UploadCloud className="mr-1.5 h-4 w-4" />
                  {focusCopy.importLabel}
                </Button>
              </div>
              {lastStory && !normalizedQuery && (
                <button
                  type="button"
                  onClick={() => openStory(lastStory.id)}
                  className="mt-3 flex w-full shrink-0 items-center gap-2 rounded-md border border-[color:var(--brand-hairline)] bg-chrome px-3 py-2 text-left transition-colors hover:bg-elevated-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="shrink-0 rounded bg-[var(--brand-active-bg)] px-1.5 py-0.5 text-[11px] text-brand">继续上次</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--text-body)]" title={lastStory.title}>{lastStory.title}</span>
                  <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">{lastStory.session.messages.length} 楼</span>
                </button>
              )}
              {listTotal > 0 && (
                <div className="mt-3 flex shrink-0 items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--text-muted)]" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={assetFocus ? `搜索${focusCopy.title}标题` : '搜索故事或角色'}
                      aria-label={assetFocus ? `搜索${focusCopy.title}标题` : '搜索故事或角色'}
                      className="w-full rounded-md border border-[color:var(--border-normal)] bg-chrome py-2 pl-9 pr-3 text-xs text-[color:var(--text-body)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-brand focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">
                    {assetFocus
                      ? (normalizedQuery ? `${filteredAssetItems.length}/${assetItems.length}` : `共 ${assetItems.length}`) + ` 份${focusCopy.title}`
                      : (normalizedQuery ? `${storyPickerItems.length}/${stories.length}` : `最近 ${storyPickerItems.length}`) + ' 个故事'}
                  </span>
                </div>
              )}

              {assetFocus ? (
                filteredAssetItems.length > 0 ? (
                  <div
                    data-asset-scroll-region
                    className="mt-3 min-h-0 flex-1 overflow-y-scroll overscroll-contain pr-1 scrollbar-thin"
                  >
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-2">
                    {filteredAssetItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openAsset(item.id)}
                        aria-label={item.title}
                        className="flex min-w-0 flex-col items-start rounded-md border border-transparent bg-chrome px-3 py-2.5 text-left transition-colors hover:border-[color:var(--brand-hairline)] hover:bg-elevated-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex w-full items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--text-body)]" title={item.title}>{item.title}</span>
                          {item.autoSaved && (
                            <span className="shrink-0 rounded bg-chrome px-1.5 py-0.5 text-[10px] text-[color:var(--text-muted)] ring-1 ring-[color:var(--border-normal)]">历史</span>
                          )}
                        </span>
                        <span className="mt-1 flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-muted)]">
                          <span>{item.meta}</span>
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            <CalendarRange className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {item.sourceModifiedAt !== undefined ? `源文件 ${formatStoryDate(item.sourceModifiedAt)}` : `STE 更新 ${formatStoryDate(item.updatedAt)}`}
                            </span>
                          </span>
                          {item.sourceModifiedAt !== undefined && <span>导入 {formatStoryDate(item.importedAt)}</span>}
                        </span>
                      </button>
                    ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg bg-chrome px-4 py-5 text-center">
                    <p className="text-sm text-[color:var(--text-body)]">{assetItems.length > 0 ? '没有匹配的结果' : `还没有保存的${focusCopy.title}`}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                      {assetItems.length > 0 ? '换一个标题关键词试试。' : `点「${focusCopy.importLabel}」，或把 JSON 文件直接拖进本页。`}
                    </p>
                  </div>
                )
              ) : storyPickerItems.length > 0 ? (
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-2">
                  {storyPickerItems.map(({ story, characterName, floorCount, startedAt, endedAt }) => (
                    <button
                      key={story.id}
                      type="button"
                      onClick={() => openStory(story.id)}
                      aria-label={`${story.title} · ${characterName}`}
                      className="flex min-w-0 flex-col items-start rounded-md border border-transparent bg-chrome px-3 py-2.5 text-left transition-colors hover:border-[color:var(--brand-hairline)] hover:bg-elevated-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="w-full truncate text-sm font-medium text-[color:var(--text-body)]" title={story.title}>{story.title}</span>
                      <span className="mt-1 w-full truncate text-xs text-[color:var(--text-muted)]" title={characterName}>所属角色：{characterName}</span>
                      <span className="mt-1 flex w-full items-center gap-3 text-[11px] text-[color:var(--text-muted)]">
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{floorCount} 楼</span>
                        <span className="flex min-w-0 items-center gap-1 truncate" title={`${formatStoryDate(startedAt)} - ${formatStoryDate(endedAt)}`}>
                          <CalendarRange className="h-3 w-3 shrink-0" />
                          <span className="truncate">{formatStoryDate(startedAt)} - {formatStoryDate(endedAt)}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                  </div>
                </div>
              ) : loading ? (
                <div
                  data-story-picker-loading
                  className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg bg-chrome px-4 py-5 text-center"
                >
                  <p className="text-sm text-[color:var(--text-muted)]">{LOADING_LABEL}</p>
                </div>
              ) : (
                <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg bg-chrome px-4 py-5 text-center">
                  <p className="text-sm text-[color:var(--text-body)]">{stories.length > 0 ? '没有匹配的故事' : '还没有可以处理的故事'}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                    {stories.length > 0 ? '换一个标题或角色关键词试试。' : '点右上角「导入新聊天」，或把文件直接拖进本页。'}
                  </p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* 整页拖入的落点提示（视觉层不吃事件，drop 由外层容器处理） */}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center border-2 border-dashed border-brand bg-[var(--brand-active-bg)]">
            <div className="rounded-lg bg-elevated px-6 py-4 text-center shadow-lg">
              <UploadCloud className="mx-auto h-7 w-7 text-brand" />
              <p className="mt-2 text-sm font-medium text-[color:var(--text-primary)]">松开导入文件</p>
              <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">聊天记录 · 角色卡 · 世界书 / 预设 / 正则</p>
            </div>
          </div>
        )}
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
