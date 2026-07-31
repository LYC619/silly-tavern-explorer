/**
 * 角色库（2.1-P2，按新前端交接包 demo ② 重写；后续按真机反馈补 UX）：
 * - 左侧 176px 二级筛选栏：进度分类 / 分级标签（带类别色点）/ 系统（批量管理）
 * - 主区角色卡墙：立绘 2:3 满铺 + 顶部故事数角标 + 底部渐变信息条（名字/两行简介/评分），hover 浮起
 * - 红线：2:3 比例（ST 标准卡 400×600）不可改、不加左上角编号
 * - 视图偏好（localStorage 持久化）：网格/列表切换、卡片宽度滑杆（auto-fill 自动分列）、每页张数+分页
 * 数据与操作逻辑沿用 9.4 版：导入/删除/批量/搜索/排序/评分筛选/分级标签筛选。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Search, MessageSquare, BookOpen, MoreVertical, ExternalLink,
  LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { ArchiveCharacter } from '@/types/archive';
import {
  CHARACTER_STATUSES,
  getAllCharacters,
  saveCharacter,
  deleteCharacter,
  getAllArchiveStories,
  saveArchiveStory,
  buildCharacterFromCard,
  abToBase64,
} from '@/lib/archive-db';
import { extractCharacterFromPng, parseCharacterCardJson } from '@/lib/adapters/st';
import { importEmbeddedAssets } from '@/lib/card-embedded-assets';
import {
  TAG_CATEGORIES, parseTag, tagOptionsByCategory, type TagCategory,
} from '@/lib/tag-taxonomy';

/** 类别 → 交接包分类色点（--tag-*）；「其他」用背景色点 */
const CATEGORY_DOT: Record<TagCategory, string> = {
  人物: 'var(--tag-people)',
  玩法: 'var(--tag-play)',
  评价: 'var(--tag-review)',
  其他: 'var(--tag-scene)',
};

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return Math.abs(hash);
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

type SortKey = 'recent' | 'added' | 'name' | 'rating';
const SORT_LABELS: Record<SortKey, string> = {
  recent: '按最近修改',
  added: '按最近加入',
  name: '按名称',
  rating: '按评分',
};

type RatingFilter = 'all' | 'rated' | 'unrated' | 'ge8' | 'ge6';
const RATING_LABELS: Record<RatingFilter, string> = {
  all: '全部评分',
  rated: '已评分',
  unrated: '未评分',
  ge8: '8 分以上',
  ge6: '6 分以上',
};

type ViewMode = 'grid' | 'list';
/** 每页张数选项；'all' = 不分页 */
const PAGE_SIZES = ['12', '24', '48', '96', 'all'] as const;
type PageSize = (typeof PAGE_SIZES)[number];
const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  '12': '每页 12 张',
  '24': '每页 24 张',
  '48': '每页 48 张',
  '96': '每页 96 张',
  all: '不分页',
};
/** 卡片最小宽度（px）可调范围；网格用 auto-fill 按此值自动排列数 */
const CARD_W_MIN = 150;
const CARD_W_MAX = 300;
const CARD_W_DEFAULT = 200;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式等场景静默忽略 */
  }
}

/**
 * 卡片简介文案：STE 简介（intro 功能）→ 卡的 creator_notes 首行（subtitle）→ 卡内 description 摘要。
 * description 是角色定义原文，可能含 {{char}}/{{user}} 宏，展示前替换为角色名/「你」。
 */
function introOf(c: ArchiveCharacter): string | undefined {
  const intro = c.intro?.current.content.trim();
  if (intro) return intro;
  if (c.subtitle) return c.subtitle;
  const card = c.card as { data?: { description?: string }; description?: string };
  const desc = (card.data?.description ?? card.description ?? '')
    .replace(/\{\{char\}\}/gi, c.name)
    .replace(/\{\{user\}\}/gi, '你')
    .replace(/\s+/g, ' ')
    .trim();
  return desc ? desc.slice(0, 120) : undefined;
}

/** 二级筛选栏条目（demo .f-item） */
function FilterItem({
  label, count, active, dot, onClick,
}: {
  label: string;
  count?: number;
  active?: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-md text-[13px] mb-px text-left',
        active
          ? 'bg-[var(--brand-active-bg)] text-brand'
          : 'text-[color:var(--text-muted)] hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]',
      )}
    >
      <span className="flex items-center min-w-0">
        {dot && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 shrink-0" style={{ background: dot }} />}
        <span className="truncate">{label}</span>
      </span>
      {count !== undefined && (
        <span className={cn('text-[11px] shrink-0', active ? 'opacity-90' : 'opacity-50')}>{count}</span>
      )}
    </button>
  );
}

const Library = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [storyCounts, setStoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  /** 分级标签筛选（9.4）：每个类别至多选一个子标签（raw），类别间取交集 */
  const [tagFilters, setTagFilters] = useState<Partial<Record<TagCategory, string>>>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 待确认删除（单删=长度1，批量=多条）；null=无弹窗 */
  const [pendingDelete, setPendingDelete] = useState<ArchiveCharacter[] | null>(null);
  /** 视图偏好（持久化）：网格/列表、卡片宽度、每页张数 */
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    lsGet('ste-library-view') === 'list' ? 'list' : 'grid',
  );
  const [cardWidth, setCardWidth] = useState<number>(() => {
    const n = Number(lsGet('ste-library-card-width'));
    return n >= CARD_W_MIN && n <= CARD_W_MAX ? n : CARD_W_DEFAULT;
  });
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const v = lsGet('ste-library-page-size');
    return PAGE_SIZES.includes(v as PageSize) ? (v as PageSize) : '24';
  });
  const [page, setPage] = useState(1);

  useEffect(() => lsSet('ste-library-view', viewMode), [viewMode]);
  useEffect(() => lsSet('ste-library-card-width', String(cardWidth)), [cardWidth]);
  useEffect(() => lsSet('ste-library-page-size', pageSize), [pageSize]);

  const load = useCallback(async () => {
    try {
      const [chars, stories] = await Promise.all([getAllCharacters(), getAllArchiveStories()]);
      setCharacters(chars);
      const counts: Record<string, number> = {};
      for (const s of stories) {
        if (s.characterId) counts[s.characterId] = (counts[s.characterId] ?? 0) + 1;
      }
      setStoryCounts(counts);
    } catch {
      toast({ title: '加载失败', description: '无法读取角色库数据', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const file of Array.from(files)) {
      try {
        let character;
        if (file.name.toLowerCase().endsWith('.png')) {
          const [card, buf] = await Promise.all([extractCharacterFromPng(file), file.arrayBuffer()]);
          character = buildCharacterFromCard(card, abToBase64(buf));
        } else {
          character = buildCharacterFromCard(parseCharacterCardJson(await file.text()));
        }
        // 卡内嵌世界书/正则自动入库并挂关联（阶段9.5）
        const refs = await importEmbeddedAssets(character);
        if (refs.length > 0) character.assets = refs;
        await saveCharacter(character);
        ok++;
      } catch {
        fail++;
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    await load();
    toast({
      title: `导入完成：成功 ${ok} 张${fail ? `，失败 ${fail} 张` : ''}`,
      variant: fail && !ok ? 'destructive' : undefined,
    });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete?.length) return;
    try {
      // 名下故事解除绑定（变为临时/未绑定），不连带删除
      const ids = new Set(pendingDelete.map((c) => c.id));
      const stories = await getAllArchiveStories();
      await Promise.all(
        stories
          .filter((s) => s.characterId && ids.has(s.characterId))
          .map((s) => saveArchiveStory({ ...s, characterId: undefined, updatedAt: Date.now() })),
      );
      for (const c of pendingDelete) await deleteCharacter(c.id);
      await load();
      setSelected(new Set());
      toast({ title: `已删除 ${pendingDelete.length} 个角色（名下故事已转为未绑定，未被删除）` });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setPendingDelete(null);
    }
  };

  /** 分类下的可选项：内置子标签 ∪ 库里已出现的 STE 标签（卡内原始 tags 不参与） */
  const tagOptions = useMemo(
    () => tagOptionsByCategory(characters.flatMap((c) => c.tags)),
    [characters],
  );
  const activeTagFilterCount = Object.keys(tagFilters).length;

  /** 筛选栏计数：进度按 status，标签按 raw 出现次数 */
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of characters) m[c.status] = (m[c.status] ?? 0) + 1;
    return m;
  }, [characters]);
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of characters) for (const t of c.tags) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [characters]);

  const filtered = useMemo(() => {
    let list = characters;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q),
      );
    }
    for (const raw of Object.values(tagFilters)) {
      list = list.filter((c) => c.tags.includes(raw));
    }
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    if (ratingFilter !== 'all') {
      list = list.filter((c) => {
        if (ratingFilter === 'rated') return c.rating !== undefined;
        if (ratingFilter === 'unrated') return c.rating === undefined;
        if (ratingFilter === 'ge8') return (c.rating ?? -1) >= 8;
        return (c.rating ?? -1) >= 6;
      });
    }
    const sorted = [...list];
    switch (sortKey) {
      case 'recent':
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case 'added':
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
        break;
      case 'rating':
        // 未评分垫底
        sorted.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
        break;
    }
    return sorted;
  }, [characters, searchQuery, tagFilters, statusFilter, ratingFilter, sortKey]);

  // 筛选/搜索/排序/每页数变化时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [searchQuery, tagFilters, statusFilter, ratingFilter, sortKey, pageSize]);

  const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / Number(pageSize)));
  // 删除等操作使总页数缩小时收敛到最后一页
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const pageItems = useMemo(() => {
    if (pageSize === 'all') return filtered;
    const n = Number(pageSize);
    return filtered.slice((page - 1) * n, page * n);
  }, [filtered, page, pageSize]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitBatch = () => {
    setBatchMode(false);
    setSelected(new Set());
  };

  const toggleTagFilter = (cat: TagCategory, raw: string) => {
    setTagFilters((f) => {
      const next = { ...f };
      if (next[cat] === raw) delete next[cat];
      else next[cat] = raw;
      return next;
    });
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-hidden">
        {/* ===== 页头（demo .main-header）===== */}
        <div className="shrink-0 flex items-baseline gap-3.5 px-6 pt-4 pb-1 flex-wrap">
          <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">我的库</h1>
          <span className="text-xs text-[color:var(--text-faint)]">{characters.length} 张角色卡</span>
          <HelpCard>
            角色库是私人收藏馆：导入 ST 角色卡（PNG/JSON）建立档案，聊天记录以「故事」形式挂在角色名下。标签、状态、评分都是 STE 本地整理信息，不会写回角色卡文件。
          </HelpCard>
          <span className="flex-1" />
          {characters.length > 3 && (
            <div className="relative self-center">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="搜索角色..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-44 pl-7 text-sm"
              />
            </div>
          )}
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-32 text-[13px] self-center">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-8 self-center" onClick={() => fileInputRef.current?.click()}>
            <Plus className="w-4 h-4 mr-1.5" />
            导入角色卡
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.json"
            multiple
            className="hidden"
            onChange={(e) => handleImportFiles(e.target.files)}
          />
        </div>

        {/* ===== 内容区：176px 筛选栏 + 卡墙 ===== */}
        <div className="flex-1 min-h-0 flex">
          <aside className="w-[var(--filter-side-width)] shrink-0 overflow-y-auto scrollbar-thin py-3 pl-6 pr-2.5 border-r border-[color:var(--hairline-inner)]">
            {/* 进度 */}
            <div>
              <FilterItem
                label="全部"
                count={characters.length}
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
              />
              {CHARACTER_STATUSES.map((s) => (
                <FilterItem
                  key={s}
                  label={s}
                  count={statusCounts[s] ?? 0}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                />
              ))}
            </div>
            {/* 分级标签：每类别一组，点选即筛（再点取消）；类别间取交集 */}
            {TAG_CATEGORIES.map((cat) => {
              const options = tagOptions[cat].filter((o) => (tagCounts[o.raw] ?? 0) > 0 || tagFilters[cat] === o.raw);
              if (options.length === 0) return null;
              return (
                <div key={cat} className="mt-4 pt-3.5 border-t border-[color:var(--hairline-inner)]">
                  <div className="text-[10px] tracking-[1.5px] text-[color:var(--text-faint)] mb-2 pl-1.5 flex items-center">
                    <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ background: CATEGORY_DOT[cat] }} />
                    {cat}
                  </div>
                  {options.map((o) => (
                    <FilterItem
                      key={o.raw}
                      label={o.label}
                      count={tagCounts[o.raw] ?? 0}
                      active={tagFilters[cat] === o.raw}
                      onClick={() => toggleTagFilter(cat, o.raw)}
                    />
                  ))}
                </div>
              );
            })}
            {/* 系统 */}
            {characters.length > 1 && (
              <div className="mt-4 pt-3.5 border-t border-[color:var(--hairline-inner)]">
                <div className="text-[10px] tracking-[1.5px] text-[color:var(--text-faint)] mb-2 pl-1.5">系统</div>
                <FilterItem
                  label={batchMode ? '退出批量' : '批量管理'}
                  active={batchMode}
                  onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
                />
              </div>
            )}
          </aside>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-3">
            {/* 评分筛选 chips + 视图工具（网格/列表切换、卡片大小） */}
            {characters.length > 0 && (
              <div className="flex items-center gap-2 mb-3.5 flex-wrap">
                {(Object.keys(RATING_LABELS) as RatingFilter[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRatingFilter(k)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs border transition-colors',
                      ratingFilter === k
                        ? 'bg-brand text-white border-transparent'
                        : 'border-border text-[color:var(--text-muted)] hover:text-[color:var(--text-body)]',
                    )}
                  >
                    {RATING_LABELS[k]}
                  </button>
                ))}
                {(activeTagFilterCount > 0 || statusFilter !== 'all' || ratingFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={() => { setTagFilters({}); setStatusFilter('all'); setRatingFilter('all'); }}
                  >
                    清除筛选
                  </Button>
                )}
                <span className="flex-1" />
                {viewMode === 'grid' && (
                  <div className="flex items-center gap-2" title="卡片大小">
                    <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                    <Slider
                      value={[cardWidth]}
                      min={CARD_W_MIN}
                      max={CARD_W_MAX}
                      step={10}
                      onValueChange={([v]) => setCardWidth(v)}
                      className="w-28"
                      aria-label="卡片大小"
                    />
                  </div>
                )}
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    aria-label="网格视图"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'h-8 w-8 flex items-center justify-center transition-colors',
                      viewMode === 'grid'
                        ? 'bg-[var(--brand-active-bg)] text-brand'
                        : 'text-muted-foreground hover:text-[color:var(--text-body)]',
                    )}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    aria-label="列表视图"
                    onClick={() => setViewMode('list')}
                    className={cn(
                      'h-8 w-8 flex items-center justify-center transition-colors border-l border-border',
                      viewMode === 'list'
                        ? 'bg-[var(--brand-active-bg)] text-brand'
                        : 'text-muted-foreground hover:text-[color:var(--text-body)]',
                    )}
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div
                className="grid gap-3.5"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}
              >
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[2/3] rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : characters.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <BookOpen className="w-16 h-16 text-muted-foreground/50 mb-4" />
                <h2 className="font-display text-xl mb-2">角色库还是空的</h2>
                <p className="text-muted-foreground mb-4">导入 ST 角色卡（PNG 或 JSON）开始建立你的收藏馆</p>
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Plus className="w-4 h-4 mr-2" />
                  导入角色卡
                </Button>
              </div>
            ) : (
              <>
                {filtered.length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">没有符合当前筛选的角色卡</p>
                )}
                {viewMode === 'grid' ? (
                  /* 卡墙：auto-fill 按卡宽自动分列；卡图 2:3（ST 标准比例；红线：比例不可改、不加编号） */
                  <div
                    className="grid gap-3.5 content-start"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))` }}
                  >
                    {pageItems.map((c) => {
                      const isSelected = selected.has(c.id);
                      const intro = introOf(c);
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-elevated transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]',
                            batchMode && isSelected && 'ring-2 ring-primary',
                          )}
                          onClick={() => (batchMode ? toggleSelect(c.id) : navigate(`/character/${c.id}`))}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (batchMode) toggleSelect(c.id);
                              else navigate(`/character/${c.id}`);
                            }
                          }}
                        >
                          {/* 立绘满铺；无图用交接包渐变占位 + 首字水印 */}
                          {c.pngBase64 ? (
                            <img
                              src={`data:image/png;base64,${c.pngBase64}`}
                              alt={c.name}
                              className="absolute inset-0 w-full h-full object-cover object-top"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`absolute inset-0 art art-placeholder-${(hashName(c.name) % 13) + 1}`}>
                              <div className="char-mark">{c.name.slice(0, 1)}</div>
                            </div>
                          )}
                          {/* 顶部角标条：左=操作菜单（hover 显）/批量勾选，右=故事数 */}
                          <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-start px-3 py-2.5">
                            {batchMode ? (
                              <span onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} />
                              </span>
                            ) : (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <button
                                    aria-label="更多操作"
                                    className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-sm text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                                  >
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem onClick={() => navigate(`/character/${c.id}`)}>
                                    <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                    打开角色主页
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => setPendingDelete([c])}
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />
                                    删除角色
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {(storyCounts[c.id] ?? 0) > 0 && (
                              <span className="ml-auto text-[11px] px-2 py-[3px] rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-sm text-white border border-[rgba(255,255,255,0.08)] flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {storyCounts[c.id]} 段故事
                              </span>
                            )}
                          </div>
                          {/* 底部渐变信息条（设计稿 .bottom-info）：名字 → 两行简介 → 评分/时间，全部在卡内 */}
                          <div className="absolute left-0 right-0 bottom-0 z-10 px-3.5 pb-3 pt-12 bg-[linear-gradient(transparent,rgba(0,0,0,0.75)_40%,rgba(0,0,0,0.92))]">
                            <p className="font-serif text-[15px] font-semibold text-white tracking-wide truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                              {c.name}
                            </p>
                            {intro && (
                              <p className="text-xs leading-snug text-white/70 line-clamp-2 mt-1">{intro}</p>
                            )}
                            <div className="flex items-center justify-between mt-2 text-[11px]">
                              <span className="font-semibold text-[color:var(--brand-hi)]">
                                ★ {c.rating !== undefined ? c.rating : '-'}
                                <span className="font-normal text-white/40"> / 10</span>
                              </span>
                              <span className="text-white/50">{relativeTime(c.updatedAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* 列表视图：小缩略图 + 名字/简介 + 评分/故事数/时间 */
                  <div className="rounded-xl border border-border overflow-hidden divide-y divide-[color:var(--hairline-inner)]">
                    {pageItems.map((c) => {
                      const isSelected = selected.has(c.id);
                      const intro = introOf(c);
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'flex items-center gap-3.5 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--hover-overlay)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]',
                            batchMode && isSelected && 'bg-[var(--brand-active-bg)]',
                          )}
                          onClick={() => (batchMode ? toggleSelect(c.id) : navigate(`/character/${c.id}`))}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (batchMode) toggleSelect(c.id);
                              else navigate(`/character/${c.id}`);
                            }
                          }}
                        >
                          {batchMode && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} />
                            </span>
                          )}
                          <div className="w-[42px] h-[63px] shrink-0 rounded-md overflow-hidden bg-elevated relative">
                            {c.pngBase64 ? (
                              <img
                                src={`data:image/png;base64,${c.pngBase64}`}
                                alt={c.name}
                                className="absolute inset-0 w-full h-full object-cover object-top"
                                loading="lazy"
                              />
                            ) : (
                              <div className={`absolute inset-0 art art-placeholder-${(hashName(c.name) % 13) + 1}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[color:var(--text-primary)] truncate">{c.name}</p>
                            <p
                              className={cn(
                                'text-xs leading-snug line-clamp-1 mt-0.5',
                                intro ? 'text-[color:var(--text-muted)]' : 'text-[color:var(--text-faint)]',
                              )}
                            >
                              {intro ?? '暂无简介'}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-[color:var(--brand-hi)]">
                            ★ {c.rating !== undefined ? c.rating : '-'}
                            <span className="font-normal text-[color:var(--text-faint)]"> / 10</span>
                          </span>
                          <span className="shrink-0 w-16 text-right text-xs text-[color:var(--text-muted)]">
                            {(storyCounts[c.id] ?? 0) > 0 ? `${storyCounts[c.id]} 段故事` : '—'}
                          </span>
                          <span className="shrink-0 w-20 text-right text-xs text-[color:var(--text-faint)]">
                            {relativeTime(c.updatedAt)}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button
                                aria-label="更多操作"
                                className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem onClick={() => navigate(`/character/${c.id}`)}>
                                <ExternalLink className="w-3.5 h-3.5 mr-2" />
                                打开角色主页
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setPendingDelete([c])}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-2" />
                                删除角色
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 分页栏：每页张数 + 上下页 */}
                {filtered.length > 0 && (
                  <div className="flex items-center gap-2 mt-4 pb-2">
                    <span className="text-xs text-[color:var(--text-faint)]">
                      共 {filtered.length} 张
                      {pageSize !== 'all' && pageCount > 1 && (
                        <>
                          {' · 第 '}
                          {(page - 1) * Number(pageSize) + 1}–{Math.min(page * Number(pageSize), filtered.length)}
                          {' 张'}
                        </>
                      )}
                    </span>
                    <span className="flex-1" />
                    <Select value={pageSize} onValueChange={(v) => setPageSize(v as PageSize)}>
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAGE_SIZES.map((s) => (
                          <SelectItem key={s} value={s}>{PAGE_SIZE_LABELS[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {pageSize !== 'all' && pageCount > 1 && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                          aria-label="上一页"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <span className="text-xs text-[color:var(--text-muted)] min-w-[3.5rem] text-center">
                          {page} / {pageCount}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          disabled={page >= pageCount}
                          onClick={() => setPage((p) => p + 1)}
                          aria-label="下一页"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 批量操作条（批量模式下悬浮底部） */}
      {batchMode && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
          <span className="text-sm">已选 {selected.size} 个</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))
            }
          >
            {selected.size === filtered.length && filtered.length > 0 ? '清空' : '全选'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={selected.size === 0}
            onClick={() => setPendingDelete(characters.filter((c) => selected.has(c.id)))}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            删除所选
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={exitBatch}>
            取消
          </Button>
        </div>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.length === 1
                ? `删除「${pendingDelete[0].name}」？`
                : `删除所选 ${pendingDelete?.length ?? 0} 个角色？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              只删除 STE 里的角色档案（标签、状态、评分等整理信息），不影响 ST 原目录里的文件。名下故事不会被删除，会转为「未绑定」状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Library;
