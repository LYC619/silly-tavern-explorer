import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('前端状态刷新契约', () => {


  // TODO(阶段 B2 遗留)：这条仍是源码 grep。导入弹窗的行为测试见
  // library-import-dialog.test.tsx / library-character-import.test.ts，
  // 但 Library.tsx 把它们接起来的这段还没有等价的行为覆盖，按「不允许先删后补」暂留。
  it('角色库导入先准备文件和标签选择，再保存可导出的空白图片卡', () => {
    const library = read('src/pages/Library.tsx');

    expect(library).toContain("from '@/components/library/LibraryImportDialog'");
    expect(library).toContain('prepareLibraryCharacterFile');
    expect(library).toContain('registerLibraryImportCustomTag');
    expect(library).toContain('applyLibraryImportTags');
    expect(library).toContain('<LibraryImportDialog');
    expect(library).toContain('await importEmbeddedAssets(character)');
    expect(library).toContain('await saveCharacter(character)');
  });


  it('角色页快速标签使用宽版多列勾选面板并包含未分类', () => {
    const header = read('src/components/character/CharacterHeader.tsx');
    expect(header).toContain("from '@/components/ui/popover'");
    expect(header).toContain("from '@/components/ui/checkbox'");
    expect(header).toContain("category === '未分类'");
    expect(header).toContain('grid-cols-2');
    expect(header).toContain('onCheckedChange');
    expect(header).not.toContain('DropdownMenuContent');
  });

  it('状态栏不再展示 ST 接入与数据占用（0801 反馈挪设置页），也不永久缓存状态', () => {
    const source = read('src/components/AppLayout.tsx');
    expect(source).not.toContain('let statusCache');
    const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).not.toContain('已接入 ST 目录');
    expect(footer).not.toContain('usage');
  });

  it('侧栏只在离开首页时自动折叠，其他页面切换不覆盖用户选择', () => {
    const hook = read('src/hooks/use-sidenav-state.ts');
    const layout = read('src/components/AppLayout.tsx');
    expect(hook).toContain('shouldAutoCollapse');
    expect(layout).toContain('useSidenavState()');
    expect(layout).toContain('shouldAutoCollapse(previousPathRef.current, location.pathname)');
  });

  it('STImportCard 只保留首页入口，整理故事选择页不再重复扫描 ST', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain('onChanged?: () => void');
    expect(home).toContain('onChanged={handleSTChanged}');
    expect(home).toContain("stConnected === false");
    expect(tools).not.toContain('STImportCard');
    expect(tools).not.toContain('重新扫描 ST');
  });

  it('首页欢迎语只报归档数，不再堆书名+楼层+时间', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('您已经归档了');
    expect(home).not.toContain('你上次在');
  });
  // TODO(阶段 B3 遗留)：从 editor-chat-session.test.ts 迁来的最后一条 grep。
  // 该文件其余断言已换成 editor-chat-session.test.tsx 里的页面行为测试；
  // 这条要等价覆盖需要渲染 CharacterPage（595 行、依赖立绘与资产区），
  // 按「不允许先删后补」暂留，等 C3 拆完 CharacterPage 再补行为用例。
  it('角色页普通处理进入 Chat，整理和导出仍进入对应故事视图', () => {
    const page = read('src/pages/CharacterPage.tsx');
    expect(page).toContain('buildEditorChatPath');
    expect(page).toContain('buildEditorStoryPath');
    expect(page).toContain('setEditorStoryId(storyId)');
  });
  // TODO(阶段 B3 遗留)：从 editor-mode-restoration.test.ts 迁来的两条 grep。
  // 该文件其余 13 条已换成 editor-mode-restoration.test.tsx / st-ai-config-dialog.test.tsx
  // 里的行为测试；这两条要等价覆盖需要分别渲染 Home.tsx 和 StoryWorkspace.tsx，
  // 按「不允许先删后补」暂留。Home 的行为覆盖并入后续 Home 批次一起做。
  it('首页编辑区入口直达聊天工作台，故事工作区记住当前故事', () => {
    const home = read('src/pages/Home.tsx');
    const workspace = read('src/pages/StoryWorkspace.tsx');

    expect(home).toMatch(/label="进入编辑区"[^\n]*navigate\('\/chat'\)/);
    expect(workspace).toContain('setEditorStoryId');
  });
});

describe('四主题覆盖契约', () => {
  it('全屏阅读器使用主题画布而非固定黑白背景', () => {
    for (const path of [
      'src/components/reader/ReaderView.tsx',
      'src/components/reader/NovelView.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain('bg-canvas');
      expect(source).not.toMatch(/bg-\[#f8f5ec\]|dark:bg-\[#1a1a1a\]/);
    }
  });

  it('状态栏不在文字 token 之外叠加整体透明度', () => {
    const source = read('src/components/AppLayout.tsx');
    const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).not.toContain('opacity-70');
  });
});

describe('卡片键盘操作契约', () => {
  it('角色卡和资产卡提供聚焦与键盘激活', () => {
    // 角色卡（Library）这部分已由 library-card-keyboard.test.tsx 的 5 项行为覆盖：
    // 可聚焦、Enter/空格激活、子元素按键不冒泡、批量模式下 Shift+Enter 范围选。
    // 阶段 C2 把卡片抽成 <CharacterTile>/<CharacterListRow> 后，grep 页面源码已不成立。
    // 资产卡（AssetLibrary）还没有等价行为测试，暂留 grep（TODO：随资产库批次一起换）。
    const assets = read('src/pages/AssetLibrary.tsx');
    expect(assets).toContain('tabIndex={0}');
    expect(assets).toContain("e.key === 'Enter' || e.key === ' '");
    expect(assets).toContain('focus-visible:ring-2');
    expect(assets).toContain('e.target !== e.currentTarget');
  });

  it('首页编辑区入口不伪装成拖放区', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('进入编辑区');
    expect(home).not.toContain('丢进来，不用先建档');
  });

  it('编辑区不重复提供紧凑 ST 扫描入口', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain("variant?: 'full' | 'compact'");
    expect(tools).not.toContain('variant="compact"');
  });

  it('首页表面和编辑区搜索焦点使用实际生成的语义样式', () => {
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(home).toContain('bg-[var(--bg-elevated)]');
    expect(home).not.toContain('bg-elevated/40');
    expect(tools).toContain('focus-visible:ring-ring');
    expect(tools).not.toContain('focus:ring-brand/30');
  });
});

describe('阶段 D 外壳与 NSFW 契约', () => {
  it('首页两处缩略图与角色详情左栏共用 NSFW 图片包装并接入默认设置', () => {
    const rail = read('src/components/character/CharacterInfoRail.tsx');
    const image = read('src/components/NsfwImage.tsx');
    // 首页那两处已由 home-character-rail.test.tsx 的行为断言覆盖（渲染后查
    // data-nsfw-blurred，并验证关掉全局设置后两处一起恢复清晰）。阶段 C2 把角色卡
    // 抽成 <CharacterTile>/<CharacterPortrait> 后，数 Home.tsx 里 <NsfwImage 的
    // 出现次数已不成立——包装还在，只是挪进了组件。
    expect(rail).toContain("import { NsfwImage } from '@/components/NsfwImage'");
    expect(rail).toContain('nsfwRevealed');
    expect(image).toContain('getNsfwBlur()');
    expect(image).toContain('shouldBlurNsfw');
  });

  it('首页使用角色级查看时间、展示名与共享时间显示工具', () => {
    const home = read('src/pages/Home.tsx');
    const characterPage = read('src/pages/CharacterPage.tsx');
    expect(home).toContain('displayCharacterName');
    expect(home).toContain('c.lastViewedAt');
    expect(home).not.toContain('lastViewedByChar');
    expect(characterPage).toContain('markCharacterViewed');
    expect(home).toContain('formatListTime');
    expect(home).toContain('formatFullTime');
    expect(home).not.toContain('function relativeTime');
  });

  it('角色页提供就地角色卡编辑与开场白页签，并保留名称双层语义', () => {
    const characterPage = read('src/pages/CharacterPage.tsx');
    const rail = read('src/components/character/CharacterInfoRail.tsx');
    expect(characterPage).toContain('CharacterCardEditSection');
    expect(characterPage).toContain('GreetingsSection');
    expect(characterPage).toContain('角色卡编辑');
    expect(characterPage).toContain('开场白');
    expect(characterPage).toContain('applyCharacterPageCardEdits');
    expect(characterPage).toContain('实际名');
    expect(characterPage).toContain('展示名');
    expect(rail).toContain('w-[304px]');
    expect(rail).toContain('text-sm');
    expect(rail).toContain('var(--character-label)');
  });

  it('展示名草稿跟随档案值同步，跨角色直跳时保存被守卫拦截', () => {
    const characterPage = read('src/pages/CharacterPage.tsx');
    // 双入口（铅笔弹窗/卡编辑页签）同步：档案 displayMeta.name 变化必须刷新草稿，防旧草稿回写。
    expect(characterPage).toContain('[character?.displayMeta?.name]');
    // id 已切换但旧角色仍在闭包时禁止写入新 id 的档案。
    expect(characterPage.match(/character\.id !== id/g)?.length).toBeGreaterThanOrEqual(2);
    // 用户手输标签入口统一走 validateUserTagInput（类型保留字/评价档位拒收）。
    const batchDialog = read('src/components/library/BatchTagDialog.tsx');
    expect(batchDialog).toContain('validateUserTagInput');
    const libraryImport = read('src/lib/library-character-import.ts');
    expect(libraryImport).toContain('validateUserTagInput');
    const tagManager = read('src/components/library/TagManagerDialog.tsx');
    expect(tagManager).toContain('validateUserTagInput');
    // 角色页设类型也走域函数清理「类型/*」污染（与标签管理、导入两条路径一致）。
    expect(characterPage).toContain('applyCharacterTypePatch');
  });

  it('无 tab 的其他资产入口显示真实归档浏览器，不再重复三类既有资产', () => {
    const assets = read('src/pages/AssetLibrary.tsx');
    expect(assets).toContain("import { OtherAssetsBrowser } from '@/components/assets/OtherAssetsBrowser'");
    expect(assets).toContain('<OtherAssetsBrowser />');
    expect(assets).not.toContain('OtherAssetsEmptyState');
    expect(assets).not.toContain('选择一个资产库开始处理');
    expect(assets).toContain('tab === null');
  });

  it('资产库持续显示从 ST 恢复的全局世界书标记', () => {
    const assets = read('src/pages/AssetLibrary.tsx');
    expect(assets).toContain('ST 全局');
  });

  it('编辑区展开态在 AppLayout 路由重挂后从模块状态恢复', () => {
    const layout = read('src/components/AppLayout.tsx');
    expect(layout).toContain('getEditorOpen()');
    expect(layout).toContain('setEditorOpenState');
    expect(layout).not.toContain('useState(false)');
  });

  it('编辑区侧栏只保留正式子界面，不把最近记录混入导航', () => {
    const layout = read('src/components/AppLayout.tsx');
    expect(layout).not.toContain('EditorRecentList');
    expect(layout).not.toContain("@/lib/editor-recent");
    expect(layout).toContain('area.children.map((child)');
  });

  it('故事工作区把最近条目的 initialTarget 交给整理面板', () => {
    const workspace = read('src/pages/StoryWorkspace.tsx');
    expect(workspace).toContain('initialTarget?: OrganizeTarget');
    expect(workspace).toContain('initialTarget={initialTarget}');
  });

  it('角色卡深链优先于 session 指针恢复', () => {
    const viewer = read('src/pages/CardViewer.tsx');
    expect(viewer).toContain('useSearchParams()');
    expect(viewer).toContain("searchParams.get('assetId')");
    expect(viewer).toContain('if (assetId)');
  });

  it('10.4 设置页提供五个可持久化分区且一次只选择一个面板', () => {
    const page = read('src/pages/SettingsPage.tsx');
    const runtime = read('src/components/settings/RuntimeSettingsPanel.tsx');
    const global = read('src/components/GlobalSettings.tsx');

    for (const label of ['显示', 'AI 配置', '目录与连接', '数据与备份', '关于与引导']) {
      expect(page).toContain(`label: '${label}'`);
    }
    expect(page).toContain('loadSettingsSection');
    expect(page).toContain('saveSettingsSection');
    expect(page).toContain('switch (activeSection)');
    expect(page).toContain('md:grid-cols-[190px_minmax(0,1fr)]');
    expect(page).toContain('overflow-x-auto');
    expect(page).not.toContain('<RuntimeSettingsPanel');
    expect(page).not.toContain('<GlobalSettingsPanel');

    expect(runtime).toContain('export function DisplaySettingsPanel');
    expect(runtime).toContain('export function DirectorySettingsPanel');
    expect(runtime).toContain('getNsfwBlur');
    expect(runtime).toContain('setNsfwBlur');
    expect(runtime).toContain('getHideUnusedLibraryTags');
    expect(runtime).toContain('setHideUnusedLibraryTags');
    expect(runtime).toContain('隐藏未使用标签');
    expect(runtime).toContain("getAppConfig<string>('stRoot')");
    expect(runtime).toContain("setAppConfig('stRoot', root)");
    expect(runtime).toContain('pickDirectory');
    expect(runtime).toContain('<STImportCard');
    expect(runtime).toContain('root={stRoot}');
    expect(read('src/components/tools/STImportCard.tsx')).toContain('重新扫描并选择');
    expect(runtime).toContain('chooseVaultForNextBoot');
    expect(runtime).toContain('getVaultRoot');
    expect(runtime).toContain('window.location.reload()');
    expect(global).toContain('export function DataSettingsPanel');
    expect(global).toContain('export function AboutSettingsPanel');
  });

  it('ST 扫描只有安全警告时会把被跳过路径告诉用户', () => {
    const importer = read('src/components/tools/STImportCard.tsx');
    expect(importer).toContain("scan.warnings.length ? '未发现可安全导入的内容'");
    expect(importer).toContain('scan.warnings.slice(0, 3)');
  });

  it('ST 导入使用分类选择与摘要优先的视口安全弹窗', () => {
    const importer = read('src/components/tools/STImportCard.tsx');
    const selection = read('src/components/tools/st-import/STImportSelectionDialog.tsx');
    const result = read('src/components/tools/st-import/STImportResultDialog.tsx');

    expect(importer).toContain('<STImportSelectionDialog');
    expect(importer).toContain('<STImportResultDialog');
    expect(selection).toContain('<Tabs');
    expect(selection).toContain('max-h-[calc(100vh-2rem)]');
    expect(selection).toContain('min-h-0 overflow-y-auto');
    expect(result).toContain('groupUnresolvedRelationships');
    expect(result).toContain('查看完整处理明细');
    expect(result).toContain('max-h-[calc(100vh-2rem)]');
    expect(result).toContain('min-h-0 overflow-y-auto');
    for (const label of ['角色', '故事', '世界书', '预设', '正则', '其他资产']) {
      expect(result).toContain(`label="${label}"`);
    }
    expect(result).not.toContain('label="原样归档"');
    expect(result).toContain('可在“附属库 → 其他资产”查看');
  });

  it('导入结果换批次时完整明细重新默认折叠', () => {
    const result = read('src/components/tools/st-import/STImportResultDialog.tsx');
    expect(result).toContain('useEffect(() => { setDetailsOpen(false); }, [result])');
  });

  it('AppLayout 路由切换只保留一个页面节点并提供短入场动画', () => {
    const app = read('src/App.tsx');
    const layout = read('src/components/AppLayout.tsx');
    expect(app).toContain('<Route element={<AppLayout />}>');
    expect(layout).toContain('useOutlet()');
    expect(layout).not.toContain('mode="popLayout"');
    expect(layout).not.toContain('mode="wait"');
    // key 只按 pathname：query 参数换子视图（编辑区 ?view=）不许重挂整页，
    // 行为断言见 app-layout-navigation.test.tsx
    expect(layout).toContain('key={location.pathname}');
    expect(layout).toContain('transition={{ duration: 0.12');
    expect(layout).not.toContain('exit={{ opacity: 0');
    expect(layout).toContain('LayoutContext');
  });

  it('首页先复用模块快照并在挂载后后台刷新', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('let homeSnapshot');
    expect(home).toContain('homeSnapshot.characters');
    expect(home).toContain('homeSnapshot.stories');
    expect(home).toContain('homeSnapshot.recentStories');
    expect(home).toContain('homeSnapshot.resources');
    expect(home).toContain('homeSnapshot.assetCounts');
    expect(home).toContain('homeSnapshot = nextSnapshot');
    expect(home).toContain('useEffect(() => { void loadData(); }, [loadData])');
  });

  it('首页占满视口并保持左右双列，只有故事列表内部滚动', () => {
    const home = read('src/pages/Home.tsx');
    const rootClass = home.match(/<div className="([^"]+)" data-home-resource-cache/)?.[1] ?? '';
    const primaryColumnClass = home.match(/className="([^"]+)" data-home-primary-column/)?.[1] ?? '';
    expect(rootClass.split(/\s+/)).toEqual(expect.arrayContaining([
      'h-full',
      'min-h-0',
      'overflow-hidden',
    ]));
    expect(home).toContain('data-home-columns');
    expect(home).toContain('data-home-primary-column');
    expect(home).toContain('data-home-secondary-column');
    expect(home).toContain('data-home-character-rail');
    expect(home).toContain('data-home-character-card');
    expect(home).toContain('data-home-story-scroll');
    expect(home).not.toContain('HOME_RECENT_CHARACTER_CARD_WIDTH');
    expect(primaryColumnClass.split(/\s+/)).toEqual(expect.arrayContaining([
      'grid',
      'grid-rows-[minmax(0,3fr)_minmax(0,2fr)]',
    ]));
    expect(home).toContain('auto-rows-[calc((100%-1rem)/3)]');
    expect(home).toContain('aspect-[3/4] h-full max-h-14');
  });

  it('首页摘要进入窗口栏，内容区按单列编辑与完整角色卡重新分配空间', () => {
    const home = read('src/pages/Home.tsx');
    const layout = read('src/components/AppLayout.tsx');
    const titleBar = read('src/components/ClientTitleBar.tsx');

    expect(home).toContain('titleBarContent=');
    expect(home).toContain('data-home-title-summary');
    expect(home).not.toContain('<h1 className=');
    expect(layout).toContain('titleBarContent?: React.ReactNode');
    expect(layout).toContain('titleBarContent={activeChrome.titleBarContent}');
    expect(titleBar).toContain('titleBarContent?: React.ReactNode');

    expect(home).toContain("surface.addEventListener('wheel', handleWheel, { passive: false })");
    expect(home).toContain("surface.removeEventListener('wheel', handleWheel)");
    expect(home).toContain('const surface = characterWheelSurfaceRef.current');
    expect(home).toContain('ref={characterWheelSurfaceRef}');
    expect(home).toContain('ref={characterRailRef}');
    expect(home).not.toContain('snap-x');
    expect(home).not.toContain('snap-proximity');
    expect(home).not.toContain('snap-start');
    // 卡面本身（2:3 比例、4/5 列宽度、评分与故事数角标）已由
    // home-character-rail.test.tsx 的行为断言覆盖；阶段 C2 起卡片是 <CharacterTile>，
    // 再 grep Home.tsx 里的类名与 JSX 片段只会误红。

    const editTools = home.match(/const EDIT_TOOLS = \[[\s\S]*?\n\];/)?.[0] ?? '';
    expect(editTools).toContain("label: '总结'");
    expect(editTools).toContain('EDITOR_TOOL_COPY.summaryAndTree');
    expect(editTools).not.toContain("label: '故事树'");
    expect(home).toContain('grid-cols-1 grid-rows-5');
    expect(home).toContain('section className="flex-[3]');
    expect(home).toContain('section className="flex-[2]');
    expect(home).toContain('grid grid-cols-2 auto-rows-[calc((100%-1rem)/3)] gap-2 overflow-y-auto');
    expect(home).toContain('pickRecentlyViewedStories(allStories, 12)');

    expect(home).toContain('font-serif text-xl font-semibold');
    expect(home).toContain('data-home-story-heading');
    const storyHeading = home.match(/<div[^>]+data-home-story-heading[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(storyHeading).toContain('最近在看的故事');
    expect(storyHeading).toContain('滚动查看更多故事。');
    expect(storyHeading).not.toContain('<p');

    expect(home).toContain('cell.description');
    expect(home).toContain("description: '整理世界设定条目与角色关联'");
    expect(home).toContain("description: '复用提示词、顺序和生成参数'");
    expect(home).toContain("description: '管理聊天清理与替换规则'");
    expect(home).toContain('连接 SillyTavern 目录与接口');
  });

  it('首页编辑入口在保留单行摘要时，为鼠标和键盘提供完整说明', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain("from '@/components/ui/tooltip'");
    expect(home).toContain('<Tooltip key={tool.label}>');
    expect(home).toContain('<TooltipTrigger asChild>');
    expect(home).toContain('<TooltipContent');
    expect(home).toContain('{tool.description}');
    expect(home).toContain('block truncate text-[11px]');
  });

  it('侧栏分区箭头固定在父级行，不随展开内容向下移动', () => {
    const layout = read('src/components/AppLayout.tsx');
    const parentStart = layout.indexOf('<div className="relative" data-nav-parent-row>');
    const animationStart = layout.indexOf('<AnimatePresence initial={false}>', parentStart);
    expect(parentStart).toBeGreaterThanOrEqual(0);
    expect(animationStart).toBeGreaterThan(parentStart);
    const parentRegion = layout.slice(parentStart, animationStart);
    expect(parentRegion).toContain('<SideItem');
    expect(parentRegion).toContain('<ChevronDown');
    expect(parentRegion.trimEnd()).toMatch(/<\/div>$/);
  });

  it('导入入口明确区分跳过与更新归档策略', () => {
    const importer = read('src/components/tools/STImportCard.tsx');
    const selection = read('src/components/tools/st-import/STImportSelectionDialog.tsx');
    const result = read('src/components/tools/st-import/STImportResultDialog.tsx');
    const presentation = read('src/lib/vault/st-import-presentation.ts');
    expect(importer).toContain('IMPORT_POLICY_SUMMARY');
    expect(selection).toContain('IMPORT_POLICY_SUMMARY');
    expect(result).toContain('IMPORT_POLICY_SUMMARY');
    expect(presentation).toContain('同一路径的角色、聊天、世界书、预设和正则会跳过');
    expect(presentation).toContain('其他资产按同路径更新归档');
    expect(importer).not.toContain('已有来源会安全跳过');
  });

  it('ST 导入按用户可理解的其他资产类别展示来源与去向', () => {
    const selection = read('src/components/tools/st-import/STImportSelectionDialog.tsx');
    expect(selection).toContain("label: '其他资产'");
    expect(selection).toContain('group.label');
    expect(selection).toContain('group.description');
    expect(selection).toContain('group.itemCount');
    expect(selection).not.toContain('title={`${group.kind}/`}');
    expect(selection).not.toContain("label: '扩展与媒体'");
  });

  it('多库配置读取失败时不把现有配置静默当成空注册表覆盖', () => {
    const store = read('src/lib/vault/vault-registry-store.ts');
    expect(store).not.toContain('getAppConfig<unknown>(REGISTRY_KEY).catch(() => null)');
    expect(store).not.toContain('getVaultRoot().catch(() => null)');
    expect(store).toContain('const [raw, legacyRootValue] = await Promise.all');
    expect(store).toContain("typeof legacyRootValue === 'string'");
  });

  it('启动时验证活动库根目录，失效路径回到选库引导而不是放行坏后端', () => {
    const bootstrap = read('src/lib/vault/bootstrap.ts');
    expect(bootstrap).toContain("await fs.stat('')");
    expect(bootstrap).toContain("return 'unset'");
  });

  it('已注册库切换失败时显示可见错误，而不是留下未处理 Promise', () => {
    const runtime = read('src/components/settings/RuntimeSettingsPanel.tsx');
    expect(runtime).toContain('handleActivateRegisteredVault');
    expect(runtime).toContain("title: '切换已注册库失败'");
  });

  it('侧栏库切换和首次选库失败时都给出可恢复的可见反馈', () => {
    const switcher = read('src/components/vault/VaultSwitcher.tsx');
    const gate = read('src/components/vault/VaultGate.tsx');
    expect(switcher).toContain('if (!profile) throw');
    expect(gate).toContain('setError');
    expect(gate).toContain('role="alert"');
  });

  it('全局搜索键盘导航基于分组后的视觉顺序', () => {
    const search = read('src/components/GlobalSearch.tsx');
    expect(search).toContain('flattenSearchGroups(groups)');
    expect(search).not.toContain('results.indexOf(item)');
  });

  it('全局搜索用 Ctrl+F 覆盖 WebView2 自带的页内查找', () => {
    const search = read('src/components/GlobalSearch.tsx');
    expect(search).toContain("e.ctrlKey && e.key.toLowerCase() === 'f'");
    expect(search).toContain('e.preventDefault()');
    expect(search).toContain('>Ctrl+F</span>');
    expect(search).not.toContain("e.key.toLowerCase() === 'k'");
    expect(search).not.toContain('⌘K');
  });

  it('全局搜索所在标题栏高于带 transform 的路由内容', () => {
    const titleBar = read('src/components/ClientTitleBar.tsx');
    const layout = read('src/components/AppLayout.tsx');
    expect(titleBar).toContain('relative z-[60] h-11');
    expect(layout).toContain('relative z-[60] h-9');
  });

  it('Tauri 客户端将全局搜索并入可拖动的自定义窗口栏', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json'));
    const capability = JSON.parse(read('src-tauri/capabilities/default.json'));
    const layout = read('src/components/AppLayout.tsx');
    const titleBarPath = resolve(process.cwd(), 'src/components/ClientTitleBar.tsx');

    expect(config.app.windows[0].decorations).toBe(false);
    expect(capability.permissions).toEqual(expect.arrayContaining([
      'core:window:allow-start-dragging',
      'core:window:allow-minimize',
      'core:window:allow-toggle-maximize',
      'core:window:allow-close',
    ]));
    expect(layout).toContain('<ClientTitleBar');
    expect(layout).toContain('titleBarContent={activeChrome.titleBarContent}');
    expect(existsSync(titleBarPath)).toBe(true);
    if (!existsSync(titleBarPath)) return;

    const titleBar = read('src/components/ClientTitleBar.tsx');
    expect(titleBar).toContain('data-tauri-drag-region');
    expect(titleBar).toContain('<GlobalSearch />');
    expect(titleBar).toContain("aria-label=\"最小化窗口\"");
    expect(titleBar).toContain("aria-label={maximized ? '还原窗口' : '最大化窗口'}");
    expect(titleBar).toContain("aria-label=\"关闭窗口\"");
    expect(titleBar).toContain('.minimize()');
    expect(titleBar).toContain('.toggleMaximize()');
    expect(titleBar).toContain('.close()');
  });
});
