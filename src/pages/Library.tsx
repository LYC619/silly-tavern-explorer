/**
 * 角色库（2.1-P2，按新前端交接包 demo ② 重写）：
 * - 左侧 176px 二级筛选栏：进度分类 / 分级标签（带类别色点）/ 系统（批量管理）
 * - 主区 4 列 3:4 角色卡墙：立绘满铺 + 顶部故事数角标 + 底部渐变信息条，hover 浮起
 * - 红线：3:4 比例不可改、不加左上角编号
 * 数据与操作逻辑沿用 9.4 版：导入/删除/批量/搜索/排序/评分筛选/分级标签筛选。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Search, MessageSquare, BookOpen, MoreVertical, ExternalLink,
} from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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
        'w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-md text-xs mb-px text-left',
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
        <span className={cn('text-[10px] shrink-0', active ? 'opacity-90' : 'opacity-50')}>{count}</span>
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
          <span className="text-[11px] text-[color:var(--text-faint)]">{characters.length} 张角色卡</span>
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
                className="h-8 w-40 pl-7 text-xs"
              />
            </div>
          )}
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-32 text-xs self-center">
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
            {/* 评分筛选 chips（demo .canvas-toolbar .chip） */}
            {characters.length > 0 && (
              <div className="flex items-center gap-2 mb-3.5 flex-wrap">
                {(Object.keys(RATING_LABELS) as RatingFilter[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setRatingFilter(k)}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] border transition-colors',
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
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-4 gap-3.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] rounded-xl bg-muted animate-pulse" />
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
                {/* 卡墙：4 列 3:4（红线：比例不可改、不加编号） */}
                <div className="grid grid-cols-4 gap-3.5 content-start">
                  {filtered.map((c) => {
                    const isSelected = selected.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'group relative aspect-[3/4] rounded-xl overflow-hidden cursor-pointer bg-elevated transition-transform duration-200 hover:-translate-y-0.5',
                          batchMode && isSelected && 'ring-2 ring-primary',
                        )}
                        onClick={() => (batchMode ? toggleSelect(c.id) : navigate(`/character/${c.id}`))}
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
                            <span className="ml-auto text-[10px] px-2 py-[3px] rounded-full bg-[rgba(0,0,0,0.5)] backdrop-blur-sm text-white border border-[rgba(255,255,255,0.08)] flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {storyCounts[c.id]} 段故事
                            </span>
                          )}
                        </div>
                        {/* 底部渐变信息条（demo .bottom-info） */}
                        <div className="absolute left-0 right-0 bottom-0 z-10 px-3.5 pb-3 pt-10 bg-[linear-gradient(transparent,rgba(0,0,0,0.75)_40%,rgba(0,0,0,0.92))]">
                          <p className="font-serif text-[13px] font-semibold text-white tracking-wide truncate [text-shadow:0_1px_4px_rgba(0,0,0,0.5)]">
                            {c.name}
                          </p>
                          {c.subtitle && (
                            <p className="text-[10.5px] leading-snug text-white/70 line-clamp-2 mt-1">{c.subtitle}</p>
                          )}
                          <div className="flex items-center justify-between mt-2 text-[10px]">
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
