# ST Cloud Export App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 st-stage 中以独立目录提供一个可复制的 SillyTavern 资产导出 App，不注册到内置 App 清单，后续由用户集成到自己的扩展项目。

**Architecture:** App UI 与 ST 数据桥接分离。桥接层使用当前 ST 的请求头能力调用接口并获取原始角色卡、聊天、世界书和预设数据；打包层生成与 `data/default-user/` 内容一致的 zip，并附带脱敏的最小 `settings.json` 以兼容 STE 当前扫描器。导出不包含 secrets/API Key。

**Tech Stack:** TypeScript、ST App/PhoneApp 契约、`fetch`、JSZip、浏览器 Blob 下载。

---

### Task 1: 独立 App 骨架与数据契约

**Files:**
- Create: `st-stage/st-extension/src/apps/cloud-export/bridge.ts`
- Create: `st-stage/st-extension/src/apps/cloud-export/manifest.ts`
- Create: `st-stage/st-extension/src/apps/cloud-export/zip.ts`
- Create: `st-stage/st-extension/src/apps/cloud-export/export-app.ts`
- Create: `st-stage/st-extension/src/apps/cloud-export/types.ts`
- Do not modify: `st-stage/st-extension/src/apps/index.ts`

- [x] **Step 1: Write unit tests** for safe path construction, minimal settings generation, selected-file manifest creation, and exclusion of secrets.
- [x] **Step 2: Run focused extension tests and confirm they fail.
- [x] **Step 3: Define the v1 asset scope**: PNG character cards, per-character chats, worlds, OpenAI Settings presets, and the complete global regex set; represent regex as one selectable set because STE imports it as one collection.
- [x] **Step 4: Implement bridge interfaces** with response validation and `ctx.getRequestHeaders?.()`; keep endpoint-specific code inside `bridge.ts` and use `textContent` for all user-controlled labels.

### Task 2: Fetch and dependency selection

**Files:**
- Modify: `st-stage/st-extension/src/apps/cloud-export/bridge.ts`
- Modify: `st-stage/st-extension/src/apps/cloud-export/types.ts`
- Test: `st-stage/st-extension/src/apps/cloud-export/bridge.test.ts`

- [x] **Step 1: Add mocked-fetch tests** for character list, raw PNG retrieval, chat list/content, worldbook list/content, OpenAI preset list/content, and settings regex extraction.
- [x] **Step 2: Implement endpoint adapters** against the target ST release; preserve PNG bytes and JSONL fields returned by ST when serializing.
- [x] **Step 3: Implement selection dependency rules**: expanding a character exposes its chats; selecting a chat keeps its character selected; unsupported categories are labelled rather than silently omitted.
- [x] **Step 4: Run extension tests and the existing st-stage test gate.

### Task 3: ZIP generation and download

**Files:**
- Modify: `st-stage/st-extension/src/apps/cloud-export/zip.ts`
- Modify: `st-stage/st-extension/src/apps/cloud-export/manifest.ts`
- Test: `st-stage/st-extension/src/apps/cloud-export/zip.test.ts`
- Modify: `st-stage/package.json` and lockfile to add JSZip if not already available

- [x] **Step 1: Write tests** asserting exact paths under `characters/`, `chats/`, `worlds/`, `OpenAI Settings/`, and a sanitized `settings.json`; assert secrets are absent.
- [x] **Step 2: Implement JSZip generation** with progress callbacks, Blob download, URL revocation, and a clear error when the package is empty.
- [x] **Step 3: Set ZIP entry timestamps from available ST metadata; fall back to export time when ST does not expose a source timestamp.
- [x] **Step 4: Run the focused tests and extension build.

### Task 4: App UI and manual integration handoff

**Files:**
- Modify: `st-stage/st-extension/src/apps/cloud-export/export-app.ts`
- Create: `st-stage/st-extension/src/apps/cloud-export/README.md`

- [x] **Step 1: Implement tabs, search, select-all, nested character chats, selected counters, progress, and download actions using the existing phone styles.
- [x] **Step 2: Keep the App unregistered; document the one-line registration needed later and the exact bridge assumptions.
- [x] **Step 3: Run the extension build and full extension tests.
- [x] **Step 4: Commit the standalone export folder separately as `feat(st-stage): add standalone SillyTavern export app` (`11dccc3`).
