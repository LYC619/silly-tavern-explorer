# Settings Navigation And Route Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long settings page with five switchable sections and remove avoidable delay when moving between Home and Settings.

**Architecture:** Persist the active settings section in a small local-settings helper, mount only the selected panel, and split the two existing aggregate settings components into focused exports. Change route transitions from serial waiting to pop-layout animation, while Home reuses a module snapshot for its first render and refreshes it in the background.

**Tech Stack:** React 18, React Router 6, Framer Motion, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Persisted Settings Section

**Files:**
- Create: `src/lib/settings-navigation.ts`
- Create: `src/test/settings-navigation.test.ts`

- [x] **Step 1: Write the failing persistence test**

```ts
import { describe, expect, it } from 'vitest';
import { loadSettingsSection, saveSettingsSection } from '@/lib/settings-navigation';

describe('settings navigation', () => {
  it('defaults invalid values to display and restores a saved section', () => {
    localStorage.clear();
    expect(loadSettingsSection()).toBe('display');
    localStorage.setItem('ste-settings-section', 'invalid');
    expect(loadSettingsSection()).toBe('display');
    saveSettingsSection('data');
    expect(loadSettingsSection()).toBe('data');
  });
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npx.cmd vitest run src/test/settings-navigation.test.ts --reporter=dot`

Expected: FAIL because `@/lib/settings-navigation` does not exist.

- [x] **Step 3: Implement the fixed section vocabulary and storage helper**

```ts
export const SETTINGS_SECTIONS = ['display', 'ai', 'directories', 'data', 'about'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];
const STORAGE_KEY = 'ste-settings-section';

export function loadSettingsSection(): SettingsSection {
  const value = localStorage.getItem(STORAGE_KEY);
  return SETTINGS_SECTIONS.includes(value as SettingsSection) ? value as SettingsSection : 'display';
}

export function saveSettingsSection(section: SettingsSection): void {
  localStorage.setItem(STORAGE_KEY, section);
}
```

- [x] **Step 4: Run the test and verify GREEN**

Run: `npx.cmd vitest run src/test/settings-navigation.test.ts --reporter=dot`

Expected: 1 file passed.

### Task 2: Switchable Settings Page

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Modify: `src/components/settings/RuntimeSettingsPanel.tsx`
- Modify: `src/components/GlobalSettings.tsx`
- Modify: `src/test/frontend-contract.test.ts`

- [x] **Step 1: Add failing structure assertions**

Add assertions that Settings exposes five navigation buttons, reads and saves `SettingsSection`, renders exactly one selected panel, uses `md:grid-cols-[190px_minmax(0,1fr)]`, and contains an `overflow-x-auto` narrow-width navigation row.

- [x] **Step 2: Run the contract test and verify RED**

Run: `npx.cmd vitest run src/test/frontend-contract.test.ts --reporter=dot`

Expected: FAIL because Settings still mounts three sections in one long column.

- [x] **Step 3: Split the aggregate panels without changing business behavior**

Export `DisplaySettingsPanel` and `DirectorySettingsPanel` from `RuntimeSettingsPanel.tsx`. Export `DataSettingsPanel`, `AboutSettingsPanel`, and the existing `APP_VERSION` from `GlobalSettings.tsx`. Keep directory scanning, vault switching, backup, restore, clearing, onboarding reset, and about links unchanged.

- [x] **Step 4: Implement the five-section Settings shell**

Use this section map and render only `activeSection`:

```ts
const SECTION_ITEMS = [
  { key: 'display', label: '显示', icon: Eye },
  { key: 'ai', label: 'AI 配置', icon: KeyRound },
  { key: 'directories', label: '目录与连接', icon: FolderCog },
  { key: 'data', label: '数据与备份', icon: Database },
  { key: 'about', label: '关于与引导', icon: Info },
] satisfies Array<{ key: SettingsSection; label: string; icon: typeof Eye }>;
```

The desktop shell uses a 190px unframed navigation column and an unframed content area. On narrower widths the same buttons become a horizontally scrollable row. Selecting an item updates React state and `saveSettingsSection`.

- [x] **Step 5: Run the contract test and verify GREEN**

Run: `npx.cmd vitest run src/test/frontend-contract.test.ts src/test/settings-navigation.test.ts --reporter=dot`

Expected: both files passed.

### Task 3: Immediate Route Transition And Home Snapshot

**Files:**
- Modify: `src/components/AppLayout.tsx`
- Modify: `src/pages/Home.tsx`
- Modify: `src/test/frontend-contract.test.ts`

- [x] **Step 1: Add failing performance contract assertions**

Assert that AppLayout uses `mode="popLayout"`, no longer contains `mode="wait"`, and uses `duration: 0.12`. Assert that Home owns a module-level `homeSnapshot`, initializes visible state from it, writes the refreshed result back to it, and still calls `loadData()` on mount.

- [x] **Step 2: Run the test and verify RED**

Run: `npx.cmd vitest run src/test/frontend-contract.test.ts --reporter=dot`

Expected: FAIL on serial transition and missing snapshot.

- [x] **Step 3: Implement concurrent transition**

Change the route animation to `mode="popLayout"`, reduce vertical movement to 4/-2px, and use 120ms ease-out transitions. Keep the persistent shell outside `AnimatePresence`.

- [x] **Step 4: Implement stale-while-refresh Home snapshot**

Create a module-level snapshot containing characters, stories, recent stories, story resource counts, and asset counts. Initialize all matching state values from the snapshot. After the existing `Promise.all` succeeds, assign the new snapshot before setting state. Always retain the mount-time background refresh so edits made elsewhere become visible.

- [x] **Step 5: Run focused tests, lint, and typecheck**

Run:

```powershell
npx.cmd vitest run src/test/frontend-contract.test.ts src/test/settings-navigation.test.ts --reporter=dot
npx.cmd eslint src/pages/SettingsPage.tsx src/components/settings/RuntimeSettingsPanel.tsx src/components/GlobalSettings.tsx src/components/AppLayout.tsx src/pages/Home.tsx src/lib/settings-navigation.ts src/test/settings-navigation.test.ts src/test/frontend-contract.test.ts
npx.cmd tsc -p tsconfig.app.json --noEmit
```

Expected: all commands exit 0.

- [x] **Step 6: Commit the settings and performance group**

```powershell
git add -- src/pages/SettingsPage.tsx src/components/settings/RuntimeSettingsPanel.tsx src/components/GlobalSettings.tsx src/components/AppLayout.tsx src/pages/Home.tsx src/lib/settings-navigation.ts src/test/settings-navigation.test.ts src/test/frontend-contract.test.ts docs/superpowers/plans/2026-08-07-settings-navigation-performance.md
git commit -m "fix(10.4): streamline settings and route transitions"
```
