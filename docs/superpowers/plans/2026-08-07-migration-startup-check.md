# Migration Startup Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avoid showing “正在升级档案库” on every launch while preserving the blocking migration and retry behavior for outdated or failed libraries.

**Architecture:** Add a domain preflight that reads the persisted archive schema version. MigrationNotice starts in a neutral checking state, silently opens the app when current, and enters the existing blocking migration dialog only when the preflight reports an outdated schema.

**Tech Stack:** React 18, archive repository abstraction, Vitest, Testing Library.

---

### Task 1: Migration Preflight

**Files:**
- Modify: `src/lib/archive-migrate.ts`
- Modify: `src/test/archive-migrate.test.ts`

- [x] **Step 1: Write the failing preflight test**

Add a dependency-injected function test:

```ts
expect(await needsArchiveMigrationWith(async () => 1)).toBe(true);
expect(await needsArchiveMigrationWith(async () => ARCHIVE_SCHEMA_VERSION)).toBe(false);
expect(await needsArchiveMigrationWith(async () => ARCHIVE_SCHEMA_VERSION + 1)).toBe(false);
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx.cmd vitest run src/test/archive-migrate.test.ts --reporter=dot`

Expected: FAIL because `needsArchiveMigrationWith` is not exported.

- [x] **Step 3: Implement the preflight**

```ts
export async function needsArchiveMigrationWith(getVersion: () => Promise<number>): Promise<boolean> {
  return await getVersion() < ARCHIVE_SCHEMA_VERSION;
}

export async function needsArchiveMigration(): Promise<boolean> {
  return needsArchiveMigrationWith(getArchiveSchemaVersion);
}
```

- [x] **Step 4: Run the test and verify GREEN**

Run: `npx.cmd vitest run src/test/archive-migrate.test.ts --reporter=dot`

Expected: archive migration tests passed.

### Task 2: Silent Current-Schema Startup

**Files:**
- Modify: `src/components/MigrationNotice.tsx`
- Modify: `src/test/component-behavior.test.tsx`

- [x] **Step 1: Extend the component mock and add failing behavior cases**

Mock `needsArchiveMigration`. Add one case where it resolves `false` and assert children appear without “正在升级档案库” and `runArchiveMigration` is not called. Update the existing failure/retry case so preflight resolves `true` before migration rejects and succeeds.

- [x] **Step 2: Run the behavior test and verify RED**

Run: `npx.cmd vitest run src/test/component-behavior.test.tsx --reporter=dot`

Expected: FAIL because the component always renders the running migration dialog and never calls the preflight.

- [x] **Step 3: Implement checking, migrating, failed, and ready states**

Use `checking` as the initial status. During checking, render only a neutral full-screen spinner. If preflight returns false, transition directly to ready. If true, set running and call the existing singleton migration promise. On success, preserve the one-time explanatory notice behavior; on check or migration failure, preserve the blocking error dialog and retry button.

- [x] **Step 4: Run focused verification**

Run:

```powershell
npx.cmd vitest run src/test/archive-migrate.test.ts src/test/component-behavior.test.tsx --reporter=dot
npx.cmd eslint src/lib/archive-migrate.ts src/components/MigrationNotice.tsx src/test/archive-migrate.test.ts src/test/component-behavior.test.tsx
npx.cmd tsc -p tsconfig.app.json --noEmit
```

Expected: all commands exit 0.

- [x] **Step 5: Commit the startup fix separately**

```powershell
git add -- src/lib/archive-migrate.ts src/components/MigrationNotice.tsx src/test/archive-migrate.test.ts src/test/component-behavior.test.tsx docs/superpowers/plans/2026-08-07-migration-startup-check.md
git commit -m "fix(10.0): skip migration prompt for current libraries"
```
