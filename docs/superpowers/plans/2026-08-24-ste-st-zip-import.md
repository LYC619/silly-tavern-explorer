# STE SillyTavern ZIP 导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 STE 客户端中增加从 SillyTavern 导出 zip 读取数据的入口，并复用现有 ST 扫描、选择和入库流程。

**Architecture:** Rust 只负责选择 zip、做安全校验、解压到一次性临时目录并授予临时根访问权；前端把该目录包装成现有 `VaultFs`，继续调用 `scanSTUserDir`、`STImportSelectionDialog` 和 `importSelected`。导入完成、取消或失败后清理临时目录；不写入 `stRoot`，目标数据仍落入用户当前选定的 Vault。

**Tech Stack:** Tauri 2 Rust command、`zip` crate、React/TypeScript、现有 `VaultFs`/`st-import`/`STImportCard`。

---

### Task 1: Rust ZIP 会话与安全解压

**Files:**
- Create: `src-tauri/src/st_backup_import.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/capabilities/default.json`
- Test: `src-tauri/src/st_backup_import.rs` unit tests

- [x] **Step 1: Write failing tests** for rejecting absolute paths, `..`, invalid packages, and accepting a package containing at least one supported ST directory.
- [x] **Step 2: Run the focused Rust tests** and confirm the new validation tests fail before implementation.
- [x] **Step 3: Implement `prepare_st_backup_import`**: use the Tauri dialog file picker with a `.zip` filter, create a nonce-named temp directory, validate every archive entry before writing, extract only safe regular files, authorize the temp root ephemerally, and return `{ root, displayName }`.
- [x] **Step 4: Implement `cleanup_st_backup_import`**: verify the path belongs to the app-owned temp session directory, revoke the ephemeral authorization, and remove only that session directory.
- [x] **Step 5: Register commands and add the minimal `zip` dependency/capability permission; do not add the temp root to persistent config or `authorized-roots.json`.
- [x] **Step 6: Run the focused Rust tests again and confirm all pass.

### Task 2: Tauri bridge and import lifecycle

**Files:**
- Modify: `src/lib/vault/tauri-fs.ts`
- Modify: `src/components/tools/STImportCard.tsx`
- Create: `src/test/st-backup-import.test.tsx`

- [x] **Step 1: Write behavior tests** for selecting a zip, scanning the returned temp root, not calling `setAppConfig('stRoot', ...)`, and always invoking cleanup after cancel, import success, or import failure.
- [x] **Step 2: Run the focused Vitest file and confirm it fails.
- [x] **Step 3: Add `pickSTBackupImport`/`cleanupSTBackupImport` wrappers** around the new commands; keep `createTauriFs(root)` as the only filesystem adapter used by the scanner.
- [x] **Step 4: Add a second action to `STImportCard`** labelled “从 SillyTavern 备份导入”; feed the returned root into the existing `scanSTUserDir` and existing selection/result dialogs; do not persist the root to application config.
- [x] **Step 5: Put cleanup in a `finally` path covering scan cancellation, selection cancellation, import failure, and successful import; keep directory import behavior unchanged.
- [x] **Step 6: Run the focused test and the existing `st-import` tests.

### Task 3: Compatibility metadata and user-facing diagnostics

**Files:**
- Modify: `src/lib/vault/st-import.ts` only if needed for a display-only source label
- Modify: `src/components/tools/STImportCard.tsx`
- Modify: `docs/principles/sillytavern-import.md`

- [x] **Step 1: Add tests** that a zip import reports its original zip name rather than a deleted temp path in the recent-import explanation.
- [x] **Step 2: Keep the existing source-path behavior for this first version**: every zip is a new import, so no cross-package dedupe or incremental update is promised.
- [x] **Step 3: Display unsupported/omitted content clearly** when the package does not contain group chats, `.charx`, or attachments; do not silently claim a full ST backup.
- [x] **Step 4: Run the full Vitest, TypeScript, ESLint, and Rust test gates.

### Task 4: Verification and commit

- [x] **Step 1:** Test representative `default-user` ZIP entries through JSZip/readback tests; real ST-generated ZIP remains manual acceptance.
- [ ] **Step 2:** Verify the imported files are present in the user-selected Vault and the source ST directory is unchanged.
- [x] **Step 3:** Commit STE changes as `feat(import): import SillyTavern backup zip` (`f874b55`).
