# Sidebar Worktree Hierarchy — Design Spec

**Date:** 2026-05-08
**Branch:** `feature/source-control-explorer`
**Status:** Approved for implementation planning

## Goal

Restructure the left sidebar from today's flat `Project → Thread` into a hierarchical workspace explorer that mirrors how a developer actually thinks about their work: one project, many isolated worktrees, multiple chats per worktree grouped by status. Non-git projects keep a simpler flat shape with a clear path to upgrade.

```
Project (s3code)
└── Worktree                ← "main" or any branch / PR / issue / manual worktree
    └── Status bucket       (auto-derived; collapsible; hidden when empty)
        └── Session         ← today's "thread"
```

## Non-goals (deferred)

- AI-driven branch-name auto-generation. v1 uses a deterministic `task/<short-id>` slug.
- Rich PR/issue detail browsing inside the unified dialog (the existing rich-detail UX disappears in v1; can be re-introduced later).
- GitLab / Azure / Bitbucket PR & Issue tabs in the unified dialog. Branches tab works for all providers.
- Cross-worktree session drag-and-drop.
- BranchToolbar visual redesign — only the `Issues & PRs` button is retargeted.
- Worktree origin re-detection (matching today's "manual" worktrees against open PRs after migration).

---

## 1. Data model

### New table: `projection_worktrees`

| column | type | notes |
| --- | --- | --- |
| `worktree_id` | TEXT PK | new opaque id |
| `project_id` | TEXT FK | scoped to project |
| `branch` | TEXT | branch name (e.g. `main`, `feature/foo`) |
| `worktree_path` | TEXT NULL | absolute path; **NULL** for the synthetic "main" row that points at `workspace_root` |
| `origin` | TEXT | `main` \| `branch` \| `pr` \| `issue` \| `manual` |
| `pr_number` / `issue_number` | INT NULL | populated when origin is `pr` / `issue` |
| `pr_title` / `issue_title` | TEXT NULL | snapshot for display when GitHub data is unavailable |
| `created_at` / `updated_at` / `archived_at` | TEXT | standard timestamps; `archived_at IS NOT NULL` ⇒ archived |
| `manual_position` | INTEGER | drag-reorder ordinal within the project |

Indices: `(project_id, archived_at)`, `(project_id, origin, pr_number) WHERE pr_number IS NOT NULL`, `(project_id, origin, issue_number) WHERE issue_number IS NOT NULL`.

### Changes to `projection_threads`

Three new columns:

- `worktree_id TEXT NULL` — FK to `projection_worktrees`. Nullable only during the migration grace window; new sessions always have one.
- `manual_status_bucket TEXT NULL` — drag-and-drop override (`idle | in_progress | review | done`). When NULL, the bucket is auto-derived from runtime state. Cleared via an explicit "Reset" affordance on the session row's `…` menu.
- `manual_position INTEGER` — drag-reorder ordinal within `(worktree_id, derived_bucket)`.

Existing `branch` and `worktree_path` columns are **kept** as denormalized read columns. The thread projector keeps writing them by reading from the worktree row, so today's runtime code that already reads `thread.branch` or `thread.worktree_path` continues to work without a single line of change.

### Auto-bucket rule

The bucket is derived from the existing thread runtime state already computed by `resolveThreadStatusPill` in `Sidebar.logic.ts`:

| runtime state | bucket |
| --- | --- |
| `Working` | `IN PROGRESS` |
| `Plan Ready` / `Pending Approval` / `Awaiting Input` | `REVIEW` |
| `Completed` | `DONE` |
| anything else (idle / no active turn) | `IDLE` |

When `manual_status_bucket IS NOT NULL` it overrides the derivation. The override sticks until the user drags the session again or hits "Reset bucket" — runtime state changes do **not** clear it (per Q9 → option B).

### Aggregate worktree status (for the row's status dot)

Computed from the worktree's sessions — worst wins:

- any session in `IN PROGRESS` → green-pulse dot
- else any session in `REVIEW` → amber dot
- else all sessions in `DONE` → grey-check
- else (mix of IDLE / DONE only) → grey

---

## 2. Sidebar UI structure

### Per-project rendering

1. **Project header row** — favicon, name, badges (`◉ N` issues, `↗ N` PRs), activity dot, `…` menu, `+` button.
   - The `+` opens `NewWorktreeDialog` (Section 3).
   - Issue/PR badges only render when the project's source-control provider is GitHub (the existing data path); for other providers (GitLab / Azure / Bitbucket) the badge slot is hidden in v1. Clicking a badge opens the dialog with the relevant tab pre-selected and the state filter pre-set to "open".
   - Non-git projects show a "Local · no git" pill instead of issue/PR badges.

2. **Worktree rows**, sorted by `manual_position` ascending (initial backfill orders by `updated_at` desc), with `main` pinned at the top regardless of `manual_position`:
   - Aggregate status dot.
   - Branch name + small origin badge for non-main worktrees: `PR #123`, `Issue #45`, or none for plain branches.
   - Inline diff stats `+44 / -25` from server-side `git diff --shortstat` on the worktree's checkout (cached per the existing 1s VCS cache; refreshed on focus / activity).
   - **Hover `+` button** → creates a new draft session in this worktree. Also exposed via the `…` menu's "New session here" item for keyboard / non-hover access.
   - `…` menu → New session here · Archive · Delete · Open in editor · Copy path. The `main` row hides Archive and Delete.

3. **Status bucket headers** (`IDLE 2`, `IN PROGRESS 1`, `REVIEW 1`, `DONE 4`):
   - Only rendered when the bucket has ≥ 1 session.
   - Collapsible (state persisted per-worktree in client storage).
   - Hidden entirely when the worktree has zero sessions in any bucket.

4. **Session rows** — title, status pill, runtime model badge, last-activity timestamp. Same click-to-open behavior as today's `SidebarThreadRow`. The `…` menu adds a "Reset bucket" item that's only enabled when `manual_status_bucket IS NOT NULL`; clicking sets it back to NULL so auto-derivation resumes.

5. **Archived group** — collapsed `Archived (N)` block at the bottom of the project. Sessions inside are read-only; their parent worktree shows the branch and a "Restore" / "Delete" affordance.

### Click & keyboard behavior

| action | result |
| --- | --- |
| click session row | open that session's chat |
| click worktree row | open the session with the highest `updated_at` in that worktree; if zero sessions, seed a draft session anchored to the worktree (becomes real on first message — keeps today's draft mechanism) |
| click project row | expand / collapse the project's worktrees (no chat opens) |
| hover `+` on worktree row · `⌘N` while worktree focused | new draft session in that worktree |
| `+` on project header · `⌘+Shift+N` | open `NewWorktreeDialog` |
| `⌘+Shift+P` (existing) | open `NewWorktreeDialog` with PR tab pre-selected |

### Drag and drop

Three sortable contexts (all reuse the existing `@dnd-kit` setup):

- **Sessions across status buckets within a worktree** — drag sets `manual_status_bucket`. Within the same bucket reorders via `manual_position`. Cross-worktree drag is **disabled**.
- **Worktrees within a project** — reorders via `projection_worktrees.manual_position`. `main` is pinned (not draggable).
- **Projects** — unchanged from today.

### Non-git projects

Project header shows a "Local · no git" pill instead of issue/PR badges. Sessions render directly under the project (no worktree row, no status buckets — flat list). The project's `…` menu has an **"Initialize git here"** action that:

1. Confirms with the user.
2. Runs `git init` in `workspace_root`.
3. Synthesises a `main` worktree row.
4. Re-bucketizes existing sessions under it.

The action is reversible only by manual `rm -rf .git` outside the app — that's acceptable.

---

## 3. New Worktree dialog & Add Project flow

### Triggers

- `+` on project header
- `⌘+Shift+N`
- `⌘+Shift+P` (preselects PR tab)
- `Issues & PRs` button on `BranchToolbar` (preselects PR tab)

### Tabs

`Branches | Pull Requests | Issues | New branch`

- **Branches tab** — local + remote branches, search box, refresh. Always available.
- **Pull Requests tab** — list reuses `ChangeRequest` data shape from the recently-added project explorer; supports state filter (open/closed/merged), search, refresh. **GitHub only** in v1; other providers show a "Not yet supported" empty state.
- **Issues tab** — same shape as PRs but using `SourceControlIssueSummary`. **GitHub only**.
- **New branch tab** — text input (optional name; empty → auto-generated `task/<short-id>` slug, where `<short-id>` is a 6-character random alphanumeric string from `[a-z0-9]`. Not collision-checked — collision odds within a project are negligible at this length), base-branch picker (default: project's default branch).

### Unified create RPC

A single new RPC handles every path:

```ts
gitWorkflow.createWorktreeForProject(
  projectId: ProjectId,
  intent:
    | { kind: "branch"; branchName: string }
    | { kind: "pr"; number: number }
    | { kind: "issue"; number: number }
    | { kind: "newBranch"; branchName?: string; baseBranch?: string }
): Promise<{ worktreeId: WorktreeId; sessionId: ThreadId }>
```

Server flow:

1. Resolve target branch name:
   - `branch` → use input as-is.
   - `pr` → look up PR's `headRefName`.
   - `issue` → invent `issue/<n>-<slug>` from issue number + title.
   - `newBranch` → user input or auto-generated `task/<short-id>`.
2. Insert `projection_worktrees` row with the right `origin` and metadata.
3. Call existing `gitCore.createWorktree` to put the checkout on disk; run the project setup script (existing path).
4. Seed a draft session in the new worktree:
   - For `pr` → preload PR thread (reuse `gitPreparePullRequestThread`'s comment-thread bundling).
   - For `issue` → preload issue thread via new `IssueThreadBundler` (parallel to PR bundler).
   - For `branch` / `newBranch` → empty draft session.
5. Return `{ worktreeId, sessionId }`.

Client navigates the sidebar to the new worktree row and opens the new draft session.

### Re-attach detection

Before creating from a PR or issue intent, the dialog calls a new helper:

```ts
gitWorkflow.findWorktreeForOrigin(projectId, { kind: "pr" | "issue", number })
  : Promise<WorktreeId | null>
```

If a non-archived match exists, the action button switches from **Create** to **Open existing worktree** — clicking selects that worktree's most recent session in the sidebar and closes the dialog. No duplicates.

### "Attach (Local)" goes away

In the new model every chat lives in a worktree (main is just one of them). The existing Project Explorer dialog's `Attach (Local)` button is removed. If a user wants to chat about a PR while staying on main, they manually open a session in `main` after the fact.

### Add Project flow — preserved

The existing CommandPalette-driven Add Project flow (local directory + clone from GitHub / GitLab / Azure / Bitbucket via `AddProjectCloneFlow` in `CommandPalette.tsx`) is left untouched. The only server-side change: after creation, detect whether `workspace_root` has a `.git`, and if so synthesise the `main` worktree row immediately (`origin='main'`, `worktree_path=NULL`).

---

## 4. Worktree lifecycle (Archive / Delete / Auto-suggest)

### Archive — soft, restorable

- Triggered from the worktree's `…` menu or auto-suggest accept.
- Sets `archived_at = now`.
- Removes the on-disk checkout (`git worktree remove --force` if clean; confirms first if dirty).
- Sessions inside it stay in the DB but render under the project's `Archived (N)` group; they become read-only (no new turns) until restored.
- Branch is **kept** by default. The confirm dialog has a checkbox "Also delete local branch `<name>`" that defaults off and is **disabled** when:
  - The branch has unpushed commits.
  - The branch is the current HEAD of another worktree.
- **Restore** (`…` on archived row) re-creates the on-disk worktree from the branch and unsets `archived_at`. If the branch was deleted, restore is unavailable and the row offers Delete only.

### Delete — hard, irreversible

- Drops the `projection_worktrees` row, cascades-deletes its sessions and turn history, removes the on-disk checkout.
- Confirm dialog lists what will be lost: `N sessions, M turns, branch <name>`.
- Always-on checkbox "Also delete local branch" with the same disabled-when-unsafe rule.
- No undo.

### Auto-suggest nudge

A worktree where **every session is in the DONE bucket and `max(projection_threads.updated_at) for that worktree` is ≥ 7 days ago** (threshold hardcoded in v1, configurable later) shows a small `Archive?` chip on the row. Dismissable for another 7 days (dismissal stored client-side per worktree). Nothing happens automatically — purely a hint. Computed server-side from `projection_threads.updated_at` + bucket derivation, refreshed by the projector.

### Confirmation safety

The confirm dialog for both Archive and Delete shows:

- Per-bucket session counts ("3 sessions: 1 IN PROGRESS, 2 DONE").
- A red banner when any session is currently `IN PROGRESS` or has an active turn — requires an extra "I understand, archive anyway" checkbox.
- Working-tree dirtiness state (`+44 / -25 uncommitted`) — banner if non-zero.
- For Delete: explicit "Type the branch name to confirm" input when the worktree has IN PROGRESS sessions or uncommitted changes.

### `main` is special

The synthesized `main` worktree (origin=`main`, `worktree_path=NULL`) **cannot be archived or deleted** — it represents the project's root checkout. The `…` menu hides those actions for it. Removing the project itself remains the existing "Remove project" flow on the project header.

### New WS RPCs

- `gitWorkflow.archiveWorktree(worktreeId, { deleteBranch })`
- `gitWorkflow.restoreWorktree(worktreeId)`
- `gitWorkflow.deleteWorktree(worktreeId, { deleteBranch })`

All three go through `GitWorkflowService` for the same locking / serialization that `createWorktree` already has, and emit the new `WorktreeArchived` / `WorktreeDeleted` domain events the projector listens to.

### Orphaned worktrees

On server start, any non-archived `projection_worktrees` row whose `worktree_path` is missing on disk is auto-archived with a `branch missing` flag. Surfaced under `Archived (N)` with delete-only action.

---

## 5. Migration of existing threads

Best-effort auto-group at the data layer — no migration UI, runs once on first launch of the new build.

### Schema migration

`apps/server/src/persistence/Migrations/030_Worktrees.ts` (current latest is `029_ProjectionThreadDetailOrderingIndexes`):

- Creates the `projection_worktrees` table with indices.
- Adds `worktree_id`, `manual_status_bucket`, `manual_position` to `projection_threads`.
- Adds `(worktree_id, manual_status_bucket)` index.

Wrapped in one transaction.

### Data migration logic (idempotent)

For each existing project, in a `SAVEPOINT`:

1. **Detect git** at `workspace_root` — `.git` exists OR the directory is inside an existing git tree.
2. **If git:** insert a `main` row → `origin='main'`, `worktree_path=NULL`, `branch =` value of `git symbolic-ref --short refs/remotes/origin/HEAD` (fallback chain: `main` → `master` → first local branch).
3. **For each thread** in the project:
   - No `worktree_path` AND project is git → assign `worktree_id` of the `main` row.
   - No `worktree_path` AND project is non-git → leave `worktree_id` NULL (sessions render flat).
   - Has `worktree_path` → upsert a worktree row keyed by `(project_id, branch, worktree_path)`, `origin='manual'`. Assign `worktree_id`.
4. `manual_status_bucket` stays NULL for every thread (auto-derive from runtime state).
5. `manual_position` = row number ordered by `created_at` within `(worktree_id, derived_bucket)`.

`WHERE worktree_id IS NULL` makes the migration a no-op on re-run. SAVEPOINT per project so a failure on one doesn't poison others.

### Edge cases

| case | handling |
| --- | --- |
| thread with `worktree_path` but missing on disk | row created normally; orphaned-worktree cleanup auto-archives on first sidebar load |
| thread on a non-main branch but no `worktree_path` | goes to `main` (best-effort); thread's `branch` value is left untouched |
| project with neither git nor threads | no worktree rows; renders empty + "Initialize git here" pill |
| orphan thread (`project_id` not in projects) | skipped, `worktree_id` left NULL, surfaced via existing orphan-thread tooling |

### Forward-only, non-destructive

If the user downgrades to a pre-migration build, `projection_worktrees` is ignored, the new columns on `projection_threads` are unread, and the existing `branch` / `worktree_path` / `project_id` columns still hold valid data. Old binaries keep working off the same DB.

---

## 6. Component refactor

### `Sidebar.tsx` breakup

`apps/web/src/components/Sidebar.tsx` is currently ~3500 lines / ~50k tokens — over the "doing too much" threshold from `AGENTS.md`. As part of this work it splits into:

```
apps/web/src/components/sidebar/
├── SidebarShell.tsx              ← layout, header pill row, footer
├── SidebarProjectList.tsx        ← @dnd-kit context for projects
├── SidebarProjectRow.tsx         ← header: favicon, name, badges, + button, … menu
├── SidebarWorktreeRow.tsx        ← branch, status dot, diff stats, hover +, … menu
├── SidebarStatusBucket.tsx       ← bucket header + collapse + dnd context for sessions
├── SidebarSessionRow.tsx         ← extracted from today's SidebarThreadRow
├── SidebarArchivedGroup.tsx      ← collapsed "Archived (N)" at the bottom of a project
├── SidebarEmptyStates.tsx        ← non-git pill, "no projects yet", "branch missing" archived row
└── hooks/
    ├── useSidebarTree.ts         ← composes projects + worktrees + sessions into tree shape
    ├── useWorktreeActions.ts     ← archive / delete / restore / new-session mutations
    └── useSidebarDragDrop.ts     ← three sortable contexts (projects, worktrees, sessions)
```

`Sidebar.logic.ts` keeps the pure-logic helpers (status pill, etc.) and grows new helpers for **bucket derivation**, **aggregate worktree status**, **archive auto-suggest threshold**. Same `*.logic.test.ts` pattern as today.

### New worktree dialog file layout

```
apps/web/src/components/newWorktreeDialog/
├── NewWorktreeDialog.tsx                     ← shell + tabs + create RPC plumbing
├── BranchesTab.tsx                           ← list local + remote branches
├── PullRequestsTab.tsx                       ← refactored from existing
├── IssuesTab.tsx                             ← refactored from existing
├── NewBranchTab.tsx                          ← branch-name input + base picker
└── reAttachDetector.ts                       ← lookup existing worktree for PR/issue
```

The existing `apps/web/src/components/projectExplorer/` directory is renamed and becomes the source of these tab components — the move is a rename, not a copy. The standalone `ProjectExplorerDialog.tsx` is deleted; its trigger callsite in `BranchToolbar.tsx` opens `NewWorktreeDialog` with `defaultTab="pull-requests"`.

### Server-side

```
apps/server/src/persistence/Migrations/030_Worktrees.ts          ← schema + data migration
apps/server/src/persistence/Layers/ProjectionWorktrees.ts        ← new repository
apps/server/src/persistence/Layers/ProjectionThreads.ts          ← extended with worktree_id read/write
apps/server/src/orchestration/projectors/WorktreeProjector.ts    ← new projector
apps/server/src/git/GitWorkflowService.ts                        ← + create / archive / restore / delete worktree
apps/server/src/sourceControl/IssueThreadBundler.ts              ← new (parallel to PR thread bundler)
apps/server/src/ws.ts                                            ← new RPC routes
```

### New domain events

- `WorktreeCreated` (`{ worktreeId, projectId, branch, origin, prNumber?, issueNumber? }`)
- `WorktreeArchived` (`{ worktreeId, deletedBranch: boolean }`)
- `WorktreeDeleted` (`{ worktreeId, deletedBranch: boolean }`)
- `WorktreeRestored` (`{ worktreeId }`)
- `ThreadAttachedToWorktree` (`{ threadId, worktreeId }`)
- `ThreadStatusBucketOverridden` (`{ threadId, bucket | null }`)

The thread projector continues to write `branch` + `worktree_path` denormalized columns from the worktree row, so today's runtime code that reads those fields keeps working without a single line changed.

---

## 7. Test plan

- **Migration tests**: every edge-case rule from Section 5 has a fixture (orphaned path · branch-without-path · non-git project · orphan thread).
- **Projector tests**: verify worktree counts, status buckets, archived semantics for representative event sequences.
- **Component tests**: tree rendering with mocked tree data; drag-drop bucket override; click semantics (project / worktree / session); non-git fallback; archived group collapse.
- **Logic tests** (`*.logic.test.ts`): bucket derivation, aggregate worktree status, auto-suggest threshold (≥ 7 days idle in DONE).
- **Integration**: `gitPreparePullRequestThread` callsite still works (now wrapped by `createWorktreeForProject`).
- **Re-attach detection**: creating a PR worktree twice opens the existing one.
- **Lifecycle**: archive removes on-disk checkout; restore re-creates; delete cascades; `main` cannot be archived/deleted.
- **All of `bun fmt`, `bun lint`, `bun typecheck`, `bun run test` green** per `AGENTS.md`. Never run `bun test`.

---

## 8. Out of scope (explicit)

1. AI-driven branch name (use `task/<short-id>` slug).
2. Rich PR/issue detail view inside `NewWorktreeDialog` — replaced by direct create. Today's rich Project Explorer detail UX is removed; can be re-introduced later.
3. GitLab / Azure / Bitbucket PR & Issue tabs — empty state in v1. Branches tab works for all providers.
4. Cross-worktree session drag.
5. BranchToolbar redesign — keeps current structure; only the `Issues & PRs` button is retargeted.
6. Worktree origin re-detection from open PRs after migration (manual worktrees stay `origin='manual'`).
7. Automatic worktree archiving — only the suggest-chip nudge.
8. Per-project setting for the auto-suggest threshold (hardcoded 7 days for v1).

---

## Appendix A — RPC additions

| RPC | shape | notes |
| --- | --- | --- |
| `gitWorkflow.createWorktreeForProject` | `(projectId, intent) → { worktreeId, sessionId }` | unified create |
| `gitWorkflow.findWorktreeForOrigin` | `(projectId, { kind, number }) → worktreeId \| null` | re-attach detection |
| `gitWorkflow.archiveWorktree` | `(worktreeId, { deleteBranch }) → void` | |
| `gitWorkflow.restoreWorktree` | `(worktreeId) → void` | |
| `gitWorkflow.deleteWorktree` | `(worktreeId, { deleteBranch }) → void` | |
| `threads.setManualBucket` | `(threadId, bucket \| null) → void` | drag-drop override / reset |
| `threads.setManualPosition` | `(threadId, position) → void` | sibling reorder |
| `worktrees.setManualPosition` | `(worktreeId, position) → void` | worktree reorder within project |
| `projects.initializeGit` | `(projectId) → void` | non-git → git upgrade |

Existing `gitPreparePullRequestThread` is wrapped by `createWorktreeForProject({ kind: "pr", number })` — its current call sites (URL-paste dialog, project explorer Attach button) are migrated.

## Appendix B — Implementation notes

### Draft sessions and `worktree_id`

Today, draft sessions are stored client-side in `useComposerDraftStore` (Zustand) and promoted to real `projection_threads` rows on first message. In the new model, every session needs a `worktree_id`. The draft store gains a `worktreeId` field that's set at draft-creation time (when the user clicks `+` on a worktree row, or clicks a worktree row that has zero sessions). At promotion, `worktree_id` is sent to the server alongside the message and stored on the new thread row.

### Default branch detection requirement

The migration and the `main` worktree synthesis both need to detect the project's default branch. Required logic, in order:

1. `git symbolic-ref --short refs/remotes/origin/HEAD` — trims the `origin/` prefix.
2. If that fails (no remote, or HEAD not set on remote): try existence of local `main`.
3. Else: try existence of local `master`.
4. Else: the first branch from `git branch --list --format='%(refname:short)' | head -n 1`.
5. Else (no branches at all — fresh `git init` with no commits): use the literal string `main` and let the next commit create it.

Each step is wrapped to never throw; failure proceeds to the next step.
