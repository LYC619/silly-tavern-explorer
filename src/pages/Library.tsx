/**
 * 角色库（10.2 重构，0801 实测反馈）：
 * - 左侧筛选栏 = 标签系统：顶部「标签管理」→ 类型单选组（互斥，10.0 type 字段）→ 分类法 v2 各组（问号说明；
 *   内置打底常显 + 库内自建；每类至多选一，类别间交集）；旧五档进度组已废弃移除
 * - 顶栏一行：搜索 / 激活筛选 chip+一键清除 / 排序（+最后游玩 +方向钮）/ 批量管理 / 外观（视图·卡片大小·字体大小）/ 导入
 * - 卡面重排：左上=评分数字（未评分）+时间（≤7天相对/hover 完整），右上=故事数角标（对比度修正）+菜单；
 *   下方只留 名称（tooltip）+清洗简介；NSFW 卡面按全局设置模糊（hover 揭示）
 * - 批量模式：点选/Ctrl 点选/Shift 范围选/全选当前筛选结果；常驻条=打标签/导出（逐卡原件）/删除
 * - 红线：2:3 比例（ST 标准卡 400×600）不可改、不加左上角编号
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Search, MessageSquare, BookOpen, MoreVertical, ExternalLink,
  LayoutGrid, List as ListIcon, ChevronLeft, ChevronRight, HelpCircle,
  ArrowDownWideNarrow, ArrowUpNarrowWide, SlidersHorizontal, Tags, Download, X,
} from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { TagManagerDialog } from '@/components/library/TagManagerDialog';
import { BatchTagDialog } from '@/components/library/BatchTagDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
import { introOf } from '@/lib/character-intro';
import { formatListTime, formatFullTime } from '@/lib/time-display';
import { getNsfwBlur } from '@/lib/local-settings';
import { downloadCharacterFile } from '@/lib/character-file';
import type { ArchiveCharacter, CharacterType } from '@/types/archive';
import {
  CHARACTER_TYPES,
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
  TAG_CATEGORIES, CATEGORY_HELP, tagOptionsByCategory, type TagCategory,
} from '@/lib/tag-taxonomy';
import {
  displayCharacterName,
  filterCharacters,
  reconcileSelection,
  sortCharacters,
  toggleTagFilter as toggleLibraryTagFilter,
  type LibrarySortKey,
} from '@/lib/library-query';

/** 类别 → 交接包分类色点（--tag-*）；分类法 v2（10.0），「未分类」用背景色点 */
const CATEGORY_DOT: Record<TagCategory, string> = {
  人物: 'var(--tag-people)',
  剧情: 'var(--tag-review)',
  玩法: 'var(--tag-play)',
  世界观: 'var(--tag-scene)',
  卡面: 'var(--tag-nsfw)',
  评价: 'var(--tag-review)',
  未分类: 'var(--tag-scene)',
};

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

type SortKey = LibrarySortKey;
const SORT_LABELS: Record<SortKey, string> = {
  recent: '按最近修改',
  added: '按最近加入',
  name: '按名称',
  rating: '按评分',
  lastPlayed: '按最后游玩',
};

/** 类型筛选：all=不筛；none=未分类（type 为空） */
type TypeFilter = 'all' | CharacterType | 'none';

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
/** 卡面字体缩放（外观钮）：作用于名称/简介 */
const FONT_MIN = 0.85;
const FONT_MAX = 1.3;

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

/** 逐卡导出原件：见 lib/character-file（10.3a 起与角色页操作抽屉共用） */

const Library = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [storyCounts, setStoryCounts] = useState<Record<string, number>>({});
  /** 每角色最后游玩时间 = 名下故事 lastMessageAt 最大值（10.0 物化） */
  const [lastPlayed, setLastPlayed] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  /** 分级标签筛选：类型单选，其余类别组内多选 OR，类别间取交集 */
  const [tagFilters, setTagFilters] = useState<Partial<Record<TagCategory, string[]>>>({});
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('recent');
  const [sortAsc, setSortAsc] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Shift 范围选锚点：filtered 里的下标 */
  const anchorRef = useRef<number | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  /** 待确认删除（单删=长度1，批量=多条）；null=无弹窗 */
  const [pendingDelete, setPendingDelete] = useState<ArchiveCharacter[] | null>(null);
  /** 视图偏好（持久化）：网格/列表、卡片宽度、字体缩放、每页张数 */
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    lsGet('ste-library-view') === 'list' ? 'list' : 'grid',
  );
  const [cardWidth, setCardWidth] = useState<number>(() => {
    const n = Number(lsGet('ste-library-card-width'));
    return n >= CARD_W_MIN && n <= CARD_W_MAX ? n : CARD_W_DEFAULT;
  });
  const [fontScale, setFontScale] = useState<number>(() => {
    const n = Number(lsGet('ste-library-font-scale'));
    return n >= FONT_MIN && n <= FONT_MAX ? n : 1;
  });
  const [pageSize, setPageSize] = useState<PageSize>(() => {
    const v = lsGet('ste-library-page-size');
    return PAGE_SIZES.includes(v as PageSize) ? (v as PageSize) : '24';
  });
  const [page, setPage] = useState(1);
  const nsfwBlur = useMemo(() => getNsfwBlur(), []);

  useEffect(() => lsSet('ste-library-view', viewMode), [viewMode]);
  useEffect(() => lsSet('ste-library-card-width', String(cardWidth)), [cardWidth]);
  useEffect(() => lsSet('ste-library-font-scale', String(fontScale)), [fontScale]);
  useEffect(() => lsSet('ste-library-page-size', pageSize), [pageSize]);

  const load = useCallback(async () => {
    try {
      const [chars, stories] = await Promise.all([getAllCharacters(), getAllArchiveStories()]);
      setCharacters(chars);
      const counts: Record<string, number> = {};
      const played: Record<string, number> = {};
      for (const s of stories) {
        if (!s.characterId) continue;
        counts[s.characterId] = (counts[s.characterId] ?? 0) + 1;
        if (s.lastMessageAt !== undefined) {
          played[s.characterId] = Math.max(played[s.characterId] ?? 0, s.lastMessageAt);
        }
      }
      setStoryCounts(counts);
      setLastPlayed(played);
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

  /** 逐卡导出所选（间隔触发下载，避免浏览器拦截连发） */
  const handleBatchExport = () => {
    const targets = characters.filter((c) => selected.has(c.id));
    targets.forEach((c, i) => setTimeout(() => downloadCharacterFile(c), i * 200));
    toast({ title: `开始导出 ${targets.length} 张卡（PNG 原件 / JSON）` });
  };

  /** 分类下的可选项：内置子标签 ∪ 库里已出现的 STE 标签（卡内原始 tags 不参与） */
  const tagOptions = useMemo(
    () => tagOptionsByCategory(characters.flatMap((c) => c.tags)),
    [characters],
  );

  /** 筛选栏计数：类型按 type 字段，标签按 raw 出现次数 */
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of characters) m[c.type ?? 'none'] = (m[c.type ?? 'none'] ?? 0) + 1;
    return m;
  }, [characters]);
  const tagCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of characters) for (const t of c.tags) m[t] = (m[t] ?? 0) + 1;
    return m;
  }, [characters]);

  const filtered = useMemo(() => {
    const list = filterCharacters(characters, { search: searchQuery, type: typeFilter, tags: tagFilters });
    return sortCharacters(list, sortKey, sortAsc, lastPlayed);
  }, [characters, searchQuery, tagFilters, typeFilter, sortKey, sortAsc, lastPlayed]);

  // 筛选/搜索/排序/每页数变化时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [searchQuery, tagFilters, typeFilter, sortKey, sortAsc, pageSize]);

  // 筛选上下文改变时收缩选择集；排序或重新计算也必须清掉旧的 Shift 锚点。
  useEffect(() => {
    setSelected((prev) => reconcileSelection(prev, filtered.map((c) => c.id)));
    anchorRef.current = null;
  }, [filtered]);
  useEffect(() => {
    anchorRef.current = null;
  }, [page]);

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

  /** 批量点选：普通/Ctrl 点=切换并记锚点；Shift 点=从锚点到当前的范围全选（filtered 顺序） */
  const batchClick = (c: ArchiveCharacter, e: React.MouseEvent) => {
    const idx = filtered.findIndex((x) => x.id === c.id);
    const anchor = anchorRef.current;
    if (e.shiftKey && anchor !== null && anchor >= 0 && anchor < filtered.length && idx >= 0) {
      const [lo, hi] = [Math.min(anchor, idx), Math.max(anchor, idx)];
      setSelected((prev) => {
        const next = new Set(prev);
        for (let i = lo; i <= hi; i++) next.add(filtered[i].id);
        return next;
      });
      return;
    }
    anchorRef.current = idx >= 0 ? idx : null;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c.id)) next.delete(c.id);
      else next.add(c.id);
      return next;
    });
  };

  const exitBatch = () => {
    setBatchMode(false);
    setSelected(new Set());
    anchorRef.current = null;
  };

  const toggleTagFilter = (cat: TagCategory, raw: string) => {
    setTagFilters((f) => toggleLibraryTagFilter(f, cat, raw) as Partial<Record<TagCategory, string[]>>);
  };

  /** 激活筛选 chips（0801 补充：搜索+筛选叠加要可感知 + 一键清除） */
  const activeFilterChips = [
    ...(typeFilter !== 'all' ? [{ key: 'type', label: `类型:${typeFilter === 'none' ? '未分类' : typeFilter}`, clear: () => setTypeFilter('all') }] : []),
    ...Object.entries(tagFilters).flatMap(([cat, raws]) => (raws ?? []).map((raw) => ({
      key: raw,
      label: raw,
      clear: () => toggleTagFilter(cat as TagCategory, raw),
    }))),
  ];

  const nameSize = Math.round(15 * fontScale);
  const introSize = Math.round(12 * fontScale);

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-hidden">
        {/* ===== 顶栏一行（B2）：标题 / 搜索 / 激活筛选 / 排序+方向 / 批量 / 外观 / 导入 ===== */}
        <div className="shrink-0 flex items-center gap-2.5 px-6 pt-4 pb-2 flex-wrap">
          <h1 className="font-serif text-[22px] font-semibold tracking-wide text-[color:var(--text-primary)]">角色库</h1>
          <span className="text-xs text-[color:var(--text-faint)]">{characters.length} 张</span>
          <HelpCard>
            角色库是私人收藏馆：导入 ST 角色卡（PNG/JSON）建立档案，聊天记录以「故事」形式挂在角色名下。类型、标签、评分都是 STE 本地整理信息，不会写回角色卡文件。
          </HelpCard>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索角色..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-40 pl-7 text-sm"
            />
          </div>
          {/* 激活筛选 chip + 一键清除 */}
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              onClick={chip.clear}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-[11px] bg-[var(--brand-active-bg)] text-brand"
              title="点击移除该筛选"
            >
              {chip.label}
              <X className="w-3 h-3" />
            </button>
          ))}
          {(activeFilterChips.length > 1 || (activeFilterChips.length > 0 && searchQuery.trim())) && (
            <button
              onClick={() => { setTagFilters({}); setTypeFilter('all'); setSearchQuery(''); }}
              className="text-[11px] text-[color:var(--text-muted)] hover:text-[color:var(--text-body)] underline underline-offset-2"
            >
              清除所有筛选
            </button>
          )}
          <span className="flex-1" />
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-32 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            title={sortAsc ? '当前升序，点击切换降序' : '当前降序，点击切换升序'}
            aria-label="切换排序方向"
            onClick={() => setSortAsc((v) => !v)}
          >
            {sortAsc ? <ArrowUpNarrowWide className="w-4 h-4" /> : <ArrowDownWideNarrow className="w-4 h-4" />}
          </Button>
          {characters.length > 1 && (
            <Button
              variant={batchMode ? 'default' : 'outline'}
              size="sm"
              className="h-8"
              onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
            >
              {batchMode ? '退出批量' : '批量管理'}
            </Button>
          )}
          {/* 外观（B2：替代右上滑块）：视图/卡片大小/字体大小 */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8" title="外观：视图、卡片与字体大小">
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                外观
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">视图</p>
                <div className="flex items-center rounded-md border border-border overflow-hidden w-fit">
                  <button
                    aria-label="网格视图"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'h-8 w-10 flex items-center justify-center transition-colors',
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
                      'h-8 w-10 flex items-center justify-center transition-colors border-l border-border',
                      viewMode === 'list'
                        ? 'bg-[var(--brand-active-bg)] text-brand'
                        : 'text-muted-foreground hover:text-[color:var(--text-body)]',
                    )}
                  >
                    <ListIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {viewMode === 'grid' && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">卡片大小</p>
                  <Slider
                    value={[cardWidth]}
                    min={CARD_W_MIN}
                    max={CARD_W_MAX}
                    step={10}
                    onValueChange={([v]) => setCardWidth(v)}
                    aria-label="卡片大小"
                  />
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">卡面字体大小</p>
                <Slider
                  value={[fontScale]}
                  min={FONT_MIN}
                  max={FONT_MAX}
                  step={0.05}
                  onValueChange={([v]) => setFontScale(v)}
                  aria-label="卡面字体大小"
                />
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" className="h-8" onClick={() => fileInputRef.current?.click()}>
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

        {/* ===== 内容区：176px 标签筛选栏 + 卡墙 ===== */}
        <div className="flex-1 min-h-0 flex">
          <aside className="w-[var(--filter-side-width)] shrink-0 overflow-y-auto scrollbar-thin py-3 pl-6 pr-2.5 border-r border-[color:var(--hairline-inner)]">
            {/* 标签管理（B1：左上角） */}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 mb-3 text-xs"
              onClick={() => setTagManagerOpen(true)}
            >
              <Tags className="w-3.5 h-3.5 mr-1.5" />
              标签管理
            </Button>
            {/* 类型（互斥，置顶；替代旧五档游玩状态） */}
            <div>
              <div className="text-[10px] tracking-[1.5px] text-[color:var(--text-faint)] mb-2 pl-1.5 flex items-center gap-1">
                类型
                <span title="每张卡只归一类（人物/剧情/玩法/综合/同人），替代旧版的游玩状态；状态改到每个故事上维护" className="cursor-help">
                  <HelpCircle className="w-3 h-3" />
                </span>
              </div>
              <FilterItem
                label="全部"
                count={characters.length}
                active={typeFilter === 'all'}
                onClick={() => setTypeFilter('all')}
              />
              {CHARACTER_TYPES.map((t) => (
                <FilterItem
                  key={t}
                  label={t}
                  count={typeCounts[t] ?? 0}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
                />
              ))}
              {(typeCounts['none'] ?? 0) > 0 && (
                <FilterItem
                  label="未分类"
                  count={typeCounts['none']}
                  active={typeFilter === 'none'}
                  onClick={() => setTypeFilter(typeFilter === 'none' ? 'all' : 'none')}
                />
              )}
            </div>
            {/* 分类法 v2 各组：内置打底常显 + 库内自建；点选即筛（再点取消），类别间交集 */}
            {TAG_CATEGORIES.map((cat) => {
              const options = tagOptions[cat].filter(
                (o) => cat !== '未分类' || (tagCounts[o.raw] ?? 0) > 0 || tagFilters[cat]?.includes(o.raw),
              );
              if (options.length === 0) return null;
              return (
                <div key={cat} className="mt-4 pt-3.5 border-t border-[color:var(--hairline-inner)]">
                  <div className="text-[10px] tracking-[1.5px] text-[color:var(--text-faint)] mb-2 pl-1.5 flex items-center gap-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: CATEGORY_DOT[cat] }} />
                    {cat}
                    <span title={CATEGORY_HELP[cat]} className="cursor-help">
                      <HelpCircle className="w-3 h-3" />
                    </span>
                  </div>
                  {options.map((o) => (
                    <FilterItem
                      key={o.raw}
                      label={o.label}
                      count={tagCounts[o.raw] ?? 0}
                      active={tagFilters[cat]?.includes(o.raw)}
                      onClick={() => toggleTagFilter(cat, o.raw)}
                    />
                  ))}
                </div>
              );
            })}
          </aside>

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-3">
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
                      const timeTs = lastPlayed[c.id] ?? c.updatedAt;
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-elevated transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]',
                            batchMode && isSelected && 'ring-2 ring-primary',
                          )}
                          onClick={(e) => (batchMode ? batchClick(c, e) : navigate(`/character/${c.id}`))}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (batchMode) batchClick(c, { shiftKey: e.shiftKey } as React.MouseEvent);
                              else navigate(`/character/${c.id}`);
                            }
                          }}
                        >
                          {/* 立绘满铺；无图用交接包渐变占位 + 首字水印；NSFW 按设置模糊（hover 揭示） */}
                          {c.pngBase64 ? (
                            <img
                              src={`data:image/png;base64,${c.pngBase64}`}
                              alt={displayCharacterName(c)}
                              className={cn(
                                'absolute inset-0 w-full h-full object-cover object-top',
                                c.nsfw && nsfwBlur && 'blur-xl scale-110 group-hover:blur-none group-hover:scale-100 transition-all duration-300',
                              )}
                              loading="lazy"
                            />
                          ) : (
                            <div className={`absolute inset-0 art art-placeholder-${(hashName(c.name) % 13) + 1}`}>
                              <div className="char-mark">{displayCharacterName(c).slice(0, 1)}</div>
                            </div>
                          )}
                          {/* 顶部角标条（B3）：左=批量勾选 或 评分数字+时间；右=故事数（对比度修正）+菜单 */}
                          <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-start px-2.5 py-2 gap-1.5">
                            {batchMode ? (
                              <span onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={isSelected} onCheckedChange={() => batchClick(c, {} as React.MouseEvent)} />
                              </span>
                            ) : (
                              <span className="flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[11px] bg-[rgba(0,0,0,0.65)] backdrop-blur-sm border border-[rgba(255,255,255,0.12)] min-w-0">
                                <b className="font-semibold text-[color:var(--brand-hi)]">
                                  {c.rating !== undefined ? c.rating : '未评分'}
                                </b>
                                <span className="text-white/70 truncate" title={formatFullTime(timeTs)}>
                                  {formatListTime(timeTs)}
                                </span>
                              </span>
                            )}
                            <span className="flex items-center gap-1.5 shrink-0">
                              {(storyCounts[c.id] ?? 0) > 0 && (
                                <span className="text-[11px] px-2 py-[3px] rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm text-white border border-[rgba(255,255,255,0.12)] flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3" />
                                  {storyCounts[c.id]}
                                </span>
                              )}
                              {!batchMode && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                    <button
                                      aria-label="更多操作"
                                      className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                                    >
                                      <MoreVertical className="w-3.5 h-3.5" />
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
                              )}
                            </span>
                          </div>
                          {/* 底部渐变信息条（B3）：只留 名称（tooltip）+ 清洗简介 */}
                          <div className="absolute left-0 right-0 bottom-0 z-10 px-3.5 pb-3 pt-12 bg-[linear-gradient(transparent,rgba(0,0,0,0.75)_40%,rgba(0,0,0,0.92))]">
                            <p
                              className="font-serif font-semibold text-white tracking-wide truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]"
                              style={{ fontSize: nameSize }}
                              title={displayCharacterName(c)}
                            >
                              {displayCharacterName(c)}
                            </p>
                            {intro && (
                              <p className="leading-snug text-white/70 line-clamp-2 mt-1" style={{ fontSize: introSize }}>
                                {intro}
                              </p>
                            )}
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
                      const timeTs = lastPlayed[c.id] ?? c.updatedAt;
                      return (
                        <div
                          key={c.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'flex items-center gap-3.5 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-[var(--hover-overlay)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]',
                            batchMode && isSelected && 'bg-[var(--brand-active-bg)]',
                          )}
                          onClick={(e) => (batchMode ? batchClick(c, e) : navigate(`/character/${c.id}`))}
                          onKeyDown={(e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (batchMode) batchClick(c, { shiftKey: e.shiftKey } as React.MouseEvent);
                              else navigate(`/character/${c.id}`);
                            }
                          }}
                        >
                          {batchMode && (
                            <span onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={isSelected} onCheckedChange={() => batchClick(c, {} as React.MouseEvent)} />
                            </span>
                          )}
                          <div className="w-[42px] h-[63px] shrink-0 rounded-md overflow-hidden bg-elevated relative">
                            {c.pngBase64 ? (
                              <img
                                src={`data:image/png;base64,${c.pngBase64}`}
                                alt={displayCharacterName(c)}
                                className={cn(
                                  'absolute inset-0 w-full h-full object-cover object-top',
                                  c.nsfw && nsfwBlur && 'blur-md',
                                )}
                                loading="lazy"
                              />
                            ) : (
                              <div className={`absolute inset-0 art art-placeholder-${(hashName(c.name) % 13) + 1}`} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[color:var(--text-primary)] truncate" style={{ fontSize: Math.round(14 * fontScale) }} title={displayCharacterName(c)}>{displayCharacterName(c)}</p>
                            <p
                              className={cn(
                                'leading-snug line-clamp-1 mt-0.5',
                                intro ? 'text-[color:var(--text-muted)]' : 'text-[color:var(--text-faint)]',
                              )}
                              style={{ fontSize: introSize }}
                            >
                              {intro ?? '暂无简介'}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs font-semibold text-[color:var(--brand-hi)]">
                            {c.rating !== undefined ? c.rating : <span className="font-normal text-[color:var(--text-faint)]">未评分</span>}
                          </span>
                          <span className="shrink-0 w-16 text-right text-xs text-[color:var(--text-muted)]">
                            {(storyCounts[c.id] ?? 0) > 0 ? `${storyCounts[c.id]} 段故事` : '—'}
                          </span>
                          <span className="shrink-0 w-20 text-right text-xs text-[color:var(--text-faint)]" title={formatFullTime(timeTs)}>
                            {formatListTime(timeTs)}
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

      {/* 批量操作常驻条（B4）：全选筛选结果 / 打标签 / 导出 / 删除 */}
      {batchMode && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg flex-wrap">
          <span className="text-sm">已选 {selected.size} 个</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() =>
              setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))
            }
          >
            {selected.size === filtered.length && filtered.length > 0 ? '清空' : '全选筛选结果'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={selected.size === 0}
            onClick={() => setBatchTagOpen(true)}
          >
            <Tags className="w-3.5 h-3.5 mr-1" />
            打标签
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={selected.size === 0}
            onClick={handleBatchExport}
          >
            <Download className="w-3.5 h-3.5 mr-1" />
            导出
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-3 text-xs"
            disabled={selected.size === 0}
            onClick={() => setPendingDelete(characters.filter((c) => selected.has(c.id)))}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />
            删除
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={exitBatch}>
            取消
          </Button>
        </div>
      )}

      <TagManagerDialog
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        characters={characters}
        onChanged={() => void load()}
      />
      <BatchTagDialog
        open={batchTagOpen}
        onOpenChange={setBatchTagOpen}
        targets={characters.filter((c) => selected.has(c.id))}
        allCharacters={characters}
        onDone={load}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.length === 1
                ? `删除「${displayCharacterName(pendingDelete[0])}」？`
                : `删除所选 ${pendingDelete?.length ?? 0} 个角色？`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              只删除 STE 里的角色档案（类型、标签、评分等整理信息），不影响 ST 原目录里的文件。名下故事不会被删除，会转为「未绑定」状态。
              {pendingDelete && pendingDelete.length > 1 && (
                <span className="block mt-2">目标：{pendingDelete.map(displayCharacterName).join('、')}</span>
              )}
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
