/**
 * 角色库（10.2 重构，0801 实测反馈）：
 * - 左侧筛选栏 = 标签系统：顶部「标签管理」→ 类型单选组（互斥，10.0 type 字段）→ 分类法 v2 各组（问号说明；
 *   内置打底常显 + 库内自建；每类至多选一，类别间交集）；旧五档进度组已废弃移除
 * - 顶栏一行：搜索 / 激活筛选 chip+一键清除 / 排序（+最后游玩 +方向钮）/ 批量管理 / 外观（视图·卡片大小·字体大小）/ 导入
 * - 卡面重排：左上=评分数字（未评分）+时间（≤7天相对/hover 完整），右上=故事数角标（对比度修正）+菜单；
 *   下方只留 名称（tooltip）+清洗简介；NSFW 卡面按全局设置模糊（hover 揭示）
 * - 批量模式：点选/Ctrl 点选/Shift 范围选/全选当前筛选结果；常驻条=打标签/导出（逐卡原件）/删除
 * - 红线：2:3 比例（ST 标准卡 400×600）不可改、不加左上角编号
 *
 * 阶段 C2 拆分：卡面/列表行/操作菜单/工具条/分页条已抽到 components/library/，
 * 外观偏好与批量选择抽到 hooks/，本文件只留数据装载、导入导出删除与组装。
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { TagManagerDialog } from '@/components/library/TagManagerDialog';
import { BatchTagDialog } from '@/components/library/BatchTagDialog';
import { LibraryFilterRail } from '@/components/library/LibraryFilterRail';
import {
  LibraryImportDialog,
  type LibraryImportTagSelection,
} from '@/components/library/LibraryImportDialog';
import { LibraryListHeader } from '@/components/library/LibraryListHeader';
import { LibraryToolbar } from '@/components/library/LibraryToolbar';
import type { ActiveFilterChip } from '@/lib/library-view';
import { LibraryPager, LibraryBatchBar } from '@/components/library/LibraryPager';
import { CharacterTile } from '@/components/library/CharacterTile';
import { CharacterListRow } from '@/components/library/CharacterListRow';
import { CharacterActionsMenu } from '@/components/library/CharacterActionsMenu';
import { Button } from '@/components/ui/button';
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
import { useLibraryViewPrefs } from '@/hooks/use-library-view-prefs';
import { useLibrarySelection } from '@/hooks/use-library-selection';
import {
  getHideUnusedLibraryTags,
  LIBRARY_DISPLAY_SETTINGS_EVENT,
} from '@/lib/local-settings';
import { downloadCharacterFile } from '@/lib/character-file';
import { downloadCharactersInBatch, WEB_BATCH_DOWNLOAD_LIMIT } from '@/lib/character-web-download';
import { exportCharactersToDirectory } from '@/lib/character-batch-export';
import { createTauriFs, isTauri, pickDirectory } from '@/lib/vault/tauri-fs';
import type { ArchiveCharacter, CharacterType } from '@/types/archive';
import {
  CHARACTER_TYPES,
  getAllCharacters,
  saveCharacter,
  deleteCharacter,
  getLibraryTagPreferences,
  saveLibraryTagPreferences,
  updateArchiveStory,
} from '@/lib/archive-db';
import { listStoryIndex } from '@/lib/archive-index';
import { importEmbeddedAssets } from '@/lib/card-embedded-assets';
import {
  applyLibraryImportType,
  applyLibraryImportTags,
  prepareLibraryCharacterFile,
  registerLibraryImportCustomTag,
  type PreparedLibraryCharacterImport,
} from '@/lib/library-character-import';
import { type TagCategory } from '@/lib/tag-taxonomy';
import {
  buildLibraryFilterSections,
  buildManagedTagOptions,
  getTagCategories,
  normalizeLibraryTagPreferences,
  type LibraryTagPreferences,
} from '@/lib/library-tag-preferences';
import {
  displayCharacterName,
  filterCharacters,
  sortCharacters,
  toggleTagFilter as toggleLibraryTagFilter,
  type LibrarySortKey,
} from '@/lib/library-query';
import { buildLibraryGroups } from '@/lib/library-grouping';

/** 类型筛选：all=不筛；none=未分类（type 为空） */
type TypeFilter = 'all' | CharacterType | 'none';

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
  const [tagPreferences, setTagPreferences] = useState<LibraryTagPreferences>(() =>
    normalizeLibraryTagPreferences(undefined),
  );
  const [uncategorizedExpanded, setUncategorizedExpanded] = useState(false);
  const [sortKey, setSortKey] = useState<LibrarySortKey>('recent');
  const [sortAsc, setSortAsc] = useState(false);
  const [batchExporting, setBatchExporting] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    items: PreparedLibraryCharacterImport[];
    failures: string[];
  } | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [batchTagOpen, setBatchTagOpen] = useState(false);
  /** 待确认删除（单删=长度1，批量=多条）；null=无弹窗 */
  const [pendingDelete, setPendingDelete] = useState<ArchiveCharacter[] | null>(null);
  /** 网页版一次选太多要先确认（只下前 WEB_BATCH_DOWNLOAD_LIMIT 张） */
  const [pendingWebExport, setPendingWebExport] = useState<ArchiveCharacter[] | null>(null);
  const [page, setPage] = useState(1);
  const [hideUnusedTags, setHideUnusedTags] = useState(() => getHideUnusedLibraryTags());
  const prefs = useLibraryViewPrefs();

  useEffect(() => {
    const syncDisplaySettings = () => setHideUnusedTags(getHideUnusedLibraryTags());
    window.addEventListener(LIBRARY_DISPLAY_SETTINGS_EVENT, syncDisplaySettings);
    return () => window.removeEventListener(LIBRARY_DISPLAY_SETTINGS_EVENT, syncDisplaySettings);
  }, []);

  const load = useCallback(async () => {
    try {
      const [chars, stories, preferences] = await Promise.all([
        getAllCharacters(),
        listStoryIndex(),
        getLibraryTagPreferences(),
      ]);
      setCharacters(chars);
      setTagPreferences(preferences);
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

  const handleTagPreferencesChange = useCallback(async (next: LibraryTagPreferences) => {
    const normalized = normalizeLibraryTagPreferences(next);
    await saveLibraryTagPreferences(normalized);
    setTagPreferences(normalized);
  }, []);

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selectedFiles = Array.from(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const results = await Promise.allSettled(selectedFiles.map(prepareLibraryCharacterFile));
    const items: PreparedLibraryCharacterImport[] = [];
    const failures: string[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') items.push(result.value);
      else {
        const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
        failures.push(`${selectedFiles[index].name}：${reason}`);
      }
    });
    if (items.length === 0) {
      toast({
        title: '没有可导入的角色卡',
        description: failures.slice(0, 3).join('\n'),
        variant: 'destructive',
      });
      return;
    }
    setPendingImport({ items, failures });
  };

  const handleConfirmImport = async (selection: LibraryImportTagSelection) => {
    if (!pendingImport || importBusy) return;
    setImportBusy(true);
    try {
      const tags = new Set(selection.tags);
      let nextPreferences = tagPreferences;
      if (selection.applyTags && selection.customTag) {
        const registered = registerLibraryImportCustomTag(nextPreferences, selection.customTag);
        nextPreferences = registered.preferences;
        tags.add(registered.raw);
      }
      if (nextPreferences !== tagPreferences) await handleTagPreferencesChange(nextPreferences);

      let ok = 0;
      let failedDuringSave = 0;
      let firstSaveError: string | undefined;
      for (const prepared of pendingImport.items) {
        try {
          let character = selection.applyTags
            ? applyLibraryImportTags(prepared.character, tags)
            : prepared.character;
          if (selection.type) character = applyLibraryImportType(character, selection.type);
          // 卡内嵌世界书/正则自动入库并挂关联（阶段9.5）
          const refs = await importEmbeddedAssets(character);
          if (refs.length > 0) character = { ...character, assets: refs };
          await saveCharacter(character);
          ok += 1;
        } catch (error) {
          failedDuringSave += 1;
          if (!firstSaveError) firstSaveError = error instanceof Error ? error.message : String(error);
        }
      }

      const failed = pendingImport.failures.length + failedDuringSave;
      const blankCount = pendingImport.items.filter((item) => item.kind === 'blank-image').length;
      await load();
      setPendingImport(null);
      toast({
        title: `导入完成：成功 ${ok} 张${failed ? `，失败 ${failed} 张` : ''}`,
        description: [
          blankCount > 0 ? `其中 ${blankCount} 张普通图片已创建为空白 V2 角色卡。` : undefined,
          firstSaveError ? `失败原因：${firstSaveError}` : undefined,
        ].filter(Boolean).join(' ') || undefined,
        variant: failed > 0 && ok === 0 ? 'destructive' : undefined,
      });
    } catch (error) {
      toast({
        title: '无法开始导入',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setImportBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete?.length) return;
    try {
      // 名下故事解除绑定（变为临时/未绑定），不连带删除
      const ids = new Set(pendingDelete.map((c) => c.id));
      // 只要 id + characterId 找出待解绑的故事；真正的改写走 updateArchiveStory（队列内重读最新记录）
      const stories = await listStoryIndex();
      await Promise.all(
        stories
          .filter((s) => s.characterId && ids.has(s.characterId))
          .map((s) => updateArchiveStory(s.id, () => ({ characterId: undefined, updatedAt: Date.now() }))),
      );
      for (const c of pendingDelete) await deleteCharacter(c.id);
      await load();
      selection.setSelected(new Set());
      toast({ title: `已删除 ${pendingDelete.length} 个角色（名下故事已转为未绑定，未被删除）` });
    } catch {
      toast({ title: '删除失败', variant: 'destructive' });
    } finally {
      setPendingDelete(null);
    }
  };

  /** 网页版：串行发起下载并据实报告结果（超出上限的先经确认，只下前一批） */
  const runWebExport = async (targets: ArchiveCharacter[]) => {
    setBatchExporting(true);
    try {
      const result = await downloadCharactersInBatch(targets);
      if (result.failed.length === 0) {
        toast({
          title: `已请求下载 ${result.downloaded.length} 张角色卡`,
          description: '浏览器可能会询问是否允许多个下载文件。',
        });
        return;
      }
      toast({
        title: result.downloaded.length > 0
          ? `已请求下载 ${result.downloaded.length} 张，${result.failed.length} 张失败`
          : `下载失败：${result.failed.length} 张均未开始`,
        description: result.failed.slice(0, 3).map((f) => `${f.name}：${f.error}`).join('\n'),
        variant: 'destructive',
      });
    } finally {
      setBatchExporting(false);
    }
  };

  /** 客户端选择一个目录后等待真实写入结果；网页版保留浏览器下载降级。 */
  const handleBatchExport = async () => {
    const targets = characters.filter((c) => selection.selected.has(c.id));
    if (targets.length === 0 || batchExporting) return;
    if (!isTauri()) {
      // 超过上限先问一句：浏览器连续下载几十个文件会开始拦截，闷头发起等于静默丢文件
      if (targets.length > WEB_BATCH_DOWNLOAD_LIMIT) {
        setPendingWebExport(targets);
        return;
      }
      await runWebExport(targets);
      return;
    }

    setBatchExporting(true);
    try {
      const root = await pickDirectory('选择角色卡导出文件夹');
      if (!root) {
        toast({ title: '已取消导出', description: '没有写入任何文件。' });
        return;
      }
      const result = await exportCharactersToDirectory(targets, createTauriFs(root));
      if (result.failed.length === 0) {
        toast({
          title: `已导出 ${result.exported.length} 张角色卡`,
          description: `保存到：${root}`,
        });
        return;
      }
      const detail = result.failed
        .slice(0, 3)
        .map((item) => `${item.fileName}：${item.error}`)
        .join('\n');
      toast({
        title: result.exported.length > 0
          ? `已导出 ${result.exported.length} 张，${result.failed.length} 张失败`
          : `导出失败：${result.failed.length} 张均未写入`,
        description: detail,
        variant: 'destructive',
      });
    } catch (error) {
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setBatchExporting(false);
    }
  };

  const handleSingleExport = async (character: ArchiveCharacter) => {
    if (!isTauri()) {
      downloadCharacterFile(character);
      toast({ title: `已请求下载「${displayCharacterName(character)}」` });
      return;
    }
    try {
      const root = await pickDirectory('选择角色卡导出文件夹');
      if (!root) {
        toast({ title: '已取消导出', description: '没有写入任何文件。' });
        return;
      }
      const result = await exportCharactersToDirectory([character], createTauriFs(root));
      if (result.failed.length === 0) {
        toast({ title: `已导出「${displayCharacterName(character)}」`, description: `保存到：${root}` });
      } else {
        toast({ title: '导出失败', description: result.failed[0]?.error, variant: 'destructive' });
      }
    } catch (error) {
      toast({
        title: '导出失败',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    }
  };

  const managedTagOptions = useMemo(
    () => buildManagedTagOptions(characters.flatMap((character) => character.tags), tagPreferences),
    [characters, tagPreferences],
  );
  const groupTagCategories = useMemo(() => getTagCategories(tagPreferences), [tagPreferences]);
  const { groupTagCategory, setGroupTagCategory } = prefs;
  useEffect(() => {
    if (!groupTagCategories.includes(groupTagCategory)) {
      setGroupTagCategory(groupTagCategories[0] ?? '人物');
    }
  }, [groupTagCategories, groupTagCategory, setGroupTagCategory]);
  const filterSections = useMemo(
    () => buildLibraryFilterSections(managedTagOptions, uncategorizedExpanded, tagPreferences, hideUnusedTags),
    [managedTagOptions, uncategorizedExpanded, tagPreferences, hideUnusedTags],
  );

  useEffect(() => {
    const visible = new Set(
      managedTagOptions
        .filter((option) => option.visible)
        .map((option) => option.raw),
    );
    setTagFilters((current) => {
      let changed = false;
      const next: Partial<Record<TagCategory, string[]>> = {};
      for (const [category, tags] of Object.entries(current)) {
        const kept = (tags ?? []).filter((raw) => visible.has(raw));
        if (kept.length !== (tags ?? []).length) changed = true;
        if (kept.length > 0) next[category as TagCategory] = kept;
      }
      return changed ? next : current;
    });
  }, [managedTagOptions]);

  /** 筛选栏计数：类型按 type 字段，标签按 raw 出现次数 */
  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of characters) m[c.type ?? 'none'] = (m[c.type ?? 'none'] ?? 0) + 1;
    return m;
  }, [characters]);
  const filtered = useMemo(() => {
    const list = filterCharacters(characters, { search: searchQuery, type: typeFilter, tags: tagFilters });
    return sortCharacters(list, sortKey, sortAsc, lastPlayed);
  }, [characters, searchQuery, tagFilters, typeFilter, sortKey, sortAsc, lastPlayed]);

  // 筛选/搜索/排序/每页数变化时回到第 1 页
  useEffect(() => {
    setPage(1);
  }, [searchQuery, tagFilters, typeFilter, sortKey, sortAsc, prefs.pageSize]);

  const selection = useLibrarySelection(filtered, page);

  const { pageSize } = prefs;
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
  const groupedPageItems = useMemo(
    () => buildLibraryGroups(pageItems, prefs.groupBy, { tagCategory: prefs.groupTagCategory }),
    [pageItems, prefs.groupBy, prefs.groupTagCategory],
  );

  const toggleTagFilter = (cat: TagCategory, raw: string) => {
    setTagFilters((f) => toggleLibraryTagFilter(f, cat, raw) as Partial<Record<TagCategory, string[]>>);
  };

  const activeFilterChips: ActiveFilterChip[] = [
    ...(typeFilter !== 'all'
      ? [{ key: 'type', label: `类型:${typeFilter === 'none' ? '未分类' : typeFilter}`, clear: () => setTypeFilter('all') }]
      : []),
    ...Object.entries(tagFilters).flatMap(([cat, raws]) => (raws ?? []).map((raw) => ({
      key: raw,
      label: raw,
      clear: () => toggleTagFilter(cat as TagCategory, raw),
    }))),
  ];

  const nameSize = Math.round(15 * prefs.fontScale);
  const introSize = Math.round(12 * prefs.fontScale);

  /** 卡面与列表行共用的一份接线：点击 = 批量选择或进角色页 */
  const activate = (c: ArchiveCharacter) => (shiftKey: boolean) => {
    if (selection.batchMode) selection.clickCharacter(c, shiftKey);
    else navigate(`/character/${c.id}`);
  };
  const menuFor = (c: ArchiveCharacter, triggerClassName: string, iconClassName?: string) => (
    <CharacterActionsMenu
      onOpen={() => navigate(`/character/${c.id}`)}
      onExport={() => void handleSingleExport(c)}
      onDelete={() => setPendingDelete([c])}
      triggerClassName={triggerClassName}
      iconClassName={iconClassName}
    />
  );

  return (
    <AppLayout>
      <div className="h-full flex flex-col overflow-hidden">
        <LibraryToolbar
          characterCount={characters.length}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenTagManager={() => setTagManagerOpen(true)}
          batchMode={selection.batchMode}
          onToggleBatchMode={() =>
            (selection.batchMode ? selection.exitBatchMode() : selection.enterBatchMode())}
          activeFilterChips={activeFilterChips}
          onClearAllFilters={() => { setTagFilters({}); setTypeFilter('all'); setSearchQuery(''); }}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
          sortAsc={sortAsc}
          onSortAscToggle={() => setSortAsc((v) => !v)}
          viewMode={prefs.viewMode}
          onViewModeChange={prefs.setViewMode}
          groupBy={prefs.groupBy}
          onGroupByChange={prefs.setGroupBy}
          groupTagCategory={prefs.groupTagCategory}
          groupTagCategories={groupTagCategories}
          onGroupTagCategoryChange={prefs.setGroupTagCategory}
          cardWidth={prefs.cardWidth}
          onCardWidthChange={prefs.setCardWidth}
          fontScale={prefs.fontScale}
          onFontScaleChange={prefs.setFontScale}
          fileInputRef={fileInputRef}
          onPickFiles={handleImportFiles}
        />

        {/* ===== 内容区：标签筛选栏 + 卡墙 ===== */}
        <div className="flex-1 min-h-0 flex">
          <LibraryFilterRail
            typeOptions={CHARACTER_TYPES.map((type) => ({
              value: type,
              label: type,
              count: typeCounts[type] ?? 0,
            }))}
            unclassifiedCount={typeCounts.none ?? 0}
            activeType={typeFilter}
            sections={filterSections}
            activeTags={tagFilters}
            uncategorizedExpanded={uncategorizedExpanded}
            onTypeChange={(value) => setTypeFilter(value as TypeFilter)}
            onTagToggle={toggleTagFilter}
            onUncategorizedExpandedChange={setUncategorizedExpanded}
          />

          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-6 py-3">
            {loading ? (
              <div
                className="grid gap-3.5"
                style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${prefs.cardWidth}px, 1fr))` }}
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
                {prefs.viewMode === 'grid' ? (
                  /* 卡墙：auto-fill 按卡宽自动分列；卡图 2:3（红线：比例不可改、不加编号） */
                  <div className="space-y-7">
                    {groupedPageItems.map((group) => (
                      <section key={group.key} aria-label={`${group.label}分组`}>
                        {prefs.groupBy !== 'none' && (
                          <div className="mb-3 flex items-center gap-2.5">
                            <span className="h-4 w-1 rounded-full bg-brand" aria-hidden="true" />
                            <h2 className="font-serif text-base font-semibold text-[color:var(--text-primary)]">
                              {group.label}
                            </h2>
                            <span className="rounded-full bg-[var(--brand-active-bg)] px-2 py-0.5 text-[11px] text-brand">
                              {group.items.length} 张
                            </span>
                            <span className="h-px flex-1 bg-[color:var(--hairline-inner)]" aria-hidden="true" />
                          </div>
                        )}
                        <div
                          className="grid gap-3.5 content-start"
                          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${prefs.cardWidth}px, 1fr))` }}
                        >
                          {group.items.map((c) => (
                            <CharacterTile
                              key={c.id}
                              character={c}
                              storyCount={storyCounts[c.id] ?? 0}
                              timestamp={lastPlayed[c.id] ?? c.updatedAt}
                              nameSize={nameSize}
                              introSize={introSize}
                              batchMode={selection.batchMode}
                              selected={selection.selected.has(c.id)}
                              onActivate={activate(c)}
                              actions={menuFor(
                                c,
                                'w-6 h-6 rounded-full bg-[rgba(0,0,0,0.65)] backdrop-blur-sm text-white/80 flex items-center justify-center opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 transition-opacity',
                              )}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  /* 列表视图：小缩略图 + 名字/简介 + 评分/故事数/时间 */
                  <div className="rounded-xl border border-border bg-[var(--bg-canvas)]">
                    <LibraryListHeader batchMode={selection.batchMode} />
                    <div className="divide-y divide-[color:var(--hairline-inner)]">
                      {pageItems.map((c) => (
                        <CharacterListRow
                          key={c.id}
                          character={c}
                          storyCount={storyCounts[c.id] ?? 0}
                          timestamp={lastPlayed[c.id] ?? c.updatedAt}
                          nameSize={Math.round(14 * prefs.fontScale)}
                          introSize={introSize}
                          batchMode={selection.batchMode}
                          selected={selection.selected.has(c.id)}
                          onActivate={activate(c)}
                          actions={menuFor(
                            c,
                            'w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-[var(--hover-overlay)] hover:text-[color:var(--text-body)]',
                            'w-4 h-4',
                          )}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {filtered.length > 0 && (
                  <LibraryPager
                    total={filtered.length}
                    page={page}
                    pageCount={pageCount}
                    pageSize={pageSize}
                    onPageSizeChange={prefs.setPageSize}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {selection.batchMode && (
        <LibraryBatchBar
          selectedCount={selection.selected.size}
          filteredCount={filtered.length}
          onSelectAllToggle={selection.toggleSelectAll}
          onTag={() => setBatchTagOpen(true)}
          onExport={() => void handleBatchExport()}
          exporting={batchExporting}
          onDelete={() => setPendingDelete(characters.filter((c) => selection.selected.has(c.id)))}
          onExit={selection.exitBatchMode}
        />
      )}

      <LibraryImportDialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        items={pendingImport?.items ?? []}
        failures={pendingImport?.failures ?? []}
        tagOptions={managedTagOptions}
        busy={importBusy}
        onConfirm={handleConfirmImport}
      />
      <TagManagerDialog
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        characters={characters}
        selectedCharacters={characters.filter((character) => selection.selected.has(character.id))}
        preferences={tagPreferences}
        onPreferencesChange={handleTagPreferencesChange}
        onChanged={() => void load()}
      />
      <BatchTagDialog
        open={batchTagOpen}
        onOpenChange={setBatchTagOpen}
        targets={characters.filter((c) => selection.selected.has(c.id))}
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

      <AlertDialog open={!!pendingWebExport} onOpenChange={(open) => !open && setPendingWebExport(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>网页版一次最多下载 {WEB_BATCH_DOWNLOAD_LIMIT} 张</AlertDialogTitle>
            <AlertDialogDescription>
              你选了 {pendingWebExport?.length ?? 0} 张。浏览器连续下载几十个文件会开始拦截，
              继续将只下载前 {WEB_BATCH_DOWNLOAD_LIMIT} 张，其余请分批再来一次。
              <span className="block mt-2">要一次导出整库，请用客户端——它是选一个文件夹直接写入，没有这个限制。</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const batch = (pendingWebExport ?? []).slice(0, WEB_BATCH_DOWNLOAD_LIMIT);
                setPendingWebExport(null);
                void runWebExport(batch);
              }}
            >
              下载前 {WEB_BATCH_DOWNLOAD_LIMIT} 张
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Library;
