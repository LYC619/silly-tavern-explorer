import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  X,
  ChevronDown,
  MessageSquare,
  Clock,
  Cpu,
  GitBranch,
  BookOpen,
  Trash2,
  Download,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
import type { ArchiveCharacter, ArchiveStory, CharacterStatus } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import {
  getCharacter,
  saveCharacter,
  getStoriesByCharacter,
  saveArchiveStory,
  deleteArchiveStory,
  buildStoryFromSession,
  sortStoriesForDisplay,
  CHARACTER_STATUSES,
} from '@/lib/archive-db';
import { normalizeCharacterCard, parseJsonl, parseJson } from '@/lib/adapters/st';
import { formatPlayTime } from '@/lib/story-meta';
import { AssetSection } from '@/components/character/AssetSection';
import { IntroSection } from '@/components/character/IntroSection';
import { RatingPanel } from '@/components/character/RatingPanel';

const RECENT_STORY_COUNT = 5;

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
}

const CharacterPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [character, setCharacter] = useState<ArchiveCharacter | null>(null);
  const [stories, setStories] = useState<ArchiveStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTag, setNewTag] = useState('');
  const [showAllStories, setShowAllStories] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<ArchiveStory | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, s] = await Promise.all([getCharacter(id), getStoriesByCharacter(id)]);
      setCharacter(c ?? null);
      setStories(s);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const norm = useMemo(() => (character ? normalizeCharacterCard(character.card) : null), [character]);

  /** 更新角色档案（整理信息属于本地元数据，updatedAt 跟随） */
  const patchCharacter = async (patch: Partial<ArchiveCharacter>) => {
    if (!character) return;
    const next = { ...character, ...patch, updatedAt: Date.now() };
    setCharacter(next);
    await saveCharacter(next);
  };

  const handleAddTag = async () => {
    const tag = newTag.trim();
    if (!tag || !character || character.tags.includes(tag)) {
      setNewTag('');
      return;
    }
    await patchCharacter({ tags: [...character.tags, tag] });
    setNewTag('');
  };

  const handleImportChat = async (files: FileList | null) => {
    if (!files || files.length === 0 || !character) return;
    let ok = 0;
    let fail = 0;
    for (const file of Array.from(files)) {
      try {
        const content = await file.text();
        const isJsonl = file.name.endsWith('.jsonl') || content.trim().split('\n').length > 1;
        const { messages, metadata } = isJsonl ? parseJsonl(content) : parseJson(content);
        if (messages.length === 0) throw new Error('empty');
        const session: ChatSession = {
          id: crypto.randomUUID(),
          title: file.name.replace(/\.(jsonl|json)$/i, ''),
          messages,
          character: { name: metadata?.character_name || character.name },
          user: { name: metadata?.user_name || 'User' },
          createdAt: Date.now(),
          rawMetadata: metadata,
        };
        await saveArchiveStory(buildStoryFromSession(session, character.id));
        ok++;
      } catch {
        fail++;
      }
    }
    if (chatInputRef.current) chatInputRef.current.value = '';
    await load();
    toast({ title: `导入完成：${ok} 个故事${fail ? `，失败 ${fail} 个` : ''}` });
  };

  const handleOpenStory = (story: ArchiveStory) => {
    // 进入故事工作区（2.0 阶段2）；工作区会自己记录 lastViewedAt 并恢复上次阅读位置
    navigate(`/story/${story.id}`);
  };

  const handleConfirmDeleteStory = async () => {
    if (!storyToDelete) return;
    await deleteArchiveStory(storyToDelete.id);
    setStoryToDelete(null);
    await load();
    toast({ title: '故事已删除' });
  };

  const sortedStories = useMemo(() => sortStoriesForDisplay(stories), [stories]);
  const visibleStories = showAllStories ? sortedStories : sortedStories.slice(0, RECENT_STORY_COUNT);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">加载中...</div>
      </AppLayout>
    );
  }

  if (!character || !norm) {
    return (
      <AppLayout>
        <div className="flex flex-col min-h-[50vh] items-center justify-center gap-4">
          <BookOpen className="w-16 h-16 text-muted-foreground/50" />
          <p className="text-muted-foreground">找不到该角色</p>
          <Button onClick={() => navigate('/library')}>返回角色库</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      leftActions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/library')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          角色库
        </Button>
      }
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => chatInputRef.current?.click()}>
            <Download className="w-4 h-4 mr-1" />
            导入聊天到此角色
          </Button>
          <input
            ref={chatInputRef}
            type="file"
            accept=".jsonl,.json"
            multiple
            className="hidden"
            onChange={(e) => handleImportChat(e.target.files)}
          />
        </>
      }
    >
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* ===== 首屏身份区：封面 1/3 + 简介主导 ===== */}
        <div className="flex gap-6 flex-wrap">
          {/* 封面（2:3 受控比例）。显式 w-52 而非只靠 basis：翻译类插件往 flex 容器里包节点会让
              flex-basis 失效、封面按原图尺寸撑开（实测踩过），显式宽度不受包裹影响 */}
          <div className="w-52 basis-52 shrink-0 grow-0">
            <div className="aspect-[2/3] rounded-lg overflow-hidden border border-border shadow-card bg-muted">
              {character.pngBase64 ? (
                <img
                  src={`data:image/png;base64,${character.pngBase64}`}
                  alt={character.name}
                  className="w-full h-full object-cover object-top"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-10 h-10 text-muted-foreground/50" />
                </div>
              )}
            </div>
          </div>

          {/* 右侧：名称/标签/状态/评分/简介 */}
          <div className="flex-1 min-w-64 space-y-3">
            <div>
              <h1 className="font-display text-2xl font-semibold">{character.name}</h1>
              {character.subtitle && (
                <p className="text-sm text-muted-foreground mt-0.5">{character.subtitle}</p>
              )}
            </div>

            {/* 卡内原始标签（只读、弱化） */}
            {norm.tags.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                {norm.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-muted-foreground font-normal">
                    {t}
                  </Badge>
                ))}
              </div>
            )}

            {/* STE 本地标签（可编辑，不写回卡） */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {character.tags.map((t) => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button
                    onClick={() => patchCharacter({ tags: character.tags.filter((x) => x !== t) })}
                    aria-label={`删除标签 ${t}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  placeholder="加标签"
                  className="h-6 w-24 text-xs"
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleAddTag} aria-label="添加标签">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* 状态 + 评分 */}
            <div className="flex items-center gap-3 flex-wrap">
              <Select
                value={character.status}
                onValueChange={(v) => patchCharacter({ status: v as CharacterStatus })}
              >
                <SelectTrigger className="h-8 w-28 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHARACTER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <RatingPanel
                character={character}
                norm={norm}
                stories={sortedStories}
                onPatch={patchCharacter}
              />
            </div>
            {character.ratingNote && (
              <p className="text-xs text-muted-foreground">「{character.ratingNote}」</p>
            )}

            {/* 简介（阶段6）：整理版/AI 简介 + 草稿比较 + 历史 + 过期提示 */}
            <IntroSection character={character} norm={norm} onPatch={patchCharacter} />

            {/* 原始字段：只留一个折叠入口（定稿：原文重要性偏低） */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground gap-1 px-2">
                  <ChevronDown className="w-4 h-4" />
                  角色卡原文（Personality / Scenario / 开场白）
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-2">
                {([
                  ['Personality', norm.personality],
                  ['Scenario', norm.scenario],
                  ['First Message', norm.firstMessage],
                ] as const)
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
                      <div className="text-xs whitespace-pre-wrap rounded-md bg-muted/40 p-2 max-h-40 overflow-y-auto">
                        {value}
                      </div>
                    </div>
                  ))}
                <Button variant="outline" size="sm" onClick={() => navigate('/card-viewer')}>
                  在角色卡工具中查看完整字段
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        <Separator className="my-6" />

        {/* ===== 故事历史（第二主区） ===== */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-semibold">故事</h2>
          <p className="text-xs text-muted-foreground">共 {stories.length} 个</p>
        </div>

        {stories.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              还没有故事。点击右上角「导入聊天到此角色」，把 ST 聊天记录（JSONL）挂到这张卡下。
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {visibleStories.map((story) => {
              const msgCount = story.session.messages.length;
              return (
                <Card
                  key={story.id}
                  className="group cursor-pointer hover:shadow-warm transition-all"
                  onClick={() => handleOpenStory(story)}
                >
                  <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-48">
                      <p className="font-medium text-sm truncate">{story.title}</p>
                      {/* 元数据紧凑单行（定稿 2A）：消息数 · 时长 · 模型 · 最近查看 */}
                      <p className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {msgCount} 楼
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatPlayTime(
                            story.meta.playTimeMs !== null && story.meta.sessionCount !== undefined
                              ? { totalMs: story.meta.playTimeMs, sessionCount: story.meta.sessionCount, sampledMessages: msgCount }
                              : null,
                          )}
                        </span>
                        {story.meta.lastModel && (
                          <span className="flex items-center gap-1">
                            <Cpu className="w-3 h-3" />
                            {story.meta.lastModel}
                          </span>
                        )}
                        {(story.branches?.length ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-primary/80">
                            <GitBranch className="w-3 h-3" />
                            {story.branches!.length} 条分支
                          </span>
                        )}
                        <span>
                          {story.lastViewedAt ? `${formatDate(story.lastViewedAt)} 看过` : '未读'}
                        </span>
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStoryToDelete(story);
                      }}
                      aria-label="删除故事"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {sortedStories.length > RECENT_STORY_COUNT && (
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setShowAllStories(!showAllStories)}>
                {showAllStories ? '收起' : `查看全部 ${sortedStories.length} 个故事`}
              </Button>
            )}
          </div>
        )}

        {/* 关联资产区（阶段5）：引用制 + 写时复制 */}
        <AssetSection
          character={character}
          onAssetsChange={(assets) => patchCharacter({ assets })}
        />
      </div>

      <AlertDialog open={!!storyToDelete} onOpenChange={(open) => !open && setStoryToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除故事「{storyToDelete?.title}」？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后无法恢复（不影响 ST 里的原文件）。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteStory}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CharacterPage;
