/**
 * 首页（2.1-P4，按新前端交接包 demo ① 重排；内容沿用定稿四块语义，无「继续游玩」）：
 * - 顶部：问候 + 接入 SillyTavern 目录卡（红线：显眼置顶，不进侧栏；网页版组件自隐藏）
 * - 左主列：最近查看的故事（story-continue-card 两列）→ 你的角色库（4 张 2:3 精选卡）
 * - 右列 300px：编辑区拖放入口（drop-panel）→ 其他资产统计格（stat-panel）
 * 硬约束：一屏无滚动（基准 1440×900、100% 缩放），超出内容走「查看全部」进二级页。
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UploadCloud, ArrowRight, MessageSquare, Cpu, BookOpenText, KeyRound,
} from 'lucide-react';
import { isTauri } from '@/lib/vault/tauri-fs';
import { STAIConfigDialog } from '@/components/tools/STAIConfigDialog';
import { STImportCard } from '@/components/tools/STImportCard';
import { AppLayout } from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import { getAllCharacters, getAllArchiveStories, getLastViewedLine } from '@/lib/archive-db';
import { getAllWorldBooks } from '@/lib/worldbook-db';
import { getAllPresets } from '@/lib/preset-db';
import { getAllRegexCollections } from '@/lib/regex-db';
import { getAllSummaries } from '@/lib/summary-db';
import { getAllStoryTrees } from '@/lib/story-tree-db';

/** 故事行的下属资源标签计数 */
interface StoryResources {
  summaries: number;
  diaries: number;
  trees: number;
}

function relativeTime(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

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

const Home = () => {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [recentStories, setRecentStories] = useState<ArchiveStory[]>([]);
  const [resources, setResources] = useState<Record<string, StoryResources>>({});
  const [assetCounts, setAssetCounts] = useState({ worldbooks: 0, presets: 0, regexes: 0, stories: 0 });
  const [stConfigOpen, setStConfigOpen] = useState(false);
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const [chars, stories, wbs, presets, regexes, summaries, trees] = await Promise.all([
        getAllCharacters(),
        getAllArchiveStories(),
        getAllWorldBooks().catch(() => []),
        getAllPresets().catch(() => []),
        getAllRegexCollections().catch(() => []),
        getAllSummaries().catch(() => []),
        getAllStoryTrees().catch(() => []),
      ]);
      setCharacters(chars);
      // 最近查看的故事：只列看过的（无记录的还谈不上「最近查看」），绑定与未绑定都算
      const viewed = stories
        .filter((s) => s.lastViewedAt !== undefined)
        .sort((a, b) => b.lastViewedAt! - a.lastViewedAt!)
        .slice(0, 4);
      setRecentStories(viewed);
      const res: Record<string, StoryResources> = {};
      for (const s of viewed) {
        res[s.id] = {
          summaries: summaries.filter((x) => x.bookId === s.id && x.kind !== 'diary').length,
          diaries: summaries.filter((x) => x.bookId === s.id && x.kind === 'diary').length,
          trees: trees.filter((x) => x.bookId === s.id).length,
        };
      }
      setResources(res);
      setAssetCounts({ worldbooks: wbs.length, presets: presets.length, regexes: regexes.length, stories: stories.length });
    } catch { /* 首页加载失败不弹错，各区显示空态 */ }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSTChanged = useCallback(() => {
    setStatusRefreshKey((key) => key + 1);
    void loadData();
  }, [loadData]);

  const characterById = Object.fromEntries(characters.map((c) => [c.id, c]));
  /** 精选 4 张：最近有动静的（updatedAt），入口性质 */
  const featured = [...characters].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const lastViewed = recentStories[0];
  const lastViewedFloor = lastViewed ? getLastViewedLine(lastViewed).line.lastFloor : undefined;

  const STAT_CELLS = [
    { label: '角色卡', count: characters.length, onClick: () => navigate('/library') },
    { label: '故事', count: assetCounts.stories, onClick: () => navigate('/library') },
    { label: '世界书', count: assetCounts.worldbooks, onClick: () => navigate('/assets?tab=worldbook') },
    { label: '预设', count: assetCounts.presets, onClick: () => navigate('/assets?tab=preset') },
    { label: '正则', count: assetCounts.regexes, onClick: () => navigate('/assets?tab=regex') },
  ];

  return (
    <AppLayout statusRefreshKey={statusRefreshKey}>
      <div className="h-full overflow-hidden flex flex-col px-6 py-4 gap-3.5">
        {/* 问候行（demo .main-header：真实数据——上次离开的故事） */}
        <div className="shrink-0 flex items-baseline gap-3.5 flex-wrap">
          <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">{greeting()}</h1>
          {lastViewed?.lastViewedAt !== undefined && (
            <span className="text-[11px] text-[color:var(--text-muted)] truncate">
              你上次在 {relativeTime(lastViewed.lastViewedAt)}离开《{lastViewed.title}》
              {typeof lastViewedFloor === 'number' ? ` · 第 ${lastViewedFloor} 楼` : ''}
            </span>
          )}
        </div>

        {/* 接入 ST 目录：首页顶部显眼卡（客户端；网页版组件自隐藏） */}
        <div className="shrink-0 empty:hidden">
          <STImportCard onChanged={handleSTChanged} />
        </div>

        <div className="flex-1 min-h-0 flex gap-4">
          {/* ===== 左主列 ===== */}
          <div className="flex-1 min-w-0 flex flex-col gap-3.5">
            {/* ② 最近查看的故事 */}
            <section className="shrink-0" data-tour="home-recent">
              <div className="flex items-baseline justify-between mb-2.5">
                <h3 className="font-serif text-[15px] font-semibold text-[color:var(--text-primary)]">
                  最近查看的故事
                  {recentStories.length > 0 && (
                    <span className="text-[11px] text-[color:var(--text-faint)] font-sans font-normal ml-1.5">
                      回味入口 · 记住你读到哪
                    </span>
                  )}
                </h3>
              </div>
              {recentStories.length === 0 ? (
                <div className="rounded-xl bg-elevated p-6 flex flex-col items-center gap-1.5 text-center">
                  <BookOpenText className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">还没有看过的故事</p>
                  <p className="text-xs text-muted-foreground/70">从角色卡进入故事，这里会记下你上次读到哪，方便随时回味</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {recentStories.map((s) => {
                    const char = s.characterId ? characterById[s.characterId] : undefined;
                    const res = resources[s.id];
                    return (
                      <button
                        key={s.id}
                        onClick={() => navigate(`/story/${s.id}`)}
                        className="rounded-xl bg-elevated-strong hover:bg-elevated transition-colors p-3.5 text-left flex gap-3 items-center min-w-0"
                      >
                        {/* 角色封面缩略（demo .story-thumb 44×60），未绑定给占位 */}
                        <div className="w-11 h-[60px] shrink-0 rounded-md overflow-hidden bg-[var(--hover-overlay)]">
                          {char?.pngBase64 ? (
                            <img
                              src={`data:image/png;base64,${char.pngBase64}`}
                              alt={char.name}
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
                          <p className="text-[10.5px] text-[color:var(--text-muted)] mt-0.5 truncate flex items-center gap-1.5">
                            {char && <span className="truncate">{char.name}</span>}
                            {!s.characterId && <Badge variant="outline" className="h-4 px-1 text-[10px]">未绑定</Badge>}
                            {s.meta.lastModel && (
                              <span className="flex items-center gap-0.5 min-w-0">
                                <Cpu className="w-3 h-3 shrink-0" /><span className="truncate max-w-28">{s.meta.lastModel}</span>
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-[color:var(--text-muted)] mt-1 flex items-center gap-1.5 flex-wrap">
                            <span className="flex items-center gap-0.5">
                              <MessageSquare className="w-3 h-3" />{s.session.messages.length} 楼
                            </span>
                            {s.lastViewedAt !== undefined && <span>{relativeTime(s.lastViewedAt)}</span>}
                            {res && res.summaries > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">总结 {res.summaries}</Badge>}
                            {res && res.diaries > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">日记 {res.diaries}</Badge>}
                            {res && res.trees > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">故事树 {res.trees}</Badge>}
                            {(s.branches?.length ?? 0) > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">分支 {s.branches!.length}</Badge>}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ① 你的角色库：4 张 2:3 精选卡（ST 标准比例，入口性质） */}
            <section className="flex-1 min-h-0 flex flex-col" data-tour="home-library">
              <div className="flex items-baseline justify-between mb-2.5 shrink-0">
                <h3 className="font-serif text-[15px] font-semibold text-[color:var(--text-primary)]">
                  你的角色库
                  <span className="text-[11px] text-[color:var(--text-muted)] font-sans font-normal ml-1.5">
                    {characters.length} 张{featured.length > 0 ? ' · 最近有动静的 4 张' : ''}
                  </span>
                </h3>
                <button
                  className="text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)] flex items-center gap-1"
                  onClick={() => navigate('/library')}
                >
                  进入角色库 <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              {featured.length === 0 ? (
                <div className="flex-1 rounded-xl bg-elevated flex flex-col items-center justify-center gap-1.5 text-center p-6">
                  <Users className="w-10 h-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">还没有角色卡</p>
                  <p className="text-xs text-muted-foreground/70">去角色库导入 PNG/JSON 角色卡，开始你的收藏</p>
                </div>
              ) : (
                <div className="flex-1 min-h-0 grid grid-cols-4 gap-3 content-start overflow-hidden">
                  {featured.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => navigate(`/character/${c.id}`)}
                      className="relative self-start w-full aspect-[2/3] rounded-xl overflow-hidden bg-elevated transition-transform duration-200 hover:-translate-y-0.5 text-left"
                    >
                      {c.pngBase64 ? (
                        <img
                          src={`data:image/png;base64,${c.pngBase64}`}
                          alt={c.name}
                          className="absolute inset-0 w-full h-full object-cover object-top"
                          loading="lazy"
                        />
                      ) : (
                        <div className={`absolute inset-0 art art-placeholder-${(hashName(c.name) % 13) + 1}`}>
                          <div className="char-mark" style={{ fontSize: 24 }}>{c.name.slice(0, 1)}</div>
                        </div>
                      )}
                      <div className="absolute left-0 right-0 bottom-0 px-3 pb-2.5 pt-8 bg-[linear-gradient(transparent,rgba(0,0,0,0.75)_40%,rgba(0,0,0,0.92))]">
                        <p className="font-serif text-xs font-semibold text-white truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">{c.name}</p>
                        <div className="flex items-center justify-between mt-1 text-[10px]">
                          <span className="font-semibold text-[color:var(--brand-hi)]">
                            ★ {c.rating !== undefined ? c.rating : '-'}
                          </span>
                          <span className="text-white/50">{relativeTime(c.updatedAt)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* ===== 右列 300px ===== */}
          <div className="w-[300px] shrink-0 flex flex-col gap-3 min-h-0">
            {/* ③ 编辑区入口：拖放面板（demo .drop-panel） */}
            <section
              className="shrink-0 rounded-xl bg-elevated border-[1.5px] border-dashed border-[color:var(--border-normal)] px-4 py-[18px] text-center cursor-pointer hover:border-[color:var(--brand-hairline)] transition-colors"
              onClick={() => navigate('/tools')}
              data-tour="home-tools"
            >
              <div className="w-10 h-10 mx-auto mb-2.5 rounded-full bg-[var(--brand-active-bg)] text-brand flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>
              <p className="text-[11px] leading-relaxed text-[color:var(--text-body)] mb-3">
                手上有文件要处理？<br />
                <span className="opacity-60">丢进来，不用先建档。</span>
              </p>
              <div className="flex flex-wrap gap-1 justify-center">
                {['聊天记录', '世界书', '预设', '角色卡', '正则'].map((t) => (
                  <span key={t} className="px-2 py-[3px] rounded-full text-[10px] bg-[var(--hover-overlay)] text-[color:var(--text-muted)]">
                    {t}
                  </span>
                ))}
              </div>
            </section>

            {/* ④ 其他资产：统计格（demo .stat-panel） */}
            <section className="shrink-0 rounded-xl bg-elevated p-4" data-tour="home-assets">
              <p className="text-[11px] tracking-widest text-[color:var(--text-muted)] mb-2.5">你的资产</p>
              <div className="grid grid-cols-2 gap-2">
                {STAT_CELLS.map((cell) => (
                  <button
                    key={cell.label}
                    onClick={cell.onClick}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-chrome text-[11px] text-[color:var(--text-body)] hover:bg-elevated-strong transition-colors"
                  >
                    <span>{cell.label}</span>
                    <span className="font-serif font-bold text-[15px] text-[color:var(--text-primary)]">{cell.count}</span>
                  </button>
                ))}
                {/* ST 配置（仅客户端）：用户在 ST 使用的 AI 连接概况，只读快照 */}
                {isTauri() && (
                  <button
                    onClick={() => setStConfigOpen(true)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-chrome text-[11px] text-[color:var(--text-body)] hover:bg-elevated-strong transition-colors"
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
