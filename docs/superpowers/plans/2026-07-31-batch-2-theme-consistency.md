# Batch 2 Theme Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make full-screen reading and important small text honor all four themes without changing layout.

**Architecture:** Replace component-local black/parchment colors with the existing semantic theme variables. Preserve decorative faint text, but remove compounded opacity and promote information-bearing small labels to the existing muted token.

**Tech Stack:** React, Tailwind CSS, CSS custom properties, Vitest source contracts

---

### Task 1: Lock the reader and status-bar theme contracts

**Files:**
- Modify: `src/test/frontend-contract.test.ts`

- [ ] **Step 1: Add failing source-contract tests**

Append:

```ts
describe('四主题覆盖契约', () => {
  it('全屏阅读器使用主题画布而非固定黑白背景', () => {
    for (const path of [
      'src/components/reader/ReaderView.tsx',
      'src/components/reader/NovelView.tsx',
    ]) {
      const source = read(path);
      expect(source).toContain('bg-canvas');
      expect(source).not.toMatch(/bg-\[#f8f5ec\]|dark:bg-\[#1a1a1a\]/);
    }
  });

  it('状态栏不在文字 token 之外叠加整体透明度', () => {
    const source = read('src/components/AppLayout.tsx');
    const footer = source.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).not.toContain('opacity-70');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
```

Expected: reader and footer assertions fail.

### Task 2: Replace fixed reader colors with semantic tokens

**Files:**
- Modify: `src/components/reader/ReaderView.tsx:246-250`
- Modify: `src/components/reader/NovelView.tsx:287-290`

- [ ] **Step 1: Change only the full-screen containers**

Use this class on both root containers:

```tsx
className="fixed inset-0 z-50 bg-canvas text-[color:var(--text-body)]"
```

Preserve each component's existing layout classes (`select-none overflow-hidden` for `ReaderView`, `flex flex-col` for `NovelView`). Do not change deliberate black overlays used to keep controls legible over content.

- [ ] **Step 2: Run focused tests and type check**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
npx.cmd tsc -b --pretty false
```

Expected: reader contract passes; footer contract still fails until Task 3.

### Task 3: Fix compounded low-contrast information text

**Files:**
- Modify: `src/components/AppLayout.tsx:218-228`
- Modify: `src/pages/Home.tsx`
- Modify: `src/pages/AssetLibrary.tsx`
- Modify: `src/pages/Tools.tsx`

- [ ] **Step 1: Remove status-bar opacity**

Delete only `opacity-70` from the footer class. Keep `text-[10px] text-[color:var(--text-muted)]` so the token alone controls contrast.

- [ ] **Step 2: Promote information-bearing faint labels**

Change `text-[color:var(--text-faint)]` to `text-[color:var(--text-muted)]` for:

```text
Home: last-viewed sentence; story metadata; character count; asset section heading
AssetLibrary: page totals; filter group headings; 9-10.5px asset badges and metadata labels
Tools: work-type/recent headings and the 11px editor description
```

Do not change intentionally secondary placeholders such as “暂无简介”, decorative separators, or the inactive search placeholder in `AppLayout`.

- [ ] **Step 3: Run Batch 2 verification**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
npx.cmd tsc -b --pretty false
npm.cmd run lint -- --quiet
npm.cmd test -- --reporter=dot
npm.cmd run build
git diff --check
```

Expected: all commands pass.

- [ ] **Step 4: Review and commit Batch 2**

Confirm the diff contains no spacing, dimensions, route, or data changes:

```powershell
git diff -- src/components/reader/ReaderView.tsx src/components/reader/NovelView.tsx src/components/AppLayout.tsx src/pages/Home.tsx src/pages/AssetLibrary.tsx src/pages/Tools.tsx src/test/frontend-contract.test.ts
```

Commit:

```powershell
git add -- src/components/reader/ReaderView.tsx src/components/reader/NovelView.tsx src/components/AppLayout.tsx src/pages/Home.tsx src/pages/AssetLibrary.tsx src/pages/Tools.tsx src/test/frontend-contract.test.ts
git commit -m "fix: apply themes consistently to reading views"
```
