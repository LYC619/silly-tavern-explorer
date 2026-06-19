# SillyTavern 正则脚本 (Regex Script) 格式

> 参考实现：内置 `Regex` 扩展，源码在 `public/scripts/extensions/regex/`。
> 适用版本：1.11.x ~ 1.12.x。

---

## 1. 单个脚本对象（完整字段）

```json
{
  "id": "9e2c7a64-1c4f-4e2c-9c9b-2c8c7b0a1d3f",
  "scriptName": "Strip thinking tags",
  "findRegex": "/<think>[\\s\\S]*?<\\/think>/gi",
  "replaceString": "",
  "trimStrings": [],
  "placement": [2],
  "disabled": false,
  "markdownOnly": false,
  "promptOnly": false,
  "runOnEdit": true,
  "substituteRegex": 0,
  "minDepth": null,
  "maxDepth": null
}
```

### 字段表

| 字段              | 类型                | 默认             | 含义                                                                                            |
| ----------------- | ------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `id`              | string (UUID v4)    | 自动生成         | 脚本唯一 ID，去重和引用用                                                                       |
| `scriptName`      | string              | `""`             | 显示名                                                                                          |
| `findRegex`       | string              | `""`             | 查找模式，**带 `/.../flags` 完整斜杠形式**，见 §4                                                |
| `replaceString`   | string              | `""`             | 替换文本，支持 `$1` / `{{match}}` 等占位符，见 §4                                                |
| `trimStrings`     | string[]            | `[]`             | **替换后**再做的字面 trim 列表；逐个 `replaceAll(s, "")`                                        |
| `placement`       | number[]            | `[]`             | 应用范围数字数组，见 §2                                                                         |
| `disabled`        | boolean             | `false`          | true=禁用                                                                                       |
| `markdownOnly`    | boolean             | `false`          | true = 仅影响**显示渲染**（不改实际历史）                                                       |
| `promptOnly`      | boolean             | `false`          | true = 仅影响**发往 LLM 的 prompt**（不改 UI 显示）                                             |
| `runOnEdit`       | boolean             | `true`           | true = 用户在 UI 编辑该消息时也跑一遍                                                           |
| `substituteRegex` | number (0/1/2)      | `0`              | macro 替换策略，见 §3                                                                           |
| `minDepth`        | number \| null      | `null`           | 仅作用于倒数 ≥ N 条消息（null = 不限）                                                          |
| `maxDepth`        | number \| null      | `null`           | 仅作用于倒数 ≤ N 条消息（null = 不限）                                                          |

> `markdownOnly` + `promptOnly` 两个开关**不互斥**，但语义上一般只开一个：
> - 都 false（默认）：同时改 UI 和 prompt（即真正改写历史）
> - 仅 `markdownOnly`：只「美化」显示
> - 仅 `promptOnly`：只「净化」给模型的输入，UI 保持原样

---

## 2. ⚠️ `placement` 数字枚举

`placement` 是数字数组，每个数字代表「对哪种字符串应用此正则」。当前主线取值：

| 值 | 含义                          | 说明                                                          |
| -- | ----------------------------- | ------------------------------------------------------------- |
| 1  | User Input                    | 用户输入框送出前                                              |
| 2  | AI Output                     | AI 返回后立即处理                                             |
| 3  | Slash Command                 | `/run` / `/echo` 等命令输出                                   |
| 4  | World Info                    | WI 条目注入到 prompt 时                                       |
| 5  | Reasoning                     | o1/Claude `<thinking>` 推理段                                 |

> 你列的 1-5 全部正确。**没有 0、没有 6+**（截至 1.12）。空数组 `[]` 表示「哪儿都不应用」，是有效但无意义的状态。
>
> 多个数字 = 多个时机都跑，例如 `[1, 2]` 表示用户输入和 AI 输出都处理。

---

## 3. `substituteRegex` 取值

控制「`findRegex` / `replaceString` 内的 `{{macro}}` 何时展开」：

| 值 | 行为                                                                        |
| -- | --------------------------------------------------------------------------- |
| 0  | **不替换**。字面保留 `{{user}}` 等                                          |
| 1  | **Raw 替换**。先展开 macro 再当正则用（macro 内容可能含正则元字符）         |
| 2  | **Escaped 替换**。展开 macro 后对结果调用 `escapeRegex()`，再当正则用       |

`replaceString` 侧的 macro 展开规则与此对齐：0=不展开，1/2 都展开（2 不再 escape，因为是替换文本）。

实务：自定义触发词用 `{{user}}` 之类时务必选 **2**，避免用户名里有 `.` `(` `[` 等被当正则元字符。

---

## 4. `findRegex` 写法 / `replaceString` 占位符

### findRegex

**带斜杠的完整形式**：`/pattern/flags`，例如：

```
/<think>[\s\S]*?<\/think>/gi
/^\s*##\s+(.+)$/gm
/{{user}}/g            ← 配合 substituteRegex 才有意义
```

不是「pattern + flags 分两个字段」。flags 支持 `g i m s u y`，**`g` 几乎总要带**（否则只替换第一处）。

转义注意：JSON 字符串里反斜杠要双写，所以 `\s\S` 在文件里是 `\\s\\S`。

非斜杠包裹的字符串（如 `"<think>.*?</think>"`）也会被 ST 当 pattern 处理（flags = `g`），但**官方推荐始终带斜杠**，避免歧义。

### replaceString 占位符

| 占位符        | 含义                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `$1` `$2` ... | 标准正则反向引用，匹配第 N 个捕获组                                      |
| `$&`          | 整个匹配文本                                                             |
| `$<name>`     | 命名捕获组                                                               |
| `{{match}}`   | 整个匹配（与 `$&` 等价的 ST 友好别名）                                   |
| `{{user}}` / `{{char}}` / `{{newline}}` / 任意 ST macro | 按 `substituteRegex` 规则展开           |

`trimStrings` 在最终替换结果上**再跑一遍字面 replaceAll**，常用于清理「替换后残留的空尖括号、空行」等。

---

## 5. 文件结构 / 单 vs 多

### 5.1 全局正则（Global Regex）

存放路径：ST 的 `data/<user>/regex/`，**每个脚本一个 `.json` 文件**：

```json
// data/<user>/regex/Strip thinking tags.json
{
  "id": "9e2c7a64-...",
  "scriptName": "Strip thinking tags",
  "findRegex": "/<think>[\\s\\S]*?<\\/think>/gi",
  "replaceString": "",
  "...": "..."
}
```

文件名 = `scriptName` + `.json`（特殊字符会被 ST 清洗，但**导入时不依赖文件名**，以 JSON 内 `id` / `scriptName` 为准）。

UI 上的「Export」按钮导出的也是**单个脚本一个文件**。

### 5.2 角色专属正则（Character Regex）

不存独立文件，**内嵌在角色卡的 `data.extensions.regex_scripts`** 字段里，是一个**数组**：

```json
{
  "spec": "chara_card_v2",
  "data": {
    "extensions": {
      "regex_scripts": [
        { "id": "...", "scriptName": "...", "findRegex": "...", "...": "..." },
        { "id": "...", "scriptName": "...", "findRegex": "...", "...": "..." }
      ]
    }
  }
}
```

每个数组元素的字段与全局正则**完全相同**。这是「单脚本对象 vs 多脚本数组」唯一的真实差异 —— **没有「全局正则的打包导出 = 数组 json」这种官方格式**；想批量备份得自己打包。

### 5.3 第三方打包

社区常见的「正则脚本包」`.json`：

```json
{
  "scripts": [ { ... }, { ... } ]
}
```

或裸数组 `[{...}, {...}]`。**这不是 ST 原生格式**，但你的导入端建议同时支持：检测顶层 `Array.isArray` 或 `scripts` 字段，逐个还原成单脚本对象。

---

## 6. 执行顺序与时机

### 顺序

- **全局正则**：按 UI 列表里的拖拽顺序执行；ST 内部存的是「文件名按 locale-aware 排序 + 用户拖动 override」。导出时**不带 order 字段** —— 顺序信息丢失。社区打包脚本会自己塞 `order` 字段做规约，但非官方。
- **角色正则**：按 `regex_scripts` 数组顺序执行，**先于**全局正则。
- 同一 `placement` 时机下，角色正则 → 全局正则，依次跑。

### 时机（仅作注释参考，处理时不强求）

| 字段           | 触发点                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `placement: 1` | 用户消息送出前（写入 jsonl 之前，发给模型之前）                        |
| `placement: 2` | AI 流式结束、写入 jsonl 之前                                           |
| `placement: 3` | `/run` 等命令输出渲染前                                                |
| `placement: 4` | WI 条目即将拼入 prompt 时                                              |
| `placement: 5` | reasoning 段（`extra.reasoning`）渲染或入 prompt 时                    |
| `markdownOnly` | 渲染消息气泡时再跑一次「仅显示」副本，不污染 `mes`/`swipes`            |
| `promptOnly`   | 构造发送给 LLM 的 prompt 时跑一次副本                                  |
| `runOnEdit`    | 用户在 UI 内编辑某条消息保存时是否重跑                                 |
| `minDepth/maxDepth` | 用「倒数第几条」过滤消息范围；`null` = 不限                       |

---

## 7. Round-trip 建议

1. **保留 `id`**，不要重新生成，否则覆盖导入会变成新增。
2. 内部模型 → ST 格式时：
   - 你的 `placement: ('all'|'user'|'assistant')[]` 需展开：
     - `'user'` → `[1]`
     - `'assistant'` → `[2]`
     - `'all'` → `[1, 2]`（或同时含 `[3,4,5]` 视产品定义）
   - 你的 `disabled` → ST 同名 `disabled`
   - 没有对应字段的（如 `trimStrings`, `runOnEdit`, `substituteRegex`, `min/maxDepth`）写默认值
3. ST → 内部模型时：保留原始字段到一个 `_raw` 副本，导出回 ST 时拼回去，避免精度丢失。
4. **不要省略 `id`** —— 缺 id 的脚本被 ST 当作新建，每次导入都会重复。

---

## 8. 真实样本

放到 `_reference/samples/regex/`：

- 至少 1 份 ST 自带的「Strip thinking tags」或社区常用脚本的导出 `.json`
- 一份带 `substituteRegex: 2` + `{{user}}` 的脚本，用于验证 macro 展开兼容
- （可选）一份社区「打包多脚本数组」格式，验证你的导入端是否能识别

导出路径：ST → Extensions → Regex → 选脚本 → `Export`。
