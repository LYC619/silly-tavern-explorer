# SillyTavern 聊天记录 `.jsonl` 格式

> 适用版本：SillyTavern 1.11.x ~ 1.12.x（staging 主干）。野外仍能见到 1.9/1.10 老格式，文末单列。
> 文件编码：UTF-8，**无 BOM**，每行一个 JSON 对象，行尾 `\n`（Windows 端导出也是 `\n`，不是 `\r\n`）。
> 第 1 行是 metadata，**从第 2 行开始**才是消息（index 0 是开场白 / first_mes，由 ST 在新建聊天时写入）。

---

## 1. 第 1 行 Metadata

```json
{
  "user_name": "User",
  "character_name": "Seraphina",
  "create_date": "2024-6-1 @12h 30m 15s 123ms",
  "chat_metadata": {
    "note_prompt": "",
    "note_interval": 1,
    "note_position": 1,
    "note_depth": 4,
    "note_role": 0,
    "objective": { /* Objective 扩展 */ },
    "quickReply": { /* QR 扩展 */ },
    "variables": { "foo": "bar" },
    "tainted": false,
    "lastInContextMessageId": 42,
    "timedWorldInfo": { "sticky": {}, "cooldown": {} },
    "chat_id_hash": 1234567890
  }
}
```

字段说明：

| 字段                | 类型     | 说明                                                                 |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `user_name`         | string   | 写入时的 persona 名（可被后续 user 消息的 `name` 覆盖）              |
| `character_name`    | string   | 单卡聊天时的角色名；群聊时一般是群组名                               |
| `create_date`       | string   | ST 自有格式 `"YYYY-M-D @HHh MMm SSs MSms"`，**不是 ISO**，**无时区**（本地时间） |
| `chat_metadata`     | object   | 扩展挂载点，所有插件 / Author's Note / Objective / 变量都丢这里      |

`chat_metadata` 是开放对象，**任何插件都可能往里写自己的命名空间字段**。导入端遇到未知 key 应保留原样，不要丢弃，否则会破坏插件状态。

群聊文件里 metadata 还多一个 `chat_metadata.group_id`，并且 `character_name` 通常是空字符串。

---

## 2. 每条消息对象

```json
{
  "name": "Seraphina",
  "is_user": false,
  "is_system": false,
  "send_date": "June 1, 2024 12:31pm",
  "mes": "Hello, traveler.",
  "extra": {
    "api": "openai",
    "model": "gpt-4o-2024-08-06",
    "token_count": 128,
    "reasoning": "",
    "reasoning_duration": null,
    "bias": "",
    "gen_id": 1717245075123,
    "isSmallSys": false
  },
  "swipe_id": 0,
  "swipes": [
    "Hello, traveler.",
    "Greetings, wanderer.",
    "Oh — a visitor."
  ],
  "swipe_info": [
    { "send_date": "June 1, 2024 12:31pm", "gen_started": "...", "gen_finished": "...", "extra": { /* 同上 extra 结构 */ } },
    { "send_date": "June 1, 2024 12:32pm", "gen_started": "...", "gen_finished": "...", "extra": { /* ... */ } },
    { "send_date": "June 1, 2024 12:32pm", "gen_started": "...", "gen_finished": "...", "extra": { /* ... */ } }
  ],
  "gen_started": "2024-06-01T12:31:00.000Z",
  "gen_finished": "2024-06-01T12:31:08.421Z",
  "title": "",
  "force_avatar": "characters/Seraphina.png"
}
```

### 字段表

| 字段             | 类型              | 必填   | 含义 / 注意                                                                                              |
| ---------------- | ----------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| `name`           | string            | ✅     | 发言者名字。AI 消息＝角色名；user 消息＝当前 persona 名                                                  |
| `is_user`        | bool              | ✅     | true=用户，false=AI/系统                                                                                 |
| `is_system`      | bool              | ✅     | true 表示「ST 系统注入」（如 `/sys`、错误提示），不计入上下文                                            |
| `send_date`      | string            | ✅     | **关键：见下方专节**                                                                                     |
| `mes`            | string            | ✅     | **当前选中** swipe 的文本。等价于 `swipes[swipe_id]`（如果 swipes 存在）                                 |
| `extra`          | object            | ⚠️     | 见下                                                                                                     |
| `swipe_id`       | number            | ⚠️     | 当前 swipe 索引；只在该消息被 reroll 过时出现                                                            |
| `swipes`         | string[]          | ⚠️     | 所有候选文本；**长度 ≥ swipe_id+1**                                                                      |
| `swipe_info`     | object[]          | ⚠️     | 与 `swipes` 同长同序的元数据数组，每项 `{send_date, gen_started, gen_finished, extra}`                   |
| `gen_started`    | string (ISO8601)  | ⚠️     | 发起请求的 UTC 时间；user 消息一般没有                                                                   |
| `gen_finished`   | string (ISO8601)  | ⚠️     | 收到完整响应的 UTC 时间                                                                                  |
| `title`          | string            | ⚠️     | 几乎总是空；曾用于 `/title` 命令                                                                         |
| `force_avatar`   | string            | ⚠️     | 群聊里强制头像路径（相对 ST data 根）                                                                    |
| `bias`           | string            | ⚠️     | 老字段，已迁到 `extra.bias`，但导入时仍可能见到顶层                                                      |
| `tts`            | object            | ⚠️     | TTS 插件挂载，无关可忽略                                                                                 |

> ⚠️ 表示「常见但非必填」。鲁棒的解析器应当：`mes` 必读；`swipes`/`swipe_info` 缺失时合成 `swipes=[mes]`、`swipe_id=0`。

### `extra` 子字段（最常见的几个）

| 字段                  | 类型     | 含义                                                                              |
| --------------------- | -------- | --------------------------------------------------------------------------------- |
| `api`                 | string   | `"openai"` / `"claude"` / `"koboldhorde"` / `"textgenerationwebui"` / `"novel"` …  |
| `model`               | string   | 实际使用的模型 ID                                                                 |
| `token_count`         | number   | ST 估算的本条 token；非真值                                                       |
| `reasoning`           | string   | o1/Claude thinking 等推理过程明文                                                 |
| `reasoning_duration`  | number\|null | 推理耗时 ms                                                                   |
| `bias`                | string   | 注入的 author bias                                                                |
| `gen_id`              | number   | ST 内部生成 ID（去重用）                                                          |
| `isSmallSys`          | bool     | 是否「小系统提示」（灰条样式）                                                    |
| `image`               | string   | 多模态附图（data URL 或路径）                                                     |
| `inline_image`        | bool     | 配合 `image`，是否内联渲染                                                        |
| `file`                | object   | `{ url, size, name, text }` 附件                                                  |
| `tool_invocations`    | array    | function calling / tool use 调用记录                                              |
| `prompt`              | string   | （某些插件）记录的完整 prompt                                                     |

`extra` 是开放对象，处理同 `chat_metadata`：未知字段保留。

---

## 3. ⚠️ `swipes` 与 `mes` 的关系（最容易踩的坑）

规则：

1. `mes` 永远等于「当前对用户可见的那条文本」。
2. 若 `swipes` 存在：
   - `mes === swipes[swipe_id]` **应当成立**，但 ST 在某些重命名 / 编辑路径下会让两者短暂不一致；导入时**以 `mes` 为准**，写出时**两者一起更新**。
   - `swipe_info[swipe_id]` 对应「当前选中 swipe 的元数据」；它的 `send_date`/`extra` 才是这条可见消息真正的元数据。顶层的 `send_date`/`extra` 是「最初那条」的遗留。
3. 若 `swipes` 不存在：这条消息从未被 reroll，只有 `mes` 一份；`swipe_id` 也不会出现。
4. **永远不要假设 `swipes.length === swipe_info.length`**。老版本 ST 有过 swipe_info 短一截的 bug，安全做法：`swipe_info[i] ?? {}`。
5. 用户消息（`is_user: true`）**也可能有 swipes**（用户用 `/continue` 或编辑历史时产生），不要只在 AI 消息上找。

展示「当前 swipe + 其他候选」的伪代码：

```ts
const current = msg.swipes?.[msg.swipe_id ?? 0] ?? msg.mes;
const alternates = (msg.swipes ?? []).filter((_, i) => i !== (msg.swipe_id ?? 0));
```

---

## 4. ⚠️ `send_date` 的确切格式

ST 在 `public/scripts/RossAscends-mods.js` 里用 `humanizedDateTime()` 生成，**字符串、本地时间、无时区**。野外见过的形态：

| 形态                                       | 出处                          |
| ------------------------------------------ | ----------------------------- |
| `"June 1, 2024 12:31pm"`                   | 1.11+ 英文 locale（最常见）   |
| `"June 1, 2024 12:31:08pm"`                | 同上，开启秒级精度            |
| `"2024-6-1 @12h 31m 08s 123ms"`            | `create_date` 风格，少数旧版  |
| `"1 June 2024 12:31"`                      | 非英语 locale                 |
| `"6/1/2024, 12:31:08 PM"`                  | 极旧版本 fallback             |
| `1717245068000` (number)                   | 极少数自动化脚本写出来的脏数据 |

实务建议：

- **不要正则强解**，用宽松的 `Date.parse()` + fallback；解析失败就保留原字符串，仅用于显示。
- 排序请优先使用 `gen_finished` / `gen_started`（ISO8601，可靠），`send_date` 只作展示。
- 跨时区无解 —— 字段本身就不带 tz，导入到别人机器上会偏移；这是 ST 已知设计缺陷。

---

## 5. 老格式 / 兼容性

| 旧                                       | 新                                  | 处理                              |
| ---------------------------------------- | ----------------------------------- | --------------------------------- |
| 顶层 `bias`                              | `extra.bias`                        | 读时迁移                          |
| 没有 `swipe_info`                        | `swipe_info: []`                    | 合成空数组或按 swipes 补默认      |
| `is_name: true/false`                    | 已废弃                              | 忽略                              |
| `extra.api === "poe"`                    | 已废弃 API                          | 保留展示，按未知 API 处理         |
| 第一行没有 `chat_metadata`               | 1.10 之前                           | 视为 `{}`                         |
| `name` 字段缺失                          | 极老版本                            | 用 `is_user ? user_name : character_name` 兜底 |

---

## 6. 真实样本

请把你自己导出的一份 `.jsonl` 放到 `_reference/samples/chat/`，剧情可替换为无意义文本，但请保留：

- 第 1 行 metadata 完整结构
- 至少 1 条带 `swipes` ≥ 2 的 AI 消息
- 至少 1 条带 `extra.reasoning` 的消息（如果你用过 o1/Claude thinking）
- 至少 1 条 `is_system: true` 的系统消息

导出路径：ST 界面右上「Manage chat files」→ 选中聊天 → `Export JSONL`。
