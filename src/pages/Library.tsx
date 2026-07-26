/**
 * 角色库（2.0 阶段1；阶段9.4 按首轮真机反馈改造）：
 * - 标题挪顶栏（leftActions），内容区不再放大标题块
 * - 排序（最近修改/最近加入/名称/评分）+ 游玩进度/评分筛选 + STE 标签筛选
 * - 卡面补 评分/进度/标签 角标；每卡三点菜单；批量管理（多选删除）
 * 分级内置标签（人物/玩法/评价…）留待与用户定分类法后做（task_plan 9.4 余项）。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Trash2, Search, MessageSquare, BookOpen, MoreVertical, Star, ListChecks, ExternalLink,
} from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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

const COVER_GRADIENTS = [
  'from-rose-400/80 to-orange-300/80',
  'from-violet-400/80 to-indigo-300/80',
  'from-emerald-400/80 to-teal-300/80',
  'from-amber-400/80 to-yellow-300/80',
  'from-sky-400/80 to-cyan-300/80',
  'from-pink-400/80 to-fuchsia-300/80',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

type SortKey = 'recent' | 'added' | 'name' | 'rating';
const SORT_LABELS: Record<SortKey, string> = {
  recent: '最近修改',
  added: '最近加入',
  name: '名称',
  rating: '评分',
};

type RatingFilter = 'all' | 'rated' | 'unrated' | 'ge8' | 'ge6';
const RATING_LABELS: Record<RatingFilter, string> = {
  all: '全部评分',
  rated: '已评分',
  unrated: '未评分',
  ge8: '8 分以上',
  ge6: '6 分以上',
};

const Library = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [storyCounts, setStoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
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

  /** 全部 STE 标签（卡内原始 tags 不参与筛选，只筛本地标签） */
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of characters) for (const t of c.tags) set.add(t);
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [characters]);

  const filtered = useMemo(() => {
    let list = characters;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || c.subtitle?.toLowerCase().includes(q),
      );
    }
    if (tagFilter) list = list.filter((c) => c.tags.includes(tagFilter));
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
  }, [characters, searchQuery, tagFilter, statusFilter, ratingFilter, sortKey]);

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

  return (
    <AppLayout
      leftActions={
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <span className="font-display font-semibold">我的角色库</span>
          <span className="text-xs text-muted-foreground">{characters.length} 张角色卡</span>
          <HelpCard>
            角色库是私人收藏馆：导入 ST 角色卡（PNG/JSON）建立档案，聊天记录以「故事」形式挂在角色名下。标签、状态、评分都是 STE 本地整理信息，不会写回角色卡文件。
          </HelpCard>
        </div>
      }
      actions={
        <>
          {characters.length > 3 && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="搜索角色..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 w-40 pl-8 text-sm"
              />
            </div>
          )}
          {characters.length > 1 && (
            <Button
              variant={batchMode ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => (batchMode ? exitBatch() : setBatchMode(true))}
            >
              <ListChecks className="w-4 h-4 mr-1.5" />
              {batchMode ? '退出批量' : '批量管理'}
            </Button>
          )}
          <Button onClick={() => fileInputRef.current?.click()}>
            <Plus className="w-4 h-4 mr-2" />
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
        </>
      }
    >
      <div className="container mx-auto px-4 py-5">
        {/* 筛选与排序条（紧凑一行，wrap 兜底） */}
        {characters.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>{SORT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部进度</SelectItem>
                {CHARACTER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as RatingFilter)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RATING_LABELS) as RatingFilter[]).map((k) => (
                  <SelectItem key={k} value={k}>{RATING_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allTags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                {allTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={tagFilter === tag ? 'default' : 'secondary'}
                    className="cursor-pointer"
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            {(tagFilter || statusFilter !== 'all' || ratingFilter !== 'all') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => { setTagFilter(null); setStatusFilter('all'); setRatingFilter('all'); }}
              >
                清除筛选
              </Button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-lg bg-muted mb-2" />
                <div className="h-4 bg-muted rounded w-3/4 mb-1" />
              </div>
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((c) => {
                const isSelected = selected.has(c.id);
                return (
                  <Card
                    key={c.id}
                    className={`group cursor-pointer hover:shadow-warm transition-all duration-300 overflow-hidden ${
                      batchMode && isSelected ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => (batchMode ? toggleSelect(c.id) : navigate(`/character/${c.id}`))}
                  >
                    {/* ST 竖版封面：统一 2:3 受控比例，顶部焦点裁切 */}
                    <div className="aspect-[2/3] relative overflow-hidden">
                      {c.pngBase64 ? (
                        <img
                          src={`data:image/png;base64,${c.pngBase64}`}
                          alt={c.name}
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className={`w-full h-full bg-gradient-to-br ${COVER_GRADIENTS[hashName(c.name) % COVER_GRADIENTS.length]} flex items-center justify-center px-4`}
                        >
                          <p className="text-white font-display font-bold text-center leading-snug drop-shadow-lg line-clamp-2 text-xl">
                            {c.name}
                          </p>
                        </div>
                      )}
                      {/* 角标：左上评分 / 右上故事数 / 批量勾选 */}
                      {c.rating !== undefined && (
                        <span className="absolute top-2 left-2 text-[11px] px-1.5 py-0.5 rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm flex items-center gap-0.5">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {c.rating}
                        </span>
                      )}
                      {(storyCounts[c.id] ?? 0) > 0 && (
                        <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {storyCounts[c.id]}
                        </span>
                      )}
                      {batchMode && (
                        <span className="absolute bottom-2 right-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(c.id)} />
                        </span>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-1">
                        <h3 className="font-display font-medium text-sm truncate flex-1">{c.name}</h3>
                        {!batchMode && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                                aria-label="更多操作"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
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
                      </div>
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">{c.status}</Badge>
                        {c.tags.slice(0, 2).map((t) => (
                          <Badge key={t} variant="secondary" className="h-4 px-1 text-[10px] font-normal max-w-20 truncate inline-block">
                            {t}
                          </Badge>
                        ))}
                        {c.tags.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{c.tags.length - 2}</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* 批量操作条（批量模式下悬浮底部） */}
      {batchMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-lg">
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
