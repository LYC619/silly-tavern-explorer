/**
 * 角色卡主页（10.3a 骨架重构，对照 _reference/0801.实测/角色卡界面设计/character-detail.html）：
 * - 左信息栏 272px（CharacterInfoRail）：立绘 3:4+lightbox / 信息行 / 操作抽屉
 * - 主列：头部（CharacterHeader：大标题+meta 编辑弹窗+折叠动画+标签条 NSFW 开关）
 *   + tab 导航（故事/备注/关联资产/立绘）；就地阅读与故事域交互在 10.3b，备注/立绘分行在 10.3c
 * - patchCharacter：评分→评价档位标签单向联动（10.0）+ 标签变化同步 nsfw 字段
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MessageSquare, Clock, Cpu, GitBranch, Trash2, BookOpen, Download, StickyNote,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import type { ChatSession } from '@/types/chat';
import {
  getCharacter,
  saveCharacter,
  getStoriesByCharacter,
  saveArchiveStory,
  deleteArchiveStory,
  deleteCharacter,
  buildStoryFromSession,
  sortStoriesForDisplay,
} from '@/lib/archive-db';
import { normalizeCharacterCard, parseJsonl, parseJson } from '@/lib/adapters/st';
import { formatPlayTime, formatWordCount } from '@/lib/story-meta';
import { formatListTime, formatFullTime } from '@/lib/time-display';
import { applyRatingTierTag, NSFW_TAG } from '@/lib/tag-taxonomy';
import { importEmbeddedAssets } from '@/lib/card-embedded-assets';
import { downloadCharacterFile } from '@/lib/character-file';
import { exportCardJson } from '@/lib/card-export';
import { setPendingToolFile } from '@/lib/tool-handoff';
import { CharacterInfoRail } from '@/components/character/CharacterInfoRail';
import { CharacterHeader } from '@/components/character/CharacterHeader';
import { AssetSection } from '@/components/character/AssetSection';
import { IllustrationSection } from '@/components/character/IllustrationSection';

const RECENT_STORY_COUNT = 5;

const CharacterPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [character, setCharacter] = useState<ArchiveCharacter | null>(null);
  const [stories, setStories] = useState<ArchiveStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllStories, setShowAllStories] = useState(false);
  const [storyToDelete, setStoryToDelete] = useState<ArchiveStory | null>(null);
  const [charDeleteOpen, setCharDeleteOpen] = useState(false);

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

  /** 更新角色档案（整理信息属于本地元数据，updatedAt 跟随）。
   * 评分变化时联动评价档位标签（10.0，单向：评分→标签）；
   * 标签变化时同步 nsfw 字段（'卡面/NSFW' 在场即 true）。 */
  const patchCharacter = async (patch: Partial<ArchiveCharacter>) => {
    if (!character) return;
    let effective = patch;
    if ('rating' in patch) {
      effective = { ...effective, tags: applyRatingTierTag(patch.tags ?? character.tags, patch.rating) };
    }
    if (effective.tags !== undefined) {
      effective = { ...effective, nsfw: effective.tags.includes(NSFW_TAG) };
    }
    const next = { ...character, ...effective, updatedAt: Date.now() };
    setCharacter(next);
    await saveCharacter(next);
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

  const handleConfirmDeleteStory = async () => {
    if (!storyToDelete) return;
    await deleteArchiveStory(storyToDelete.id);
    setStoryToDelete(null);
    await load();
    toast({ title: '故事已删除' });
  };

  // ===== 操作抽屉四项 =====

  /** 编辑角色卡：把卡原件经内存交接送进编辑区角色卡工具（处理归编辑区的动线） */
  const handleEditCard = () => {
    if (!character) return;
    let file: File;
    if (character.pngBase64) {
      const bytes = Uint8Array.from(atob(character.pngBase64), (ch) => ch.charCodeAt(0));
      file = new File([bytes], `${character.name}.png`, { type: 'image/png' });
    } else {
      file = new File([exportCardJson(character.card)], `${character.name}.json`, { type: 'application/json' });
    }
    setPendingToolFile('card', file);
    navigate('/card-viewer');
  };

  /** 读取内置资源：重扫卡内嵌世界书/正则入库并挂关联（sourcePath 去重，不重复建） */
  const handleReadEmbedded = async () => {
    if (!character) return;
    try {
      const refs = await importEmbeddedAssets(character);
      const existing = character.assets ?? [];
      const merged = [...existing];
      for (const r of refs) {
        if (!merged.some((x) => x.kind === r.kind && x.assetId === r.assetId)) merged.push(r);
      }
      if (merged.length !== existing.length) {
        await patchCharacter({ assets: merged });
        toast({ title: `已读取内置资源：新挂 ${merged.length - existing.length} 个关联` });
      } else {
        toast({ title: '没有新的内置资源', description: '卡内嵌的世界书/正则已在关联列表里。' });
      }
    } catch {
      toast({ title: '读取内置资源失败', variant: 'destructive' });
    }
  };

  /** 删除角色：名下故事转未绑定，不连带删除 */
  const handleConfirmDeleteChar = async () => {
    if (!character) return;
    try {
      await Promise.all(
        stories.map((s) => saveArchiveStory({ ...s, characterId: undefined, updatedAt: Date.now() })),
      );
      await deleteCharacter(character.id);
      toast({ title: `已删除「${character.name}」（名下故事已转为未绑定）` });
      navigate('/library');
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setCharDeleteOpen(false);
    }
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
      <div className="h-full flex overflow-hidden">
        {/* ===== 左信息栏 272px ===== */}
        <CharacterInfoRail
          character={character}
          norm={norm}
          stories={sortedStories}
          onPatch={patchCharacter}
          onEditCard={handleEditCard}
          onReadEmbedded={() => void handleReadEmbedded()}
          onExport={() => downloadCharacterFile(character)}
          onDelete={() => setCharDeleteOpen(true)}
        />

        {/* ===== 主列：头部 + tabs ===== */}
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-thin">
          <CharacterHeader character={character} norm={norm} onPatch={patchCharacter} />

          <Tabs defaultValue="stories" className="flex-1 flex flex-col px-6 pt-3 pb-6">
            {/* TabsList 用 flex（布局铁律：防插件包裹破坏 grid） */}
            <TabsList className="flex w-fit gap-1">
              <TabsTrigger value="stories">故事 {stories.length > 0 && <span className="ml-1 text-[10px] opacity-70">{stories.length}</span>}</TabsTrigger>
              <TabsTrigger value="notes">备注 {(character.notes?.length ?? 0) > 0 && <span className="ml-1 text-[10px] opacity-70">{character.notes!.length}</span>}</TabsTrigger>
              <TabsTrigger value="assets">关联资产 {(character.assets?.length ?? 0) > 0 && <span className="ml-1 text-[10px] opacity-70">{character.assets!.length}</span>}</TabsTrigger>
              <TabsTrigger value="portraits">立绘</TabsTrigger>
            </TabsList>

            {/* 故事 tab（10.3b 补 就地阅读/三按钮/分支连线） */}
            <TabsContent value="stories" className="mt-3">
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
                        onClick={() => navigate(`/story/${story.id}`)}
                      >
                        <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
                          <div className="flex-1 min-w-48">
                            <p className="font-medium text-sm truncate flex items-center gap-2">
                              <span className="truncate">{story.title}</span>
                              {/* 故事状态四档（10.0 下沉到故事级）；undefined 按未开始显示 */}
                              <Badge variant="outline" className="h-5 px-1.5 text-[10px] shrink-0 font-normal">
                                {story.status ?? '未开始'}
                              </Badge>
                            </p>
                            {/* 元数据紧凑单行：消息数 · 字数 · 时长 · 模型 · 最近查看 */}
                            <p className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap mt-0.5">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3" />
                                {msgCount} 楼
                              </span>
                              {story.wordCount !== undefined && <span>{formatWordCount(story.wordCount)}</span>}
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
                              <span title={story.lastViewedAt ? formatFullTime(story.lastViewedAt) : undefined}>
                                {story.lastViewedAt ? `${formatListTime(story.lastViewedAt)}看过` : '未读'}
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
            </TabsContent>

            {/* 备注 tab（10.3c 出 CRUD；先给空态占位） */}
            <TabsContent value="notes" className="mt-3">
              <Card>
                <CardContent className="py-10 flex flex-col items-center gap-2 text-center">
                  <StickyNote className="w-8 h-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    {(character.notes?.length ?? 0) > 0 ? `已有 ${character.notes!.length} 条备注` : '还没有备注'}
                  </p>
                  <p className="text-xs text-muted-foreground/70">角色级速记（玩卡心得）；编辑功能下个批次上线</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* 关联资产 tab（阶段5 组件迁入；10.3c 换宽抽屉预览） */}
            <TabsContent value="assets" className="mt-3">
              <AssetSection
                character={character}
                onAssetsChange={(assets) => patchCharacter({ assets })}
              />
            </TabsContent>

            {/* 立绘 tab（10.3c 换分行式；现为只读图墙，仅客户端有图时显示） */}
            <TabsContent value="portraits" className="mt-3">
              <IllustrationSection characterId={character.id} />
              <p className="text-xs text-muted-foreground mt-3">
                立绘分行管理（行标题/导入/设为卡面）下个批次上线；客户端可先把图片放进 角色/{character.name}/立绘/ 文件夹。
              </p>
            </TabsContent>
          </Tabs>
        </div>
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

      <AlertDialog open={charDeleteOpen} onOpenChange={setCharDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除「{character.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              只删除 STE 里的角色档案（类型、标签、评分等整理信息），不影响 ST 原目录里的文件。名下故事不会被删除，会转为「未绑定」状态。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteChar}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default CharacterPage;
