# Batch 0 Documentation Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two authoritative frontend documents agree with the final 2:3 character-card decision without losing the superseded 3:4 history.

**Architecture:** This batch is documentation-only. Active Markdown states the 2:3 rule; the old 3:4 text remains inside HTML comments and comments stay outside table bodies.

**Tech Stack:** Markdown, Git

---

### Task 1: Verify and commit the authoritative-document correction

**Files:**
- Modify: `_reference/前端重构规划-客户端化.md`
- Modify: `_reference/新前端交接包/交接说明.md`

- [ ] **Step 1: Inspect every ratio rule**

Run:

```powershell
rg -n "3:4|2:3" "_reference/前端重构规划-客户端化.md" "_reference/新前端交接包/交接说明.md"
```

Expected: every active rule says `2:3`; every `3:4` occurrence is on a `<!-- ... -->` line.

- [ ] **Step 2: Verify that no active 3:4 requirement remains**

Run:

```powershell
$hits = rg -n "3:4" "_reference/前端重构规划-客户端化.md" "_reference/新前端交接包/交接说明.md"
$active = $hits | Where-Object { $_ -notmatch '<!--' }
if ($active) { $active; exit 1 }
```

Expected: exit code 0 and no output.

- [ ] **Step 3: Check formatting and scope**

Run:

```powershell
git diff --check
git diff -- "_reference/前端重构规划-客户端化.md" "_reference/新前端交接包/交接说明.md"
```

Expected: no whitespace errors; diff contains only five ratio-rule corrections and their historical comments.

- [ ] **Step 4: Commit Batch 0**

```powershell
git add -- "_reference/前端重构规划-客户端化.md" "_reference/新前端交接包/交接说明.md"
git commit -m "docs: align character card ratio with ST"
```

Expected: one documentation-only commit.
