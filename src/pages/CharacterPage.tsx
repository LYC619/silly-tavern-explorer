/**
 * 角色卡主页（10.3a 骨架重构，对照 _reference/0801.实测/角色卡界面设计/character-detail.html）：
 * - 左信息栏 272px（CharacterInfoRail）：立绘 3:4+lightbox / 信息行 / 操作抽屉
 * - 主列：头部（CharacterHeader：大标题+meta 编辑弹窗+折叠动画+标签条 NSFW 开关）
 *   + tab 导航（故事/备注/关联资产/立绘）+ tab 行右侧统一导入钮（10.3c，按当前 tab 预选类型）
 * - patchCharacter：评分→评价档位标签单向联动（10.0）+ 标签变化同步 nsfw 字段
 */
import { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, BookOpen, Download } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { ArchiveCharacter, ArchiveStory } from '@/types/archive';
import {
  getCharacter,
  updateCharacter,
  getStoriesByCharacter,
  updateArchiveStory,
  deleteArchiveStory,
  deleteCharacter,
  sortStoriesForDisplay,
  markCharacterViewed,
} from '@/lib/archive-db';
import { normalizeCharacterCard } from '@/lib/adapters/st';
import { applyCharacterTagPatch, applyCharacterTypePatch } from '@/lib/character-tag-domain';
import { importEmbeddedAssets } from '@/lib/card-embedded-assets';
import { downloadCharacterFile } from '@/lib/character-file';
import { editsFromNormalized, exportCardJson, type CardEdits } from '@/lib/card-export';
import { applyCharacterPageCardEdits, applyCharacterPageDisplayMeta } from '@/lib/character-page-edit';
import { setPendingToolFile } from '@/lib/tool-handoff';
import { cn } from '@/lib/utils';
import { normalizeStoryTitle } from '@/lib/story-rename';
import { IMPORT_KINDS, type CharacterImportKind, type CharacterImportResult } from '@/lib/character-import';
import { importFilesForCharacter } from '@/lib/character-import';
import { getAllSummaries, saveSummary } from '@/lib/summary-db';
import { getAllStoryTrees, saveStoryTree } from '@/lib/story-tree-db';
import { commitCharacterPatch, type CharacterPatch } from '@/lib/character-write';
import {
  buildEditorChatPath,
  buildEditorStoryPath,
  setEditorStoryId,
  type EditorStoryView,
} from '@/lib/editor-story-context';
import { CharacterInfoRail } from '@/components/character/CharacterInfoRail';
import { CharacterHeader } from '@/components/character/CharacterHeader';
import { AssetSection } from '@/components/character/AssetSection';
import { NotesSection } from '@/components/character/NotesSection';
import { PortraitSection } from '@/components/character/PortraitSection';
import { CharacterImportDialog } from '@/components/character/CharacterImportDialog';
import { StoryListSection } from '@/components/character/StoryListSection';
import { InlineStoryReader } from '@/components/character/InlineStoryReader';
import { StoryRecordsView, type RecordViewKind } from '@/components/character/StoryRecordsView';
import { CharacterCardEditSection } from '@/components/character/CharacterCardEditSection';
import { GreetingsSection } from '@/components/character/GreetingsSection';
import { LOADING_LABEL } from '@/lib/ui-copy';

/** 故事 tab 内的子视图：列表 | 总结/日记/故事树查看视图 */
type StorySubView = 'list' | RecordViewKind;

const STORY_SUB_VIEWS: { key: RecordViewKind; label: string }[] = [
  { key: 'volume', label: '总结' },
  { key: 'diary', label: '日记' },
  { key: 'tree', label: '故事树' },
];

/** tab → 导入弹窗预选类型 */
const TAB_IMPORT_KIND: Record<string, CharacterImportKind> = {
  stories: 'story',
  notes: 'quote',
  assets: 'worldbook',
  portraits: 'portrait',
};

const CharacterPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [character, setCharacter] = useState<ArchiveCharacter | null>(null);
  const [stories, setStories] = useState<ArchiveStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [storyToDelete, setStoryToDelete] = useState<ArchiveStory | null>(null);
  const [charDeleteOpen, setCharDeleteOpen] = useState(false);
  // 就地阅读：?story=<id> 深链（首页最近故事跳入）；readingBranchId 仅本页内点分支时带上
  const readingStoryId = searchParams.get('story');
  const [readingBranchId, setReadingBranchId] = useState<string | undefined>(undefined);
  const [storySubView, setStorySubView] = useState<StorySubView>('list');
  // 统一导入弹窗（10.3c）：按当前 tab 预选类型
  const [activeTab, setActiveTab] = useState('stories');
  const [importOpen, setImportOpen] = useState(false);
  const [cardEdits, setCardEdits] = useState<CardEdits | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [cardSaving, setCardSaving] = useState(false);
  const contentColumnRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // AppLayout 保留 main 节点跨路由复用时，浏览器可能恢复旧 scrollTop；
    // 角色页每次切换角色都从标题开始，避免标题被顶部 chrome 截掉。
    contentColumnRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [c, s] = await Promise.all([getCharacter(id), getStoriesByCharacter(id)]);
      const viewed = c ? await markCharacterViewed(id).catch(() => undefined) : undefined;
      setCharacter(viewed ?? c ?? null);
      setStories(s);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!character) return;
    setCardEdits(editsFromNormalized(normalizeCharacterCard(character.card)));
    setDisplayNameDraft(character.displayMeta?.name ?? '');
    // 有意只按 id 重置：页内整理（评分/标签）更新 character 时不能清掉未保存的卡编辑草稿。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.id]);

  // 展示名有两个编辑入口（头部铅笔弹窗 / 卡编辑页签）：档案值变化时同步草稿，防止旧草稿把另一入口刚保存的值回写掉。
  useEffect(() => {
    setDisplayNameDraft(character?.displayMeta?.name ?? '');
  }, [character?.displayMeta?.name]);

  const norm = useMemo(() => (character ? normalizeCharacterCard(character.card) : null), [character]);

  /** 更新角色档案（整理信息属于本地元数据，updatedAt 跟随）。
   * 评分变化时联动评价档位标签（10.0，单向：评分→标签）；
   * 标签变化时同步 nsfw 字段（'卡面/NSFW' 在场即 true）。 */
  const patchCharacter = useCallback(async (patch: CharacterPatch): Promise<ArchiveCharacter> => {
    if (!id) throw new Error('角色档案不存在');
    try {
      return await commitCharacterPatch(
        id,
        async (current) => {
          const requested = typeof patch === 'function' ? await patch(current) : patch;
          if (!requested) return undefined;
          let effective = ('rating' in requested || 'tags' in requested || 'nsfw' in requested)
            ? { ...requested, ...applyCharacterTagPatch(current, requested) }
            : requested;
          // 设类型统一走域函数，顺带清理历史误写的「类型/*」标签（与标签管理、导入两条路径一致）。
          if ('type' in requested && requested.type) {
            effective = { ...effective, ...applyCharacterTypePatch({ ...current, ...effective }, requested.type) };
          }
          return { ...effective, updatedAt: Date.now() };
        },
        updateCharacter,
        setCharacter,
      );
    } catch (error) {
      toast({
        title: '保存角色档案失败',
        description: error instanceof Error ? error.message : '请检查库目录是否可写',
        variant: 'destructive',
      });
      throw error;
    }
  }, [id, toast]);

  const saveCardEdits = useCallback(async (): Promise<boolean> => {
    // 直跳到另一角色而新档案尚未加载完成时，character 仍是旧卡；禁止把旧卡整卡写进新 id。
    if (!character || character.id !== id || !cardEdits || cardSaving) return false;
    setCardSaving(true);
    try {
      const next = applyCharacterPageCardEdits(character, cardEdits);
      await patchCharacter({ name: next.name, subtitle: next.subtitle, card: next.card, pngBase64: next.pngBase64 });
      setCardEdits(editsFromNormalized(normalizeCharacterCard(next.card)));
      toast({ title: '角色卡已保存', description: '实际名、核心字段和开场白已更新。' });
      return true;
    } catch (error) {
      toast({ title: '角色卡保存失败', description: error instanceof Error ? error.message : '请检查内容后重试', variant: 'destructive' });
      return false;
    } finally {
      setCardSaving(false);
    }
  }, [cardEdits, cardSaving, character, id, patchCharacter, toast]);

  const saveDisplayName = useCallback(async () => {
    if (!character || character.id !== id) return;
    // 与档案值相同则跳过：避免多余写入和「已保存」噪音提示。
    if ((displayNameDraft.trim() || undefined) === character.displayMeta?.name) return;
    try {
      const next = applyCharacterPageDisplayMeta(character, { name: displayNameDraft });
      await patchCharacter({ displayMeta: next.displayMeta });
      toast({ title: '展示名已保存' });
    } catch (error) {
      toast({ title: '展示名保存失败', description: error instanceof Error ? error.message : '请重试', variant: 'destructive' });
    }
  }, [character, displayNameDraft, id, patchCharacter, toast]);

  /** 统一导入完成（10.3c）：patch 落库；故事导入后刷列表；弹窗保持打开可继续导 */
  const handleImport = async (kind: CharacterImportKind, files: File[]) => {
    if (!id) throw new Error('角色档案不存在');
    let result: CharacterImportResult | undefined;
    try {
      const saved = await updateCharacter(id, async (current) => {
        result = await importFilesForCharacter(current, kind, files);
        return result.patch ? { ...result.patch, updatedAt: Date.now() } : undefined;
      });
      if (!saved || !result) throw new Error('角色档案不存在');
      setCharacter(saved);
      if (kind === 'story' && result.ok > 0) await load();
      const label = IMPORT_KINDS.find((k) => k.kind === kind)?.label ?? '';
      toast({
        title: `${label}导入完成：成功 ${result.ok}${result.fail ? `，失败 ${result.fail}` : ''}`,
        variant: result.ok === 0 && result.fail > 0 ? 'destructive' : undefined,
      });
    } catch (error) {
      toast({
        title: '导入失败',
        description: error instanceof Error ? error.message : '请检查库目录是否可写',
        variant: 'destructive',
      });
      throw error;
    }
  };

  const handlePasteQuote = async (title: string, body: string) => {
    await patchCharacter((current) => ({
      quotes: [
        ...(current.quotes ?? []),
        { id: crypto.randomUUID(), title, body, addedAt: Date.now() },
      ],
    }));
    toast({ title: `已添加引用「${title}」` });
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
      let added = 0;
      let duplicates = 0;
      await patchCharacter(async (current) => {
        const refs = await importEmbeddedAssets(current, {
          onDuplicate: () => { duplicates++; },
        });
        const existing = current.assets ?? [];
        const merged = [...existing];
        for (const r of refs) {
          if (!merged.some((x) => x.kind === r.kind && x.assetId === r.assetId)) merged.push(r);
        }
        added = merged.length - existing.length;
        return added > 0 ? { assets: merged } : undefined;
      });
      if (added > 0) {
        toast({
          title: `已读取内置资源：新挂 ${added} 个关联`,
          description: duplicates > 0 ? `${duplicates} 个相同内容已导入过，已跳过重复创建。` : undefined,
        });
      } else if (duplicates > 0) {
        toast({ title: '内置资源已导入过', description: `${duplicates} 个相同内容已跳过。` });
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
        stories.map((s) => updateArchiveStory(s.id, () => ({ characterId: undefined, updatedAt: Date.now() }))),
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

  // ===== 就地阅读与故事子视图（10.3b） =====

  const openReader = useCallback((storyId: string, branchId?: string) => {
    setReadingBranchId(branchId);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('story', storyId);
      return next;
    });
  }, [setSearchParams]);

  const closeReader = useCallback(() => {
    setReadingBranchId(undefined);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('story');
      return next;
    });
    // 阅读中可能改了标题/评分/进度，回列表重新拉一遍
    void load();
  }, [setSearchParams, load]);

  /** 列表行内改状态/评分（就地落库，不动 lastViewedAt） */
  const patchStory = useCallback(async (storyId: string, patch: Partial<ArchiveStory>) => {
    await updateArchiveStory(storyId, () => ({ ...patch, updatedAt: Date.now() }));
    await load();
  }, [load]);

  /** 普通处理进入聊天工作台；整理/导出进入同一故事的明确子视图。 */
  const goWorkspace = useCallback((storyId: string, view?: EditorStoryView, branchId?: string | null) => {
    setEditorStoryId(storyId);
    if (!view || view === 'read') {
      navigate(buildEditorChatPath(storyId));
      return;
    }
    const state = branchId !== undefined ? { state: { branchId } } : undefined;
    navigate(buildEditorStoryPath(storyId, view), state);
  }, [navigate]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">{LOADING_LABEL}</div>
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

  // tab 计数（10.3c）：资产含引用摘录；立绘=各行图片合计
  const assetCount = (character.assets?.length ?? 0) + (character.quotes?.length ?? 0);
  const portraitCount = (character.portraitRows ?? []).reduce((n, r) => n + r.items.length, 0);

  return (
    <AppLayout
      leftActions={
        <Button variant="ghost" size="sm" onClick={() => navigate('/library')}>
          <ArrowLeft className="w-4 h-4 mr-1" />
          角色库
        </Button>
      }
    >
       <div className="character-page h-full flex overflow-hidden">
        {/* ===== 左信息栏 272px ===== */}
        <CharacterInfoRail
          character={character}
          norm={norm}
          stories={sortedStories}
          onPatch={patchCharacter}
          onEditCard={handleEditCard}
          onReadEmbedded={handleReadEmbedded}
          onExport={() => downloadCharacterFile(character)}
          onDelete={() => setCharDeleteOpen(true)}
        />

        {/* ===== 主列：头部 + tabs（就地阅读时头部收起，返回列表自动展开） ===== */}
        <div ref={contentColumnRef} className="flex-1 min-w-0 flex flex-col overflow-y-auto scrollbar-thin">
          <CharacterHeader
            character={character}
            norm={norm}
            onPatch={patchCharacter}
            collapsed={readingStoryId ? true : undefined}
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pt-3 pb-6">
            {/* TabsList 用 flex（布局铁律：防插件包裹破坏 grid）；行右侧=统一导入钮（10.3c） */}
            <div className="flex items-center gap-2">
               <TabsList className="flex w-fit flex-wrap gap-1">
                 <TabsTrigger value="stories">故事 {stories.length > 0 && <span className="ml-1 text-[11px] opacity-70">{stories.length}</span>}</TabsTrigger>
                 <TabsTrigger value="notes">备注 {(character.notes?.length ?? 0) > 0 && <span className="ml-1 text-[11px] opacity-70">{character.notes!.length}</span>}</TabsTrigger>
                 <TabsTrigger value="assets">关联资产 {assetCount > 0 && <span className="ml-1 text-[11px] opacity-70">{assetCount}</span>}</TabsTrigger>
                 <TabsTrigger value="portraits">立绘 {portraitCount > 0 && <span className="ml-1 text-[11px] opacity-70">{portraitCount}</span>}</TabsTrigger>
                 <TabsTrigger value="card-edit">角色卡编辑</TabsTrigger>
                 <TabsTrigger value="greetings">开场白</TabsTrigger>
               </TabsList>
               {TAB_IMPORT_KIND[activeTab] && (
                 <Button variant="outline" size="sm" className="ml-auto" onClick={() => setImportOpen(true)}>
                   <Download className="w-3.5 h-3.5 mr-1" />
                   导入
                 </Button>
               )}
            </div>

            {/* 故事 tab：就地阅读 / 列表+子视图（总结/日记/故事树，10.3b） */}
            <TabsContent value="stories" className="mt-3">
              {readingStoryId ? (
                <InlineStoryReader
                  storyId={readingStoryId}
                  stories={sortedStories}
                  initialBranchId={readingBranchId}
                  onSwitchStory={(sid) => openReader(sid)}
                  onBack={closeReader}
                  onOpenEditor={(sid) => goWorkspace(sid)}
                />
              ) : (
                <div className="space-y-3">
                  {/* 子视图切换：故事列表 › 总结/日记/故事树（设计稿的三个子 tab） */}
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      className={cn(
                        'rounded-md px-2 py-1 transition-colors',
                        storySubView === 'list' ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                      )}
                      onClick={() => setStorySubView('list')}
                    >
                      故事列表
                    </button>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                    {STORY_SUB_VIEWS.map((v) => (
                      <button
                        key={v.key}
                        className={cn(
                          'rounded-md px-2 py-1 transition-colors',
                          storySubView === v.key ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                        )}
                        onClick={() => setStorySubView(v.key)}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  {storySubView !== 'list' ? (
                    <StoryRecordsView
                      stories={sortedStories}
                      kind={storySubView}
                      onGoGenerate={(sid, kind, branchId) => goWorkspace(sid, kind, branchId)}
                    />
                  ) : stories.length === 0 ? (
                    <Card>
                      <CardContent className="py-10 text-center text-sm text-muted-foreground">
                        还没有故事。点右上角「导入」，把 ST 聊天记录（JSONL）挂到这张卡下。
                      </CardContent>
                    </Card>
                  ) : (
                    <StoryListSection
                      stories={sortedStories}
                      activeStoryId={readingStoryId}
                      onRead={openReader}
                      onProcess={(sid) => goWorkspace(sid)}
                      onExport={(sid) => goWorkspace(sid, 'io')}
                      onDelete={setStoryToDelete}
                      onPatchStory={(sid, patch) => void patchStory(sid, patch)}
                      onRenameStory={async (sid, title) => {
                        const nextTitle = normalizeStoryTitle(title);
                        await patchStory(sid, { title: nextTitle });
                        // 关联记录保留 bookTitle 作为故事被删除后的回退；重命名时同步更新，
                        // 避免从角色页进入总结/故事树仍显示旧标题。
                        const [summaries, trees] = await Promise.all([getAllSummaries(), getAllStoryTrees()]);
                        await Promise.all([
                          ...summaries.filter((summary) => summary.bookId === sid && summary.bookTitle !== nextTitle)
                            .map((summary) => saveSummary({ ...summary, bookTitle: nextTitle, updatedAt: Date.now() })),
                          ...trees.filter((tree) => tree.bookId === sid && tree.bookTitle !== nextTitle)
                            .map((tree) => saveStoryTree({ ...tree, bookTitle: nextTitle, updatedAt: Date.now() })),
                        ]);
                      }}
                    />
                  )}
                </div>
              )}
            </TabsContent>

            {/* 备注 tab（10.3c CRUD） */}
            <TabsContent value="notes" className="mt-3">
              <NotesSection
                notes={character.notes ?? []}
                onChange={async (notes) => {
                  await patchCharacter({ notes });
                }}
              />
            </TabsContent>

            {/* 关联资产 tab（10.3c：宽抽屉预览 + 引用条目 + 导入/读取内置入口） */}
            <TabsContent value="assets" className="mt-3">
              <AssetSection
                character={character}
                onAssetsChange={async (assets) => {
                  await patchCharacter({ assets });
                }}
                onQuotesChange={async (quotes) => {
                  await patchCharacter({ quotes });
                }}
                onReadEmbedded={handleReadEmbedded}
                onOpenImport={() => setImportOpen(true)}
              />
            </TabsContent>

            {/* 立绘 tab（10.3c 分行式，网页版 IDB 与客户端行文件夹同构） */}
             <TabsContent value="portraits" className="mt-3">
              <PortraitSection
                character={character}
                onPatch={patchCharacter}
                onOpenImport={() => setImportOpen(true)}
              />
             </TabsContent>

             <TabsContent value="card-edit" className="mt-3">
               {cardEdits && (
                 <CharacterCardEditSection
                   edits={cardEdits}
                   displayName={displayNameDraft}
                   onEditChange={(key, value) => setCardEdits((current) => (current ? { ...current, [key]: value } : current))}
                   onDisplayNameChange={setDisplayNameDraft}
                   onSave={async () => {
                     // 卡片保存失败时不再继续保存展示名，避免「失败+已保存」两条矛盾提示。
                     if (await saveCardEdits()) await saveDisplayName();
                   }}
                   saving={cardSaving}
                 />
               )}
             </TabsContent>

             <TabsContent value="greetings" className="mt-3">
               {cardEdits && (
                 <div className="space-y-3">
                   <GreetingsSection
                     edits={cardEdits}
                     onEditChange={(key, value) => setCardEdits((current) => (current ? { ...current, [key]: value } : current))}
                   />
                   <div className="flex justify-end">
                     <Button onClick={() => void saveCardEdits()} disabled={cardSaving}>
                       保存开场白
                     </Button>
                   </div>
                 </div>
               )}
             </TabsContent>
          </Tabs>
        </div>
      </div>

      <CharacterImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        initialKind={TAB_IMPORT_KIND[activeTab] ?? 'story'}
        onImport={handleImport}
        onPasteQuote={handlePasteQuote}
      />

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
