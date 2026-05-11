# Clickable Sidebar Source Control Chips

## Goal

Make the issues and pull-requests count chips on each sidebar project row
clickable. Clicking a chip opens a modal dialog that lets you browse the
project's open issues or pull requests and view their full content (body,
comments, "View on GitHub" link).

Most of the UI already exists — `ProjectExplorerDialog` was added in commit
710d9305 with `IssuesTab`, `PullRequestsTab`, `IssueDetail`, and
`PullRequestDetail`, but it is not currently wired up to any trigger. This
spec wires it up to the chips, adapts it for a read-only viewing flow, and
renames the static header to project-scoped titles.

## Non-goals

- **Starting a worktree from inside the dialog.** The existing
  `onPullRequestPrepared` attach flow is removed from this dialog. Worktree
  creation continues to live in `NewWorktreeDialog`.
- **Merging issues/PRs across grouped repos into a single list.** Grouped
  projects (`memberProjects.length > 1`) get a compact repo picker inside the
  dialog header instead; only one repo's issues/PRs are shown at a time.
- **New API or backend work.** All required RPC/queries (`issueListQueryOptions`,
  `changeRequestListQueryOptions`, `issueDetailQueryOptions`, etc.) already
  exist and are used by the chip counts and the existing tabs.
- **Tabs or chips inside the worktree row.** The `#123` linked-item badges on
  worktree rows (`WorktreeSourceControlBadges`) and the `LinkedWorktreeItemDialog`
  they open are unchanged.

## User-visible behaviour

### Chips

- Each chip in `ProjectSourceControlBadges` becomes a `<button>` with:
  - `aria-label` describing what the click does: `"View {count} open issues"`
    and `"View {count} open pull requests"`.
  - A hover state (subtle background lift, `cursor-pointer`) so the chip looks
    interactive.
  - `onClick` that calls `event.stopPropagation()` and `event.preventDefault()`
    before invoking its handler, so clicking the chip does **not** toggle the
    project's expand/collapse and does **not** trigger the project's
    drag-handle.
- The existing `title`/tooltip text stays as-is for hover preview.

### Dialog

- Reuses the existing `ProjectExplorerDialog` (modal, ≤ 800px tall, max 3xl
  wide). Keeps existing affordances:
  - `⌘1` / `⌘2` to switch between Issues and Pull requests tabs
  - `/` to focus the active tab's search input
  - `Esc` to close
  - Click a list row to open the detail view; back button to return to the list
- **Title becomes dynamic** and project-scoped:
  - `"{project.displayName} · Issues"` when the Issues tab is active
  - `"{project.displayName} · Pull requests"` when the Pull requests tab is active
  - Updates as the user switches tabs.
  - The keyboard-hint span (`⌘1 issues · ⌘2 PRs · / focus search · Esc close`)
    keeps its current position on the right side of the header row; only the
    left-side `DialogTitle` text changes.
- **Initial tab** is set by which chip was clicked: issues chip → `"issues"`,
  PR chip → `"prs"`.
- **State filter** defaults to `"open"` (already the dialog's default) so the
  list matches what the chip count showed.

### Repo picker (grouped projects only)

- When the project group has more than one member repo
  (`memberProjects.length > 1`), render a compact select control immediately
  below the header, above the tab strip:
  - Each option label: `"{member.name} · {member.environmentLabel ?? 'Local'}"`
  - Default selection: the first member in `project.memberProjects`
  - Selecting a different member re-renders the active tab's list with the
    new `environmentId` + `cwd`
- When there is only one member, no picker renders.

## Components touched

### `apps/web/src/components/Sidebar.tsx`

- `ProjectSourceControlBadges` — accept two new callback props,
  `onIssuesClick` and `onPullRequestsClick`. Each is optional; when omitted,
  the relevant chip stays a static span (preserves the current rendering for
  any future caller).
- `ProjectSourceControlBadge` — switch from `<span>` to `<button>` when an
  `onClick` is provided. Wrap the click handler so it stops propagation. Add
  hover styling (e.g. `hover:bg-emerald-500/15` / `hover:bg-blue-500/15`,
  `cursor-pointer`).
- In the project-header component that calls `ProjectSourceControlBadges`
  (around line 3232), add `useState` for the explorer dialog:
  `{ open: boolean; initialTab: "issues" | "prs" } | null`. Pass click
  handlers to the badges and render `<ProjectExplorerDialog />` once per
  project group with `project.displayName`, `project.memberProjects`, and
  the selected `initialTab`.

### `apps/web/src/components/projectExplorer/ProjectExplorerDialog.tsx`

Refactor the props. New interface:

```ts
interface ProjectExplorerDialogProps {
  open: boolean;
  projectName: string;
  memberProjects: ReadonlyArray<SidebarProjectGroupMember>;
  initialTab: "issues" | "prs";
  onOpenChange: (open: boolean) => void;
}
```

- Remove `environmentId`, `cwd`, `projectId`, `threadId`, and
  `onPullRequestPrepared` from the props. (The dialog is not used anywhere
  else yet — no migration of existing call sites is needed.)
- Remove the `gitPreparePullRequestThreadMutation` block, the
  `handleAttachPullRequest` callback, the `attachInProgress` state, and the
  `errorMessage` footer. The `IssueDetail` and `PullRequestDetail` components
  render without their `onAttach`/`attachInProgress` props (those props are
  already optional today).
- Add `useState<string>` for the currently-selected member, keyed by
  `member.physicalProjectKey` (already used elsewhere in the sidebar to
  identify group members uniquely). Default to
  `memberProjects[0].physicalProjectKey`. Re-default on `open` transition
  closed→open whenever the member list identity changes.
- When `memberProjects.length > 1`, render a compact selector between the
  header and the tab strip. Use the same `<Select>` family already used in
  the sidebar (the existing project-settings menu picks from a similar
  list — match its visual size and density). The selector controls which
  member's `environmentId` / `cwd` is passed down.
- `useState<TabId>` defaults to `props.initialTab` and resets to
  `props.initialTab` whenever the dialog transitions from closed to open.
- Replace the static `"Project explorer"` `DialogTitle` text with the
  dynamic project-scoped title described above.

### `apps/web/src/components/projectExplorer/IssuesTab.tsx`, `PullRequestsTab.tsx`

No changes. Both already accept `environmentId` + `cwd` and key their
`useQuery` calls on them, so swapping members just triggers a refetch.

### `apps/web/src/components/projectExplorer/IssueDetail.tsx`, `PullRequestDetail.tsx`

No changes. Both already render fine when `onAttach` / `attachInProgress`
are undefined.

## Data flow

```
SidebarProjectSnapshot           SidebarProjectGroup component
{ displayName,                 ┌─────────────────────────────┐
  memberProjects: [...] }  ──► │ explorerDialog state        │
                               │  { open, initialTab }       │
                               │                             │
                               │ ProjectSourceControlBadges  │
                               │   onIssuesClick ──► open(   │
                               │     tab="issues" )          │
                               │   onPullRequestsClick ──►   │
                               │     open(tab="prs")         │
                               │                             │
                               │ ProjectExplorerDialog       │
                               │   projectName               │
                               │   memberProjects            │
                               │   initialTab                │
                               └──────────┬──────────────────┘
                                          │
                                          ▼
                       ┌────────────────────────────────────────┐
                       │ ProjectExplorerDialog (refactored)     │
                       │  selectedMember state                  │
                       │  activeTab state                       │
                       │                                        │
                       │ Header: "{projectName} · {tabLabel}"   │
                       │ [optional] RepoPicker (length > 1)     │
                       │ Tabs: Issues | Pull requests           │
                       │   ↓                                    │
                       │ IssuesTab / PullRequestsTab            │
                       │   (env+cwd from selectedMember)        │
                       │   onSelect ──► detail view             │
                       │ IssueDetail / PullRequestDetail        │
                       │   (env+cwd from selectedMember)        │
                       └────────────────────────────────────────┘
```

## A11y

- Chips: focusable buttons with descriptive `aria-label` that includes the
  count. Tooltip stays for sighted users.
- Dialog: existing `DialogTitle` keeps its role; only its text changes.
- Repo picker: native select semantics from the Base UI select component
  (label + listbox + options). Picker is only mounted when needed, so screen
  readers don't see an empty selector on single-repo projects.

## Testing

- **Unit / RTL tests for `ProjectSourceControlBadges`:**
  - Renders as buttons when handlers are passed; renders as spans when not.
  - `onClick` does not bubble (calls `stopPropagation`).
  - `aria-label` includes the count.
- **Unit / RTL tests for refactored `ProjectExplorerDialog`:**
  - Title reflects `projectName` + active tab.
  - `initialTab` controls which tab is shown on open.
  - Repo picker renders only when `memberProjects.length > 1`.
  - Switching repo causes the active tab's queries to be re-issued with the
    new `environmentId` + `cwd`.
  - Closing and reopening resets the active tab to `initialTab`.
- **Smoke check:**
  - Click an issues chip on a single-repo project → dialog opens on Issues
    tab, list populated, click a row → detail view, ESC → closes.
  - Click a PRs chip on a grouped project → dialog opens on PRs tab with the
    repo picker visible; switching repo updates the list.
  - Chip click does not toggle the project expansion.

## Out of scope (deferred)

- **Action buttons** ("start worktree from this issue/PR", "create thread")
  inside the dialog. The existing attach flow stays in `NewWorktreeDialog`.
- **Combined cross-repo list** for grouped projects. The repo picker is the
  chosen UX for now.
- **Issue/PR creation** from inside the dialog.
- **Non-GitHub provider support.** Inherits whatever
  `sourceControlContextRpc` already supports.
