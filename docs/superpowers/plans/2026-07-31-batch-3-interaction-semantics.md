# Batch 3 Interaction Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make card interactions keyboard-operable, make the Home editor entry truthful, reduce duplicate ST setup UI, and make asset-source filters mutually exclusive.

**Architecture:** Preserve current visual containers while adding explicit keyboard activation to composite cards whose menus prevent a simple outer button. Give `STImportCard` a compact render variant rather than creating a second import implementation. Move source precedence into a small pure classifier shared by filtering and counts.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vitest

---

### Task 1: Add and test an exclusive asset-source classifier

**Files:**
- Create: `src/lib/asset-source.ts`
- Create: `src/test/asset-source.test.ts`
- Modify: `src/pages/AssetLibrary.tsx:42-58,130-200`

- [ ] **Step 1: Write the failing behavior tests**

Create:

```ts
import { describe, expect, it } from 'vitest';
import { classifyAssetSource } from '@/lib/asset-source';

describe('资产来源互斥分类', () => {
  it('按 派生 > 自动保留 > ST > 工具入库 的优先级只返回一类', () => {
    expect(classifyAssetSource({ derived: true, autoSaved: true, fromST: true })).toBe('derived');
    expect(classifyAssetSource({ autoSaved: true, fromST: true })).toBe('autoSaved');
    expect(classifyAssetSource({ fromST: true })).toBe('fromST');
    expect(classifyAssetSource({})).toBe('manual');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm.cmd test -- src/test/asset-source.test.ts --reporter=dot
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure classifier**

Create:

```ts
export type AssetSource = 'fromST' | 'manual' | 'derived' | 'autoSaved';

export interface AssetSourceFlags {
  derived?: boolean;
  autoSaved?: boolean;
  fromST?: boolean;
}

export function classifyAssetSource(flags: AssetSourceFlags): AssetSource {
  if (flags.derived) return 'derived';
  if (flags.autoSaved) return 'autoSaved';
  if (flags.fromST) return 'fromST';
  return 'manual';
}
```

- [ ] **Step 4: Use the classifier for filtering and counts**

Import `AssetSource` and `classifyAssetSource`. Define:

```ts
type SourceFilter = 'all' | AssetSource;
```

Replace `matchSource` with:

```ts
const matchSource = useCallback((asset: AssetRow, filter: SourceFilter) => (
  filter === 'all' || classifyAssetSource(asset) === filter
), []);
```

Keep `sourceCounts` based on this function. The four counts must sum to `tabList.length`.

- [ ] **Step 5: Run the focused test**

Run:

```powershell
npm.cmd test -- src/test/asset-source.test.ts --reporter=dot
```

Expected: PASS.

### Task 2: Add keyboard activation without changing card layout

**Files:**
- Modify: `src/pages/Library.tsx:596-603,682-689`
- Modify: `src/pages/AssetLibrary.tsx:296-300`
- Modify: `src/test/frontend-contract.test.ts`

- [ ] **Step 1: Add failing source-contract checks**

Append:

```ts
describe('卡片键盘操作契约', () => {
  it('角色卡和资产卡提供聚焦与键盘激活', () => {
    const library = read('src/pages/Library.tsx');
    const assets = read('src/pages/AssetLibrary.tsx');
    for (const source of [library, assets]) {
      expect(source).toContain('tabIndex={0}');
      expect(source).toContain("e.key === 'Enter' || e.key === ' '");
      expect(source).toContain('focus-visible:ring-2');
    }
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
```

Expected: FAIL because the composite cards are mouse-only.

- [ ] **Step 3: Add keyboard behavior to each composite card**

On the grid card, list row, and asset card container add:

```tsx
role="button"
tabIndex={0}
onKeyDown={(e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    // Call the same batch-select or navigate/open function used by onClick.
  }
}}
```

Add to each existing class list:

```text
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-canvas)]
```

Do not remove or nest the existing dropdown-menu buttons. The `e.target !== e.currentTarget` guard prevents menu keystrokes from activating the card.

- [ ] **Step 4: Run focused tests and type check**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
npx.cmd tsc -b --pretty false
```

Expected: pass.

### Task 3: Make the Home editor entry describe its real behavior

**Files:**
- Modify: `src/pages/Home.tsx:10-12,269-291`
- Modify: `src/test/frontend-contract.test.ts`

- [ ] **Step 1: Add a failing wording/semantics contract**

Append:

```ts
it('首页编辑区入口不伪装成拖放区', () => {
  const home = read('src/pages/Home.tsx');
  expect(home).toContain('进入编辑区');
  expect(home).not.toContain('丢进来，不用先建档');
});
```

- [ ] **Step 2: Convert the clickable section to a button**

Replace the outer `<section onClick>` with:

```tsx
<button
  type="button"
  className="w-full shrink-0 rounded-xl bg-elevated border-[1.5px] border-[color:var(--border-normal)] px-4 py-[18px] text-center hover:border-[color:var(--brand-hairline)] transition-colors"
  onClick={() => navigate('/tools')}
  data-tour="home-tools"
>
```

Use `PenLine` instead of `UploadCloud`, change the heading to `进入编辑区`, and describe that files are selected or dragged after entering. Keep the five supported-type chips.

- [ ] **Step 3: Run the contract test**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
```

Expected: PASS.

### Task 4: Render a compact ST rescan command in Tools

**Files:**
- Modify: `src/components/tools/STImportCard.tsx:60-145`
- Modify: `src/pages/Tools.tsx:159-203`
- Modify: `src/test/frontend-contract.test.ts`

- [ ] **Step 1: Add a failing compact-variant contract**

Append:

```ts
it('编辑区使用紧凑 ST 扫描入口', () => {
  const card = read('src/components/tools/STImportCard.tsx');
  const tools = read('src/pages/Tools.tsx');
  expect(card).toContain("variant?: 'full' | 'compact'");
  expect(tools).toContain('variant="compact"');
});
```

- [ ] **Step 2: Add the variant without duplicating scan logic**

Extend the props:

```ts
interface STImportCardProps {
  onChanged?: () => void;
  variant?: 'full' | 'compact';
}
```

Default `variant = 'full'`. Keep one `handlePick`, one selection dialog, and one `handleImport`. Render only the trigger differently:

```tsx
{variant === 'full' ? (
  <Card>{/* existing full card content */}</Card>
) : (
  <Button variant="outline" size="sm" onClick={handlePick} disabled={scanning}>
    {scanning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FolderSearch className="w-4 h-4 mr-1" />}
    重新扫描 ST
  </Button>
)}
```

The existing dialog remains rendered for both variants.

- [ ] **Step 3: Place the compact command in Tools**

Replace the full card with a small command row below the drop zone:

```tsx
<div className="flex justify-end">
  <STImportCard variant="compact" onChanged={handleSTChanged} />
</div>
```

Home continues using the default full variant.

- [ ] **Step 4: Run Batch 3 verification**

Run:

```powershell
npm.cmd test -- src/test/asset-source.test.ts src/test/frontend-contract.test.ts --reporter=dot
npx.cmd tsc -b --pretty false
npm.cmd run lint -- --quiet
npm.cmd test -- --reporter=dot
npm.cmd run build
git diff --check
```

Expected: all commands pass; asset-source counts are mutually exclusive by construction.

- [ ] **Step 5: Review and commit Batch 3**

Review the exact batch scope:

```powershell
git diff -- src/lib/asset-source.ts src/test/asset-source.test.ts src/test/frontend-contract.test.ts src/pages/Library.tsx src/pages/AssetLibrary.tsx src/pages/Home.tsx src/pages/Tools.tsx src/components/tools/STImportCard.tsx
```

Commit:

```powershell
git add -- src/lib/asset-source.ts src/test/asset-source.test.ts src/test/frontend-contract.test.ts src/pages/Library.tsx src/pages/AssetLibrary.tsx src/pages/Home.tsx src/pages/Tools.tsx src/components/tools/STImportCard.tsx
git commit -m "fix: align card interactions and asset sources"
```
