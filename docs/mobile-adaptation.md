# 移动端适配

参照 Obsidian 移动版的导航壳层和 jm-mobile 的阅读器交互，给 ST-Explore 补上
窄屏可用性。桌面档（≥1024px）的布局与行为全程不变。

## 断点与判断口径

`src/hooks/use-viewport.ts` 是唯一的档位来源，三档：

| 档位 | 宽度 | 形态 |
| --- | --- | --- |
| mobile | `< 768px` | 底部标签栏 + 左抽屉，全屏阅读，单列 |
| tablet | `768–1024px` | 沿用已有的 64px 折叠侧栏，不给底部栏 |
| desktop | `≥ 1024px` | 原样，一行都没改 |

`useViewport()` 返回 `{ tier, isMobile, isTablet, isDesktop, isCompact }`，
`isCompact = tier !== 'desktop'`。首次渲染就同步读 `window.innerWidth`，
不走「先 undefined 再 effect 修正」，避免第一帧按错档位画一遍再跳。

两个口径上的选择：

- **平板不给底部标签栏。** 横放的平板竖向空间本来就紧，再切一条底栏是净亏，
  而 64px 折叠侧栏已经存在、够用。平板拿到的是抽屉里的二级导航和内容区的单列化。
- **jsdom 默认视口 1024×768 落在 desktop 档。** 所以既有的一千多条测试全部走原路径，
  不需要为它们加任何 mock；移动端分支都是新增的 `isMobile &&`，不是把桌面样式改成 `md:` 前缀。
  `src/test/mobile-nav.test.ts` 里专门有一条钉住这件事，防止以后有人改默认视口。

## 做了什么

### P0 导航壳层

- `src/components/mobile/MobileTabBar.tsx`：底部四个标签，直接取
  `NAV_AREAS` 的四个主入口（首页/角色库/编辑区/附属库）。设置不占标签位，
  放在抽屉底部——跟桌面侧栏里设置的位置一致。
- `src/components/mobile/MobileDrawer.tsx`：左抽屉三段（当前区域的二级导航 /
  页面自己塞进来的内容 / 底部 VaultSwitcher + 主题 + 设置）。
  遮罩、焦点陷阱、Esc 关闭都交给 Radix 的 `ui/sheet`，只额外加了左滑关闭。
- `src/lib/mobile-nav.ts`：纯逻辑——当前区域下标、滑入方向、手势判定阈值。
  区域判定复用既有的 `findNavArea`，没有自己再遍历一遍 `NAV_AREAS`，
  否则标签高亮会跟侧栏高亮各走各的。
- 页面切换的滑入方向按标签下标差算（左右方向对得上手指方向），
  同区域内换页仍是原来的淡入。
- 全屏页（阅读视图）通过 `src/lib/immersive-mode.ts` 让壳层收起标题栏和底栏。
  实现是模块级深度计数 + `window` 事件，不是 context——因为触发方在
  AppLayout 的下游三个不同页面里，没有共同祖先能挂 provider。用计数而不是布尔，
  是为了嵌套浮层（阅读器里再开设置）退出时不会提前把壳层放回来。

抽屉触发器的位置绕了一下：客户端标题栏左侧是品牌区和拖拽区，网页版 header
中间是全局搜索，两边都腾不出位置，最后在 header 下面单开一条细触发条。
这条后来还接管了全局搜索——`GlobalSearch` 原本是 `hidden md:block`，
手机上等于完全没有搜索入口，给它加了 `compact` 变体挂在这里。

### P1 小说视图（核心差异化）

`src/components/reader/NovelView.tsx` + `src/components/reader/MobileReaderSettings.tsx`：

- **两种阅读方式**：滚动（默认，连续渲染 + 章节分隔）和翻页。
  翻页支持左右滑，也支持屏幕分区点击：左 1/3 上一页、中 1/3 切工具栏、右 1/3 下一页。
- **单页步进**：手机一屏就是一页，所以走 `clampNovelPageIndex`（只夹范围）
  而不是桌面的 `normalizeNovelSpreadStart`（对齐偶数页）。沿用跨页对齐的话
  「下一页」会一次跳两页，中间那页永远读不到。
- **沉浸工具栏**：3 秒自动隐藏，翻页/滚动立即隐藏，BottomSheet 打开期间暂停计时、关闭后重新计时。
  隐藏动作挂在 `turnPage` 而不是 `goToPage`——拖进度条时不该把控件从手指底下抽走。
- **BottomSheet 阅读设置**：阅读方式、字号 14~24px、四个主题色板、用户楼层处理、场景分隔符。
- **首次进入的分区提示**：`novel-view-zone-hint-seen` 记过一次就不再出现。
- 手机上隐去桌面才放得下的东西：各类角标、用户楼层的 Select、AI 章节入口；
  目录和书签改成纯图标。

滚动模式和进度条是双向的，用 `scrollSyncRef` 抑制程序化滚动触发的回调，
避免「滚动改进度→进度改滚动」互相打。

### P2 核心页面响应式

- **首页**：整页竖滚，双列网格降单列，角色横滑卡改百分比宽度。
- **角色库**：筛选栏移进抽屉（`LibraryFilterRail` 加 `embedded` 变体，
  去掉边框和宽度拖拽），卡墙固定两列。批量选择要能用，为此修了一处碰撞：
  批量栏是 `fixed bottom-10`（距视口底 40px），底部标签栏一出现就整条压在它上面。
  改成 `bottom-[calc(2.5rem+var(--mobile-tab-bar-h,0px)+env(safe-area-inset-bottom))]`——
  桌面档后两项都是 0，等于原来的 `bottom-10`，位置一字不差。
  `STUpdateHint` 同样是贴底浮层，一并改了。
- **角色详情**：`CharacterInfoRail` 加 `stacked` 变体，封面和基础信息在顶部横排；
  底部常驻「开始阅读」直达最近一篇故事。
- **设置页无需改动**：它的分区导航本来就是
  `flex gap-1 overflow-x-auto ... md:sticky md:flex-col`，md 以下自动变横向标签行。

### P3 加载状态

`src/components/ui/skeleton.tsx`：`Skeleton` 基元 +
`CharacterGridSkeleton` / `StoryListSkeleton` / `RefreshIndicator`。
动画用 Tailwind 自带的 `animate-pulse`，没有新增 keyframe，没有新增依赖。

「读完之前不下结论」这条项目里本来就有，
`src/test/loading-and-failure-visibility.test.tsx` 已经为工具页、世界书空态、
首页读失败钉过。这轮是把同一条口径补到角色库（原先没覆盖），
再加上「刷新不退回骨架」这个新区分。

三件容易写反的事，各有测试钉住（`src/test/loading-states.test.tsx`）：

1. **读档没回来时不许显示空态文案。**「还没有角色卡」和「读取失败」是两种结论，
   在还不知道结论时提前下结论，用户会以为数据丢了。首页原来就是这么干的。
2. **已有数据再刷新时不许把内容换回骨架。** 那是从「看得见」退回「看不见」。
   首屏给骨架，刷新只在顶部给 0.5px 指示条。
3. **读失败要和空库分开，且能重试。** 空库该引导导入，失败该给重试按钮。

角色详情页原来是一行居中的「加载中…」，换成照版面摆的骨架，
数据到位那一瞬不再整页跳一下。

首页的骨架只在本次会话第一次进首页时出现：`homeSnapshot` 加了 `loaded` 标记，
不然空库的 `stories.length` 永远是 0，每次从别的页回首页都要闪一遍骨架。

## 没做的部分

都在代码里留了 `TODO(移动端适配)`，共同点是：需要重排信息层级或重新设计交互，
不是调 className 能解决的。本轮的口径是只动布局和交互壳层，不动业务逻辑。

- **世界书编辑器**（`src/pages/WorldBook.tsx`）：条目列表 + 每条一堆插入策略字段的双栏结构。
  手机上要拆成列表页和条目详情页两级，字段还得分组折叠。
- **故事树**（`src/components/organize/TreeWorkbench.tsx`）：四种视图里导图和时间轴是二维画布，
  横向空间是它们的语义本身。手机上大概要改成「先选节点再看详情」的两级结构，
  拖拽移动也得换成长按 + 移动到目标的两步操作。
- **AI 功能面板**（`src/components/summary/BatchProcessor.tsx`、
  `worldbook/AIUpdateDialog.tsx`、`story-tree/AIFillDialog.tsx`）：
  「一屏同时看提示词、进度、每段结果」的三处并置。除了分步或者把结果收进抽屉，
  还得先想清楚长任务被系统挂后台之后怎么恢复。

## 过程中发现的问题

1. **`cn()` 里 `fixed` 和 `relative` 不能同时出现。** `cn` 是
   `twMerge(clsx(...))`，tailwind-merge 会按「后者胜」消解冲突，
   写 `cn('fixed ...', isMobile && 'relative')` 会静默把 `fixed` 干掉，
   全屏阅读器直接塌回文档流。已经踩到一次，改前发现的。
2. **`src/test/frontend-contract.test.ts` 是源码 grep 型测试，这轮红了三条。**
   它靠 `className="..."` 字面量和固定子串来钉桌面版面，
   而移动端适配必然把这些字面量变成 `cn(...)` 表达式。
   处理办法是让断言表达它真正要守的东西，而不是守某串字符：
   - 加了 `desktopClasses(source, marker)` 辅助——按结构取出共用段 + 桌面分支，
     丢掉手机分支。桌面契约照旧成立，也不再连坐禁止移动端分支存在。
   - 有一条 `expect(layout).not.toContain('useState(false)')`，
     真实意图是「编辑区展开态的初值必须来自模块 getter」，
     结果被我一个无关的抽屉状态撞红。改成精确匹配那两条声明。

   这类测试的价值是防回归，但它钉的是实现的字面形状，
   任何跨切面的改动都会一次性撞红一片。建议后续逐步换成行为断言
   （项目里已经有 `home-character-rail.test.tsx` 这样的先例，注释里也写明了替代关系）。
3. **`useIsMobile` 和 `useViewport` 目前并存。**
   `src/hooks/use-mobile.tsx` 是 shadcn 模板带的，只有 `WorldBook.tsx` 在用，
   768px 单点判断，且首帧返回 `false`（真机上窄屏会先按桌面画一帧）。
   这轮没合并它：世界书本来就在本轮范围外，而且有两个测试直接 mock 了那个模块路径，
   动它等于把改动摊到范围外的文件。
4. **滚动模式没有虚拟化。** 长故事在滚动模式下会一次性渲染所有 NovelBlock。
   代码里有注释标了位置。桌面翻页模式下只渲染当前两页，所以这是移动端滚动模式独有的。
5. **贴底 fixed 浮层会被新的底部标签栏压住。** 全项目有两处
   （角色库批量栏、`STUpdateHint`），都在 P2 里改成按 `--mobile-tab-bar-h` 抬高。
   变量由 AppLayout 写到 `document.documentElement`（跟已有的 `--app-chrome-h` 同一套做法），
   标签栏自己的高度也读这个变量，两处不会走偏。以后再加贴底浮层记得带上这个偏移。

## 后续建议

按性价比排序：

1. **滚动模式加虚拟化。** 上千楼的故事在手机上会卡，这是目前最容易被真机实测撞到的。
2. **把 `useIsMobile` 合进 `useViewport`。** 一处判断口径，顺手把世界书首帧闪桌面版面的问题一起修。
   动的时候记得改那两个测试的 mock 路径。
3. **`frontend-contract.test.ts` 分批换成行为断言。** 不用一次性搬完，
   每次撞红的时候顺手把那一条换掉——这轮已经这样处理了三条。
4. **真机实测这几处，本轮只在 jsdom 和 devtools 窄屏里验过：**
   - 分区点击的三等分在带手势条的机型上会不会跟系统返回手势打架
   - 输入框在 iOS 上会不会触发自动放大（`docs/ui-conventions.md` 要求窄屏输入框带 `text-base`，
     `GlobalSearch` 的 compact 变体已经加了，其他输入框没逐个过）
   - 抽屉右滑打开的边缘区（`EDGE_SWIPE_ZONE = 28`）跟系统侧滑返回是否冲突
   - 角色详情底部「开始阅读」压在底部标签栏上面，两条一起吃掉的竖向空间是否可接受
5. **世界书 / 故事树 / AI 面板** 按上面「没做的部分」里的思路单独排期，
   每个都是独立的一轮，不适合塞进布局轮。

## 验证

每轮改动后都跑过 `npx vitest run` 和 `npx tsc -p tsconfig.app.json --noEmit`。
末轮：146 个测试文件、1219 条测试全绿，tsc 干净。
（注意 `tsc` 裸跑是空转，必须带 `-p tsconfig.app.json`，见 `MEMORY.md`。）

本轮新增测试：

- `src/test/mobile-nav.test.ts`（13 条）：三档边界、子路由点亮父标签、
  `/settings` 不点亮任何标签、滑入方向、四种手势否定分支、jsdom 默认视口属于桌面档。
- `src/test/novel-view-mobile.test.tsx`（10 条）：滚动/翻页两种模式、分区点击、
  单页步进、工具栏自动隐藏与暂停。
- `src/test/loading-states.test.tsx`（4 条）：用 deferred 把读档挂在半空观察加载中那一帧；
  刷新那条走真实路径（批量删除后 `await load()`）。

分五个 commit：导航壳层 → 壳层纯逻辑测试 → 小说视图 → 核心页面响应式 → 加载状态。
