# Handoff：STE 2.0 卡片主页 / 库 / 阅读器

> Silly Tavern Explorer 2.0 —— 面向 SillyTavern 用户的"角色卡资产管理 + 故事阅读"桌面级 Web 应用重设计草图。

---

## Overview

STE 2.0 是 SillyTavern 的一个外挂 / 伴随应用，用来集中管理导入的角色卡、它们衍生出的多条"故事线"（chat）、以及围绕角色卡的附件（世界书、正则、预设）。这一份 handoff 包含 3 个核心屏：

1. **Slide 1 · 我的库** —— 全部角色卡的网格视图，带筛选、排序、命名空间标签。
2. **Slide 2 · 卡片主页 (v3)** —— 单张卡片的详情页：左半是大人像 + 名字与标签，右半是「介绍 + 游玩历史」。这是本次设计的核心。
3. **Slide 3 · 故事阅读页** —— 长篇小说式排版的聊天记录阅读器，左侧为 AI 自动分段的目录，右侧为阅读设置 / 书签 / 从此处生成总结。

顶部还有一个隐藏的 `02b 卡片主页旧版` section，仅作为设计过程的比对参考，**不需要实现**。

---

## About the Design Files

这个包里附带的 HTML 文件是**设计参考稿**，不是可以直接搬运的生产代码：

- 它们用一整块 HTML + inline CSS 展现 3 个 1920×1080 的画布（deck slides），以便一次性讨论布局、颜色、字体和微交互。
- 里面的所有数据（角色名、故事名、章节内容等）都是示例。
- 目的是让你**在目标代码库的既有环境里重新实现这些界面** —— 无论那是 React、Vue、SwiftUI、Flutter、Electron 里的原生 HTML，还是 SillyTavern 自身的扩展 API。
  - 如果 STE 2.0 是全新项目，推荐 **React + Vite + TypeScript + Tailwind CSS** 起手，因为它天生贴合这份设计里"多层次、Token 驱动"的风格。
- 请沿用目标环境已有的组件库和状态管理，不要把 HTML 原文件塞进去当作最终产物。

---

## Fidelity

**High-fidelity (hifi)**。所有颜色、字号、行距、间距、边框、圆角都是最终意图值 —— 直接照搬即可。示意图里唯一"占位"的是：

- 角色卡封面 / 大人像：目前用 CSS `linear-gradient` 拼贴 + 中文标签（"01 · KANAE"、"奏枝"）临时替代。真实实现里应换成用户导入的角色卡 PNG。
- 顶栏搜索、部分次要按钮的 hover / focus 状态草图里没画 —— 请沿用**变暗背景 + 提亮描边**的通用规则（见下方 Design Tokens）。

---

## Screens / Views

### 1. `01 库列表` · 我的库

**Purpose**：让用户在一屏内浏览全部角色卡，按标签 / 状态 / 时间快速定位一张卡。

**Layout**（1920 × 1080，全屏，纯桌面）：

```
┌─ topbar (56px) ────────────────────────────────────────────────────┐
├─ sidebar (240px) ──┬─ lib-main (flex:1) ─────────────────────────┤
│                    │  lib-header  (title + sub)                   │
│  分类导航           │  lib-toolbar (chips + sort + view toggle)     │
│                    │  lib-grid    (4-列自适应角色卡网格)            │
└────────────────────┴──────────────────────────────────────────────┘
```

- 顶栏 `.topbar`：56px 高，左→右为 品牌标识 · 主导航（我的库 / 正在归档 / 工具 / 内置示范卡）· 搜索框（max 480px）· 右侧操作组（从 ST 同步 / + 导入角色卡）。
- 侧栏 `.sidebar`：240px 宽，`--bg-2` 背景，右边 1px `--line` 分割。分区包含：
  - 顶部**状态过滤**：全部 / 最近打开 / 进行中 / 已完结 / 未开始，每项右侧带数字 count。
  - **命名空间标签**：小圆形色块 + 名字（人物、玩法、评价、背景……）。色块颜色 = 标签所属命名空间的颜色。
  - **系统**：回收站 / 设置。
- 内容区 `.lib-main`：
  - `lib-header`：24px 内边距，`.lib-title` 用 Noto Serif SC 32px/700，`.lib-sub` 用 13px `--ink-3`。
  - `lib-toolbar`：一行内联控件；`.filter-chip`（圆角矩形 tag，active 状态描边变 `--accent`）+ `<select>` 排序 + `.view-toggle` 卡片/列表/年表分段控件。
  - `lib-grid`：CSS Grid，`repeat(auto-fill, minmax(260px, 1fr))`，gap 20px，24px 页面内边距。

**Components**（每张 `.card`）：

- 尺寸：由 grid 决定，最小 260px 宽；封面区固定 3:4 比例。
- 结构：
  - `.cover`：3:4 封面，右上角 `.stories-badge`（几段故事，JetBrains Mono，`--panel-2` 底 + `--line` 描边），左下角 `.cover-label`（"01 · KANAE"，同样 mono）。
  - Card body：12px padding。
    - `.name`：Noto Serif SC 14px/600。
    - `.desc`：11.5px，`--ink-3`，两行截断。
    - `.footer`：顶部 8px + 1px `--line` 分割，左边 `.rating` 用 `--accent` mono，右边 `.last` 用 `--ink-3` mono（"3h ago"）。
- Hover：整张卡片 `border-color: var(--line-2)`（约 +8% 亮度）。
- 圆角：8px。

---

### 2. `02 卡片主页` · 单卡详情（**主设计**）

**Purpose**：进入一张角色卡后的"主页"。用户在此看到卡的世界观介绍、这张卡下所有的"游玩历史"（故事线），并选择继续玩哪一条。附件（世界书 / 正则 / 预设）折到左侧栏，不抢主视觉。

**Layout**：

```
┌─ topbar ──────────────────────────────────────────────────────────┐
├─ sidebar (240px)      ─┬─ cp3-portrait (640px) ─┬─ cp3-right (flex) ┤
│  当前卡卡片头 (高亮块)   │                        │                    │
│  跳到区块               │  大人像全高，底部渐变     │  面包屑             │
│    · 介绍               │  overlay 内含：          │  介绍段（16px/1.85）│
│    · 游玩历史 (3)       │    · 名字 (Serif 64px)  │  游玩历史标题条      │
│  附件 · 编辑            │    · 副标题             │    + 汇总统计       │
│    · 角色卡本体          │    · 标签 chips         │    + "继续玩 #63" ↑ │
│    · 世界书 (18)        │                        │  故事线列表 (可展开) │
│    · 正则脚本 (2)       │                        │                    │
│    · 预设 (1)           │                        │                    │
│  相邻卡片               │                        │                    │
└─────────────────────────┴────────────────────────┴───────────────────┘
```

**关键组件**：

- `.cp3-portrait`：640px 宽、占满高度的**大人像区**。背景是角色卡 art。底部 40% 用 `linear-gradient(180deg, transparent, var(--bg))` 淡出到深色，再叠 overlay 文字。
  - `.cp3-name`：Noto Serif SC，64px / 700，`letter-spacing: -0.01em`。
  - `.cp3-name-sub`：Serif 18px，`--ink-2`。
  - `.cp3-portrait-tags`：一排 pill，pill 用 `background: rgba(0,0,0,.4); backdrop-filter: blur(8px); border: 1px solid var(--line-2)`，12px 字号，mono。
- `.cp3-right`：剩余宽度，垂直 flex，32px padding。
  - `.cp3-crumb`：面包屑，mono 12px，`--ink-3`；右侧对齐 "由角色卡自动生成 · 编辑 ✎" 提示。
  - `.cp3-intro`：**正文 16px / line-height 1.85**（本设计的关键排版决定），Noto Serif SC。有 `.muted` 修饰词写第二段元信息。
  - `.cp3-hist-head`：一行内联，左侧 `<h2>` "游玩历史" (Serif 22px)，中间浮点数字统计（"3 条 · 981 楼 · 47.5 小时 · 3 小时前"），右侧的 **"继续玩 · #63 →"** 按钮采用 `--accent-2` 焦橘作填充色。
  - `.cp3-hist-list`：垂直堆叠的 `.cp3-line` 卡片，间距 16px。

**每条 `.cp3-line`（故事线卡片）**：

- 三态：`.active`（进行中，左边 3px 焦橘竖条）、常规、`.collapsed`（短线折叠）。
- 左区：
  - `.cp3-line-badges`：徽章横排。`.main` 用 `--accent`；`.active` 用 `--accent-2`；`.done` 用 `--ok`；`.side` 灰色；`.dim` 是星级用 `--ink-3`。
  - `.cp3-line-title`：Serif 22px / 600，`--ink`。
  - `.cp3-line-tag`：一句故事概括，14px `--ink-2`，斜体 italic。
  - `.cp3-line-meta`：mono 12px `--ink-3` 分点数据（楼数 · 时长 · checkpoint · 分支 · 日期）。
  - `.cp3-branches`（可选）：分支子列表，用制表符 └─ / ├─ 前缀伪造 ASCII 树状结构，mono 12px。
- 右区：
  - `.cp3-line-bar`：4px 高的进度条，`.cp3-line-bar-fill` 是当前进度，`.paused` 用 `--warn`，`.done` 用 `--ok`。
  - `.cp3-line-mark`：进度条上的小标点，`.ck` (checkpoint) 用 `--accent`，`.br` (branch) 用 `--accent-2`。
  - `.cp3-line-actions`：一排底部对齐的次要动作，`primary` 那个用 `--accent-2` 底色。

---

### 3. `03 故事阅读` · 阅读器

**Purpose**：把一段 400+ 楼的角色扮演聊天记录以**长篇小说**排版重现，同时保留对话气泡感 + 可扩展工具栏（书签、总结、日记）。

**Layout**：三栏。

```
┌─ topbar ──────────────────────────────────────────────────────────┐
├─ reader-sidebar (280px) ─┬─ reader-main ────┬─ reader-rightbar (280px)┤
│  ← 返回卡 + 故事元数据    │  最大宽 720px      │  阅读设置 (Aa−/+)        │
│  章节目录 (AI 分段)       │  居中留白 96px     │  显示 toggles           │
│    01…07                 │  章节标记 divider  │  书签 (滚动)             │
│  瘦身建议 (AI)            │  msg.narration    │  从此处生成 (3 按钮)      │
│                          │  msg.dialogue-user│                          │
│                          │  msg.dialogue-char│                          │
└──────────────────────────┴───────────────────┴─────────────────────────┘
```

**Message 类型（`.msg`）**：

- `.narration`：纯段落，Noto Serif SC 17px / line-height 1.85。段内可用 `<em>` 与 `.msg-inline-dialogue`（等宽 quotes）。
- `.dialogue-user`：左侧竖条 `--accent-2`，顶部有小标 "YOU"（mono 10px `--ink-3` uppercase）。
- `.dialogue-char`：左侧竖条 `--accent`，顶部小标是角色名 "KANAE"。
- 段间距 20px。所有 msg 无边框、无背景 —— **靠竖条区分说话人**是本页的核心排版决定。

**右侧栏**（`.reader-rightbar`）：

- `.rb-group` 是一节，标题 `.rb-label` mono 11px uppercase `--ink-3`。
- `.rb-slider`：Aa−  |======●=========|  Aa+ 的字号滑杆。
- `.rb-toggle-row`：每行一个 label + 一个 iOS 风格的 switch。类 `.on` 表示打开态。
- `.rb-bookmark`：书签卡，`--panel` 底 + `--line` 描边，10px padding。顶部 `.bm-time` 是章节位置（mono），下面是引用摘录 14px。
- "从此处" 三按钮：📌 添加书签 / ✂ 提取到总结 / 📔 写入日记 —— 32px 高，等宽，`--panel` 底。

---

## Interactions & Behavior

一切以"能推动用户回到故事里"为目标，避免弹窗；能就地展开就不要跳转。

- **库列表 → 卡片主页**：点击 `.card` 任意区域跳转。做**卡片放大过渡动画**（150ms `ease-out`，缩放 0.98 → 1.02 → 1）。
- **卡片主页 → 阅读器**：点击 `.cp3-line-actions .primary` 或 `.cp3-hist-continue`。跳转时保留上次读到的 checkpoint。
- **面包屑 / "← 返回"**：始终把用户送回到"上一级卡片主页"，不使用浏览器 back。
- **`.cp3-line.collapsed → 展开 ↓`**：就地展开为完整 line 卡片，不整页 reflow。
- **`.filter-chip`**：多选，active 描边变 `--accent`。可以叠加。切换时 grid 用 FLIP 动画重排（200ms `cubic-bezier(.2,.7,.3,1)`）。
- **`.view-toggle` (卡片/列表/年表)**：切换会替换 `.lib-grid` 布局，无过渡；先做卡片视图即可。
- **搜索框**（`.top-search`）：⌘K / Ctrl+K 聚焦。全屏搜索面板可延后到 v2。
- **阅读器 · 章节目录 (`.toc-item`)**：点击 smooth scroll 到对应位置（`behavior: 'smooth'`）；当前章节自动高亮。
- **阅读器 · Aa 滑杆**：调整正文 font-size（14 → 20px），同步写入 `localStorage.reader.fontSize`。
- **阅读器 · toggles**：立即生效并持久化；"应用正则脚本" 会重新对 messages 跑一遍正则替换。
- **阅读器 · 书签**：从当前滚动位置生成一个书签；右侧列表点击可跳回。
- **顶栏 `+ 导入角色卡`**：打开文件选择器接收 `.png` (角色卡都是 PNG-in-metadata)。上传即入库。
- **状态**：全屏不需要移动端响应式；1440–1920 之间自然缩放即可（内容区 flex 撑开，两侧 sidebar 固定宽）。

---

## State Management

推荐用一个中心 store（Zustand / Pinia / SwiftData 均可）持有：

```ts
type Card = {
  id: string;
  name: string;
  subtitle: string;   // "深夜古书店 · 图书馆管理员"
  cover: string;      // 角色卡 PNG dataURL 或路径
  tags: string[];     // ["同人","现代都市","悬疑",...]
  intro: string;      // markdown, 自动从角色卡生成，可编辑
  status: 'not_started' | 'in_progress' | 'archived' | 'done';
  rating?: number;    // 0-10
  namespace: string[];// 命名空间标签 id
  stories: Story[];
  attachments: {
    worldBook?: WorldBookRef;
    regex?: RegexRef[];
    preset?: PresetRef;
  };
  createdAt: string;
  lastOpenedAt: string;
};

type Story = {
  id: string;
  label: 'A' | 'B' | 'C' | 'side';
  title: string;
  tagline: string;
  messages: Message[];
  progress: number;   // 0-1
  status: 'active' | 'paused' | 'done';
  rating?: number;
  branches: Branch[];
  checkpoints: {msgIndex: number, note: string}[];
  createdAt: string;
  lastReadAt: string;
};

type Message = {
  id: string;
  kind: 'narration' | 'user' | 'char';
  text: string;      // markdown
  swipes?: string[]; // ST 的 swipe 备选
  chapter?: number;  // AI 分段结果
};

type ReaderPrefs = {
  fontSize: number;              // 14-20
  showBubbles: boolean;
  autoChapters: boolean;
  showSwipes: boolean;
  applyRegex: boolean;
  showOOC: boolean;
};
```

- **持久化**：Card / Story 建议存本地 SQLite (better-sqlite3 / Tauri) 或 IndexedDB。ReaderPrefs 存 localStorage。
- **AI 派生数据**（介绍生成、章节分段、瘦身建议）走一个后台队列 —— 打开一张卡时如未派生则触发，UI 显示 skeleton。
- **与 ST 同步**：`.top-actions "从 ST 目录同步"` 应调用 ST 的 REST API（或读取磁盘 `characters/` `chats/` 目录，Tauri/Electron 场景），产出 diff 后合并。

---

## Design Tokens

### Colors

| Token | Hex | 用途 |
|---|---|---|
| `--bg` | `#12100e` | 页面底色（深棕黑） |
| `--bg-2` | `#1a1714` | 顶栏 / 侧栏底色 |
| `--panel` | `#1f1b17` | 卡片 / 按钮底色 |
| `--panel-2` | `#26211c` | 更亮一档的容器（例如 view-toggle active） |
| `--line` | `#322c25` | 常规描边 |
| `--line-2` | `#423a31` | 悬停 / 高亮描边 |
| `--ink` | `#ece5d9` | 主文字（暖白，非纯白） |
| `--ink-2` | `#b8ad9c` | 次文字 |
| `--ink-3` | `#7d7466` | 辅助文字 / meta |
| `--accent` | `#c9a875` | 温暖旧纸金（评分 / 主线徽章 / 章节 checkpoint） |
| `--accent-2` | `#d97757` | 焦橘（主 CTA、Active 状态、用户对话竖条，呼应 SillyTavern 品牌） |
| `--ok` | `#7fa87a` | 完结绿 |
| `--warn` | `#d19a5c` | 暂停 / 警告 |
| `--danger` | `#c17070` | 删除 / 破坏性 |

> **主 CTA (`button.primary`)**：`background: var(--accent-2); color: #201308; border: transparent; font-weight: 600;`

### Typography

- **`Noto Serif SC` (Google Fonts)** —— 一切正文、大标题、名字。字重 400 / 500 / 700。
- **`Inter` (Google Fonts)** —— UI 控件文本 / 侧栏。字重 400 / 500 / 600 / 700。
- **`JetBrains Mono` (Google Fonts)** —— 所有数值、计数、时间戳、面包屑、mono meta。字重 400 / 500。

| 用途 | family | size | weight | line-height | letter-spacing |
|---|---|---|---|---|---|
| 卡片主页角色名 (`.cp3-name`) | Noto Serif SC | 64px | 700 | 1.1 | -0.01em |
| 库标题 (`.lib-title`) | Noto Serif SC | 32px | 700 | 1.2 | -0.005em |
| 故事线标题 (`.cp3-line-title`) | Noto Serif SC | 22px | 600 | 1.3 | 0 |
| 卡片主页正文 (`.cp3-intro-p`) | Noto Serif SC | **16px** | 400 | **1.85** | 0 |
| 阅读器正文 (`.msg.narration`) | Noto Serif SC | 17px | 400 | 1.85 | 0 |
| 控件文字 (topbar / sidebar) | Inter | 13px | 400–500 | 1.4 | 0 |
| Section 小标题 (`.sb-section`, `.rb-label`) | Inter | 11px | 500 | 1.4 | 0.08em, uppercase |
| Meta / count / 时间 | JetBrains Mono | 10–12px | 400 | 1.4 | 0.02em |

### Spacing

- 页面 padding：24px（库列表内容区）· 32px（卡片主页右栏、阅读器内容）· 96px 顶部（阅读器正文）。
- 卡片网格 gap：20px。
- `.cp3-line` 之间 gap：16px。
- Message 段间距：20px。

### Radius

- 按钮 / chip / 小控件：6px
- 卡片 / panel：8px
- Pill (portrait tags)：999px

### Shadows

设计整体是**无阴影 flat + 描边区分层级**的风格。仅在极少地方（角色卡大人像底部渐变）用到 gradient overlay，没有 box-shadow。

### 状态色对应

- `.filter-chip.active`：`border-color: var(--accent); color: var(--accent);`
- `.cp3-line.active`：`border-left: 3px solid var(--accent-2);`
- 进度条 done：`--ok`；paused：`--warn`；in_progress：`--accent-2`。

---

## Assets

**这个 handoff 里没有真实的角色卡 PNG / 头像资产** —— 全部用 CSS 渐变代替，位置在：

- `.cover.c1` … `.cover.c10`：库列表里 10 张卡的封面。生产环境请替换为从角色卡 PNG 元数据里读出来的封面图（SillyTavern 角色卡就是带 exif 的 PNG）。
- `.cp3-portrait`：卡片主页那张大人像，同样是渐变。生产环境替换成角色卡 PNG 全图。

字体全部来自 Google Fonts CDN，见 HTML `<head>` 的 `<link>`。你可以：
- 直接用 CDN；
- 或本地打包 `noto-serif-sc-*.woff2 / inter-*.woff2 / jetbrains-mono-*.woff2` 并用 `@font-face self-host`。

图标：目前设计里几乎没有图标（品牌左侧的 `.dot`、面包屑箭头 ← → 都是符号字符）。搜索 🔍、书签 📌 等 emoji 是**占位** —— 生产环境请替换成 Lucide / Phosphor / Feather 里 stroke=1.5 的线性图标。

---

## Files

包里附带以下设计参考稿：

- `STE 2.0 界面草图 v2.html` —— **最终版**，包含所有三个屏（Slide 1 库列表、Slide 2 卡片主页 v3、Slide 3 阅读器）以及一个隐藏的 v2 旧稿（`02b 卡片主页旧版`，忽略即可）。
- `STE 2.0 界面草图.html` —— 更早的 v1 迭代，仅供参考。除非你想知道设计如何演进，否则不用打开。

打开方式：任何现代浏览器直接双击即可。文件里没有网络请求（除了 Google Fonts CDN），完全离线可用。deck 用 ← → 键切换 slide。
