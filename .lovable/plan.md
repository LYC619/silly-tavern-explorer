

# SillyTavern Explorer v0.8 — 世界书可视化编辑器

## 实现范围（第一轮）

按你的优先级，第一轮实现：**世界书导入解析 + 卡片视图展示 + 条目编辑面板 + 导出**。筛选/搜索/排序和快速创作模式留到后续轮次。

## 技术方案

### 1. 类型定义 — `src/types/worldbook.ts`

定义 SillyTavern 世界书的完整数据结构：

- `WorldBookEntry`: 单个条目，含 uid、key（关键词数组）、keysecondary、content、comment（标题/Memo）、selective、constant（常驻）、vectorized、selectiveLogic、position、depth、order、probability、enabled、group、sticky、cooldown、delay 等字段
- `WorldBook`: 顶层结构 `{ entries: Record<string, WorldBookEntry> }` + 元数据字段（originalData 用于保留未识别字段）
- `WorldBookItem`: IndexedDB 存储用，类似 BookItem，含 id、title、worldbook、createdAt、updatedAt

位置枚举映射 SillyTavern 的数值（0=角色设定前, 1=角色设定后, 2=示例消息前, 3=示例消息后, 4=作者注释顶部, 5=作者注释底部, 6=@D, 7=Outlet 等）。

### 2. IndexedDB 存储 — `src/lib/worldbook-db.ts`

复用现有 `bookshelf-db.ts` 的模式，DB_VERSION 升为 2，在 `onupgradeneeded` 中新增 `worldbooks` object store。提供 `getAllWorldBooks`、`getWorldBook`、`saveWorldBook`、`deleteWorldBook` CRUD 函数。

### 3. 页面与路由

- 新建 `src/pages/WorldBook.tsx` — 世界书主页面
- `App.tsx` 新增路由 `/worldbook`
- `EditorToolbar.tsx` 导航栏新增「世界书」按钮（Globe 图标）

### 4. 世界书页面布局 — `src/pages/WorldBook.tsx`

```text
┌─────────────────────────────────────────────┐
│ Header (复用现有风格，含导航)                  │
├──────────────────────┬──────────────────────┤
│                      │                      │
│  左侧：卡片列表       │  右侧：编辑面板       │
│  - 导入按钮           │  - 选中条目的        │
│  - 卡片/列表切换      │    所有字段编辑       │
│  - 条目卡片网格       │                      │
│                      │                      │
├──────────────────────┴──────────────────────┤
│ Footer                                      │
└─────────────────────────────────────────────┘
```

页面状态：当前世界书数据、选中条目 ID、视图模式（card/list）。

### 5. 组件拆分

| 文件 | 职责 |
|------|------|
| `src/components/worldbook/WorldBookImporter.tsx` | 文件导入、JSON 解析、验证 |
| `src/components/worldbook/EntryCard.tsx` | 单个条目卡片（策略图标、关键词 pills、内容预览、底部信息栏、左侧分组颜色条） |
| `src/components/worldbook/EntryListRow.tsx` | 列表视图的表格行 |
| `src/components/worldbook/EntryEditor.tsx` | 右侧编辑面板（全部字段，高级设置折叠） |
| `src/components/worldbook/WorldBookExporter.tsx` | 导出按钮，生成 ST 兼容 JSON |

### 6. 卡片视图细节

- 左侧色条：根据 `group` 字段哈希生成颜色
- 策略标识：`constant=true` → 🔵常驻，`vectorized=true` → 🔗向量，否则 → 🟢关键词
- 关键词：`key` 数组渲染为实色 pill，`keysecondary` 渲染为虚线边框 pill
- 内容预览：取 content 前 3 行，末尾截断显示省略号
- 底部：position 映射中文名 + depth（仅 @D 时显示）、order 值、probability%

### 7. 编辑面板字段

所有字段直接修改内存中的世界书数据（React state），不自动持久化。用户通过「保存到本地」按钮写入 IndexedDB，通过「导出」按钮生成文件。

关键词编辑：输入框支持逗号分隔 + 回车添加，已有关键词显示为可删除的 pill。

Position 选择 @D 时，动态显示 depth 数字输入和 role 下拉（system/user/assistant）。

高级设置（Sticky/Cooldown/Delay）默认折叠在 Collapsible 中。

### 8. 导出

将内存中的 `WorldBook` 对象序列化为 SillyTavern 格式的 JSON：保留 `originalData` 中的未识别字段，合并编辑后的条目数据，生成下载。

### 文件变更清单

| 操作 | 文件 |
|------|------|
| 创建 | `src/types/worldbook.ts` |
| 创建 | `src/lib/worldbook-db.ts` |
| 创建 | `src/pages/WorldBook.tsx` |
| 创建 | `src/components/worldbook/WorldBookImporter.tsx` |
| 创建 | `src/components/worldbook/EntryCard.tsx` |
| 创建 | `src/components/worldbook/EntryListRow.tsx` |
| 创建 | `src/components/worldbook/EntryEditor.tsx` |
| 创建 | `src/components/worldbook/WorldBookExporter.tsx` |
| 修改 | `src/App.tsx` — 添加 `/worldbook` 路由 |
| 修改 | `src/components/EditorToolbar.tsx` — 导航栏添加世界书入口 |
| 修改 | `src/lib/bookshelf-db.ts` — DB_VERSION 升级，添加 worldbooks store |

