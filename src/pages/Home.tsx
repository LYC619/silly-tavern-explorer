/**
 * 首页（2.0 阶段5，定稿第三章）：私人收藏馆。
 * 四块内容：角色库（主体）/ 处理区入口（第二主入口）/ 最近查看的故事 / 其他资产。
 * 硬约束：一屏无滚动（基准 1440×900、100% 缩放），超出内容走「查看全部」进二级页；
 * 不出现「继续游玩」。
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UploadCloud, ArrowRight, Globe, SlidersHorizontal, Regex as RegexIcon,
  KeyRound, ScrollText, IdCard, Clock, MessageSquare, Cpu, BookOpenText,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import { getAllCharacters, getAllArchiveStories } from '@/lib/archive-db';
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

const Home = () => {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [recentStories, setRecentStories] = useState<ArchiveStory[]>([]);
  const [resources, setResources] = useState<Record<string, StoryResources>>({});
  const [assetCounts, setAssetCounts] = useState({ worldbooks: 0, presets: 0, regexes: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
        if (cancelled) return;
        setCharacters(chars);
        // 最近查看的故事：只列看过的（无记录的还谈不上「最近查看」），绑定与未绑定都算
        const viewed = stories
          .filter((s) => s.lastViewedAt !== undefined)
          .sort((a, b) => b.lastViewedAt! - a.lastViewedAt!)
          .slice(0, 5);
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
        setAssetCounts({ worldbooks: wbs.length, presets: presets.length, regexes: regexes.length });
      } catch { /* 首页加载失败不弹错，各区显示空态 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const characterById = Object.fromEntries(characters.map((c) => [c.id, c]));
  // 角色库封面墙：最近加入在前，取前 8 张
  const coverWall = [...characters].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);

  const OTHER_ASSETS = [
    { label: '世界书', icon: Globe, path: '/worldbook', count: assetCounts.worldbooks },
    { label: '预设', icon: SlidersHorizontal, path: '/preset', count: assetCounts.presets },
    { label: '正则', icon: RegexIcon, path: '/regex', count: assetCounts.regexes },
    { label: 'AI 配置', icon: KeyRound, path: '/ai-tools', count: null },
  ];

  return (
    <AppLayout>
      {/* 一屏无滚动：视口高减导航后填满，内部各区自行收纳，超出走「查看全部」 */}
      <div className="h-screen overflow-hidden flex flex-col px-6 py-5 gap-4">
        {/* 顶行：角色库（主体，占大头） + 右列（处理区入口 / 其他资产） */}
        <div className="flex-1 min-h-0 flex gap-4">
          {/* ① 角色库 */}
          <section
            className="flex-1 min-w-0 rounded-xl border border-border bg-card/60 p-5 flex flex-col cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate('/library')}
            data-tour="home-library"
          >
            <div className="flex items-center gap-2 mb-4">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">角色库</h2>
              <span className="text-sm text-muted-foreground">{characters.length} 张角色卡</span>
              <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                查看全部 <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </div>
            {coverWall.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-2">
                <Users className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">还没有角色卡</p>
                <p className="text-xs text-muted-foreground/70">去角色库导入 PNG/JSON 角色卡，开始你的收藏</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex gap-3 flex-wrap content-start overflow-hidden">
                {coverWall.map((c) => (
                  <div
                    key={c.id}
                    className="basis-32 w-32 shrink-0 grow-0"
                    onClick={(e) => { e.stopPropagation(); navigate(`/character/${c.id}`); }}
                  >
                    {/* 统一 2:3 受控比例，原图尺寸不影响布局 */}
                    <div className="w-32 h-48 rounded-lg overflow-hidden border border-border bg-secondary shadow-card hover:shadow-lg transition-shadow">
                      {c.pngBase64 ? (
                        <img
                          src={`data:image/png;base64,${c.pngBase64}`}
                          alt={c.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <IdCard className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-xs font-medium truncate text-center" title={c.name}>{c.name}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 右列：处理区入口 + 其他资产 */}
          <div className="w-80 basis-80 shrink-0 grow-0 flex flex-col gap-4 min-h-0">
            {/* ② 处理区入口 */}
            <section
              className="rounded-xl border border-primary/30 bg-primary/5 p-5 cursor-pointer hover:border-primary/60 transition-colors"
              onClick={() => navigate('/tools')}
              data-tour="home-tools"
            >
              <div className="flex items-center gap-2 mb-2">
                <UploadCloud className="w-5 h-5 text-primary" />
                <h2 className="font-display text-lg font-semibold">处理区</h2>
                <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                  进入 <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
              <p className="text-xs text-muted-foreground mb-3">手上有文件要处理？丢进来，不用先建档。</p>
              <div className="flex flex-wrap gap-1.5">
                <Badge className="gold-gradient text-primary-foreground border-0">
                  <ScrollText className="w-3 h-3 mr-1" /> 聊天记录
                </Badge>
                <Badge variant="secondary"><Globe className="w-3 h-3 mr-1" /> 世界书</Badge>
                <Badge variant="secondary"><SlidersHorizontal className="w-3 h-3 mr-1" /> 预设</Badge>
                <Badge variant="secondary"><IdCard className="w-3 h-3 mr-1" /> 角色卡</Badge>
                <Badge variant="secondary"><RegexIcon className="w-3 h-3 mr-1" /> 正则</Badge>
              </div>
            </section>

            {/* ④ 其他资产 */}
            <section className="flex-1 min-h-0 rounded-xl border border-border bg-card/60 p-5" data-tour="home-assets">
              <h2 className="font-display text-lg font-semibold mb-3">其他资产</h2>
              <div className="space-y-1.5">
                {OTHER_ASSETS.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.path}
                      onClick={() => navigate(a.path)}
                      className="w-full flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:border-primary/40 transition-colors"
                    >
                      <Icon className="w-4 h-4 text-muted-foreground" />
                      <span className="flex-1 text-left">{a.label}</span>
                      {a.count !== null && <span className="text-xs text-muted-foreground">{a.count}</span>}
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        {/* ③ 最近查看的故事（轻量一行一条；不做待办清单） */}
        <section className="rounded-xl border border-border bg-card/60 p-5 shrink-0" data-tour="home-recent">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-5 h-5 text-primary" />
            <h2 className="font-display text-lg font-semibold">最近查看的故事</h2>
          </div>
          {recentStories.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有看过的故事。从角色卡进入故事，这里会记下你上次读到哪。</p>
          ) : (
            <div className="flex gap-3 flex-wrap">
              {recentStories.map((s) => {
                const char = s.characterId ? characterById[s.characterId] : undefined;
                const res = resources[s.id];
                const target = s.characterId ? `/story/${s.id}` : '/chat';
                return (
                  <button
                    key={s.id}
                    onClick={() => navigate(target)}
                    className="basis-64 grow max-w-96 rounded-lg border border-border bg-card p-3 text-left hover:border-primary/40 transition-colors"
                  >
                    <p className="text-sm font-medium truncate" title={s.title}>{s.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      {char && <span className="truncate max-w-28">{char.name}</span>}
                      {!s.characterId && <Badge variant="outline" className="h-4 px-1 text-[10px]">未绑定</Badge>}
                      <span className="flex items-center gap-0.5 shrink-0">
                        <MessageSquare className="w-3 h-3" />{s.session.messages.length} 楼
                      </span>
                      {s.meta.lastModel && (
                        <span className="flex items-center gap-0.5 min-w-0">
                          <Cpu className="w-3 h-3 shrink-0" /><span className="truncate max-w-32">{s.meta.lastModel}</span>
                        </span>
                      )}
                    </p>
                    {/* 下属资源小标签（有才显示，不硬凑） */}
                    {res && (res.summaries > 0 || res.diaries > 0 || res.trees > 0 || (s.branches?.length ?? 0) > 0) && (
                      <p className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {res.summaries > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">总结 {res.summaries}</Badge>}
                        {res.diaries > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">日记 {res.diaries}</Badge>}
                        {res.trees > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">故事树 {res.trees}</Badge>}
                        {(s.branches?.length ?? 0) > 0 && <Badge variant="secondary" className="h-4 px-1 text-[10px]">分支 {s.branches!.length}</Badge>}
                      </p>
                    )}
                  </button>
                );
              })}
              <Button
                variant="ghost"
                className="basis-32 grow-0 self-center text-muted-foreground"
                onClick={() => navigate('/library')}
              >
                <BookOpenText className="w-4 h-4 mr-1.5" />
                查看全部
              </Button>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
};

export default Home;
