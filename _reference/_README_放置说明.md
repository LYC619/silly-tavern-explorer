# 参考资料投放说明

这个文件夹**不进 Git**（已加入 `.gitignore`），仅供 AI 对照真实 SillyTavern（ST）格式用。
请把下面要的东西放进对应子文件夹。**真实样本 > 文档描述 > 我凭记忆**，所以样本文件最值钱。

> 隐私提醒：聊天样本里的私人内容可以删/改成无意义文本，**我只看结构字段，不需要真实剧情**。把几条消息的 JSON 结构保留即可。

---

## 文件夹用途

| 文件夹 | 放什么 |
|--------|--------|
| `st-docs/` | ST 官方文档的文字/markdown（见下方清单） |
| `samples/chat/` | 真实导出的聊天文件样本 |
| `samples/charcard/` | 真实角色卡（PNG / JSON） |
| `samples/worldbook/` | 真实世界书/lorebook 导出 |
| `samples/regex/` | 真实正则脚本导出 |
| `st-source/` | ST 源码相关文件（见下方搜索清单） |

---

## A. 给 Lovable 的文档请求（放 `st-docs/`）

请让 Lovable 用文字/markdown 整理以下主题（**要带真实字段名和取值范围**，不要泛泛而谈）。
每条单独存一个 `.md` 文件，文件名我已写好：

1. **`01-chat-jsonl-format.md`** —— ST 聊天记录 `.jsonl` 的完整结构：
   - 第一行（metadata 行）有哪些字段？`user_name` / `character_name` / `create_date` / `chat_metadata` 内部结构。
   - 每条消息对象的**全部字段**及含义：`name` / `is_user` / `is_system` / `send_date` / `mes` / `extra`（extra 里面有什么？）/ `swipe_id` / `swipes[]` / `swipe_info[]` / `gen_started` / `gen_finished` / `force_avatar` / `title` 等。
   - **重点**：`swipes` 和 `mes` 的关系——当前显示的是哪一条？`swipe_id` 怎么索引？`swipe_info[]` 每项的结构。
   - `send_date` 的**确切字符串格式**（举 2-3 个真实例子，含时区写法）。

2. **`02-character-card-v2-v3.md`** —— 角色卡格式：
   - PNG 里数据存在哪个 chunk？关键字是 `chara`（V1/V2）还是 `ccv3`（V3）？`tEXt` 还是 `zTXt`？base64 怎么编码？
   - **V2 卡** `spec: chara_card_v2` 的 `data` 对象全部字段：`name` / `description` / `personality` / `scenario` / `first_mes` / `mes_example` / `creator_notes` / `system_prompt` / `post_history_instructions` / `alternate_greetings[]` / `tags[]` / `creator` / `character_version` / `extensions` / `character_book`。
   - **V3 卡** `spec: chara_card_v3` 相比 V2 多了什么（`assets[]` / `nickname` / `group_only_greetings[]` / `creator_notes_multilingual` 等）。
   - 内嵌的 `character_book`（卡里的世界书）字段命名，和独立世界书有何**命名差异**（卡内用 `keys`/`secondary_keys`/`insertion_order`/`enabled` 还是别的？）。

3. **`03-worldbook-format.md`** —— 独立世界书/lorebook `.json`：
   - 顶层结构：`entries` 是**对象（按 uid 为键）**还是**数组**？两种都存在吗？
   - 单个 entry 的**全部字段**及取值：`key[]` / `keysecondary[]` / `comment` / `content` / `constant` / `selective` / `selectiveLogic`(0-3 各代表?) / `order` / `position`(0-7 各代表? 含 @depth) / `depth` / `role`(0/1/2?) / `probability` / `disable`/`enabled` / `excludeRecursion` / `preventRecursion` / `delayUntilRecursion` / `group` / `groupOverride` / `sticky` / `cooldown` / `delay` / `scanDepth` / `caseSensitive` / `matchWholeWords` / `automationId`。
   - **老格式**：早期 `position` 是不是用 `before_char`/`after_char` 这种字符串？老 entry 还有哪些已废弃字段？我需要做向后兼容。

4. **`04-regex-script-format.md`** —— ST 正则脚本 `.json`：
   - 单个脚本对象全部字段：`id` / `scriptName` / `findRegex` / `replaceString` / `trimStrings[]` / `placement[]`（数字枚举：1=user?2=AI?3=slash?4=WI?5=reasoning? 请确认）/ `disabled` / `markdownOnly` / `promptOnly` / `runOnEdit` / `substituteRegex` / `minDepth` / `maxDepth`。
   - 导出文件是单个脚本一个 `.json`，还是多个打包？文件结构长什么样。

5. **`05-import-export-behavior.md`**（可选但有用）——
   - ST 里"导出聊天"分哪几种（JSONL / 纯文本 / 等）？各自包含/丢弃什么？
   - 角色卡导出时世界书是内嵌还是分离？

> 如果 Lovable 能**直接附真实文件**，比文字描述更好——直接丢进 `samples/`。

---

## B. 给搜索 agent 的项目请求（放 `st-source/`）

我需要**真实 ST 源码片段**来 100% 对齐字段。优先级从高到低：

1. **【最高】SillyTavern 官方仓库的这几个文件**（GitHub `SillyTavern/SillyTavern`）：
   - `public/scripts/world-info.js` —— 世界书字段定义、`world_info_position` 枚举、import/export 逻辑。
   - `public/scripts/char-data.js` 或角色卡相关 —— V2/V3 卡字段、`character_book` 转换。
   - `public/scripts/extensions/regex/` 目录 —— 正则脚本结构、`regex_placement` 枚举、应用顺序。
   - 聊天导入导出相关（搜 `saveChatConditional` / `openCharacterChat` / chat jsonl 写出的地方）。
   > 这些文件较大，**只要相关函数/常量定义那几段**，不用整文件。

2. **角色卡规范仓库**（用来对齐 V2/V3 字段）：
   - `malfoyslastname/character-card-spec-v2`（或 `kwaroran/character-card-spec-v3`）的 `README` / spec 文档。

3. **真实样本文件**（比源码还直接，能搞到就最好，放 `samples/`）：
   - 1 个真实角色卡 PNG（V2 或 V3，内容随意）→ `samples/charcard/`
   - 1 份真实聊天 `.jsonl`（剧情可脱敏）→ `samples/chat/`
   - 1 份带各种 position/递归设置的世界书 `.json` → `samples/worldbook/`
   - 1 份真实正则脚本 `.json` → `samples/regex/`

---

## C. 我今晚会基于现状先做的（不依赖上面资料）

即使资料还没到，我也能先推进这些不依赖 ST 格式细节的板块。具体见 `task_plan.md`。
依赖格式对齐的（角色卡 V2/V3 解析、正则脚本 import/export、世界书老格式兼容）会**等资料到齐再动**，避免凭记忆写错字段。
