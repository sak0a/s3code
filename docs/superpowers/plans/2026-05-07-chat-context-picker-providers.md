# Chat Context Picker (Providers + UX Follow-ups) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Plan 1 "not implemented" stubs with real GitLab, Bitbucket, and Azure DevOps implementations of `listIssues`, `getIssue`, `searchIssues`, `searchChangeRequests`, and `getChangeRequestDetail`; finish the four follow-up UX gaps left by Plan 1, plus an optional direct-attach `#42`+Enter shortcut.

**Architecture:** Per-provider, three layers. (1) New decoder module per provider (`gitLabIssues.ts`, `bitbucketIssues.ts`, `azureDevOpsWorkItems.ts`) — JSON normalization mirroring `gitHubIssues.ts`. (2) Existing CLI/API wrapper extended with 5 new methods (`<Provider>Cli.ts` or `BitbucketApi.ts`). (3) Existing `<Provider>SourceControlProvider.ts` stubs replaced with real implementations that pipe `Effect.mapError(providerError(...))` and call `truncateSourceControlDetailContent` from `@s3tools/contracts`. UX follow-ups: a small set of focused web-side edits.

**Tech Stack:** TypeScript, Effect, Effect Schema, Vitest (Node + browser mode), React + TanStack Query, Bun monorepo, GitLab CLI (`glab`), Bitbucket Cloud REST API, Azure CLI (`az`) with `azure-devops` extension.

**Reference spec:** `docs/superpowers/specs/2026-05-07-chat-context-picker-design.md`.
**Reference plan:** `docs/superpowers/plans/2026-05-07-chat-context-picker-github.md` (Plan 1 — GitHub vertical slice; merged in commit `168b7f1f`).

**Pre-merge gate (run before claiming completion):** `bun fmt && bun lint && bun typecheck && bun run test`.

**Branch / PR strategy:** all clusters land on a single feature branch `feature/chat-context-picker-providers` and ship as one PR. Each task commit is small and self-contained.

**Project conventions reminder:**

- NEVER include `Co-Authored-By` lines in commits (per `~/.claude/CLAUDE.md`).
- NEVER `bun test`. Always `bun run test`.
- Force `LC_ALL: "C"` via the `env` field on `VcsProcess.run` for any new `glab` / `az` invocation so stderr matchers (`.includes("authentication failed")`) don't mis-fire under non-English locales.
- Use the existing `truncateSourceControlDetailContent` helper from `@s3tools/contracts` for body+comments truncation. Don't reinvent.
- Stay on the feature branch — don't commit to `main`.

---

## File Structure (preview)

| Path                                                                     | Status | Responsibility                                                                                                                 |
| ------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/server/src/sourceControl/gitLabIssues.ts`                          | create | `glab` JSON decoders for issue list + detail.                                                                                  |
| `apps/server/src/sourceControl/gitLabIssues.test.ts`                     | create | Decoder unit tests.                                                                                                            |
| `apps/server/src/sourceControl/gitLabMergeRequests.ts`                   | modify | Add `decodeGitLabMergeRequestDetailJson` (body + notes/comments).                                                              |
| `apps/server/src/sourceControl/gitLabMergeRequests.test.ts`              | create | Detail-decoder tests (file may not exist yet — test ergonomics modeled on `gitHubPullRequests.test.ts`).                       |
| `apps/server/src/sourceControl/GitLabCli.ts`                             | modify | Extend shape with `listIssues`, `getIssue`, `searchIssues`, `searchMergeRequests`, `getMergeRequestDetail`.                    |
| `apps/server/src/sourceControl/GitLabCli.test.ts`                        | modify | New CLI invocation tests.                                                                                                      |
| `apps/server/src/sourceControl/GitLabSourceControlProvider.ts`           | modify | Replace 5 `Effect.fail("not implemented")` stubs with real `GitLabCli` calls + truncation.                                     |
| `apps/server/src/sourceControl/GitLabSourceControlProvider.test.ts`      | modify | Provider-level tests for the 5 newly implemented methods.                                                                      |
| `apps/server/src/sourceControl/bitbucketIssues.ts`                       | create | Bitbucket REST JSON decoders for issue list + detail.                                                                          |
| `apps/server/src/sourceControl/bitbucketIssues.test.ts`                  | create | Decoder unit tests.                                                                                                            |
| `apps/server/src/sourceControl/bitbucketPullRequests.ts`                 | modify | Add `decodeBitbucketPullRequestDetailJson` (body + comments).                                                                  |
| `apps/server/src/sourceControl/bitbucketPullRequests.test.ts`            | create | Detail-decoder tests (may not exist; mirror `gitHubPullRequests.test.ts`).                                                     |
| `apps/server/src/sourceControl/BitbucketApi.ts`                          | modify | Extend shape with `listIssues`, `getIssue`, `searchIssues`, `searchPullRequests`, `getPullRequestDetail`.                      |
| `apps/server/src/sourceControl/BitbucketApi.test.ts`                     | modify | New REST invocation tests with mocked `HttpClient`.                                                                            |
| `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`        | modify | Replace 5 stubs with real `BitbucketApi` calls + truncation.                                                                   |
| `apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts`   | modify | Provider tests for the 5 newly implemented methods.                                                                            |
| `apps/server/src/sourceControl/azureDevOpsWorkItems.ts`                  | create | `az boards work-item` JSON decoders for list + detail.                                                                         |
| `apps/server/src/sourceControl/azureDevOpsWorkItems.test.ts`             | create | Decoder unit tests.                                                                                                            |
| `apps/server/src/sourceControl/azureDevOpsPullRequests.ts`               | modify | Add `decodeAzureDevOpsPullRequestDetailJson` (body + thread comments).                                                         |
| `apps/server/src/sourceControl/azureDevOpsPullRequests.test.ts`          | create | Detail-decoder tests (may not exist; mirror peer files).                                                                       |
| `apps/server/src/sourceControl/AzureDevOpsCli.ts`                        | modify | Extend shape with `listWorkItems`, `getWorkItem`, `searchWorkItems`, `searchPullRequests`, `getPullRequestDetail`.             |
| `apps/server/src/sourceControl/AzureDevOpsCli.test.ts`                   | modify | New CLI invocation tests.                                                                                                      |
| `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts`      | modify | Replace 5 stubs with real `AzureDevOpsCli` calls + truncation.                                                                 |
| `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.test.ts` | modify | Provider tests for the 5 newly implemented methods.                                                                            |
| `apps/web/src/components/chat/ChatComposer.tsx`                          | modify | Wire `hasSourceControlRemote` to `useSourceControlDiscovery()`. Hook up "already attached" toast and (optional) direct-attach. |
| `apps/web/src/components/chat/ContextPickerList.tsx`                     | modify | Render `updatedAt` date column.                                                                                                |
| `apps/web/src/components/chat/ContextPickerPopup.tsx`                    | modify | Pass `count` for each tab.                                                                                                     |
| `apps/web/src/composerDraftStore.ts`                                     | modify | `addSourceControlContext` returns `{ added: boolean; reason?: 'duplicate' }`.                                                  |
| `apps/web/src/composerDraftStore.test.tsx`                               | modify | Tests for the new return shape + duplicate-no-op semantics.                                                                    |
| `apps/web/src/composer-logic.ts` _(optional)_                            | modify | Direct-attach when `#<digits>`+Enter and the menu is open with that issue.                                                     |

---

## Phase 0 — Branch setup

### Task 0: Create the feature branch

**Files:** none.

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `working tree clean` and current branch `main`.

- [ ] **Step 2: Create and switch to feature branch**

```bash
git checkout -b feature/chat-context-picker-providers
```

Expected: `Switched to a new branch 'feature/chat-context-picker-providers'`.

- [ ] **Step 3: Confirm branch**

```bash
git branch --show-current
```

Expected: `feature/chat-context-picker-providers`.

---

## Phase 1 — Cluster 1: GitLab provider

Pattern reference: `apps/server/src/sourceControl/gitHubIssues.ts`, `GitHubCli.ts` (issue methods at lines 406–565), and `GitHubSourceControlProvider.ts` (lines 247–289).

### Task 1: `gitLabIssues.ts` decoder module

**Files:**

- Create: `apps/server/src/sourceControl/gitLabIssues.ts`
- Create: `apps/server/src/sourceControl/gitLabIssues.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/sourceControl/gitLabIssues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import { decodeGitLabIssueDetailJson, decodeGitLabIssueListJson } from "./gitLabIssues.ts";

describe("decodeGitLabIssueListJson", () => {
  it("decodes a valid list and normalizes state", () => {
    const raw = JSON.stringify([
      {
        iid: 42,
        title: "Remove stale todos",
        web_url: "https://gitlab.com/owner/repo/-/issues/42",
        state: "opened",
        updated_at: "2026-03-14T10:00:00Z",
        author: { username: "alice" },
        labels: ["bug", "good-first-issue"],
      },
    ]);
    const result = decodeGitLabIssueListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success).toHaveLength(1);
    expect(result.success[0]?.number).toBe(42);
    expect(result.success[0]?.state).toBe("open");
    expect(result.success[0]?.author).toBe("alice");
    expect(result.success[0]?.labels).toEqual(["bug", "good-first-issue"]);
  });

  it("treats 'closed' state literally and skips invalid entries", () => {
    const raw = JSON.stringify([
      { iid: "not-a-number", title: "bad" },
      {
        iid: 7,
        title: "ok",
        web_url: "https://gitlab.com/owner/repo/-/issues/7",
        state: "closed",
      },
    ]);
    const result = decodeGitLabIssueListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.map((i) => i.number)).toEqual([7]);
    expect(result.success[0]?.state).toBe("closed");
  });

  it("fails on non-JSON", () => {
    const result = decodeGitLabIssueListJson("{not json");
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("decodeGitLabIssueDetailJson", () => {
  it("decodes description and notes as body + comments", () => {
    const raw = JSON.stringify({
      iid: 42,
      title: "title",
      web_url: "https://gitlab.com/owner/repo/-/issues/42",
      state: "opened",
      description: "issue body",
      notes: [
        {
          author: { username: "bob" },
          body: "first",
          created_at: "2026-03-14T10:00:00Z",
        },
        {
          author: null,
          body: "second",
          created_at: "2026-03-14T11:00:00Z",
        },
      ],
    });
    const result = decodeGitLabIssueDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("issue body");
    expect(result.success.comments).toHaveLength(2);
    expect(result.success.comments[0]?.author).toBe("bob");
    expect(result.success.comments[1]?.author).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

```bash
bun run test apps/server/src/sourceControl/gitLabIssues.test.ts
```

Expected: FAIL with `Cannot find module './gitLabIssues.ts'`.

- [ ] **Step 3: Implement `gitLabIssues.ts`**

Create `apps/server/src/sourceControl/gitLabIssues.ts`:

```ts
import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@s3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@s3tools/shared/schemaJson";

export interface NormalizedGitLabIssueRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

export interface NormalizedGitLabIssueDetail extends NormalizedGitLabIssueRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const GitLabIssueSchema = Schema.Struct({
  iid: PositiveInt,
  title: TrimmedNonEmptyString,
  web_url: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updated_at: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        username: Schema.optional(Schema.String),
        name: Schema.optional(Schema.String),
      }),
    ),
  ),
  labels: Schema.optional(Schema.Array(Schema.String)),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  notes: Schema.optional(
    Schema.Array(
      Schema.Struct({
        author: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              username: Schema.optional(Schema.String),
              name: Schema.optional(Schema.String),
            }),
          ),
        ),
        body: Schema.String,
        created_at: Schema.String,
      }),
    ),
  ),
});

function normalizeIssueState(raw: string | null | undefined): "open" | "closed" {
  return raw?.trim().toLowerCase() === "closed" ? "closed" : "open";
}

function authorName(
  author: { readonly username?: string; readonly name?: string } | null | undefined,
): string | null {
  return author?.username?.trim() || author?.name?.trim() || null;
}

function normalizeGitLabIssueRecord(
  raw: Schema.Schema.Type<typeof GitLabIssueSchema>,
): NormalizedGitLabIssueRecord {
  return {
    number: raw.iid,
    title: raw.title,
    url: raw.web_url,
    state: normalizeIssueState(raw.state),
    author: authorName(raw.author),
    updatedAt: raw.updated_at ? Option.some(raw.updated_at) : Option.none(),
    labels: raw.labels ?? [],
  };
}

const decodeIssueList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeIssueDetail = decodeJsonResult(GitLabIssueSchema);
const decodeIssueEntry = Schema.decodeUnknownExit(GitLabIssueSchema);

export const formatGitLabIssueDecodeError = formatSchemaError;

export function decodeGitLabIssueListJson(
  raw: string,
): Result.Result<ReadonlyArray<NormalizedGitLabIssueRecord>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const issues: NormalizedGitLabIssueRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodeIssueEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    issues.push(normalizeGitLabIssueRecord(decoded.value));
  }
  return Result.succeed(issues);
}

export function decodeGitLabIssueDetailJson(
  raw: string,
): Result.Result<NormalizedGitLabIssueDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeGitLabIssueRecord(result.success);
  const detail: NormalizedGitLabIssueDetail = {
    ...summary,
    body: result.success.description ?? "",
    comments: (result.success.notes ?? []).map((note) => ({
      author: authorName(note.author) ?? "unknown",
      body: note.body,
      createdAt: note.created_at,
    })),
  };
  return Result.succeed(detail);
}
```

- [ ] **Step 4: Re-run test (expect pass)**

```bash
bun run test apps/server/src/sourceControl/gitLabIssues.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/gitLabIssues.ts apps/server/src/sourceControl/gitLabIssues.test.ts
git commit -m "server(sc): add gitLabIssues decoder module"
```

---

### Task 2: Extend `gitLabMergeRequests.ts` with detail decoder

**Files:**

- Modify: `apps/server/src/sourceControl/gitLabMergeRequests.ts`
- Create: `apps/server/src/sourceControl/gitLabMergeRequests.test.ts`

The existing decoder produces a `NormalizedGitLabMergeRequestRecord`. We need a parallel `NormalizedGitLabMergeRequestDetail` that adds `body` and `comments`, sourced from `description` and `notes` respectively (mirrors GitLab API).

- [ ] **Step 1: Write the failing test**

Create `apps/server/src/sourceControl/gitLabMergeRequests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import {
  decodeGitLabMergeRequestDetailJson,
  decodeGitLabMergeRequestListJson,
} from "./gitLabMergeRequests.ts";

describe("decodeGitLabMergeRequestListJson (sanity for existing list shape)", () => {
  it("decodes minimal MR list", () => {
    const raw = JSON.stringify([
      {
        iid: 1,
        title: "MR title",
        web_url: "https://gitlab.com/owner/repo/-/merge_requests/1",
        target_branch: "main",
        source_branch: "feature/x",
        state: "opened",
      },
    ]);
    const result = decodeGitLabMergeRequestListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
  });
});

describe("decodeGitLabMergeRequestDetailJson", () => {
  it("decodes description and notes as body + comments", () => {
    const raw = JSON.stringify({
      iid: 12,
      title: "Add feature",
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/12",
      target_branch: "main",
      source_branch: "feature/add",
      state: "opened",
      description: "MR body text",
      notes: [
        {
          author: { username: "reviewer" },
          body: "looks good",
          created_at: "2026-03-01T10:00:00Z",
        },
      ],
    });
    const result = decodeGitLabMergeRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.number).toBe(12);
    expect(result.success.body).toBe("MR body text");
    expect(result.success.comments).toHaveLength(1);
    expect(result.success.comments[0]?.author).toBe("reviewer");
  });

  it("handles missing description / notes gracefully", () => {
    const raw = JSON.stringify({
      iid: 13,
      title: "no body",
      web_url: "https://gitlab.com/owner/repo/-/merge_requests/13",
      target_branch: "main",
      source_branch: "feature/empty",
      state: "merged",
    });
    const result = decodeGitLabMergeRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("");
    expect(result.success.comments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
bun run test apps/server/src/sourceControl/gitLabMergeRequests.test.ts
```

Expected: FAIL — `decodeGitLabMergeRequestDetailJson` is not exported.

- [ ] **Step 3: Extend `gitLabMergeRequests.ts`**

Append to `apps/server/src/sourceControl/gitLabMergeRequests.ts` (do NOT remove or alter existing exports):

```ts
export interface NormalizedGitLabMergeRequestDetail extends NormalizedGitLabMergeRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const GitLabMergeRequestDetailSchema = Schema.Struct({
  ...GitLabMergeRequestSchema.fields,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  notes: Schema.optional(
    Schema.Array(
      Schema.Struct({
        author: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              username: Schema.optional(Schema.String),
              name: Schema.optional(Schema.String),
            }),
          ),
        ),
        body: Schema.String,
        created_at: Schema.String,
      }),
    ),
  ),
});

const decodeGitLabMergeRequestDetail = decodeJsonResult(GitLabMergeRequestDetailSchema);

function authorNameFromMr(
  author: { readonly username?: string; readonly name?: string } | null | undefined,
): string | null {
  return author?.username?.trim() || author?.name?.trim() || null;
}

export function decodeGitLabMergeRequestDetailJson(
  raw: string,
): Result.Result<NormalizedGitLabMergeRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeGitLabMergeRequestDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeGitLabMergeRequestRecord(result.success);
  const detail: NormalizedGitLabMergeRequestDetail = {
    ...summary,
    body: result.success.description ?? "",
    comments: (result.success.notes ?? []).map((note) => ({
      author: authorNameFromMr(note.author) ?? "unknown",
      body: note.body,
      createdAt: note.created_at,
    })),
  };
  return Result.succeed(detail);
}
```

- [ ] **Step 4: Re-run test (expect pass)**

```bash
bun run test apps/server/src/sourceControl/gitLabMergeRequests.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/gitLabMergeRequests.ts apps/server/src/sourceControl/gitLabMergeRequests.test.ts
git commit -m "server(sc): add gitLab MR detail decoder"
```

---

### Task 3: Extend `GitLabCli` interface with new methods (stubbed)

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabCli.ts`

Mirrors Plan 1 Task 6 for GitHub. Add the 5 new method signatures and provide `Effect.fail`-based stubs in `make()` so the layer typechecks. Tasks 4–8 replace each stub.

- [ ] **Step 1: Add types and shape methods**

Edit `apps/server/src/sourceControl/GitLabCli.ts`. At the top of the file, after the existing imports, add:

```ts
import * as GitLabIssues from "./gitLabIssues.ts";
import type { NormalizedGitLabIssueDetail, NormalizedGitLabIssueRecord } from "./gitLabIssues.ts";
import type { NormalizedGitLabMergeRequestDetail } from "./gitLabMergeRequests.ts";
```

Inside `GitLabCliShape`, append (after `checkoutMergeRequest`):

```ts
readonly listIssues: (input: {
  readonly cwd: string;
  readonly state: "open" | "closed" | "all";
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<NormalizedGitLabIssueRecord>, GitLabCliError>;

readonly getIssue: (input: {
  readonly cwd: string;
  readonly reference: string;
}) => Effect.Effect<NormalizedGitLabIssueDetail, GitLabCliError>;

readonly searchIssues: (input: {
  readonly cwd: string;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<NormalizedGitLabIssueRecord>, GitLabCliError>;

readonly searchMergeRequests: (input: {
  readonly cwd: string;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<GitLabMergeRequestSummary>, GitLabCliError>;

readonly getMergeRequestDetail: (input: {
  readonly cwd: string;
  readonly reference: string;
}) => Effect.Effect<NormalizedGitLabMergeRequestDetail, GitLabCliError>;
```

- [ ] **Step 2: Add stubs to `make()`**

In the same file, inside the `GitLabCli.of({ ... })` block (returned from `make`), add the 5 stub fields after `checkoutMergeRequest`:

```ts
listIssues: () =>
  Effect.fail(
    new GitLabCliError({ operation: "listIssues", detail: "stub" }),
  ),
getIssue: () =>
  Effect.fail(
    new GitLabCliError({ operation: "getIssue", detail: "stub" }),
  ),
searchIssues: () =>
  Effect.fail(
    new GitLabCliError({ operation: "searchIssues", detail: "stub" }),
  ),
searchMergeRequests: () =>
  Effect.fail(
    new GitLabCliError({ operation: "searchMergeRequests", detail: "stub" }),
  ),
getMergeRequestDetail: () =>
  Effect.fail(
    new GitLabCliError({ operation: "getMergeRequestDetail", detail: "stub" }),
  ),
```

- [ ] **Step 3: Confirm typecheck**

```bash
cd /Users/laurinfrank/Library/CloudStorage/Dropbox/Code/s3code && bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Confirm existing tests still pass**

```bash
bun run test apps/server/src/sourceControl/GitLabCli.test.ts
```

Expected: PASS (no new tests yet — sanity check only).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitLabCli.ts
git commit -m "server(sc): extend GitLabCli shape with new methods (stubbed)"
```

---

### Task 4: Implement `GitLabCli.listIssues`

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabCli.ts`
- Modify: `apps/server/src/sourceControl/GitLabCli.test.ts`

Pattern reference: `GitHubCli.ts:406–438` for `listIssues` and the existing `listMergeRequests` in `GitLabCli.ts:268–303`.

- [ ] **Step 1: Write the failing test**

Append to `apps/server/src/sourceControl/GitLabCli.test.ts` inside the existing `layer("GitLabCli.layer", (it) => { ... })` block:

```ts
it.effect("listIssues invokes glab with correct args and decodes output", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(
      Effect.succeed(
        processOutput(
          JSON.stringify([
            {
              iid: 42,
              title: "Bug",
              web_url: "https://gitlab.com/owner/repo/-/issues/42",
              state: "opened",
              author: { username: "alice" },
              labels: ["bug"],
            },
          ]),
        ),
      ),
    );
    const issues = yield* Effect.gen(function* () {
      const glab = yield* GitLabCli.GitLabCli;
      return yield* glab.listIssues({ cwd: "/repo", state: "open", limit: 20 });
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.number).toBe(42);
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "glab",
        cwd: "/repo",
        args: ["issue", "list", "--per-page", "20", "--output", "json"],
        env: expect.objectContaining({ LC_ALL: "C" }),
      }),
    );
  }),
);
```

- [ ] **Step 2: Run test (expect failure)**

```bash
bun run test apps/server/src/sourceControl/GitLabCli.test.ts
```

Expected: FAIL — stub returns `Effect.fail("stub")`.

- [ ] **Step 3: Replace stub with real implementation**

`glab issue list` defaults to opened (no flag); pass `--closed` or `--all` only when the caller asks for those states.

In `apps/server/src/sourceControl/GitLabCli.ts`, replace the `listIssues` stub inside `make()` with:

```ts
listIssues: (input) => {
  const stateFlags =
    input.state === "open"
      ? []
      : input.state === "closed"
        ? ["--closed"]
        : ["--all"];
  return execute({
    cwd: input.cwd,
    args: [
      "issue",
      "list",
      ...stateFlags,
      "--per-page",
      String(input.limit ?? 50),
      "--output",
      "json",
    ],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() => GitLabIssues.decodeGitLabIssueListJson(raw)).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success)
                : Effect.fail(
                    new GitLabCliError({
                      operation: "listIssues",
                      detail: `GitLab CLI returned invalid issue list JSON: ${GitLabIssues.formatGitLabIssueDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  );
},
```

- [ ] **Step 4: Add `LC_ALL=C` to the `execute` helper**

Find the `execute` helper inside `make()` (currently `apps/server/src/sourceControl/GitLabCli.ts:255–264`). Update its `process.run({ ... })` invocation to include `env: { LC_ALL: "C" }`:

```ts
const execute: GitLabCliShape["execute"] = (input) =>
  process
    .run({
      operation: "GitLabCli.execute",
      command: "glab",
      args: input.args,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      env: { LC_ALL: "C" },
    })
    .pipe(Effect.mapError((error) => normalizeGitLabCliError("execute", error)));
```

This propagates to all `glab` invocations and makes existing tests' `expect.objectContaining({ env: ... })` assertions pass for the new methods.

- [ ] **Step 5: Run test (expect pass)**

```bash
bun run test apps/server/src/sourceControl/GitLabCli.test.ts
```

Expected: PASS for both old and new tests.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sourceControl/GitLabCli.ts apps/server/src/sourceControl/GitLabCli.test.ts
git commit -m "server(sc): implement GitLabCli.listIssues"
```

---

### Task 5: Implement `GitLabCli.getIssue`

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabCli.ts`
- Modify: `apps/server/src/sourceControl/GitLabCli.test.ts`

`glab issue view <ref> --output json` returns the issue with `description` and `notes` inline when `--comments` is passed. Verify in the implementer subagent's first action: run `glab issue view --help 2>&1 | grep -i -E 'comments|notes|description'`. If `--comments` is not supported in the available `glab` version, fall back to two calls — one `glab issue view <ref> --output json` for description, one `glab api projects/:fullpath/issues/<iid>/notes` for notes — and merge in the CLI wrapper. If unsure, pick the single-call path; the decoder already handles `notes` being absent.

- [ ] **Step 1: Write the failing test**

Append to `GitLabCli.test.ts`:

```ts
it.effect("getIssue invokes glab issue view with --comments and decodes detail", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(
      Effect.succeed(
        processOutput(
          JSON.stringify({
            iid: 7,
            title: "Detailed",
            web_url: "https://gitlab.com/owner/repo/-/issues/7",
            state: "opened",
            description: "issue body",
            notes: [
              { author: { username: "bob" }, body: "first", created_at: "2026-03-14T10:00:00Z" },
            ],
          }),
        ),
      ),
    );
    const detail = yield* Effect.gen(function* () {
      const glab = yield* GitLabCli.GitLabCli;
      return yield* glab.getIssue({ cwd: "/repo", reference: "7" });
    });
    expect(detail.body).toBe("issue body");
    expect(detail.comments[0]?.author).toBe("bob");
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "glab",
        cwd: "/repo",
        args: ["issue", "view", "7", "--comments", "--output", "json"],
      }),
    );
  }),
);
```

- [ ] **Step 2: Run test (expect failure)**

```bash
bun run test apps/server/src/sourceControl/GitLabCli.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Replace stub**

In `apps/server/src/sourceControl/GitLabCli.ts`, replace the `getIssue` stub with:

```ts
getIssue: (input) =>
  execute({
    cwd: input.cwd,
    args: ["issue", "view", input.reference, "--comments", "--output", "json"],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      Effect.sync(() => GitLabIssues.decodeGitLabIssueDetailJson(raw)).pipe(
        Effect.flatMap((decoded) =>
          Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(
                new GitLabCliError({
                  operation: "getIssue",
                  detail: `GitLab CLI returned invalid issue JSON: ${GitLabIssues.formatGitLabIssueDecodeError(decoded.failure)}`,
                  cause: decoded.failure,
                }),
              ),
        ),
      ),
    ),
  ),
```

- [ ] **Step 4: Run test (expect pass)**

```bash
bun run test apps/server/src/sourceControl/GitLabCli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitLabCli.ts apps/server/src/sourceControl/GitLabCli.test.ts
git commit -m "server(sc): implement GitLabCli.getIssue"
```

---

### Task 6: Implement `GitLabCli.searchIssues`

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabCli.ts`
- Modify: `apps/server/src/sourceControl/GitLabCli.test.ts`

`glab issue list --search "<q>"` returns issues matching the query; same JSON shape as `list`.

- [ ] **Step 1: Write failing test**

Append to `GitLabCli.test.ts`:

```ts
it.effect("searchIssues forwards query and limit to glab issue list --search", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(Effect.succeed(processOutput("[]")));
    yield* Effect.gen(function* () {
      const glab = yield* GitLabCli.GitLabCli;
      return yield* glab.searchIssues({ cwd: "/repo", query: "memory leak", limit: 30 });
    });
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "glab",
        cwd: "/repo",
        args: ["issue", "list", "--search", "memory leak", "--per-page", "30", "--output", "json"],
      }),
    );
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
searchIssues: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "issue",
      "list",
      "--search",
      input.query,
      "--per-page",
      String(input.limit ?? 20),
      "--output",
      "json",
    ],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() => GitLabIssues.decodeGitLabIssueListJson(raw)).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success)
                : Effect.fail(
                    new GitLabCliError({
                      operation: "searchIssues",
                      detail: `GitLab CLI returned invalid issue list JSON: ${GitLabIssues.formatGitLabIssueDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  ),
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitLabCli.ts apps/server/src/sourceControl/GitLabCli.test.ts
git commit -m "server(sc): implement GitLabCli.searchIssues"
```

---

### Task 7: Implement `GitLabCli.searchMergeRequests`

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabCli.ts`
- Modify: `apps/server/src/sourceControl/GitLabCli.test.ts`

`glab mr list --search "<q>" --output json`. Re-uses the existing `decodeGitLabMergeRequestListJson` decoder.

- [ ] **Step 1: Failing test**

```ts
it.effect("searchMergeRequests forwards query to glab mr list --search", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(Effect.succeed(processOutput("[]")));
    yield* Effect.gen(function* () {
      const glab = yield* GitLabCli.GitLabCli;
      return yield* glab.searchMergeRequests({ cwd: "/repo", query: "fix" });
    });
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "glab",
        cwd: "/repo",
        args: ["mr", "list", "--search", "fix", "--per-page", "20", "--output", "json"],
      }),
    );
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

Add an import (top of file): `import * as GitLabMergeRequests from "./gitLabMergeRequests.ts";` if one is not already present (it is — line 6). Add this to the `toSummaryWithOptionalUpdatedAt` helper site so we can re-use it. Then replace `searchMergeRequests` stub with:

```ts
searchMergeRequests: (input) =>
  execute({
    cwd: input.cwd,
    args: [
      "mr",
      "list",
      "--search",
      input.query,
      "--per-page",
      String(input.limit ?? 20),
      "--output",
      "json",
    ],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() => GitLabMergeRequests.decodeGitLabMergeRequestListJson(raw)).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success.map(toSummaryWithOptionalUpdatedAt))
                : Effect.fail(
                    new GitLabCliError({
                      operation: "searchMergeRequests",
                      detail: `GitLab CLI returned invalid MR list JSON: ${GitLabMergeRequests.formatGitLabJsonDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  ),
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitLabCli.ts apps/server/src/sourceControl/GitLabCli.test.ts
git commit -m "server(sc): implement GitLabCli.searchMergeRequests"
```

---

### Task 8: Implement `GitLabCli.getMergeRequestDetail`

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabCli.ts`
- Modify: `apps/server/src/sourceControl/GitLabCli.test.ts`

`glab mr view <ref> --comments --output json` returns description + notes.

- [ ] **Step 1: Failing test**

```ts
it.effect("getMergeRequestDetail decodes description and notes", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(
      Effect.succeed(
        processOutput(
          JSON.stringify({
            iid: 99,
            title: "Add feature",
            web_url: "https://gitlab.com/owner/repo/-/merge_requests/99",
            target_branch: "main",
            source_branch: "feature/add",
            state: "opened",
            description: "MR body text",
            notes: [
              {
                author: { username: "reviewer" },
                body: "looks good",
                created_at: "2026-03-01T10:00:00Z",
              },
            ],
          }),
        ),
      ),
    );
    const detail = yield* Effect.gen(function* () {
      const glab = yield* GitLabCli.GitLabCli;
      return yield* glab.getMergeRequestDetail({ cwd: "/repo", reference: "99" });
    });
    expect(detail.body).toBe("MR body text");
    expect(detail.comments[0]?.author).toBe("reviewer");
    expect(mockedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "glab",
        cwd: "/repo",
        args: ["mr", "view", "99", "--comments", "--output", "json"],
      }),
    );
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
getMergeRequestDetail: (input) =>
  execute({
    cwd: input.cwd,
    args: ["mr", "view", input.reference, "--comments", "--output", "json"],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      Effect.sync(() => GitLabMergeRequests.decodeGitLabMergeRequestDetailJson(raw)).pipe(
        Effect.flatMap((decoded) =>
          Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(
                new GitLabCliError({
                  operation: "getMergeRequestDetail",
                  detail: `GitLab CLI returned invalid merge request JSON: ${GitLabMergeRequests.formatGitLabJsonDecodeError(decoded.failure)}`,
                  cause: decoded.failure,
                }),
              ),
        ),
      ),
    ),
  ),
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/GitLabCli.ts apps/server/src/sourceControl/GitLabCli.test.ts
git commit -m "server(sc): implement GitLabCli.getMergeRequestDetail"
```

---

### Task 9: Wire `GitLabSourceControlProvider`

**Files:**

- Modify: `apps/server/src/sourceControl/GitLabSourceControlProvider.ts`
- Modify: `apps/server/src/sourceControl/GitLabSourceControlProvider.test.ts`

Replace the 5 `Effect.fail(... "Not implemented...")` stubs with real calls to the now-implemented `GitLabCli` methods. Pattern reference: `GitHubSourceControlProvider.ts:247–289` exactly.

- [ ] **Step 1: Add imports + type-mapping helpers**

Edit `apps/server/src/sourceControl/GitLabSourceControlProvider.ts`. Replace the existing imports block at the top with:

```ts
import { DateTime, Effect, Layer, Option } from "effect";
import {
  SourceControlProviderError,
  truncateSourceControlDetailContent,
  type ChangeRequest,
  type SourceControlChangeRequestDetail,
  type SourceControlIssueDetail,
  type SourceControlIssueSummary,
} from "@s3tools/contracts";

import * as GitLabCli from "./GitLabCli.ts";
import * as GitLabIssues from "./gitLabIssues.ts";
import * as GitLabMergeRequests from "./gitLabMergeRequests.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import * as SourceControlProviderDiscovery from "./SourceControlProviderDiscovery.ts";
```

After the existing `toChangeRequest` function (around line 20), add:

```ts
function toIssueSummary(raw: GitLabIssues.NormalizedGitLabIssueRecord): SourceControlIssueSummary {
  return {
    provider: "gitlab",
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    ...(raw.author ? { author: raw.author } : {}),
    updatedAt: raw.updatedAt.pipe(Option.map((s) => DateTime.fromDateUnsafe(new Date(s)))),
    labels: raw.labels,
  };
}

function toIssueDetail(raw: GitLabIssues.NormalizedGitLabIssueDetail): SourceControlIssueDetail {
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
      createdAt: DateTime.fromDateUnsafe(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
}

function toChangeRequestDetail(
  raw: GitLabMergeRequests.NormalizedGitLabMergeRequestDetail,
): SourceControlChangeRequestDetail {
  const truncated = truncateSourceControlDetailContent({
    body: raw.body,
    comments: raw.comments,
  });
  return {
    ...toChangeRequest(raw),
    body: truncated.body,
    comments: truncated.comments.map((c) => ({
      author: c.author,
      body: c.body,
      createdAt: DateTime.fromDateUnsafe(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
}
```

- [ ] **Step 2: Replace the 5 stub blocks**

Replace each `Effect.fail(...)` stub block in `GitLabSourceControlProvider.ts:141–180` with the real implementation:

```ts
listIssues: (input) =>
  gitlab
    .listIssues({
      cwd: input.cwd,
      state: input.state,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toIssueSummary)),
      Effect.mapError((error) => providerError("listIssues", error)),
    ),
getIssue: (input) =>
  gitlab.getIssue({ cwd: input.cwd, reference: input.reference }).pipe(
    Effect.map(toIssueDetail),
    Effect.mapError((error) => providerError("getIssue", error)),
  ),
searchIssues: (input) =>
  gitlab
    .searchIssues({
      cwd: input.cwd,
      query: input.query,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toIssueSummary)),
      Effect.mapError((error) => providerError("searchIssues", error)),
    ),
searchChangeRequests: (input) =>
  gitlab
    .searchMergeRequests({
      cwd: input.cwd,
      query: input.query,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toChangeRequest)),
      Effect.mapError((error) => providerError("searchChangeRequests", error)),
    ),
getChangeRequestDetail: (input) =>
  gitlab.getMergeRequestDetail({ cwd: input.cwd, reference: input.reference }).pipe(
    Effect.map(toChangeRequestDetail),
    Effect.mapError((error) => providerError("getChangeRequestDetail", error)),
  ),
```

- [ ] **Step 3: Add provider tests**

Replace `apps/server/src/sourceControl/GitLabSourceControlProvider.test.ts`'s contents with the GitHub provider tests pattern. Open the file and append (after the existing tests):

```ts
import { DateTime, Option } from "effect";
import { SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES } from "@s3tools/contracts";

it.effect("listIssues maps GitLab summaries to provider: gitlab", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      listIssues: () =>
        Effect.succeed([
          {
            number: 42,
            title: "Bug",
            url: "https://gitlab.com/owner/repo/-/issues/42",
            state: "open" as const,
            author: "alice",
            updatedAt: Option.some("2026-01-02T00:00:00.000Z"),
            labels: ["bug"],
          },
        ]),
    });
    const issues = yield* provider.listIssues({ cwd: "/repo", state: "open" });
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0]?.provider, "gitlab");
    assert.strictEqual(issues[0]?.number, 42);
    assert.deepStrictEqual(
      issues[0]?.updatedAt,
      Option.some(DateTime.fromDateUnsafe(new Date("2026-01-02T00:00:00.000Z"))),
    );
  }),
);

it.effect("getIssue truncates body when over 8 KB", () =>
  Effect.gen(function* () {
    const bigBody = "x".repeat(SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES + 100);
    const provider = yield* makeProvider({
      getIssue: () =>
        Effect.succeed({
          number: 7,
          title: "Big",
          url: "https://gitlab.com/owner/repo/-/issues/7",
          state: "open" as const,
          author: "bob",
          updatedAt: Option.none(),
          labels: [],
          body: bigBody,
          comments: [],
        }),
    });
    const detail = yield* provider.getIssue({ cwd: "/repo", reference: "7" });
    assert.strictEqual(detail.truncated, true);
    assert.strictEqual(detail.provider, "gitlab");
    assert.ok(Buffer.byteLength(detail.body, "utf8") <= SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES);
  }),
);

it.effect("searchIssues forwards query to cli.searchIssues", () =>
  Effect.gen(function* () {
    let captured: string | undefined;
    const provider = yield* makeProvider({
      searchIssues: (input) => {
        captured = input.query;
        return Effect.succeed([]);
      },
    });
    yield* provider.searchIssues({ cwd: "/repo", query: "memory leak" });
    assert.strictEqual(captured, "memory leak");
  }),
);

it.effect("searchChangeRequests forwards query to cli.searchMergeRequests", () =>
  Effect.gen(function* () {
    let captured: string | undefined;
    const provider = yield* makeProvider({
      searchMergeRequests: (input) => {
        captured = input.query;
        return Effect.succeed([]);
      },
    });
    yield* provider.searchChangeRequests({ cwd: "/repo", query: "fix" });
    assert.strictEqual(captured, "fix");
  }),
);

it.effect("getChangeRequestDetail returns body and comments", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      getMergeRequestDetail: () =>
        Effect.succeed({
          number: 99,
          title: "Add feature",
          url: "https://gitlab.com/owner/repo/-/merge_requests/99",
          baseRefName: "main",
          headRefName: "feature/add",
          state: "open" as const,
          updatedAt: Option.none(),
          body: "MR body text",
          comments: [{ author: "reviewer", body: "looks good", createdAt: "2026-03-01T10:00:00Z" }],
        }),
    });
    const detail = yield* provider.getChangeRequestDetail({ cwd: "/repo", reference: "99" });
    assert.strictEqual(detail.provider, "gitlab");
    assert.strictEqual(detail.number, 99);
    assert.strictEqual(detail.body, "MR body text");
    assert.strictEqual(detail.comments.length, 1);
    assert.strictEqual(detail.comments[0]?.author, "reviewer");
    assert.strictEqual(detail.truncated, false);
  }),
);
```

If the existing test file does not have a `makeProvider` helper, add it once near the top:

```ts
function makeProvider(gitlab: Partial<GitLabCli.GitLabCliShape>) {
  return GitLabSourceControlProvider.make().pipe(
    Effect.provide(Layer.mock(GitLabCli.GitLabCli)(gitlab)),
  );
}
```

(Reference: `GitHubSourceControlProvider.test.ts:18–22`.)

- [ ] **Step 4: Run all GitLab tests**

```bash
bun run test apps/server/src/sourceControl/GitLabSourceControlProvider.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run typecheck and full test suite scoped to source-control**

```bash
bun typecheck
bun run test apps/server/src/sourceControl
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sourceControl/GitLabSourceControlProvider.ts apps/server/src/sourceControl/GitLabSourceControlProvider.test.ts
git commit -m "server(sc): wire GitLab issue + MR detail methods"
```

---

## Phase 2 — Cluster 2: Bitbucket provider

Pattern reference: `apps/server/src/sourceControl/BitbucketApi.ts:371+` (HTTP request helpers `executeJson`, `withAuth`, `decodeResponse`); existing `listPullRequests` / `getPullRequest`. Issues are at `/repositories/{w}/{r}/issues`, comments at `/repositories/{w}/{r}/issues/{id}/comments`, PR comments at `/repositories/{w}/{r}/pullrequests/{id}/comments`.

### Task 10: `bitbucketIssues.ts` decoder module

**Files:**

- Create: `apps/server/src/sourceControl/bitbucketIssues.ts`
- Create: `apps/server/src/sourceControl/bitbucketIssues.test.ts`

Bitbucket issue JSON shape (per their REST docs):

```json
{
  "values": [
    {
      "id": 42,
      "title": "Issue title",
      "state": "open",
      "updated_on": "2026-03-14T10:00:00Z",
      "reporter": { "display_name": "Alice", "username": "alice" },
      "links": { "html": { "href": "https://bitbucket.org/owner/repo/issues/42" } }
    }
  ]
}
```

- [ ] **Step 1: Failing test**

Create `apps/server/src/sourceControl/bitbucketIssues.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import { decodeBitbucketIssueDetailJson, decodeBitbucketIssueListJson } from "./bitbucketIssues.ts";

describe("decodeBitbucketIssueListJson", () => {
  it("decodes paged issues into normalized records", () => {
    const raw = JSON.stringify({
      values: [
        {
          id: 42,
          title: "Bug",
          state: "open",
          updated_on: "2026-03-14T10:00:00Z",
          reporter: { display_name: "Alice", username: "alice" },
          links: {
            html: { href: "https://bitbucket.org/owner/repo/issues/42" },
          },
        },
      ],
    });
    const result = decodeBitbucketIssueListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success).toHaveLength(1);
    expect(result.success[0]?.number).toBe(42);
    expect(result.success[0]?.state).toBe("open");
    expect(result.success[0]?.author).toBe("alice");
  });

  it("normalizes 'closed', 'resolved', etc. states to 'closed'", () => {
    const raw = JSON.stringify({
      values: [
        {
          id: 7,
          title: "Done",
          state: "resolved",
          links: { html: { href: "https://bitbucket.org/owner/repo/issues/7" } },
        },
      ],
    });
    const result = decodeBitbucketIssueListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success[0]?.state).toBe("closed");
  });
});

describe("decodeBitbucketIssueDetailJson", () => {
  it("decodes single issue with content body", () => {
    const raw = JSON.stringify({
      id: 42,
      title: "Detailed",
      state: "open",
      content: { raw: "issue body" },
      reporter: { username: "alice" },
      links: { html: { href: "https://bitbucket.org/owner/repo/issues/42" } },
    });
    const result = decodeBitbucketIssueDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("issue body");
    expect(result.success.comments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run (expect fail)**

```bash
bun run test apps/server/src/sourceControl/bitbucketIssues.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `apps/server/src/sourceControl/bitbucketIssues.ts`:

```ts
import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@s3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@s3tools/shared/schemaJson";

export interface NormalizedBitbucketIssueRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

export interface NormalizedBitbucketIssueDetail extends NormalizedBitbucketIssueRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const BitbucketUserSchema = Schema.Struct({
  username: Schema.optional(Schema.String),
  display_name: Schema.optional(Schema.String),
});

const BitbucketIssueSchema = Schema.Struct({
  id: PositiveInt,
  title: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updated_on: Schema.optional(Schema.NullOr(Schema.String)),
  reporter: Schema.optional(Schema.NullOr(BitbucketUserSchema)),
  links: Schema.Struct({
    html: Schema.optional(Schema.Struct({ href: TrimmedNonEmptyString })),
    self: Schema.optional(Schema.Struct({ href: Schema.String })),
  }),
  content: Schema.optional(
    Schema.NullOr(Schema.Struct({ raw: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});

const BitbucketIssueListSchema = Schema.Struct({
  values: Schema.Array(BitbucketIssueSchema),
});

function authorOf(
  reporter: { readonly username?: string; readonly display_name?: string } | null | undefined,
): string | null {
  return (reporter?.username?.trim() || reporter?.display_name?.trim()) ?? null;
}

function normalizeState(raw: string | null | undefined): "open" | "closed" {
  const s = raw?.trim().toLowerCase();
  if (!s) return "open";
  return s === "new" || s === "open" || s === "submitted" ? "open" : "closed";
}

function normalize(
  raw: Schema.Schema.Type<typeof BitbucketIssueSchema>,
): NormalizedBitbucketIssueRecord {
  return {
    number: raw.id,
    title: raw.title,
    url: raw.links.html?.href ?? "",
    state: normalizeState(raw.state),
    author: authorOf(raw.reporter),
    updatedAt: raw.updated_on ? Option.some(raw.updated_on) : Option.none(),
    labels: [],
  };
}

const decodeIssueList = decodeJsonResult(BitbucketIssueListSchema);
const decodeIssueDetail = decodeJsonResult(BitbucketIssueSchema);

export const formatBitbucketIssueDecodeError = formatSchemaError;

export function decodeBitbucketIssueListJson(
  raw: string,
): Result.Result<ReadonlyArray<NormalizedBitbucketIssueRecord>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  return Result.succeed(result.success.values.map(normalize));
}

export function decodeBitbucketIssueDetailJson(
  raw: string,
): Result.Result<NormalizedBitbucketIssueDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalize(result.success);
  return Result.succeed({
    ...summary,
    body: result.success.content?.raw ?? "",
    comments: [],
  });
}

const BitbucketCommentSchema = Schema.Struct({
  user: Schema.optional(Schema.NullOr(BitbucketUserSchema)),
  content: Schema.optional(
    Schema.NullOr(Schema.Struct({ raw: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
  created_on: Schema.String,
});

const BitbucketCommentListSchema = Schema.Struct({
  values: Schema.Array(BitbucketCommentSchema),
});

const decodeCommentList = decodeJsonResult(BitbucketCommentListSchema);

export interface BitbucketComment {
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
}

export function decodeBitbucketCommentListJson(
  raw: string,
): Result.Result<ReadonlyArray<BitbucketComment>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeCommentList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const comments: BitbucketComment[] = result.success.values
    .filter((c) => (c.content?.raw?.trim() ?? "").length > 0)
    .map((c) => ({
      author: authorOf(c.user) ?? "unknown",
      body: c.content?.raw ?? "",
      createdAt: c.created_on,
    }));
  return Result.succeed(comments);
}
```

- [ ] **Step 4: Run (expect pass)**

```bash
bun run test apps/server/src/sourceControl/bitbucketIssues.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/bitbucketIssues.ts apps/server/src/sourceControl/bitbucketIssues.test.ts
git commit -m "server(sc): add bitbucketIssues decoder module"
```

---

### Task 11: Extend `bitbucketPullRequests.ts` with detail decoder

**Files:**

- Modify: `apps/server/src/sourceControl/bitbucketPullRequests.ts`
- Create: `apps/server/src/sourceControl/bitbucketPullRequests.test.ts`

Bitbucket PR JSON has `summary.raw` for body. Comments are fetched separately via `…/pullrequests/{id}/comments`.

- [ ] **Step 1: Failing test**

Create `apps/server/src/sourceControl/bitbucketPullRequests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import { decodeBitbucketPullRequestDetailJson } from "./bitbucketPullRequests.ts";

describe("decodeBitbucketPullRequestDetailJson", () => {
  it("decodes summary.raw as body", () => {
    const raw = JSON.stringify({
      id: 12,
      title: "Add feature",
      state: "OPEN",
      summary: { raw: "PR body text" },
      source: { branch: { name: "feature/add" }, repository: { full_name: "owner/repo" } },
      destination: { branch: { name: "main" } },
      links: { html: { href: "https://bitbucket.org/owner/repo/pull-requests/12" } },
    });
    const result = decodeBitbucketPullRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("PR body text");
    expect(result.success.number).toBe(12);
  });
});
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Extend `bitbucketPullRequests.ts`**

Append (do not modify existing exports):

```ts
export interface NormalizedBitbucketPullRequestDetail extends NormalizedBitbucketPullRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const BitbucketPullRequestDetailSchema = Schema.Struct({
  ...BitbucketPullRequestSchema.fields,
  summary: Schema.optional(
    Schema.NullOr(Schema.Struct({ raw: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});

const decodeBitbucketPullRequestDetail = decodeJsonResult(BitbucketPullRequestDetailSchema);

export function decodeBitbucketPullRequestDetailJson(
  raw: string,
): Result.Result<NormalizedBitbucketPullRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeBitbucketPullRequestDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeBitbucketPullRequestRecord(result.success);
  return Result.succeed({
    ...summary,
    body: result.success.summary?.raw ?? "",
    comments: [],
  });
}
```

> **Note:** `BitbucketPullRequestSchema` and `normalizeBitbucketPullRequestRecord` are already in scope in `bitbucketPullRequests.ts` from prior code; reuse them. Add `import { decodeJsonResult } from "@s3tools/shared/schemaJson";` if not already imported (search the file first; do not duplicate). The decoder may need `Cause`, `Result`, `Schema` imports — check the existing import block.

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/bitbucketPullRequests.ts apps/server/src/sourceControl/bitbucketPullRequests.test.ts
git commit -m "server(sc): add bitbucket PR detail decoder"
```

---

### Task 12: Extend `BitbucketApi` shape with new methods (stubbed)

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketApi.ts`

- [ ] **Step 1: Add types and shape methods**

Open `apps/server/src/sourceControl/BitbucketApi.ts`. Near the top imports, add:

```ts
import * as BitbucketIssues from "./bitbucketIssues.ts";
```

Inside `BitbucketApiShape`, append (after `checkoutPullRequest`):

```ts
readonly listIssues: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProvider.SourceControlProviderContext;
  readonly state: "open" | "closed" | "all";
  readonly limit?: number;
}) => Effect.Effect<
  ReadonlyArray<BitbucketIssues.NormalizedBitbucketIssueRecord>,
  BitbucketApiError
>;

readonly getIssue: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProvider.SourceControlProviderContext;
  readonly reference: string;
}) => Effect.Effect<BitbucketIssues.NormalizedBitbucketIssueDetail, BitbucketApiError>;

readonly searchIssues: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProvider.SourceControlProviderContext;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<
  ReadonlyArray<BitbucketIssues.NormalizedBitbucketIssueRecord>,
  BitbucketApiError
>;

readonly searchPullRequests: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProvider.SourceControlProviderContext;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<
  ReadonlyArray<BitbucketPullRequests.NormalizedBitbucketPullRequestRecord>,
  BitbucketApiError
>;

readonly getPullRequestDetail: (input: {
  readonly cwd: string;
  readonly context?: SourceControlProvider.SourceControlProviderContext;
  readonly reference: string;
}) => Effect.Effect<BitbucketPullRequests.NormalizedBitbucketPullRequestDetail, BitbucketApiError>;
```

- [ ] **Step 2: Add stubs in `make()`**

Inside the `BitbucketApi.of({ ... })` block (returned from `make`), append:

```ts
listIssues: () =>
  Effect.fail(new BitbucketApiError({ operation: "listIssues", detail: "stub" })),
getIssue: () =>
  Effect.fail(new BitbucketApiError({ operation: "getIssue", detail: "stub" })),
searchIssues: () =>
  Effect.fail(new BitbucketApiError({ operation: "searchIssues", detail: "stub" })),
searchPullRequests: () =>
  Effect.fail(new BitbucketApiError({ operation: "searchPullRequests", detail: "stub" })),
getPullRequestDetail: () =>
  Effect.fail(new BitbucketApiError({ operation: "getPullRequestDetail", detail: "stub" })),
```

- [ ] **Step 3: Confirm typecheck**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketApi.ts
git commit -m "server(sc): extend BitbucketApi shape with new methods (stubbed)"
```

---

### Task 13: Implement `BitbucketApi.listIssues` (with 404 → empty fallback)

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify: `apps/server/src/sourceControl/BitbucketApi.test.ts`

Endpoint: `GET /repositories/{w}/{r}/issues?state=open&pagelen=<limit>&sort=-updated_on`. If issues are disabled on the repo, Bitbucket returns 404 — treat that as empty list, not a hard error.

- [ ] **Step 1: Read existing test patterns**

```bash
grep -n "listPullRequests\|HttpClient" apps/server/src/sourceControl/BitbucketApi.test.ts | head -20
```

Note the existing mocked `HttpClient` style and the helper for crafting JSON responses.

- [ ] **Step 2: Failing test**

Append to `apps/server/src/sourceControl/BitbucketApi.test.ts`. Use the same `HttpClient` mock harness already established in that file. (If unsure of the harness, mirror the closest existing test that exercises `listPullRequests` — copy that block, then change the URL and the expected return.) Sample assertion to insert:

```ts
it.effect("listIssues returns empty array when Bitbucket replies 404", () =>
  Effect.gen(function* () {
    // Use the file's existing helper for stubbing a 404 response on the issues
    // endpoint; the helper name varies per-file. After the stub is in place:
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const issues = yield* bitbucket.listIssues({ cwd: "/repo", state: "open" });
    assert.deepStrictEqual(issues, []);
  }),
);
```

If the existing harness doesn't expose a per-status helper, write the response stub inline using whatever `HttpClient.layerMock` / `HttpClientResponse.empty(404)` pattern the file already uses. Don't introduce a new harness style.

- [ ] **Step 3: Run (expect fail).**

- [ ] **Step 4: Replace stub**

In `BitbucketApi.ts`, replace the `listIssues` stub. Use the existing `executeJson`, `resolveRepository`, `apiUrl` helpers in `make()`:

```ts
listIssues: (input) =>
  resolveRepository({
    cwd: input.cwd,
    ...(input.context ? { context: input.context } : {}),
  }).pipe(
    Effect.flatMap((repo) => {
      const stateQuery =
        input.state === "open"
          ? "&state=new&state=open"
          : input.state === "closed"
            ? "&state=resolved&state=closed&state=on hold"
            : "";
      const path = `/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}/issues?pagelen=${input.limit ?? 50}&sort=-updated_on${stateQuery}`;
      return executeJson(
        "listIssues",
        HttpClientRequest.get(apiUrl(path)),
        BitbucketIssues.BitbucketIssueListSchema,
      ).pipe(
        Effect.map((value) => value.values.map(BitbucketIssues.normalizeRecordPublic)),
        Effect.catch((err) =>
          isBitbucketApiError(err) && err.status === 404
            ? Effect.succeed([])
            : Effect.fail(err),
        ),
      );
    }),
  ),
```

> **Decoder export note:** the snippet above references `BitbucketIssueListSchema` and `normalizeRecordPublic` from `bitbucketIssues.ts`. Open `bitbucketIssues.ts` and add explicit exports for them (re-export the schema and a public alias for the existing private `normalize` function):
>
> ```ts
> export const BitbucketIssueListSchema_Public = BitbucketIssueListSchema;
> export { BitbucketIssueListSchema_Public as BitbucketIssueListSchema };
> export function normalizeRecordPublic(
>   raw: Schema.Schema.Type<typeof BitbucketIssueSchema>,
> ): NormalizedBitbucketIssueRecord {
>   return normalize(raw);
> }
> ```
>
> This keeps the decoder module self-contained while letting `BitbucketApi.ts` reuse the schema directly. Adjust names to match the codebase if simpler approaches exist (e.g., make the schema and `normalize` `export`ed directly in `bitbucketIssues.ts` and skip the alias dance).

- [ ] **Step 5: Run (expect pass).**

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketApi.ts apps/server/src/sourceControl/BitbucketApi.test.ts apps/server/src/sourceControl/bitbucketIssues.ts
git commit -m "server(sc): implement BitbucketApi.listIssues (404 → empty)"
```

---

### Task 14: Implement `BitbucketApi.getIssue`

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify: `apps/server/src/sourceControl/BitbucketApi.test.ts`

Endpoints:

- `GET /repositories/{w}/{r}/issues/{id}` → body
- `GET /repositories/{w}/{r}/issues/{id}/comments?pagelen=10&sort=-created_on` → comments (cap to last 5 in detail-mapper later, but fetch a few extra so truncation has signal)

- [ ] **Step 1: Failing test**

Append to `BitbucketApi.test.ts`. Use the existing harness; stub two HTTP responses (issue then comments). Assertion:

```ts
it.effect("getIssue returns body and comments via two REST calls", () =>
  Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    const detail = yield* bitbucket.getIssue({ cwd: "/repo", reference: "42" });
    assert.strictEqual(detail.number, 42);
    assert.strictEqual(detail.body, "issue body");
    assert.strictEqual(detail.comments.length, 1);
    assert.strictEqual(detail.comments[0]?.author, "alice");
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
getIssue: (input) => {
  const referenceId = input.reference.trim().replace(/^#/, "").split("/").pop() ?? input.reference;
  return resolveRepository({
    cwd: input.cwd,
    ...(input.context ? { context: input.context } : {}),
  }).pipe(
    Effect.flatMap((repo) => {
      const issuePath = `/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}/issues/${encodeURIComponent(referenceId)}`;
      const commentsPath = `${issuePath}/comments?pagelen=10&sort=-created_on`;
      const issue = executeJson(
        "getIssue",
        HttpClientRequest.get(apiUrl(issuePath)),
        BitbucketIssues.BitbucketIssueSchema_Public,
      );
      const comments = executeJson(
        "getIssueComments",
        HttpClientRequest.get(apiUrl(commentsPath)),
        BitbucketIssues.BitbucketCommentListSchema_Public,
      ).pipe(
        Effect.map(BitbucketIssues.normalizeCommentList),
        Effect.catch((err) =>
          isBitbucketApiError(err) && err.status === 404
            ? Effect.succeed([])
            : Effect.fail(err),
        ),
      );
      return Effect.all([issue, comments], { concurrency: 2 }).pipe(
        Effect.map(([rawIssue, normalizedComments]) => {
          const summary = BitbucketIssues.normalizeRecordPublic(rawIssue);
          return {
            ...summary,
            body: rawIssue.content?.raw ?? "",
            comments: normalizedComments,
          };
        }),
      );
    }),
  );
},
```

> Add the missing exports in `bitbucketIssues.ts`: `BitbucketIssueSchema_Public`, `BitbucketCommentListSchema_Public`, `normalizeCommentList` (a function that takes the decoded list and produces `ReadonlyArray<BitbucketComment>` from already-decoded entries). If the simplest path is to expose `BitbucketIssueSchema` and `BitbucketCommentListSchema` directly with `export`, do that instead.

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketApi.ts apps/server/src/sourceControl/BitbucketApi.test.ts apps/server/src/sourceControl/bitbucketIssues.ts
git commit -m "server(sc): implement BitbucketApi.getIssue"
```

---

### Task 15: Implement `BitbucketApi.searchIssues`

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify: `apps/server/src/sourceControl/BitbucketApi.test.ts`

Endpoint: `GET /repositories/{w}/{r}/issues?q=title~"<q>"&pagelen=<limit>` (Bitbucket Query Language: `title ~ "value"` is substring match; the `~` operator must be URL-encoded).

- [ ] **Step 1: Failing test (mirror Task 13 harness; assert on the URL).**

```ts
it.effect("searchIssues forwards BBQL to /issues endpoint", () =>
  Effect.gen(function* () {
    const bitbucket = yield* BitbucketApi.BitbucketApi;
    yield* bitbucket.searchIssues({ cwd: "/repo", query: "memory leak" });
    // Inspect the captured URL via the existing test harness.
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
searchIssues: (input) =>
  resolveRepository({
    cwd: input.cwd,
    ...(input.context ? { context: input.context } : {}),
  }).pipe(
    Effect.flatMap((repo) => {
      const escaped = input.query.replace(/"/g, '\\"');
      const q = `title ~ "${escaped}"`;
      const path = `/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}/issues?q=${encodeURIComponent(q)}&pagelen=${input.limit ?? 20}&sort=-updated_on`;
      return executeJson(
        "searchIssues",
        HttpClientRequest.get(apiUrl(path)),
        BitbucketIssues.BitbucketIssueListSchema_Public,
      ).pipe(
        Effect.map((value) => value.values.map(BitbucketIssues.normalizeRecordPublic)),
        Effect.catch((err) =>
          isBitbucketApiError(err) && err.status === 404
            ? Effect.succeed([])
            : Effect.fail(err),
        ),
      );
    }),
  ),
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketApi.ts apps/server/src/sourceControl/BitbucketApi.test.ts
git commit -m "server(sc): implement BitbucketApi.searchIssues"
```

---

### Task 16: Implement `BitbucketApi.searchPullRequests`

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify: `apps/server/src/sourceControl/BitbucketApi.test.ts`

Endpoint: `GET /repositories/{w}/{r}/pullrequests?q=title~"<q>"&pagelen=<limit>`.

- [ ] **Step 1: Failing test (mirror Task 15).**

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

Reuse the existing decoder `BitbucketPullRequests.decodeBitbucketPullRequestListJson` (already in scope via existing imports). The result schema is the existing one used by `listPullRequests` — see how that method uses it in the file, then mirror the pattern:

```ts
searchPullRequests: (input) =>
  resolveRepository({
    cwd: input.cwd,
    ...(input.context ? { context: input.context } : {}),
  }).pipe(
    Effect.flatMap((repo) => {
      const escaped = input.query.replace(/"/g, '\\"');
      const q = `title ~ "${escaped}"`;
      const path = `/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}/pullrequests?q=${encodeURIComponent(q)}&pagelen=${input.limit ?? 20}&sort=-updated_on`;
      // Mirror the existing listPullRequests path that decodes `values` via the
      // existing PR list schema. Find that block in this same file and reuse the
      // schema reference + value mapping helper.
      return executeJson(
        "searchPullRequests",
        HttpClientRequest.get(apiUrl(path)),
        // schema: same as the one used by listPullRequests in this file
        // (for example, `BitbucketPullRequestListSchema` if it exists, or a
        // wrapping `Schema.Struct({ values: Schema.Array(...) })`).
        // Look up the exact name in the file before writing this line.
        // After locating it, replace this comment with the schema reference.
        // For the implementer: this is a direct reuse — DO NOT add a new schema.
      ).pipe(
        Effect.map((value) =>
          // Mirror the existing list-mapping function used by listPullRequests
          // — same shape conversion to NormalizedBitbucketPullRequestRecord.
          (value as { values: ReadonlyArray<unknown> }).values.map(/* normalize fn */)
        ),
      );
    }),
  ),
```

> **Implementer note:** because this requires looking up two existing identifiers in `BitbucketApi.ts` (`listPullRequests`'s schema reference and its mapping helper), do this lookup first:
>
> ```bash
> grep -n "listPullRequests\b" apps/server/src/sourceControl/BitbucketApi.ts
> ```
>
> Read the resolved block to identify the schema and the normalize helper, then plug them in. The inline `// schema:` and `// normalize fn` placeholders must be replaced with concrete identifiers before this commit.

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketApi.ts apps/server/src/sourceControl/BitbucketApi.test.ts
git commit -m "server(sc): implement BitbucketApi.searchPullRequests"
```

---

### Task 17: Implement `BitbucketApi.getPullRequestDetail`

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify: `apps/server/src/sourceControl/BitbucketApi.test.ts`

Endpoints:

- `GET /repositories/{w}/{r}/pullrequests/{id}` → body via `summary.raw`
- `GET /repositories/{w}/{r}/pullrequests/{id}/comments?pagelen=10&sort=-created_on` → comments

- [ ] **Step 1: Failing test (mirror Task 14 — two stubbed responses).**

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
getPullRequestDetail: (input) => {
  const referenceId = input.reference.trim().replace(/^#/, "").split("/").pop() ?? input.reference;
  return resolveRepository({
    cwd: input.cwd,
    ...(input.context ? { context: input.context } : {}),
  }).pipe(
    Effect.flatMap((repo) => {
      const prPath = `/repositories/${encodeURIComponent(repo.workspace)}/${encodeURIComponent(repo.repoSlug)}/pullrequests/${encodeURIComponent(referenceId)}`;
      const commentsPath = `${prPath}/comments?pagelen=10&sort=-created_on`;
      const pr = executeJson(
        "getPullRequestDetail",
        HttpClientRequest.get(apiUrl(prPath)),
        // Use the existing PR-detail schema you added in Task 11
        // (BitbucketPullRequestDetailSchema). Locate it in
        // bitbucketPullRequests.ts; export it if needed.
        BitbucketPullRequests.BitbucketPullRequestDetailSchema_Public,
      );
      const comments = executeJson(
        "getPullRequestComments",
        HttpClientRequest.get(apiUrl(commentsPath)),
        BitbucketIssues.BitbucketCommentListSchema_Public,
      ).pipe(
        Effect.map(BitbucketIssues.normalizeCommentList),
        Effect.catch((err) =>
          isBitbucketApiError(err) && err.status === 404
            ? Effect.succeed([])
            : Effect.fail(err),
        ),
      );
      return Effect.all([pr, comments], { concurrency: 2 }).pipe(
        Effect.map(([raw, normalizedComments]) => {
          // Reuse the file's existing PR-record normalize helper for the summary.
          const summary = BitbucketPullRequests.normalizeBitbucketPullRequestRecord(raw);
          return {
            ...summary,
            body: raw.summary?.raw ?? "",
            comments: normalizedComments,
          };
        }),
      );
    }),
  );
},
```

> **Decoder exports note:** in `bitbucketPullRequests.ts`, ensure `BitbucketPullRequestDetailSchema` and `normalizeBitbucketPullRequestRecord` are exported (they likely already are; if not, add `export` to them).

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketApi.ts apps/server/src/sourceControl/BitbucketApi.test.ts apps/server/src/sourceControl/bitbucketPullRequests.ts
git commit -m "server(sc): implement BitbucketApi.getPullRequestDetail"
```

---

### Task 18: Wire `BitbucketSourceControlProvider`

**Files:**

- Modify: `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`
- Modify: `apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts`

Pattern reference: `GitHubSourceControlProvider.ts:247–289` and `GitLabSourceControlProvider.ts` (as updated in Task 9).

- [ ] **Step 1: Add imports + helpers**

In `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`, replace the imports block with:

```ts
import { DateTime, Effect, Layer, Option } from "effect";
import {
  SourceControlProviderError,
  truncateSourceControlDetailContent,
  type ChangeRequest,
  type SourceControlChangeRequestDetail,
  type SourceControlIssueDetail,
  type SourceControlIssueSummary,
} from "@s3tools/contracts";

import * as BitbucketApi from "./BitbucketApi.ts";
import * as BitbucketIssues from "./bitbucketIssues.ts";
import * as BitbucketPullRequests from "./bitbucketPullRequests.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import type * as SourceControlProviderDiscovery from "./SourceControlProviderDiscovery.ts";
```

After `toChangeRequest` (around line 21), add helpers:

```ts
function toIssueSummary(
  raw: BitbucketIssues.NormalizedBitbucketIssueRecord,
): SourceControlIssueSummary {
  return {
    provider: "bitbucket",
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    ...(raw.author ? { author: raw.author } : {}),
    updatedAt: raw.updatedAt.pipe(Option.map((s) => DateTime.fromDateUnsafe(new Date(s)))),
    labels: raw.labels,
  };
}

function toIssueDetail(
  raw: BitbucketIssues.NormalizedBitbucketIssueDetail,
): SourceControlIssueDetail {
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
      createdAt: DateTime.fromDateUnsafe(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
}

function toChangeRequestDetail(
  raw: BitbucketPullRequests.NormalizedBitbucketPullRequestDetail,
): SourceControlChangeRequestDetail {
  const truncated = truncateSourceControlDetailContent({
    body: raw.body,
    comments: raw.comments,
  });
  return {
    ...toChangeRequest(raw),
    body: truncated.body,
    comments: truncated.comments.map((c) => ({
      author: c.author,
      body: c.body,
      createdAt: DateTime.fromDateUnsafe(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
}
```

- [ ] **Step 2: Replace the 5 stub blocks**

```ts
listIssues: (input) =>
  bitbucket
    .listIssues({
      cwd: input.cwd,
      ...(input.context ? { context: input.context } : {}),
      state: input.state,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toIssueSummary)),
      Effect.mapError((error) => providerError("listIssues", error)),
    ),
getIssue: (input) =>
  bitbucket
    .getIssue({
      cwd: input.cwd,
      ...(input.context ? { context: input.context } : {}),
      reference: input.reference,
    })
    .pipe(
      Effect.map(toIssueDetail),
      Effect.mapError((error) => providerError("getIssue", error)),
    ),
searchIssues: (input) =>
  bitbucket
    .searchIssues({
      cwd: input.cwd,
      ...(input.context ? { context: input.context } : {}),
      query: input.query,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toIssueSummary)),
      Effect.mapError((error) => providerError("searchIssues", error)),
    ),
searchChangeRequests: (input) =>
  bitbucket
    .searchPullRequests({
      cwd: input.cwd,
      ...(input.context ? { context: input.context } : {}),
      query: input.query,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toChangeRequest)),
      Effect.mapError((error) => providerError("searchChangeRequests", error)),
    ),
getChangeRequestDetail: (input) =>
  bitbucket
    .getPullRequestDetail({
      cwd: input.cwd,
      ...(input.context ? { context: input.context } : {}),
      reference: input.reference,
    })
    .pipe(
      Effect.map(toChangeRequestDetail),
      Effect.mapError((error) => providerError("getChangeRequestDetail", error)),
    ),
```

- [ ] **Step 3: Add provider tests**

Append to `apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts` — mirror the GitHub provider issue/MR-detail tests (Task 9 step 3) but with:

- `provider: "bitbucket"`
- `makeProvider(api: Partial<BitbucketApi.BitbucketApiShape>) { return BitbucketSourceControlProvider.make().pipe(Effect.provide(Layer.mock(BitbucketApi.BitbucketApi)(api))); }`

The five tests you write match Task 9's set: `listIssues maps`, `getIssue truncates body`, `searchIssues forwards query`, `searchChangeRequests forwards query`, `getChangeRequestDetail returns body and comments`.

- [ ] **Step 4: Run all Bitbucket tests**

```bash
bun run test apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/BitbucketSourceControlProvider.ts apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts
git commit -m "server(sc): wire Bitbucket issue + PR detail methods"
```

---

## Phase 3 — Cluster 3: Azure DevOps provider

Pattern reference: `apps/server/src/sourceControl/AzureDevOpsCli.ts:234+` (HTTP/CLI execute helpers and `executeJson`); existing `listPullRequests` / `getPullRequest`. Work items live under `az boards work-item …`; PRs under `az repos pr …`.

> **Implementer research before coding (~5 min):** run these to confirm flag names against the locally installed `az` + `azure-devops` extension:
>
> ```bash
> az boards work-item show --help 2>&1 | sed -n '1,40p'
> az boards work-item list --help 2>&1 | sed -n '1,40p'
> az boards query --help 2>&1 | sed -n '1,40p'
> az repos pr show --help 2>&1 | grep -i comment
> az repos pr list --help 2>&1 | sed -n '1,40p'
> ```
>
> If `az repos pr show --include-comments` is NOT supported, fall back to fetching comment threads via `az repos pr list-comments` (or the closest variant). Note the actual flags in your task commits.

### Task 19: `azureDevOpsWorkItems.ts` decoder module

**Files:**

- Create: `apps/server/src/sourceControl/azureDevOpsWorkItems.ts`
- Create: `apps/server/src/sourceControl/azureDevOpsWorkItems.test.ts`

Azure work-item JSON (from `az boards work-item show --id <n> --output json`) has the shape:

```json
{
  "id": 42,
  "fields": {
    "System.Title": "Issue title",
    "System.State": "Active",
    "System.Tags": "frontend; bug",
    "System.ChangedDate": "2026-03-14T10:00:00Z",
    "System.CreatedBy": { "uniqueName": "alice@example.com", "displayName": "Alice" },
    "System.Description": "<div>html body</div>"
  },
  "url": "https://dev.azure.com/org/proj/_apis/wit/workItems/42"
}
```

Web URL is `_workitems/edit/<id>`; we synthesize it from the org/project + id (or grab `links.html.href` if present in the listing).

- [ ] **Step 1: Failing test**

Create `apps/server/src/sourceControl/azureDevOpsWorkItems.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import {
  decodeAzureDevOpsWorkItemDetailJson,
  decodeAzureDevOpsWorkItemListJson,
} from "./azureDevOpsWorkItems.ts";

describe("decodeAzureDevOpsWorkItemListJson", () => {
  it("decodes work-item list with state normalization", () => {
    const raw = JSON.stringify([
      {
        id: 42,
        fields: {
          "System.Title": "Bug",
          "System.State": "Active",
          "System.Tags": "frontend; bug",
          "System.ChangedDate": "2026-03-14T10:00:00Z",
          "System.CreatedBy": { uniqueName: "alice@example.com" },
        },
        url: "https://dev.azure.com/org/proj/_apis/wit/workItems/42",
      },
    ]);
    const result = decodeAzureDevOpsWorkItemListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success[0]?.number).toBe(42);
    expect(result.success[0]?.title).toBe("Bug");
    expect(result.success[0]?.state).toBe("open");
    expect(result.success[0]?.author).toBe("alice@example.com");
    expect(result.success[0]?.labels).toEqual(["frontend", "bug"]);
  });

  it("treats Closed/Resolved/Removed as 'closed'", () => {
    const raw = JSON.stringify([
      {
        id: 7,
        fields: { "System.Title": "Done", "System.State": "Closed" },
      },
    ]);
    const result = decodeAzureDevOpsWorkItemListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success[0]?.state).toBe("closed");
  });
});

describe("decodeAzureDevOpsWorkItemDetailJson", () => {
  it("strips HTML tags from description into body", () => {
    const raw = JSON.stringify({
      id: 42,
      fields: {
        "System.Title": "Detailed",
        "System.State": "Active",
        "System.Description": "<p>issue body</p>",
      },
    });
    const result = decodeAzureDevOpsWorkItemDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body.trim()).toBe("issue body");
  });
});
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Implement**

Create `apps/server/src/sourceControl/azureDevOpsWorkItems.ts`:

```ts
import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt } from "@s3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@s3tools/shared/schemaJson";

export interface NormalizedAzureDevOpsWorkItemRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

export interface NormalizedAzureDevOpsWorkItemDetail extends NormalizedAzureDevOpsWorkItemRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const AzureUserSchema = Schema.Struct({
  uniqueName: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
});

const AzureFieldsSchema = Schema.Struct({
  "System.Title": Schema.optional(Schema.NullOr(Schema.String)),
  "System.State": Schema.optional(Schema.NullOr(Schema.String)),
  "System.Tags": Schema.optional(Schema.NullOr(Schema.String)),
  "System.ChangedDate": Schema.optional(Schema.NullOr(Schema.String)),
  "System.CreatedBy": Schema.optional(Schema.NullOr(AzureUserSchema)),
  "System.Description": Schema.optional(Schema.NullOr(Schema.String)),
});

const AzureWorkItemSchema = Schema.Struct({
  id: PositiveInt,
  fields: AzureFieldsSchema,
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const CLOSED_STATES = new Set([
  "closed",
  "resolved",
  "done",
  "completed",
  "removed",
  "cancelled",
  "canceled",
  "rejected",
]);

function normalizeState(raw: string | null | undefined): "open" | "closed" {
  return raw && CLOSED_STATES.has(raw.trim().toLowerCase()) ? "closed" : "open";
}

function authorOf(
  user: { readonly uniqueName?: string; readonly displayName?: string } | null | undefined,
): string | null {
  return user?.uniqueName?.trim() || user?.displayName?.trim() || null;
}

function labelsFromTags(tags: string | null | undefined): ReadonlyArray<string> {
  if (!tags) return [];
  return tags
    .split(/;|,/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/gu, "");
}

function urlFor(raw: Schema.Schema.Type<typeof AzureWorkItemSchema>): string {
  // Prefer a synthesized human URL: /<org>/<proj>/_workitems/edit/<id>.
  // raw.url is the API URL (.../_apis/wit/workItems/<id>); convert it.
  const apiUrl = raw.url?.trim() ?? "";
  if (apiUrl.length === 0) return "";
  try {
    const parsed = new URL(apiUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    // Expect: <org>/<proj>/_apis/wit/workItems/<id>
    const apisIdx = segments.indexOf("_apis");
    if (apisIdx > 0) {
      const orgProj = segments.slice(0, apisIdx).join("/");
      return `${parsed.origin}/${orgProj}/_workitems/edit/${raw.id}`;
    }
  } catch {
    // fall through
  }
  return apiUrl;
}

function normalize(
  raw: Schema.Schema.Type<typeof AzureWorkItemSchema>,
): NormalizedAzureDevOpsWorkItemRecord {
  return {
    number: raw.id,
    title: raw.fields["System.Title"]?.trim() ?? "",
    url: urlFor(raw),
    state: normalizeState(raw.fields["System.State"]),
    author: authorOf(raw.fields["System.CreatedBy"]),
    updatedAt: raw.fields["System.ChangedDate"]
      ? Option.some(raw.fields["System.ChangedDate"])
      : Option.none(),
    labels: labelsFromTags(raw.fields["System.Tags"]),
  };
}

const decodeWorkItemList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeWorkItemEntry = Schema.decodeUnknownExit(AzureWorkItemSchema);
const decodeWorkItemDetail = decodeJsonResult(AzureWorkItemSchema);

export const formatAzureDevOpsWorkItemDecodeError = formatSchemaError;

export function decodeAzureDevOpsWorkItemListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedAzureDevOpsWorkItemRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeWorkItemList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const items: NormalizedAzureDevOpsWorkItemRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodeWorkItemEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    if (!decoded.value.fields["System.Title"]) continue;
    items.push(normalize(decoded.value));
  }
  return Result.succeed(items);
}

export function decodeAzureDevOpsWorkItemDetailJson(
  raw: string,
): Result.Result<NormalizedAzureDevOpsWorkItemDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeWorkItemDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalize(result.success);
  return Result.succeed({
    ...summary,
    body: stripHtml(result.success.fields["System.Description"] ?? ""),
    comments: [], // populated by separate API/CLI call in the provider layer
  });
}
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/azureDevOpsWorkItems.ts apps/server/src/sourceControl/azureDevOpsWorkItems.test.ts
git commit -m "server(sc): add azureDevOpsWorkItems decoder module"
```

---

### Task 20: Extend `azureDevOpsPullRequests.ts` with detail decoder

**Files:**

- Modify: `apps/server/src/sourceControl/azureDevOpsPullRequests.ts`
- Create: `apps/server/src/sourceControl/azureDevOpsPullRequests.test.ts`

Azure PR JSON has `description` for body. Comments come from `az repos pr show --include-comments` in a `threads` array (each thread has `comments[]`).

- [ ] **Step 1: Failing test**

Create `apps/server/src/sourceControl/azureDevOpsPullRequests.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { Result } from "effect";
import { decodeAzureDevOpsPullRequestDetailJson } from "./azureDevOpsPullRequests.ts";

describe("decodeAzureDevOpsPullRequestDetailJson", () => {
  it("decodes description as body and flattens thread comments", () => {
    const raw = JSON.stringify({
      pullRequestId: 99,
      title: "Add feature",
      description: "PR body text",
      status: "active",
      sourceRefName: "refs/heads/feature/add",
      targetRefName: "refs/heads/main",
      repository: {
        webUrl: "https://dev.azure.com/org/proj/_git/repo",
        name: "repo",
      },
      threads: [
        {
          comments: [
            {
              author: { displayName: "Reviewer", uniqueName: "rev@example.com" },
              content: "looks good",
              publishedDate: "2026-03-01T10:00:00Z",
            },
          ],
        },
      ],
    });
    const result = decodeAzureDevOpsPullRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.number).toBe(99);
    expect(result.success.body).toBe("PR body text");
    expect(result.success.comments[0]?.author).toBe("rev@example.com");
  });
});
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Extend**

Append to `apps/server/src/sourceControl/azureDevOpsPullRequests.ts`:

```ts
export interface NormalizedAzureDevOpsPullRequestDetail extends NormalizedAzureDevOpsPullRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const AzureThreadCommentSchema = Schema.Struct({
  author: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        uniqueName: Schema.optional(Schema.String),
        displayName: Schema.optional(Schema.String),
      }),
    ),
  ),
  content: Schema.optional(Schema.NullOr(Schema.String)),
  publishedDate: Schema.optional(Schema.NullOr(Schema.String)),
});

const AzurePullRequestDetailSchema = Schema.Struct({
  ...AzurePullRequestSchema.fields,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  threads: Schema.optional(
    Schema.Array(
      Schema.Struct({
        comments: Schema.optional(Schema.Array(AzureThreadCommentSchema)),
        isDeleted: Schema.optional(Schema.NullOr(Schema.Boolean)),
      }),
    ),
  ),
});

const decodeAzurePullRequestDetail = decodeJsonResult(AzurePullRequestDetailSchema);

export function decodeAzureDevOpsPullRequestDetailJson(
  raw: string,
): Result.Result<NormalizedAzureDevOpsPullRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeAzurePullRequestDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeAzureDevOpsPullRequestRecord(result.success);
  const comments = (result.success.threads ?? [])
    .filter((t) => !t.isDeleted)
    .flatMap((t) => t.comments ?? [])
    .filter((c) => (c.content?.trim() ?? "").length > 0)
    .map((c) => ({
      author: c.author?.uniqueName?.trim() ?? c.author?.displayName?.trim() ?? "unknown",
      body: c.content ?? "",
      createdAt: c.publishedDate ?? "",
    }));
  return Result.succeed({
    ...summary,
    body: result.success.description ?? "",
    comments,
  });
}
```

> **Implementer note:** the snippet references `AzurePullRequestSchema` and `normalizeAzureDevOpsPullRequestRecord` from the existing file. Confirm exact names by reading the file's current top half (`grep -n "AzurePullRequest\|normalize" apps/server/src/sourceControl/azureDevOpsPullRequests.ts`) and adapt names if they differ.

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/azureDevOpsPullRequests.ts apps/server/src/sourceControl/azureDevOpsPullRequests.test.ts
git commit -m "server(sc): add Azure DevOps PR detail decoder"
```

---

### Task 21: Extend `AzureDevOpsCli` shape with new methods (stubbed)

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.ts`

- [ ] **Step 1: Add types and shape methods**

Add imports near the top of the file:

```ts
import * as AzureDevOpsWorkItems from "./azureDevOpsWorkItems.ts";
import type {
  NormalizedAzureDevOpsWorkItemDetail,
  NormalizedAzureDevOpsWorkItemRecord,
} from "./azureDevOpsWorkItems.ts";
import type { NormalizedAzureDevOpsPullRequestDetail } from "./azureDevOpsPullRequests.ts";
```

Inside `AzureDevOpsCliShape`, append:

```ts
readonly listWorkItems: (input: {
  readonly cwd: string;
  readonly state: "open" | "closed" | "all";
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<NormalizedAzureDevOpsWorkItemRecord>, AzureDevOpsCliError>;

readonly getWorkItem: (input: {
  readonly cwd: string;
  readonly reference: string;
}) => Effect.Effect<NormalizedAzureDevOpsWorkItemDetail, AzureDevOpsCliError>;

readonly searchWorkItems: (input: {
  readonly cwd: string;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<ReadonlyArray<NormalizedAzureDevOpsWorkItemRecord>, AzureDevOpsCliError>;

readonly searchPullRequests: (input: {
  readonly cwd: string;
  readonly query: string;
  readonly limit?: number;
}) => Effect.Effect<
  ReadonlyArray<AzureDevOpsPullRequests.NormalizedAzureDevOpsPullRequestRecord>,
  AzureDevOpsCliError
>;

readonly getPullRequestDetail: (input: {
  readonly cwd: string;
  readonly reference: string;
}) => Effect.Effect<NormalizedAzureDevOpsPullRequestDetail, AzureDevOpsCliError>;
```

- [ ] **Step 2: Add stubs in `make()`**

Append inside the `AzureDevOpsCli.of({ ... })` block, after `checkoutPullRequest`:

```ts
listWorkItems: () =>
  Effect.fail(
    new AzureDevOpsCliError({ operation: "listWorkItems", detail: "stub" }),
  ),
getWorkItem: () =>
  Effect.fail(
    new AzureDevOpsCliError({ operation: "getWorkItem", detail: "stub" }),
  ),
searchWorkItems: () =>
  Effect.fail(
    new AzureDevOpsCliError({ operation: "searchWorkItems", detail: "stub" }),
  ),
searchPullRequests: () =>
  Effect.fail(
    new AzureDevOpsCliError({ operation: "searchPullRequests", detail: "stub" }),
  ),
getPullRequestDetail: () =>
  Effect.fail(
    new AzureDevOpsCliError({ operation: "getPullRequestDetail", detail: "stub" }),
  ),
```

- [ ] **Step 3: Add `LC_ALL=C` to the CLI's `execute` helper**

Update the existing `execute` helper around `AzureDevOpsCli.ts:237–246` to pass `env: { LC_ALL: "C" }` on the `process.run({ ... })` call (mirror Task 4 step 4 for GitLab).

- [ ] **Step 4: Confirm typecheck**

```bash
bun typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsCli.ts
git commit -m "server(sc): extend AzureDevOpsCli shape with new methods (stubbed)"
```

---

### Task 22: Implement `AzureDevOpsCli.listWorkItems`

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.test.ts`

Use `az boards query --wiql "SELECT [System.Id] FROM workItems WHERE [System.AssignedTo] = @Me ORDER BY [System.ChangedDate] DESC"` for the user's own items, OR `az boards work-item list --output json` (which uses the default project) — the latter is simpler. State filtering uses a WIQL `WHERE [System.State] IN (...)` clause when needed, otherwise client-side filter on the result.

Implementer can pick either approach; the simpler is `az boards work-item list` with no state filter for `--state all`, and a follow-up filter in normalize for `open`/`closed`.

For this plan, prefer `az boards query --wiql` since it gives single-call state filtering. Construct the WIQL string per the state mapping in `azureDevOpsWorkItems.ts` (`CLOSED_STATES`).

- [ ] **Step 1: Failing test**

Append to `AzureDevOpsCli.test.ts`:

```ts
it.effect("listWorkItems queries WIQL with state filter and decodes", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(
      Effect.succeed(
        processOutput(
          JSON.stringify([
            {
              id: 42,
              fields: {
                "System.Title": "Bug",
                "System.State": "Active",
              },
              url: "https://dev.azure.com/org/proj/_apis/wit/workItems/42",
            },
          ]),
        ),
      ),
    );
    const items = yield* Effect.gen(function* () {
      const az = yield* AzureDevOpsCli.AzureDevOpsCli;
      return yield* az.listWorkItems({ cwd: "/repo", state: "open", limit: 10 });
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.number).toBe(42);
    expect(mockedRun).toHaveBeenCalled();
    const call = mockedRun.mock.calls[mockedRun.mock.calls.length - 1]?.[0];
    expect(call?.command).toBe("az");
    // First arg is "boards" — assert WIQL is in args.
    expect(call?.args).toContain("query");
    expect(
      call?.args.some((a) => typeof a === "string" && a.toUpperCase().includes("SELECT")),
    ).toBe(true);
    expect(call?.env).toEqual(expect.objectContaining({ LC_ALL: "C" }));
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

In `AzureDevOpsCli.ts`:

```ts
listWorkItems: (input) => {
  const stateClause =
    input.state === "open"
      ? " AND [System.State] NOT IN ('Closed', 'Resolved', 'Done', 'Removed', 'Cancelled')"
      : input.state === "closed"
        ? " AND [System.State] IN ('Closed', 'Resolved', 'Done', 'Removed', 'Cancelled')"
        : "";
  const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.Tags], [System.ChangedDate], [System.CreatedBy] FROM workItems WHERE [System.TeamProject] = @project${stateClause} ORDER BY [System.ChangedDate] DESC`;
  return executeJson({
    cwd: input.cwd,
    args: [
      "boards",
      "query",
      "--wiql",
      wiql,
      "--top",
      String(input.limit ?? 50),
    ],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() =>
            AzureDevOpsWorkItems.decodeAzureDevOpsWorkItemListJson(raw),
          ).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success)
                : Effect.fail(
                    new AzureDevOpsCliError({
                      operation: "listWorkItems",
                      detail: `Azure DevOps CLI returned invalid work item JSON: ${AzureDevOpsWorkItems.formatAzureDevOpsWorkItemDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  );
},
```

> **Note:** `az boards query --wiql` returns work-item summaries. Some `az` versions return only `{ id, fields: { "System.Id" } }` without other fields when WIQL is used. If the test fails because fields are missing, fall back to `az boards work-item show --id <id>` per item — but this becomes N+1. Better path: use `az boards work-item list --query "[?...]"` if the WIQL flow doesn't yield fields. Implementer to verify in step 0.5 of this task with a spike (output one query against a real org if available).
>
> If the simpler `az boards work-item list` path is used, swap `args` to `["boards", "work-item", "list", "--top", String(...)]` and apply state filtering in `decodeAzureDevOpsWorkItemListJson`'s caller.

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsCli.ts apps/server/src/sourceControl/AzureDevOpsCli.test.ts
git commit -m "server(sc): implement AzureDevOpsCli.listWorkItems"
```

---

### Task 23: Implement `AzureDevOpsCli.getWorkItem`

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.test.ts`

Endpoint: `az boards work-item show --id <ref> --output json` (returns full fields including `System.Description`).

- [ ] **Step 1: Failing test**

```ts
it.effect("getWorkItem invokes az boards work-item show with --id", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(
      Effect.succeed(
        processOutput(
          JSON.stringify({
            id: 42,
            fields: {
              "System.Title": "Detailed",
              "System.State": "Active",
              "System.Description": "<p>issue body</p>",
            },
          }),
        ),
      ),
    );
    const detail = yield* Effect.gen(function* () {
      const az = yield* AzureDevOpsCli.AzureDevOpsCli;
      return yield* az.getWorkItem({ cwd: "/repo", reference: "42" });
    });
    expect(detail.body.trim()).toBe("issue body");
    const call = mockedRun.mock.calls[mockedRun.mock.calls.length - 1]?.[0];
    expect(call?.args).toContain("--id");
    expect(call?.args).toContain("42");
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
getWorkItem: (input) => {
  const id = input.reference.trim().replace(/^#/, "").split("/").pop() ?? input.reference;
  return executeJson({
    cwd: input.cwd,
    args: ["boards", "work-item", "show", "--id", id],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      Effect.sync(() =>
        AzureDevOpsWorkItems.decodeAzureDevOpsWorkItemDetailJson(raw),
      ).pipe(
        Effect.flatMap((decoded) =>
          Result.isSuccess(decoded)
            ? Effect.succeed(decoded.success)
            : Effect.fail(
                new AzureDevOpsCliError({
                  operation: "getWorkItem",
                  detail: `Azure DevOps CLI returned invalid work item JSON: ${AzureDevOpsWorkItems.formatAzureDevOpsWorkItemDecodeError(decoded.failure)}`,
                  cause: decoded.failure,
                }),
              ),
        ),
      ),
    ),
  );
},
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsCli.ts apps/server/src/sourceControl/AzureDevOpsCli.test.ts
git commit -m "server(sc): implement AzureDevOpsCli.getWorkItem"
```

---

### Task 24: Implement `AzureDevOpsCli.searchWorkItems`

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.test.ts`

WIQL with `[System.Title] CONTAINS '<q>'` — but values must be `'`-quoted and escaped. Build the WIQL string defensively.

- [ ] **Step 1: Failing test**

```ts
it.effect("searchWorkItems builds WIQL with title CONTAINS clause", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(Effect.succeed(processOutput("[]")));
    yield* Effect.gen(function* () {
      const az = yield* AzureDevOpsCli.AzureDevOpsCli;
      return yield* az.searchWorkItems({ cwd: "/repo", query: "memory leak" });
    });
    const call = mockedRun.mock.calls[mockedRun.mock.calls.length - 1]?.[0];
    const wiql = (call?.args ?? []).find(
      (a) => typeof a === "string" && a.toUpperCase().includes("SELECT"),
    );
    expect(typeof wiql === "string" && wiql.toLowerCase()).toContain("contains");
    expect(typeof wiql === "string" && wiql).toContain("memory leak");
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
searchWorkItems: (input) => {
  const escapedQuery = input.query.replace(/'/g, "''");
  const wiql = `SELECT [System.Id], [System.Title], [System.State], [System.Tags], [System.ChangedDate], [System.CreatedBy] FROM workItems WHERE [System.TeamProject] = @project AND [System.Title] CONTAINS '${escapedQuery}' ORDER BY [System.ChangedDate] DESC`;
  return executeJson({
    cwd: input.cwd,
    args: [
      "boards",
      "query",
      "--wiql",
      wiql,
      "--top",
      String(input.limit ?? 20),
    ],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() =>
            AzureDevOpsWorkItems.decodeAzureDevOpsWorkItemListJson(raw),
          ).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success)
                : Effect.fail(
                    new AzureDevOpsCliError({
                      operation: "searchWorkItems",
                      detail: `Azure DevOps CLI returned invalid work item JSON: ${AzureDevOpsWorkItems.formatAzureDevOpsWorkItemDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  );
},
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsCli.ts apps/server/src/sourceControl/AzureDevOpsCli.test.ts
git commit -m "server(sc): implement AzureDevOpsCli.searchWorkItems"
```

---

### Task 25: Implement `AzureDevOpsCli.searchPullRequests`

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.test.ts`

`az` does not expose a native PR title-search. Use `az repos pr list --query "[?contains(title, '<q>')]" --status all --top <n> --output json` (JMESPath filter). Pass `--detect true` to auto-resolve project/repo (mirrors existing `listPullRequests`).

- [ ] **Step 1: Failing test**

```ts
it.effect("searchPullRequests filters via JMESPath query", () =>
  Effect.gen(function* () {
    mockedRun.mockReturnValueOnce(Effect.succeed(processOutput("[]")));
    yield* Effect.gen(function* () {
      const az = yield* AzureDevOpsCli.AzureDevOpsCli;
      return yield* az.searchPullRequests({ cwd: "/repo", query: "fix" });
    });
    const call = mockedRun.mock.calls[mockedRun.mock.calls.length - 1]?.[0];
    expect(call?.args).toContain("repos");
    expect(call?.args).toContain("pr");
    expect(call?.args).toContain("list");
    const queryArg = (call?.args ?? []).find(
      (a) => typeof a === "string" && a.includes("contains(title"),
    );
    expect(queryArg).toContain("'fix'");
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
searchPullRequests: (input) => {
  const escaped = input.query.replace(/'/g, "\\'");
  const jmes = `[?contains(title, '${escaped}')] | [0:${input.limit ?? 20}]`;
  return executeJson({
    cwd: input.cwd,
    args: [
      "repos",
      "pr",
      "list",
      "--detect",
      "true",
      "--status",
      "all",
      "--top",
      String((input.limit ?? 20) * 4), // grab a wider window before client-side filter
      "--query",
      jmes,
    ],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      raw.length === 0
        ? Effect.succeed([])
        : Effect.sync(() =>
            AzureDevOpsPullRequests.decodeAzureDevOpsPullRequestListJson(raw),
          ).pipe(
            Effect.flatMap((decoded) =>
              Result.isSuccess(decoded)
                ? Effect.succeed(decoded.success)
                : Effect.fail(
                    new AzureDevOpsCliError({
                      operation: "searchPullRequests",
                      detail: `Azure DevOps CLI returned invalid PR list JSON: ${AzureDevOpsPullRequests.formatAzureDevOpsJsonDecodeError(decoded.failure)}`,
                      cause: decoded.failure,
                    }),
                  ),
            ),
          ),
    ),
  );
},
```

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsCli.ts apps/server/src/sourceControl/AzureDevOpsCli.test.ts
git commit -m "server(sc): implement AzureDevOpsCli.searchPullRequests"
```

---

### Task 26: Implement `AzureDevOpsCli.getPullRequestDetail`

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsCli.test.ts`

Use `az repos pr show --id <ref>` for body. Comments fetched via a follow-up `az repos pr list-comments` call (or merge if `az repos pr show` accepts an `--include-comments` flag — verify in implementer's research step). Below assumes the two-call path:

- [ ] **Step 1: Failing test**

```ts
it.effect("getPullRequestDetail decodes description and merges comments", () =>
  Effect.gen(function* () {
    mockedRun
      .mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            JSON.stringify({
              pullRequestId: 99,
              title: "Add",
              description: "PR body",
              status: "active",
              sourceRefName: "refs/heads/feature/add",
              targetRefName: "refs/heads/main",
              repository: { webUrl: "https://dev.azure.com/org/proj/_git/repo", name: "repo" },
            }),
          ),
        ),
      )
      .mockReturnValueOnce(
        Effect.succeed(
          processOutput(
            JSON.stringify([
              {
                comments: [
                  {
                    author: { displayName: "Reviewer", uniqueName: "rev@example.com" },
                    content: "looks good",
                    publishedDate: "2026-03-01T10:00:00Z",
                  },
                ],
              },
            ]),
          ),
        ),
      );
    const detail = yield* Effect.gen(function* () {
      const az = yield* AzureDevOpsCli.AzureDevOpsCli;
      return yield* az.getPullRequestDetail({ cwd: "/repo", reference: "99" });
    });
    expect(detail.body).toBe("PR body");
    expect(detail.comments[0]?.author).toBe("rev@example.com");
  }),
);
```

- [ ] **Step 2: Run (expect fail).**

- [ ] **Step 3: Replace stub**

```ts
getPullRequestDetail: (input) => {
  const id = input.reference.trim().replace(/^#/, "").split("/").pop() ?? input.reference;
  const showCmd = executeJson({
    cwd: input.cwd,
    args: ["repos", "pr", "show", "--detect", "true", "--id", id],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.flatMap((raw) =>
      Effect.sync(() => AzureDevOpsPullRequests.decodeAzureDevOpsPullRequestDetailJson(
        // Wrap raw with empty threads to match the schema; comments are merged below.
        JSON.stringify({ ...JSON.parse(raw), threads: [] }),
      )),
    ),
    Effect.flatMap((decoded) =>
      Result.isSuccess(decoded)
        ? Effect.succeed(decoded.success)
        : Effect.fail(
            new AzureDevOpsCliError({
              operation: "getPullRequestDetail",
              detail: `Azure DevOps CLI returned invalid pull request JSON: ${AzureDevOpsPullRequests.formatAzureDevOpsJsonDecodeError(decoded.failure)}`,
              cause: decoded.failure,
            }),
          ),
    ),
  );
  const commentsCmd = executeJson({
    cwd: input.cwd,
    args: ["repos", "pr", "list-comments", "--detect", "true", "--id", id],
  }).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.map<string, ReadonlyArray<{ author: string; body: string; createdAt: string }>>(
      (raw) => {
        if (raw.length === 0) return [];
        try {
          const parsed = JSON.parse(raw) as Array<{
            comments?: Array<{
              author?: { uniqueName?: string; displayName?: string };
              content?: string;
              publishedDate?: string;
            }>;
            isDeleted?: boolean;
          }>;
          return parsed
            .filter((t) => !t.isDeleted)
            .flatMap((t) => t.comments ?? [])
            .filter((c) => (c.content?.trim() ?? "").length > 0)
            .map((c) => ({
              author:
                c.author?.uniqueName?.trim() ??
                c.author?.displayName?.trim() ??
                "unknown",
              body: c.content ?? "",
              createdAt: c.publishedDate ?? "",
            }));
        } catch {
          return [];
        }
      },
    ),
    Effect.catch(() =>
      Effect.succeed([] as ReadonlyArray<{ author: string; body: string; createdAt: string }>),
    ),
  );
  return Effect.all([showCmd, commentsCmd], { concurrency: 2 }).pipe(
    Effect.map(([detail, comments]) => ({ ...detail, comments })),
  );
},
```

> **Implementer note:** `az repos pr list-comments` may not exist as a single subcommand in older `azure-devops` extension versions. If the help output (research from Phase 3 header) shows it's not available, fall back to either:
>
> 1. `az devops invoke --area git --resource pullRequestThreads --route-parameters …` for the raw REST endpoint, or
> 2. dropping comments and shipping just the body — log a TODO comment in the file but make the test still pass with the body-only return.
>
> Whichever path is used, encode the choice in the test from Step 1 and the implementation here.

- [ ] **Step 4: Run (expect pass).**

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsCli.ts apps/server/src/sourceControl/AzureDevOpsCli.test.ts
git commit -m "server(sc): implement AzureDevOpsCli.getPullRequestDetail"
```

---

### Task 27: Wire `AzureDevOpsSourceControlProvider`

**Files:**

- Modify: `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts`
- Modify: `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.test.ts`

Mirror Tasks 9 / 18 — same shape, different identifiers.

- [ ] **Step 1: Add imports + helpers**

Replace the imports block of `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts` with:

```ts
import { DateTime, Effect, Layer, Option } from "effect";
import {
  SourceControlProviderError,
  truncateSourceControlDetailContent,
  type ChangeRequest,
  type SourceControlChangeRequestDetail,
  type SourceControlIssueDetail,
  type SourceControlIssueSummary,
} from "@s3tools/contracts";

import * as AzureDevOpsCli from "./AzureDevOpsCli.ts";
import * as AzureDevOpsPullRequests from "./azureDevOpsPullRequests.ts";
import * as AzureDevOpsWorkItems from "./azureDevOpsWorkItems.ts";
import * as SourceControlProvider from "./SourceControlProvider.ts";
import * as SourceControlProviderDiscovery from "./SourceControlProviderDiscovery.ts";
```

Add helpers below the existing `toChangeRequest`:

```ts
function toIssueSummary(
  raw: AzureDevOpsWorkItems.NormalizedAzureDevOpsWorkItemRecord,
): SourceControlIssueSummary {
  return {
    provider: "azure-devops",
    number: raw.number,
    title: raw.title,
    url: raw.url,
    state: raw.state,
    ...(raw.author ? { author: raw.author } : {}),
    updatedAt: raw.updatedAt.pipe(Option.map((s) => DateTime.fromDateUnsafe(new Date(s)))),
    labels: raw.labels,
  };
}

function toIssueDetail(
  raw: AzureDevOpsWorkItems.NormalizedAzureDevOpsWorkItemDetail,
): SourceControlIssueDetail {
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
      createdAt: DateTime.fromDateUnsafe(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
}

function toChangeRequestDetail(
  raw: AzureDevOpsPullRequests.NormalizedAzureDevOpsPullRequestDetail,
): SourceControlChangeRequestDetail {
  const truncated = truncateSourceControlDetailContent({
    body: raw.body,
    comments: raw.comments,
  });
  return {
    ...toChangeRequest(raw),
    body: truncated.body,
    comments: truncated.comments.map((c) => ({
      author: c.author,
      body: c.body,
      createdAt: DateTime.fromDateUnsafe(new Date(c.createdAt)),
    })),
    truncated: truncated.truncated,
  };
}
```

- [ ] **Step 2: Replace the 5 stub blocks**

```ts
listIssues: (input) =>
  azure
    .listWorkItems({
      cwd: input.cwd,
      state: input.state,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toIssueSummary)),
      Effect.mapError((error) => providerError("listIssues", error)),
    ),
getIssue: (input) =>
  azure.getWorkItem({ cwd: input.cwd, reference: input.reference }).pipe(
    Effect.map(toIssueDetail),
    Effect.mapError((error) => providerError("getIssue", error)),
  ),
searchIssues: (input) =>
  azure
    .searchWorkItems({
      cwd: input.cwd,
      query: input.query,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toIssueSummary)),
      Effect.mapError((error) => providerError("searchIssues", error)),
    ),
searchChangeRequests: (input) =>
  azure
    .searchPullRequests({
      cwd: input.cwd,
      query: input.query,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    .pipe(
      Effect.map((items) => items.map(toChangeRequest)),
      Effect.mapError((error) => providerError("searchChangeRequests", error)),
    ),
getChangeRequestDetail: (input) =>
  azure.getPullRequestDetail({ cwd: input.cwd, reference: input.reference }).pipe(
    Effect.map(toChangeRequestDetail),
    Effect.mapError((error) => providerError("getChangeRequestDetail", error)),
  ),
```

- [ ] **Step 3: Add provider tests**

Open `apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.test.ts` and add the same 5 tests as Task 9 step 3 / Task 18 step 3, but adapted:

- `provider: "azure-devops"`
- `makeProvider(azure: Partial<AzureDevOpsCli.AzureDevOpsCliShape>) { return AzureDevOpsSourceControlProvider.make().pipe(Effect.provide(Layer.mock(AzureDevOpsCli.AzureDevOpsCli)(azure))); }`
- The `listIssues` test mocks `listWorkItems`; the `searchChangeRequests` test mocks `searchPullRequests`; the `getChangeRequestDetail` test mocks `getPullRequestDetail`.

- [ ] **Step 4: Run all Azure tests**

```bash
bun run test apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.ts apps/server/src/sourceControl/AzureDevOpsSourceControlProvider.test.ts
git commit -m "server(sc): wire Azure DevOps work-item + PR detail methods"
```

---

## Phase 4 — Cluster 4: UX follow-ups

### Task 28: Wire `hasSourceControlRemote` from `useSourceControlDiscovery`

**Files:**

- Modify: `apps/web/src/components/chat/ChatComposer.tsx`

Currently hardcoded to `true` at `ChatComposer.tsx:2545`. Replace with a derivation from `useSourceControlDiscovery()` (`apps/web/src/lib/sourceControlDiscoveryState.ts:93`) — treat "has remote" as "at least one configured provider has `auth.status === 'authenticated'` OR `auth.status === 'unknown'`". (`unauthenticated` providers are still selectable but show a hint; the popup itself handles per-tab states.)

- [ ] **Step 1: Verify the import block**

```bash
grep -n "useSourceControlDiscovery" apps/web/src/components/chat/ChatComposer.tsx
```

Expected: zero matches (the hook is not currently imported here).

- [ ] **Step 2: Add the import**

In `apps/web/src/components/chat/ChatComposer.tsx`, add to the `~/` imports block:

```ts
import { useSourceControlDiscovery } from "~/lib/sourceControlDiscoveryState";
```

- [ ] **Step 3: Compute `hasSourceControlRemote` near the other hooks**

Inside the `ChatComposer` component body (find a clean insertion point near existing hooks like `useStore`, `useComposerDraftStore`):

```ts
const sourceControlDiscovery = useSourceControlDiscovery();
const hasSourceControlRemote = (sourceControlDiscovery.data?.sourceControlProviders ?? []).some(
  (provider) =>
    provider.status === "ok" &&
    (provider.auth.status === "authenticated" || provider.auth.status === "unknown"),
);
```

- [ ] **Step 4: Replace the hardcoded prop**

Change `ChatComposer.tsx:2545` from:

```tsx
hasSourceControlRemote={true}
```

to:

```tsx
hasSourceControlRemote = { hasSourceControlRemote };
```

- [ ] **Step 5: Verify**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/ChatComposer.tsx
git commit -m "web(composer): derive hasSourceControlRemote from provider discovery"
```

---

### Task 29: Render `updatedAt` in `ContextPickerList`

**Files:**

- Modify: `apps/web/src/components/chat/ContextPickerList.tsx`

The current placeholder is at line 34 (`{/* date — format updatedAt if present */}`). `item.updatedAt` is `Option<DateTime.Utc>` — convert to a short locale date.

- [ ] **Step 1: Add date-formatting helper**

At the top of `ContextPickerList.tsx` (just below the imports):

```ts
import { DateTime, Option } from "effect";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

function formatItemDate(updatedAt: SourceControlIssueSummary["updatedAt"]): string {
  if (!updatedAt || Option.isNone(updatedAt)) return "";
  const date = DateTime.toDate(updatedAt.value);
  return dateFmt.format(date);
}
```

- [ ] **Step 2: Replace the placeholder**

In the JSX, replace:

```tsx
<span className="shrink-0 text-xs text-muted-foreground">
  {/* date — format updatedAt if present */}
</span>
```

with:

```tsx
<span className="shrink-0 text-xs text-muted-foreground">{formatItemDate(item.updatedAt)}</span>
```

- [ ] **Step 3: Verify**

```bash
bun typecheck
bun run test apps/web/src/components/chat
```

Expected: PASS. (No new tests required — the existing browser test for popup flow renders this list.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ContextPickerList.tsx
git commit -m "web(picker): render updatedAt date column"
```

---

### Task 30: Wire tab counts in `ContextPickerPopup`

**Files:**

- Modify: `apps/web/src/components/chat/ContextPickerPopup.tsx`

`ContextPickerTabs` already supports `count` per tab. Pass the cached list lengths.

- [ ] **Step 1: Build tabs from cached data**

Replace the static `TABS` constant + the `<ContextPickerTabs ... />` block at `ContextPickerPopup.tsx:18–21` and `:170–175`. Inside the component body:

```tsx
const tabs: ReadonlyArray<ContextPickerTab> = [
  { id: "issues", label: "GH Issues", count: cachedIssues.length },
  { id: "prs", label: "GH PRs", count: cachedPrs.length },
];
```

(Place this right after the `cachedIssues` / `cachedPrs` derivations.)

- [ ] **Step 2: Pass `tabs` instead of the constant**

```tsx
<ContextPickerTabs tabs={tabs} activeId={activeTab} onSelect={(id) => setActiveTab(id as TabId)} />
```

- [ ] **Step 3: Remove the now-unused `TABS` constant** at the top of the file.

- [ ] **Step 4: Verify**

```bash
bun typecheck
bun run test apps/web/src/components/chat/ContextPickerPopup
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ContextPickerPopup.tsx
git commit -m "web(picker): show issue/PR counts on tabs"
```

---

### Task 31: "Already attached" toast on duplicate `addSourceControlContext`

**Files:**

- Modify: `apps/web/src/composerDraftStore.ts`
- Modify: `apps/web/src/composerDraftStore.test.tsx`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`

`composerDraftStore.ts:2823` currently silently drops duplicates. Change the action to return a result the caller can react to, and surface a toast in `ChatComposer.tsx`.

- [ ] **Step 1: Update the action's return type**

In `apps/web/src/composerDraftStore.ts`, find the `ComposerDraftStoreActions` interface where `addSourceControlContext` is declared (around line 401). Change it to:

```ts
addSourceControlContext: (
  threadRef: ComposerThreadTarget,
  context: ComposerSourceControlContext,
) => { added: boolean; reason?: "duplicate" };
```

- [ ] **Step 2: Update the implementation**

In the same file (around line 2823), replace the action body with:

```ts
addSourceControlContext: (threadRef, context) => {
  const threadKey = resolveComposerDraftKey(get(), threadRef) ?? "";
  if (threadKey.length === 0) {
    return { added: false };
  }
  const dedupKey = `${context.provider}:${context.reference}`;
  let alreadyPresent = false;
  set((state) => {
    const existing = state.draftsByThreadKey[threadKey] ?? createEmptyThreadDraft();
    alreadyPresent = existing.sourceControlContexts.some(
      (ctx) => `${ctx.provider}:${ctx.reference}` === dedupKey,
    );
    if (alreadyPresent) {
      return state;
    }
    return {
      draftsByThreadKey: {
        ...state.draftsByThreadKey,
        [threadKey]: {
          ...existing,
          sourceControlContexts: [...existing.sourceControlContexts, context],
        },
      },
    };
  });
  return alreadyPresent ? { added: false, reason: "duplicate" } : { added: true };
},
```

- [ ] **Step 3: Add / update tests**

In `apps/web/src/composerDraftStore.test.tsx`, find the existing test for `addSourceControlContext` (search `addSourceControlContext`). Replace the duplicate-noop test with:

```ts
it("addSourceControlContext returns { added: false, reason: 'duplicate' } on second add", () => {
  const store = useComposerDraftStore.getState();
  const ref = makeFakeThreadRef();
  const ctx = makeFakeSourceControlContext({ number: 42 });
  expect(store.addSourceControlContext(ref, ctx)).toEqual({ added: true });
  expect(store.addSourceControlContext(ref, ctx)).toEqual({
    added: false,
    reason: "duplicate",
  });
});
```

> The `makeFakeSourceControlContext` helper already exists in this test file (search for it). If not, copy the inline construction used by other source-control-context tests in the same file.

- [ ] **Step 4: Wire the toast in `ChatComposer.tsx`**

Find `handleSelectIssue` and `handleSelectChangeRequest` in `ChatComposer.tsx` (search for them). They both call `addSourceControlContext`. Update each call site to:

```ts
const result = addSourceControlContextForActiveThread(/* existing args */);
if (!result.added && result.reason === "duplicate") {
  toast.info("Already attached.");
}
```

(The toast helper is already in scope in `ChatComposer.tsx`. If the wrapper used here is named differently — the file has helpers like `addComposerImages` — search for `addSourceControlContext` and apply the change at each of the 1–2 call sites.)

- [ ] **Step 5: Run tests + typecheck**

```bash
bun run test apps/web/src/composerDraftStore.test.tsx
bun typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/composerDraftStore.ts apps/web/src/composerDraftStore.test.tsx apps/web/src/components/chat/ChatComposer.tsx
git commit -m "web(composer): toast when source-control context is already attached"
```

---

### Task 32 _(optional)_: Direct-attach `#42` + Enter

**Files:**

- Modify: `apps/web/src/composer-logic.ts`
- Modify: `apps/web/src/composer-logic.test.ts`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`

When the `#`-trigger is active and the user types pure-digit `#<digits>` then presses Enter (without picking from the menu), bypass the menu and fetch the issue directly. Reduces clicks for power users.

- [ ] **Step 1: Locate trigger logic**

```bash
grep -n "source-control\|detectComposerTrigger" apps/web/src/composer-logic.ts | head -20
```

Identify the `detectComposerTrigger` matcher and the trigger result shape; note the existing `#42` matcher path.

- [ ] **Step 2: Add a `directAttach: true` flag to the trigger result for pure-digit queries**

In `composer-logic.ts`, where the source-control trigger is built, add `directAttach: /^\d+$/.test(query)` to the result. Update the type for `ComposerTriggerKind === "source-control"` accordingly.

- [ ] **Step 3: Add a unit test**

In `composer-logic.test.ts`:

```ts
it("marks pure-digit source-control trigger as directAttach", () => {
  const trigger = detectComposerTrigger({ text: "look at #42", caret: 11 });
  expect(trigger?.kind).toBe("source-control");
  if (trigger?.kind !== "source-control") return;
  expect(trigger.directAttach).toBe(true);
});

it("does not mark text source-control trigger as directAttach", () => {
  const trigger = detectComposerTrigger({ text: "look at #bug", caret: 12 });
  expect(trigger?.kind).toBe("source-control");
  if (trigger?.kind !== "source-control") return;
  expect(trigger.directAttach).toBe(false);
});
```

- [ ] **Step 4: Wire Enter handler in `ChatComposer.tsx`**

Find the existing keydown handler that dispatches the inline command-menu open/close based on the trigger. Add: when `trigger.kind === "source-control" && trigger.directAttach` and the key is Enter (and the menu is not open), call `getIssue` directly via the existing `issueDetailQueryOptions` factory + `queryClient.fetchQuery`, bypass the menu, and call `addSourceControlContext`.

Concrete edit shape (insert near the existing trigger handling — the implementer locates the exact site):

```ts
if (
  e.key === "Enter" &&
  !isCommandMenuOpen &&
  trigger?.kind === "source-control" &&
  trigger.directAttach
) {
  e.preventDefault();
  const reference = trigger.query; // already the digits
  void queryClient
    .fetchQuery(
      issueDetailQueryOptions({
        environmentId,
        cwd: gitCwd ?? null,
        reference,
      }),
    )
    .then((detail) => {
      const result = addSourceControlContextForActiveThread({
        kind: "issue",
        provider: detail.provider,
        reference,
        detail,
      });
      if (!result.added && result.reason === "duplicate") {
        toast.info("Already attached.");
      }
    })
    .catch((err) => {
      toast.error(`Couldn't fetch #${reference}: ${err.message ?? err}`);
    });
}
```

(The wrapper `addSourceControlContextForActiveThread` is whatever helper the file already uses for converting a raw context into the persisted shape — see Task 31 step 4.)

- [ ] **Step 5: Run tests + typecheck**

```bash
bun run test apps/web/src/composer-logic.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/composer-logic.ts apps/web/src/composer-logic.test.ts apps/web/src/components/chat/ChatComposer.tsx
git commit -m "web(composer): direct-attach #<digits> on Enter"
```

---

## Phase 5 — Final gate

### Task 33: Lint, typecheck, full test run, and PR open

**Files:** none (verification + PR creation).

- [ ] **Step 1: Format**

```bash
bun fmt
```

Expected: succeeds (writes any formatting changes). If any files change, stage them and add a commit:

```bash
git add -u
git commit -m "fmt: apply oxfmt to chat-context-picker-providers changes"
```

- [ ] **Step 2: Lint**

```bash
bun lint
```

Expected: PASS.

- [ ] **Step 3: Typecheck**

```bash
bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Full test run**

```bash
bun run test
```

Expected: PASS (all suites).

- [ ] **Step 5: Manual smoke (where feasible)**

Walk through whichever providers are reachable from your dev environment:

- [ ] In a **GitLab** workspace with `glab` installed and authed: open S3Code → click 📎 → see GL issues → attach one → send → verify the agent received the structured context. Same for an MR.
- [ ] In a **Bitbucket** workspace with `S3CODE_BITBUCKET_*` env vars configured: same flow.
- [ ] In a **Bitbucket** workspace where issues are disabled: open the picker → tab body shows empty list (not error toast).
- [ ] In an **Azure DevOps** workspace with `az` + `azure-devops` extension: same flow.
- [ ] In a workspace **without a recognized source-control remote**: button still opens popup, source-control tabs hidden, file/image attach still works (Task 28 wiring).
- [ ] Pick the same item twice → second pick → "Already attached" toast (Task 31).
- [ ] Type `#42` then press Enter (when supported provider exists) → issue auto-attaches without opening menu (Task 32, optional).

- [ ] **Step 6: Open PR**

```bash
git push -u origin feature/chat-context-picker-providers
gh pr create --title "Chat context picker — providers (GitLab / Bitbucket / Azure) + UX follow-ups" --body "$(cat <<'EOF'
## Summary

- Implement `listIssues`, `getIssue`, `searchIssues`, `searchChangeRequests`, `getChangeRequestDetail` for GitLab, Bitbucket, and Azure DevOps (Plan 1 left these as `Effect.fail("not implemented")` stubs).
- Wire the four follow-up UX gaps from Plan 1's review: real provider-detection for `hasSourceControlRemote`, `updatedAt` date column on the picker list, tab counts, and "already attached" toast on duplicate `addSourceControlContext`.
- Optional: direct-attach `#<digits>` + Enter for one-keystroke issue picking.

Spec: `docs/superpowers/specs/2026-05-07-chat-context-picker-design.md`.
Plan: `docs/superpowers/plans/2026-05-07-chat-context-picker-providers.md`.

## Test plan

- [ ] `bun fmt && bun lint && bun typecheck && bun run test` — all green.
- [ ] Manual smoke per provider (see plan Phase 5 step 5).
EOF
)"
```

> Confirm the URL in the output and report it back.

- [ ] **Step 7: Mark plan complete.**

---

## Self-review notes

Spec coverage check (against `docs/superpowers/specs/2026-05-07-chat-context-picker-design.md`):

- ✓ Goal: GitLab/Bitbucket/Azure issue + change-request fetching parity with GitHub. — Tasks 1–27.
- ✓ Non-goals respected: no Linear/Sentry, no remote-picker UI, no server cache, no new auth, no unsupported hosts, no streaming, no body-edit UI.
- ✓ Contracts (already satisfied by Plan 1): re-uses `SourceControlIssueSummary`, `SourceControlIssueDetail`, `SourceControlChangeRequestDetail`, `truncateSourceControlDetailContent`. Plan 2 doesn't touch contracts.
- ✓ Server, per provider: 5 methods × 3 providers, all wired.
- ✓ Cross-repo URL paste: handled implicitly — each provider's CLI/API accepts URLs as references (`glab issue view <url>`, Bitbucket REST takes ID parsed from URL, `az boards work-item show --id <id parsed from URL>`).
- ✓ Token-budget caps: each provider applies `truncateSourceControlDetailContent` in its `toIssueDetail` / `toChangeRequestDetail` mapper (Tasks 9 / 18 / 27).
- ✓ Failure-mode normalization: each CLI's existing `normalize<Provider>CliError` handles missing-CLI / unauthenticated. Bitbucket additionally maps 404 → empty list (Tasks 13–17).
- ✓ Web (follow-ups): hasSourceControlRemote (Task 28), date column (Task 29), tab counts (Task 30), already-attached toast (Task 31), optional direct-attach (Task 32).
- ✓ Pre-merge gate: `bun fmt && bun lint && bun typecheck && bun run test` (Task 33).
- ✓ Tests: per-method CLI/API tests, decoder tests, provider tests, follow-up regressions covered.

Type / identifier consistency check:

- `NormalizedGitLabIssueRecord` / `NormalizedGitLabIssueDetail` defined in Task 1, used in Tasks 3–9. ✓
- `NormalizedGitLabMergeRequestDetail` defined in Task 2, used in Tasks 3, 8, 9. ✓
- `NormalizedBitbucketIssueRecord` / `NormalizedBitbucketIssueDetail` defined in Task 10, used in Tasks 12–18. ✓
- `NormalizedBitbucketPullRequestDetail` defined in Task 11, used in Tasks 12, 17, 18. ✓
- `NormalizedAzureDevOpsWorkItemRecord` / `…Detail` defined in Task 19, used in Tasks 21–27. ✓
- `NormalizedAzureDevOpsPullRequestDetail` defined in Task 20, used in Tasks 21, 26, 27. ✓
- All 3 providers' `to*Summary` / `to*Detail` mappers use the same call-shape conventions. ✓

Risk register (resolve during implementation):

- **GitLab `--comments` flag availability** (Tasks 5, 8): version-dependent in `glab`. Implementer must verify and fall back to `glab api` if needed.
- **Bitbucket schema-export ergonomics** (Tasks 13–17): `bitbucketIssues.ts` may need a small refactor to export the schemas / normalize helpers. Plan instructs the simpler "just `export` them" path if the alias dance feels overengineered.
- **Azure WIQL field projection** (Tasks 22, 24): some `az` versions return only `{ id }` from `boards query`; if so, fall back to `az boards work-item list` + client-side filtering.
- **Azure PR comments** (Task 26): `list-comments` may not exist; fallback to `az devops invoke` raw REST or body-only. Tests must pin the chosen path.
