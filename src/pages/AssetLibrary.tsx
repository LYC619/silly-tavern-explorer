/**
 * 附属库：世界书 / 预设 / 正则结构化资产，以及 SillyTavern 其他资产的只读归档浏览器。
 * - 左侧栏 = 资产类别：世界书 / 预设 / 正则 / 其他资产（其他资产选中时在下面挂它的归档子分类）
 * - 内容区首行 = 筛选 chip：状态（已被引用/未被引用）+ 来源（来自ST/工具入库/派生副本/自动保留）
 * - 卡片区三列 .asset-card：图标+标题+徽标 / 统计行 / 绑定关系
 *
 * 一个页面只有一套竖导航（0830 反馈条目 12）。之前是「顶部 tabs 选类别 + 左栏筛选」，
 * 而其他资产那一支又自带第二条左栏，同一个页面出现两条竖导航、位置还不一样。
 *
 * `?tab=` 深链保留（无 tab = 其他资产，`?section=` 定位到具体归档分类）；
 * 点卡 → 对应工具页 `?assetId=` 打开编辑。删除有确认。
 * 不设"快照"类别（2026-07-29 拍板：设计稿误解，待对接 ST 用户目录后再扩类别）。
 */
import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Globe,
  SlidersHorizontal,
  Regex as RegexIcon,
  MoreVertical,
  Trash2,
  PenSquare,
  Plus,
  Link2,
  Download,
  Layers,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { OtherAssetsBrowser, ReadOnlyBadge } from '@/components/assets/OtherAssetsBrowser';
import {
  OTHER_ASSET_SECTIONS,
  SECTION_ICONS,
  readBrowserSection,
} from '@/lib/other-asset-sections';
import { HelpCard } from '@/components/HelpCard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { classifyAssetSource, type AssetSource } from '@/lib/asset-source';
import type { WorldBookItem } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';
import type { RegexCollectionItem } from '@/types/regex';
import { getAllWorldBooks, deleteWorldBook, saveWorldBook } from '@/lib/worldbook-db';
import { readWorldBookUpload, worldBookItemFromUpload } from '@/lib/worldbook-file-import';
import { getAllPresets, deletePreset } from '@/lib/preset-db';
import { getAllRegexCollections, deleteRegexCollection } from '@/lib/regex-db';
import { listCharacterIndex } from '@/lib/archive-index';
import { buildAssetLibraryRows, type AssetLibraryRow } from '@/lib/asset-library-rows';
import { executeDeleteAction } from '@/lib/destructive-action';
import { LOADING_LABEL } from '@/lib/ui-copy';

type AssetTab = 'worldbook' | 'preset' | 'regex';

const TAB_META: Record<AssetTab, { label: string; icon: typeof Globe; toolPath: string; toolLabel: string; unit: string }> = {
  worldbook: { label: '世界书', icon: Globe, toolPath: '/worldbook', toolLabel: '世界书工具', unit: '条目' },
  preset: { label: '预设', icon: SlidersHorizontal, toolPath: '/preset', toolLabel: '预设工具', unit: '提示词块' },
  regex: { label: '正则', icon: RegexIcon, toolPath: '/regex', toolLabel: '正则工具', unit: '规则' },
};

type RefFilter = 'all' | 'referenced' | 'unreferenced';
type SourceFilter = 'all' | AssetSource;
const SOURCE_LABELS: Record<Exclude<SourceFilter, 'all'>, string> = {
  fromST: '来自 ST',
  manual: '工具入库',
  derived: '派生副本',
  autoSaved: '自动保留',
};

/** 左侧栏条目：类别（indent=false）和其他资产的子分类（indent=true）共用一套外观 */
function RailItem({
  label, icon: Icon, count, active, indent, title, onClick,
}: {
  label: string;
  icon: typeof Globe;
  count?: number;
  active?: boolean;
  indent?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={title ?? label}
      className={cn(
        'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs mb-px text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        indent && 'pl-7',
        active
          ? 'bg-[var(--brand-active-bg)] font-medium text-brand'
          : 'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && (
        <span className={cn('text-[11px] shrink-0', active ? 'opacity-90' : 'opacity-50')}>{count}</span>
      )}
    </button>
  );
}

/** 内容区首行的筛选 chip。原来这些在左栏，和类别导航挤在一根竖条上分不清主次。 */
function FilterChip({
  label, count, active, onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        active
          ? 'border-transparent bg-[var(--brand-active-bg)] font-medium text-brand'
          : 'border-[color:var(--border-subtle)] text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]',
      )}
    >
      <span className="truncate" title={label}>{label}</span>
      {count !== undefined && (
        <span className={cn('text-[11px]', active ? 'opacity-90' : 'opacity-50')}>{count}</span>
      )}
    </button>
  );
}

const AssetLibrary = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (['worldbook', 'preset', 'regex'].includes(searchParams.get('tab') ?? '')
    ? searchParams.get('tab')
    : null) as AssetTab | null;
  /** 无 tab 时页面停在其他资产；`?section=` 决定看哪一类归档 */
  const section = readBrowserSection(searchParams.get('section'));

  const [worldbooks, setWorldbooks] = useState<WorldBookItem[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [regexes, setRegexes] = useState<RegexCollectionItem[]>([]);
  /** assetId → 引用它的角色名列表（绑定关系展示 + 删除提示） */
  const [refNames, setRefNames] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AssetLibraryRow | null>(null);
  const [refFilter, setRefFilter] = useState<RefFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const worldBookInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const [wbs, ps, rs, chars] = await Promise.all([
        getAllWorldBooks(),
        getAllPresets(),
        getAllRegexCollections(),
        // 引用名称是附加信息；索引失败不应抹掉已经成功读取的资产列表。
        listCharacterIndex().catch(() => []),
      ]);
      setWorldbooks(wbs);
      setPresets(ps);
      setRegexes(rs);
      const names: Record<string, string[]> = {};
      for (const c of chars) {
        for (const ref of c.assets ?? []) (names[ref.assetId] ??= []).push(c.name);
      }
      setRefNames(names);
    } catch (error: unknown) {
      setWorldbooks([]);
      setPresets([]);
      setRegexes([]);
      setRefNames({});
      setLoadError(error instanceof Error ? error.message : '无法读取资产库');
    } finally {
      setLoading(false);
    }
  }, []);

  // 无条件读取：侧栏三类的数量常驻显示，停在其他资产时也得是真数，
  // 不然一进页面看到「世界书 0」会以为库空了。
  useEffect(() => { void load(); }, [load]);

  const rows: Record<AssetTab, AssetLibraryRow[]> = useMemo(
    () => buildAssetLibraryRows({ worldbooks, presets, regexes }),
    [worldbooks, presets, regexes],
  );

  const handleDelete = async () => {
    if (!toDelete) return;
    const target = toDelete;
    const deleted = await executeDeleteAction(async () => {
      if (tab === 'worldbook') await deleteWorldBook(target.id);
      else if (tab === 'preset') await deletePreset(target.id);
      else await deleteRegexCollection(target.id);
      await load();
    }, {
      onSuccess: () => toast({ title: `已删除「${target.title}」` }),
      onFailure: () => toast({ title: '删除失败', variant: 'destructive' }),
    });
    if (deleted) setToDelete(null);
  };

  const handleWorldBookImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const upload = await readWorldBookUpload(file);
      const item = worldBookItemFromUpload(upload);
      await saveWorldBook(item);
      await load();
      toast({
        title: '世界书导入成功',
        description: `「${item.title}」，共 ${Object.keys(item.worldbook.entries).length} 个条目`,
      });
    } catch (error) {
      toast({
        title: '世界书导入失败',
        description: error instanceof Error ? error.message : '无法解析该文件',
        variant: 'destructive',
      });
    }
  };

  const meta = TAB_META[tab ?? 'worldbook'];
  const openAsset = (id: string) => navigate(`${meta.toolPath}?assetId=${encodeURIComponent(id)}`);
  /** 换类别：整份替换 query，把上一类别留下的 `?section=` 一起清掉 */
  const selectTab = (next: AssetTab) => setSearchParams({ tab: next }, { replace: true });
  /** 进其他资产：同理清掉 `?tab=`；概览是默认态，不往 URL 里写 */
  const selectSection = (next: typeof section) => setSearchParams(
    next === 'overview' ? {} : { section: next },
    { replace: true },
  );
  const tabList = useMemo(() => (tab ? rows[tab] : []), [rows, tab]);
  const counts = { worldbook: worldbooks.length, preset: presets.length, regex: regexes.length };
  /**
   * 读失败/还在读时不显示数量：这时 counts 全是 0，摆出来就是在说「库里没有」。
   * 侧栏没有报错位置，但点进任一类别就会看到完整报错和重试。
   */
  const showCounts = !loading && !loadError;

  const matchSource = useCallback((asset: AssetLibraryRow, filter: SourceFilter) => (
    filter === 'all' || classifyAssetSource(asset) === filter
  ), []);

  const filtered = useMemo(() => tabList.filter((a) => {
    const refs = refNames[a.id]?.length ?? 0;
    if (refFilter === 'referenced' && refs === 0) return false;
    if (refFilter === 'unreferenced' && refs > 0) return false;
    return matchSource(a, sourceFilter);
  }), [tabList, refNames, refFilter, sourceFilter, matchSource]);

  const refCounts = useMemo(() => ({
    referenced: tabList.filter((a) => (refNames[a.id]?.length ?? 0) > 0).length,
    unreferenced: tabList.filter((a) => (refNames[a.id]?.length ?? 0) === 0).length,
  }), [tabList, refNames]);
  const sourceCounts = useMemo(() => Object.fromEntries(
    (Object.keys(SOURCE_LABELS) as Exclude<SourceFilter, 'all'>[]).map((f) => [f, tabList.filter((a) => matchSource(a, f)).length]),
  ) as Record<Exclude<SourceFilter, 'all'>, number>, [tabList, matchSource]);

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-hidden">
        {/* ===== 页头（demo .main-header）：两种视图共用一个 ===== */}
        <div className="shrink-0 flex items-baseline gap-3.5 px-6 pt-4 pb-1 flex-wrap">
          <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">附属库</h1>
          {showCounts && (
            <span className="text-[11px] text-[color:var(--text-muted)]">
              世界书 {counts.worldbook} · 预设 {counts.preset} · 正则 {counts.regex}
            </span>
          )}
          <HelpCard>
            世界书、预设、正则规则集的收藏馆。这里入库的资产可以在角色页「关联资产」里被引用；对共享资产的修改会生成派生副本，不影响别的角色。点卡片进入对应工具编辑。「其他资产」是从 SillyTavern 归档过来的扩展、快速回复、人设和媒体，只读。
          </HelpCard>
          <span className="flex-1" />
          {tab === null ? (
            <ReadOnlyBadge />
          ) : (
            <>
              {tab === 'worldbook' && (
                <>
                  <input
                    ref={worldBookInputRef}
                    id="asset-library-worldbook-import"
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={handleWorldBookImport}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-center"
                    aria-label="导入世界书"
                    onClick={() => worldBookInputRef.current?.click()}
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    导入世界书
                  </Button>
                </>
              )}
              <Button size="sm" className="self-center" onClick={() => navigate(meta.toolPath)}>
                <Plus className="w-4 h-4 mr-1.5" />
                打开{meta.toolLabel}
              </Button>
            </>
          )}
        </div>

        {/* ===== 内容区：类别侧栏 + 正文 ===== */}
        <div className="flex-1 min-h-0 flex">
          <aside
            className="w-[var(--filter-side-width)] shrink-0 overflow-y-auto scrollbar-thin py-3 pl-6 pr-2.5 border-r border-[color:var(--hairline-inner)]"
            aria-label="资产类别"
          >
            {(Object.keys(TAB_META) as AssetTab[]).map((t) => (
              <RailItem
                key={t}
                label={TAB_META[t].label}
                icon={TAB_META[t].icon}
                count={showCounts ? counts[t] : undefined}
                active={t === tab}
                onClick={() => selectTab(t)}
              />
            ))}
            <RailItem
              label="其他资产"
              icon={Layers}
              active={tab === null}
              title="从 SillyTavern 归档过来的扩展、快速回复、人设和媒体（只读）"
              onClick={() => selectSection('overview')}
            />
            {/* 子分类只在选中「其他资产」时展开：另外两种类别下面挂七条无关项只是噪音 */}
            {tab === null && (
              <div className="mt-px mb-1.5">
                {OTHER_ASSET_SECTIONS.map((item) => (
                  <RailItem
                    key={item.id}
                    label={item.label}
                    icon={SECTION_ICONS[item.id]}
                    indent
                    active={section === item.id}
                    title={item.description}
                    onClick={() => selectSection(item.id)}
                  />
                ))}
              </div>
            )}
          </aside>

          {tab === null ? (
            <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-y-auto scrollbar-thin px-6 py-3">
              <OtherAssetsBrowser />
            </div>
          ) : (
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-3">
            {/* 筛选首行：状态 + 来源。原来在左栏，现在和类别导航分开。 */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 mb-3.5 pb-3 border-b border-[color:var(--border-normal)]">
              <span className="text-[11px] tracking-[1.5px] text-[color:var(--text-muted)] mr-0.5">状态</span>
              <FilterChip label="全部" count={tabList.length} active={refFilter === 'all'} onClick={() => setRefFilter('all')} />
              <FilterChip label="已被引用" count={refCounts.referenced} active={refFilter === 'referenced'} onClick={() => setRefFilter(refFilter === 'referenced' ? 'all' : 'referenced')} />
              <FilterChip label="未被引用" count={refCounts.unreferenced} active={refFilter === 'unreferenced'} onClick={() => setRefFilter(refFilter === 'unreferenced' ? 'all' : 'unreferenced')} />
              <span className="mx-1.5 h-4 w-px bg-[var(--hairline-inner)]" />
              <span className="text-[11px] tracking-[1.5px] text-[color:var(--text-muted)] mr-0.5">来源</span>
              {(Object.keys(SOURCE_LABELS) as Exclude<SourceFilter, 'all'>[]).map((f) => (
                <FilterChip
                  key={f}
                  label={SOURCE_LABELS[f]}
                  count={sourceCounts[f]}
                  active={sourceFilter === f}
                  onClick={() => setSourceFilter(sourceFilter === f ? 'all' : f)}
                />
              ))}
            </div>

            {loading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{LOADING_LABEL}</p>
            ) : loadError ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3" data-asset-library-load-error>
                <p className="text-sm text-destructive">读取资产库失败：{loadError}</p>
                <p className="text-xs text-muted-foreground">没有把读取失败当成空库，你可以重试。</p>
                <Button size="sm" variant="outline" onClick={() => void load()}>重试</Button>
              </div>
            ) : tabList.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
                <meta.icon className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">还没有入库的{meta.label}</p>
                <p className="text-xs text-muted-foreground/70">
                  在{meta.toolLabel}里导入并保存，或从编辑区拖文件进来；客户端也可以「接入 SillyTavern」批量导入
                </p>
                <Button size="sm" onClick={() => navigate(meta.toolPath)}>
                  打开{meta.toolLabel}
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">没有符合当前筛选的{meta.label}</p>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 content-start">
                {filtered.map((a) => {
                  const refs = refNames[a.id] ?? [];
                  return (
                    <div
                      key={a.id}
                      role="button"
                      tabIndex={0}
                      className="flex flex-col gap-2.5 rounded-lg border border-[color:var(--border-subtle)] bg-elevated hover:bg-elevated-strong transition-colors cursor-pointer p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]"
                      onClick={() => openAsset(a.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openAsset(a.id);
                        }
                      }}
                    >
                      {/* 头：图标 + 标题 + 徽标 + 菜单 */}
                      <div className="flex items-center gap-2.5">
                        <div className="w-[30px] h-[30px] rounded-md bg-[var(--brand-active-bg)] text-brand flex items-center justify-center shrink-0">
                          <meta.icon className="w-[15px] h-[15px]" />
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="font-serif text-sm font-semibold text-[color:var(--text-primary)] truncate" title={a.title}>
                            {a.title}
                          </span>
                          {a.derived && (
                            <span className="text-[11px] px-1.5 py-px rounded-full bg-[var(--hover-overlay)] text-[color:var(--text-muted)]">派生副本</span>
                          )}
                          {a.autoSaved && (
                            <span className="text-[11px] px-1.5 py-px rounded-full bg-[var(--hover-overlay)] text-[color:var(--text-muted)]">自动保留</span>
                          )}
                          {a.fromST && (
                            <span className="text-[11px] px-1.5 py-px rounded-full bg-[var(--status-ok-bg)] text-[color:var(--status-ok)]">来自 ST</span>
                          )}
                          {a.stGlobal && (
                            <span className="text-[11px] px-1.5 py-px rounded-full bg-[var(--brand-active-bg)] text-brand">ST 全局</span>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="w-7 p-0 shrink-0" aria-label="更多操作">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => openAsset(a.id)}>
                              <PenSquare className="w-3.5 h-3.5 mr-2" />
                              打开编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setToDelete(a)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {/* 统计行（demo .a-stats-row） */}
                      <div className="flex gap-3 py-2 border-y border-[color:var(--hairline-inner)]">
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="text-[9.5px] tracking-wide text-[color:var(--text-muted)]">{meta.unit}</span>
                          <span className="font-serif font-semibold text-sm text-[color:var(--text-primary)]">{a.itemCount}</span>
                        </div>
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="text-[9.5px] tracking-wide text-[color:var(--text-muted)]">引用角色</span>
                          <span className="font-serif font-semibold text-sm text-[color:var(--text-primary)]">{refs.length}</span>
                        </div>
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="text-[9.5px] tracking-wide text-[color:var(--text-muted)]">STE 最后修改</span>
                          <span className="font-serif font-semibold text-sm text-[color:var(--text-primary)]">
                            {new Date(a.updatedAt).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      </div>
                      {a.sourceModifiedAt !== undefined && (
                        <p className="text-[11px] text-[color:var(--text-muted)]">
                          源文件最后修改：{new Date(a.sourceModifiedAt).toLocaleString('zh-CN')}
                        </p>
                      )}
                      {/* 绑定关系（demo .a-bindings） */}
                      <div className="flex items-center gap-1.5 flex-wrap text-[10.5px] text-[color:var(--text-muted)] min-h-5">
                        <Link2 className="w-3 h-3 shrink-0" />
                        {refs.length === 0 ? (
                          <span>未被角色引用</span>
                        ) : (
                          <>
                            {refs.slice(0, 2).map((n) => (
                              <span key={n} title={n} className="px-1.5 py-px rounded bg-[var(--hover-overlay)] text-[color:var(--text-body)] text-[11px] font-medium max-w-28 truncate">
                                {n}
                              </span>
                            ))}
                            {refs.length > 2 && (
                              <span className="px-1.5 py-px rounded bg-[var(--hover-overlay)] text-[color:var(--text-body)] text-[11px] font-medium">
                                +{refs.length - 2} 卡
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        open={!!toDelete}
        title={`删除「${toDelete?.title ?? ''}」？`}
        description={`此操作不可恢复。${(toDelete && (refNames[toDelete.id]?.length ?? 0) > 0)
          ? `该资产被 ${refNames[toDelete.id].length} 张角色卡引用，删除后角色页会显示“引用已失效”并可一键移除。`
          : '该资产当前没有角色引用。'}`}
        onOpenChange={(open) => !open && setToDelete(null)}
        onConfirm={() => void handleDelete()}
      />
    </AppLayout>
  );
};

export default AssetLibrary;
