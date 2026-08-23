/**
 * 首页（10.1-A5/A6 重排，0801 实测反馈）：
 * - 窗口栏：仅首页显示紧凑问候与归档故事数，不再占内容区一整行
 * - 接入 ST 卡：仅客户端且未接入时显示（接入后入口在设置页，10.4 收容）
 * - 左列：4/5 张 2:3 最近角色卡 + 固定三行、双列且内部滚动的最近故事
 * - 右列：单列编辑处理入口 + 独立共享资产区
 * 硬约束：占满一屏且页面本身不滚动（基准 1440×900、100% 缩放）。
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, ArrowRight, BookOpenText, KeyRound, ChevronRight,
  MessagesSquare, BookOpen, IdCard, SlidersHorizontal, MessageSquare,
} from 'lucide-react';
import { isTauri, getAppConfig } from '@/lib/vault/tauri-fs';
import { STAIConfigDialog } from '@/components/tools/STAIConfigDialog';
import { STImportCard } from '@/components/tools/STImportCard';
import { AppLayout } from '@/components/AppLayout';
import { NsfwImage } from '@/components/NsfwImage';
import { CharacterTile } from '@/components/library/CharacterTile';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import { getAllCharacters } from '@/lib/archive-db';
import { listStoryIndex, type StoryIndexEntry } from '@/lib/archive-index';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { introOf } from '@/lib/character-intro';
import { displayCharacterName } from '@/lib/library-query';
import { formatListTime, formatFullTime } from '@/lib/time-display';
import {
  EDITOR_TOOL_COPY,
  horizontalWheelDelta,
  pickRecentlyViewedStories,
} from '@/lib/home-layout';

/** 故事行的下属资源标签计数 */
interface HomeSnapshot {
  readonly characters: ArchiveCharacter[];
  readonly stories: StoryIndexEntry[];
  readonly recentStories: StoryIndexEntry[];
  /** 预留给故事资源徽标，快照结构保持与既有缓存兼容。 */
  readonly resources: Record<string, unknown>;
  readonly assetCounts: { worldbooks: number; presets: number; regexes: number };
}

let homeSnapshot: HomeSnapshot = {
  characters: [],
  stories: [],
  recentStories: [],
  resources: {},
  assetCounts: { worldbooks: 0, presets: 0, regexes: 0 },
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/** 辅助入口按钮化（0801 反馈：pill 样式，视觉权重不再是灰色小字） */
function PillLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-[color:var(--border-normal)] text-[color:var(--text-body)] hover:border-[color:var(--brand-hairline)] hover:text-brand transition-colors shrink-0"
    >
      {label} <ArrowRight className="w-3 h-3" />
    </button>
  );
}

/**
 * 编辑处理区工具列表（0801 反馈 #5：标题+列表化）。
 * 落点与侧栏、编辑区窄栏保持一致：世界书/预设进选择页，不直接进空编辑器
 * （`docs/ui-conventions.md` 三）。
 */
const EDIT_TOOLS = [
  { label: '聊天处理', description: EDITOR_TOOL_COPY.chat, icon: MessagesSquare, path: '/chat' },
  { label: '总结', description: EDITOR_TOOL_COPY.summaryAndTree, icon: BookOpenText, path: '/tools?focus=summary' },
  { label: '世界书', description: EDITOR_TOOL_COPY.worldbook, icon: BookOpen, path: '/tools?focus=worldbook' },
  { label: '角色卡', description: EDITOR_TOOL_COPY.card, icon: IdCard, path: '/card-viewer' },
  { label: '预设', description: EDITOR_TOOL_COPY.preset, icon: SlidersHorizontal, path: '/tools?focus=preset' },
];

const Home = () => {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState(() => homeSnapshot.characters);
  const [stories, setStories] = useState(() => homeSnapshot.stories);
  const [recentStories, setRecentStories] = useState(() => homeSnapshot.recentStories);
  const [resourceSnapshot] = useState(() => homeSnapshot.resources);
  const [assetCounts, setAssetCounts] = useState(() => homeSnapshot.assetCounts);
  const [stConfigOpen, setStConfigOpen] = useState(false);
  /** 整页读失败：必须说出来，否则空态和「数据没了」长得一模一样 */
  const [loadFailed, setLoadFailed] = useState(false);
  const characterWheelSurfaceRef = useRef<HTMLElement>(null);
  const characterRailRef = useRef<HTMLDivElement>(null);
  /** A6：已接入（stRoot 已配置）则不再显示接入卡；null = 还没查完，先不显示防闪烁 */
  const [stConnected, setStConnected] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [chars, allStories, wbs, presets, regexes] = await Promise.all([
        getAllCharacters(),
        listStoryIndex(),
        getAllWorldBooks().catch(() => []),
        getAllPresets().catch(() => []),
        getAllRegexCollections().catch(() => []),
      ]);
      // 最近在看的故事：只列看过的（无记录的还谈不上「最近」），绑定与未绑定都算
      const viewed = pickRecentlyViewedStories(allStories, 12);
      const nextSnapshot: HomeSnapshot = {
        characters: chars,
        stories: allStories,
        recentStories: viewed,
        resources: {},
        assetCounts: { worldbooks: wbs.length, presets: presets.length, regexes: regexes.length },
      };
      homeSnapshot = nextSnapshot;
      setCharacters(nextSnapshot.characters);
      setStories(nextSnapshot.stories);
      setRecentStories(nextSnapshot.recentStories);
      setAssetCounts(nextSnapshot.assetCounts);
      setLoadFailed(false);
    } catch {
      // 整页读失败以前静默显示空态，用户会以为数据丢了（对照 Library 是有明确报错的）
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const refreshStConnected = useCallback(async () => {
    if (!isTauri()) {
      setStConnected(false);
      return;
    }
    const root = await getAppConfig<string>('stRoot').catch(() => null);
    setStConnected(!!root);
  }, []);

  useEffect(() => { void refreshStConnected(); }, [refreshStConnected]);

  const handleSTChanged = useCallback(() => {
    void refreshStConnected();
    void loadData();
  }, [refreshStConnected, loadData]);

  const characterById = Object.fromEntries(characters.map((c) => [c.id, c]));
  /** 每个角色的故事数；角色级最近查看时间单独存于角色档案。 */
  const storyCounts: Record<string, number> = {};
  for (const s of stories) {
    if (!s.characterId) continue;
    storyCounts[s.characterId] = (storyCounts[s.characterId] ?? 0) + 1;
  }
  /** 最近查看的角色 12 张：角色页访问按角色级字段排序，其余按 updatedAt 垫后。 */
  const recentCharacters = [...characters]
    .sort((a, b) => {
      const va = a.lastViewedAt ?? 0;
      const vb = b.lastViewedAt ?? 0;
      if (va !== vb) return vb - va;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, 12);

  useEffect(() => {
    const surface = characterWheelSurfaceRef.current;
    const rail = characterRailRef.current;
    if (!surface || !rail) return undefined;

    const handleWheel = (event: WheelEvent) => {
      if (rail.scrollWidth <= rail.clientWidth) return;
      const delta = horizontalWheelDelta(
        event.deltaX,
        event.deltaY,
        event.deltaMode,
        rail.clientWidth,
      );
      if (delta === 0) return;
      const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
      const nextScrollLeft = Math.min(maxScrollLeft, Math.max(0, rail.scrollLeft + delta));
      if (nextScrollLeft === rail.scrollLeft) return;
      event.preventDefault();
      rail.scrollLeft = nextScrollLeft;
    };

    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, [recentCharacters.length]);

  const ASSET_CELLS = [
    {
      label: '世界书',
      description: '整理世界设定条目与角色关联',
      count: assetCounts.worldbooks,
      onClick: () => navigate('/assets?tab=worldbook'),
    },
    {
      label: '预设',
      description: '复用提示词、顺序和生成参数',
      count: assetCounts.presets,
      onClick: () => navigate('/assets?tab=preset'),
    },
    {
      label: '正则',
      description: '管理聊天清理与替换规则',
      count: assetCounts.regexes,
      onClick: () => navigate('/assets?tab=regex'),
    },
  ];

  return (
    <AppLayout
      titleBarContent={(
        <div className="flex min-w-0 items-baseline gap-2 truncate" data-home-title-summary title={`您已经归档了 ${stories.length} 个故事`}>
          <span className="shrink-0 font-serif text-sm font-semibold text-[color:var(--text-primary)]">{greeting()}</span>
          <span className="truncate text-[11px] text-[color:var(--text-muted)]" title={`您已经归档了 ${stories.length} 个故事`}>您已经归档了 {stories.length} 个故事</span>
        </div>
      )}
    >
      <div className="h-full min-h-0 overflow-hidden flex flex-col px-6 py-4 gap-3.5" data-home-resource-cache={Object.keys(resourceSnapshot).length}>
        {loadFailed && (
          <div
            data-home-load-error
            className="shrink-0 flex items-center justify-between gap-3 rounded-lg border border-[color:var(--border-normal)] bg-chrome px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm text-[color:var(--text-body)]">读取归档失败</p>
              <p className="text-xs text-[color:var(--text-muted)]">下面显示的不是空档案，是这次没读出来。数据仍在库里。</p>
            </div>
            <button
              onClick={() => void loadData()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border border-[color:var(--border-normal)] text-[color:var(--text-body)] hover:border-[color:var(--brand-hairline)] hover:text-brand transition-colors shrink-0"
            >
              重试
            </button>
          </div>
        )}

        {/* 接入 ST 目录：仅客户端且未接入时显示（A6）；网页版组件自隐藏 */}
        {stConnected === false && (
          <div className="shrink-0 empty:hidden">
            <STImportCard onChanged={handleSTChanged} />
          </div>
        )}

        <div
          className="flex-1 min-h-0 grid gap-4 grid-cols-[minmax(0,1fr)_clamp(320px,24vw,400px)]"
          data-home-columns
        >
          {/* ===== 左主列：角色 + 故事 ===== */}
          <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,3fr)_minmax(0,2fr)] gap-3.5" data-home-primary-column>
            {/* ① 最近查看的角色：常规宽度完整显示 4 张，宽屏完整显示 5 张。 */}
            <section
              ref={characterWheelSurfaceRef}
              className="min-h-0 flex flex-col rounded-xl bg-[var(--bg-elevated)] p-4"
              data-tour="home-library"
              data-home-character-wheel-surface
            >
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <h2 className="font-serif text-xl font-semibold tracking-wide text-[color:var(--text-primary)]">
                  最近查看的角色
                  <span className="text-sm text-[color:var(--text-muted)] font-sans font-normal tracking-normal ml-2">
                    共 {characters.length} 张
                  </span>
                </h2>
                <PillLink label="进入角色库" onClick={() => navigate('/library')} />
              </div>
              {recentCharacters.length === 0 ? (
                <div className="flex-1 min-h-0 rounded-xl bg-chrome p-6 flex flex-col items-center justify-center gap-1.5 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">还没有角色卡</p>
                  <p className="text-xs text-muted-foreground/70">去角色库导入 PNG/JSON 角色卡，开始你的收藏</p>
                </div>
              ) : (
                <div
                  ref={characterRailRef}
                  className="flex-1 min-h-0 flex items-center gap-3.5 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-1.5 scrollbar-thin"
                  data-home-character-rail
                >
                  {recentCharacters.map((c) => (
                    <CharacterTile
                      key={c.id}
                      character={c}
                      storyCount={storyCounts[c.id] ?? 0}
                      timestamp={c.lastViewedAt ?? c.updatedAt}
                      nameSize={14}
                      introSize={11}
                      markFontSize={24}
                      className="w-[calc((100%-2.625rem)/4)] 2xl:w-[calc((100%-3.5rem)/5)] shrink-0 self-center"
                      dataAttrs={{ 'data-home-character-card': '' }}
                      onActivate={() => navigate(`/character/${c.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ② 最近在看的故事：占左列两份高度，始终展示三行，更多内容内部滚动。 */}
            <section className="min-h-0 flex flex-col rounded-xl bg-elevated p-4" data-tour="home-recent">
              <div className="shrink-0 mb-2.5 flex items-end justify-between gap-3" data-home-story-heading>
                <h2 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">最近在看的故事</h2>
                <span className="pb-0.5 text-xs text-[color:var(--text-muted)]">滚动查看更多故事。</span>
              </div>
              {recentStories.length === 0 ? (
                <div className="flex-1 min-h-0 rounded-xl bg-elevated-strong p-5 text-center flex flex-col items-center justify-center">
                  <BookOpenText className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">还没有看过的故事</p>
                </div>
              ) : (
                <div
                  className="flex-1 min-h-0 grid grid-cols-2 auto-rows-[calc((100%-1rem)/3)] gap-2 overflow-y-auto pr-1 scrollbar-thin"
                  data-home-story-scroll
                >
                  {recentStories.map((s) => {
                    const char = s.characterId ? characterById[s.characterId] : undefined;
                    return (
                      <button
                        key={s.id}
                        onClick={() => navigate(s.characterId ? `/character/${s.characterId}?story=${s.id}` : `/story/${s.id}`)}
                        className="flex h-full min-h-0 min-w-0 items-center gap-2.5 rounded-lg bg-chrome px-3 py-2.5 text-left transition-colors hover:bg-elevated-strong"
                      >
                        <div className="aspect-[3/4] h-full max-h-14 shrink-0 overflow-hidden rounded bg-[var(--hover-overlay)]">
                          {char?.pngBase64 ? (
                            <NsfwImage src={`data:image/png;base64,${char.pngBase64}`} alt={displayCharacterName(char)} nsfw={char.nsfw} className="h-full w-full object-cover object-top" loading="lazy" />
                          ) : <BookOpenText className="m-2 h-4 w-4 text-muted-foreground/50" />}
                        </div>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[color:var(--text-body)]" title={s.title}>{s.title}</span>
                        <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]">{s.floorCount} 楼</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* ===== 右次列：编辑 + 其他 ===== */}
          <div className="min-w-0 min-h-0 flex flex-col gap-3.5" data-home-secondary-column>
            {/* ③ 编辑处理区：二号位，使用窄栏单列工具入口。 */}
            <section className="flex-[3] min-h-0 flex flex-col rounded-xl bg-elevated p-4" data-tour="home-tools">
              <div className="shrink-0 flex items-start justify-between mb-3 gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-[17px] font-semibold text-[color:var(--text-primary)]">编辑处理区</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
                    从聊天、总结到角色资产，集中完成清理、整理和导出。
                  </p>
                </div>
                <PillLink label="进入编辑区" onClick={() => navigate('/chat')} />
              </div>
              <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-5 gap-2">
                {EDIT_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Tooltip key={tool.label}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => navigate(tool.path)}
                          className="min-h-0 flex items-center gap-2.5 rounded-lg bg-chrome px-3 py-2 text-left transition-colors hover:bg-elevated-strong"
                        >
                          <Icon className="h-4 w-4 shrink-0 text-[color:var(--brand-hi)]" />
                          <div className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-[color:var(--text-body)]">{tool.label}</span>
                            <span className="mt-0.5 block truncate text-[11px] text-[color:var(--text-muted)]" title={tool.description}>{tool.description}</span>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[color:var(--text-faint)]" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-xs leading-relaxed">
                        {tool.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </section>

            {/* ④ 共享资产：保留明确的右列份额，不被编辑入口挤到角落。 */}
            <section className="flex-[2] min-h-0 flex flex-col rounded-xl bg-elevated p-4" data-tour="home-assets">
              <div className="shrink-0 mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-serif text-[17px] font-semibold text-[color:var(--text-primary)]">共享资产</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">世界书、预设和正则是可复用的共享资源。</p>
                </div>
                <PillLink label="打开附属库" onClick={() => navigate('/assets')} />
              </div>
              <div className="flex-1 min-h-0 grid grid-cols-2 auto-rows-fr gap-2">
                {ASSET_CELLS.map((cell) => (
                  <button
                    key={cell.label}
                    onClick={cell.onClick}
                    className="min-h-0 flex items-start justify-between gap-2 rounded-lg bg-chrome px-3 py-3 text-left transition-colors hover:bg-elevated-strong"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-[color:var(--text-body)]">{cell.label}</span>
                      <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]" title={cell.description}>{cell.description}</span>
                    </span>
                    <span className="shrink-0 font-serif text-[17px] font-bold text-[color:var(--text-primary)]">{cell.count}</span>
                  </button>
                ))}
                {isTauri() && (
                  <button
                    onClick={() => setStConfigOpen(true)}
                    className="min-h-0 flex items-start justify-between gap-2 rounded-lg bg-chrome px-3 py-3 text-left transition-colors hover:bg-elevated-strong"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-[color:var(--text-body)]"><KeyRound className="h-3.5 w-3.5 text-[color:var(--text-muted)]" />ST 配置</span>
                      <span className="mt-1 block line-clamp-2 text-[11px] leading-relaxed text-[color:var(--text-muted)]" title="连接 SillyTavern 目录与接口">连接 SillyTavern 目录与接口</span>
                    </span>
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--text-faint)]" />
                  </button>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      <STAIConfigDialog open={stConfigOpen} onOpenChange={setStConfigOpen} />
    </AppLayout>
  );
};

export default Home;
