# File Preview on Draft Threads

## Goal

The file preview / file browser panel is currently disabled on threads that haven't been promoted to a server thread (drafts). The button is greyed out with the tooltip *"File preview is only available on server threads with an active project."* Make it available on draft threads too, so users can browse the project's working tree before sending the first turn.

## Scope

In scope:

- `apps/web/src/components/ChatView.tsx` — drop `isServerThread` from the `previewAvailable` gate and from `onTogglePreview`'s early-return.
- `apps/web/src/components/PreviewPanel.tsx` — when no server thread is in the main store for the current route, fall back to the draft store via `useComposerDraftStore.getDraftThreadByRef` and use the draft's `environmentId` / `projectId` / `worktreePath` instead.
- `apps/web/src/routes/_chat.draft.$draftId.tsx` — mount the right panel (sidebar inline + sheet) and wire `validateSearch` + `retainSearchParams` for `diff` / `preview`, mirroring `_chat.$environmentId.$threadId.tsx`.
- `apps/web/src/components/PreviewPanel.browser.tsx` — extend with a draft-thread case.

Out of scope:

- The diff panel button. Diffs are derived from turn diff summaries; drafts have no turns. The diff toggle stays gated by `isGitRepo` only (its existing UI gate).
- Pre-fetching project files before the user opens the preview. The existing `enabled: previewSearch.preview === "1"` gate stays.
- Persisting per-draft preview state — drafts and their server-thread promotion already share the same `threadId`; the existing `chat_preview_tree_width` localStorage key continues to work.

## Behavior

After the change:

| Thread state                                              | Preview button | Panel renders |
| --------------------------------------------------------- | -------------- | ------------- |
| Server thread with active project                         | enabled        | yes           |
| Server thread without active project                      | disabled       | n/a           |
| Draft on server URL (`/$envId/$threadId`)                 | **enabled**    | **yes**       |
| Pure draft URL (`/draft/$draftId`)                        | **enabled**    | **yes**       |
| No active thread                                          | disabled       | n/a           |

The preview UI itself doesn't change. For a draft, `activeCwd` resolves to `activeProject.cwd` (since drafts have no `worktreePath` until promoted), and `turnDiffSummaries` is empty so the refresh-on-new-turn effects no-op until a turn lands.

## Implementation notes

### `PreviewPanel.tsx`

The component currently does:

```ts
const activeThread = useStore(
  useMemo(() => createThreadSelectorByRef(routeThreadRef), [routeThreadRef]),
);
```

Change to: try the server store first, then fall back to the draft store. The shape of `DraftThreadState` already provides `threadId`, `environmentId`, `projectId`, `worktreePath`. Surface a single `activeThread`-shaped object the rest of the component can use, with `turnDiffSummaries` defaulting to `[]` for drafts.

`activeThread.id` reads in two places (`useEffect` reset key, and the file-tree refresh-key memo); for drafts use `threadId`.

### `ChatView.tsx`

Two single-line gate removals:

- L3577: `previewAvailable={isServerThread && activeProject !== undefined}` → `previewAvailable={activeProject !== undefined}`
- L1733: `if (!isServerThread || !activeProject) { return; }` → `if (!activeProject) { return; }`

`activeProject` is already resolved from `activeThread.projectId` regardless of server/draft, so this is sufficient.

### Draft route

`_chat.draft.$draftId.tsx` currently renders only `<ChatView/>`. Add the same scaffolding the server route uses: `RightPanelInlineSidebar` / `RightPanelSheet`, the `useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY)` switch, and the `closeRightPanel` / `openDiff` / `openPreview` callbacks. The route's `validateSearch` should call `parseRightPanelRouteSearch` and `retainSearchParams` should retain `["diff", "preview"]`.

The `LazyRightPanel`, `RightPanelInlineSidebar`, and helper `closeRightPanelSearch` in `_chat.$environmentId.$threadId.tsx` are not reusable as-is (they're inside a closure). To avoid duplicating ~100 lines, extract them into a small new module (e.g. `apps/web/src/components/ChatRightPanel.tsx`) and import from both routes.

### Tests

Add a browser test in `PreviewPanel.browser.tsx` that:

1. Mocks `createThreadSelectorByRef` to return `undefined` (no server thread).
2. Mocks `useComposerDraftStore` to return a `DraftThreadState`.
3. Asserts that the file-tree entries render and clicking a file shows the preview.

This covers the new fallback path. The existing tests still cover the server-thread path.

## Risks

- The shared scaffolding extraction is the largest mechanical change. Done as a straight file move (not a behavior change), so the existing server-route test stays green.
- `useComposerDraftStore` selector inside `PreviewPanel` adds a new subscription. Drafts are small and rarely change; perf impact is negligible.
- Once a draft promotes to a server thread (mid-session), the server store wins and the panel transparently switches. No re-mount needed because the `routeThreadRef` is stable across the transition.
