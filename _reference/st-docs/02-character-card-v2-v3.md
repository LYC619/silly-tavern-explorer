# SillyTavern 角色卡 V1 / V2 / V3 + PNG 嵌入格式

> 规范来源：
> - V2: <https://github.com/malfoyslastname/character-card-spec-v2>
> - V3: <https://github.com/kwaroran/character-card-spec-v3>
>
> ST 实际实现见 `public/scripts/char-data.js` 与 `src/endpoints/characters.js`。

---

## 1. PNG 数据存放

角色卡 PNG = 普通 PNG + 若干 ancillary chunk。ST 在以下 chunk 里放数据：

| Chunk 类型 | Keyword  | 内容                                  | 出现版本         |
| ---------- | -------- | ------------------------------------- | ---------------- |
| `tEXt`     | `chara`  | base64(UTF-8 JSON)，V1/V2 卡数据      | 全部版本         |
| `tEXt`     | `ccv3`   | base64(UTF-8 JSON)，V3 卡数据         | 支持 V3 的客户端 |
| `tEXt`     | `chara-ext-asset_:<path>` | base64(二进制资源)，V3 的 embedded asset | V3        |

要点：

1. **不是 zTXt**。ST 只用未压缩 `tEXt`（PNG 规范要求 keyword ASCII、value Latin-1；base64 字符全部落在 Latin-1 内，所以合法）。
2. **优先级**：同时有 `ccv3` 和 `chara` 时，**优先读 `ccv3`**；`chara` 视作降级回退（很多卡作者为兼容老客户端会同时写两份，内容应当等价但不保证）。
3. base64 解码后是 **UTF-8 JSON 字符串**，不是 UTF-16，也不是带 BOM。
4. 一个 PNG 里可以有多个同 keyword 的 `tEXt`；按 PNG 规范应取第一个，但 ST 实际是「最后一个 wins」。鲁棒做法：取最后一个。
5. `chara-ext-asset_:` 前缀的 chunk 每个对应一份内嵌资源（额外表情图、背景等）。路径在 keyword 里，二进制在 base64 value 里。读取顺序无关。

### 解析伪代码

```ts
function readCharaChunks(png: Uint8Array) {
  const chunks = parsePngChunks(png); // 标准 IHDR/IDAT/tEXt/IEND 拆分
  const tEXt = chunks.filter(c => c.type === 'tEXt');
  let v3: any = null, v2: any = null;
  const assets: Record<string, Uint8Array> = {};
  for (const c of tEXt) {
    const nul = c.data.indexOf(0);
    const keyword = bytesToLatin1(c.data.subarray(0, nul));
    const value   = c.data.subarray(nul + 1);
    if (keyword === 'ccv3')  v3 = JSON.parse(utf8(base64Decode(value)));
    else if (keyword === 'chara') v2 = JSON.parse(utf8(base64Decode(value)));
    else if (keyword.startsWith('chara-ext-asset_:')) {
      assets[keyword.slice('chara-ext-asset_:'.length)] = base64Decode(value);
    }
  }
  return { card: v3 ?? v2, isV3: !!v3, assets };
}
```

---

## 2. V1 卡（最老，平铺）

无 `spec` 字段，无 `data` 包裹，全部平铺在顶层：

```json
{
  "name": "Seraphina",
  "description": "...",
  "personality": "...",
  "scenario": "...",
  "first_mes": "...",
  "mes_example": "...",
  "avatar": "none"
}
```

V1 → V2 直接把这些字段塞进 `data` 即可；新字段全部留空 / 默认。

---

## 3. V2 卡：`chara_card_v2`

```json
{
  "spec": "chara_card_v2",
  "spec_version": "2.0",
  "data": {
    "name": "Seraphina",
    "description": "...",
    "personality": "...",
    "scenario": "...",
    "first_mes": "...",
    "mes_example": "<START>\n{{user}}: hi\n{{char}}: hello\n",
    "creator_notes": "...",
    "system_prompt": "",
    "post_history_instructions": "",
    "alternate_greetings": ["...", "..."],
    "tags": ["fantasy", "elf"],
    "creator": "someone",
    "character_version": "1.0",
    "extensions": {
      "talkativeness": "0.5",
      "fav": false,
      "world": "MyWorld",
      "depth_prompt": { "prompt": "...", "depth": 4, "role": "system" },
      "regex_scripts": [ /* 角色专属正则，见 04 */ ]
    },
    "character_book": { /* 内嵌世界书，见 §5 */ }
  }
}
```

字段表：

| 字段                          | 类型           | 含义                                                                       |
| ----------------------------- | -------------- | -------------------------------------------------------------------------- |
| `name`                        | string         | 角色名；也用作 `{{char}}` 替换                                             |
| `description`                 | string         | 永久注入上下文的角色描述                                                   |
| `personality`                 | string         | 性格摘要（拼到 description 之后）                                          |
| `scenario`                    | string         | 场景设定                                                                   |
| `first_mes`                   | string         | 开场白；新建聊天时作为 index 0 写入 jsonl                                  |
| `mes_example`                 | string         | 对话示例；以 `<START>` 分块                                                |
| `creator_notes`               | string         | 作者备注（不进 prompt，仅 UI 显示）                                        |
| `system_prompt`               | string         | 覆盖 ST 默认 system prompt（空＝不覆盖）                                   |
| `post_history_instructions`   | string         | 注入到对话历史末尾的指令（jailbreak 位）                                   |
| `alternate_greetings`         | string[]       | 备选开场白                                                                 |
| `tags`                        | string[]       | 标签                                                                       |
| `creator`                     | string         | 作者名                                                                     |
| `character_version`           | string         | 版本号字符串                                                               |
| `extensions`                  | object         | 开放对象，所有插件挂载点                                                   |
| `character_book`              | object \| null | 内嵌世界书，结构见 §5                                                      |

`extensions` 里 ST 自己常写：

| key                 | 含义                                                          |
| ------------------- | ------------------------------------------------------------- |
| `talkativeness`     | 群聊抢话权重（字符串数字 0~1）                                |
| `fav`               | 是否收藏                                                      |
| `world`             | 绑定的独立世界书文件名（不带 .json）                          |
| `depth_prompt`      | `{prompt, depth, role}`，相当于角色级 @depth 注入             |
| `regex_scripts`     | 角色专属正则脚本数组                                          |

---

## 4. V3 卡：`chara_card_v3`

顶层同样 `{spec, spec_version, data}`，`spec === "chara_card_v3"`，`spec_version === "3.0"`。

`data` **包含 V2 的全部字段**，并新增：

| 新字段                          | 类型                     | 含义                                                                                                              |
| ------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `assets`                       | Asset[]                  | 内嵌资源清单                                                                                                      |
| `nickname`                     | string                   | `{{char}}` 替换时优先用 nickname；不影响 description                                                              |
| `creator_notes_multilingual`   | Record<string,string>    | `{ "en": "...", "zh": "..." }`，按用户语言挑                                                                      |
| `source`                       | string[]                 | 该卡的来源 URL 数组                                                                                               |
| `group_only_greetings`         | string[]                 | 仅群聊触发的开场白                                                                                                |
| `creation_date`                | number (unix seconds)    | 创建时间                                                                                                          |
| `modification_date`            | number (unix seconds)    | 修改时间                                                                                                          |

### `Asset` 结构

```json
{
  "type": "icon",          // "icon" | "background" | "user_icon" | "emotion" | "x-*"（扩展）
  "uri": "embeded://path/to/file.png", // 也允许 http(s)://、ccdefault:
  "name": "main",
  "ext": "png"
}
```

`uri` 的 scheme：

- `embeded://<path>`（注意拼写就是 `embeded`，spec 写错了，**沿用错误拼写**）→ 对应 PNG 里 `chara-ext-asset_:<path>` chunk
- `ccdefault:` → 用客户端默认资源
- `http://` / `https://` → 外链
- `data:` → 内联 data URL

`type === "icon"` 且 `name === "main"` 的那一份就是默认头像，等价于 PNG 本身画面。

### V3 的 `character_book`

结构与 V2 内嵌的 character_book **基本一致**，但 entry 多了 V3 新字段（`use_regex`, `extensions` 更丰富）。详见下一节。

---

## 5. ⚠️ 内嵌 `character_book` vs 独立世界书（字段映射）

**两者字段命名风格不同**，是导入端踩坑重灾区。`character_book` 用 spec 规定的 snake_case；独立世界书（ST 自己的 export）用历史遗留的 camelCase + 短名。

### `character_book` 顶层（spec 规范）

```json
{
  "name": "Seraphina's World",
  "description": "",
  "scan_depth": 50,
  "token_budget": 500,
  "recursive_scanning": false,
  "extensions": {},
  "entries": [ /* Entry[] */ ]
}
```

### `character_book` 的 Entry

```json
{
  "keys": ["castle", "fortress"],
  "secondary_keys": ["dark"],
  "comment": "Castle lore",
  "content": "The castle of ...",
  "constant": false,
  "selective": true,
  "insertion_order": 100,
  "enabled": true,
  "position": "before_char",
  "use_regex": false,
  "extensions": {
    "position": 0,
    "exclude_recursion": false,
    "display_index": 0,
    "probability": 100,
    "useProbability": true,
    "depth": 4,
    "selectiveLogic": 0,
    "group": "",
    "group_override": false,
    "group_weight": 100,
    "prevent_recursion": false,
    "delay_until_recursion": false,
    "scan_depth": null,
    "match_whole_words": null,
    "case_sensitive": null,
    "automation_id": "",
    "role": 0,
    "vectorized": false,
    "sticky": 0,
    "cooldown": 0,
    "delay": 0
  }
}
```

`position` 字段在 spec 里是**字符串枚举**：`"before_char"` / `"after_char"` / `"before_an"` / `"after_an"` / `"at_depth"`。
**真正决定行为的是 `extensions.position` 数字**（与独立世界书的 position 数字一致）。字符串只用于不支持扩展的客户端。

### 独立世界书的 Entry（对比）

```json
{
  "uid": 0,
  "key": ["castle", "fortress"],
  "keysecondary": ["dark"],
  "comment": "Castle lore",
  "content": "...",
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
  "role": null,
  "sticky": 0,
  "cooldown": 0,
  "delay": 0,
  "displayIndex": 0
}
```

### 字段映射表（卡内 ↔ 独立）

| 卡内 `character_book` Entry                       | 独立世界书 Entry              | 备注                                |
| ------------------------------------------------- | ------------------------------ | ----------------------------------- |
| `keys`                                            | `key`                          | 都是数组                            |
| `secondary_keys`                                  | `keysecondary`                 | 都是数组                            |
| `comment`                                         | `comment`                      |                                     |
| `content`                                         | `content`                      |                                     |
| `constant`                                        | `constant`                     |                                     |
| `selective`                                       | `selective`                    |                                     |
| `insertion_order`                                 | `order`                        | ⚠️ 改名                              |
| `enabled`                                         | `!disable`                     | ⚠️ **取反**                          |
| `position`（字符串）                              | —                              | 仅 spec 兼容，运行时不看            |
| `extensions.position`（数字）                     | `position`                     | ⚠️ 真正生效的是这个                  |
| `extensions.depth`                                | `depth`                        |                                     |
| `extensions.selectiveLogic`                       | `selectiveLogic`               |                                     |
| `extensions.role`                                 | `role`                         |                                     |
| `extensions.probability`                          | `probability`                  |                                     |
| `extensions.useProbability`                       | `useProbability`               |                                     |
| `extensions.exclude_recursion`                    | `excludeRecursion`             | ⚠️ snake → camel                     |
| `extensions.prevent_recursion`                    | `preventRecursion`             | ⚠️                                  |
| `extensions.delay_until_recursion`                | `delayUntilRecursion`          | ⚠️                                  |
| `extensions.group`                                | `group`                        |                                     |
| `extensions.group_override`                       | `groupOverride`                | ⚠️                                  |
| `extensions.group_weight`                         | `groupWeight`                  | ⚠️                                  |
| `extensions.scan_depth`                           | `scanDepth`                    | ⚠️                                  |
| `extensions.match_whole_words`                    | `matchWholeWords`              | ⚠️                                  |
| `extensions.case_sensitive`                       | `caseSensitive`                | ⚠️                                  |
| `extensions.automation_id`                        | `automationId`                 | ⚠️                                  |
| `extensions.display_index`                        | `displayIndex`                 | ⚠️                                  |
| `extensions.vectorized` / 顶层 `vectorized`       | `vectorized`                   | 卡内两处都见过，以 extensions 为准  |
| `extensions.sticky` / `cooldown` / `delay`        | 同名                           |                                     |
| `use_regex`                                       | —                              | V3 新增，独立世界书暂无对应         |
| —                                                 | `uid`                          | 独立世界书必填；卡内由 entries 数组下标隐含 |
| —                                                 | `addMemo`                      | 独立世界书内部 UI flag，导入卡内时给 true |

转换原则：

1. **卡内 → 独立**：`uid` 用数组 index；`enabled` 翻成 `disable = !enabled`；所有 `extensions.*` 提到顶层并改驼峰；`position` 用 `extensions.position` 优先，字符串作 fallback。
2. **独立 → 卡内**：反向。`position` 数字同时写入 `extensions.position` 和字符串枚举（无对应数字时填 `"before_char"`）。

---

## 6. 真实样本

放到 `_reference/samples/charcard/`：

- 一张 V2 PNG（chub.ai / Janitor 老卡，多半是 V2）
- 一张 V3 PNG（最新的 ST 自己导出的多半带 ccv3）
- 解码后的 JSON（方便不读 PNG 也能比对结构）

获取方式：
- ST 角色列表 → 角色 → 「Export Character」→ 选 `PNG Tavern Card v2` 或 `JSON`。
- 在线卡站直接下载即可。

> 写卡功能不在本工具范围 —— 文档仅供「只读解析与展示」。
