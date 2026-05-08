# Horizontal Terminal Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the terminal drawer's right-side sidebar with a horizontal tab strip, and add a count badge to the top-bar terminal toggle.

**Architecture:** Two pure helpers (`resolveTabLabel`, `groupHasRunningTerminal`) added to `ThreadTerminalDrawer.tsx` and tested via the existing `ThreadTerminalDrawer.test.ts`. `BranchToolbar` gains a `terminalCount` prop and renders a `· N` badge when ≥ 2 terminals exist. `ThreadTerminalDrawer` gains a `runningTerminalIds` prop, removes the right sidebar block and the floating top-right action overlay, and renders a tab strip above the viewport that holds tabs (one per group) and the existing split / new / close actions.

**Tech Stack:** TypeScript, React, Vitest, Tailwind. Existing icons from `lucide-react`. Bun for tooling (`bun fmt`, `bun lint`, `bun typecheck`, `bun run test` per `AGENTS.md`).

**Spec:** `docs/superpowers/specs/2026-05-08-terminal-tabs-design.md`

---

### Task 1: Add pure helpers `resolveTabLabel` and `groupHasRunningTerminal`

**Files:**
- Modify: `apps/web/src/components/ThreadTerminalDrawer.tsx` (add two exported functions)
- Test: `apps/web/src/components/ThreadTerminalDrawer.test.ts` (add three `describe` blocks)

- [ ] **Step 1: Write failing tests**

Append to `apps/web/src/components/ThreadTerminalDrawer.test.ts` (inside the file, after the existing `describe` block — keep the existing imports, add the two new helper names to the import list):

Update the import at the top of the file:

```ts
import {
  groupHasRunningTerminal,
  resolveTabLabel,
  resolveTerminalSelectionActionPosition,
  selectPendingTerminalEventEntries,
  selectTerminalEventEntriesAfterSnapshot,
  shouldHandleTerminalSelectionMouseUp,
  terminalSelectionActionDelayForClickCount,
} from "./ThreadTerminalDrawer";
```

Append these new test blocks at the end of the file (after the closing `});` of the existing `describe("resolveTerminalSelectionActionPosition", ...)`):

```ts
describe("resolveTabLabel", () => {
  it("labels a single-terminal group as Terminal N", () => {
    expect(resolveTabLabel({ id: "group-1", terminalIds: ["a"] }, 1)).toBe("Terminal 1");
  });

  it("labels a multi-terminal group as Split N", () => {
    expect(resolveTabLabel({ id: "group-2", terminalIds: ["a", "b"] }, 2)).toBe("Split 2");
  });

  it("uses the supplied 1-based group index", () => {
    expect(resolveTabLabel({ id: "group-3", terminalIds: ["a"] }, 7)).toBe("Terminal 7");
  });
});

describe("groupHasRunningTerminal", () => {
  it("returns false when no terminals are running", () => {
    expect(groupHasRunningTerminal({ id: "g", terminalIds: ["a", "b"] }, [])).toBe(false);
  });

  it("returns true when any group member is running", () => {
    expect(groupHasRunningTerminal({ id: "g", terminalIds: ["a", "b"] }, ["b"])).toBe(true);
  });

  it("returns false when running terminals are not in the group", () => {
    expect(groupHasRunningTerminal({ id: "g", terminalIds: ["a"] }, ["b"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test apps/web/src/components/ThreadTerminalDrawer.test.ts`

Expected: FAIL — both new helpers are undefined imports.

- [ ] **Step 3: Implement helpers**

Add to `apps/web/src/components/ThreadTerminalDrawer.tsx` near the other exported pure helpers (e.g. immediately after `selectPendingTerminalEventEntries`, around line 90 — anywhere in module scope is fine, but keep them grouped with the existing helpers for discoverability):

```ts
export function resolveTabLabel(
  group: ThreadTerminalGroup,
  groupIndex: number,
): string {
  return group.terminalIds.length > 1 ? `Split ${groupIndex}` : `Terminal ${groupIndex}`;
}

export function groupHasRunningTerminal(
  group: ThreadTerminalGroup,
  runningTerminalIds: readonly string[],
): boolean {
  if (runningTerminalIds.length === 0) return false;
  const runningSet = new Set(runningTerminalIds);
  return group.terminalIds.some((id) => runningSet.has(id));
}
```

`ThreadTerminalGroup` is already imported from `../types` at the top of the file (no new import needed).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test apps/web/src/components/ThreadTerminalDrawer.test.ts`

Expected: PASS — all tests green, including the existing ones.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ThreadTerminalDrawer.tsx apps/web/src/components/ThreadTerminalDrawer.test.ts
git commit -m "Add tab-label and running-terminal helpers for terminal tabs"
```

---

### Task 2: Add `terminalCount` prop and badge to `BranchToolbar`

**Files:**
- Modify: `apps/web/src/components/BranchToolbar.tsx` (add prop, render badge inside button)
- Modify: `apps/web/src/components/ChatView.tsx` (pass count to BranchToolbar)

- [ ] **Step 1: Add the prop to `BranchToolbarProps`**

In `apps/web/src/components/BranchToolbar.tsx`, find this block (currently around lines 56-60 — the tail of the `BranchToolbarProps` interface):

```ts
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  onToggleTerminal: () => void;
}
```

Replace with:

```ts
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  onToggleTerminal: () => void;
  terminalCount: number;
}
```

Then find the function destructure (currently around lines 211-215 — the tail of the `BranchToolbar` parameter list):

```ts
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  onToggleTerminal,
}: BranchToolbarProps) {
```

Replace with:

```ts
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  onToggleTerminal,
  terminalCount,
}: BranchToolbarProps) {
```

- [ ] **Step 2: Render the badge inside the toggle button**

In `apps/web/src/components/BranchToolbar.tsx`, find the button JSX (currently lines 293-305):

```tsx
<Button
  variant="ghost"
  size="xs"
  className="font-medium text-muted-foreground/70 hover:text-foreground/80"
  disabled={!terminalAvailable}
  onClick={onToggleTerminal}
  aria-label="Toggle terminal drawer"
  aria-pressed={terminalOpen}
>
  <TerminalSquareIcon className="size-3 shrink-0" />
  <span>{terminalOpen ? "Close Terminal" : "Open Terminal"}</span>
</Button>
```

Replace with:

```tsx
<Button
  variant="ghost"
  size="xs"
  className="font-medium text-muted-foreground/70 hover:text-foreground/80"
  disabled={!terminalAvailable}
  onClick={onToggleTerminal}
  aria-label="Toggle terminal drawer"
  aria-pressed={terminalOpen}
>
  <TerminalSquareIcon className="size-3 shrink-0" />
  <span>{terminalOpen ? "Close Terminal" : "Open Terminal"}</span>
  {terminalCount >= 2 && (
    <span
      className="text-muted-foreground/70 tabular-nums"
      aria-label={`${terminalCount} open terminals`}
    >
      · {terminalCount}
    </span>
  )}
</Button>
```

- [ ] **Step 3: Pass `terminalCount` from `ChatView`**

In `apps/web/src/components/ChatView.tsx`, find the `<BranchToolbar />` JSX (currently around line 3787). Inside the props, after `onToggleTerminal={toggleTerminalVisibility}` (line 3809), add:

```tsx
                terminalCount={terminalState.terminalIds.length}
```

So the block becomes:

```tsx
              <BranchToolbar
                // ...existing props unchanged...
                terminalAvailable={activeProject !== undefined}
                terminalOpen={terminalState.terminalOpen}
                terminalToggleShortcutLabel={terminalToggleShortcutLabel}
                onToggleTerminal={toggleTerminalVisibility}
                terminalCount={terminalState.terminalIds.length}
              />
```

`terminalState` is already in scope from the existing `selectThreadTerminalState` selector (this is the same scope that produces `terminalState.terminalOpen` already used on the line above).

- [ ] **Step 4: Verify typecheck and tests**

Run: `bun typecheck`
Expected: clean — no new errors.

Run: `bun run test apps/web/src/components/BranchToolbar.logic.test.ts`
Expected: existing tests stay green (we only added a JSX prop, no logic test changes needed).

- [ ] **Step 5: Manual smoke-check (optional but recommended)**

Start the dev server: `bun dev` (root). Open the app, open a thread with the terminal drawer, open 2+ terminals via the existing split/new actions, then close the drawer. The top-bar `Open Terminal` button should now read `Open Terminal · 2` (or however many are open). With only 1 terminal, no badge.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/BranchToolbar.tsx apps/web/src/components/ChatView.tsx
git commit -m "Show open-terminal count beside the top-bar toggle"
```

---

### Task 3: Add `runningTerminalIds` prop to `ThreadTerminalDrawer` and forward it from `ChatView`

**Files:**
- Modify: `apps/web/src/components/ThreadTerminalDrawer.tsx` (add prop, destructure it, normalize)
- Modify: `apps/web/src/components/ChatView.tsx` (pass `runningTerminalIds`)

This task is a small prep step before the bigger drawer rewrite in Task 4 — it isolates the new data plumbing from the JSX restructure.

- [ ] **Step 1: Add the prop to `ThreadTerminalDrawerProps`**

In `apps/web/src/components/ThreadTerminalDrawer.tsx`, find this block (currently around lines 809-811 — the `terminalIds` line in the interface):

```ts
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
```

Replace with:

```ts
  terminalIds: string[];
  runningTerminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
```

Then find this block in the `ThreadTerminalDrawer` function signature (currently around lines 863-865):

```ts
  terminalIds,
  activeTerminalId,
  terminalGroups,
```

Replace with:

```ts
  terminalIds,
  runningTerminalIds,
  activeTerminalId,
  terminalGroups,
```

- [ ] **Step 2: Normalize `runningTerminalIds` against `normalizedTerminalIds`**

Right after the existing `normalizedTerminalIds` `useMemo` (currently lines 891-894), add:

```tsx
  const normalizedRunningTerminalIds = useMemo(() => {
    if (runningTerminalIds.length === 0) return [];
    const validIdSet = new Set(normalizedTerminalIds);
    return runningTerminalIds.filter((id) => validIdSet.has(id));
  }, [normalizedTerminalIds, runningTerminalIds]);
```

This ensures stale running IDs (e.g. for terminals that were just closed) don't drive the running indicator.

- [ ] **Step 3: Pass `runningTerminalIds` from `ChatView`**

In `apps/web/src/components/ChatView.tsx`, find the `<ThreadTerminalDrawer />` JSX (currently around line 587). Add a `runningTerminalIds` prop after `terminalIds={terminalState.terminalIds}` (line 595):

```tsx
        terminalIds={terminalState.terminalIds}
        runningTerminalIds={terminalState.runningTerminalIds}
        activeTerminalId={terminalState.activeTerminalId}
```

- [ ] **Step 4: Verify typecheck and tests**

Run: `bun typecheck`
Expected: clean.

Run: `bun run test apps/web/src/components/ThreadTerminalDrawer.test.ts`
Expected: all tests pass (the new prop isn't used yet; we're just plumbing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ThreadTerminalDrawer.tsx apps/web/src/components/ChatView.tsx
git commit -m "Plumb runningTerminalIds into ThreadTerminalDrawer"
```

---

### Task 4: Replace the right sidebar and floating overlay with a horizontal tab strip

**Files:**
- Modify: `apps/web/src/components/ThreadTerminalDrawer.tsx` (remove sidebar + overlay; add tab strip)

This is the main UI change. Treat it as one coherent rewrite of the drawer's render tree.

- [ ] **Step 1: Remove the floating top-right action overlay**

In `apps/web/src/components/ThreadTerminalDrawer.tsx`, delete the block that begins with `{!hasTerminalSidebar && (` (currently around line 1125) and ends with the matching `)}` (currently around line 1157). This block contains a `<div className="pointer-events-none absolute right-2 top-2 z-20">` with a Split / New / Close button cluster inside.

To verify you've identified the right block: it's the first place `!hasTerminalSidebar` is referenced in the file, and it sits between the resize handle (the `<div className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize" ...>`) and the `<div className="min-h-0 w-full flex-1">` content wrapper.

Reason: the actions move into the new tab strip (added in Step 3 below), so this overlay is redundant.

- [ ] **Step 2: Remove the right `<aside>` sidebar**

Delete the entire block currently at lines 1225-1348 (the second `<aside className="flex w-36 min-w-36 flex-col border border-border/70 bg-muted/10">` and everything inside it, including its closing `</aside>`).

Also delete the surrounding flex wrapper that exists only to host the sidebar. Replace the current outer structure:

```tsx
      <div className="min-h-0 w-full flex-1">
        <div className={`flex h-full min-h-0 ${hasTerminalSidebar ? "gap-1.5" : ""}`}>
          <div className="min-w-0 flex-1">
            {isSplitView ? ( ...split grid... ) : ( ...single viewport... )}
          </div>

          {hasTerminalSidebar && (
            <aside className="flex w-36 min-w-36 ..."> ... </aside>
          )}
        </div>
      </div>
```

with:

```tsx
      <div className="min-h-0 w-full flex-1">
        {isSplitView ? ( ...split grid... ) : ( ...single viewport... )}
      </div>
```

Keep the existing `isSplitView` branch logic and its inner `{visibleTerminalIds.map(...)}` / single-viewport JSX exactly as they are.

- [ ] **Step 3: Add the tab strip above the main content**

In the same file, immediately before the `<div className="min-h-0 w-full flex-1">` block from Step 2, insert this tab strip JSX:

```tsx
      <div
        role="tablist"
        aria-label="Terminals"
        className="flex h-7 shrink-0 items-stretch border-b border-border/70 bg-muted/10"
      >
        <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
          {resolvedTerminalGroups.map((group, groupIndex) => {
            const isActive = groupIndex === resolvedActiveGroupIndex;
            const isRunning = groupHasRunningTerminal(group, normalizedRunningTerminalIds);
            const label = resolveTabLabel(group, groupIndex + 1);
            const groupActiveTerminalId = group.terminalIds.includes(resolvedActiveTerminalId)
              ? resolvedActiveTerminalId
              : (group.terminalIds[0] ?? resolvedActiveTerminalId);
            const canCloseTab = resolvedTerminalGroups.length > 1;
            const closeTabLabel = `Close ${label}`;
            return (
              <div
                key={group.id}
                role="tab"
                aria-selected={isActive}
                className={`group flex shrink-0 items-center gap-1.5 border-r border-border/70 px-2 text-xs transition-colors ${
                  isActive
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 items-center gap-1.5"
                  onClick={() => onActiveTerminalChange(groupActiveTerminalId)}
                >
                  <TerminalSquare className="size-3 shrink-0" />
                  <span className="truncate">{label}</span>
                  {isRunning && (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-emerald-500"
                      aria-label="Running"
                    />
                  )}
                </button>
                {canCloseTab && (
                  <Popover>
                    <PopoverTrigger
                      openOnHover
                      render={
                        <button
                          type="button"
                          className="inline-flex size-3.5 items-center justify-center rounded text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation();
                            for (const terminalId of group.terminalIds) {
                              onCloseTerminal(terminalId);
                            }
                          }}
                          aria-label={closeTabLabel}
                        />
                      }
                    >
                      <XIcon className="size-2.5" />
                    </PopoverTrigger>
                    <PopoverPopup
                      tooltipStyle
                      side="bottom"
                      sideOffset={6}
                      align="center"
                      className="pointer-events-none select-none"
                    >
                      {closeTabLabel}
                    </PopoverPopup>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex shrink-0 items-stretch border-l border-border/70">
          <TerminalActionButton
            className={`inline-flex items-center px-2 text-foreground/90 transition-colors ${
              hasReachedSplitLimit
                ? "cursor-not-allowed opacity-45 hover:bg-transparent"
                : "hover:bg-accent/70"
            }`}
            onClick={onSplitTerminalAction}
            label={splitTerminalActionLabel}
          >
            <SquareSplitHorizontal className="size-3.25" />
          </TerminalActionButton>
          <TerminalActionButton
            className="inline-flex items-center border-l border-border/70 px-2 text-foreground/90 transition-colors hover:bg-accent/70"
            onClick={onNewTerminalAction}
            label={newTerminalActionLabel}
          >
            <Plus className="size-3.25" />
          </TerminalActionButton>
          <TerminalActionButton
            className="inline-flex items-center border-l border-border/70 px-2 text-foreground/90 transition-colors hover:bg-accent/70"
            onClick={() => onCloseTerminal(resolvedActiveTerminalId)}
            label={closeTerminalActionLabel}
          >
            <Trash2 className="size-3.25" />
          </TerminalActionButton>
        </div>
      </div>
```

- [ ] **Step 4: Remove now-unused values**

`hasTerminalSidebar` is no longer referenced. Delete its declaration (currently around line 978):

```tsx
  const hasTerminalSidebar = normalizedTerminalIds.length > 1;
```

`showGroupHeaders` was only used inside the deleted sidebar. Delete its declaration (currently around lines 980-982):

```tsx
  const showGroupHeaders =
    resolvedTerminalGroups.length > 1 ||
    resolvedTerminalGroups.some((terminalGroup) => terminalGroup.terminalIds.length > 1);
```

Keep `terminalLabelById`, `splitTerminalActionLabel`, `newTerminalActionLabel`, `closeTerminalActionLabel`, `onSplitTerminalAction`, `onNewTerminalAction`, `hasReachedSplitLimit`, `resolvedActiveGroupIndex`, `visibleTerminalIds`, `isSplitView` — these are still used.

- [ ] **Step 5: Verify typecheck**

Run: `bun typecheck`
Expected: clean. If TypeScript flags removed identifiers, double-check Step 4 and re-run.

- [ ] **Step 6: Verify tests**

Run: `bun run test apps/web/src/components/ThreadTerminalDrawer.test.ts`
Expected: all tests still pass.

- [ ] **Step 7: Manual smoke-check**

Start the dev server: `bun dev` (root). Verify in the browser:

1. **Single terminal** — open the drawer with one terminal. Tab strip shows one tab labeled `Terminal 1` (no close button on the tab — only one group). Action cluster on the right has Split, New, Close buttons. The viewport takes the full drawer width (no right sidebar).
2. **Multiple terminals** — click `+` to create a second terminal. Tab strip now shows two tabs (`Terminal 1`, `Terminal 2`). Hovering over the inactive tab reveals an `×` close button. Clicking a tab switches the viewport to that terminal.
3. **Split** — focus a tab, click `Split`. The active group becomes a "Split N" tab; viewport renders both terminals side-by-side. Click `Close` (action cluster trash icon) to close just the focused terminal in the split (the other one stays).
4. **Running indicator** — start a long-running command (e.g. `sleep 30`) in a terminal. Switch to a different tab. The originating tab now shows a small green dot. When the process exits, the dot disappears.
5. **Top bar count** — close the drawer with 2+ terminals still open. The top bar reads `Open Terminal · N`. Open the drawer; reads `Close Terminal · N`. With only 1 terminal, no badge.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/ThreadTerminalDrawer.tsx
git commit -m "Replace terminal drawer sidebar with horizontal tab strip"
```

---

### Task 5: Final verification

**Files:** none changed in this task — verification only.

- [ ] **Step 1: Run all required checks per `AGENTS.md`**

Run each in order:

```bash
bun fmt
bun lint
bun typecheck
bun run test
```

Expected: every command exits 0. If `bun fmt` rewrites files, stage them.

- [ ] **Step 2: If `bun fmt` made changes, commit them**

```bash
git status
# If files changed:
git add -u
git commit -m "Apply bun fmt"
```

If nothing changed, skip.

- [ ] **Step 3: Final smoke-check via the running app**

If the dev server isn't already running: `bun dev`. Re-walk the five scenarios from Task 4 / Step 7 once more to confirm nothing regressed after `bun fmt`.

- [ ] **Step 4: Done**

The branch `feature/terminal-tabs` is ready for PR review.
