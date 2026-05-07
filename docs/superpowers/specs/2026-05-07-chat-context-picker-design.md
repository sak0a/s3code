# Chat Context Picker — Issues, PRs, and File Attachments

## Goal

Give users a first-class way to attach external context to a chat turn before
sending it: GitHub / GitLab / Bitbucket / Azure DevOps **issues** and
**pull requests / merge requests / work items**, plus image files. The picker
opens from a button in the composer footer and is also reachable via a `#`
keyboard trigger. Picked items become structured context that is fetched
server-side and forwarded to the agent alongside the user's prompt.

The product reference is `chat-preview.png` at the repo root: a popup titled
**"Add context"** with provider tabs (`GH Issues`, `GH PRs`, …), a search
input, and a list of items. The paperclip in the popup's top-right opens a
file picker for images.

## Non-goals

- **Linear and Sentry integrations.** The reference screenshot shows tabs for
  these; they are out of scope for v1 (no existing integration in S3Code).
  The tab strip is built to accept new providers later.
- **Cross-repo browsing UI.** v1 fetches items from the workspace's resolved
  source-control remote. Pasted URLs from other repos are still resolved
  (single fetch via the provider CLI), but there is no remote-picker UI.
- **Server-side caching of issue/PR data.** Caching lives in the web client
  via TanStack Query (already in use). A server-side cache can be added later
  if telemetry shows redundant calls.
- **New auth flows.** The feature relies on the existing CLI auth model
  (`gh auth login`, `glab auth login`, etc.) and surfaces install/auth
  instructions inline when a CLI is missing or unauthenticated.
- **Unsupported source-control hosts** (self-hosted Gitea, Forgejo, etc.).
  Provider tabs are hidden when no supported provider matches the remote.

## Scope

In scope:

- Server: extend `SourceControlProvider` with `listIssues`, `getIssue`,
  `searchIssues`, `searchChangeRequests`. Extend per-provider implementations
  (`GitHubSourceControlProvider`, `GitLabSourceControlProvider`,
  `BitbucketSourceControlProvider`, `AzureDevOpsSourceControlProvider`) and
  their CLI/API wrappers.
- Server: extend `getChangeRequest` return type to include `body` and recent
  `comments` so PRs match issues' detail shape.
- Contracts: add `SourceControlIssueSummary`, `SourceControlIssueDetail`,
  `SourceControlChangeRequestDetail`, and a new draft-context type
  `ComposerSourceControlContext`. Extend the turn payload schema to carry
  these contexts alongside images and terminal contexts.
- Web: new components for the picker popup, picker tabs, picker list,
  attached-context chip, and the composer footer button. Extend
  `ChatComposer.tsx` to render them. Extend `composerDraftStore.ts` to
  persist attached source-control contexts per thread draft. Register a
  new `#` trigger in `composer-logic.ts` and `ComposerCommandMenu.tsx`.
- Tests: unit tests for new decoders, CLI wrappers, providers, registry
  dispatch, client-side search, draft-store dedupe and clear-on-send,
  trigger detection, and a browser test for the popup flow.

Out of scope:

- Persisting fetched issue/PR detail across server restarts. The detail lives
  only in the local draft and is re-fetched when stale on send.
- Streaming partial issue/PR content. Each fetch is a single CLI/API call.
- Allowing the user to edit the embedded body before sending.

## User flow

```
┌──────────────────────────── Composer ────────────────────────────┐
│  [chip: terminal-ctx] [chip: #42 issue] [chip: PR-12] [chip: img]│
│  [textarea]                                                       │
│  [⏎ Send] · ... · [📎 Add context ▾]                             │
└───────────────────────────────────────────────────────────────────┘

Click [📎 Add context ▾]:

┌─────────────────────────── Add context popup ────────────────────┐
│  Add context  [provider icons]                          [✨][📎] │
│  🔍 Search issues...                                              │
│  [GH Issues 6] [GH PRs 2]                                         │
│  ────────────────────────────────────────────────────────────── │
│  #42  Remove stale todos_manager.html …          14.3.2026 ▸    │
│  #41  remote-install.sh shows wrong port …       14.3.2026 ▸    │
│   …                                                               │
└───────────────────────────────────────────────────────────────────┘
```

1. User clicks the 📎 button in the composer footer (or types `#` in the
   textarea). The popup opens with the cached top items for the active
   provider tab.
2. User types into the search input. Client-side fuzzy filter runs
   immediately. If the filter returns zero results, the popup falls through
   to a debounced server search (`gh issue list --search`, etc.).
3. User clicks an item. The popup closes; a chip is added to the composer
   above the textarea. The chip shows the issue/PR reference and title.
4. User can click the chip to expand a preview, or click the X to remove it.
5. The 📎 in the popup's top-right opens a native file picker for images.
   Selected images flow through the existing `ComposerImageAttachment`
   pipeline. Drag-and-drop into the popup body uses the same path.
6. On send, all attached `sourceControlContexts` are serialized into the
   turn payload, then cleared from the draft (same lifecycle as image
   attachments and terminal contexts today).

## Architecture

Three layers, each independently testable:

1. **Server source-control layer** — extended `SourceControlProvider`
   interface, per-provider implementations, JSON decoders. Talks to local
   CLIs (`gh`, `glab`, `az`) or REST (`bitbucket`).
2. **Contracts** — schemas and TypeScript types shared between server and
   web.
3. **Web composer layer** — popup + chip components, draft-store extension,
   keyboard trigger, command-menu integration, turn-payload serialization.

### Data flow on attach

```
User clicks item in popup
  → web: composerDraftStore.addSourceControlContext(reference)
  → web: TanStack Query fetch SourceControlIssueDetail (or change request)
  → ws → server: sourceControl.getIssue / sourceControl.getChangeRequest
  → server: SourceControlProviderRegistry.resolve(cwd) → provider.getIssue
  → provider: gh issue view <ref> --json … (or REST equivalent)
  → server: decode + truncate body/comments → response
  → web: store detail in draft, render chip
```

### Data flow on send

```
User presses ⏎
  → web: serialize draft.sourceControlContexts into turn payload
  → web: if any context.staleAfter < now, refetch in parallel (best-effort)
  → ws → server: sendTurn({ prompt, images, terminalContexts, sourceControlContexts })
  → server: pass through to provider adapter (Codex / Claude / OpenCode)
  → web: clear draft.sourceControlContexts on turn-accepted ack
```

## Contracts

### `packages/contracts/src/sourceControl.ts` (new types)

```ts
export const SourceControlIssueState = Schema.Literal("open", "closed");

export const SourceControlIssueSummary = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: SourceControlIssueState,
  author: Schema.optional(Schema.String),
  updatedAt: Schema.optional(Schema.DateTimeUtcFromString),
  labels: Schema.optional(Schema.Array(Schema.String)),
});

export const SourceControlIssueComment = Schema.Struct({
  author: Schema.String,
  body: Schema.String, // body cap enforced server-side, not in schema
  createdAt: Schema.DateTimeUtcFromString,
});

export const SourceControlIssueDetail = Schema.Struct({
  ...SourceControlIssueSummary.fields,
  body: Schema.String,
  comments: Schema.Array(SourceControlIssueComment),
  truncated: Schema.Boolean,
});

export const SourceControlChangeRequestDetail = Schema.Struct({
  ...ChangeRequestSummary.fields,
  body: Schema.String,
  comments: Schema.Array(SourceControlIssueComment),
  state: Schema.Literal("open", "closed", "merged"),
  truncated: Schema.Boolean,
});
```

### `ComposerSourceControlContext` (turn-payload addition)

```ts
export const ComposerSourceControlContextKind = Schema.Literal("issue", "change-request");

export const ComposerSourceControlContext = Schema.Struct({
  id: TrimmedNonEmptyString, // local UUID
  kind: ComposerSourceControlContextKind,
  provider: SourceControlProviderKind,
  reference: TrimmedNonEmptyString, // 'owner/repo#42' or full URL
  detail: Schema.Union(SourceControlIssueDetail, SourceControlChangeRequestDetail),
  fetchedAt: Schema.DateTimeUtcFromString,
  staleAfter: Schema.DateTimeUtcFromString, // fetchedAt + 5 min
});
```

The existing send-turn schema (`PROVIDER_SEND_TURN_*` in
`packages/contracts/src/provider.ts`) gains an optional
`sourceControlContexts: ReadonlyArray<ComposerSourceControlContext>` field
alongside the existing `attachments` (images) and terminal contexts.

### Token-budget caps (server-enforced before response)

| Field          | Cap                | When exceeded                               |
| -------------- | ------------------ | ------------------------------------------- |
| `body`         | 8 KB               | Truncate, set `truncated: true`             |
| `comments`     | last 5 most recent | Drop older, set `truncated: true`           |
| `comment.body` | 2 KB               | Truncate per-comment, set `truncated: true` |

Caps live in a single shared module (`packages/contracts/src/sourceControl.ts`)
so server and tests reference the same constants.

## Server changes

### `apps/server/src/sourceControl/SourceControlProvider.ts`

Extend `SourceControlProviderShape` with three new methods:

```ts
listIssues(input: {
  cwd: string;
  context?: SourceControlProviderContext;
  state: "open" | "closed" | "all";
  limit?: number;
}): Effect.Effect<ReadonlyArray<SourceControlIssueSummary>, SourceControlProviderError>;

getIssue(input: {
  cwd: string;
  context?: SourceControlProviderContext;
  reference: string;          // '#42' | URL | 'owner/repo#42'
}): Effect.Effect<SourceControlIssueDetail, SourceControlProviderError>;

searchIssues(input: {
  cwd: string;
  context?: SourceControlProviderContext;
  query: string;
  limit?: number;
}): Effect.Effect<ReadonlyArray<SourceControlIssueSummary>, SourceControlProviderError>;
```

And a parallel `searchChangeRequests` matching the shape above.

Existing `getChangeRequest` is upgraded — its return type becomes
`SourceControlChangeRequestDetail` (adds `body`, `comments`, `truncated`).
Callers that only used `number/title/url/state` still work since those fields
remain.

### Per-provider implementations

| File                | New method invocations                                                                                                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GitHubCli.ts`      | `gh issue list --json …`, `gh issue view <ref> --json …`, `gh issue list --search "<q>"`, `gh pr list --search "<q>" --json …`, `gh issue view <url>` for cross-repo paste; `gh pr view --json` extended with `body,comments` for new detail shape |
| `GitLabCli.ts`      | `glab issue list/view`, `glab issue list --search`, `glab mr list --search`, `glab mr view --comments`                                                                                                                                             |
| `BitbucketApi.ts`   | `GET /repositories/{w}/{r}/issues`, `GET /issues/{id}`, `GET /issues?q=…`, `GET /pullrequests?q=…`                                                                                                                                                 |
| `AzureDevOpsCli.ts` | `az boards work-item list/show`, `az boards query` for search, `az repos pr list` extended with detail                                                                                                                                             |

New decoder modules (one per provider) following `gitHubPullRequests.ts`:

- `apps/server/src/sourceControl/gitHubIssues.ts`
- `apps/server/src/sourceControl/gitLabIssues.ts`
- `apps/server/src/sourceControl/bitbucketIssues.ts`
- `apps/server/src/sourceControl/azureDevOpsWorkItems.ts`

The `SourceControlProviderRegistry` already dispatches by detected remote;
the new methods route the same way. No registry changes needed beyond
adding the methods to the dispatch table.

### WebSocket surface

Extend the existing `NativeApi` in `apps/server/src/wsServer.ts` with:

- `sourceControl.listIssues`
- `sourceControl.getIssue`
- `sourceControl.searchIssues`
- `sourceControl.searchChangeRequests`

The existing `sourceControl.listChangeRequests` and `sourceControl.getChangeRequest`
get their return types updated to the new detail shape (no name change).

### Cross-repo URL paste

When `getIssue` / `getChangeRequest` receives a `reference` that parses as a
URL, the provider runs the corresponding view command directly with that
URL (`gh issue view <url>`, `gh pr view <url>`). The CLI handles cross-repo
resolution natively. No additional code path needed.

If parsing produces neither a number nor a URL, the provider returns a
typed `SourceControlProviderError` with `kind: "invalid-reference"`.

### Failure-mode normalization

Reuses the existing per-provider error-normalization functions
(`normalizeGitHubCliError`, etc.). New error reasons added:

- `kind: "issue-not-found"` — analogous to existing `pull-request-not-found`.
- `kind: "search-empty"` — server search returned zero results (informational,
  not a hard error; the popup uses this to render the empty state).

## Web changes

### New components (under `apps/web/src/components/chat/`)

| File                           | Role                                                                                                                                                                                                                                                 |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContextPickerButton.tsx`      | The 📎 button in composer footer; opens the popup. Always enabled — when no source-control remote is detected, the popup still serves file/image attach.                                                                                             |
| `ContextPickerPopup.tsx`       | The full popup: header with provider icons, search input, tab strip, list. Uses Base UI `Popover`.                                                                                                                                                   |
| `ContextPickerTabs.tsx`        | Tab strip; tabs are derived from detected providers and which kinds (`Issues`, `PRs/MRs`) the provider supports.                                                                                                                                     |
| `ContextPickerList.tsx`        | Virtualized list rendering `SourceControlIssueSummary` rows. Reuses the visual pattern from `ModelPickerContent.tsx`.                                                                                                                                |
| `SourceControlContextChip.tsx` | The chip rendered in the composer once an item is attached. Displays provider-glyph + reference (`#42` for same-repo, `owner/repo#9` for cross-repo) + truncated title; click → expand preview, X → remove. Mirrors `TerminalContextInlineChip.tsx`. |

### Modified files

| File                       | Change                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChatComposer.tsx`         | Render `<ContextPickerButton>` next to the existing footer controls. Render the new chip row alongside existing pending-context chips.                                                                                                             |
| `composerDraftStore.ts`    | Extend `ComposerThreadDraft` with `sourceControlContexts: ComposerSourceControlContext[]`. Add `addSourceControlContext`, `removeSourceControlContext`, `clearSourceControlContexts` actions. Persist via the same lifecycle as image attachments. |
| `ComposerPromptEditor.tsx` | Register `#` trigger (parallel to existing `@` for paths).                                                                                                                                                                                         |
| `composer-logic.ts`        | Add `'source-control'` to `ComposerTriggerKind`. Matcher recognizes `#42`, `#bug …`, `#https://…/issues/9`.                                                                                                                                        |
| `ComposerCommandMenu.tsx`  | Add new item types `'source-control-issue'` and `'source-control-pr'` with provider-specific icons.                                                                                                                                                |
| `ChatView.logic.ts`        | When building the turn payload, include `draft.sourceControlContexts`.                                                                                                                                                                             |

### Caching strategy

Client-side via TanStack Query (already used in the codebase, e.g.
`projectSearchEntriesQueryOptions`). Two query keys:

- `["sourceControl", "list", cwd, providerKind, kind, state]` — `staleTime: 60_000`.
- `["sourceControl", "detail", cwd, providerKind, kind, reference]` — `staleTime: 300_000`.

Search queries use `["sourceControl", "search", cwd, providerKind, kind, query]`
with `staleTime: 30_000` and a 200ms debounce on the input.

### `#` keyboard trigger UX

| Input             | Behavior                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `#`               | Opens inline command menu with cached top-N issues for active provider.                            |
| `#42` + Tab/Enter | Direct-attach issue or PR with that number (whichever resolves; issues preferred when both exist). |
| `#bug ` (text)    | Filters cached list, falls through to server search after 2+ chars.                                |
| `#https://…`      | Recognized as URL → fetch and attach via `getIssue`/`getChangeRequest`.                            |
| `#` mid-word      | Not a trigger (matches existing `@` mid-word behavior).                                            |

## Behavior

### Picker open

| State                                      | UI                                                                                                                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace has no git remote                | Button stays enabled. Popup opens with source-control tabs hidden and a single line: "No source-control remote detected." File/image attach via the popup's 📎 still works. |
| Remote on unsupported host                 | Same as above, line reads: "Unsupported source-control host: <host>."                                                                                                       |
| Provider matched, CLI installed and authed | Tabs render; cached list shows immediately.                                                                                                                                 |
| Provider matched, CLI not installed        | Tab body shows "`gh` is required. Install: `brew install gh`" (or platform-appropriate command), with copy-button.                                                          |
| Provider matched, CLI not authed           | Tab body shows "Run `gh auth login` to load issues" with copy-button.                                                                                                       |

### Search

- Empty input → cached top items.
- Typed input, ≥2 chars → client-side fuzzy filter runs first.
- Zero client matches AND ≥2 chars → debounced server search call.
- Server returns zero results → "No matching issues" empty state.
- Server errors → toast with the normalized error message; cached list still
  visible.

### Attach

- Item clicked → popup closes → chip appears above textarea.
- Detail fetch happens via TanStack Query; chip shows a small spinner until
  the detail resolves.
- If detail fetch fails, chip turns into an error state with X to dismiss
  and a "retry" affordance.
- Duplicate attach (`provider:owner/repo#number` already in draft) →
  no-op + brief toast "Already attached".

### Send

- Draft has source-control contexts → serialize into turn payload.
- Any context with `staleAfter < now` → refetch in parallel before send;
  if refetch fails, send the cached copy.
- After server acks `turn-accepted`, draft contexts are cleared (same as
  images, terminal contexts).

### Persistence

- Source-control contexts persist with the per-thread draft (same store as
  image attachments).
- Survive page reload, browser tab switches, thread switches.
- Are NOT persisted across server restarts that drop the draft store. This
  matches today's behavior for image attachments.

## Edge cases

| Case                                     | Handling                                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Workspace has no git remote              | Source-control tabs hidden; file/image attach still works. Button never becomes disabled.                                     |
| Multiple remotes (`origin` + `upstream`) | Resolve `origin` first; fall through to next remote if `origin` is unsupported. No remote-picker UI in v1.                    |
| Pasted URL from a different repo         | Allowed. Resolved via `gh issue view <url>` / `gh pr view <url>`. Chip shows cross-repo reference (`owner/repo#9`).           |
| Pasted URL the CLI can't resolve         | Chip never created; toast: "Couldn't fetch <url>: <reason>".                                                                  |
| CLI not installed                        | Tab body shows install instructions for that provider.                                                                        |
| CLI not authenticated                    | Tab body shows the auth-command with copy-to-clipboard.                                                                       |
| Token-budget overflow                    | Truncated server-side per the caps in **Contracts**; chip displays a small "truncated" badge.                                 |
| Stale chip on send                       | Refetch in background; on failure, send cached + a one-line "context may be stale, last fetched <time>" note in the payload.  |
| Same item attached twice                 | Deduplicate by `provider:owner/repo#number`; second attach is a no-op + toast.                                                |
| Thread switch mid-popup                  | Popup closes; half-typed search discarded. Already-attached chips persist with their thread's draft.                          |
| Sending the turn                         | All attached source-control contexts cleared from the draft on `turn-accepted` ack.                                           |
| Offline / WS disconnected                | Tab bodies show "Reconnecting…"; no fetches dispatched. Already-attached chips remain visible and send normally on reconnect. |

## Testing

Vitest, browser-mode for components, `*.test.ts` colocated with source.

### Server / unit

| File                                                     | Coverage                                                                                                                            |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `gitHubIssues.test.ts` (new; siblings for GL/BB/AZ)      | JSON decoder round-trip + malformed-input rejection, mirroring `gitHubPullRequests.test.ts`.                                        |
| `GitHubCli.test.ts` (extend; siblings for GL/BB/AZ)      | New CLI invocations: correct `args`, correct error normalization for missing-CLI / unauthenticated / not-found / invalid-reference. |
| `GitHubSourceControlProvider.test.ts` (extend; siblings) | `listIssues`, `getIssue`, `searchIssues`, `searchChangeRequests` against fake CLIs. Truncation caps applied.                        |
| `SourceControlProviderRegistry.test.ts` (extend)         | Dispatch by remote → correct provider for new methods.                                                                              |

### Web / unit + browser

| File                                               | Coverage                                                                                                   |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `composerSourceControlContextSearch.test.ts` (new) | Client-side filter ranking; "no client match → server fallback" trigger.                                   |
| `composer-logic.test.ts` (extend)                  | `#42`, `#bug `, `#https://…/issues/9` trigger detection and replacement-range math.                        |
| `ContextPickerPopup.browser.tsx` (new)             | Tab switching, search debounce, item selection attaches a chip, empty-state messaging per provider state.  |
| `SourceControlContextChip.test.tsx` (new)          | Renders title + reference, click expands preview, X removes from draft store.                              |
| `composerDraftStore.test.tsx` (extend)             | Draft persists `sourceControlContexts`, dedupe rule, clear-on-send semantics.                              |
| `ChatComposer.tsx` browser flow (extend)           | `#` trigger surfaces command menu; popup open + select cycle; chip survives thread reload, clears on send. |

### End-to-end smoke (manual checklist)

- Open S3Code in a GitHub repo, click 📎, see issues, attach one, send,
  verify the agent receives the structured context.
- Same in a GitLab and Bitbucket repo (and Azure DevOps if available).
- Workspace with no remote → button disabled, file-attach still works.
- `gh` not installed → tab shows install hint with copy-button.
- `gh` not authenticated → tab shows auth-command with copy-button.

### Performance budget

| Surface                                 | Target                                                     |
| --------------------------------------- | ---------------------------------------------------------- |
| Popup open → first paint of cached list | ≤ 50 ms (no network)                                       |
| Cold list fetch via CLI                 | ≤ 2 s p95 (existing `VcsProcess` timeout already enforces) |
| Full issue/PR fetch                     | ≤ 3 s p95                                                  |

## Pre-merge gate

Per `AGENTS.md`: `bun fmt`, `bun lint`, `bun typecheck`, and `bun run test`
must all pass before the work is considered complete.
