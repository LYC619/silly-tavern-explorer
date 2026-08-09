import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('前端状态刷新契约', () => {
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

  it('STImportCard 暴露变更通知，首页和编辑区接入刷新；首页仅未接入时显示', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain('onChanged?: () => void');
    expect(home).toContain('onChanged={handleSTChanged}');
    expect(home).toContain("stConnected === false");
    expect(tools).toContain('onChanged={handleSTChanged}');
  });

  it('首页欢迎语只报归档数，不再堆书名+楼层+时间', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('您已经归档了');
    expect(home).not.toContain('你上次在');
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
    const library = read('src/pages/Library.tsx');
    const assets = read('src/pages/AssetLibrary.tsx');
    for (const source of [library, assets]) {
      expect(source).toContain('tabIndex={0}');
      expect(source).toContain("e.key === 'Enter' || e.key === ' '");
      expect(source).toContain('focus-visible:ring-2');
      expect(source).toContain('e.target !== e.currentTarget');
    }
  });

  it('首页编辑区入口不伪装成拖放区', () => {
    const home = read('src/pages/Home.tsx');
    expect(home).toContain('进入编辑区');
    expect(home).not.toContain('丢进来，不用先建档');
  });

  it('编辑区使用紧凑 ST 扫描入口', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain("variant?: 'full' | 'compact'");
    expect(tools).toContain('variant="compact"');
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
    const home = read('src/pages/Home.tsx');
    const rail = read('src/components/character/CharacterInfoRail.tsx');
    const image = read('src/components/NsfwImage.tsx');
    expect(home).toContain("import { NsfwImage } from '@/components/NsfwImage'");
    expect(home.match(/<NsfwImage/g)?.length).toBeGreaterThanOrEqual(2);
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

  it('无 tab 的其他资产入口显示专门空态并提供三类入口', () => {
    const assets = read('src/pages/AssetLibrary.tsx');
    expect(assets).toContain('其他资产');
    expect(assets).toContain("/assets?tab=worldbook");
    expect(assets).toContain("/assets?tab=preset");
    expect(assets).toContain("/assets?tab=regex");
    expect(assets).toContain('tab === null');
  });

  it('资产库持续显示从 ST 恢复的全局世界书标记', () => {
    const assets = read('src/pages/AssetLibrary.tsx');
    expect(assets).toContain('stGlobal: w.stGlobal');
    expect(assets).toContain('ST 全局');
  });

  it('编辑区展开态在 AppLayout 路由重挂后从模块状态恢复', () => {
    const layout = read('src/components/AppLayout.tsx');
    expect(layout).toContain('getEditorOpen()');
    expect(layout).toContain('setEditorOpenState');
    expect(layout).not.toContain('useState(false)');
  });

  it('编辑区最近列表覆盖故事、记录、故事树和角色卡，并传递精确导航状态', () => {
    const layout = read('src/components/AppLayout.tsx');
    expect(layout).toContain('getAllSummaries()');
    expect(layout).toContain('getAllStoryTrees()');
    expect(layout).toContain('getAllCards()');
    expect(layout).toContain('navigate(item.path, { state: item.state })');
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
    for (const label of ['角色', '故事', '世界书', '预设', '正则', '原样归档']) {
      expect(result).toContain(`label="${label}"`);
    }
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
    expect(layout).toContain('key={`${location.key}:${location.pathname}${location.search}`}');
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

  it('首页只使用外层主滚动容器，故事列表才保留独立滚动', () => {
    const home = read('src/pages/Home.tsx');
    const rootClass = home.match(/<div className="([^"]+)" data-home-resource-cache/)?.[1] ?? '';
    expect(rootClass).not.toContain('overflow-y-auto');
    expect(home).toContain('data-home-story-scroll');
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
    expect(presentation).toContain('扩展与媒体按同路径更新归档');
    expect(importer).not.toContain('已有来源会安全跳过');
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
    expect(layout).toContain('<ClientTitleBar />');
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
