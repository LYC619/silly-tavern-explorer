/**
 * 首页（10.1-A5/A6 重排，0801 实测反馈）：
 * - 问候行：问候 + 欢迎语「您已经归档了 N 个故事」（替代高密度的上次离开信息）
 * - 接入 ST 卡：仅客户端且未接入时显示（接入后入口在设置页，10.4 收容）
 * - 左主列：最近查看的角色（横滚最近 12 张，卡面样式对齐角色库：简介/故事数/评分）
 *   → 最近在看的故事（整行列表，最多 6 条，不再两列留白）
 * - 右列 300px：编辑处理区（标题+工具列表）→ 其他资产（统计格）
 * 硬约束：一屏无滚动（基准 1440×900、100% 缩放），超出内容走「查看全部」进二级页。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, ArrowRight, MessageSquare, Cpu, BookOpenText, KeyRound, ChevronRight,
  MessagesSquare, BookOpen, IdCard, SlidersHorizontal, LayoutGrid,
} from 'lucide-react';
import { isTauri, getAppConfig } from '@/lib/vault/tauri-fs';
import { STAIConfigDialog } from '@/components/tools/STAIConfigDialog';
import { STImportCard } from '@/components/tools/STImportCard';
import { AppLayout } from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { NsfwImage } from '@/components/NsfwImage';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import { getAllCharacters, getAllArchiveStories } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { getAllSummaries } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';
import { introOf } from '@/lib/character-intro';
import { displayCharacterName } from '@/lib/library-query';
import { formatListTime, formatFullTime } from '@/lib/time-display';

/** 故事行的下属资源标签计数 */
interface StoryResources {
  summaries: number;
  diaries: number;
  trees: number;
}

interface HomeSnapshot {
  readonly characters: ArchiveCharacter[];
  readonly stories: ArchiveStory[];
  readonly recentStories: ArchiveStory[];
  readonly resources: Record<string, StoryResources>;
  readonly assetCounts: { worldbooks: number; presets: number; regexes: number };
}

let homeSnapshot: HomeSnapshot = {
  characters: [],
  stories: [],
  recentStories: [],
  resources: {},
  assetCounts: { worldbooks: 0, presets: 0, regexes: 0 },
};

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

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

/** 编辑处理区工具列表（0801 反馈 #5：标题+列表化） */
const EDIT_TOOLS = [
  { label: '聊天记录', icon: MessagesSquare, path: '/chat' },
  { label: '世界书', icon: BookOpen, path: '/worldbook' },
  { label: '角色卡', icon: IdCard, path: '/card-viewer' },
  { label: '预设', icon: SlidersHorizontal, path: '/preset' },
  { label: '其他', icon: LayoutGrid, path: '/tools' },
];

const Home = () => {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState(() => homeSnapshot.characters);
  const [stories, setStories] = useState(() => homeSnapshot.stories);
  const [recentStories, setRecentStories] = useState(() => homeSnapshot.recentStories);
  const [resources, setResources] = useState(() => homeSnapshot.resources);
  const [assetCounts, setAssetCounts] = useState(() => homeSnapshot.assetCounts);
  const [stConfigOpen, setStConfigOpen] = useState(false);
  /** A6：已接入（stRoot 已配置）则不再显示接入卡；null = 还没查完，先不显示防闪烁 */
  const [stConnected, setStConnected] = useState<boolean | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [chars, allStories, wbs, presets, regexes, summaries, trees] = await Promise.all([
        getAllCharacters(),
        getAllArchiveStories(),
        getAllWorldBooks().catch(() => []),
        getAllPresets().catch(() => []),
        getAllRegexCollections().catch(() => []),
        getAllSummaries().catch(() => []),
        getAllStoryTrees().catch(() => []),
      ]);
      // 最近在看的故事：只列看过的（无记录的还谈不上「最近」），绑定与未绑定都算
      const viewed = allStories
        .filter((s) => s.lastViewedAt !== undefined)
        .sort((a, b) => b.lastViewedAt! - a.lastViewedAt!)
        .slice(0, 6);
      const res: Record<string, StoryResources> = {};
      for (const s of viewed) {
        res[s.id] = {
          summaries: summaries.filter((x) => x.bookId === s.id && x.kind !== 'diary').length,
          diaries: summaries.filter((x) => x.bookId === s.id && x.kind === 'diary').length,
          trees: trees.filter((x) => x.bookId === s.id).length,
        };
      }
      const nextSnapshot: HomeSnapshot = {
        characters: chars,
        stories: allStories,
        recentStories: viewed,
        resources: res,
        assetCounts: { worldbooks: wbs.length, presets: presets.length, regexes: regexes.length },
      };
      homeSnapshot = nextSnapshot;
      setCharacters(nextSnapshot.characters);
      setStories(nextSnapshot.stories);
      setRecentStories(nextSnapshot.recentStories);
      setResources(nextSnapshot.resources);
      setAssetCounts(nextSnapshot.assetCounts);
    } catch { /* 首页加载失败不弹错，各区显示空态 */ }
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

  const STAT_CELLS = [
    { label: '角色卡', count: characters.length, onClick: () => navigate('/library') },
    { label: '故事', count: stories.length, onClick: () => navigate('/library') },
    { label: '世界书', count: assetCounts.worldbooks, onClick: () => navigate('/assets?tab=worldbook') },
    { label: '预设', count: assetCounts.presets, onClick: () => navigate('/assets?tab=preset') },
    { label: '正则', count: assetCounts.regexes, onClick: () => navigate('/assets?tab=regex') },
  ];

  return (
    <AppLayout>
      <div className="h-full overflow-hidden flex flex-col px-6 py-4 gap-3.5">
        {/* 问候行：欢迎语只报归档数（0801 反馈 #8：原「书名+楼层+时间」信息密度高且与功能区重复） */}
        <div className="shrink-0 flex items-baseline gap-3.5 flex-wrap">
          <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">{greeting()}</h1>
          <span className="text-xs text-[color:var(--text-muted)]">
            您已经归档了 {stories.length} 个故事
          </span>
        </div>

        {/* 接入 ST 目录：仅客户端且未接入时显示（A6）；网页版组件自隐藏 */}
        {stConnected === false && (
          <div className="shrink-0 empty:hidden">
            <STImportCard onChanged={handleSTChanged} />
          </div>
        )}

        <div className="flex-1 min-h-0 flex gap-4">
          {/* ===== 左主列 ===== */}
          <div className="flex-1 min-w-0 flex flex-col gap-3.5">
            {/* ① 最近查看的角色：区域内横滚最近 12 张（0801 反馈 #3/#11） */}
            <section className="shrink-0" data-tour="home-library">
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <h3 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">
                  最近查看的角色
                  <span className="text-xs text-[color:var(--text-muted)] font-sans font-normal ml-1.5">
                    共 {characters.length} 张
                  </span>
                </h3>
                <PillLink label="进入角色库" onClick={() => navigate('/library')} />
              </div>
              {recentCharacters.length === 0 ? (
                <div className="rounded-xl bg-elevated p-6 flex flex-col items-center gap-1.5 text-center">
                  <Users className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">还没有角色卡</p>
                  <p className="text-xs text-muted-foreground/70">去角色库导入 PNG/JSON 角色卡，开始你的收藏</p>
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto overflow-y-hidden pb-1.5 scrollbar-thin">
                  {recentCharacters.map((c) => {
                    const intro = introOf(c);
                    const displayName = displayCharacterName(c);
                    const timeTs = c.lastViewedAt ?? c.updatedAt;
                    return (
                      <button
                        key={c.id}
                        onClick={() => navigate(`/character/${c.id}`)}
                        className="relative w-[148px] shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-elevated transition-transform duration-200 hover:-translate-y-0.5 text-left"
                      >
                        {c.pngBase64 ? (
                          <NsfwImage
                            src={`data:image/png;base64,${c.pngBase64}`}
                            alt={displayName}
                            nsfw={c.nsfw}
                            className="absolute inset-0 w-full h-full object-cover object-top"
                            loading="lazy"
                          />
                        ) : (
                          <div className={`absolute inset-0 art art-placeholder-${(hashName(c.name) % 13) + 1}`}>
                            <div className="char-mark" style={{ fontSize: 24 }}>{displayName.slice(0, 1)}</div>
                          </div>
                        )}
                        {/* 顶部右角：故事数角标（对齐角色库卡面） */}
                        {(storyCounts[c.id] ?? 0) > 0 && (
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md text-[10px] bg-black/60 text-white/90 backdrop-blur-sm">
                            {storyCounts[c.id]} 段故事
                          </span>
                        )}
                        {/* 底部渐变信息条（对齐角色库：名字 → 简介 → 评分/时间） */}
                        <div className="absolute left-0 right-0 bottom-0 px-2.5 pb-2 pt-8 bg-[linear-gradient(transparent,rgba(0,0,0,0.75)_40%,rgba(0,0,0,0.92))]">
                          <p className="font-serif text-xs font-semibold text-white truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]" title={displayName}>{displayName}</p>
                          {intro && (
                            <p className="text-[11px] leading-snug text-white/70 line-clamp-2 mt-0.5">{intro}</p>
                          )}
                          <div className="flex items-center justify-between mt-1 text-[11px]">
                            <span className="font-semibold text-[color:var(--brand-hi)]">
                              {c.rating !== undefined ? `★ ${c.rating}` : '未评分'}
                            </span>
                            <span className="text-white/55" title={formatFullTime(timeTs)}>{formatListTime(timeTs)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ② 最近在看的故事：整行列表（0801 反馈 3.1：两列卡占整行留白 → 改行式布局） */}
            <section className="flex-1 min-h-0 flex flex-col" data-tour="home-recent">
              <div className="flex items-center justify-between mb-2.5 shrink-0">
                <h3 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">最近在看的故事</h3>
              </div>
              {recentStories.length === 0 ? (
                <div className="rounded-xl bg-elevated p-6 flex flex-col items-center gap-1.5 text-center">
                  <BookOpenText className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">还没有看过的故事</p>
                  <p className="text-xs text-muted-foreground/70">从角色卡进入故事，这里会记下你上次读到哪，方便随时回味</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
                  {recentStories.map((s) => {
                    const char = s.characterId ? characterById[s.characterId] : undefined;
                    const res = resources[s.id];
                    return (
                      <button
                        key={s.id}
                        onClick={() => navigate(s.characterId
                          // 10.3b：已绑定角色 → 角色页就地阅读；未绑定仍进工作区
                          ? `/character/${s.characterId}?story=${s.id}`
                          : `/story/${s.id}`)}
                        className="shrink-0 rounded-xl bg-elevated-strong hover:bg-elevated transition-colors px-3.5 py-2.5 text-left flex gap-3 items-center min-w-0"
                      >
                        <div className="w-9 h-12 shrink-0 rounded-md overflow-hidden bg-[var(--hover-overlay)]">
                          {char?.pngBase64 ? (
                            <NsfwImage
                              src={`data:image/png;base64,${char.pngBase64}`}
                              alt={displayCharacterName(char)}
                              nsfw={char.nsfw}
                              className="w-full h-full object-cover object-top"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <BookOpenText className="w-4 h-4 text-muted-foreground/50" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-[13px] font-semibold text-[color:var(--text-primary)] truncate" title={s.title}>
                            {s.title}
                          </p>
                          <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                            {char && <span className="truncate max-w-32">{displayCharacterName(char)}</span>}
                            {!s.characterId && <Badge variant="outline" className="h-4 px-1 text-[10px]">未绑定</Badge>}
                            <span className="flex items-center gap-0.5">
                              <MessageSquare className="w-3 h-3" />{s.session.messages.length} 楼
                            </span>
                            {s.meta.lastModel && (
                              <span className="flex items-center gap-0.5 min-w-0">
                                <Cpu className="w-3 h-3 shrink-0" /><span className="truncate max-w-32">{s.meta.lastModel}</span>
                              </span>
                            )}
                            {res && res.summaries > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">总结 {res.summaries}</Badge>}
                            {res && res.diaries > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">日记 {res.diaries}</Badge>}
                            {res && res.trees > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">故事树 {res.trees}</Badge>}
                            {(s.branches?.length ?? 0) > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">分支 {s.branches!.length}</Badge>}
                          </p>
                        </div>
                        {s.lastViewedAt !== undefined && (
                          <span className="shrink-0 text-[11px] text-[color:var(--text-muted)]" title={formatFullTime(s.lastViewedAt)}>{formatListTime(s.lastViewedAt)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* ===== 右列 300px ===== */}
          <div className="w-[300px] shrink-0 flex flex-col gap-3 min-h-0">
            {/* ③ 编辑处理区：标题 + 工具列表（0801 反馈 #5） */}
            <section className="shrink-0 rounded-xl bg-elevated p-4" data-tour="home-tools">
              <div className="flex items-center justify-between mb-2.5 gap-2">
                <p className="font-serif text-[15px] font-semibold text-[color:var(--text-primary)]">编辑处理区</p>
                <PillLink label="进入编辑区" onClick={() => navigate('/tools')} />
              </div>
              <div className="flex flex-col gap-1">
                {EDIT_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <button
                      key={tool.label}
                      onClick={() => navigate(tool.path)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[color:var(--text-body)] bg-chrome hover:bg-elevated-strong transition-colors"
                    >
                      <Icon className="w-4 h-4 text-[color:var(--text-muted)]" />
                      <span className="flex-1 text-left">{tool.label}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-[color:var(--text-faint)]" />
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ④ 其他资产：统计格（0801 反馈 #6：「你的资产」改名） */}
            <section className="shrink-0 rounded-xl bg-elevated p-4" data-tour="home-assets">
              <p className="text-xs tracking-widest text-[color:var(--text-muted)] mb-2.5">其他资产</p>
              <div className="grid grid-cols-2 gap-2">
                {STAT_CELLS.map((cell) => (
                  <button
                    key={cell.label}
                    onClick={cell.onClick}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-chrome text-xs text-[color:var(--text-body)] hover:bg-elevated-strong transition-colors"
                  >
                    <span>{cell.label}</span>
                    <span className="font-serif font-bold text-[15px] text-[color:var(--text-primary)]">{cell.count}</span>
                  </button>
                ))}
                {/* ST 配置（仅客户端）：用户在 ST 使用的 AI 连接概况，只读快照 */}
                {isTauri() && (
                  <button
                    onClick={() => setStConfigOpen(true)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-chrome text-xs text-[color:var(--text-body)] hover:bg-elevated-strong transition-colors"
                  >
                    <span className="flex items-center gap-1.5"><KeyRound className="w-3.5 h-3.5 text-muted-foreground" />ST 配置</span>
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
