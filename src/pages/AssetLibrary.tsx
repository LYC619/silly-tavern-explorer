/**
 * 附属库：世界书 / 预设 / 正则结构化资产，以及 SillyTavern 其他资产的只读归档浏览器。
 * - 左侧 176px 筛选栏：引用状态 / 来源（按库里真实字段：来自ST/工具入库/派生副本/自动保留）
 * - 主区分类 tabs + 三列 .asset-card：图标+标题+徽标 / 摘要 / 统计行 / 绑定关系 / 页脚操作
 * `?tab=` 深链保留；点卡 → 对应工具页 `?assetId=` 打开编辑。删除有确认。
 * 不设"快照"类别（2026-07-29 拍板：设计稿误解，待对接 ST 用户目录后再扩类别）。
 */
import { useState, useEffect, useMemo, useCallback, useRef, type ChangeEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Globe, SlidersHorizontal, Regex as RegexIcon, MoreVertical, Trash2, PenSquare, Plus, Link2, Upload,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { OtherAssetsBrowser } from '@/components/assets/OtherAssetsBrowser';
import { HelpCard } from '@/components/HelpCard';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { classifyAssetSource, type AssetSource } from '@/lib/asset-source';
import type { WorldBookItem } from '@/types/worldbook';
import type { PresetItem } from '@/types/preset';
import type { RegexCollectionItem } from '@/lib/regex-db';
import { getAllWorldBooks, deleteWorldBook, saveWorldBook } from '@/lib/worldbook-db';
import { readWorldBookUpload, worldBookItemFromUpload } from '@/lib/worldbook-file-import';
import { getAllPresets, deletePreset } from '@/lib/preset-db';
import { getAllRegexCollections, deleteRegexCollection } from '@/lib/regex-db';
import { getAllCharacters } from '@/lib/archive-db';
import { buildAssetLibraryRows, type AssetLibraryRow } from '@/lib/asset-library-rows';

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

/** 二级筛选栏条目（demo .f-item） */
function FilterItem({
  label, count, active, onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-md text-xs mb-px text-left',
        active
          ? 'bg-[var(--brand-active-bg)] text-brand'
          : 'text-[color:var(--sidebar-text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--sidebar-text)]',
      )}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span className={cn('text-[10px] shrink-0', active ? 'opacity-90' : 'opacity-50')}>{count}</span>
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

  const [worldbooks, setWorldbooks] = useState<WorldBookItem[]>([]);
  const [presets, setPresets] = useState<PresetItem[]>([]);
  const [regexes, setRegexes] = useState<RegexCollectionItem[]>([]);
  /** assetId → 引用它的角色名列表（绑定关系展示 + 删除提示） */
  const [refNames, setRefNames] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [toDelete, setToDelete] = useState<AssetLibraryRow | null>(null);
  const [refFilter, setRefFilter] = useState<RefFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const worldBookInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [wbs, ps, rs, chars] = await Promise.all([
        getAllWorldBooks().catch(() => [] as WorldBookItem[]),
        getAllPresets().catch(() => [] as PresetItem[]),
        getAllRegexCollections().catch(() => [] as RegexCollectionItem[]),
        getAllCharacters().catch(() => []),
      ]);
      setWorldbooks(wbs);
      setPresets(ps);
      setRegexes(rs);
      const names: Record<string, string[]> = {};
      for (const c of chars) {
        for (const ref of c.assets ?? []) (names[ref.assetId] ??= []).push(c.name);
      }
      setRefNames(names);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== null) void load();
    else setLoading(false);
  }, [load, tab]);

  const rows: Record<AssetTab, AssetLibraryRow[]> = useMemo(
    () => buildAssetLibraryRows({ worldbooks, presets, regexes }),
    [worldbooks, presets, regexes],
  );

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      if (tab === 'worldbook') await deleteWorldBook(toDelete.id);
      else if (tab === 'preset') await deletePreset(toDelete.id);
      else await deleteRegexCollection(toDelete.id);
      await load();
      toast({ title: `已删除「${toDelete.title}」` });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setToDelete(null);
    }
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
  const tabList = useMemo(() => (tab ? rows[tab] : []), [rows, tab]);
  const counts = { worldbook: worldbooks.length, preset: presets.length, regex: regexes.length };

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
      {tab === null ? (
        <OtherAssetsBrowser />
      ) : (
      <div className="h-full flex flex-col overflow-hidden">
        {/* ===== 页头（demo .main-header）===== */}
        <div className="shrink-0 flex items-baseline gap-3.5 px-6 pt-4 pb-1 flex-wrap">
          <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">其他资产</h1>
          <span className="text-[11px] text-[color:var(--text-muted)]">
            世界书 {counts.worldbook} · 预设 {counts.preset} · 正则 {counts.regex}
          </span>
          <HelpCard>
            世界书、预设、正则规则集的收藏馆。这里入库的资产可以在角色页「关联资产」里被引用；对共享资产的修改会生成派生副本，不影响别的角色。点卡片进入对应工具编辑。
          </HelpCard>
          <span className="flex-1" />
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
                className="h-8 self-center"
                aria-label="导入世界书"
                onClick={() => worldBookInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-1.5" />
                导入世界书
              </Button>
            </>
          )}
          <Button size="sm" className="h-8 self-center" onClick={() => navigate(meta.toolPath)}>
            <Plus className="w-4 h-4 mr-1.5" />
            打开{meta.toolLabel}
          </Button>
        </div>

        {/* ===== 内容区：176px 筛选栏 + tabs + 卡片 ===== */}
        <div className="flex-1 min-h-0 flex">
          <aside className="w-[var(--filter-side-width)] shrink-0 overflow-y-auto scrollbar-thin py-3 pl-6 pr-2.5 border-r border-[color:var(--hairline-inner)]">
            <div>
              <div className="text-[10px] tracking-[1.5px] text-[color:var(--text-muted)] mb-2 pl-1.5">状态</div>
              <FilterItem label="全部" count={tabList.length} active={refFilter === 'all'} onClick={() => setRefFilter('all')} />
              <FilterItem label="已被引用" count={refCounts.referenced} active={refFilter === 'referenced'} onClick={() => setRefFilter(refFilter === 'referenced' ? 'all' : 'referenced')} />
              <FilterItem label="未被引用" count={refCounts.unreferenced} active={refFilter === 'unreferenced'} onClick={() => setRefFilter(refFilter === 'unreferenced' ? 'all' : 'unreferenced')} />
            </div>
            <div className="mt-4 pt-3.5 border-t border-[color:var(--hairline-inner)]">
              <div className="text-[10px] tracking-[1.5px] text-[color:var(--text-muted)] mb-2 pl-1.5">来源</div>
              {(Object.keys(SOURCE_LABELS) as Exclude<SourceFilter, 'all'>[]).map((f) => (
                <FilterItem
                  key={f}
                  label={SOURCE_LABELS[f]}
                  count={sourceCounts[f]}
                  active={sourceFilter === f}
                  onClick={() => setSourceFilter(sourceFilter === f ? 'all' : f)}
                />
              ))}
            </div>
          </aside>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-3">
            {/* 分类 tabs（demo .assets-tabs：下划线式） */}
            <div className="flex gap-1 mb-3.5 border-b border-[color:var(--border-normal)]">
              {(Object.keys(TAB_META) as AssetTab[]).map((t) => {
                const TIcon = TAB_META[t].icon;
                const active = t === tab;
                return (
                  <button
                    key={t}
                    onClick={() => setSearchParams({ tab: t }, { replace: true })}
                    className={cn(
                      'flex items-center gap-1.5 px-4 py-2 text-xs -mb-px border-b-2 transition-colors',
                      active
                        ? 'text-brand border-brand'
                        : 'text-[color:var(--text-muted)] border-transparent hover:text-[color:var(--text-body)]',
                    )}
                  >
                    <TIcon className="w-3.5 h-3.5" />
                    {TAB_META[t].label}
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-px rounded-full',
                        active ? 'bg-[var(--brand-active-bg-strong)] text-brand' : 'bg-[var(--hover-overlay-strong)] opacity-60',
                      )}
                    >
                      {counts[t]}
                    </span>
                  </button>
                );
              })}
            </div>

            {loading ? (
              <p className="py-16 text-center text-sm text-muted-foreground">加载中…</p>
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
                          <span className="font-serif text-sm font-semibold text-[color:var(--text-primary)] truncate">
                            {a.title}
                          </span>
                          {a.derived && (
                            <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--hover-overlay)] text-[color:var(--text-muted)]">派生副本</span>
                          )}
                          {a.autoSaved && (
                            <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--hover-overlay)] text-[color:var(--text-muted)]">自动保留</span>
                          )}
                          {a.fromST && (
                            <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--status-ok-bg)] text-[color:var(--status-ok)]">来自 ST</span>
                          )}
                          {a.stGlobal && (
                            <span className="text-[9px] px-1.5 py-px rounded-full bg-[var(--brand-active-bg)] text-brand">ST 全局</span>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" aria-label="更多操作">
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
                          <span className="font-serif font-semibold text-[13px] text-[color:var(--text-primary)]">{a.itemCount}</span>
                        </div>
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="text-[9.5px] tracking-wide text-[color:var(--text-muted)]">引用角色</span>
                          <span className="font-serif font-semibold text-[13px] text-[color:var(--text-primary)]">{refs.length}</span>
                        </div>
                        <div className="flex-1 flex flex-col gap-0.5">
                          <span className="text-[9.5px] tracking-wide text-[color:var(--text-muted)]">STE 最后修改</span>
                          <span className="font-serif font-semibold text-[13px] text-[color:var(--text-primary)]">
                            {new Date(a.updatedAt).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                      </div>
                      {a.sourceModifiedAt !== undefined && (
                        <p className="text-[10px] text-[color:var(--text-muted)]">
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
                              <span key={n} className="px-1.5 py-px rounded bg-[var(--hover-overlay)] text-[color:var(--text-body)] text-[10px] font-medium max-w-28 truncate">
                                {n}
                              </span>
                            ))}
                            {refs.length > 2 && (
                              <span className="px-1.5 py-px rounded bg-[var(--hover-overlay)] text-[color:var(--text-body)] text-[10px] font-medium">
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
        </div>
      </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{toDelete?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可恢复。
              {(toDelete && (refNames[toDelete.id]?.length ?? 0) > 0)
                ? `该资产被 ${refNames[toDelete.id].length} 张角色卡引用，删除后角色页会显示「引用已失效」并可一键移除。`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default AssetLibrary;
