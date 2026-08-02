---
最后更新: 2026-08-01 09:37:52
---
# SillyTavern 1.18.0 资产结构与关联关系完整报告

## 一、总体架构

SillyTavern 的文件组织分为三层：工程源码层、全局配置层、用户数据层。

**工程源码层**（根目录）包含 `src/`（服务端 Node.js 代码）、`public/`（前端静态资源）、`default/`（内置出厂内容）、`node_modules/`（依赖）。这些属于程序本身，不包含用户创作数据。

**全局配置层**仅有根目录下的 `config.yaml`，控制网络端口、数据根路径、安全策略等服务器行为。

**用户数据层**位于 `data/<user-handle>/`（默认 `data/default-user/`），是所有用户创作内容和设置的存储位置。多用户模式下每个用户拥有独立的同结构目录。

`data/` 下另有若干运行时目录（`_cache`、`_storage`、`_uploads`、`_webpack`、`_css`、`_errors`）属于服务器临时文件，不含用户创作数据。

---

## 二、用户数据目录详解

以下所有路径均相对于 `data/default-user/`。

### 核心创作资产

|目录|内容与格式|说明|
|---|---|---|
|`characters/`|角色卡 `.png`（JSON 嵌入 PNG tEXt 块的 `chara` 字段，base64 编码的 V2/V3 JSON）；也支持 `.json`、`.charx`|文件名是角色的唯一标识符（主键），全系统以此引用角色|
|`worlds/`|世界书 `<书名>.json`，内含 `entries` 字典|文件名（不含 `.json`）是世界书的唯一标识符|
|`chats/<角色名>/`|聊天记录 `.jsonl`（每行一条 JSON 消息，第一行为聊天元数据）|子目录名为角色卡文件名去掉 `.png` 后缀|
|`groups/`|群组定义 `.json`（含成员列表、聊天 ID 列表等）|文件名为时间戳 ID|
|`group chats/`|群组聊天记录 `.jsonl`|文件名与群组 JSON 中的 `chats` 数组对应|

### 用户身份与偏好

|目录/文件|内容|
|---|---|
|`User Avatars/`|Persona 头像图片文件|
|`settings.json`|全局前端设置，包含 persona 定义、世界书绑定关系、UI 偏好等所有配置|
|`secrets.json`|API 密钥（敏感，不应归档到公开位置）|
|`stats.json`|聊天统计数据|

### 模板与预设

|目录|内容|
|---|---|
|`context/`|上下文模板预设|
|`instruct/`|指令模式模板预设|
|`sysprompt/`|系统提示词预设|
|`reasoning/`|推理配置预设|
|`NovelAI Settings/`|NovelAI 生成参数预设|
|`KoboldAI Settings/`|KoboldAI 生成参数预设|
|`OpenAI Settings/`|OpenAI/Chat Completion 生成参数预设|
|`TextGen Settings/`|TextGen 生成参数预设|

### UI 与媒体

|目录|内容|
|---|---|
|`themes/`|UI 主题|
|`movingUI/`|MovingUI 布局预设|
|`backgrounds/`|聊天背景图片|
|`QuickReplies/`|快捷回复集 `.json`|

### 扩展与数据

|目录|内容|
|---|---|
|`extensions/`|第三方扩展（每个扩展一个子文件夹）|
|`assets/`|扩展资产包（角色表情包、BGM、ambient、live2d 等）|
|`vectors/`|向量检索索引（RAG/Data Bank，可重建）|
|`user/images/`|聊天中上传的图片|
|`user/files/`|Data Bank 附件文件|
|`user/workflows/`|ComfyUI 工作流|

### 可忽略/可重建

|目录|说明|
|---|---|
|`thumbnails/`（含 `avatar/`、`bg/`、`persona/`）|缩略图缓存，删除后自动重建|
|`backups/`|自动备份快照|

---

## 三、资产之间的关联机制

### 3.1 角色卡 → 世界书

存在三种关联方式：

**内嵌世界书**：角色卡 PNG 内部 JSON 的 `data.character_book` 字段，是完整的世界书数据（含 `entries` 字典），随角色卡文件一起携带，不依赖 `worlds/` 目录中的任何外部文件。

**主绑定世界书**：角色卡 PNG 内部 JSON 的 `data.extensions.world` 字段，值为世界书名称字符串（不含 `.json`），指向 `worlds/<该名称>.json`。

**额外链接世界书**：存储在 `settings.json` → `world_info_settings.world_info.charLore` 数组中，结构为：

```json
[
  {
    "name": "角色卡文件名.png",
    "extraBooks": ["世界书名1", "世界书名2"]
  }
]
```

注意：此绑定关系不在角色卡内部，而在 `settings.json` 中。

### 3.2 角色卡 → 聊天记录

纯文件系统约定：`chats/<角色卡文件名去掉.png>/` 目录下的所有 `.jsonl` 文件属于该角色。

角色卡顶层（V1层）还有一个 `chat` 字段，记录当前活跃聊天的文件名（不含 `.jsonl` 后缀），用于 ST 打开角色时恢复到上次对话。

### 3.3 全局世界书

`settings.json` → `world_info_settings.world_info.globalSelect`，值为字符串数组，包含所有被全局激活的世界书名称。这些世界书在所有聊天中始终参与关键词扫描。

### 3.4 聊天 → 世界书（对话级）

聊天 JSONL 文件第一行元数据中的 `chat_metadata.world_info` 字段，可为单个对话绑定专属世界书。

### 3.5 群组 → 角色

`groups/<id>.json` 的 `members` 数组，存储角色卡文件名（含扩展名，如 `"Alice.png"`）。

### 3.6 群组 → 聊天记录

`groups/<id>.json` 中：

- `chats`：字符串数组，为该群组所有历史聊天的 ID 列表
- `chat_id`：当前活跃聊天 ID

对应文件为 `group chats/<chat_id>.jsonl`。

### 3.7 Persona → 头像与世界书

全部存储在 `settings.json` 中：

- `power_user.personas`：avatar 文件名 → persona 显示名
- `persona_descriptions`：avatar 文件名 → 描述文本及关联的世界书名称

头像图片本体位于 `User Avatars/` 目录。

### 3.8 表情包/Sprites → 角色

`assets/` 目录下以角色名命名的文件夹，文件夹名必须与角色名精确匹配（含大小写和空格）。

---

## 四、关联关系总览图

```
settings.json
├── world_info_settings.world_info.globalSelect ────→ worlds/*.json（全局世界书）
├── world_info_settings.world_info.charLore[] ──────→ 角色文件名 × worlds/*.json（额外链接）
├── power_user.personas ────────────────────────────→ User Avatars/*（Persona头像）
└── persona_descriptions[].lorebook ────────────────→ worlds/*.json（Persona世界书）

characters/角色名.png
├── data.extensions.world ──────────────────────────→ worlds/<世界书名>.json（主绑定）
├── data.character_book ────────────────────────────→ 内嵌世界书（自包含）
├── 顶层 chat 字段 ─────────────────────────────────→ chats/<角色名>/<聊天文件>.jsonl（当前对话）
└── 文件名约定 ─────────────────────────────────────→ chats/<角色名>/*.jsonl（全部对话）

groups/<id>.json
├── members: ["A.png", "B.png"] ────────────────────→ characters/A.png, characters/B.png
└── chats: ["id1", "id2"] + chat_id ────────────────→ group chats/<id>.jsonl

chats/<角色名>/<文件>.jsonl
└── 第一行 chat_metadata.world_info ────────────────→ worlds/<世界书名>.json（对话级世界书）
```

---

## 五、关键标识符规则

所有跨资产引用都基于**文件名字符串**，没有数据库或随机 UUID 做中间层：

- **角色标识**：角色卡文件名（含 `.png` 后缀），如 `default_Seraphina.png`
- **世界书标识**：世界书文件名（不含 `.json` 后缀），如 `Eldoria`
- **聊天目录名**：角色卡文件名去掉 `.png`，如 `default_Seraphina`
- **群组聊天标识**：时间戳 ID 字符串，对应 `group chats/` 下的 `.jsonl` 文件

任何重命名操作如果不同步更新所有引用该名称的位置，链接即断裂。

---

## 六、归档工具需要读取的文件清单

### 必读（构成完整可还原归档的最小集合）

|文件/目录|读取目的|
|---|---|
|`characters/` 全部文件|角色卡本体；解析 PNG tEXt `chara` 块获取 `data.extensions.world`、`data.character_book`、顶层 `chat` 字段|
|`worlds/` 全部 `.json`|世界书本体|
|`chats/` 全部子目录及 `.jsonl`|单人聊天记录；第一行元数据含对话级世界书绑定|
|`groups/` 全部 `.json`|群组定义，解析 `members` 获取角色依赖，解析 `chats`/`chat_id` 获取群聊文件列表|
|`group chats/` 全部 `.jsonl`|群组聊天记录|
|`settings.json`|必须解析以下字段：`world_info_settings.world_info.globalSelect`（全局世界书）、`world_info_settings.world_info.charLore`（额外链接世界书）、`power_user.personas` + `persona_descriptions`（Persona 定义及其世界书绑定）|
|`User Avatars/`|Persona 头像图片（被 `settings.json` 引用）|

### 可选（完整体验还原，但非核心创作依赖）

|文件/目录|用途|取舍建议|
|---|---|---|
|`context/`、`instruct/`、`sysprompt/`、`reasoning/`|模板预设|如用户有自定义模板则归档|
|`NovelAI/KoboldAI/OpenAI/TextGen Settings/`|生成参数预设|如用户有调优过的预设则归档|
|`themes/`、`movingUI/`|UI 外观|仅在需要完整还原用户体验时归档|
|`backgrounds/`|聊天背景|视觉相关，按需|
|`QuickReplies/`|快捷回复|轻量，建议包含|
|`extensions/`|第三方扩展|含扩展配置和状态，完整还原需要|
|`assets/`|表情包、BGM 等|体积可能很大，按需|
|`user/images/`、`user/files/`|聊天图片和附件|如聊天中引用了图片则需要|
|`user/workflows/`|ComfyUI 工作流|仅 ComfyUI 用户需要|
|`stats.json`|统计数据|非必要，可重建|

### 排除（不应归档）

| 文件/目录                               | 原因            |
| ----------------------------------- | ------------- |
| `secrets.json`                      | 含 API 密钥，安全风险 |
| `thumbnails/`                       | 缓存，可自动重建      |
| `vectors/`                          | 向量索引，可从原始数据重建 |
| `backups/`                          | 已有的备份冗余       |
| `data/_cache`、`_uploads`、`_webpack` | 运行时临时文件       |

## 报告修订

1. **排除清单中的 `secrets.json`**：从"排除（不应归档）“移至"必读”，备注改为"API 密钥（明文 JSON），本地归档应包含以支持 API 配置切换"。
    
2. **必读清单新增一行**：`NovelAI/KoboldAI/OpenAI/TextGen Settings/` 从"可选"提升至"必读"，读取目的改为"生成参数预设，与 `secrets.json` 配合构成完整 API 配置档案"。