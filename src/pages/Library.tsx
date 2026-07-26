import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Trash2, Search, MessageSquare, BookOpen } from 'lucide-react';
import { HelpCard } from '@/components/HelpCard';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  getAllCharacters,
  saveCharacter,
  deleteCharacter,
  getAllArchiveStories,
  saveArchiveStory,
  buildCharacterFromCard,
  abToBase64,
} from '@/lib/archive-db';
import { extractCharacterFromPng, parseCharacterCardJson } from '@/lib/adapters/st';

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

const Library = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [characters, setCharacters] = useState<ArchiveCharacter[]>([]);
  const [storyCounts, setStoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ArchiveCharacter | null>(null);

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
        if (file.name.toLowerCase().endsWith('.png')) {
          const [card, buf] = await Promise.all([extractCharacterFromPng(file), file.arrayBuffer()]);
          await saveCharacter(buildCharacterFromCard(card, abToBase64(buf)));
        } else {
          const card = parseCharacterCardJson(await file.text());
          await saveCharacter(buildCharacterFromCard(card));
        }
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
    if (!toDelete) return;
    try {
      // 名下故事解除绑定（变为临时/未绑定），不连带删除
      const stories = await getAllArchiveStories();
      await Promise.all(
        stories
          .filter((s) => s.characterId === toDelete.id)
          .map((s) => saveArchiveStory({ ...s, characterId: undefined, updatedAt: Date.now() })),
      );
      await deleteCharacter(toDelete.id);
      await load();
      toast({ title: '已删除角色（名下故事已转为未绑定，未被删除）' });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setToDelete(null);
    }
  };

  /** 全部 STE 标签（含卡内原始 tags 不参与筛选，只筛本地标签） */
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
    return list;
  }, [characters, searchQuery, tagFilter]);

  return (
    <AppLayout
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
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg gold-gradient flex items-center justify-center shadow-card">
            <Users className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-1">
              <h1 className="font-display text-xl font-semibold">我的角色库</h1>
              <HelpCard>
                角色库是私人收藏馆：导入 ST 角色卡（PNG/JSON）建立档案，聊天记录以「故事」形式挂在角色名下。标签、状态、评分都是 STE 本地整理信息，不会写回角色卡文件。
              </HelpCard>
            </div>
            <p className="text-xs text-muted-foreground">共 {characters.length} 张角色卡</p>
          </div>
        </div>

        {/* 标签筛选（只筛 STE 本地标签） */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((c) => (
              <Card
                key={c.id}
                className="group cursor-pointer hover:shadow-warm transition-all duration-300 overflow-hidden"
                onClick={() => navigate(`/character/${c.id}`)}
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
                  {(storyCounts[c.id] ?? 0) > 0 && (
                    <span className="absolute top-2 right-2 text-[11px] px-2 py-0.5 rounded-full bg-background/85 backdrop-blur-sm text-foreground shadow-sm flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {storyCounts[c.id]} 个故事
                    </span>
                  )}
                  <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(c);
                      }}
                      aria-label="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <CardContent className="p-3">
                  <h3 className="font-display font-medium text-sm truncate">{c.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.subtitle || c.status}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{toDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              只删除角色档案（标签、状态、评分等整理信息）。名下故事不会被删除，会转为「未绑定」状态。
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
