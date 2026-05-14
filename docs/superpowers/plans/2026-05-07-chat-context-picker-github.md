# Chat Context Picker (GitHub Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working "Add context" picker on the chat composer that lets users attach GitHub issues and PRs (with body + recent comments) and image files to a turn. End-to-end vertical slice for GitHub only — other Git providers come in a follow-up plan.

**Architecture:** Three layers. (1) Server: extend `SourceControlProvider` with issue support and add a richer detail shape for change requests; expose via WebSocket. (2) Contracts: new schemas for issue summaries / details / draft contexts; extend the send-turn payload. (3) Web: new popover + chip components, draft-store extension, `#` keyboard trigger, and turn serialization. Other providers (GitLab, Bitbucket, Azure DevOps) get stub implementations that return a typed "not-implemented" error — Plan 2 fills them in.

**Tech Stack:** TypeScript, Effect, Effect Schema, Vitest (Node + browser mode), React + Base UI, TanStack Query, Bun monorepo, GitHub CLI (`gh`).

**Reference spec:** `docs/superpowers/specs/2026-05-07-chat-context-picker-design.md`.

**Pre-merge gate (run before claiming completion):** `bun fmt && bun lint && bun typecheck && bun run test`.

---

## File Structure (preview)

| Path                                                                      | Status | Responsibility                                                                                                      |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts/src/sourceControl.ts`                                 | modify | Add issue + detail + composer-context schemas + token caps.                                                         |
| `packages/contracts/src/provider.ts`                                      | modify | Extend `ProviderSendTurnInput` with `sourceControlContexts`.                                                        |
| `apps/server/src/sourceControl/gitHubIssues.ts`                           | create | `gh` JSON decoders for issue list/detail.                                                                           |
| `apps/server/src/sourceControl/gitHubIssues.test.ts`                      | create | Decoder unit tests.                                                                                                 |
| `apps/server/src/sourceControl/GitHubCli.ts`                              | modify | Add `listIssues`, `getIssue`, `searchIssues`, `searchPullRequests`, extend `getPullRequest` to fetch body+comments. |
| `apps/server/src/sourceControl/GitHubCli.test.ts`                         | modify | Unit tests for new CLI invocations + error normalization.                                                           |
| `apps/server/src/sourceControl/SourceControlProvider.ts`                  | modify | Extend `SourceControlProviderShape` with new methods.                                                               |
| `apps/server/src/sourceControl/GitHubSourceControlProvider.ts`            | modify | Wire new methods to `GitHubCli`.                                                                                    |
| `apps/server/src/sourceControl/GitHubSourceControlProvider.test.ts`       | modify | Provider-level tests for new methods.                                                                               |
| `apps/server/src/sourceControl/GitLabSourceControlProvider.ts`            | modify | Stub new methods → `unsupported`.                                                                                   |
| `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`         | modify | Stub new methods → `unsupported`.                                                                                   |
| `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts`       | modify | Stub new methods → `unsupported`.                                                                                   |
| `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`          | modify | Dispatch new methods + extend `unsupported` fallback.                                                               |
| `apps/server/src/sourceControl/SourceControlProviderRegistry.test.ts`     | modify | Dispatch tests for new methods.                                                                                     |
| `apps/server/src/wsServer.ts`                                             | modify | Add WS routes for new operations.                                                                                   |
| `apps/web/src/composerDraftStore.ts`                                      | modify | Add `sourceControlContexts` slice + actions.                                                                        |
| `apps/web/src/composerDraftStore.test.tsx`                                | modify | Tests for new slice + dedupe + clear-on-send.                                                                       |
| `apps/web/src/composer-logic.ts`                                          | modify | `#` trigger detection (`detectComposerTrigger`).                                                                    |
| `apps/web/src/composer-logic.test.ts`                                     | modify | Tests for `#` trigger detection.                                                                                    |
| `apps/web/src/components/chat/ContextPickerList.tsx`                      | create | Virtualized list of issue/PR summaries.                                                                             |
| `apps/web/src/components/chat/ContextPickerTabs.tsx`                      | create | Tab strip (`GH Issues`, `GH PRs`).                                                                                  |
| `apps/web/src/components/chat/ContextPickerPopup.tsx`                     | create | Popover content (search + tabs + list + paperclip).                                                                 |
| `apps/web/src/components/chat/ContextPickerButton.tsx`                    | create | Composer-footer button.                                                                                             |
| `apps/web/src/components/chat/SourceControlContextChip.tsx`               | create | Chip rendered in composer above textarea.                                                                           |
| `apps/web/src/components/chat/SourceControlContextChip.test.tsx`          | create | Chip render + dismiss tests.                                                                                        |
| `apps/web/src/components/chat/ContextPickerPopup.browser.tsx`             | create | Browser test for popup flow.                                                                                        |
| `apps/web/src/components/chat/composerSourceControlContextSearch.ts`      | create | Client-side fuzzy filter for cached lists.                                                                          |
| `apps/web/src/components/chat/composerSourceControlContextSearch.test.ts` | create | Filter ranking tests.                                                                                               |
| `apps/web/src/components/chat/ComposerCommandMenu.tsx`                    | modify | New item types `source-control-issue` / `source-control-pr`.                                                        |
| `apps/web/src/components/chat/ChatComposer.tsx`                           | modify | Render button, chip row, wire `#` trigger to command menu.                                                          |
| `apps/web/src/components/ChatView.logic.ts`                               | modify | Serialize `sourceControlContexts` into turn payload.                                                                |
| `apps/web/src/lib/sourceControlContextRpc.ts`                             | create | Thin TanStack Query helpers for the new WS routes.                                                                  |

---

## Phase 0 — Contracts

### Task 1: Token-budget caps + issue summary/detail schemas

**Files:**

- Modify: `packages/contracts/src/sourceControl.ts`

- [ ] **Step 1: Add token-budget constants and issue schemas**

Append after the existing `ChangeRequest` schema:

```ts
// Token-budget caps. Server enforces these before responding so the web client
// always receives bounded payloads. Keep these here so server, web, and tests
// reference the same constants.
export const SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES = 8 * 1024; // 8 KB
export const SOURCE_CONTROL_DETAIL_COMMENT_BODY_MAX_BYTES = 2 * 1024; // 2 KB
export const SOURCE_CONTROL_DETAIL_MAX_COMMENTS = 5;

export const SourceControlIssueState = Schema.Literals(["open", "closed"]);
export type SourceControlIssueState = typeof SourceControlIssueState.Type;

export const SourceControlIssueSummary = Schema.Struct({
  provider: SourceControlProviderKind,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: SourceControlIssueState,
  author: Schema.optional(TrimmedNonEmptyString),
  updatedAt: Schema.Option(Schema.DateTimeUtc),
  labels: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type SourceControlIssueSummary = typeof SourceControlIssueSummary.Type;

export const SourceControlIssueComment = Schema.Struct({
  author: Schema.String,
  body: Schema.String,
  createdAt: Schema.DateTimeUtc,
});
export type SourceControlIssueComment = typeof SourceControlIssueComment.Type;

export const SourceControlIssueDetail = Schema.Struct({
  ...SourceControlIssueSummary.fields,
  body: Schema.String,
  comments: Schema.Array(SourceControlIssueComment),
  truncated: Schema.Boolean,
});
export type SourceControlIssueDetail = typeof SourceControlIssueDetail.Type;

export const SourceControlChangeRequestDetail = Schema.Struct({
  ...ChangeRequest.fields,
  body: Schema.String,
  comments: Schema.Array(SourceControlIssueComment),
  truncated: Schema.Boolean,
});
export type SourceControlChangeRequestDetail = typeof SourceControlChangeRequestDetail.Type;
```

- [ ] **Step 2: Verify types compile**

Run: `cd /Users/laurinfrank/Library/CloudStorage/Dropbox/Code/ryco && bun typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/sourceControl.ts
git commit -m "contracts: add source-control issue + detail schemas"
```

---

### Task 2: ComposerSourceControlContext schema

**Files:**

- Modify: `packages/contracts/src/sourceControl.ts`

- [ ] **Step 1: Append composer-context schema**

After `SourceControlChangeRequestDetail`:

```ts
export const ComposerSourceControlContextKind = Schema.Literals(["issue", "change-request"]);
export type ComposerSourceControlContextKind = typeof ComposerSourceControlContextKind.Type;

export const ComposerSourceControlContext = Schema.Struct({
  id: TrimmedNonEmptyString, // local UUID, generated client-side
  kind: ComposerSourceControlContextKind,
  provider: SourceControlProviderKind,
  reference: TrimmedNonEmptyString, // 'owner/repo#42' or full URL
  detail: Schema.Union(SourceControlIssueDetail, SourceControlChangeRequestDetail),
  fetchedAt: Schema.DateTimeUtc,
  staleAfter: Schema.DateTimeUtc, // fetchedAt + 5 minutes
});
export type ComposerSourceControlContext = typeof ComposerSourceControlContext.Type;
```

- [ ] **Step 2: Verify**

Run: `bun typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/sourceControl.ts
git commit -m "contracts: add ComposerSourceControlContext schema"
```

---

### Task 3: Extend `ProviderSendTurnInput` with source-control contexts

**Files:**

- Modify: `packages/contracts/src/provider.ts`
- Modify: `packages/contracts/src/provider.test.ts`

- [ ] **Step 1: Read the current schema**

```bash
grep -n "ProviderSendTurnInput\|attachments" packages/contracts/src/provider.ts | head -30
```

Note the current shape so the new field follows the same pattern as `attachments`.

- [ ] **Step 2: Add a max-contexts constant + schema field**

In `provider.ts`, add near the existing `PROVIDER_SEND_TURN_MAX_ATTACHMENTS`:

```ts
export const PROVIDER_SEND_TURN_MAX_SOURCE_CONTROL_CONTEXTS = 10;
```

Import `ComposerSourceControlContext` from `./sourceControl.ts` and extend `ProviderSendTurnInput`:

```ts
sourceControlContexts: Schema.optional(
  Schema.Array(ComposerSourceControlContext).check(
    Schema.isMaxLength(PROVIDER_SEND_TURN_MAX_SOURCE_CONTROL_CONTEXTS),
  ),
),
```

- [ ] **Step 3: Add round-trip test**

In `provider.test.ts`, add a test that constructs a `ProviderSendTurnInput` with one issue context and one change-request context, encodes via Effect Schema, decodes back, and asserts equality. Follow the pattern of any existing `ProviderSendTurnInput` round-trip test in the file.

- [ ] **Step 4: Run tests**

```bash
bun run test packages/contracts/src/provider.test.ts
```

Expected: PASS including the new test.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/provider.ts packages/contracts/src/provider.test.ts
git commit -m "contracts: extend ProviderSendTurnInput with sourceControlContexts"
```

---

## Phase 1 — Server: GitHub issues support

### Task 4: `gitHubIssues.ts` decoder module

**Files:**

- Create: `apps/server/src/sourceControl/gitHubIssues.ts`
- Create: `apps/server/src/sourceControl/gitHubIssues.test.ts`

Pattern reference: `gitHubPullRequests.ts` and `gitHubPullRequests.test.ts` (already in the same directory). Mirror that structure.

- [ ] **Step 1: Write the failing test for `decodeGitHubIssueListJson`**

Create `gitHubIssues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import { decodeGitHubIssueListJson, decodeGitHubIssueDetailJson } from "./gitHubIssues.ts";

describe("decodeGitHubIssueListJson", () => {
  it("decodes a valid list with state normalization", () => {
    const raw = JSON.stringify([
      {
        number: 42,
        title: "Remove stale todos_manager.html",
        url: "https://github.com/owner/repo/issues/42",
        state: "OPEN",
        updatedAt: "2026-03-14T10:00:00Z",
        author: { login: "alice" },
        labels: [{ name: "bug" }, { name: "good-first-issue" }],
      },
    ]);
    const result = decodeGitHubIssueListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success).toHaveLength(1);
    expect(result.success[0]?.number).toBe(42);
    expect(result.success[0]?.state).toBe("open");
    expect(result.success[0]?.author).toBe("alice");
    expect(result.success[0]?.labels).toEqual(["bug", "good-first-issue"]);
  });

  it("skips invalid entries silently", () => {
    const raw = JSON.stringify([
      { number: "not-a-number", title: "bad" },
      { number: 7, title: "ok", url: "https://x/7", state: "CLOSED" },
    ]);
    const result = decodeGitHubIssueListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.map((i) => i.number)).toEqual([7]);
  });

  it("fails on non-JSON", () => {
    const result = decodeGitHubIssueListJson("{not json");
    expect(Result.isFailure(result)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

```bash
bun run test apps/server/src/sourceControl/gitHubIssues.test.ts
```

Expected: FAIL with "Cannot find module './gitHubIssues.ts'".

- [ ] **Step 3: Write minimal `gitHubIssues.ts` to pass list-decoding**

Create `gitHubIssues.ts` mirroring `gitHubPullRequests.ts` shape:

```ts
import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@ryco/contracts";
import { decodeJsonResult, formatSchemaError } from "@ryco/shared/schemaJson";

export interface NormalizedGitHubIssueRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

const GitHubIssueSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
  labels: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
  body: Schema.optional(Schema.NullOr(Schema.String)),
  comments: Schema.optional(
    Schema.Array(
      Schema.Struct({
        author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
        body: Schema.String,
        createdAt: Schema.String,
      }),
    ),
  ),
});

function normalizeState(raw: string | null | undefined): "open" | "closed" {
  return raw?.trim().toUpperCase() === "CLOSED" ? "closed" : "open";
}

function normalizeListEntry(
  raw: Schema.Schema.Type<typeof GitHubIssueSchema>,
): NormalizedGitHubIssueRecord {
  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: normalizeState(raw.state),
    author: raw.author?.login ?? null,
    updatedAt: raw.updatedAt ? Option.some(raw.updatedAt) : Option.none(),
    labels: (raw.labels ?? []).map((l) => l.name),
  };
}

const decodeIssueList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeIssueDetail = decodeJsonResult(GitHubIssueSchema);
const decodeIssueEntry = Schema.decodeUnknownExit(GitHubIssueSchema);

export const formatGitHubIssueDecodeError = formatSchemaError;

export function decodeGitHubIssueListJson(
  raw: string,
): Result.Result<ReadonlyArray<NormalizedGitHubIssueRecord>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const issues: NormalizedGitHubIssueRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodeIssueEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    issues.push(normalizeListEntry(decoded.value));
  }
  return Result.succeed(issues);
}

export interface NormalizedGitHubIssueDetail extends NormalizedGitHubIssueRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

export function decodeGitHubIssueDetailJson(
  raw: string,
): Result.Result<NormalizedGitHubIssueDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeListEntry(result.success);
  const detail: NormalizedGitHubIssueDetail = {
    ...summary,
    body: result.success.body ?? "",
    comments: (result.success.comments ?? []).map((c) => ({
      author: c.author?.login ?? "unknown",
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
  return Result.succeed(detail);
}
```

- [ ] **Step 4: Add detail-decoding tests**

Append to `gitHubIssues.test.ts`:

```ts
describe("decodeGitHubIssueDetailJson", () => {
  it("decodes body and comments", () => {
    const raw = JSON.stringify({
      number: 42,
      title: "title",
      url: "https://x/42",
      state: "OPEN",
      body: "issue body",
      comments: [
        { author: { login: "bob" }, body: "first", createdAt: "2026-03-14T10:00:00Z" },
        { author: null, body: "second", createdAt: "2026-03-14T11:00:00Z" },
      ],
    });
    const result = decodeGitHubIssueDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("issue body");
    expect(result.success.comments).toHaveLength(2);
    expect(result.success.comments[0]?.author).toBe("bob");
    expect(result.success.comments[1]?.author).toBe("unknown");
  });
});
```

- [ ] **Step 5: Run all tests in the file**

```bash
bun run test apps/server/src/sourceControl/gitHubIssues.test.ts
```

Expected: PASS (all 4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sourceControl/gitHubIssues.ts apps/server/src/sourceControl/gitHubIssues.test.ts
git commit -m "server(sc): add gitHubIssues decoder module"
```

---

### Task 5: Truncation helper in contracts module

**Files:**

- Modify: `packages/contracts/src/sourceControl.ts`
- Create: `packages/contracts/src/sourceControl.test.ts` (if doesn't exist) or modify existing

- [ ] **Step 1: Write failing test for `truncateSourceControlDetailContent`**

In `sourceControl.test.ts` (create if needed):

```ts
import { describe, expect, it } from "vitest";
import {
  truncateSourceControlDetailContent,
  SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES,
  SOURCE_CONTROL_DETAIL_MAX_COMMENTS,
} from "./sourceControl.ts";

describe("truncateSourceControlDetailContent", () => {
  it("returns input unchanged when within caps", () => {
    const result = truncateSourceControlDetailContent({
      body: "short body",
      comments: [{ author: "a", body: "small", createdAt: new Date().toISOString() }],
    });
    expect(result.truncated).toBe(false);
    expect(result.body).toBe("short body");
    expect(result.comments).toHaveLength(1);
  });

  it("truncates body when over byte cap", () => {
    const big = "x".repeat(SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES + 100);
    const result = truncateSourceControlDetailContent({ body: big, comments: [] });
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.body, "utf8")).toBeLessThanOrEqual(
      SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES,
    );
  });

  it("keeps only last N comments", () => {
    const comments = Array.from({ length: SOURCE_CONTROL_DETAIL_MAX_COMMENTS + 3 }, (_, i) => ({
      author: "a",
      body: `c${i}`,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }));
    const result = truncateSourceControlDetailContent({ body: "ok", comments });
    expect(result.truncated).toBe(true);
    expect(result.comments).toHaveLength(SOURCE_CONTROL_DETAIL_MAX_COMMENTS);
    expect(result.comments[0]?.body).toBe(
      `c${comments.length - SOURCE_CONTROL_DETAIL_MAX_COMMENTS}`,
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun run test packages/contracts/src/sourceControl.test.ts
```

Expected: FAIL — `truncateSourceControlDetailContent` not exported.

- [ ] **Step 3: Implement the helper**

Append to `packages/contracts/src/sourceControl.ts`:

```ts
export interface SourceControlDetailContentInput {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

export interface SourceControlDetailContentOutput {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
  readonly truncated: boolean;
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return { value, truncated: false };
  const buf = Buffer.from(value, "utf8").subarray(0, maxBytes);
  // Avoid splitting a multi-byte char at the tail.
  return { value: buf.toString("utf8"), truncated: true };
}

export function truncateSourceControlDetailContent(
  input: SourceControlDetailContentInput,
): SourceControlDetailContentOutput {
  let truncated = false;
  const { value: body, truncated: bodyCut } = truncateUtf8(
    input.body,
    SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES,
  );
  if (bodyCut) truncated = true;

  let comments = input.comments;
  if (comments.length > SOURCE_CONTROL_DETAIL_MAX_COMMENTS) {
    comments = comments.slice(comments.length - SOURCE_CONTROL_DETAIL_MAX_COMMENTS);
    truncated = true;
  }

  const cappedComments = comments.map((c) => {
    const { value, truncated: cBodyCut } = truncateUtf8(
      c.body,
      SOURCE_CONTROL_DETAIL_COMMENT_BODY_MAX_BYTES,
    );
    if (cBodyCut) truncated = true;
    return { author: c.author, body: value, createdAt: c.createdAt };
  });

  return { body, comments: cappedComments, truncated };
}
```

- [ ] **Step 4: Run tests**

```bash
bun run test packages/contracts/src/sourceControl.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/sourceControl.ts packages/contracts/src/sourceControl.test.ts
git commit -m "contracts(sc): add truncateSourceControlDetailContent helper"
```

---

### Task 6: Extend `GitHubCli` interface with new methods

**Files:**

- Modify: `apps/server/src/sourceControl/GitHubCli.ts`

- [ ] **Step 1: Extend `GitHubCliShape` interface**

In `GitHubCli.ts`, add to `GitHubCliShape` next to existing methods:

```ts
readonly listIssues: (input: {
  readonly cwd: string;
  readonly state: "open" | "closed" | "all";
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<NormalizedGitHubIssueRecord>, GitHubCliError>;

readonly getIssue: (input: {
  readonly cwd: string;
  readonly reference: string;
}) => Effect.Effect<NormalizedGitHubIssueDetail, GitHubCliError>;

readonly searchIssues: (input: {
  readonly cwd: string;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<NormalizedGitHubIssueRecord>, GitHubCliError>;

readonly searchPullRequests: (input: {
  readonly cwd: string;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<GitHubPullRequestSummary>, GitHubCliError>;

readonly getPullRequestDetail: (input: {
  readonly cwd: string;
  readonly reference: string;
}) => Effect.Effect<GitHubPullRequestDetail, GitHubCliError>;
```

Add `GitHubPullRequestDetail` type at top of file:

```ts
export interface GitHubPullRequestDetail extends GitHubPullRequestSummary {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}
```

Import `NormalizedGitHubIssueRecord`, `NormalizedGitHubIssueDetail` from `./gitHubIssues.ts`.

Note: don't implement these yet. Compilation will pass because `GitHubCli.of({...})` requires all fields, so the next step adds stub implementations to keep types green.

- [ ] **Step 2: Add stub implementations to `make`**

In the `GitHubCli.of({ ... })` block at the bottom of `make`, add temporary stubs that return `Effect.fail` with a clear error. They will be replaced in Tasks 7–10.

```ts
listIssues: () =>
  Effect.fail(new GitHubCliError({ operation: "listIssues", detail: "stub" })),
getIssue: () =>
  Effect.fail(new GitHubCliError({ operation: "getIssue", detail: "stub" })),
searchIssues: () =>
  Effect.fail(new GitHubCliError({ operation: "searchIssues", detail: "stub" })),
searchPullRequests: () =>
  Effect.fail(new GitHubCliError({ operation: "searchPullRequests", detail: "stub" })),
getPullRequestDetail: () =>
  Effect.fail(new GitHubCliError({ operation: "getPullRequestDetail", detail: "stub" })),
```

- [ ] **Step 3: Verify typecheck passes**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/sourceControl/GitHubCli.ts
git commit -m "server(sc): extend GitHubCli shape with new methods (stubbed)"
```

---

### Task 7: Implement `listIssues`

**Files:**

- Modify: `apps/server/src/sourceControl/GitHubCli.ts`
- Modify: `apps/server/src/sourceControl/GitHubCli.test.ts`

Pattern reference: existing `listOpenPullRequests` in the same file.

- [ ] **Step 1: Write failing test**

In `GitHubCli.test.ts`, follow the pattern of the `listOpenPullRequests` test. Add:

```ts
describe("listIssues", () => {
  it("invokes gh issue list with correct args and decodes output", () =>
    Effect.gen(function* () {
      const fakeProcess = makeFakeVcsProcess({
        stdout: JSON.stringify([{ number: 42, title: "Bug", url: "https://x/42", state: "OPEN" }]),
      });
      const cli = yield* GitHubCli;
      const issues = yield* cli.listIssues({ cwd: "/tmp", state: "open", limit: 20 });
      expect(issues).toHaveLength(1);
      expect(issues[0]?.number).toBe(42);
      expect(fakeProcess.lastArgs).toEqual([
        "issue",
        "list",
        "--state",
        "open",
        "--limit",
        "20",
        "--json",
        "number,title,url,state,updatedAt,author,labels",
      ]);
    })
      .pipe(Effect.provide(GitHubCli.layer), Effect.provide(fakeProcessLayer))
      .pipe(Effect.runPromise));
});
```

(Adapt the fake-process scaffolding to match the existing test file's helpers — read the file first to see how `listOpenPullRequests` test sets up `VcsProcess`.)

- [ ] **Step 2: Run test, expect failure**

```bash
bun run test apps/server/src/sourceControl/GitHubCli.test.ts -t listIssues
```

Expected: FAIL — stub error "stub".

- [ ] **Step 3: Replace stub with real implementation**

In `GitHubCli.ts`, replace the `listIssues` stub:

```ts
listIssues: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "issue", "list",
      "--state", input.state,
      "--limit", String(input.limit ?? 50),
      "--json", "number,title,url,state,updatedAt,author,labels",
    ],
  }).pipe(
    Effect.map((r) => r.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() => GitHubIssues.decodeGitHubIssueListJson(raw)).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success)
                : Effect.fail(
                    new GitHubCliError({
                      operation: "listIssues",
                      detail: `GitHub CLI returned invalid issue list JSON: ${GitHubIssues.formatGitHubIssueDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  ),
```

Add at top: `import * as GitHubIssues from "./gitHubIssues.ts";`

- [ ] **Step 4: Run tests, expect pass**

```bash
bun run test apps/server/src/sourceControl/GitHubCli.test.ts -t listIssues
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitHubCli.ts apps/server/src/sourceControl/GitHubCli.test.ts
git commit -m "server(sc): implement GitHubCli.listIssues"
```

---

### Task 8: Implement `getIssue` (with cross-repo URL support + truncation)

**Files:**

- Modify: `apps/server/src/sourceControl/GitHubCli.ts`
- Modify: `apps/server/src/sourceControl/GitHubCli.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
describe("getIssue", () => {
  it("fetches body + comments by number reference", () =>
    Effect.gen(function* () {
      const fake = makeFakeVcsProcess({
        stdout: JSON.stringify({
          number: 42,
          title: "t",
          url: "https://x/42",
          state: "OPEN",
          body: "BODY",
          comments: [{ author: { login: "bob" }, body: "hi", createdAt: "2026-03-14T10:00:00Z" }],
        }),
      });
      const cli = yield* GitHubCli;
      const detail = yield* cli.getIssue({ cwd: "/tmp", reference: "42" });
      expect(detail.body).toBe("BODY");
      expect(detail.comments[0]?.author).toBe("bob");
      expect(fake.lastArgs).toEqual([
        "issue",
        "view",
        "42",
        "--json",
        "number,title,url,state,updatedAt,author,labels,body,comments",
      ]);
    })
      .pipe(/* same provide pattern */)
      .pipe(Effect.runPromise));

  it("passes URL as-is for cross-repo references", () =>
    Effect.gen(function* () {
      const fake = makeFakeVcsProcess({
        stdout: JSON.stringify({
          number: 9,
          title: "x",
          url: "https://github.com/foo/bar/issues/9",
          state: "CLOSED",
          body: "",
          comments: [],
        }),
      });
      const cli = yield* GitHubCli;
      yield* cli.getIssue({ cwd: "/tmp", reference: "https://github.com/foo/bar/issues/9" });
      expect(fake.lastArgs[2]).toBe("https://github.com/foo/bar/issues/9");
    })
      .pipe(/* provide */)
      .pipe(Effect.runPromise));
});
```

- [ ] **Step 2: Run, expect failure**

```bash
bun run test apps/server/src/sourceControl/GitHubCli.test.ts -t getIssue
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Replace the `getIssue` stub:

```ts
getIssue: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "issue", "view", input.reference,
      "--json", "number,title,url,state,updatedAt,author,labels,body,comments",
    ],
  }).pipe(
    Effect.map((r) => r.stdout.trim()),
    Effect.flatMap((raw) =>
      Effect.sync(() => GitHubIssues.decodeGitHubIssueDetailJson(raw)).pipe(
        Effect.flatMap((decoded) =>
          Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(
                new GitHubCliError({
                  operation: "getIssue",
                  detail: `GitHub CLI returned invalid issue JSON: ${GitHubIssues.formatGitHubIssueDecodeError(decoded.failure)}`,
                  cause: decoded.failure,
                }),
              ),
        ),
      ),
    ),
  ),
```

- [ ] **Step 4: Run tests, expect pass**

```bash
bun run test apps/server/src/sourceControl/GitHubCli.test.ts -t getIssue
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitHubCli.ts apps/server/src/sourceControl/GitHubCli.test.ts
git commit -m "server(sc): implement GitHubCli.getIssue with cross-repo URL support"
```

---

### Task 9: Implement `searchIssues` and `searchPullRequests`

**Files:**

- Modify: `apps/server/src/sourceControl/GitHubCli.ts`
- Modify: `apps/server/src/sourceControl/GitHubCli.test.ts`

- [ ] **Step 1: Write failing tests**

Two tests, one for each, asserting CLI args:

```ts
// searchIssues uses `gh issue list --search "<query>"`.
expect(fake.lastArgs).toEqual([
  "issue",
  "list",
  "--search",
  "bug",
  "--limit",
  "20",
  "--json",
  "number,title,url,state,updatedAt,author,labels",
]);

// searchPullRequests uses `gh pr list --search "<query>"`.
expect(fake.lastArgs).toEqual([
  "pr",
  "list",
  "--search",
  "fix",
  "--limit",
  "20",
  "--json",
  "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
]);
```

- [ ] **Step 2: Run, expect failure**

```bash
bun run test apps/server/src/sourceControl/GitHubCli.test.ts -t "search"
```

- [ ] **Step 3: Implement both stubs**

```ts
searchIssues: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "issue", "list",
      "--search", input.query,
      "--limit", String(input.limit ?? 20),
      "--json", "number,title,url,state,updatedAt,author,labels",
    ],
  }).pipe(/* same decode pipeline as listIssues */),

searchPullRequests: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "pr", "list",
      "--search", input.query,
      "--limit", String(input.limit ?? 20),
      "--json", "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner",
    ],
  }).pipe(/* same decode pipeline as listOpenPullRequests */),
```

(Lift the decode pipeline into a helper if duplicated three times — the existing file already has the pattern; consolidate for DRY.)

- [ ] **Step 4: Run tests, expect pass**

```bash
bun run test apps/server/src/sourceControl/GitHubCli.test.ts -t "search"
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitHubCli.ts apps/server/src/sourceControl/GitHubCli.test.ts
git commit -m "server(sc): implement GitHubCli search* methods"
```

---

### Task 10: Implement `getPullRequestDetail`

**Files:**

- Modify: `apps/server/src/sourceControl/gitHubPullRequests.ts`
- Modify: `apps/server/src/sourceControl/GitHubCli.ts`
- Modify: `apps/server/src/sourceControl/GitHubCli.test.ts`

- [ ] **Step 1: Extend `gitHubPullRequests.ts` decoder with body+comments**

Add a `decodeGitHubPullRequestDetailJson` parallel to `decodeGitHubPullRequestJson` that also decodes `body` and `comments`. Add an output type `NormalizedGitHubPullRequestDetail extends NormalizedGitHubPullRequestRecord`.

- [ ] **Step 2: Write failing test for `getPullRequestDetail`**

Test asserts CLI args include `body,comments` in the `--json` field set, and that the decoded result includes `body` and `comments`.

- [ ] **Step 3: Run, expect failure.**

- [ ] **Step 4: Implement**

```ts
getPullRequestDetail: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "pr", "view", input.reference,
      "--json", "number,title,url,baseRefName,headRefName,state,mergedAt,isCrossRepository,headRepository,headRepositoryOwner,body,comments",
    ],
  }).pipe(/* decode using new decoder */),
```

- [ ] **Step 5: Run tests, expect pass.**

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sourceControl/gitHubPullRequests.ts apps/server/src/sourceControl/GitHubCli.ts apps/server/src/sourceControl/GitHubCli.test.ts
git commit -m "server(sc): add GitHubCli.getPullRequestDetail with body + comments"
```

---

## Phase 2 — Server: Provider interface + dispatch

### Task 11: Extend `SourceControlProvider` interface

**Files:**

- Modify: `apps/server/src/sourceControl/SourceControlProvider.ts`

- [ ] **Step 1: Add new methods to `SourceControlProviderShape`**

Import `SourceControlIssueSummary`, `SourceControlIssueDetail`, `SourceControlChangeRequestDetail` from `@ryco/contracts`. Add:

```ts
readonly listIssues: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProviderContext;
  readonly state: "open" | "closed" | "all";
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<SourceControlIssueSummary>, SourceControlProviderError>;

readonly getIssue: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProviderContext;
  readonly reference: string;
}) => Effect.Effect<SourceControlIssueDetail, SourceControlProviderError>;

readonly searchIssues: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProviderContext;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<SourceControlIssueSummary>, SourceControlProviderError>;

readonly searchChangeRequests: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProviderContext;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<ChangeRequest>, SourceControlProviderError>;

readonly getChangeRequestDetail: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProviderContext;
  readonly reference: string;
}) => Effect.Effect<SourceControlChangeRequestDetail, SourceControlProviderError>;
```

(Note: keep the existing `getChangeRequest` returning `ChangeRequest` to avoid breaking callers; add `getChangeRequestDetail` as the new "with body" method.)

- [ ] **Step 2: Verify typecheck FAILS for now**

```bash
bun typecheck
```

Expected: errors in all four `*SourceControlProvider.ts` files because they don't implement the new methods. This is intentional — Tasks 12 + 13 fix it.

- [ ] **Step 3: Don't commit yet** — go directly to Task 12.

---

### Task 12: Stub the non-GitHub providers

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabSourceControlProvider.ts`
- Modify: `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts`

Pattern: in each file, `SourceControlProvider.of({...})` returns the provider record. Add the five new methods returning `Effect.fail` with a typed `SourceControlProviderError`.

- [ ] **Step 1: Add stubs to `GitLabSourceControlProvider.ts`**

Inside the existing `SourceControlProvider.of({ ... })` add:

```ts
listIssues: () =>
  Effect.fail(new SourceControlProviderError({
    provider: "gitlab",
    operation: "listIssues",
    detail: "Not implemented for GitLab yet (Plan 2).",
  })),
getIssue: () =>
  Effect.fail(new SourceControlProviderError({
    provider: "gitlab",
    operation: "getIssue",
    detail: "Not implemented for GitLab yet (Plan 2).",
  })),
searchIssues: () =>
  Effect.fail(new SourceControlProviderError({
    provider: "gitlab",
    operation: "searchIssues",
    detail: "Not implemented for GitLab yet (Plan 2).",
  })),
searchChangeRequests: () =>
  Effect.fail(new SourceControlProviderError({
    provider: "gitlab",
    operation: "searchChangeRequests",
    detail: "Not implemented for GitLab yet (Plan 2).",
  })),
getChangeRequestDetail: () =>
  Effect.fail(new SourceControlProviderError({
    provider: "gitlab",
    operation: "getChangeRequestDetail",
    detail: "Not implemented for GitLab yet (Plan 2).",
  })),
```

- [ ] **Step 2: Repeat in `BitbucketSourceControlProvider.ts`**

Same five method stubs, with `provider: "bitbucket"`.

- [ ] **Step 3: Repeat in `AzureDevOpsSourceControlProvider.ts`**

Same five method stubs, with `provider: "azure-devops"`.

- [ ] **Step 4: Verify typecheck**

```bash
bun typecheck
```

Expected: PASS (or only fails inside `GitHubSourceControlProvider.ts` — Task 13 handles that).

- [ ] **Step 5: Commit (after Task 13 is done — combined commit)** — skip for now.

---

### Task 13: Implement new methods in `GitHubSourceControlProvider`

**Files:**

- Modify: `apps/server/src/sourceControl/GitHubSourceControlProvider.ts`
- Modify: `apps/server/src/sourceControl/GitHubSourceControlProvider.test.ts`

- [ ] **Step 1: Wire `listIssues`, `getIssue`, `searchIssues` to `GitHubCli`**

Inside `make`, add normalizer that converts `NormalizedGitHubIssueRecord` → `SourceControlIssueSummary` (adds `provider: "github"`, maps `Option` types correctly), and converts detail similarly while running `truncateSourceControlDetailContent` on body/comments.

```ts
import { truncateSourceControlDetailContent } from "@ryco/contracts";

const toIssueSummary = (
  raw: GitHubIssues.NormalizedGitHubIssueRecord,
): SourceControlIssueSummary => ({
  provider: "github",
  number: raw.number,
  title: raw.title,
  url: raw.url,
  state: raw.state,
  ...(raw.author ? { author: raw.author } : {}),
  updatedAt: raw.updatedAt.pipe(Option.map((s) => DateTime.unsafeFromDate(new Date(s)))),
  labels: raw.labels,
});

const toIssueDetail = (raw: GitHubIssues.NormalizedGitHubIssueDetail): SourceControlIssueDetail => {
  const truncated = truncateSourceControlDetailContent({
    body: raw.body,
    comments: raw.comments,
  });
  return {
    ...toIssueSummary(raw),
    body: truncated.body,
    comments: truncated.comments.map((c) => ({
      author: c.author,
      body: c.body,
      createdAt: DateTime.unsafeFromDate(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
};
```

Then the provider methods:

```ts
listIssues: (input) =>
  cli.listIssues({ cwd: input.cwd, state: input.state, limit: input.limit }).pipe(
    Effect.map((items) => items.map(toIssueSummary)),
    Effect.mapError((error) => providerError("listIssues", error)),
  ),
getIssue: (input) =>
  cli.getIssue({ cwd: input.cwd, reference: input.reference }).pipe(
    Effect.map(toIssueDetail),
    Effect.mapError((error) => providerError("getIssue", error)),
  ),
searchIssues: (input) =>
  cli.searchIssues({ cwd: input.cwd, query: input.query, limit: input.limit }).pipe(
    Effect.map((items) => items.map(toIssueSummary)),
    Effect.mapError((error) => providerError("searchIssues", error)),
  ),
```

And for change requests:

```ts
searchChangeRequests: (input) =>
  cli.searchPullRequests({ cwd: input.cwd, query: input.query, limit: input.limit }).pipe(
    Effect.map((items) => items.map(toChangeRequest)),  // existing helper
    Effect.mapError((error) => providerError("searchChangeRequests", error)),
  ),
getChangeRequestDetail: (input) =>
  cli.getPullRequestDetail({ cwd: input.cwd, reference: input.reference }).pipe(
    Effect.map(toChangeRequestDetail),  // new helper analogous to toIssueDetail
    Effect.mapError((error) => providerError("getChangeRequestDetail", error)),
  ),
```

(Implement `toChangeRequestDetail` mirroring `toIssueDetail`.)

- [ ] **Step 2: Add provider tests**

In `GitHubSourceControlProvider.test.ts`, add tests mirroring the existing `getChangeRequest`/`listChangeRequests` tests for the new five methods. At minimum:

- `listIssues` returns summaries with `provider: "github"`.
- `getIssue` returns truncated details when body exceeds 8 KB.
- `searchIssues` passes query through.
- `searchChangeRequests` passes query through.
- `getChangeRequestDetail` returns body + comments.

- [ ] **Step 3: Run tests**

```bash
bun run test apps/server/src/sourceControl/GitHubSourceControlProvider.test.ts
```

Expected: PASS (all old + new tests).

- [ ] **Step 4: Verify typecheck**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit** (combines Tasks 11 + 12 + 13)

```bash
git add apps/server/src/sourceControl/SourceControlProvider.ts \
        apps/server/src/sourceControl/GitHubSourceControlProvider.ts \
        apps/server/src/sourceControl/GitHubSourceControlProvider.test.ts \
        apps/server/src/sourceControl/GitLabSourceControlProvider.ts \
        apps/server/src/sourceControl/BitbucketSourceControlProvider.ts \
        apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts
git commit -m "server(sc): extend provider interface with issues + search + detail methods"
```

---

### Task 14: Update `SourceControlProviderRegistry` dispatch

**Files:**

- Modify: `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
- Modify: `apps/server/src/sourceControl/SourceControlProviderRegistry.test.ts`
- Modify: `apps/server/src/sourceControl/SourceControlRepositoryService.test.ts` (the `unsupported` mock)

- [ ] **Step 1: Extend the `unsupported` fallback in `SourceControlProviderRegistry.ts`**

Inside the no-provider-resolved branch (which currently returns `unsupported("listChangeRequests")` etc.), add the same for the five new methods so the type matches `SourceControlProviderShape`.

- [ ] **Step 2: Extend the dispatch object** that delegates to the resolved provider — add the five new methods that simply forward to `provider.listIssues(...)` etc.

- [ ] **Step 3: Update test mock**

In `SourceControlRepositoryService.test.ts`, the existing `unsupported`-style mock provider needs the five new methods stubbed too. Otherwise the test won't typecheck.

- [ ] **Step 4: Add registry dispatch tests**

In `SourceControlProviderRegistry.test.ts`, add a test asserting that `listIssues({ cwd })` against a workspace whose remote resolves to GitHub calls the GitHub provider's `listIssues`. Mirror the existing `listChangeRequests` test.

- [ ] **Step 5: Run all sourceControl tests**

```bash
bun run test apps/server/src/sourceControl/
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sourceControl/SourceControlProviderRegistry.ts \
        apps/server/src/sourceControl/SourceControlProviderRegistry.test.ts \
        apps/server/src/sourceControl/SourceControlRepositoryService.test.ts
git commit -m "server(sc): extend provider registry dispatch for issues + search"
```

---

## Phase 3 — Server: WebSocket endpoints

### Task 15: Add WS routes

**Files:**

- Modify: `apps/server/src/wsServer.ts`

Pattern reference: search for the existing `sourceControl.listChangeRequests` route and mirror it.

- [ ] **Step 1: Locate the existing `sourceControl.*` route registrations**

```bash
grep -n "sourceControl\." apps/server/src/wsServer.ts
```

Note the registration pattern (probably an object literal mapping operation names to handlers).

- [ ] **Step 2: Add five new routes**

For each of:

- `sourceControl.listIssues`
- `sourceControl.getIssue`
- `sourceControl.searchIssues`
- `sourceControl.searchChangeRequests`
- `sourceControl.getChangeRequestDetail`

Add a route handler that takes the input (validated against the request schema), resolves the provider via the registry by `cwd`, and calls the corresponding method. Mirror the input/output shape of `sourceControl.listChangeRequests`.

- [ ] **Step 3: Add request/response Schema definitions**

These probably live alongside the route registrations or in `packages/contracts/src/rpc.ts` / `ipc.ts`. Read the file to find where `sourceControlListChangeRequestsInput` / output is defined and follow the same place.

- [ ] **Step 4: Run integration tests**

```bash
bun run test apps/server/src/server.test.ts
```

Expected: PASS. If there's a smoke test that lists registered routes, the new ones should appear.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/wsServer.ts packages/contracts/src/rpc.ts
git commit -m "server(ws): add sourceControl issue + search + detail routes"
```

---

## Phase 4 — Web: draft store + RPC client

### Task 16: Extend `composerDraftStore` with `sourceControlContexts`

**Files:**

- Modify: `apps/web/src/composerDraftStore.ts`
- Modify: `apps/web/src/composerDraftStore.test.tsx`

- [ ] **Step 1: Read the current store shape**

```bash
grep -n "ComposerThreadDraft\|images:\|terminalContexts" apps/web/src/composerDraftStore.ts | head -30
```

Note where the per-thread draft structure is defined and where actions live.

- [ ] **Step 2: Write failing tests**

In `composerDraftStore.test.tsx`:

```ts
describe("sourceControlContexts", () => {
  it("adds a context to the draft", () => {
    const store = createComposerDraftStore(/* …existing helpers */);
    const ctx: ComposerSourceControlContext = makeFakeIssueContext({ number: 42 });
    store.getState().addSourceControlContext({ threadId: "t1", context: ctx });
    expect(store.getState().getDraft("t1").sourceControlContexts).toHaveLength(1);
  });

  it("dedupes by provider:reference", () => {
    const store = /* … */;
    const ctx = makeFakeIssueContext({ number: 42 });
    store.getState().addSourceControlContext({ threadId: "t1", context: ctx });
    store.getState().addSourceControlContext({ threadId: "t1", context: ctx });
    expect(store.getState().getDraft("t1").sourceControlContexts).toHaveLength(1);
  });

  it("removes a context by id", () => {
    /* add then remove, assert empty */
  });

  it("clears contexts on send", () => {
    /* add then call clearForSend, assert empty */
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
bun run test apps/web/src/composerDraftStore.test.tsx -t sourceControlContexts
```

Expected: FAIL — actions don't exist.

- [ ] **Step 4: Implement**

In `composerDraftStore.ts`:

1. Extend the per-thread draft type:
   ```ts
   sourceControlContexts: ComposerSourceControlContext[];
   ```
2. Initialize as `[]` in the empty-draft factory.
3. Add three actions: `addSourceControlContext`, `removeSourceControlContext`, `clearSourceControlContexts`. The `add` action dedupes by computing `${provider}:${reference}` and skipping if it matches an existing context.
4. Wire `clearSourceControlContexts` into the existing "clear-on-send" path that already clears `images`/`terminalContexts`.

- [ ] **Step 5: Run tests, expect pass**

```bash
bun run test apps/web/src/composerDraftStore.test.tsx -t sourceControlContexts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/composerDraftStore.ts apps/web/src/composerDraftStore.test.tsx
git commit -m "web(composer): persist source-control contexts in draft store"
```

---

### Task 17: TanStack Query helpers for new WS routes

**Files:**

- Create: `apps/web/src/lib/sourceControlContextRpc.ts`

- [ ] **Step 1: Define query-options factories**

Pattern reference: `apps/web/src/lib/projectReactQuery.ts`. **Read it first** to find the project's actual RPC-invocation helper — the import below uses the name `invokeRpc` as a placeholder; replace with whatever the file actually uses (likely a wrapper around the WebSocket client). Mirror the `staleTime` / `queryKey` conventions you see there.

```ts
import { queryOptions } from "@tanstack/react-query";
import type { SourceControlIssueSummary, SourceControlIssueDetail } from "@ryco/contracts";
import { invokeRpc } from "./rpc"; // ← REPLACE with actual helper from projectReactQuery.ts

export const issueListQueryOptions = (input: {
  cwd: string;
  state: "open" | "closed" | "all";
  limit?: number;
}) =>
  queryOptions({
    queryKey: ["sourceControl", "listIssues", input.cwd, input.state, input.limit ?? 50],
    queryFn: () =>
      invokeRpc("sourceControl.listIssues", input) as Promise<
        ReadonlyArray<SourceControlIssueSummary>
      >,
    staleTime: 60_000,
  });

export const issueDetailQueryOptions = (input: { cwd: string; reference: string }) =>
  queryOptions({
    queryKey: ["sourceControl", "getIssue", input.cwd, input.reference],
    queryFn: () => invokeRpc("sourceControl.getIssue", input) as Promise<SourceControlIssueDetail>,
    staleTime: 300_000,
  });

// And: searchIssuesQueryOptions, changeRequestListQueryOptions,
// changeRequestSearchQueryOptions, changeRequestDetailQueryOptions.
```

(Adapt `invokeRpc` call shape to whatever the codebase's actual helper is — check `projectReactQuery.ts` first.)

- [ ] **Step 2: Verify**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/sourceControlContextRpc.ts
git commit -m "web(sc): add TanStack Query helpers for source-control RPCs"
```

---

## Phase 5 — Web: trigger detection

### Task 18: `#` trigger in `composer-logic.ts`

**Files:**

- Modify: `apps/web/src/composer-logic.ts`
- Modify: `apps/web/src/composer-logic.test.ts`

- [ ] **Step 1: Read the existing trigger types**

```bash
grep -n "ComposerTriggerKind\|detectComposerTrigger" apps/web/src/composer-logic.ts | head
```

- [ ] **Step 2: Write failing tests**

```ts
describe("detectComposerTrigger – source control", () => {
  it("matches '#' at start", () => {
    const t = detectComposerTrigger({ text: "#", cursor: 1 });
    expect(t).toEqual({ kind: "source-control", query: "", rangeStart: 0, rangeEnd: 1 });
  });
  it("matches '#42' as numeric reference", () => {
    const t = detectComposerTrigger({ text: "see #42 ", cursor: 7 });
    expect(t?.kind).toBe("source-control");
    expect(t?.query).toBe("42");
  });
  it("matches '#bug ' as text query", () => {
    const t = detectComposerTrigger({ text: "fixing #bug now", cursor: 12 });
    expect(t?.kind).toBe("source-control");
    expect(t?.query).toBe("bug");
  });
  it("matches '#https://github.com/.../issues/9' as URL", () => {
    const text = "ref #https://github.com/foo/bar/issues/9";
    const t = detectComposerTrigger({ text, cursor: text.length });
    expect(t?.kind).toBe("source-control");
    expect(t?.query).toBe("https://github.com/foo/bar/issues/9");
  });
  it("does NOT match '#' mid-word", () => {
    const t = detectComposerTrigger({ text: "abc#42", cursor: 6 });
    expect(t?.kind).not.toBe("source-control");
  });
});
```

- [ ] **Step 3: Run, expect failure**

```bash
bun run test apps/web/src/composer-logic.test.ts -t "source control"
```

- [ ] **Step 4: Implement**

In `composer-logic.ts`:

1. Add `'source-control'` to `ComposerTriggerKind`.
2. In `detectComposerTrigger`, after the existing `@` and `/` matchers, add a regex that walks back from `cursor` to find a `#` at the start of input or after whitespace, then captures everything after it up to the next whitespace. Reject the match if the char immediately preceding `#` is non-whitespace and the cursor is not at start.

- [ ] **Step 5: Run tests, expect pass**

```bash
bun run test apps/web/src/composer-logic.test.ts -t "source control"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/composer-logic.ts apps/web/src/composer-logic.test.ts
git commit -m "web(composer): add # trigger detection for source-control items"
```

---

### Task 19: Client-side fuzzy filter

**Files:**

- Create: `apps/web/src/components/chat/composerSourceControlContextSearch.ts`
- Create: `apps/web/src/components/chat/composerSourceControlContextSearch.test.ts`

Pattern: identical idea to `composerSlashCommandSearch.ts` — case-insensitive, ranks by prefix-match → substring → fuzzy.

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { searchSourceControlSummaries } from "./composerSourceControlContextSearch";
import type { SourceControlIssueSummary } from "@ryco/contracts";

const summaries: SourceControlIssueSummary[] = [
  {
    provider: "github",
    number: 42,
    title: "Remove stale todos_manager.html",
    url: "u",
    state: "open",
  },
  {
    provider: "github",
    number: 41,
    title: "remote-install.sh shows wrong port",
    url: "u",
    state: "open",
  },
  {
    provider: "github",
    number: 40,
    title: "AK-47 keychain canvas position not calibrated",
    url: "u",
    state: "open",
  },
];

describe("searchSourceControlSummaries", () => {
  it("returns all when query is empty", () => {
    expect(searchSourceControlSummaries(summaries, "")).toEqual(summaries);
  });
  it("matches by number", () => {
    const result = searchSourceControlSummaries(summaries, "42");
    expect(result[0]?.number).toBe(42);
  });
  it("matches title substring", () => {
    const result = searchSourceControlSummaries(summaries, "todos_manager");
    expect(result[0]?.number).toBe(42);
  });
  it("ranks prefix matches above substring matches", () => {
    const more = [
      ...summaries,
      {
        provider: "github" as const,
        number: 1,
        title: "ak-47 followup",
        url: "u",
        state: "open" as const,
      },
    ];
    const result = searchSourceControlSummaries(more, "ak-47");
    expect(result[0]?.number).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect failure (file doesn't exist yet).**

- [ ] **Step 3: Implement**

```ts
import type { SourceControlIssueSummary } from "@ryco/contracts";

type Rankable = SourceControlIssueSummary & { __score?: number };

export function searchSourceControlSummaries<T extends SourceControlIssueSummary>(
  items: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return items;

  const scored = items.flatMap((item) => {
    const title = item.title.toLowerCase();
    const number = String(item.number);
    if (number === q || number.startsWith(q)) return [{ item, score: 0 }];
    if (title.startsWith(q)) return [{ item, score: 1 }];
    if (title.includes(q)) return [{ item, score: 2 }];
    return [];
  });

  scored.sort((a, b) => a.score - b.score);
  return scored.map((s) => s.item);
}
```

- [ ] **Step 4: Run tests, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/composerSourceControlContextSearch.ts \
        apps/web/src/components/chat/composerSourceControlContextSearch.test.ts
git commit -m "web(sc): add client-side fuzzy filter for issue/PR summaries"
```

---

## Phase 6 — Web: components

### Task 20: `ContextPickerList` component

**Files:**

- Create: `apps/web/src/components/chat/ContextPickerList.tsx`

- [ ] **Step 1: Implement the list**

```tsx
import type { SourceControlIssueSummary } from "@ryco/contracts";
import { memo } from "react";
import { cn } from "~/lib/utils";

type Item = SourceControlIssueSummary;

export const ContextPickerList = memo(function ContextPickerList(props: {
  items: ReadonlyArray<Item>;
  isLoading: boolean;
  emptyText: string;
  onSelect: (item: Item) => void;
}) {
  if (props.isLoading && props.items.length === 0) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>;
  }
  if (props.items.length === 0) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">{props.emptyText}</div>;
  }
  return (
    <ul className="max-h-72 overflow-y-auto" role="listbox">
      {props.items.map((item) => (
        <li key={`${item.provider}:${item.number}`}>
          <button
            type="button"
            onClick={() => props.onSelect(item)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
              "hover:bg-accent",
            )}
          >
            <span className="shrink-0 text-muted-foreground">#{item.number}</span>
            <span className="min-w-0 flex-1 truncate">{item.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {/* date — implementation up to dev: format updatedAt if present */}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
});
```

- [ ] **Step 2: Verify it typechecks**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ContextPickerList.tsx
git commit -m "web(sc): add ContextPickerList component"
```

---

### Task 21: `ContextPickerTabs` component

**Files:**

- Create: `apps/web/src/components/chat/ContextPickerTabs.tsx`

- [ ] **Step 1: Implement**

```tsx
import { memo } from "react";
import { cn } from "~/lib/utils";

export type ContextPickerTab = {
  id: string;
  label: string;
  count?: number;
};

export const ContextPickerTabs = memo(function ContextPickerTabs(props: {
  tabs: ReadonlyArray<ContextPickerTab>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 px-3 py-1.5 border-b border-border">
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={props.activeId === tab.id}
          onClick={() => props.onSelect(tab.id)}
          className={cn(
            "rounded-md px-2 py-1 text-xs",
            props.activeId === tab.id
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className="ml-1 opacity-60">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
});
```

- [ ] **Step 2: Typecheck.**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ContextPickerTabs.tsx
git commit -m "web(sc): add ContextPickerTabs component"
```

---

### Task 22: `ContextPickerPopup` (the main popup)

**Files:**

- Create: `apps/web/src/components/chat/ContextPickerPopup.tsx`
- Create: `apps/web/src/components/chat/ContextPickerPopup.browser.tsx`

- [ ] **Step 1: Implement the popup**

The popup:

1. Manages local state: `query: string`, `activeTab: 'issues' | 'prs'`.
2. Uses TanStack Query to fetch the cached list for the active tab via `issueListQueryOptions` / `changeRequestListQueryOptions`.
3. Runs `searchSourceControlSummaries` against the query.
4. If filter is empty AND query length ≥ 2, falls back to `useQuery(searchIssuesQueryOptions(...))` (debounced via `useDebouncedValue` from `@tanstack/react-pacer`, 200 ms).
5. Renders header → search input → tabs → list.
6. Renders the existing image-attach UI (file input + drop target) at the top-right of the header — wire to the same handler `ChatComposer` already uses for paste/drop (extracted into a shared module if not already).

(Implementation is straightforward but lengthy — reference shape:)

```tsx
import { type FormEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import {
  issueListQueryOptions,
  changeRequestListQueryOptions,
  searchIssuesQueryOptions,
  searchChangeRequestsQueryOptions,
} from "~/lib/sourceControlContextRpc";
import { searchSourceControlSummaries } from "./composerSourceControlContextSearch";
import { ContextPickerList } from "./ContextPickerList";
import { ContextPickerTabs, type ContextPickerTab } from "./ContextPickerTabs";

type TabId = "issues" | "prs";

export function ContextPickerPopup(props: {
  cwd: string;
  onSelectIssue: (issue: SourceControlIssueSummary) => void;
  onSelectChangeRequest: (cr: ChangeRequest) => void;
  onAttachFile: (file: File) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("issues");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, { wait: 200 });

  const cachedIssues = useQuery(issueListQueryOptions({ cwd: props.cwd, state: "open" }));
  const cachedPrs = useQuery(changeRequestListQueryOptions({ cwd: props.cwd, state: "open" }));

  // … filter / fallback logic …
  // … return JSX with header, paperclip <input type="file">, tabs, list …
}
```

(Full implementation should keep the popup focused — no business logic beyond what's listed. The popup's paperclip opens a native `<input type="file">`; the popup body is also a drop target — both call `props.onAttachFile(file)`. The composer's existing paste/drop handlers are unchanged; this popup adds _additional_ entry points using the same pipeline. If `ChatComposer` does not already export the per-file `onAddImage` handler, extract a shared module — search for `addImage` / `nextImages` in `ChatComposer.tsx` to find the function to lift.)

- [ ] **Step 2: Browser test**

In `ContextPickerPopup.browser.tsx`, add a Vitest browser test that:

- Renders the popup with a mocked TanStack QueryClient pre-populated with two issues.
- Asserts the issues render.
- Types into the search input → asserts client-side filter narrows the list.
- Switches tab to `prs` → asserts the PR list renders.
- Clicks an issue → asserts `onSelectIssue` is called with the right item.

Pattern reference: `MessagesTimeline.browser.tsx` or `CompactComposerControlsMenu.browser.tsx` for the browser-test setup style.

- [ ] **Step 3: Run browser test**

```bash
bun run test apps/web/src/components/chat/ContextPickerPopup.browser.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ContextPickerPopup.tsx apps/web/src/components/chat/ContextPickerPopup.browser.tsx
git commit -m "web(sc): add ContextPickerPopup with tabs, search, and filter fallback"
```

---

### Task 23: `ContextPickerButton` component

**Files:**

- Create: `apps/web/src/components/chat/ContextPickerButton.tsx`

- [ ] **Step 1: Implement**

```tsx
import { Popover, PopoverTrigger, PopoverContent } from "~/components/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { PaperclipIcon } from "lucide-react";
import { ContextPickerPopup } from "./ContextPickerPopup";
import type { SourceControlIssueSummary, ChangeRequest } from "@ryco/contracts";

export function ContextPickerButton(props: {
  cwd: string;
  hasSourceControlRemote: boolean;
  onSelectIssue: (issue: SourceControlIssueSummary) => void;
  onSelectChangeRequest: (cr: ChangeRequest) => void;
  onAttachFile: (file: File) => void;
}) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger render={<button type="button" aria-label="Add context" />} />}
        >
          <PaperclipIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup>Add context</TooltipPopup>
      </Tooltip>
      <PopoverContent>
        <ContextPickerPopup
          cwd={props.cwd}
          onSelectIssue={props.onSelectIssue}
          onSelectChangeRequest={props.onSelectChangeRequest}
          onAttachFile={props.onAttachFile}
        />
      </PopoverContent>
    </Popover>
  );
}
```

(Follow the actual `Popover` API used by the codebase — check existing components like `ProviderModelPicker.tsx` for the right import paths.)

- [ ] **Step 2: Typecheck.**

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ContextPickerButton.tsx
git commit -m "web(sc): add ContextPickerButton (popover trigger)"
```

---

### Task 24: `SourceControlContextChip` component

**Files:**

- Create: `apps/web/src/components/chat/SourceControlContextChip.tsx`
- Create: `apps/web/src/components/chat/SourceControlContextChip.test.tsx`

Pattern reference: `TerminalContextInlineChip.tsx`.

- [ ] **Step 1: Write failing test**

(Test setup follows the same pattern as `composerProviderState.test.tsx`. `userEvent` comes from `@testing-library/user-event`. `fakeIssueContext` is a small helper defined inline at the top of the test file — see snippet below.)

```ts
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SourceControlContextChip } from "./SourceControlContextChip";
import { describe, expect, it, vi } from "vitest";
import { DateTime } from "effect";
import type { ComposerSourceControlContext } from "@ryco/contracts";

function fakeIssueContext(
  overrides: Partial<{
    id: string;
    number: number;
    title: string;
    reference: string;
    truncated: boolean;
  }> = {},
): ComposerSourceControlContext {
  const now = DateTime.unsafeNow();
  return {
    id: overrides.id ?? "ctx-1",
    kind: "issue",
    provider: "github",
    reference: overrides.reference ?? `owner/repo#${overrides.number ?? 42}`,
    detail: {
      provider: "github",
      number: overrides.number ?? 42,
      title: overrides.title ?? "fix the foo",
      url: "https://github.com/owner/repo/issues/42",
      state: "open",
      updatedAt: { _tag: "None" } as never,
      body: "issue body",
      comments: [],
      truncated: overrides.truncated ?? false,
    },
    fetchedAt: now,
    staleAfter: DateTime.add(now, { minutes: 5 }),
  };
}

describe("SourceControlContextChip", () => {
  it("renders #number + truncated title", () => {
    render(
      <SourceControlContextChip
        context={fakeIssueContext({ number: 42, title: "fix the foo" })}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("fix the foo")).toBeInTheDocument();
  });

  it("calls onRemove when X clicked", async () => {
    const onRemove = vi.fn();
    render(<SourceControlContextChip context={fakeIssueContext({ id: "abc" })} onRemove={onRemove} />);
    await userEvent.click(screen.getByLabelText("Remove context"));
    expect(onRemove).toHaveBeenCalledWith("abc");
  });

  it("renders cross-repo reference for cross-repo URLs", () => {
    render(<SourceControlContextChip context={fakeIssueContext({ reference: "foo/bar#9" })} onRemove={vi.fn()} />);
    expect(screen.getByText("foo/bar#9")).toBeInTheDocument();
  });

  it("shows truncated badge when context.detail.truncated", () => {
    render(<SourceControlContextChip context={fakeIssueContext({ truncated: true })} onRemove={vi.fn()} />);
    expect(screen.getByLabelText("Context truncated")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect failure (file doesn't exist).**

- [ ] **Step 3: Implement**

Standard chip: provider glyph, reference text (`#42` for same-repo, parsed `owner/repo#9` for cross-repo URLs), truncated title, optional truncated-badge, X button. Click toggles a tooltip/popover with the body preview (use the same `Tooltip`/`Popover` primitives the rest of the codebase uses).

- [ ] **Step 4: Run tests, expect pass.**

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/SourceControlContextChip.tsx apps/web/src/components/chat/SourceControlContextChip.test.tsx
git commit -m "web(sc): add SourceControlContextChip with preview + remove"
```

---

## Phase 7 — Web: composer integration

### Task 25: Wire `ContextPickerButton` into the composer footer

**Files:**

- Modify: `apps/web/src/components/chat/ChatComposer.tsx`

- [ ] **Step 1: Add the button next to existing footer controls**

Find the existing footer-actions block (look for `ComposerPrimaryActions` and the surrounding controls). Render `<ContextPickerButton>` next to them. Pass:

- `cwd` from the active project.
- `hasSourceControlRemote` from the existing source-control-status hook (find it via grep — the codebase already detects this).
- `onSelectIssue` → fetch detail via `getIssue` → call `addSourceControlContext` on the draft store.
- `onSelectChangeRequest` → fetch detail via `getChangeRequestDetail` → `addSourceControlContext`.
- `onAttachFile` → reuse the existing image-attach handler (the same one paste/drop uses).

- [ ] **Step 2: Quick browser smoke**

Add a single new test case to the existing `ChatComposer.tsx` browser test (or `MessagesTimeline.browser.tsx` if that's where composer is tested):

- Mount composer.
- Click the new button.
- Assert popup opens.

- [ ] **Step 3: Run**

```bash
bun run test apps/web/src/components/chat/
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ChatComposer.tsx
git commit -m "web(composer): wire ContextPickerButton into footer"
```

---

### Task 26: Render context chips above the textarea

**Files:**

- Modify: `apps/web/src/components/chat/ChatComposer.tsx`

- [ ] **Step 1: Render the chip row**

Find the existing pending-context chip rendering (search for `TerminalContextInlineChip` or `ComposerPendingTerminalContexts`). Add a sibling block that maps `draft.sourceControlContexts` to `<SourceControlContextChip>` with `onRemove` calling `removeSourceControlContext`.

- [ ] **Step 2: Browser test extension**

Extend the smoke test from Task 25:

- Open popup, select an issue.
- Assert chip appears in composer.
- Click X on chip → assert chip disappears.

- [ ] **Step 3: Run**

```bash
bun run test apps/web/src/components/chat/
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ChatComposer.tsx
git commit -m "web(composer): render source-control context chips above textarea"
```

---

### Task 27: Wire `#` trigger into `ComposerCommandMenu`

**Files:**

- Modify: `apps/web/src/components/chat/ComposerCommandMenu.tsx`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`

- [ ] **Step 1: Extend `ComposerCommandItem` with `source-control-issue` and `source-control-pr`**

In `ComposerCommandMenu.tsx`:

```ts
| {
    id: string;
    type: "source-control-issue";
    summary: SourceControlIssueSummary;
    label: string;
    description: string;
  }
| {
    id: string;
    type: "source-control-pr";
    summary: ChangeRequest;
    label: string;
    description: string;
  }
```

Render with a `GitCommitIcon` or similar lucide icon next to it (pick something distinct from the path/skill/slash glyphs).

- [ ] **Step 2: Wire detection in `ChatComposer.tsx`**

When `detectComposerTrigger` returns `kind: "source-control"`:

1. Open the inline command menu (the existing path that's used for `@` and `/`).
2. Populate items from `useQuery(issueListQueryOptions(...))` result, filtered by `searchSourceControlSummaries(items, trigger.query)`.
3. On select: insert a chip into the draft (don't replace the trigger text — instead delete the `#…` text range AND attach the chip via `addSourceControlContext`).
4. On `#42` exact: bypass the menu and direct-attach.

- [ ] **Step 3: Browser test**

Extend the existing composer browser test:

- Type `#` → assert command menu opens with issue items.
- Type `#42` → assert direct-attach (chip appears, no menu remaining).
- Type `#bug` → menu filters; pick item; assert chip appears, `#bug` text removed.

- [ ] **Step 4: Run**

```bash
bun run test apps/web/src/components/chat/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ComposerCommandMenu.tsx apps/web/src/components/chat/ChatComposer.tsx
git commit -m "web(composer): wire # trigger to inline command menu for issues/PRs"
```

---

### Task 28: Serialize `sourceControlContexts` into the turn payload

**Files:**

- Modify: `apps/web/src/components/ChatView.logic.ts`
- Modify: `apps/web/src/components/ChatView.logic.test.ts` (or wherever the existing turn-builder tests live; grep for `ProviderSendTurnInput` in tests)

- [ ] **Step 1: Find the turn-build path**

```bash
grep -rn "ProviderSendTurnInput\|attachments:" apps/web/src --include="*.ts" --include="*.tsx"
```

Note the function (likely in `ChatView.logic.ts` or a per-provider builder) that constructs the payload.

- [ ] **Step 2: Write failing test**

In the appropriate test file:

```ts
it("includes sourceControlContexts from the draft", () => {
  const draft = makeDraft({
    text: "look at #42",
    sourceControlContexts: [makeFakeIssueContext({ number: 42 })],
  });
  const payload = buildSendTurnInput(draft);
  expect(payload.sourceControlContexts).toHaveLength(1);
  expect(payload.sourceControlContexts?.[0]?.detail).toMatchObject({ number: 42 });
});
```

- [ ] **Step 3: Run, expect failure.**

- [ ] **Step 4: Implement**

In the turn builder, copy `draft.sourceControlContexts` into the output payload (only if non-empty).

- [ ] **Step 5: Run tests, expect pass.**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ChatView.logic.ts apps/web/src/components/ChatView.logic.test.ts
git commit -m "web(composer): serialize source-control contexts into turn payload"
```

---

### Task 29: Stale-on-send refetch

**Files:**

- Modify: `apps/web/src/components/ChatView.logic.ts` (or wherever send happens)

- [ ] **Step 1: Failing test**

```ts
it("refetches stale source-control contexts before send", async () => {
  const stale = makeFakeIssueContext({
    number: 42,
    fetchedAt: tenMinutesAgo,
    staleAfter: fiveMinutesAgo,
  });
  const fresh = await refreshStaleSourceControlContexts([stale], { fetcher: stubFetcher });
  expect(fresh[0]?.fetchedAt).toBeGreaterThan(stale.fetchedAt);
});
```

- [ ] **Step 2: Implement**

Helper `refreshStaleSourceControlContexts(contexts, { fetcher })` that for each context with `staleAfter < now`, calls `fetcher` (which under the hood is `getIssue` or `getChangeRequestDetail`) to re-fetch detail and produces a new context with bumped timestamps. Failures keep the original context (per spec — best-effort refetch). Wire into the send path so it runs before serialization.

- [ ] **Step 3: Run tests, expect pass.**

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ChatView.logic.ts apps/web/src/components/ChatView.logic.test.ts
git commit -m "web(composer): refresh stale source-control contexts before send"
```

---

## Phase 8 — Final gate

### Task 30: Lint, typecheck, tests, manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run pre-merge gate**

```bash
bun fmt && bun lint && bun typecheck && bun run test
```

Expected: all PASS.

- [ ] **Step 2: Manual smoke (in a real GitHub repo workspace)**

Walk through:

- [ ] Open Ryco in a workspace cloned from a GitHub repo. `gh` is installed and authed.
- [ ] Click 📎 in the composer footer. Popup opens with cached issues.
- [ ] Type `bug` in search → list narrows.
- [ ] Click an issue → popup closes, chip appears above textarea.
- [ ] Hover chip → see preview.
- [ ] Click X on chip → chip disappears.
- [ ] Type `#42` in textarea → chip auto-attaches.
- [ ] Type `#` then pick from inline menu → chip attaches.
- [ ] Open popup → click GH PRs tab → see PRs.
- [ ] Attach a PR + an issue + an image (via popup paperclip) + free-form text. Send. Verify the agent receives all three contexts.
- [ ] Open Ryco in a workspace with no remote → button still opens popup, source-control tabs hidden, file upload still works.
- [ ] Uninstall `gh` (or rename it temporarily) → tab body shows install hint.
- [ ] `gh auth logout` → tab body shows auth-command.

- [ ] **Step 3: If smoke passes, mark plan complete.**

```bash
git log --oneline | head -30
```

Confirm all commits are clean and self-contained.

---

## Self-review notes (filled in after writing)

Spec coverage check (against `docs/superpowers/specs/2026-05-07-chat-context-picker-design.md`):

- ✓ Goal: GH issues + PRs + image attach. — Tasks 4–10, 22–24, 25.
- ✓ Non-goals respected (no Linear/Sentry, no remote-picker UI, no server cache, no new auth, no unsupported hosts).
- ✓ Contracts: issue summary, detail, change-request detail, composer-context, turn-payload extension, token caps. — Tasks 1–3, 5.
- ✓ Server: `listIssues`, `getIssue`, `searchIssues`, `searchChangeRequests`, `getChangeRequestDetail`. — Tasks 6–13.
- ✓ Per-provider stubs for GitLab/Bitbucket/AzureDevOps. — Task 12.
- ✓ Registry dispatch + WS routes. — Tasks 14–15.
- ✓ Web: draft store, RPC client, `#` trigger, fuzzy filter, list, tabs, popup, button, chip. — Tasks 16–24.
- ✓ Composer integration + serialization + stale refetch. — Tasks 25–29.
- ✓ Edge cases: no remote, unsupported host, CLI missing, CLI unauthed, dedupe, clear-on-send, cross-repo URL — covered in component task descriptions and the smoke checklist.
- ✓ Performance budgets: implicitly satisfied via TanStack Query staleTime + existing `VcsProcess` timeouts.
- ✓ Tests: unit tests for decoders, CLI, providers, registry, draft store, trigger, fuzzy filter, chip; browser test for popup + composer flow. — Tasks 4–28.
- ✓ Pre-merge gate. — Task 30.
