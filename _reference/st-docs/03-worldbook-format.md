# SillyTavern 独立世界书 (World Info / Lorebook) 格式

> 参考实现：`public/scripts/world-info.js`（导入侧的格式探测）、`src/endpoints/worldinfo.js`（导出侧）。
> 适用版本：1.11.x ~ 1.12.x。老格式兼容见 §3。

---

## 1. 顶层结构

ST 独立世界书的导出文件，**顶层只有一个键 `entries`**，其值是一个**对象**（不是数组），以条目的「记录键」为 key：

```json
{
  "entries": {
    "0": { "uid": 0, "key": ["..."], "content": "...", "..." : "..." },
    "1": { "uid": 1, "key": ["..."], "content": "...", "..." : "..." },
    "2": { "uid": 2, "key": ["..."], "content": "...", "..." : "..." }
  }
}
```

要点：

1. **`entries` 是对象，不是数组**。记录键是字符串化的整数（`"0"`, `"1"`, ...）。
2. **`记录键` 应当等于 entry.uid**（都从 0 起编）。两者不一致时 ST 行为不一致 —— 导入解析以 `uid` 为准，但**重新导出时务必保证 `key === String(uid)`**，否则部分 ST 版本会拒绝导入或丢条目。
3. **顶层除 `entries` 之外没有标准字段**。没有 `name`、`description`、`scan_depth`、`token_budget` 这些 —— 那些是「卡内 character_book」才有的（见 02 文档 §5）。
   - 极少数第三方导出器（如 Risu/Agnai）会塞 `name`、`originalData` 等字段，ST 导入时**会忽略**它们，但保留不会出错。
4. 文件名约定：`<世界书名>.json`，文件名去掉 `.json` 就是 ST 列表里显示的名字。
5. 编码 UTF-8，无 BOM。

### 数组形式存在吗？

是的，野外能见到 `entries` 是数组的格式 —— 主要来源：

- 早期 ST（1.9 之前的某些 fork）
- RisuAI 导出
- 卡内 `character_book.entries`（spec 本来就是数组，被人当独立世界书直接用）

ST 1.11+ 导入逻辑会检测 `Array.isArray(entries)` 然后转成对象。但**重新导出一定是对象形式**。

---

## 2. Entry 字段（完整）

```json
{
  "uid": 0,
  "key": ["castle", "fortress"],
  "keysecondary": ["dark", "night"],
  "comment": "Castle lore",
  "content": "The ancient castle stands...",
  "constant": false,
  "vectorized": false,
  "selective": true,
  "selectiveLogic": 0,
  "addMemo": true,
  "order": 100,
  "position": 0,
  "disable": false,
  "excludeRecursion": false,
  "preventRecursion": false,
  "delayUntilRecursion": false,
  "probability": 100,
  "useProbability": true,
  "depth": 4,
  "group": "",
  "groupOverride": false,
  "groupWeight": 100,
  "scanDepth": null,
  "caseSensitive": null,
  "matchWholeWords": null,
  "useGroupScoring": null,
  "automationId": "",
  "role": 0,
  "sticky": 0,
  "cooldown": 0,
  "delay": 0,
  "displayIndex": 0
}
```

### 字段表

| 字段                    | 类型                  | 默认           | 含义                                                                         |
| ----------------------- | --------------------- | -------------- | ---------------------------------------------------------------------------- |
| `uid`                   | number                | **必填**       | 条目唯一 ID，应等于 entries 对象的记录键                                     |
| `key`                   | string[]              | `[]`           | 主触发关键词（**始终数组**，不是逗号字符串）                                 |
| `keysecondary`          | string[]              | `[]`           | 次要触发词（配合 selective + selectiveLogic）                                |
| `comment`               | string                | `""`           | 备注/标题，UI 列表显示用，不进 prompt                                        |
| `content`               | string                | `""`           | 注入文本                                                                     |
| `constant`              | boolean               | `false`        | true=蓝灯，无视关键词永久注入                                                |
| `vectorized`            | boolean               | `false`        | true=向量检索匹配（需启用 Vector Storage）                                   |
| `selective`             | boolean               | `true`         | true=启用 keysecondary 二级过滤                                              |
| `selectiveLogic`        | number                | `0`            | 0=AND ANY, 1=NOT ALL, 2=NOT ANY, 3=AND ALL                                   |
| `addMemo`               | boolean               | `true`         | UI 内部 flag（"add memo"）；几乎总是 true                                    |
| `order`                 | number                | `100`          | 同 position 内的排序权重，**大者更靠前**（注入靠近模型的位置）               |
| `position`              | number                | `0`            | 注入位置枚举，见 §2.1                                                        |
| `disable`               | boolean               | `false`        | ⚠️ **反义字段**：true=禁用。与「enabled=false」等价                          |
| `excludeRecursion`      | boolean               | `false`        | 本条不被其他条目递归触发                                                     |
| `preventRecursion`      | boolean               | `false`        | 本条触发后阻止后续递归                                                       |
| `delayUntilRecursion`   | boolean \| number     | `false`        | 延迟到第 N 轮递归才允许触发；true=延迟 1 轮，数字=指定轮次                   |
| `probability`           | number (0-100)        | `100`          | 触发概率                                                                     |
| `useProbability`        | boolean               | `true`         | 是否启用 probability                                                         |
| `depth`                 | number                | `4`            | 仅 `position===6 (@depth)` 时生效，注入到倒数第 N 条消息                      |
| `group`                 | string                | `""`           | 组名；同组条目按 groupWeight 抽签，只有一条会真正注入                        |
| `groupOverride`         | boolean               | `false`        | 组内强制本条（无视权重）                                                     |
| `groupWeight`           | number                | `100`          | 组内抽签权重                                                                 |
| `scanDepth`             | number \| null        | `null`         | 关键词扫描多少条消息；null=用全局设置                                        |
| `caseSensitive`         | boolean \| null       | `null`         | 大小写敏感；null=用全局设置                                                  |
| `matchWholeWords`       | boolean \| null       | `null`         | 整词匹配；null=用全局设置                                                    |
| `useGroupScoring`       | boolean \| null       | `null`         | 组内打分模式                                                                 |
| `automationId`          | string                | `""`           | 关联到 STscript / Quick Reply 的 ID                                          |
| `role`                  | number \| null        | `0`            | 仅 `position===6` 时生效：0=system, 1=user, 2=assistant                      |
| `sticky`                | number                | `0`            | 触发后强制保留 N 轮                                                          |
| `cooldown`              | number                | `0`            | 触发后冷却 N 轮不能再触发                                                    |
| `delay`                 | number                | `0`            | 聊天前 N 条消息内不触发                                                      |
| `displayIndex`          | number                | `0`            | 仅 UI 排序用，导入时通常按导入顺序重排                                       |

### 2.1 `position` 枚举（确认 + 补充）

你列的 0-7 **基本正确**，但 7 不是 Outlet —— 实际取值：

| 值 | 含义                          | UI 标签          |
| -- | ----------------------------- | ---------------- |
| 0  | Before Character Definitions  | 角色定义前       |
| 1  | After Character Definitions   | 角色定义后       |
| 2  | Before Example Messages       | 示例消息前       |
| 3  | After Example Messages        | 示例消息后       |
| 4  | Before Author's Note          | AN 前（顶）      |
| 5  | After Author's Note           | AN 后（底）      |
| 6  | @ Depth (in-chat)             | 插入到聊天 @深度 |

> ⚠️ **没有 7**。1.12 主干里 position 只到 6。你看到的「Outlet」可能是 1.13 主线某个 PR 的预研，或者 RisuAI 的扩展取值，主流 ST 不要假设它存在。
>
> 当 `position === 6`，必须看 `depth`（@第几条）和 `role`（以什么身份插入）。其它 position 下这两个字段被忽略。

---

## 3. ⚠️ 老格式 / 字符串 position / 已废弃字段

是的，早期 ST（≤1.9，以及 NovelAI Lorebook 风格的导入）**`position` 用过字符串**。野外可见：

| 旧字符串 position    | 现行数字  | 说明                                       |
| -------------------- | --------- | ------------------------------------------ |
| `"before_char"`      | 0         |                                            |
| `"after_char"`       | 1         |                                            |
| `"before_an"`        | 4         |                                            |
| `"after_an"`         | 5         |                                            |
| `"at_depth"`         | 6         |                                            |
| `"before_example"`   | 2         | 少见                                       |
| `"after_example"`    | 3         | 少见                                       |

**旧名 → 新名 映射**（导入端建议全部兼容）：

| 旧                      | 新                | 备注                                       |
| ----------------------- | ----------------- | ------------------------------------------ |
| `keys`                  | `key`             | NovelAI / 卡内 character_book 风格         |
| `secondary_keys`        | `keysecondary`    | 同上                                       |
| `insertion_order`       | `order`           | 同上                                       |
| `enabled` (true)        | `disable` (false) | **取反**                                   |
| `name`（entry 顶层）    | `comment`         | NAI Lorebook 风格                          |
| `case_sensitive`        | `caseSensitive`   | snake → camel                              |
| `match_whole_words`     | `matchWholeWords` | 同上                                       |
| `scan_depth`            | `scanDepth`       | 同上                                       |
| `exclude_recursion`     | `excludeRecursion`| 同上                                       |
| `prevent_recursion`     | `preventRecursion`| 同上                                       |
| `delay_until_recursion` | `delayUntilRecursion` | 同上                                   |
| `group_override`        | `groupOverride`   | 同上                                       |
| `group_weight`          | `groupWeight`     | 同上                                       |
| `automation_id`         | `automationId`    | 同上                                       |
| `use_regex`             | —                 | 卡内 spec 字段，独立世界书无对应；丢弃或保留 `extensions` |
| `addMemo`（缺失）       | 默认 true         | 老导出可能没有                             |
| 顶层 `originalData`     | —                 | 第三方编辑器（如 SillyTavernExtras）保留的原始导入数据，可忽略 |
| 顶层 `name` / `description` / `scan_depth` / `token_budget` / `recursive_scanning` | — | 来自 character_book 的字段，独立世界书导入时无意义但应保留以便 round-trip |

### 已废弃但仍可能见到的取值

- `selectiveLogic: 4`（曾短暂存在的「XOR」模式），1.10 后移除 —— 当 0 处理。
- `position: -1`（表示「禁用注入」），1.10 后改用 `disable: true` —— 转成 `disable: true`。

---

## 4. ⚠️ key / keysecondary 的存储

**1.10 之后统一为字符串数组**：

```json
"key": ["castle", "fortress", "/dark.*night/i"]
```

但你**仍能在野外见到**：

1. **逗号拼接字符串**：`"key": "castle, fortress"` —— NAI 风格 / 极老 ST。
   - 导入端：`typeof === 'string'` 时按 `,` 拆分并 trim，丢空。
2. **`/pattern/flags` 的正则字符串混在数组里** —— 仍是字符串元素，ST 会识别 `/.../i` 形态当正则用。导入时**不要去掉斜杠**，原样保留。
3. **null / undefined 元素** —— 老 bug 产物，过滤掉即可。

重新导出**一律写成数组**。

---

## 5. ⚠️ 布尔字段反义陷阱清单

| 字段              | 真值含义             | 容易搞反的点                                            |
| ----------------- | -------------------- | ------------------------------------------------------- |
| `disable`         | true = **禁用**      | 名字是 disable，不是 enabled；UI 显示的灯亮 = `!disable` |
| `constant`        | true = **蓝灯/常驻** | 不是「常量内容」的意思，是「常驻注入」                  |
| `selective`       | true = **启用次要关键词过滤** | 默认 true；很多人以为 false=「选择性」反了              |
| `vectorized`      | true = **向量匹配**  | 与 constant 互斥语义上，但字段独立                      |
| `useProbability`  | true = **启用概率**  | false 时 probability 字段被忽略，永远触发               |
| `groupOverride`   | true = **强制本条**  |                                                         |
| `excludeRecursion`| true = **不参与递归被触发** |                                                  |
| `preventRecursion`| true = **触发后断递归** | 与上一个**方向相反**，常被混淆                       |
| `delayUntilRecursion` | true/number = 延迟  | 老版本是 boolean，新版本可为数字，导入端两种都要支持   |

---

## 6. Round-trip 注意

可以做到 round-trip，但要遵守：

1. **保留未知字段**（`extensions`、`originalData`、第三方 keys）原样写回，不要丢。
2. `entries` **写回必须是对象**，记录键 = `String(uid)`。
3. `uid` 必须存在；若导入源没有（例如卡内 character_book），用数组 index 生成。
4. `key` / `keysecondary` 写回必须是数组，即使空。
5. **不要写出 null 字段**？—— 错。`scanDepth` 等三态字段（true/false/null）的 `null` **有语义**（用全局），必须保留。
6. ST 写出但读入忽略：`displayIndex` 实际用 UI 排序重算，可写可不写；`addMemo` 几乎是 dead flag。
7. 缺失即报错的：仅 `uid`、`content`、`key` 三项导入时若全无会被丢弃；其它字段都有默认。

---

## 7. 真实样本

放到 `_reference/samples/worldbook/`：

- 1 份独立世界书 `.json`，最好包含：
  - 至少 1 条 `position: 6 (@depth)` + 自定义 `depth` 和 `role` 的条目
  - 至少 1 条 `vectorized: true` 的条目
  - 至少 1 组 `group` 非空、`groupWeight` 不同的条目（≥2 条同组）
  - 至少 1 条触发了 `sticky` / `cooldown` / `delay` 中任一项的条目
  - 至少 1 条 `constant: true`（蓝灯）

导出路径：ST 顶部 Globe 图标 → World Info 面板 → 选世界书 → `Export`。
