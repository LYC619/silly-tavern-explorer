# 给 Lovable 的提示词（3 份 + 样本）

> **怎么用**：下面每个 `==== 提示词 N ====` 之间的整块，**整段复制**发给 Lovable。
> Lovable 那边连着同一个项目，它生成的 `.md` 请放到本文件夹指定路径。
> 它找不到的，你再手动补；样本文件最值钱，能搞到真实文件直接丢 `samples/`。

> 三份提示词覆盖你选的三个板块：① 世界书加固 ② 正则脚本互通 ③ 角色卡只读查看。
> 此外加一个「真实样本索取」清单（提示词 4）。

---

## ==== 提示词 1：世界书格式（对应「世界书板块加固」）====

```
你好，我在帮一个 SillyTavern 聊天归档工具对齐世界书(World Info / Lorebook)的真实格式。
我的项目已经能 import/export 世界书 JSON，但只支持「现代格式」，我需要你帮我把真实 ST 的
格式细节、尤其是【老格式/边缘情况/字段取值枚举】写成一份 markdown 文档。

请生成文件，放到项目的 `_reference/st-docs/03-worldbook-format.md`。

我现在的数据模型（用 TypeScript 表示，已支持的字段）是这样的，请基于它指出【差异和我漏掉的】，
不要泛泛重复我已有的：

  position: number  // 我现在认为 0=角色前,1=角色后,2=示例前,3=示例后,4=AN顶,5=AN底,6=@depth,7=Outlet
  selectiveLogic: number // 0=AND ANY,1=NOT ALL,2=NOT ANY,3=AND ALL
  role: number // 0=system,1=user,2=assistant
  其他字段：uid,key[],keysecondary[],comment,content,constant,vectorized,selective,enabled,
  depth,order,probability,group,groupOverride,groupWeight,sticky,cooldown,delay,
  scanDepth,caseSensitive,matchWholeWords,useGroupScoring,automationId,
  excludeRecursion,preventRecursion,delayUntilRecursion,displayIndex

请重点回答（带真实字段名、真实取值，最好附 1-2 个真实 JSON 片段）：

1. 【顶层结构】导出的世界书 JSON 顶层长什么样？`entries` 是「以 uid 为键的对象」还是「数组」？
   两种都在野外出现过吗？除了 entries，顶层还有什么字段（name? description? 等）？

2. 【position 枚举确认】上面我标的 0-7 对不对？尤其 6=@depth 时，是不是配合 `depth` + `role` 字段一起用？
   7 是什么？有没有我列错或漏掉的取值？

3. 【老格式兼容 ——这是我最需要的】早期 ST 世界书里 `position` 是不是用过字符串
   `"before_char"` / `"after_char"` 这种？还有哪些【已废弃但野外仍存在】的旧字段名或旧取值？
   例如旧版的 key 是 `key` 还是 `keys`？enabled 是 `enabled` 还是 `disable`(反义)？
   我要做向后兼容，请尽量列全「旧名 → 新名」的映射。

4. 【key 的存储】导出时 `key`/`keysecondary` 在文件里是「逗号拼接的字符串」还是「字符串数组」？
   不同 ST 版本有差异吗？

5. 【布尔字段的反义陷阱】有没有那种「字段名是否定义」的坑？比如 `disable` vs `enabled`、
   `constant` 的真假含义、`selective` 默认值。导入时容易搞反的都点出来。

6. 【round-trip】如果我导入再原样导出，ST 还能正常读回吗？有哪些字段是「ST 写出来但读入时忽略」的，
   或者「缺了就报错」的必填字段？

如果你能直接附一个真实的世界书导出 JSON 文件作为例子，请一并放到 `_reference/samples/worldbook/`。
```

---

## ==== 提示词 2：正则脚本格式（对应「正则脚本互通」）====

```
你好，我在帮一个 SillyTavern 聊天归档工具增加「导入/导出 ST 正则脚本(Regex script)」的能力。
我的项目目前有自己的内部正则规则结构，但和 ST 的正则脚本 JSON 不互通，我需要双向兼容。
请把 ST 正则脚本的真实文件格式写成 markdown。

请生成文件，放到 `_reference/st-docs/04-regex-script-format.md`。

我项目现在的内部结构（精简版，我要把它和 ST 格式互相转换）：
  { id, name, findRegex, replaceString, placement: ('all'|'user'|'assistant')[], disabled }

请重点回答（带真实字段名和真实取值，最好附 1 个真实导出 JSON）：

1. 【单个脚本对象的全部字段】请列出 ST 正则脚本对象的每一个字段及含义：
   id, scriptName, findRegex, replaceString, trimStrings[], placement[], disabled,
   markdownOnly, promptOnly, runOnEdit, substituteRegex, minDepth, maxDepth
   —— 有没有我漏的？每个字段的类型和默认值是什么？

2. 【placement 数字枚举 ——关键】placement 是数字数组。请确认每个数字代表什么：
   是不是 1=user input, 2=AI output, 3=slash command, 4=world info, 5=reasoning？
   我列得对吗？有没有新增的取值？

3. 【substituteRegex】这个字段是数字还是布尔？它的取值含义（0/1/2 分别是不替换/原始/转义？）。

4. 【findRegex 的写法】findRegex 字段里存的是「/pattern/flags」带斜杠的完整形式，
   还是只存 pattern 本体、flags 另外存？replaceString 里的 `$1`/`{{match}}` 这类占位符有哪些？

5. 【文件结构】导出一个正则脚本时，文件是「单个脚本对象一个 .json」，还是「数组打包多个」？
   ST 的「全局正则」和「角色专属正则」导出格式有区别吗？文件名有约定吗？

6. 【应用顺序与时机】多个正则脚本的执行顺序由什么决定（数组顺序？还是有 order 字段？）。
   runOnEdit / promptOnly / markdownOnly 分别在什么时机生效（仅供我写注释说明，不强求）。

如果能附一个真实的正则脚本导出 .json，请放到 `_reference/samples/regex/`。
```

---

## ==== 提示词 3：角色卡 V2/V3 + PNG（对应「角色卡只读查看」）====

```
你好，我在帮一个 SillyTavern 聊天归档工具增加「只读查看角色卡」的功能（解析并展示，不做编辑写卡）。
我需要把 ST 角色卡(Character Card) V2/V3 的真实格式、以及 PNG 里数据的存放方式写成 markdown。

请生成文件，放到 `_reference/st-docs/02-character-card-v2-v3.md`。

我现在只做了半成品：从 PNG 的 tEXt chunk 读 `chara` 关键字、base64 解 JSON，但只取了 name 和 first_mes，
其余全丢弃，也不支持 V3。请帮我补全：

请重点回答（带真实字段名、真实结构，最好附 1 个真实角色卡的 JSON 解码结果）：

1. 【PNG 数据存放】角色卡 PNG 里，数据存在哪个 chunk？
   - V1/V2 用 tEXt + 关键字 `chara`(base64) 对吗？
   - V3 是不是用关键字 `ccv3` 的 chunk？是 tEXt 还是 zTXt(压缩)？
   - 如果一张 PNG 同时有 chara 和 ccv3，应该优先读哪个？
   - base64 解码后是 JSON 字符串，编码是 UTF-8 吗？

2. 【V2 卡 spec: chara_card_v2】顶层是 `{spec, spec_version, data:{...}}` 对吗？
   请列出 data 内的全部字段及含义：
   name, description, personality, scenario, first_mes, mes_example,
   creator_notes, system_prompt, post_history_instructions,
   alternate_greetings[], tags[], creator, character_version, extensions, character_book
   —— 哪些是字符串，哪些是数组，有没有我漏的？

3. 【V3 卡 spec: chara_card_v3】相比 V2 多了/改了什么？请列出 V3 新增字段：
   assets[]（结构？type/uri/name/ext）、nickname、group_only_greetings[]、
   creator_notes_multilingual、source[]、creation_date、modification_date 等。
   V3 的 character_book 和 V2 有差异吗？

4. 【内嵌 character_book ——关键】角色卡里嵌的世界书，它的字段命名和「独立世界书」不一样对吗？
   我记得卡内世界书 entry 用的是 keys / secondary_keys / insertion_order / enabled / case_sensitive
   这种 snake_case，而独立世界书用 key / keysecondary / order / position 等。
   请把【卡内 character_book 格式】完整列出来（顶层有 name/description/scan_depth/token_budget/
   recursive_scanning/entries[]，entry 有 keys[]/secondary_keys[]/comment/content/constant/
   selective/insertion_order/enabled/position/extensions 等），并给出它和独立世界书的字段映射表。

5. 【V1 老卡】最老的 V1 卡是不是没有 data 包裹、字段直接平铺在顶层（name/description/...）？
   我要兼容这种。请说明 V1 → V2 的字段对应。

如果能附一张真实角色卡 PNG（内容随意，我只看结构）或它解码后的 JSON，请放到 `_reference/samples/charcard/`。
```

---

## ==== 提示词 4：聊天 jsonl（顺带，对应导入核心，虽然这次没选但很有用）====

```
你好，请帮我把 SillyTavern 聊天记录 .jsonl 的真实文件格式写成 markdown，
放到 `_reference/st-docs/01-chat-jsonl-format.md`。

我的工具已经能解析 jsonl，但 swipes(重roll候选) 我只统计没真正建模，send_date 格式也吃不准。
请重点回答（附真实例子）：

1. 【第一行 metadata】jsonl 第一行是元数据对象，有哪些字段？
   user_name, character_name, create_date, chat_metadata 内部结构（chat_metadata 里有什么？）。

2. 【每条消息字段】每条消息对象的全部字段及含义：
   name, is_user, is_system, send_date, mes, extra(里面有什么？比如 api/model/token_count/bias),
   title, gen_started, gen_finished, swipe_id, swipes[], swipe_info[], force_avatar。

3. 【swipes 和 mes 的关系 ——关键】当前显示的消息文本，是 `mes` 还是 `swipes[swipe_id]`？
   两者一定一致吗？swipe_id 怎么索引 swipes 数组？swipe_info[] 每一项的结构是什么
   (send_date/gen_started/extra 等)？我想正确地把「当前选中的 swipe」显示出来，并可选地展示其它候选。

4. 【send_date 确切格式 ——关键】举 2-3 个真实的 send_date 例子。它是字符串还是数字 epoch？
   字符串的话确切格式是什么（"June 1, 2024 12:00pm"? 带时区吗？不同版本/语言区有差异吗？）。

如果能附一份真实 jsonl（剧情可脱敏改成无意义文本，我只看结构），放到 `_reference/samples/chat/`。
```

---

## 补充：真实样本清单（最值钱，能直接给文件就别写文档）

放到对应 `samples/` 子文件夹，剧情可随意脱敏，我只看 JSON 结构：

- `samples/charcard/` —— 1 张真实角色卡 PNG（V2 一张、V3 一张更好）
- `samples/chat/` —— 1 份真实聊天 .jsonl（带 swipes 的那种最好）
- `samples/worldbook/` —— 1 份独立世界书 .json（带 @depth/递归/group 设置的）
- `samples/regex/` —— 1 份真实正则脚本导出 .json
