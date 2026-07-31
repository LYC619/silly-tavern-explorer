# Batch 1 Live State and Reading Position Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ST imports, status information, and last-read positions update immediately and truthfully, including story branches.

**Architecture:** Keep refresh ownership local: `STImportCard` emits an optional callback, while `Home` and `Tools` reload their own data and pass a numeric refresh key into `AppLayout`. Store the last viewed branch as an optional backward-compatible field and resolve the corresponding branch line through a tested archive helper.

**Tech Stack:** React 18, TypeScript, Vitest, existing repository/FileVault abstraction

---

### Task 1: Add a tested last-viewed-branch resolver

**Files:**
- Modify: `src/types/archive.ts:104-110`
- Modify: `src/lib/archive-db.ts:131-146`
- Modify: `src/test/story-branch.test.ts`

- [ ] **Step 1: Write failing resolver tests**

Add `getLastViewedLine` to the imports and append:

```ts
it('getLastViewedLine：默认主线，记录分支时取分支，失效 id 回退主线', () => {
  const story = buildStoryFromSession(makeSession('main'), 'char_1');
  story.lastFloor = 12;
  const branch = buildBranchFromSession(makeSession('branch'), '支线');
  branch.lastFloor = 7;
  story.branches = [branch];

  expect(getLastViewedLine(story)).toMatchObject({ branchId: null, line: { lastFloor: 12 } });

  story.lastViewedBranchId = branch.id;
  expect(getLastViewedLine(story)).toMatchObject({ branchId: branch.id, line: { lastFloor: 7 } });

  story.lastViewedBranchId = 'missing';
  expect(getLastViewedLine(story)).toMatchObject({ branchId: null, line: { lastFloor: 12 } });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run:

```powershell
npm.cmd test -- src/test/story-branch.test.ts --reporter=dot
```

Expected: FAIL because `getLastViewedLine` and `lastViewedBranchId` do not exist.

- [ ] **Step 3: Add the optional archive field**

Add after `branches?: StoryBranch[]`:

```ts
/** 最近查看的脉络；缺省=主线，旧归档天然兼容 */
lastViewedBranchId?: string;
```

- [ ] **Step 4: Implement the resolver**

Add after `getBranchLine`:

```ts
export function getLastViewedLine(story: ArchiveStory): { branchId: string | null; line: BranchLine } {
  const branchId = story.lastViewedBranchId ?? null;
  const line = getBranchLine(story, branchId);
  if (line) return { branchId, line };
  return { branchId: null, line: getBranchLine(story, null)! };
}
```

- [ ] **Step 5: Run the focused test and verify pass**

Run:

```powershell
npm.cmd test -- src/test/story-branch.test.ts --reporter=dot
```

Expected: all story-branch tests pass.

### Task 2: Persist and restore the active story branch

**Files:**
- Modify: `src/pages/StoryWorkspace.tsx:62-171`

- [ ] **Step 1: Restore a valid saved branch while loading**

After loading `s`, resolve the stored id before constructing `withView`:

```ts
const restoredBranchId = s.lastViewedBranchId
  && s.branches?.some((branch) => branch.id === s.lastViewedBranchId)
  ? s.lastViewedBranchId
  : null;
setBranchId(restoredBranchId);
```

If `restoredBranchId` is null, omit the stale field from `withView` by setting `lastViewedBranchId: undefined`.

- [ ] **Step 2: Add one branch-selection function**

Add before `handleJumpToChat`:

```ts
const handleSwitchBranch = useCallback((nextBranchId: string | null) => {
  setBranchId(nextBranchId);
  mutateStory((cur) => {
    if ((cur.lastViewedBranchId ?? null) === nextBranchId) return cur;
    return { ...cur, lastViewedBranchId: nextBranchId ?? undefined };
  });
}, [mutateStory]);
```

- [ ] **Step 3: Route every branch switch through the function**

Replace direct `setBranchId` calls used for branch selection in:

```ts
handleJumpToChat
handleImportBranch
handleDeleteBranch
BranchPanel.onSwitch
```

Use `handleSwitchBranch(...)`. When deleting the active branch, switch to `null`; deleting an inactive branch must leave the stored id unchanged.

- [ ] **Step 4: Run type checking**

Run:

```powershell
npx.cmd tsc -b --pretty false
```

Expected: exit code 0.

### Task 3: Make import notifications refresh Home, Tools, and AppLayout

**Files:**
- Modify: `src/components/tools/STImportCard.tsx:60-125`
- Modify: `src/components/AppLayout.tsx:18-24,82-110`
- Modify: `src/pages/Home.tsx:8,58-130`
- Modify: `src/pages/Tools.tsx:50-86,117-202`
- Create: `src/test/frontend-contract.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

Create:

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('前端状态刷新契约', () => {
  it('AppLayout 不永久缓存状态，且客户端不展示 WebView 用量', () => {
    const source = read('src/components/AppLayout.tsx');
    expect(source).not.toContain('let statusCache');
    expect(source).toContain('statusRefreshKey');
    expect(source).toMatch(/client\s*\?\s*Promise\.resolve\(null\)/);
  });

  it('STImportCard 暴露变更通知，首页和编辑区接入刷新', () => {
    const card = read('src/components/tools/STImportCard.tsx');
    const home = read('src/pages/Home.tsx');
    const tools = read('src/pages/Tools.tsx');
    expect(card).toContain('onChanged?: () => void');
    expect(home).toContain('onChanged={handleSTChanged}');
    expect(tools).toContain('onChanged={handleSTChanged}');
  });
});
```

- [ ] **Step 2: Run the contract test and verify failure**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
```

Expected: FAIL on the old cache and missing callback contracts.

- [ ] **Step 3: Add the non-throwing notification prop**

Define:

```ts
interface STImportCardProps {
  onChanged?: () => void;
}

export function STImportCard({ onChanged }: STImportCardProps) {
  const notifyChanged = () => {
    try { onChanged?.(); } catch { /* UI refresh must not turn a successful import into a failure */ }
  };
```

Call `notifyChanged()` immediately after `setAppConfig('stRoot', root)` succeeds and again after `importSelected(...)` succeeds. Do not await the callback.

- [ ] **Step 4: Replace AppLayout's permanent cache with an explicit refresh key**

Extend the props:

```ts
statusRefreshKey?: number;
```

Use:

```ts
function useStatusInfo(refreshKey = 0) {
  const [info, setInfo] = useState<{ stRoot: string | null; usage: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = isTauri();
      const [stRoot, usage] = await Promise.all([
        client ? getAppConfig<string>('stRoot').catch(() => null) : Promise.resolve(null),
        client
          ? Promise.resolve(null)
          : navigator.storage?.estimate?.().then((estimate) => {
              const mb = (estimate.usage ?? 0) / 1024 / 1024;
              return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(1)} MB`;
            }).catch(() => null) ?? Promise.resolve(null),
      ]);
      if (!cancelled) setInfo({ stRoot, usage });
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);
  return info;
}
```

Pass `statusRefreshKey` from `AppLayout` into the hook.

- [ ] **Step 5: Reuse page-local loaders**

In both `Home` and `Tools`, move the existing `Promise.all` query into a `useCallback` named `loadData`. Keep current empty/error behavior. Mount with:

```ts
useEffect(() => { void loadData(); }, [loadData]);
```

Add:

```ts
const [statusRefreshKey, setStatusRefreshKey] = useState(0);
const handleSTChanged = useCallback(() => {
  setStatusRefreshKey((key) => key + 1);
  void loadData();
}, [loadData]);
```

Render:

```tsx
<AppLayout statusRefreshKey={statusRefreshKey}>
<STImportCard onChanged={handleSTChanged} />
```

- [ ] **Step 6: Run the contract test and type check**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
npx.cmd tsc -b --pretty false
```

Expected: both commands pass.

### Task 4: Display the actual last-read line on Home

**Files:**
- Modify: `src/pages/Home.tsx:18-24,102-124`
- Modify: `src/test/frontend-contract.test.ts`

- [ ] **Step 1: Add a failing Home contract**

Append:

```ts
it('首页使用归档阅读位置，不把消息总数当作离开楼层', () => {
  const home = read('src/pages/Home.tsx');
  expect(home).toContain('getLastViewedLine');
  expect(home).not.toContain('lastViewed.session.messages.length} 楼');
});
```

- [ ] **Step 2: Run and verify failure**

Run:

```powershell
npm.cmd test -- src/test/frontend-contract.test.ts --reporter=dot
```

Expected: FAIL because Home still renders total message count in the greeting.

- [ ] **Step 3: Resolve and render the actual line**

Import `getLastViewedLine`, then derive:

```ts
const lastViewed = recentStories[0];
const lastViewedFloor = lastViewed ? getLastViewedLine(lastViewed).line.lastFloor : undefined;
```

Render the suffix only when the floor is numeric:

```tsx
你上次在 {relativeTime(lastViewed.lastViewedAt)}离开《{lastViewed.title}》
{typeof lastViewedFloor === 'number' ? ` · 第 ${lastViewedFloor} 楼` : ''}
```

Keep the story-card total-floor count unchanged because that row intentionally shows story size, not reading progress.

- [ ] **Step 4: Run Batch 1 verification**

Run:

```powershell
npm.cmd test -- src/test/story-branch.test.ts src/test/frontend-contract.test.ts --reporter=dot
npx.cmd tsc -b --pretty false
npm.cmd run lint -- --quiet
npm.cmd test -- --reporter=dot
npm.cmd run build
cargo test --manifest-path src-tauri\Cargo.toml --quiet
git diff --check
```

Expected: all commands pass; Vitest reports at least the existing 449 tests plus the new tests.

- [ ] **Step 5: Review and commit Batch 1**

Review:

```powershell
git diff --stat
git diff -- src/types/archive.ts src/lib/archive-db.ts src/pages/StoryWorkspace.tsx src/components/tools/STImportCard.tsx src/components/AppLayout.tsx src/pages/Home.tsx src/pages/Tools.tsx src/test/story-branch.test.ts src/test/frontend-contract.test.ts
```

Then commit only those files:

```powershell
git add -- src/types/archive.ts src/lib/archive-db.ts src/pages/StoryWorkspace.tsx src/components/tools/STImportCard.tsx src/components/AppLayout.tsx src/pages/Home.tsx src/pages/Tools.tsx src/test/story-branch.test.ts src/test/frontend-contract.test.ts
git commit -m "fix: refresh imported data and reading position"
```
