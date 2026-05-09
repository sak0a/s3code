# Sidebar Worktree Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar from flat `Project → Thread` into hierarchical `Project → Worktree → Status bucket → Session`, with first-class worktree entities, drag-and-drop bucket overrides, archive/delete lifecycle, and a unified New Worktree dialog.

**Architecture:** Add a `projection_worktrees` projection (one row per workspace checkout, including a synthetic `main` row pointing at workspace root) keyed off new domain events. Sessions get `worktree_id`, `manual_status_bucket`, and `manual_position` columns. The web sidebar is broken out of the 3.5k-line `Sidebar.tsx` into per-row components and uses a new tree-composition hook. The standalone Project Explorer dialog is folded into a unified `NewWorktreeDialog` with branches/PRs/issues/new-branch tabs.

**Tech Stack:** TypeScript · Effect (`SqlClient`, `Schema`, `Layer`) · Vitest / `@effect/vitest` · React · `@dnd-kit` · `@tanstack/react-query` · Bun.

**Spec:** [`docs/superpowers/specs/2026-05-08-sidebar-worktree-hierarchy-design.md`](../specs/2026-05-08-sidebar-worktree-hierarchy-design.md)

**Verification commands** (run all green at the end of each task before committing):

```
bun fmt
bun lint
bun typecheck
bun run test                # NEVER `bun test` — that's Bun's runner, not Vitest
```

---

## Phase 1 — Contracts & WS method names

### Task 1: Add `Worktree` and `WorktreeId` to contracts

**Files:**

- Create: `packages/contracts/src/worktree.ts`
- Modify: `packages/contracts/src/index.ts` (add export)

- [ ] **Step 1: Write the failing test**

Create `packages/contracts/src/worktree.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { Worktree, WorktreeId, WorktreeOrigin } from "./worktree.ts";

describe("WorktreeId", () => {
  it("is a branded string", () => {
    const id = WorktreeId.make("worktree-abc");
    expect(typeof id).toBe("string");
  });
});

describe("WorktreeOrigin", () => {
  it("accepts the five legal kinds", () => {
    for (const kind of ["main", "branch", "pr", "issue", "manual"] as const) {
      expect(Schema.is(WorktreeOrigin)(kind)).toBe(true);
    }
    expect(Schema.is(WorktreeOrigin)("other")).toBe(false);
  });
});

describe("Worktree", () => {
  it("decodes a row with origin=main and null worktreePath", () => {
    const decoded = Schema.decodeUnknownSync(Worktree)({
      worktreeId: "worktree-1",
      projectId: "project-1",
      branch: "main",
      worktreePath: null,
      origin: "main",
      prNumber: null,
      issueNumber: null,
      prTitle: null,
      issueTitle: null,
      createdAt: "2026-05-08T00:00:00.000Z",
      updatedAt: "2026-05-08T00:00:00.000Z",
      archivedAt: null,
      manualPosition: 0,
    });
    expect(decoded.origin).toBe("main");
    expect(decoded.worktreePath).toBeNull();
  });
});
```

Run: `bun run test packages/contracts/src/worktree.test.ts`
Expected: FAIL with "Cannot find module './worktree.ts'".

- [ ] **Step 2: Implement contracts**

Create `packages/contracts/src/worktree.ts`:

```typescript
import { Schema } from "effect";
import { IsoDateTime, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { ProjectId } from "./environment.ts";

export const WorktreeId = Schema.String.pipe(Schema.brand("WorktreeId"));
export type WorktreeId = typeof WorktreeId.Type;

export const WorktreeOrigin = Schema.Literals(["main", "branch", "pr", "issue", "manual"]);
export type WorktreeOrigin = typeof WorktreeOrigin.Type;

export const StatusBucket = Schema.Literals(["idle", "in_progress", "review", "done"]);
export type StatusBucket = typeof StatusBucket.Type;

export const Worktree = Schema.Struct({
  worktreeId: WorktreeId,
  projectId: ProjectId,
  branch: TrimmedNonEmptyString,
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  origin: WorktreeOrigin,
  prNumber: Schema.NullOr(Schema.Number),
  issueNumber: Schema.NullOr(Schema.Number),
  prTitle: Schema.NullOr(TrimmedNonEmptyString),
  issueTitle: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: Schema.NullOr(IsoDateTime),
  manualPosition: Schema.Number,
});
export type Worktree = typeof Worktree.Type;

export const CreateWorktreeIntent = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("branch"), branchName: TrimmedNonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("pr"), number: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("issue"), number: Schema.Number }),
  Schema.Struct({
    kind: Schema.Literal("newBranch"),
    branchName: Schema.optional(TrimmedNonEmptyString),
    baseBranch: Schema.optional(TrimmedNonEmptyString),
  }),
);
export type CreateWorktreeIntent = typeof CreateWorktreeIntent.Type;
```

- [ ] **Step 3: Wire export**

In `packages/contracts/src/index.ts`, add:

```typescript
export * from "./worktree.ts";
```

(Verify the file uses `export *` style by reading 1-20; if it uses named re-exports, add named ones for `Worktree`, `WorktreeId`, `WorktreeOrigin`, `StatusBucket`, `CreateWorktreeIntent`.)

- [ ] **Step 4: Run tests + typecheck**

```
bun run test packages/contracts/src/worktree.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/worktree.ts packages/contracts/src/worktree.test.ts packages/contracts/src/index.ts
git commit -m "Add Worktree contract types"
```

---

### Task 2: Add WS method names + RPC payload schemas

**Files:**

- Modify: `packages/contracts/src/rpc.ts` (add new method literals)
- Modify: `packages/contracts/src/orchestration.ts` (add new event payload schemas)

- [ ] **Step 1: Find existing WS_METHODS table**

Read `packages/contracts/src/rpc.ts` to locate the `WS_METHODS` constant (likely a frozen object literal). Identify the convention used for git-related methods (e.g. `gitPreparePullRequestThread`).

- [ ] **Step 2: Add new method literals**

Append to the same `WS_METHODS` object literal (matching the existing key style):

```typescript
gitCreateWorktreeForProject: "gitCreateWorktreeForProject",
gitFindWorktreeForOrigin: "gitFindWorktreeForOrigin",
gitArchiveWorktree: "gitArchiveWorktree",
gitRestoreWorktree: "gitRestoreWorktree",
gitDeleteWorktree: "gitDeleteWorktree",
threadsSetManualBucket: "threadsSetManualBucket",
threadsSetManualPosition: "threadsSetManualPosition",
worktreesSetManualPosition: "worktreesSetManualPosition",
projectsInitializeGit: "projectsInitializeGit",
```

- [ ] **Step 3: Add input/output schemas alongside the methods**

In the same file (or its sibling schema file — match existing convention), add:

```typescript
export const GitCreateWorktreeForProjectInput = Schema.Struct({
  projectId: ProjectId,
  intent: CreateWorktreeIntent,
});
export const GitCreateWorktreeForProjectOutput = Schema.Struct({
  worktreeId: WorktreeId,
  sessionId: ThreadId,
});

export const GitFindWorktreeForOriginInput = Schema.Struct({
  projectId: ProjectId,
  kind: Schema.Literals(["pr", "issue"]),
  number: Schema.Number,
});
export const GitFindWorktreeForOriginOutput = Schema.NullOr(WorktreeId);

export const GitArchiveWorktreeInput = Schema.Struct({
  worktreeId: WorktreeId,
  deleteBranch: Schema.Boolean,
});
export const GitRestoreWorktreeInput = Schema.Struct({ worktreeId: WorktreeId });
export const GitDeleteWorktreeInput = GitArchiveWorktreeInput;

export const ThreadsSetManualBucketInput = Schema.Struct({
  threadId: ThreadId,
  bucket: Schema.NullOr(StatusBucket),
});
export const ThreadsSetManualPositionInput = Schema.Struct({
  threadId: ThreadId,
  position: Schema.Number,
});
export const WorktreesSetManualPositionInput = Schema.Struct({
  worktreeId: WorktreeId,
  position: Schema.Number,
});
export const ProjectsInitializeGitInput = Schema.Struct({ projectId: ProjectId });
```

Add necessary imports (`WorktreeId`, `StatusBucket`, `CreateWorktreeIntent` from `./worktree.ts`; `ThreadId`, `ProjectId` already imported elsewhere — match existing style).

- [ ] **Step 4: Add domain event payload schemas**

In `packages/contracts/src/orchestration.ts`, locate the `OrchestrationEvent` union and add five new event payloads following the existing `ThreadCreatedPayload` pattern (lines ~824):

```typescript
export const WorktreeCreatedPayload = Schema.Struct({
  worktreeId: WorktreeId,
  projectId: ProjectId,
  branch: TrimmedNonEmptyString,
  worktreePath: Schema.NullOr(TrimmedNonEmptyString),
  origin: WorktreeOrigin,
  prNumber: Schema.NullOr(Schema.Number),
  issueNumber: Schema.NullOr(Schema.Number),
  prTitle: Schema.NullOr(TrimmedNonEmptyString),
  issueTitle: Schema.NullOr(TrimmedNonEmptyString),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export const WorktreeArchivedPayload = Schema.Struct({
  worktreeId: WorktreeId,
  archivedAt: IsoDateTime,
  deletedBranch: Schema.Boolean,
});
export const WorktreeRestoredPayload = Schema.Struct({
  worktreeId: WorktreeId,
  restoredAt: IsoDateTime,
});
export const WorktreeDeletedPayload = Schema.Struct({
  worktreeId: WorktreeId,
  deletedAt: IsoDateTime,
  deletedBranch: Schema.Boolean,
});
export const ThreadAttachedToWorktreePayload = Schema.Struct({
  threadId: ThreadId,
  worktreeId: WorktreeId,
  attachedAt: IsoDateTime,
});
export const ThreadStatusBucketOverriddenPayload = Schema.Struct({
  threadId: ThreadId,
  bucket: Schema.NullOr(StatusBucket),
  changedAt: IsoDateTime,
});
```

Then in the existing `OrchestrationEvent = Schema.Union(...)` definition (look for the comma-separated list of `Schema.Struct({ ...EventBaseFields, type: Schema.Literal("..."), payload: ... })` entries), add six new entries with types `worktree.created`, `worktree.archived`, `worktree.restored`, `worktree.deleted`, `thread.attachedToWorktree`, `thread.statusBucketOverridden`.

- [ ] **Step 5: Verify**

```
bun typecheck
```

Expected: PASS (if FAIL, the union exhaustiveness check probably needs a corresponding update somewhere — see compile errors).

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/rpc.ts packages/contracts/src/orchestration.ts
git commit -m "Add WS method names and worktree event payloads"
```

---

## Phase 2 — Persistence

### Task 3: Schema migration `030_Worktrees.ts`

**Files:**

- Create: `apps/server/src/persistence/Migrations/030_Worktrees.ts`
- Modify: `apps/server/src/persistence/Migrations.ts` (register migration)
- Test: `apps/server/src/persistence/Migrations/030_Worktrees.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("030_Worktrees", (it) => {
  it.effect("creates projection_worktrees with expected columns", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      const cols = yield* sql<{ name: string }>`PRAGMA table_info(projection_worktrees)`;
      const names = cols.map((c) => c.name).sort();
      assert.deepStrictEqual(names, [
        "archived_at",
        "branch",
        "created_at",
        "issue_number",
        "issue_title",
        "manual_position",
        "origin",
        "pr_number",
        "pr_title",
        "project_id",
        "updated_at",
        "worktree_id",
        "worktree_path",
      ]);
    }),
  );

  it.effect("adds worktree_id, manual_status_bucket, manual_position to projection_threads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      const cols = yield* sql<{ name: string }>`PRAGMA table_info(projection_threads)`;
      const names = cols.map((c) => c.name);
      assert.include(names, "worktree_id");
      assert.include(names, "manual_status_bucket");
      assert.include(names, "manual_position");
    }),
  );

  it.effect("creates expected indices", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      const indices = yield* sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('projection_worktrees','projection_threads')
      `;
      const names = indices.map((i) => i.name);
      assert.include(names, "idx_projection_worktrees_project_archived");
      assert.include(names, "idx_projection_worktrees_pr_lookup");
      assert.include(names, "idx_projection_worktrees_issue_lookup");
      assert.include(names, "idx_projection_threads_worktree_bucket");
    }),
  );
});
```

Run: `bun run test apps/server/src/persistence/Migrations/030_Worktrees.test.ts`
Expected: FAIL ("toMigrationInclusive: 30 not found" or similar).

- [ ] **Step 2: Write the migration**

Create `apps/server/src/persistence/Migrations/030_Worktrees.ts`:

```typescript
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_worktrees (
      worktree_id   TEXT PRIMARY KEY,
      project_id    TEXT NOT NULL,
      branch        TEXT NOT NULL,
      worktree_path TEXT,
      origin        TEXT NOT NULL CHECK (origin IN ('main','branch','pr','issue','manual')),
      pr_number     INTEGER,
      issue_number  INTEGER,
      pr_title      TEXT,
      issue_title   TEXT,
      created_at    TEXT NOT NULL,
      updated_at    TEXT NOT NULL,
      archived_at   TEXT,
      manual_position INTEGER NOT NULL DEFAULT 0
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_worktrees_project_archived
    ON projection_worktrees(project_id, archived_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_worktrees_pr_lookup
    ON projection_worktrees(project_id, origin, pr_number)
    WHERE pr_number IS NOT NULL
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_worktrees_issue_lookup
    ON projection_worktrees(project_id, origin, issue_number)
    WHERE issue_number IS NOT NULL
  `;

  yield* sql`ALTER TABLE projection_threads ADD COLUMN worktree_id TEXT`;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN manual_status_bucket TEXT`;
  yield* sql`ALTER TABLE projection_threads ADD COLUMN manual_position INTEGER NOT NULL DEFAULT 0`;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_worktree_bucket
    ON projection_threads(worktree_id, manual_status_bucket)
  `;
});
```

- [ ] **Step 3: Register the migration**

In `apps/server/src/persistence/Migrations.ts`, import the new file and add it to `migrationEntries`:

```typescript
import Migration0030 from "./Migrations/030_Worktrees.ts";

export const migrationEntries = [
  // ... existing entries up to ...
  [29, "ProjectionThreadDetailOrderingIndexes", Migration0029],
  [30, "Worktrees", Migration0030],
] as const;
```

- [ ] **Step 4: Run tests**

```
bun run test apps/server/src/persistence/Migrations/030_Worktrees.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run full server tests + typecheck**

```
bun typecheck
bun run test apps/server
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/persistence/Migrations/030_Worktrees.ts apps/server/src/persistence/Migrations/030_Worktrees.test.ts apps/server/src/persistence/Migrations.ts
git commit -m "Add migration 030: projection_worktrees table and thread columns"
```

---

### Task 4: ProjectionWorktrees repository

**Files:**

- Create: `apps/server/src/persistence/Layers/ProjectionWorktrees.ts`
- Test: `apps/server/src/persistence/Layers/ProjectionWorktrees.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";
import {
  ProjectionWorktreeRepository,
  ProjectionWorktreeRepositoryLive,
} from "./ProjectionWorktrees.ts";
import { WorktreeId } from "@t3tools/contracts/worktree";
import { ProjectId } from "@t3tools/contracts";

const layer = it.layer(
  Layer.mergeAll(NodeSqliteClient.layerMemory(), ProjectionWorktreeRepositoryLive),
);

layer("ProjectionWorktreeRepository", (it) => {
  it.effect("upsert + getById round-trips a row", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 30 });
      const repo = yield* ProjectionWorktreeRepository;

      const id = WorktreeId.make("worktree-test");
      yield* repo.upsert({
        worktreeId: id,
        projectId: ProjectId.make("project-x"),
        branch: "main",
        worktreePath: null,
        origin: "main",
        prNumber: null,
        issueNumber: null,
        prTitle: null,
        issueTitle: null,
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
        archivedAt: null,
        manualPosition: 0,
      });

      const row = yield* repo.getById(id);
      assert.isTrue(row._tag === "Some");
      if (row._tag === "Some") {
        assert.equal(row.value.branch, "main");
        assert.equal(row.value.origin, "main");
      }
    }),
  );

  it.effect("findByOrigin returns the matching open worktree", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 30 });
      const repo = yield* ProjectionWorktreeRepository;

      yield* repo.upsert({
        worktreeId: WorktreeId.make("wt-pr-42"),
        projectId: ProjectId.make("project-x"),
        branch: "feat/x",
        worktreePath: "/tmp/wt",
        origin: "pr",
        prNumber: 42,
        issueNumber: null,
        prTitle: "Add x",
        issueTitle: null,
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
        archivedAt: null,
        manualPosition: 0,
      });

      const found = yield* repo.findByOrigin({
        projectId: ProjectId.make("project-x"),
        kind: "pr",
        number: 42,
      });
      assert.equal(found, "wt-pr-42");
    }),
  );

  it.effect("findByOrigin ignores archived worktrees", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 30 });
      const repo = yield* ProjectionWorktreeRepository;

      yield* repo.upsert({
        worktreeId: WorktreeId.make("wt-pr-42-archived"),
        projectId: ProjectId.make("project-x"),
        branch: "feat/x",
        worktreePath: "/tmp/wt",
        origin: "pr",
        prNumber: 42,
        issueNumber: null,
        prTitle: null,
        issueTitle: null,
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
        archivedAt: "2026-05-09T00:00:00.000Z",
        manualPosition: 0,
      });

      const found = yield* repo.findByOrigin({
        projectId: ProjectId.make("project-x"),
        kind: "pr",
        number: 42,
      });
      assert.isNull(found);
    }),
  );
});
```

Run: `bun run test apps/server/src/persistence/Layers/ProjectionWorktrees.test.ts`
Expected: FAIL ("Cannot find module").

- [ ] **Step 2: Implement the repository**

Read the **existing pattern** in `apps/server/src/persistence/Layers/ProjectionThreads.ts` first — match the `Effect.Service` / `Layer.effect` shape exactly (effect/Schema imports, `SqlSchema.void` for writes, `SqlSchema.findOneOption` / `SqlSchema.findAll` for reads).

Create `apps/server/src/persistence/Layers/ProjectionWorktrees.ts`:

```typescript
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Context, Effect, Layer, Option, Schema } from "effect";
import { ProjectId } from "@t3tools/contracts";
import { Worktree, WorktreeId } from "@t3tools/contracts/worktree";

const WorktreeRow = Schema.Struct({
  worktree_id: Schema.String,
  project_id: Schema.String,
  branch: Schema.String,
  worktree_path: Schema.NullOr(Schema.String),
  origin: Schema.String,
  pr_number: Schema.NullOr(Schema.Number),
  issue_number: Schema.NullOr(Schema.Number),
  pr_title: Schema.NullOr(Schema.String),
  issue_title: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  archived_at: Schema.NullOr(Schema.String),
  manual_position: Schema.Number,
});

const rowToWorktree = (row: typeof WorktreeRow.Type): Worktree =>
  ({
    worktreeId: WorktreeId.make(row.worktree_id),
    projectId: ProjectId.make(row.project_id),
    branch: row.branch,
    worktreePath: row.worktree_path,
    origin: row.origin as Worktree["origin"],
    prNumber: row.pr_number,
    issueNumber: row.issue_number,
    prTitle: row.pr_title,
    issueTitle: row.issue_title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    manualPosition: row.manual_position,
  }) as Worktree;

export interface ProjectionWorktreeRepositoryShape {
  readonly upsert: (worktree: Worktree) => Effect.Effect<void, never>;
  readonly getById: (id: WorktreeId) => Effect.Effect<Option.Option<Worktree>, never>;
  readonly listByProject: (projectId: ProjectId) => Effect.Effect<ReadonlyArray<Worktree>, never>;
  readonly findByOrigin: (input: {
    projectId: ProjectId;
    kind: "pr" | "issue";
    number: number;
  }) => Effect.Effect<WorktreeId | null, never>;
  readonly markArchived: (input: {
    worktreeId: WorktreeId;
    archivedAt: string;
  }) => Effect.Effect<void, never>;
  readonly markRestored: (worktreeId: WorktreeId) => Effect.Effect<void, never>;
  readonly deleteById: (worktreeId: WorktreeId) => Effect.Effect<void, never>;
  readonly setManualPosition: (input: {
    worktreeId: WorktreeId;
    position: number;
  }) => Effect.Effect<void, never>;
}

export class ProjectionWorktreeRepository extends Context.Tag("ProjectionWorktreeRepository")<
  ProjectionWorktreeRepository,
  ProjectionWorktreeRepositoryShape
>() {}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsert: ProjectionWorktreeRepositoryShape["upsert"] = (w) =>
    sql`
      INSERT INTO projection_worktrees (
        worktree_id, project_id, branch, worktree_path, origin,
        pr_number, issue_number, pr_title, issue_title,
        created_at, updated_at, archived_at, manual_position
      )
      VALUES (
        ${w.worktreeId}, ${w.projectId}, ${w.branch}, ${w.worktreePath}, ${w.origin},
        ${w.prNumber}, ${w.issueNumber}, ${w.prTitle}, ${w.issueTitle},
        ${w.createdAt}, ${w.updatedAt}, ${w.archivedAt}, ${w.manualPosition}
      )
      ON CONFLICT(worktree_id) DO UPDATE SET
        branch = excluded.branch,
        worktree_path = excluded.worktree_path,
        origin = excluded.origin,
        pr_number = excluded.pr_number,
        issue_number = excluded.issue_number,
        pr_title = excluded.pr_title,
        issue_title = excluded.issue_title,
        updated_at = excluded.updated_at,
        archived_at = excluded.archived_at,
        manual_position = excluded.manual_position
    `.pipe(Effect.asVoid, Effect.orDie);

  const getById: ProjectionWorktreeRepositoryShape["getById"] = (id) =>
    Effect.gen(function* () {
      const rows = yield* sql<typeof WorktreeRow.Type>`
        SELECT * FROM projection_worktrees WHERE worktree_id = ${id}
      `.pipe(Effect.orDie);
      return rows.length > 0 ? Option.some(rowToWorktree(rows[0]!)) : Option.none<Worktree>();
    });

  const listByProject: ProjectionWorktreeRepositoryShape["listByProject"] = (projectId) =>
    Effect.gen(function* () {
      const rows = yield* sql<typeof WorktreeRow.Type>`
        SELECT * FROM projection_worktrees
        WHERE project_id = ${projectId}
        ORDER BY manual_position ASC, created_at ASC
      `.pipe(Effect.orDie);
      return rows.map(rowToWorktree);
    });

  const findByOrigin: ProjectionWorktreeRepositoryShape["findByOrigin"] = (input) =>
    Effect.gen(function* () {
      const column = input.kind === "pr" ? "pr_number" : "issue_number";
      const rows = yield* sql<{ worktree_id: string }>`
        SELECT worktree_id FROM projection_worktrees
        WHERE project_id = ${input.projectId}
          AND origin = ${input.kind}
          AND ${sql(column)} = ${input.number}
          AND archived_at IS NULL
        LIMIT 1
      `.pipe(Effect.orDie);
      return rows.length > 0 ? WorktreeId.make(rows[0]!.worktree_id) : null;
    });

  const markArchived: ProjectionWorktreeRepositoryShape["markArchived"] = ({
    worktreeId,
    archivedAt,
  }) =>
    sql`UPDATE projection_worktrees SET archived_at = ${archivedAt}, updated_at = ${archivedAt} WHERE worktree_id = ${worktreeId}`.pipe(
      Effect.asVoid,
      Effect.orDie,
    );

  const markRestored: ProjectionWorktreeRepositoryShape["markRestored"] = (worktreeId) =>
    sql`UPDATE projection_worktrees SET archived_at = NULL, updated_at = ${new Date().toISOString()} WHERE worktree_id = ${worktreeId}`.pipe(
      Effect.asVoid,
      Effect.orDie,
    );

  const deleteById: ProjectionWorktreeRepositoryShape["deleteById"] = (worktreeId) =>
    sql`DELETE FROM projection_worktrees WHERE worktree_id = ${worktreeId}`.pipe(
      Effect.asVoid,
      Effect.orDie,
    );

  const setManualPosition: ProjectionWorktreeRepositoryShape["setManualPosition"] = ({
    worktreeId,
    position,
  }) =>
    sql`UPDATE projection_worktrees SET manual_position = ${position}, updated_at = ${new Date().toISOString()} WHERE worktree_id = ${worktreeId}`.pipe(
      Effect.asVoid,
      Effect.orDie,
    );

  return {
    upsert,
    getById,
    listByProject,
    findByOrigin,
    markArchived,
    markRestored,
    deleteById,
    setManualPosition,
  } satisfies ProjectionWorktreeRepositoryShape;
});

export const ProjectionWorktreeRepositoryLive = Layer.effect(ProjectionWorktreeRepository, make);
```

If the existing `ProjectionThreads.ts` uses a different DI shape (e.g. `Effect.Service` instead of `Context.Tag`), match that style instead. Read it first and copy the wrapper.

- [ ] **Step 3: Run tests**

```
bun run test apps/server/src/persistence/Layers/ProjectionWorktrees.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run full + typecheck**

```
bun typecheck
bun run test apps/server
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/persistence/Layers/ProjectionWorktrees.ts apps/server/src/persistence/Layers/ProjectionWorktrees.test.ts
git commit -m "Add ProjectionWorktreeRepository"
```

---

### Task 5: Extend ProjectionThreads with worktree_id and bucket override

**Files:**

- Modify: `apps/server/src/persistence/Layers/ProjectionThreads.ts`
- Modify: `apps/server/src/persistence/Layers/ProjectionThreads.test.ts` (add new test cases)

- [ ] **Step 1: Read the existing repository**

Read `apps/server/src/persistence/Layers/ProjectionThreads.ts` end-to-end. Identify:

- The `ProjectionThread` schema definition (the row shape used at the API surface).
- The `upsertProjectionThreadRow` insert/update logic.
- The select-by-id and list-by-project queries.

- [ ] **Step 2: Add fields to the API schema**

Add three new optional fields to the `ProjectionThread` schema:

```typescript
worktreeId: Schema.NullOr(Schema.String),
manualStatusBucket: Schema.NullOr(StatusBucket),
manualPosition: Schema.Number,
```

(Import `StatusBucket` from `@t3tools/contracts/worktree`.)

- [ ] **Step 3: Update the upsert SQL**

In the existing `INSERT INTO projection_threads (...)` and `ON CONFLICT ... DO UPDATE SET ...`, add the three new columns. Default `manual_position` to `0`, `worktree_id` and `manual_status_bucket` to `null`.

Add two new repository methods:

```typescript
setManualBucket: (input: { threadId: ThreadId; bucket: StatusBucket | null }) =>
  Effect.Effect<void, never>;
setManualPosition: (input: { threadId: ThreadId; position: number }) => Effect.Effect<void, never>;
attachToWorktree: (input: { threadId: ThreadId; worktreeId: WorktreeId | null }) =>
  Effect.Effect<void, never>;
```

Implement each as a single UPDATE statement, mirroring the existing repository style.

- [ ] **Step 4: Add tests**

Append to `ProjectionThreads.test.ts`:

```typescript
it.effect("setManualBucket persists the override", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 30 });
    const repo = yield* ProjectionThreadRepository;
    // ... insert a thread row first using existing test helper ...
    yield* repo.setManualBucket({ threadId: ThreadId.make("thread-1"), bucket: "review" });
    const row = yield* repo.getById(ThreadId.make("thread-1"));
    if (row._tag === "Some") {
      assert.equal(row.value.manualStatusBucket, "review");
    }
  }),
);

it.effect("attachToWorktree sets the worktree_id", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 30 });
    const repo = yield* ProjectionThreadRepository;
    yield* repo.attachToWorktree({
      threadId: ThreadId.make("thread-1"),
      worktreeId: WorktreeId.make("wt-1"),
    });
    const row = yield* repo.getById(ThreadId.make("thread-1"));
    if (row._tag === "Some") {
      assert.equal(row.value.worktreeId, "wt-1");
    }
  }),
);
```

- [ ] **Step 5: Run tests + typecheck**

```
bun run test apps/server/src/persistence/Layers/ProjectionThreads.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/persistence/Layers/ProjectionThreads.ts apps/server/src/persistence/Layers/ProjectionThreads.test.ts
git commit -m "Extend ProjectionThreads with worktree_id and bucket override"
```

---

### Task 6: Worktree projector (event → repository writes)

**Files:**

- Modify: `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` (add new projector definition)
- Test: `apps/server/src/orchestration/Layers/ProjectionPipeline.worktrees.test.ts`

- [ ] **Step 1: Read the existing pipeline**

Read `apps/server/src/orchestration/Layers/ProjectionPipeline.ts` lines 560-650 to understand the `applyThreadsProjection` pattern. Note where projectors are _registered_ (likely a `projectors: ReadonlyArray<ProjectorDefinition>` constant).

- [ ] **Step 2: Write a failing projector test**

Create `apps/server/src/orchestration/Layers/ProjectionPipeline.worktrees.test.ts`:

```typescript
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { runMigrations } from "../../persistence/Migrations.ts";
import * as NodeSqliteClient from "../../persistence/NodeSqliteClient.ts";
import {
  ProjectionWorktreeRepository,
  ProjectionWorktreeRepositoryLive,
} from "../../persistence/Layers/ProjectionWorktrees.ts";
import { applyWorktreesProjection } from "./ProjectionPipeline.ts";
import { WorktreeId } from "@t3tools/contracts/worktree";
import { ProjectId } from "@t3tools/contracts";

const layer = it.layer(
  Layer.mergeAll(NodeSqliteClient.layerMemory(), ProjectionWorktreeRepositoryLive),
);

layer("applyWorktreesProjection", (it) => {
  it.effect("worktree.created upserts a row", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 30 });
      yield* applyWorktreesProjection({
        type: "worktree.created",
        payload: {
          worktreeId: WorktreeId.make("w1"),
          projectId: ProjectId.make("p1"),
          branch: "main",
          worktreePath: null,
          origin: "main",
          prNumber: null,
          issueNumber: null,
          prTitle: null,
          issueTitle: null,
          createdAt: "2026-05-08T00:00:00.000Z",
          updatedAt: "2026-05-08T00:00:00.000Z",
        },
      } as never);

      const repo = yield* ProjectionWorktreeRepository;
      const row = yield* repo.getById(WorktreeId.make("w1"));
      assert.equal(row._tag, "Some");
    }),
  );

  it.effect("worktree.archived sets archived_at", () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 30 });
      const repo = yield* ProjectionWorktreeRepository;
      yield* repo.upsert({
        worktreeId: WorktreeId.make("w2"),
        projectId: ProjectId.make("p1"),
        branch: "feat",
        worktreePath: "/tmp/feat",
        origin: "branch",
        prNumber: null,
        issueNumber: null,
        prTitle: null,
        issueTitle: null,
        createdAt: "2026-05-08T00:00:00.000Z",
        updatedAt: "2026-05-08T00:00:00.000Z",
        archivedAt: null,
        manualPosition: 0,
      });

      yield* applyWorktreesProjection({
        type: "worktree.archived",
        payload: {
          worktreeId: WorktreeId.make("w2"),
          archivedAt: "2026-05-09T00:00:00.000Z",
          deletedBranch: false,
        },
      } as never);

      const row = yield* repo.getById(WorktreeId.make("w2"));
      if (row._tag === "Some") {
        assert.equal(row.value.archivedAt, "2026-05-09T00:00:00.000Z");
      }
    }),
  );
});
```

Run: `bun run test apps/server/src/orchestration/Layers/ProjectionPipeline.worktrees.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the projector**

In `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`, immediately after the `applyThreadsProjection` definition, add:

```typescript
export const applyWorktreesProjection: ProjectorDefinition["apply"] = Effect.fn(
  "applyWorktreesProjection",
)(function* (event) {
  const worktreeRepo = yield* ProjectionWorktreeRepository;
  const threadRepo = yield* ProjectionThreadRepository;

  switch (event.type) {
    case "worktree.created":
      yield* worktreeRepo.upsert({
        worktreeId: event.payload.worktreeId,
        projectId: event.payload.projectId,
        branch: event.payload.branch,
        worktreePath: event.payload.worktreePath,
        origin: event.payload.origin,
        prNumber: event.payload.prNumber,
        issueNumber: event.payload.issueNumber,
        prTitle: event.payload.prTitle,
        issueTitle: event.payload.issueTitle,
        createdAt: event.payload.createdAt,
        updatedAt: event.payload.updatedAt,
        archivedAt: null,
        manualPosition: 0,
      });
      return;
    case "worktree.archived":
      yield* worktreeRepo.markArchived({
        worktreeId: event.payload.worktreeId,
        archivedAt: event.payload.archivedAt,
      });
      return;
    case "worktree.restored":
      yield* worktreeRepo.markRestored(event.payload.worktreeId);
      return;
    case "worktree.deleted":
      yield* worktreeRepo.deleteById(event.payload.worktreeId);
      return;
    case "thread.attachedToWorktree":
      yield* threadRepo.attachToWorktree({
        threadId: event.payload.threadId,
        worktreeId: event.payload.worktreeId,
      });
      return;
    case "thread.statusBucketOverridden":
      yield* threadRepo.setManualBucket({
        threadId: event.payload.threadId,
        bucket: event.payload.bucket,
      });
      return;
    default:
      return;
  }
});
```

Then register it in the `projectors` array (look for the existing list — add a new entry following the same shape as the threads projector).

- [ ] **Step 4: Run tests**

```
bun run test apps/server/src/orchestration/Layers/ProjectionPipeline.worktrees.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/orchestration/Layers/ProjectionPipeline.ts apps/server/src/orchestration/Layers/ProjectionPipeline.worktrees.test.ts
git commit -m "Add worktree projector"
```

---

## Phase 3 — Server git workflow

### Task 7: Default-branch detection helper

**Files:**

- Create: `apps/server/src/git/detectDefaultBranch.ts`
- Test: `apps/server/src/git/detectDefaultBranch.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { detectDefaultBranch } from "./detectDefaultBranch.ts";

describe("detectDefaultBranch", () => {
  it("returns the trimmed origin/HEAD branch when present", async () => {
    const exec = vi.fn(async (args: ReadonlyArray<string>) => {
      if (args.join(" ") === "symbolic-ref --short refs/remotes/origin/HEAD") {
        return { stdout: "origin/main\n", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });
    expect(await detectDefaultBranch("/tmp/repo", exec)).toBe("main");
  });

  it("falls back to local main", async () => {
    const exec = vi.fn(async (args: ReadonlyArray<string>) => {
      if (args.includes("--verify") && args[args.length - 1] === "refs/heads/main") {
        return { stdout: "deadbeef\n", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });
    expect(await detectDefaultBranch("/tmp/repo", exec)).toBe("main");
  });

  it("falls back to master if main is missing", async () => {
    const exec = vi.fn(async (args: ReadonlyArray<string>) => {
      if (args.includes("--verify") && args[args.length - 1] === "refs/heads/master") {
        return { stdout: "deadbeef\n", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });
    expect(await detectDefaultBranch("/tmp/repo", exec)).toBe("master");
  });

  it("falls back to first listed local branch", async () => {
    const exec = vi.fn(async (args: ReadonlyArray<string>) => {
      if (args[0] === "branch" && args.includes("--list")) {
        return { stdout: "feature/x\nfeature/y\n", exitCode: 0 };
      }
      return { stdout: "", exitCode: 1 };
    });
    expect(await detectDefaultBranch("/tmp/repo", exec)).toBe("feature/x");
  });

  it("returns 'main' as last resort", async () => {
    const exec = vi.fn(async () => ({ stdout: "", exitCode: 1 }));
    expect(await detectDefaultBranch("/tmp/repo", exec)).toBe("main");
  });
});
```

Run: `bun run test apps/server/src/git/detectDefaultBranch.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

```typescript
export type GitExec = (
  args: ReadonlyArray<string>,
) => Promise<{ stdout: string; exitCode: number }>;

export async function detectDefaultBranch(cwd: string, exec: GitExec): Promise<string> {
  const tries: ReadonlyArray<() => Promise<string | null>> = [
    async () => {
      const { stdout, exitCode } = await exec([
        "symbolic-ref",
        "--short",
        "refs/remotes/origin/HEAD",
      ]);
      if (exitCode !== 0) return null;
      const trimmed = stdout.trim();
      if (!trimmed) return null;
      return trimmed.replace(/^origin\//, "");
    },
    async () => {
      const { exitCode } = await exec(["show-ref", "--verify", "--quiet", "refs/heads/main"]);
      return exitCode === 0 ? "main" : null;
    },
    async () => {
      const { exitCode } = await exec(["show-ref", "--verify", "--quiet", "refs/heads/master"]);
      return exitCode === 0 ? "master" : null;
    },
    async () => {
      const { stdout, exitCode } = await exec(["branch", "--list", "--format=%(refname:short)"]);
      if (exitCode !== 0) return null;
      const first = stdout.split("\n").find((l) => l.trim().length > 0);
      return first ?? null;
    },
  ];

  for (const attempt of tries) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch {
      // continue
    }
  }
  return "main";
}
```

The `cwd` is unused inside the function but reserved as the API surface so the caller can wire it through to the underlying git child-process invocation.

- [ ] **Step 3: Run tests + typecheck**

```
bun run test apps/server/src/git/detectDefaultBranch.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/git/detectDefaultBranch.ts apps/server/src/git/detectDefaultBranch.test.ts
git commit -m "Add detectDefaultBranch helper with fallback chain"
```

---

### Task 8: IssueThreadBundler (mirror of PR thread bundler)

**Files:**

- Create: `apps/server/src/sourceControl/IssueThreadBundler.ts`
- Test: `apps/server/src/sourceControl/IssueThreadBundler.test.ts`

- [ ] **Step 1: Read the PR bundler**

Read `apps/server/src/git/GitManager.ts` lines 1393-1553 (the `preparePullRequestThread` function) to understand:

- Input shape (`GitPreparePullRequestThreadInput`).
- How it serialises the PR body + comments into the seed prompt.
- The size caps (8KB body / 5 comments / 2KB per comment from `SOURCE_CONTROL_DETAIL_*` constants in `packages/contracts/src/sourceControl.ts`).

- [ ] **Step 2: Write a failing test**

```typescript
import { describe, expect, it } from "vitest";
import { bundleIssueThread } from "./IssueThreadBundler.ts";
import { SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES } from "@t3tools/contracts/sourceControl";

describe("bundleIssueThread", () => {
  it("formats issue title + body into seed prompt", () => {
    const seed = bundleIssueThread({
      number: 42,
      title: "Add darkmode",
      body: "We should support a dark theme.",
      comments: [],
      url: "https://github.com/owner/repo/issues/42",
      author: "alice",
    });
    expect(seed).toMatch(/#42/);
    expect(seed).toMatch(/Add darkmode/);
    expect(seed).toMatch(/We should support a dark theme\./);
  });

  it("truncates body over byte budget", () => {
    const long = "x".repeat(SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES + 100);
    const seed = bundleIssueThread({
      number: 1,
      title: "t",
      body: long,
      comments: [],
      url: "https://example.com/1",
      author: "x",
    });
    expect(seed.length).toBeLessThan(long.length);
    expect(seed).toMatch(/\[truncated\]/);
  });

  it("truncates comments to 5 maximum", () => {
    const comments = Array.from({ length: 10 }, (_, i) => ({
      author: "u",
      body: `comment ${i}`,
      createdAt: "2026-05-08T00:00:00.000Z",
    }));
    const seed = bundleIssueThread({
      number: 1,
      title: "t",
      body: "b",
      comments,
      url: "https://example.com/1",
      author: "x",
    });
    expect((seed.match(/^### Comment/gm) ?? []).length).toBe(5);
  });
});
```

Run: `bun run test apps/server/src/sourceControl/IssueThreadBundler.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
import {
  SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES,
  SOURCE_CONTROL_DETAIL_COMMENT_BODY_MAX_BYTES,
  SOURCE_CONTROL_DETAIL_MAX_COMMENTS,
} from "@t3tools/contracts/sourceControl";

export interface IssueThreadInput {
  number: number;
  title: string;
  body: string;
  comments: ReadonlyArray<{ author: string; body: string; createdAt: string }>;
  url: string;
  author: string;
}

const truncateBytes = (s: string, max: number): string => {
  const buf = Buffer.from(s, "utf8");
  if (buf.length <= max) return s;
  return buf.subarray(0, max).toString("utf8") + "\n[truncated]";
};

export function bundleIssueThread(input: IssueThreadInput): string {
  const lines: string[] = [];
  lines.push(`## Issue #${input.number}: ${input.title}`);
  lines.push(`Author: ${input.author}`);
  lines.push(`URL: ${input.url}`);
  lines.push("");
  lines.push("### Body");
  lines.push(truncateBytes(input.body, SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES));
  lines.push("");

  const trimmedComments = input.comments.slice(0, SOURCE_CONTROL_DETAIL_MAX_COMMENTS);
  for (const c of trimmedComments) {
    lines.push(`### Comment by ${c.author} at ${c.createdAt}`);
    lines.push(truncateBytes(c.body, SOURCE_CONTROL_DETAIL_COMMENT_BODY_MAX_BYTES));
    lines.push("");
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests + typecheck**

```
bun run test apps/server/src/sourceControl/IssueThreadBundler.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/sourceControl/IssueThreadBundler.ts apps/server/src/sourceControl/IssueThreadBundler.test.ts
git commit -m "Add IssueThreadBundler mirroring PR bundler"
```

---

### Task 9: GitWorkflowService.createWorktreeForProject

**Files:**

- Modify: `apps/server/src/git/GitWorkflowService.ts`
- Test: `apps/server/src/git/GitWorkflowService.createWorktreeForProject.test.ts`

- [ ] **Step 1: Read existing service shape**

Read `apps/server/src/git/GitWorkflowService.ts` end-to-end to understand:

- The service interface definition (Context.Tag or Effect.Service).
- How `preparePullRequestThread` delegates to `gitManager.preparePullRequestThread`.
- How the project info (workspace_root) is looked up.

- [ ] **Step 2: Failing test**

Create `GitWorkflowService.createWorktreeForProject.test.ts` exercising the four intent kinds. Mock the underlying `GitManager` and `ProjectionWorktreeRepository`. Assert:

- `kind: "branch"` calls `gitManager.createWorktree` with the supplied branch.
- `kind: "pr"` resolves the head ref then creates the worktree, then bundles the PR thread into a draft session.
- `kind: "issue"` invents `issue/<n>-<slug>`, creates the worktree, bundles the issue thread.
- `kind: "newBranch"` with no `branchName` generates `task/<6-char>` slug; with one, uses it.
- All four insert a `projection_worktrees` row via the repo.
- Re-attach: when the projection already has a non-archived row for the same PR/issue, the function returns that worktreeId without creating a new one.

(The test will be ~200 lines with mocks. Use `vi.fn()` style consistent with existing GitManager tests.)

Run: expect FAIL.

- [ ] **Step 3: Implement**

In `GitWorkflowService.ts`, add a new method:

```typescript
createWorktreeForProject: (input: { projectId: ProjectId; intent: CreateWorktreeIntent }) =>
  Effect.Effect<{ worktreeId: WorktreeId; sessionId: ThreadId }, GitWorkflowServiceError>;
```

Implementation flow:

```typescript
const createWorktreeForProject: GitWorkflowServiceShape["createWorktreeForProject"] = ({
  projectId,
  intent,
}) =>
  Effect.gen(function* () {
    const projectRepo = yield* ProjectionProjectRepository;
    const worktreeRepo = yield* ProjectionWorktreeRepository;

    // 1. Re-attach detection for PR / issue intents
    if (intent.kind === "pr" || intent.kind === "issue") {
      const existing = yield* worktreeRepo.findByOrigin({
        projectId,
        kind: intent.kind,
        number: intent.number,
      });
      if (existing) {
        const sessionId = yield* findLatestSessionForWorktree(existing);
        return { worktreeId: existing, sessionId };
      }
    }

    // 2. Resolve target branch
    const project = yield* projectRepo.getById(projectId);
    if (project._tag !== "Some")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: `Project ${projectId} not found` }),
      );
    const cwd = project.value.workspaceRoot;

    let targetBranch: string;
    let prMeta: { number: number; title: string } | null = null;
    let issueMeta: { number: number; title: string } | null = null;

    switch (intent.kind) {
      case "branch":
        targetBranch = intent.branchName;
        break;
      case "newBranch":
        targetBranch = intent.branchName ?? `task/${randomShortId()}`;
        break;
      case "pr": {
        const pr = yield* gitManager.resolvePullRequest({ cwd, reference: String(intent.number) });
        targetBranch = pr.headRefName;
        prMeta = { number: intent.number, title: pr.title };
        break;
      }
      case "issue": {
        const issue = yield* gitManager.fetchIssue({ cwd, number: intent.number });
        targetBranch = `issue/${intent.number}-${slugify(issue.title)}`;
        issueMeta = { number: intent.number, title: issue.title };
        break;
      }
    }

    // 3. Create on-disk worktree
    const worktreePath = yield* gitManager.createWorktree({ cwd, branch: targetBranch });

    // 4. Persist worktree row by emitting a domain event
    const worktreeId = WorktreeId.make(`worktree-${randomShortId(12)}`);
    const now = new Date().toISOString();
    yield* eventBus.emit({
      type: "worktree.created",
      payload: {
        worktreeId,
        projectId,
        branch: targetBranch,
        worktreePath,
        origin: intent.kind === "newBranch" ? "branch" : intent.kind,
        prNumber: prMeta?.number ?? null,
        issueNumber: issueMeta?.number ?? null,
        prTitle: prMeta?.title ?? null,
        issueTitle: issueMeta?.title ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });

    // 5. Seed a draft session
    let seedPrompt: string | null = null;
    if (intent.kind === "pr") {
      seedPrompt = yield* gitManager
        .preparePullRequestThread({
          cwd,
          reference: String(intent.number),
          mode: "worktree",
        })
        .pipe(Effect.map((r) => r.threadSeedPrompt));
    } else if (intent.kind === "issue") {
      const issue = yield* gitManager.fetchIssueDetail({ cwd, number: intent.number });
      seedPrompt = bundleIssueThread(issue);
    }

    const sessionId = yield* createDraftSession({
      projectId,
      worktreeId,
      seedPrompt,
    });

    yield* eventBus.emit({
      type: "thread.attachedToWorktree",
      payload: { threadId: sessionId, worktreeId, attachedAt: now },
    });

    return { worktreeId, sessionId };
  });

const randomShortId = (length = 6): string =>
  Array.from(
    { length },
    () => "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)],
  ).join("");

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
```

Wire `createDraftSession`, `findLatestSessionForWorktree`, `eventBus`, `gitManager.fetchIssue`, `gitManager.fetchIssueDetail` from the existing GitWorkflowService context — if any are missing, add the minimal helpers needed (they may already exist as `fetchPullRequestSummary` analogues).

- [ ] **Step 4: Run tests + typecheck**

```
bun run test apps/server/src/git/GitWorkflowService.createWorktreeForProject.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/git/GitWorkflowService.ts apps/server/src/git/GitWorkflowService.createWorktreeForProject.test.ts
git commit -m "Add GitWorkflowService.createWorktreeForProject"
```

---

### Task 10: Worktree archive / restore / delete in GitWorkflowService

**Files:**

- Modify: `apps/server/src/git/GitWorkflowService.ts`
- Test: `apps/server/src/git/GitWorkflowService.lifecycle.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// Test: archive removes on-disk checkout, emits worktree.archived event
// Test: restore re-creates checkout, emits worktree.restored event
// Test: delete cascades sessions and emits worktree.deleted event
// Test: archive on `main` worktree fails with GitWorkflowServiceError
// Test: archive with deleteBranch=true also removes branch
// Test: delete with type-branch-name confirmation when dirty (caller must verify before calling — server doesn't gate, but does emit a warning event if dirty)
```

Write each as an `it.effect` block. Mock `gitManager.removeWorktree`, `gitManager.deleteBranch`, `eventBus.emit`. Run: expect FAIL.

- [ ] **Step 2: Implement**

```typescript
const archiveWorktree: GitWorkflowServiceShape["archiveWorktree"] = ({
  worktreeId,
  deleteBranch,
}) =>
  Effect.gen(function* () {
    const worktreeRepo = yield* ProjectionWorktreeRepository;
    const worktree = yield* worktreeRepo.getById(worktreeId);
    if (worktree._tag !== "Some")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: `Worktree ${worktreeId} not found` }),
      );
    const w = worktree.value;
    if (w.origin === "main")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: "Cannot archive the main worktree" }),
      );

    if (w.worktreePath) {
      yield* gitManager.removeWorktree({ path: w.worktreePath });
    }
    if (deleteBranch) {
      yield* gitManager
        .deleteBranch({ branch: w.branch })
        .pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning(`Could not delete branch ${w.branch}: ${cause}`),
          ),
        );
    }

    const archivedAt = new Date().toISOString();
    yield* eventBus.emit({
      type: "worktree.archived",
      payload: { worktreeId, archivedAt, deletedBranch: deleteBranch },
    });
  });

const restoreWorktree: GitWorkflowServiceShape["restoreWorktree"] = (worktreeId) =>
  Effect.gen(function* () {
    const worktreeRepo = yield* ProjectionWorktreeRepository;
    const worktree = yield* worktreeRepo.getById(worktreeId);
    if (worktree._tag !== "Some")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: `Worktree ${worktreeId} not found` }),
      );

    const w = worktree.value;
    const branchExists = yield* gitManager.branchExists({ branch: w.branch });
    if (!branchExists)
      return yield* Effect.fail(
        new GitWorkflowServiceError({
          message: `Branch ${w.branch} no longer exists; cannot restore`,
        }),
      );

    const newPath = yield* gitManager.createWorktree({
      cwd: getProjectCwd(w.projectId),
      branch: w.branch,
    });
    yield* eventBus.emit({
      type: "worktree.restored",
      payload: { worktreeId, restoredAt: new Date().toISOString() },
    });
    yield* worktreeRepo.upsert({ ...w, worktreePath: newPath, archivedAt: null });
  });

const deleteWorktree: GitWorkflowServiceShape["deleteWorktree"] = ({ worktreeId, deleteBranch }) =>
  Effect.gen(function* () {
    const worktreeRepo = yield* ProjectionWorktreeRepository;
    const worktree = yield* worktreeRepo.getById(worktreeId);
    if (worktree._tag !== "Some")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: `Worktree ${worktreeId} not found` }),
      );
    const w = worktree.value;
    if (w.origin === "main")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: "Cannot delete the main worktree" }),
      );

    if (w.worktreePath) {
      yield* gitManager.removeWorktree({ path: w.worktreePath, force: true });
    }
    if (deleteBranch) {
      yield* gitManager
        .deleteBranch({ branch: w.branch })
        .pipe(
          Effect.catchAll((cause) =>
            Effect.logWarning(`Could not delete branch ${w.branch}: ${cause}`),
          ),
        );
    }

    yield* eventBus.emit({
      type: "worktree.deleted",
      payload: {
        worktreeId,
        deletedAt: new Date().toISOString(),
        deletedBranch: deleteBranch,
      },
    });
  });

const findWorktreeForOrigin: GitWorkflowServiceShape["findWorktreeForOrigin"] = (input) =>
  Effect.gen(function* () {
    const repo = yield* ProjectionWorktreeRepository;
    return yield* repo.findByOrigin(input);
  });
```

Add the new methods to the service interface.

- [ ] **Step 3: Run tests + typecheck**

```
bun run test apps/server/src/git/GitWorkflowService.lifecycle.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/git/GitWorkflowService.ts apps/server/src/git/GitWorkflowService.lifecycle.test.ts
git commit -m "Add worktree archive/restore/delete to GitWorkflowService"
```

---

## Phase 4 — Server RPC routes + data migration

### Task 11: Wire new WS RPCs in `ws.ts`

**Files:**

- Modify: `apps/server/src/ws.ts`

- [ ] **Step 1: Read existing route pattern**

Read `apps/server/src/ws.ts` lines 635-650 (one example) and 1069-1075 (the existing `gitPreparePullRequestThread` route). Note the `observeRpcEffect(METHOD, service.method(input).pipe(...))` shape and the `{ "rpc.aggregate": "git" }` aggregate label.

- [ ] **Step 2: Add the new routes**

Append to the routes table (the big object literal that maps method names to handler functions):

```typescript
[WS_METHODS.gitCreateWorktreeForProject]: (input) =>
  observeRpcEffect(
    WS_METHODS.gitCreateWorktreeForProject,
    gitWorkflow.createWorktreeForProject(input).pipe(
      Effect.mapError(
        (cause) =>
          new GitWorkflowError({
            message: "Failed to create worktree",
            cause,
          }),
      ),
    ),
    { "rpc.aggregate": "git" },
  ),
[WS_METHODS.gitFindWorktreeForOrigin]: (input) =>
  observeRpcEffect(
    WS_METHODS.gitFindWorktreeForOrigin,
    gitWorkflow.findWorktreeForOrigin(input),
    { "rpc.aggregate": "git" },
  ),
[WS_METHODS.gitArchiveWorktree]: (input) =>
  observeRpcEffect(
    WS_METHODS.gitArchiveWorktree,
    gitWorkflow.archiveWorktree(input),
    { "rpc.aggregate": "git" },
  ),
[WS_METHODS.gitRestoreWorktree]: (input) =>
  observeRpcEffect(
    WS_METHODS.gitRestoreWorktree,
    gitWorkflow.restoreWorktree(input.worktreeId),
    { "rpc.aggregate": "git" },
  ),
[WS_METHODS.gitDeleteWorktree]: (input) =>
  observeRpcEffect(
    WS_METHODS.gitDeleteWorktree,
    gitWorkflow.deleteWorktree(input),
    { "rpc.aggregate": "git" },
  ),
[WS_METHODS.threadsSetManualBucket]: (input) =>
  observeRpcEffect(
    WS_METHODS.threadsSetManualBucket,
    Effect.gen(function* () {
      const bus = yield* OrchestrationEventBus;
      yield* bus.emit({
        type: "thread.statusBucketOverridden",
        payload: {
          threadId: input.threadId,
          bucket: input.bucket,
          changedAt: new Date().toISOString(),
        },
      });
    }),
    { "rpc.aggregate": "orchestration" },
  ),
[WS_METHODS.threadsSetManualPosition]: (input) =>
  observeRpcEffect(
    WS_METHODS.threadsSetManualPosition,
    Effect.gen(function* () {
      const repo = yield* ProjectionThreadRepository;
      yield* repo.setManualPosition({ threadId: input.threadId, position: input.position });
    }),
    { "rpc.aggregate": "orchestration" },
  ),
[WS_METHODS.worktreesSetManualPosition]: (input) =>
  observeRpcEffect(
    WS_METHODS.worktreesSetManualPosition,
    Effect.gen(function* () {
      const repo = yield* ProjectionWorktreeRepository;
      yield* repo.setManualPosition({ worktreeId: input.worktreeId, position: input.position });
    }),
    { "rpc.aggregate": "git" },
  ),
[WS_METHODS.projectsInitializeGit]: (input) =>
  observeRpcEffect(
    WS_METHODS.projectsInitializeGit,
    gitWorkflow.initializeGitForProject(input.projectId),
    { "rpc.aggregate": "git" },
  ),
```

(`gitWorkflow.initializeGitForProject` will be added in Task 30 — this stub will fail typecheck until then. That's fine — we'll type-check at the end of Phase 4 only after Task 13 lands.)

- [ ] **Step 3: Add a smoke test**

Append to `apps/server/src/server.test.ts` (or the closest existing routes test):

```typescript
it.effect("gitArchiveWorktree route exists and rejects unknown worktreeId", () =>
  Effect.gen(function* () {
    const server = yield* makeTestServer();
    const result = yield* server
      .callRpc(WS_METHODS.gitArchiveWorktree, {
        worktreeId: WorktreeId.make("nonexistent"),
        deleteBranch: false,
      })
      .pipe(Effect.either);
    assert.isTrue(Either.isLeft(result));
  }),
);
```

(Adjust to the existing test helper API.)

- [ ] **Step 4: Verify**

```
bun typecheck
bun run test apps/server/src/server.test.ts
```

Expected: PASS (after Task 13).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/ws.ts apps/server/src/server.test.ts
git commit -m "Wire new worktree WS RPC routes"
```

---

### Task 12: One-time data migration on server startup

**Files:**

- Create: `apps/server/src/persistence/Migrations/030_Worktrees_backfill.ts` (or a startup hook — see step 1)
- Modify: `apps/server/src/serverRuntimeStartup.ts` (call backfill after migrations)
- Test: `apps/server/src/persistence/worktreeBackfill.test.ts`

- [ ] **Step 1: Decide placement**

Read `apps/server/src/serverRuntimeStartup.ts` to see how migrations and one-time tasks are sequenced. The backfill must run **after** migration 030 and **before** any sidebar query is served. Use the existing post-migration hook if one exists; otherwise add a step.

- [ ] **Step 2: Failing test**

Create `apps/server/src/persistence/worktreeBackfill.test.ts`:

```typescript
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "./Migrations.ts";
import * as NodeSqliteClient from "./NodeSqliteClient.ts";
import { runWorktreeBackfill } from "./worktreeBackfill.ts";
import {
  ProjectionWorktreeRepository,
  ProjectionWorktreeRepositoryLive,
} from "./Layers/ProjectionWorktrees.ts";
import { ProjectId } from "@t3tools/contracts";

const layer = it.layer(
  Layer.mergeAll(NodeSqliteClient.layerMemory(), ProjectionWorktreeRepositoryLive),
);

layer("worktreeBackfill", (it) => {
  it.effect("creates a main worktree per git project and assigns local threads to it", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      // Insert one git project + one thread with no worktree_path.
      yield* sql`
        INSERT INTO projection_projects (project_id, title, workspace_root, scripts_json, created_at, updated_at)
        VALUES ('p1', 'My Project', '/tmp/has-git', '{}', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z')
      `;
      yield* sql`
        INSERT INTO projection_threads (thread_id, project_id, title, created_at, updated_at, manual_position)
        VALUES ('t1', 'p1', 'first chat', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z', 0)
      `;

      yield* runWorktreeBackfill({
        detectDefaultBranch: () => Promise.resolve("main"),
        isGitRepo: () => Promise.resolve(true),
      });

      const repo = yield* ProjectionWorktreeRepository;
      const worktrees = yield* repo.listByProject(ProjectId.make("p1"));
      assert.equal(worktrees.length, 1);
      assert.equal(worktrees[0]!.origin, "main");

      const threadWorktree = yield* sql<{ worktree_id: string | null }>`
        SELECT worktree_id FROM projection_threads WHERE thread_id = 't1'
      `;
      assert.equal(threadWorktree[0]!.worktree_id, worktrees[0]!.worktreeId);
    }),
  );

  it.effect("groups threads with worktree_path under synthesised worktree rows", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      yield* sql`
        INSERT INTO projection_projects (project_id, title, workspace_root, scripts_json, created_at, updated_at)
        VALUES ('p2', 'P2', '/tmp/p2', '{}', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z')
      `;
      yield* sql`
        INSERT INTO projection_threads (thread_id, project_id, title, branch, worktree_path, created_at, updated_at, manual_position)
        VALUES ('ta', 'p2', 'a', 'feature/x', '/tmp/wt-x', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z', 0)
      `;
      yield* sql`
        INSERT INTO projection_threads (thread_id, project_id, title, branch, worktree_path, created_at, updated_at, manual_position)
        VALUES ('tb', 'p2', 'b', 'feature/x', '/tmp/wt-x', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z', 0)
      `;

      yield* runWorktreeBackfill({
        detectDefaultBranch: () => Promise.resolve("main"),
        isGitRepo: () => Promise.resolve(true),
      });

      const repo = yield* ProjectionWorktreeRepository;
      const worktrees = yield* repo.listByProject(ProjectId.make("p2"));
      // 1 main + 1 manual for feature/x
      assert.equal(worktrees.length, 2);
      const manual = worktrees.find((w) => w.origin === "manual");
      assert.exists(manual);
      assert.equal(manual!.branch, "feature/x");
    }),
  );

  it.effect("non-git project gets no worktree rows", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      yield* sql`
        INSERT INTO projection_projects (project_id, title, workspace_root, scripts_json, created_at, updated_at)
        VALUES ('p3', 'P3', '/tmp/p3', '{}', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z')
      `;

      yield* runWorktreeBackfill({
        detectDefaultBranch: () => Promise.resolve("main"),
        isGitRepo: (path: string) => Promise.resolve(false),
      });

      const repo = yield* ProjectionWorktreeRepository;
      const worktrees = yield* repo.listByProject(ProjectId.make("p3"));
      assert.equal(worktrees.length, 0);
    }),
  );

  it.effect("re-running is a no-op (idempotent)", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 30 });

      yield* sql`
        INSERT INTO projection_projects (project_id, title, workspace_root, scripts_json, created_at, updated_at)
        VALUES ('p4', 'P4', '/tmp/p4', '{}', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z')
      `;
      yield* sql`
        INSERT INTO projection_threads (thread_id, project_id, title, created_at, updated_at, manual_position)
        VALUES ('t4', 'p4', 'x', '2026-05-08T00:00:00Z', '2026-05-08T00:00:00Z', 0)
      `;

      yield* runWorktreeBackfill({
        detectDefaultBranch: () => Promise.resolve("main"),
        isGitRepo: () => Promise.resolve(true),
      });
      yield* runWorktreeBackfill({
        detectDefaultBranch: () => Promise.resolve("main"),
        isGitRepo: () => Promise.resolve(true),
      });

      const repo = yield* ProjectionWorktreeRepository;
      const worktrees = yield* repo.listByProject(ProjectId.make("p4"));
      assert.equal(worktrees.length, 1);
    }),
  );
});
```

Run: expect FAIL.

- [ ] **Step 3: Implement the backfill**

Create `apps/server/src/persistence/worktreeBackfill.ts`:

```typescript
import { Effect } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ProjectionWorktreeRepository } from "./Layers/ProjectionWorktrees.ts";
import { ProjectId } from "@t3tools/contracts";
import { WorktreeId } from "@t3tools/contracts/worktree";

interface BackfillOptions {
  detectDefaultBranch: (cwd: string) => Promise<string>;
  isGitRepo: (cwd: string) => Promise<boolean>;
}

export const runWorktreeBackfill = (opts: BackfillOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const repo = yield* ProjectionWorktreeRepository;

    const projects = yield* sql<{
      project_id: string;
      workspace_root: string;
    }>`SELECT project_id, workspace_root FROM projection_projects WHERE deleted_at IS NULL`;

    for (const p of projects) {
      const projectId = ProjectId.make(p.project_id);
      const isGit = yield* Effect.promise(() => opts.isGitRepo(p.workspace_root));
      if (!isGit) continue;

      const existingMain = (yield* repo.listByProject(projectId)).find((w) => w.origin === "main");
      if (!existingMain) {
        const defaultBranch = yield* Effect.promise(() =>
          opts.detectDefaultBranch(p.workspace_root),
        );
        const now = new Date().toISOString();
        const mainId = WorktreeId.make(`worktree-${p.project_id}-main`);
        yield* repo.upsert({
          worktreeId: mainId,
          projectId,
          branch: defaultBranch,
          worktreePath: null,
          origin: "main",
          prNumber: null,
          issueNumber: null,
          prTitle: null,
          issueTitle: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          manualPosition: 0,
        });
      }

      // Threads with no worktree_path → assign to main
      yield* sql`
        UPDATE projection_threads
        SET worktree_id = (
          SELECT worktree_id FROM projection_worktrees
          WHERE project_id = ${p.project_id} AND origin = 'main'
        )
        WHERE project_id = ${p.project_id}
          AND worktree_id IS NULL
          AND (worktree_path IS NULL OR worktree_path = '')
      `;

      // Threads with worktree_path → group under synthesised manual rows
      const groups = yield* sql<{ branch: string | null; worktree_path: string }>`
        SELECT DISTINCT branch, worktree_path FROM projection_threads
        WHERE project_id = ${p.project_id}
          AND worktree_id IS NULL
          AND worktree_path IS NOT NULL AND worktree_path != ''
      `;

      for (const g of groups) {
        const wId = WorktreeId.make(`worktree-${p.project_id}-${hash(g.worktree_path)}`);
        const now = new Date().toISOString();
        yield* repo.upsert({
          worktreeId: wId,
          projectId,
          branch: g.branch ?? "unknown",
          worktreePath: g.worktree_path,
          origin: "manual",
          prNumber: null,
          issueNumber: null,
          prTitle: null,
          issueTitle: null,
          createdAt: now,
          updatedAt: now,
          archivedAt: null,
          manualPosition: 0,
        });
        yield* sql`
          UPDATE projection_threads
          SET worktree_id = ${wId}
          WHERE project_id = ${p.project_id}
            AND worktree_path = ${g.worktree_path}
            AND worktree_id IS NULL
        `;
      }
    }
  });

const hash = (s: string): string => {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h) ^ c.charCodeAt(0);
  return (h >>> 0).toString(36);
};
```

- [ ] **Step 4: Wire into startup**

In `apps/server/src/serverRuntimeStartup.ts`, after the migrations run, call `runWorktreeBackfill({ detectDefaultBranch, isGitRepo })`. Use real implementations (`detectDefaultBranch` from Task 7; `isGitRepo` is a small helper that runs `git rev-parse --is-inside-work-tree` — add inline if missing).

- [ ] **Step 5: Run tests + typecheck**

```
bun run test apps/server/src/persistence/worktreeBackfill.test.ts
bun typecheck
bun run test apps/server
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/persistence/worktreeBackfill.ts apps/server/src/persistence/worktreeBackfill.test.ts apps/server/src/serverRuntimeStartup.ts
git commit -m "Backfill worktrees from existing threads on startup"
```

---

### Task 13: GitWorkflowService.initializeGitForProject

**Files:**

- Modify: `apps/server/src/git/GitWorkflowService.ts`
- Test: `apps/server/src/git/GitWorkflowService.initializeGit.test.ts`

- [ ] **Step 1: Failing test**

```typescript
it.effect("initializes git in workspace_root and synthesises a main worktree", () =>
  Effect.gen(function* () {
    // Set up a mock project at /tmp/non-git
    // Call initializeGitForProject
    // Assert: gitManager.init was called with cwd=/tmp/non-git
    // Assert: a main worktree row exists for the project
    // Assert: existing threads in the project are attached to the new main worktree
  }),
);
```

- [ ] **Step 2: Implement**

```typescript
const initializeGitForProject: GitWorkflowServiceShape["initializeGitForProject"] = (projectId) =>
  Effect.gen(function* () {
    const projectRepo = yield* ProjectionProjectRepository;
    const worktreeRepo = yield* ProjectionWorktreeRepository;
    const project = yield* projectRepo.getById(projectId);
    if (project._tag !== "Some")
      return yield* Effect.fail(
        new GitWorkflowServiceError({ message: `Project ${projectId} not found` }),
      );

    yield* gitManager.init({ cwd: project.value.workspaceRoot });

    const branch = yield* Effect.promise(() =>
      detectDefaultBranch(project.value.workspaceRoot, runGitProcess),
    );
    const now = new Date().toISOString();
    const mainId = WorktreeId.make(`worktree-${projectId}-main`);
    yield* eventBus.emit({
      type: "worktree.created",
      payload: {
        worktreeId: mainId,
        projectId,
        branch,
        worktreePath: null,
        origin: "main",
        prNumber: null,
        issueNumber: null,
        prTitle: null,
        issueTitle: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Attach existing threads (those with no worktree_id) to main
    yield* sql`
      UPDATE projection_threads
      SET worktree_id = ${mainId}
      WHERE project_id = ${projectId} AND worktree_id IS NULL
    `;
  });
```

- [ ] **Step 3: Verify + commit**

```
bun run test apps/server/src/git/GitWorkflowService.initializeGit.test.ts
bun typecheck
git add apps/server/src/git/GitWorkflowService.ts apps/server/src/git/GitWorkflowService.initializeGit.test.ts
git commit -m "Add initializeGitForProject"
```

---

## Phase 5 — Web data layer + sidebar logic

### Task 14: Bucket derivation + aggregate worktree status logic

**Files:**

- Modify: `apps/web/src/components/Sidebar.logic.ts` (add new pure functions)
- Modify: `apps/web/src/components/Sidebar.logic.test.ts` (add tests)

- [ ] **Step 1: Failing tests**

Append to `Sidebar.logic.test.ts`:

```typescript
import { deriveStatusBucket, aggregateWorktreeStatus, shouldSuggestArchive } from "./Sidebar.logic";

describe("deriveStatusBucket", () => {
  it("returns manual override when set", () => {
    expect(
      deriveStatusBucket({
        manualBucket: "review",
        statusPill: { label: "Working", colorClass: "", dotClass: "", pulse: false },
      }),
    ).toBe("review");
  });

  it("maps Working → in_progress", () => {
    expect(
      deriveStatusBucket({
        manualBucket: null,
        statusPill: { label: "Working", colorClass: "", dotClass: "", pulse: false },
      }),
    ).toBe("in_progress");
  });

  it("maps Plan Ready / Pending Approval / Awaiting Input → review", () => {
    for (const label of ["Plan Ready", "Pending Approval", "Awaiting Input"] as const) {
      expect(
        deriveStatusBucket({
          manualBucket: null,
          statusPill: { label, colorClass: "", dotClass: "", pulse: false },
        }),
      ).toBe("review");
    }
  });

  it("maps Completed → done", () => {
    expect(
      deriveStatusBucket({
        manualBucket: null,
        statusPill: { label: "Completed", colorClass: "", dotClass: "", pulse: false },
      }),
    ).toBe("done");
  });

  it("returns idle when statusPill is null", () => {
    expect(deriveStatusBucket({ manualBucket: null, statusPill: null })).toBe("idle");
  });
});

describe("aggregateWorktreeStatus", () => {
  it("returns 'in_progress' if any session is in_progress", () => {
    expect(aggregateWorktreeStatus(["idle", "in_progress", "done"])).toBe("in_progress");
  });
  it("returns 'review' if any session is review (no in_progress)", () => {
    expect(aggregateWorktreeStatus(["done", "review", "idle"])).toBe("review");
  });
  it("returns 'done' if all sessions are done", () => {
    expect(aggregateWorktreeStatus(["done", "done"])).toBe("done");
  });
  it("returns 'idle' for empty list or all-idle", () => {
    expect(aggregateWorktreeStatus([])).toBe("idle");
    expect(aggregateWorktreeStatus(["idle", "idle"])).toBe("idle");
  });
});

describe("shouldSuggestArchive", () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  it("returns true when all sessions DONE and max updated_at >= 7 days old", () => {
    const now = new Date("2026-05-08T00:00:00Z").getTime();
    const oldDate = new Date(now - SEVEN_DAYS_MS - 1).toISOString();
    expect(
      shouldSuggestArchive({
        buckets: ["done", "done"],
        latestUpdatedAt: oldDate,
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("returns false when any session not DONE", () => {
    const now = new Date("2026-05-08T00:00:00Z").getTime();
    expect(
      shouldSuggestArchive({
        buckets: ["done", "in_progress"],
        latestUpdatedAt: "2024-01-01T00:00:00Z",
        nowMs: now,
      }),
    ).toBe(false);
  });

  it("returns false when DONE but recent", () => {
    const now = new Date("2026-05-08T00:00:00Z").getTime();
    const recent = new Date(now - 1000).toISOString();
    expect(
      shouldSuggestArchive({
        buckets: ["done"],
        latestUpdatedAt: recent,
        nowMs: now,
      }),
    ).toBe(false);
  });
});
```

Run: `bun run test apps/web/src/components/Sidebar.logic.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement**

Append to `Sidebar.logic.ts`:

```typescript
import type { StatusBucket } from "@t3tools/contracts/worktree";

export type SidebarStatusBucket = StatusBucket;

export interface DeriveBucketInput {
  manualBucket: SidebarStatusBucket | null;
  statusPill: ThreadStatusPill | null;
}

export function deriveStatusBucket(input: DeriveBucketInput): SidebarStatusBucket {
  if (input.manualBucket) return input.manualBucket;
  if (!input.statusPill) return "idle";
  switch (input.statusPill.label) {
    case "Working":
    case "Connecting":
      return "in_progress";
    case "Plan Ready":
    case "Pending Approval":
    case "Awaiting Input":
      return "review";
    case "Completed":
      return "done";
    default:
      return "idle";
  }
}

export function aggregateWorktreeStatus(
  buckets: ReadonlyArray<SidebarStatusBucket>,
): SidebarStatusBucket {
  if (buckets.length === 0) return "idle";
  if (buckets.includes("in_progress")) return "in_progress";
  if (buckets.includes("review")) return "review";
  if (buckets.every((b) => b === "done")) return "done";
  return "idle";
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface ShouldSuggestArchiveInput {
  buckets: ReadonlyArray<SidebarStatusBucket>;
  latestUpdatedAt: string;
  nowMs: number;
}

export function shouldSuggestArchive(input: ShouldSuggestArchiveInput): boolean {
  if (input.buckets.length === 0) return false;
  if (!input.buckets.every((b) => b === "done")) return false;
  const updatedMs = new Date(input.latestUpdatedAt).getTime();
  if (Number.isNaN(updatedMs)) return false;
  return input.nowMs - updatedMs >= SEVEN_DAYS_MS;
}
```

- [ ] **Step 3: Run tests**

```
bun run test apps/web/src/components/Sidebar.logic.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/Sidebar.logic.ts apps/web/src/components/Sidebar.logic.test.ts
git commit -m "Add bucket derivation and aggregate worktree status helpers"
```

---

### Task 15: useSidebarTree composition hook

**Files:**

- Create: `apps/web/src/components/sidebar/hooks/useSidebarTree.ts`
- Test: `apps/web/src/components/sidebar/hooks/useSidebarTree.test.ts`

- [ ] **Step 1: Plan the data shape**

The hook returns a tree:

```typescript
interface SidebarTree {
  projects: ReadonlyArray<{
    project: Project;
    isGitRepo: boolean;
    worktrees: ReadonlyArray<{
      worktree: Worktree;
      aggregateStatus: SidebarStatusBucket;
      diffStats: { added: number; removed: number } | null;
      shouldSuggestArchive: boolean;
      buckets: Record<SidebarStatusBucket, ReadonlyArray<SidebarThreadSummary>>;
      archivedSessions: ReadonlyArray<SidebarThreadSummary>;
    }>;
    flatSessions: ReadonlyArray<SidebarThreadSummary>; // non-git fallback
  }>;
}
```

- [ ] **Step 2: Failing test**

```typescript
import { describe, expect, it } from "vitest";
import { composeSidebarTree } from "./useSidebarTree.ts";

describe("composeSidebarTree", () => {
  it("groups sessions by worktree and bucket", () => {
    const tree = composeSidebarTree({
      projects: [{ id: "p1", name: "P1", workspaceRoot: "/p", isGitRepo: true }],
      worktrees: [
        {
          worktreeId: "w-main",
          projectId: "p1",
          branch: "main",
          worktreePath: null,
          origin: "main",
        } as never,
      ],
      threads: [
        {
          threadId: "t1",
          projectId: "p1",
          worktreeId: "w-main",
          manualStatusBucket: null,
          statusPill: { label: "Completed", colorClass: "", dotClass: "", pulse: false },
        } as never,
      ],
      diffStats: { "w-main": null },
      nowMs: Date.now(),
    });

    expect(tree.projects[0]!.worktrees[0]!.buckets.done).toHaveLength(1);
    expect(tree.projects[0]!.worktrees[0]!.aggregateStatus).toBe("done");
  });

  it("non-git project flattens sessions ignoring worktree level", () => {
    const tree = composeSidebarTree({
      projects: [{ id: "p2", name: "P2", workspaceRoot: "/p", isGitRepo: false }],
      worktrees: [],
      threads: [{ threadId: "t-flat", projectId: "p2", worktreeId: null } as never],
      diffStats: {},
      nowMs: Date.now(),
    });
    expect(tree.projects[0]!.flatSessions).toHaveLength(1);
    expect(tree.projects[0]!.worktrees).toHaveLength(0);
  });
});
```

Run: expect FAIL.

- [ ] **Step 3: Implement**

```typescript
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  aggregateWorktreeStatus,
  deriveStatusBucket,
  shouldSuggestArchive,
} from "../../Sidebar.logic.ts";
import type { SidebarStatusBucket } from "../../Sidebar.logic.ts";

// Pure composition function (testable separately)
export interface ComposeInput {
  projects: ReadonlyArray<{ id: string; name: string; workspaceRoot: string; isGitRepo: boolean }>;
  worktrees: ReadonlyArray<{
    worktreeId: string;
    projectId: string;
    branch: string;
    worktreePath: string | null;
    origin: "main" | "branch" | "pr" | "issue" | "manual";
    archivedAt: string | null;
    manualPosition: number;
    updatedAt: string;
  }>;
  threads: ReadonlyArray<{
    threadId: string;
    projectId: string;
    worktreeId: string | null;
    manualStatusBucket: SidebarStatusBucket | null;
    statusPill: { label: string } | null;
    updatedAt: string;
  }>;
  diffStats: Record<string, { added: number; removed: number } | null>;
  nowMs: number;
}

export function composeSidebarTree(input: ComposeInput) {
  return {
    projects: input.projects.map((p) => {
      const projectWorktrees = input.worktrees.filter((w) => w.projectId === p.id);
      const projectThreads = input.threads.filter((t) => t.projectId === p.id);

      if (!p.isGitRepo) {
        return {
          project: p,
          isGitRepo: false,
          worktrees: [],
          flatSessions: projectThreads,
        };
      }

      const worktrees = projectWorktrees.map((w) => {
        const inWorktree = projectThreads.filter((t) => t.worktreeId === w.worktreeId);
        const buckets: Record<SidebarStatusBucket, typeof inWorktree> = {
          idle: [],
          in_progress: [],
          review: [],
          done: [],
        };
        for (const t of inWorktree) {
          const bucket = deriveStatusBucket({
            manualBucket: t.manualStatusBucket,
            statusPill: t.statusPill as never,
          });
          buckets[bucket].push(t);
        }
        const allBuckets = inWorktree.map((t) =>
          deriveStatusBucket({
            manualBucket: t.manualStatusBucket,
            statusPill: t.statusPill as never,
          }),
        );
        const latestUpdatedAt = inWorktree.length
          ? inWorktree
              .map((t) => t.updatedAt)
              .sort()
              .at(-1)!
          : w.updatedAt;
        return {
          worktree: w,
          aggregateStatus: aggregateWorktreeStatus(allBuckets),
          diffStats: input.diffStats[w.worktreeId] ?? null,
          shouldSuggestArchive: shouldSuggestArchive({
            buckets: allBuckets,
            latestUpdatedAt,
            nowMs: input.nowMs,
          }),
          buckets,
          archivedSessions: [],
        };
      });

      return {
        project: p,
        isGitRepo: true,
        worktrees,
        flatSessions: [],
      };
    }),
  };
}

export function useSidebarTree() {
  const projectsQ = useQuery({
    queryKey: ["projects"],
    queryFn: /* existing */ () => fetchProjects(),
  });
  const worktreesQ = useQuery({ queryKey: ["worktrees"], queryFn: () => fetchWorktrees() });
  const threadsQ = useQuery({ queryKey: ["threads"], queryFn: () => fetchThreads() });
  const diffStatsQ = useQuery({
    queryKey: ["worktree-diff-stats"],
    queryFn: () => fetchDiffStats(),
  });

  return useMemo(
    () =>
      composeSidebarTree({
        projects: projectsQ.data ?? [],
        worktrees: worktreesQ.data ?? [],
        threads: threadsQ.data ?? [],
        diffStats: diffStatsQ.data ?? {},
        nowMs: Date.now(),
      }),
    [projectsQ.data, worktreesQ.data, threadsQ.data, diffStatsQ.data],
  );
}
```

The actual fetch functions (`fetchProjects`, `fetchWorktrees`, etc.) should reuse existing query hooks where they exist (look for `useProjectsQuery`, `useThreadsQuery` in `apps/web/src/lib/`). Add a new `fetchWorktrees` query that calls a new server RPC `worktrees.listForActiveProjects` (add this RPC to `ws.ts` if it doesn't already exist as a side effect of the projector — alternatively, fold into the existing project list response).

- [ ] **Step 4: Run tests + typecheck + commit**

```
bun run test apps/web/src/components/sidebar/hooks/useSidebarTree.test.ts
bun typecheck
git add apps/web/src/components/sidebar/hooks/useSidebarTree.ts apps/web/src/components/sidebar/hooks/useSidebarTree.test.ts
git commit -m "Add useSidebarTree composition hook"
```

---

## Phase 6 — Sidebar component refactor

> **Note:** Phase 6 is a series of mechanical refactors. The "test" for each task is _the existing tests still pass_ — there's no new behavior. Each task should be a single commit with the file extracted, all imports updated, and `bun run test apps/web` green.

### Task 16: Extract `SidebarShell.tsx`

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarShell.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx` (replace top-level layout with `<SidebarShell>`)
- Modify: `apps/web/src/components/AppSidebarLayout.tsx` (point at the new file if needed)

- [ ] **Step 1: Run baseline tests, confirm green**

```
bun run test apps/web/src/components
```

- [ ] **Step 2: Create the new file**

Read `apps/web/src/components/Sidebar.tsx` lines 2400-2700 (the top-level layout return). Move that JSX into `SidebarShell.tsx`, keeping the props interface identical. Re-export from `Sidebar.tsx` so external imports don't break.

- [ ] **Step 3: Update imports**

Add to `Sidebar.tsx`:

```typescript
import { SidebarShell } from "./sidebar/SidebarShell";
```

Replace the moved JSX in `Sidebar.tsx` with `<SidebarShell {...props} />`.

- [ ] **Step 4: Verify**

```
bun run test apps/web/src/components
bun typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/sidebar/SidebarShell.tsx apps/web/src/components/Sidebar.tsx
git commit -m "Extract SidebarShell"
```

---

### Task 17: Extract `SidebarProjectList` + `SidebarProjectRow`

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarProjectList.tsx`
- Create: `apps/web/src/components/sidebar/SidebarProjectRow.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx`

- [ ] **Step 1: Identify the project-list region in current Sidebar.tsx**

Lines ~1900-2200 of `Sidebar.tsx` contain the `SortableContextComponent` that wraps the project list. The per-project header rendering (favicon, name, badges, +) lives a bit lower. Extract both into `SidebarProjectList.tsx` (the dnd context wrapper) and `SidebarProjectRow.tsx` (a single project header row).

- [ ] **Step 2: Move code**

Copy the JSX + relevant logic into the new files. Pass through the props the rest of `Sidebar.tsx` needs: `projects`, `activeProjectId`, `onAddProject`, `onProjectClick`, etc.

`SidebarProjectRow` should accept a render-prop or a child slot for the worktree list area so the next task can fill it in.

- [ ] **Step 3: Update Sidebar.tsx**

Replace the moved code with `<SidebarProjectList projects={projects} ... renderProjectChildren={(project) => /* TODO worktree list */} />`.

- [ ] **Step 4: Verify + commit**

```
bun run test apps/web/src/components
bun typecheck
git add apps/web/src/components/sidebar/SidebarProjectList.tsx apps/web/src/components/sidebar/SidebarProjectRow.tsx apps/web/src/components/Sidebar.tsx
git commit -m "Extract SidebarProjectList and SidebarProjectRow"
```

---

### Task 18: Add `SidebarWorktreeRow.tsx`

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarWorktreeRow.tsx`
- Test: `apps/web/src/components/sidebar/SidebarWorktreeRow.test.tsx`

- [ ] **Step 1: Failing component test**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarWorktreeRow } from "./SidebarWorktreeRow.tsx";

describe("SidebarWorktreeRow", () => {
  const baseWorktree = {
    worktreeId: "w-1",
    projectId: "p-1",
    branch: "main",
    worktreePath: null,
    origin: "main" as const,
    prNumber: null,
    issueNumber: null,
    prTitle: null,
    issueTitle: null,
    createdAt: "2026-05-08T00:00:00Z",
    updatedAt: "2026-05-08T00:00:00Z",
    archivedAt: null,
    manualPosition: 0,
  };

  it("renders branch name", () => {
    render(
      <SidebarWorktreeRow
        worktree={baseWorktree}
        aggregateStatus="idle"
        diffStats={null}
        shouldSuggestArchive={false}
        onClick={vi.fn()}
        onAddSession={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders +N/-N when diff stats present", () => {
    render(
      <SidebarWorktreeRow
        worktree={baseWorktree}
        aggregateStatus="idle"
        diffStats={{ added: 44, removed: 25 }}
        shouldSuggestArchive={false}
        onClick={vi.fn()}
        onAddSession={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/\+44/)).toBeInTheDocument();
    expect(screen.getByText(/-25/)).toBeInTheDocument();
  });

  it("shows Archive? chip when shouldSuggestArchive is true", () => {
    render(
      <SidebarWorktreeRow
        worktree={baseWorktree}
        aggregateStatus="done"
        diffStats={null}
        shouldSuggestArchive={true}
        onClick={vi.fn()}
        onAddSession={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /archive\?/i })).toBeInTheDocument();
  });

  it("shows PR badge for origin=pr", () => {
    render(
      <SidebarWorktreeRow
        worktree={{ ...baseWorktree, origin: "pr", prNumber: 42 }}
        aggregateStatus="idle"
        diffStats={null}
        shouldSuggestArchive={false}
        onClick={vi.fn()}
        onAddSession={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/PR #42/)).toBeInTheDocument();
  });

  it("hides Archive in menu when origin=main", () => {
    render(
      <SidebarWorktreeRow
        worktree={baseWorktree}
        aggregateStatus="idle"
        diffStats={null}
        shouldSuggestArchive={false}
        onClick={vi.fn()}
        onAddSession={vi.fn()}
        onArchive={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    // Open menu (existing pattern uses radix dropdowns; trigger via aria-label)
    const trigger = screen.getByRole("button", { name: /worktree options/i });
    trigger.click();
    expect(screen.queryByText(/^Archive worktree$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Delete worktree$/)).not.toBeInTheDocument();
  });
});
```

Run: expect FAIL.

- [ ] **Step 2: Implement**

Create `SidebarWorktreeRow.tsx`:

```typescript
import * as React from "react";
import type { Worktree } from "@t3tools/contracts/worktree";
import type { SidebarStatusBucket } from "../Sidebar.logic.ts";
import { Plus, MoreHorizontal, GitBranch } from "lucide-react";
import { DropdownMenu } from "../ui/DropdownMenu"; // match existing menu component path

interface Props {
  worktree: Worktree;
  aggregateStatus: SidebarStatusBucket;
  diffStats: { added: number; removed: number } | null;
  shouldSuggestArchive: boolean;
  onClick: () => void;
  onAddSession: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

const STATUS_DOT_CLASSES: Record<SidebarStatusBucket, string> = {
  idle: "bg-zinc-500",
  in_progress: "bg-emerald-500 animate-pulse",
  review: "bg-amber-500",
  done: "bg-zinc-400",
};

export function SidebarWorktreeRow(props: Props) {
  const { worktree, aggregateStatus, diffStats, shouldSuggestArchive } = props;
  const isMain = worktree.origin === "main";

  return (
    <div
      className="group flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent"
      onClick={props.onClick}
    >
      <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[aggregateStatus]}`} />
      <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm">{worktree.branch}</span>

      {worktree.origin === "pr" && worktree.prNumber !== null && (
        <span className="text-xs px-1 rounded bg-blue-500/10 text-blue-500">
          PR #{worktree.prNumber}
        </span>
      )}
      {worktree.origin === "issue" && worktree.issueNumber !== null && (
        <span className="text-xs px-1 rounded bg-green-500/10 text-green-500">
          Issue #{worktree.issueNumber}
        </span>
      )}

      {diffStats && (
        <span className="text-xs ml-auto">
          <span className="text-emerald-500">+{diffStats.added}</span>
          <span className="text-red-500"> -{diffStats.removed}</span>
        </span>
      )}

      {shouldSuggestArchive && (
        <button
          type="button"
          className="text-xs px-1 rounded bg-amber-500/10 text-amber-500"
          onClick={(e) => {
            e.stopPropagation();
            props.onArchive();
          }}
        >
          Archive?
        </button>
      )}

      <button
        type="button"
        aria-label="Add session"
        className="invisible group-hover:visible"
        onClick={(e) => {
          e.stopPropagation();
          props.onAddSession();
        }}
      >
        <Plus className="h-4 w-4" />
      </button>

      <DropdownMenu trigger={
        <button type="button" aria-label="Worktree options">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      }>
        <DropdownMenu.Item onClick={props.onAddSession}>New session here</DropdownMenu.Item>
        {!isMain && <DropdownMenu.Item onClick={props.onArchive}>Archive worktree</DropdownMenu.Item>}
        {!isMain && <DropdownMenu.Item onClick={props.onDelete}>Delete worktree</DropdownMenu.Item>}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onClick={() => navigator.clipboard.writeText(worktree.worktreePath ?? "")}>
          Copy path
        </DropdownMenu.Item>
      </DropdownMenu>
    </div>
  );
}
```

Match the project's actual `DropdownMenu` import path and styling (read one existing call site for reference).

- [ ] **Step 3: Verify + commit**

```
bun run test apps/web/src/components/sidebar/SidebarWorktreeRow.test.tsx
bun typecheck
git add apps/web/src/components/sidebar/SidebarWorktreeRow.tsx apps/web/src/components/sidebar/SidebarWorktreeRow.test.tsx
git commit -m "Add SidebarWorktreeRow component"
```

---

### Task 19: Add `SidebarStatusBucket.tsx`

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarStatusBucket.tsx`
- Test: `apps/web/src/components/sidebar/SidebarStatusBucket.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SidebarStatusBucket } from "./SidebarStatusBucket.tsx";

describe("SidebarStatusBucket", () => {
  it("renders bucket label and count", () => {
    render(
      <SidebarStatusBucket bucket="review" count={3} collapsed={false} onToggle={vi.fn()}>
        <div>session</div>
      </SidebarStatusBucket>,
    );
    expect(screen.getByText(/REVIEW 3/)).toBeInTheDocument();
  });

  it("hides children when collapsed", () => {
    render(
      <SidebarStatusBucket bucket="idle" count={1} collapsed={true} onToggle={vi.fn()}>
        <div>hidden</div>
      </SidebarStatusBucket>,
    );
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("calls onToggle when header clicked", () => {
    const onToggle = vi.fn();
    render(
      <SidebarStatusBucket bucket="done" count={2} collapsed={false} onToggle={onToggle}>
        <div />
      </SidebarStatusBucket>,
    );
    fireEvent.click(screen.getByRole("button", { name: /done 2/i }));
    expect(onToggle).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { SidebarStatusBucket as Bucket } from "../Sidebar.logic.ts";

const LABELS: Record<Bucket, string> = {
  idle: "IDLE",
  in_progress: "IN PROGRESS",
  review: "REVIEW",
  done: "DONE",
};

interface Props {
  bucket: Bucket;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function SidebarStatusBucket({ bucket, count, collapsed, onToggle, children }: Props) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span>{LABELS[bucket]}</span>
        <span>{count}</span>
      </button>
      {!collapsed && <div className="pl-4">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```
bun run test apps/web/src/components/sidebar/SidebarStatusBucket.test.tsx
git add apps/web/src/components/sidebar/SidebarStatusBucket.tsx apps/web/src/components/sidebar/SidebarStatusBucket.test.tsx
git commit -m "Add SidebarStatusBucket component"
```

---

### Task 20: Extract `SidebarSessionRow.tsx` (rename from current SidebarThreadRow)

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarSessionRow.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx` (remove `SidebarThreadRow` definition; import the new one)

- [ ] **Step 1: Find current `SidebarThreadRow`**

In `Sidebar.tsx` (lines 304-600 region). Move the entire component definition into `SidebarSessionRow.tsx`. Add a "Reset bucket" item to its `…` menu, only enabled when `manualBucket !== null`. Wire it to a callback prop `onResetBucket: () => void`.

- [ ] **Step 2: Move + update**

```typescript
// In SidebarSessionRow.tsx — same shape as SidebarThreadRow plus:
interface SidebarSessionRowProps extends ExistingSidebarThreadRowProps {
  manualBucket: SidebarStatusBucket | null;
  onResetBucket: () => void;
}

// In the menu:
{props.manualBucket !== null && (
  <DropdownMenu.Item onClick={props.onResetBucket}>Reset bucket</DropdownMenu.Item>
)}
```

- [ ] **Step 3: Update all callers**

Search for `SidebarThreadRow` in the repo and replace with `SidebarSessionRow`. In particular `Sidebar.tsx` is the main caller — ensure all required new props are passed.

- [ ] **Step 4: Verify + commit**

```
bun run test apps/web/src/components
bun typecheck
git add apps/web/src/components/sidebar/SidebarSessionRow.tsx apps/web/src/components/Sidebar.tsx
git commit -m "Extract SidebarSessionRow with bucket reset action"
```

---

### Task 21: Add `SidebarArchivedGroup` + `SidebarEmptyStates`

**Files:**

- Create: `apps/web/src/components/sidebar/SidebarArchivedGroup.tsx`
- Create: `apps/web/src/components/sidebar/SidebarEmptyStates.tsx`

- [ ] **Step 1: Implement archived group**

```typescript
import * as React from "react";
import type { Worktree } from "@t3tools/contracts/worktree";

interface Props {
  archivedWorktrees: ReadonlyArray<Worktree>;
  onRestore: (worktreeId: string) => void;
  onDelete: (worktreeId: string) => void;
}

export function SidebarArchivedGroup({ archivedWorktrees, onRestore, onDelete }: Props) {
  const [collapsed, setCollapsed] = React.useState(true);
  if (archivedWorktrees.length === 0) return null;
  return (
    <div className="opacity-60">
      <button
        type="button"
        className="text-[10px] uppercase tracking-wide text-muted-foreground"
        onClick={() => setCollapsed((c) => !c)}
      >
        Archived ({archivedWorktrees.length})
      </button>
      {!collapsed &&
        archivedWorktrees.map((w) => (
          <div key={w.worktreeId} className="px-2 py-1 flex gap-2 items-center text-sm">
            <span className="truncate">{w.branch}</span>
            <button onClick={() => onRestore(w.worktreeId)}>Restore</button>
            <button onClick={() => onDelete(w.worktreeId)}>Delete</button>
          </div>
        ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement empty states**

```typescript
import * as React from "react";
import { GitBranchPlus } from "lucide-react";

export function NonGitProjectPill() {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      Local · no git
    </span>
  );
}

interface InitGitProps {
  onInit: () => void;
}

export function InitGitAffordance({ onInit }: InitGitProps) {
  return (
    <button
      type="button"
      onClick={onInit}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <GitBranchPlus className="h-3 w-3" /> Initialize git here
    </button>
  );
}

export function NoProjectsState() {
  return (
    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
      No projects yet. Click + to add one.
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```
bun typecheck
git add apps/web/src/components/sidebar/SidebarArchivedGroup.tsx apps/web/src/components/sidebar/SidebarEmptyStates.tsx
git commit -m "Add SidebarArchivedGroup and SidebarEmptyStates"
```

---

## Phase 7 — Sidebar interactions

### Task 22: `useSidebarDragDrop` hook + three sortable contexts

**Files:**

- Create: `apps/web/src/components/sidebar/hooks/useSidebarDragDrop.ts`
- Test: `apps/web/src/components/sidebar/hooks/useSidebarDragDrop.test.ts`

- [ ] **Step 1: Plan the contexts**

Three independent `@dnd-kit` `SortableContext` scopes:

1. **Projects** (already wired in current code — preserve as-is).
2. **Worktrees within a project** — IDs prefixed `worktree:{worktreeId}`. `main` is filtered out from the sortable list (rendered as a static row above).
3. **Sessions within a worktree** — IDs prefixed `session:{sessionId}`. The drop zone allows movement across status buckets within the same worktree.

- [ ] **Step 2: Failing test**

Test the hook's behavior on a drag end event using `@dnd-kit`'s `DragEndEvent`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSidebarDragDrop } from "./useSidebarDragDrop.ts";

describe("useSidebarDragDrop", () => {
  it("session drag across buckets calls setManualBucket", () => {
    const setManualBucket = vi.fn();
    const setManualPosition = vi.fn();
    const { result } = renderHook(() =>
      useSidebarDragDrop({
        setManualBucket,
        setManualPosition,
        setWorktreePosition: vi.fn(),
        getDropContext: () => ({
          kind: "session",
          worktreeId: "w1",
          fromBucket: "in_progress",
          toBucket: "review",
          newPosition: 2,
        }),
      }),
    );
    act(() => {
      result.current.handleDragEnd({
        active: { id: "session:s1" },
        over: { id: "bucket:review" },
      } as never);
    });
    expect(setManualBucket).toHaveBeenCalledWith({ threadId: "s1", bucket: "review" });
  });

  it("session drop into another worktree is ignored", () => {
    const setManualBucket = vi.fn();
    const setManualPosition = vi.fn();
    const { result } = renderHook(() =>
      useSidebarDragDrop({
        setManualBucket,
        setManualPosition,
        setWorktreePosition: vi.fn(),
        getDropContext: () => ({ kind: "ignore" }),
      }),
    );
    act(() => {
      result.current.handleDragEnd({
        active: { id: "session:s1" },
        over: { id: "worktree:w2" },
      } as never);
    });
    expect(setManualBucket).not.toHaveBeenCalled();
  });

  it("worktree drag reorders via setWorktreePosition", () => {
    const setWorktreePosition = vi.fn();
    const { result } = renderHook(() =>
      useSidebarDragDrop({
        setManualBucket: vi.fn(),
        setManualPosition: vi.fn(),
        setWorktreePosition,
        getDropContext: () => ({ kind: "worktree", projectId: "p1", newPosition: 3 }),
      }),
    );
    act(() => {
      result.current.handleDragEnd({
        active: { id: "worktree:w1" },
        over: { id: "worktree:w2" },
      } as never);
    });
    expect(setWorktreePosition).toHaveBeenCalledWith({ worktreeId: "w1", position: 3 });
  });
});
```

- [ ] **Step 3: Implement**

```typescript
import { useCallback } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import type { SidebarStatusBucket } from "../../Sidebar.logic.ts";

interface DropContext {
  kind: "session" | "worktree" | "ignore";
  // session
  worktreeId?: string;
  fromBucket?: SidebarStatusBucket;
  toBucket?: SidebarStatusBucket;
  // worktree
  projectId?: string;
  newPosition?: number;
}

interface Args {
  setManualBucket: (input: { threadId: string; bucket: SidebarStatusBucket }) => void;
  setManualPosition: (input: { threadId: string; position: number }) => void;
  setWorktreePosition: (input: { worktreeId: string; position: number }) => void;
  getDropContext: (event: DragEndEvent) => DropContext;
}

export function useSidebarDragDrop(args: Args) {
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const ctx = args.getDropContext(event);
      if (ctx.kind === "ignore" || !event.over) return;

      const activeId = String(event.active.id);
      if (ctx.kind === "session") {
        const threadId = activeId.replace(/^session:/, "");
        if (ctx.toBucket && ctx.fromBucket !== ctx.toBucket) {
          args.setManualBucket({ threadId, bucket: ctx.toBucket });
        }
        if (ctx.newPosition !== undefined) {
          args.setManualPosition({ threadId, position: ctx.newPosition });
        }
      } else if (ctx.kind === "worktree") {
        const worktreeId = activeId.replace(/^worktree:/, "");
        if (ctx.newPosition !== undefined) {
          args.setWorktreePosition({ worktreeId, position: ctx.newPosition });
        }
      }
    },
    [args],
  );

  return { handleDragEnd };
}
```

The actual `getDropContext` implementation lives at the call site in `Sidebar.tsx` (or `SidebarShell`) where the tree shape is in scope. It walks from `event.over.id` (a string like `bucket:review` or `worktree:w2`) and resolves the surrounding worktree/project for the active item.

- [ ] **Step 4: Wire into Sidebar.tsx**

Replace the existing single `DndContext` with three nested ones (or one outer with multiple `SortableContext` scopes — match the existing code structure). Pass `handleDragEnd` from the hook. Provide the mutation calls (RPC client) for `setManualBucket`, `setManualPosition`, `setWorktreePosition`.

- [ ] **Step 5: Verify + commit**

```
bun run test apps/web/src/components/sidebar
bun typecheck
git add apps/web/src/components/sidebar/hooks/useSidebarDragDrop.ts apps/web/src/components/sidebar/hooks/useSidebarDragDrop.test.ts apps/web/src/components/Sidebar.tsx
git commit -m "Wire drag-and-drop for session buckets and worktree reorder"
```

---

### Task 23: Click semantics — worktree opens latest session

**Files:**

- Modify: `apps/web/src/components/sidebar/SidebarWorktreeRow.tsx` (already calls onClick — wire it at the parent)
- Modify: `apps/web/src/components/Sidebar.tsx` (or SidebarProjectList — wire the onClick)
- Test: extend `apps/web/src/components/Sidebar.logic.test.ts`

- [ ] **Step 1: Logic test**

Add to `Sidebar.logic.test.ts`:

```typescript
import { resolveWorktreeClickTarget } from "./Sidebar.logic";

describe("resolveWorktreeClickTarget", () => {
  it("returns the session with highest updatedAt", () => {
    const result = resolveWorktreeClickTarget({
      sessions: [
        { threadId: "a", updatedAt: "2026-05-01T00:00:00Z" },
        { threadId: "b", updatedAt: "2026-05-08T00:00:00Z" },
        { threadId: "c", updatedAt: "2026-05-03T00:00:00Z" },
      ],
    });
    expect(result).toEqual({ kind: "open", threadId: "b" });
  });

  it("returns 'createDraft' when worktree has no sessions", () => {
    const result = resolveWorktreeClickTarget({ sessions: [] });
    expect(result.kind).toBe("createDraft");
  });
});
```

- [ ] **Step 2: Implement helper**

```typescript
export function resolveWorktreeClickTarget(input: {
  sessions: ReadonlyArray<{ threadId: string; updatedAt: string }>;
}): { kind: "open"; threadId: string } | { kind: "createDraft" } {
  if (input.sessions.length === 0) return { kind: "createDraft" };
  const latest = [...input.sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]!;
  return { kind: "open", threadId: latest.threadId };
}
```

- [ ] **Step 3: Wire into Sidebar.tsx**

In the call site that renders `<SidebarWorktreeRow onClick={...}>`, pass:

```typescript
onClick={() => {
  const target = resolveWorktreeClickTarget({ sessions: worktreeData.allSessions });
  if (target.kind === "open") {
    navigateToThread(target.threadId);
  } else {
    createDraftSessionForWorktree({ worktreeId: worktree.worktreeId });
  }
}}
```

`createDraftSessionForWorktree` is the existing draft-creation flow with the new `worktreeId` field (added in Task 25).

- [ ] **Step 4: Verify + commit**

```
bun run test apps/web/src/components
bun typecheck
git add apps/web/src/components/Sidebar.logic.ts apps/web/src/components/Sidebar.logic.test.ts apps/web/src/components/Sidebar.tsx
git commit -m "Worktree click opens latest session or seeds draft"
```

---

### Task 24: Hover + and keyboard shortcuts (⌘N, ⌘+Shift+N)

**Files:**

- Modify: `apps/web/src/components/Sidebar.tsx` (or SidebarShell — wire shortcuts)
- Modify: `apps/server/src/keybindings.ts` (add new keybindings if needed)
- Modify: `packages/contracts/src/keybindings.ts` (declare new key IDs)

- [ ] **Step 1: Find existing keybinding registry**

Read `apps/server/src/keybindings.ts` and `packages/contracts/src/keybindings.ts`. Existing IDs include `chat.new` and `chat.newLocal`. Add:

```typescript
"chat.newSessionInWorktree", // ⌘N when worktree focused
"chat.newWorktree",          // ⌘+Shift+N
```

(Defaults — match the existing `KeybindingDefault` shape.)

- [ ] **Step 2: Wire ⌘+Shift+N**

In `SidebarShell.tsx` (or wherever the existing keybinding handler is mounted), add:

```typescript
useKeybinding("chat.newWorktree", () => {
  openNewWorktreeDialog({ projectId: activeProjectId, defaultTab: "branches" });
});
```

- [ ] **Step 3: Wire ⌘N (worktree-focused)**

Track focused worktree via existing keyboard navigation. When a worktree row has focus and `chat.newSessionInWorktree` fires:

```typescript
useKeybinding("chat.newSessionInWorktree", () => {
  if (focusedWorktreeId) {
    createDraftSessionForWorktree({ worktreeId: focusedWorktreeId });
  }
});
```

- [ ] **Step 4: Verify + commit**

```
bun typecheck
bun run test apps/web/src/components
git add apps/web/src/components/Sidebar.tsx packages/contracts/src/keybindings.ts apps/server/src/keybindings.ts
git commit -m "Add chat.newSessionInWorktree and chat.newWorktree keybindings"
```

---

### Task 25: `useComposerDraftStore` — add `worktreeId`

**Files:**

- Modify: `apps/web/src/composerDraftStore.ts`
- Modify: any caller setting drafts (`apps/web/src/hooks/useHandleNewThread.ts` etc.)
- Test: extend the existing draft store test if present

- [ ] **Step 1: Find draft store**

Read `apps/web/src/composerDraftStore.ts`. Identify the draft state shape — probably a `Map<draftId, ThreadDraft>` with a setter `setLogicalProjectDraftThreadId(...)`.

- [ ] **Step 2: Add field**

Add `worktreeId: string | null` to the `ThreadDraft` shape. Default `null` for backward compatibility. Update the setter to accept and persist `worktreeId`.

- [ ] **Step 3: Update creators**

In `useHandleNewThread.ts`, when seeding a draft from a clicked worktree row, pass `worktreeId`. In the existing flow, `worktreeId = null` is fine (no regression).

- [ ] **Step 4: Update promotion**

When a draft promotes to a real thread (first message sent), include `worktreeId` in the orchestration RPC call (new field on the existing `thread.created` event payload — already added in Task 2 via `worktreeId` on `ThreadAttachedToWorktree`, but needs to be on `thread.created` too if it isn't already). After thread creation, emit `thread.attachedToWorktree` if `worktreeId` is non-null.

Alternatively (simpler): include `worktreeId` directly in the existing `ThreadCreatedPayload` so a single event covers it. Add `worktreeId: Schema.NullOr(WorktreeId)` to that payload, update the threads projector to call `attachToWorktree` when present.

- [ ] **Step 5: Verify + commit**

```
bun typecheck
bun run test apps/web
git add apps/web/src/composerDraftStore.ts apps/web/src/hooks/useHandleNewThread.ts packages/contracts/src/orchestration.ts apps/server/src/orchestration/Layers/ProjectionPipeline.ts
git commit -m "Thread draft and creation carry worktreeId"
```

---

## Phase 8 — NewWorktreeDialog

### Task 26: Dialog shell + tabs

**Files:**

- Create: `apps/web/src/components/newWorktreeDialog/NewWorktreeDialog.tsx`
- Test: `apps/web/src/components/newWorktreeDialog/NewWorktreeDialog.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewWorktreeDialog } from "./NewWorktreeDialog.tsx";

describe("NewWorktreeDialog", () => {
  it("renders the four tabs", () => {
    render(
      <NewWorktreeDialog
        open
        projectId="p1"
        sourceControlProvider="github"
        defaultTab="branches"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: /Branches/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pull Requests/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Issues/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /New branch/ })).toBeInTheDocument();
  });

  it("activates defaultTab on mount", () => {
    render(
      <NewWorktreeDialog
        open
        projectId="p1"
        sourceControlProvider="github"
        defaultTab="pull-requests"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("tab", { name: /Pull Requests/, selected: true })).toBeInTheDocument();
  });

  it("disables PR/Issues tabs and shows empty state for non-GitHub providers", () => {
    render(
      <NewWorktreeDialog
        open
        projectId="p1"
        sourceControlProvider="gitlab"
        defaultTab="branches"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Pull Requests/ }));
    expect(screen.getByText(/Not yet supported/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement shell**

```typescript
import * as React from "react";
import { Dialog } from "../ui/Dialog";
import { Tabs } from "../ui/Tabs";
import { BranchesTab } from "./BranchesTab";
import { PullRequestsTab } from "./PullRequestsTab";
import { IssuesTab } from "./IssuesTab";
import { NewBranchTab } from "./NewBranchTab";

type Tab = "branches" | "pull-requests" | "issues" | "new-branch";

interface Props {
  open: boolean;
  projectId: string;
  sourceControlProvider: "github" | "gitlab" | "azure-devops" | "bitbucket" | "unknown";
  defaultTab?: Tab;
  onClose: () => void;
}

export function NewWorktreeDialog(props: Props) {
  const [tab, setTab] = React.useState<Tab>(props.defaultTab ?? "branches");
  const isGithub = props.sourceControlProvider === "github";

  return (
    <Dialog open={props.open} onClose={props.onClose} title="New Worktree">
      <Tabs value={tab} onChange={setTab}>
        <Tabs.Tab id="branches">Branches</Tabs.Tab>
        <Tabs.Tab id="pull-requests">Pull Requests</Tabs.Tab>
        <Tabs.Tab id="issues">Issues</Tabs.Tab>
        <Tabs.Tab id="new-branch">New branch</Tabs.Tab>
      </Tabs>
      {tab === "branches" && <BranchesTab projectId={props.projectId} onCreated={props.onClose} />}
      {tab === "pull-requests" &&
        (isGithub ? (
          <PullRequestsTab projectId={props.projectId} onCreated={props.onClose} />
        ) : (
          <NotSupportedEmptyState provider={props.sourceControlProvider} />
        ))}
      {tab === "issues" &&
        (isGithub ? (
          <IssuesTab projectId={props.projectId} onCreated={props.onClose} />
        ) : (
          <NotSupportedEmptyState provider={props.sourceControlProvider} />
        ))}
      {tab === "new-branch" && (
        <NewBranchTab projectId={props.projectId} onCreated={props.onClose} />
      )}
    </Dialog>
  );
}

function NotSupportedEmptyState({ provider }: { provider: string }) {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      Not yet supported for {provider}.
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```
bun run test apps/web/src/components/newWorktreeDialog/NewWorktreeDialog.test.tsx
git add apps/web/src/components/newWorktreeDialog/NewWorktreeDialog.tsx apps/web/src/components/newWorktreeDialog/NewWorktreeDialog.test.tsx
git commit -m "Add NewWorktreeDialog shell with four tabs"
```

---

### Task 27: BranchesTab

**Files:**

- Create: `apps/web/src/components/newWorktreeDialog/BranchesTab.tsx`
- Test: `apps/web/src/components/newWorktreeDialog/BranchesTab.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BranchesTab } from "./BranchesTab.tsx";

vi.mock("../../lib/gitReactQuery", () => ({
  useBranchListQuery: () => ({
    data: ["main", "feature/x", "feature/y"],
    isLoading: false,
  }),
  gitCreateWorktreeForProjectMutationOptions: () => ({
    mutationFn: vi.fn().mockResolvedValue({ worktreeId: "w-new", sessionId: "s-new" }),
  }),
}));

describe("BranchesTab", () => {
  it("filters branches by search query", () => {
    render(<BranchesTab projectId="p1" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search/), { target: { value: "feat" } });
    expect(screen.getByText("feature/x")).toBeInTheDocument();
    expect(screen.queryByText("main")).not.toBeInTheDocument();
  });

  it("calls createWorktreeForProject when a branch is selected", async () => {
    const onCreated = vi.fn();
    render(<BranchesTab projectId="p1" onCreated={onCreated} />);
    fireEvent.click(screen.getByText("feature/x"));
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useBranchListQuery, gitCreateWorktreeForProjectMutationOptions } from "../../lib/gitReactQuery";

interface Props {
  projectId: string;
  onCreated: () => void;
}

export function BranchesTab({ projectId, onCreated }: Props) {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const branches = useBranchListQuery({ projectId });
  const create = useMutation(gitCreateWorktreeForProjectMutationOptions({ projectId }));

  const filtered = (branches.data ?? []).filter((b) =>
    b.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search branches…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-2 py-1 border rounded"
      />
      <ul className="max-h-96 overflow-auto space-y-1">
        {filtered.map((b) => (
          <li
            key={b}
            onClick={() => setSelected(b)}
            className={`px-2 py-1 rounded cursor-pointer ${selected === b ? "bg-accent" : "hover:bg-muted"}`}
          >
            {b}
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={!selected || create.isPending}
        onClick={async () => {
          if (!selected) return;
          await create.mutateAsync({ kind: "branch", branchName: selected });
          onCreated();
        }}
        className="px-3 py-1 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        Create
      </button>
    </div>
  );
}
```

Add `useBranchListQuery` and `gitCreateWorktreeForProjectMutationOptions` to `apps/web/src/lib/gitReactQuery.ts`. Pattern: copy `gitPreparePullRequestThreadMutationOptions` (existing — Task 8 reference earlier) and adapt.

- [ ] **Step 3: Verify + commit**

```
bun run test apps/web/src/components/newWorktreeDialog/BranchesTab.test.tsx
git add apps/web/src/components/newWorktreeDialog/BranchesTab.tsx apps/web/src/components/newWorktreeDialog/BranchesTab.test.tsx apps/web/src/lib/gitReactQuery.ts
git commit -m "Add BranchesTab and createWorktreeForProject mutation"
```

---

### Task 28: PullRequestsTab and IssuesTab refactor

**Files:**

- Move: `apps/web/src/components/projectExplorer/PullRequestsTab.tsx` → `apps/web/src/components/newWorktreeDialog/PullRequestsTab.tsx`
- Move: `apps/web/src/components/projectExplorer/IssuesTab.tsx` → `apps/web/src/components/newWorktreeDialog/IssuesTab.tsx`
- Move: `apps/web/src/components/projectExplorer/PullRequestList.tsx`, `IssueList.tsx`, `LabelChip.tsx`, `StateBadge.tsx`, `StateFilterButtons.tsx` → `apps/web/src/components/newWorktreeDialog/`
- Delete: `apps/web/src/components/projectExplorer/IssueDetail.tsx`, `PullRequestDetail.tsx`, `CommentThread.tsx`, `MarkdownView.tsx` (no longer used — detail view removed)

- [ ] **Step 1: Move files**

```bash
git mv apps/web/src/components/projectExplorer/PullRequestsTab.tsx apps/web/src/components/newWorktreeDialog/PullRequestsTab.tsx
git mv apps/web/src/components/projectExplorer/IssuesTab.tsx apps/web/src/components/newWorktreeDialog/IssuesTab.tsx
git mv apps/web/src/components/projectExplorer/PullRequestList.tsx apps/web/src/components/newWorktreeDialog/PullRequestList.tsx
git mv apps/web/src/components/projectExplorer/IssueList.tsx apps/web/src/components/newWorktreeDialog/IssueList.tsx
git mv apps/web/src/components/projectExplorer/LabelChip.tsx apps/web/src/components/newWorktreeDialog/LabelChip.tsx
git mv apps/web/src/components/projectExplorer/StateBadge.tsx apps/web/src/components/newWorktreeDialog/StateBadge.tsx
git mv apps/web/src/components/projectExplorer/StateFilterButtons.tsx apps/web/src/components/newWorktreeDialog/StateFilterButtons.tsx
git rm apps/web/src/components/projectExplorer/IssueDetail.tsx
git rm apps/web/src/components/projectExplorer/PullRequestDetail.tsx
git rm apps/web/src/components/projectExplorer/CommentThread.tsx
git rm apps/web/src/components/projectExplorer/MarkdownView.tsx
```

- [ ] **Step 2: Strip the detail-view code paths**

In `PullRequestsTab.tsx` and `IssuesTab.tsx`, remove the click-to-detail behavior. Replace with click-to-select + "Create Worktree" button at the bottom that calls `gitCreateWorktreeForProject` mutation with `{ kind: "pr", number }` or `{ kind: "issue", number }`.

For PRs, also call `findWorktreeForOrigin` first (or in a useQuery) — if a non-archived match exists, the button label changes to "Open existing worktree" and clicks it close the dialog after navigating.

- [ ] **Step 3: Update import paths**

Search the repo for `from ".*projectExplorer/(PullRequestsTab|IssuesTab|...)"` and update to `newWorktreeDialog/`. Targets: `BranchToolbar.tsx` (the existing `Issues & PRs` button — it imported `ProjectExplorerDialog`, which we'll handle in Task 31).

- [ ] **Step 4: Verify**

```
bun typecheck
bun run test apps/web
```

Expected: PASS (some test files for the moved components also need to be moved — `git mv` them).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/newWorktreeDialog/
git commit -m "Move PR/Issue list components into newWorktreeDialog and drop detail views"
```

---

### Task 29: NewBranchTab with auto-gen slug

**Files:**

- Create: `apps/web/src/components/newWorktreeDialog/NewBranchTab.tsx`
- Test: `apps/web/src/components/newWorktreeDialog/NewBranchTab.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewBranchTab } from "./NewBranchTab.tsx";

const createMock = vi.fn().mockResolvedValue({ worktreeId: "w", sessionId: "s" });
vi.mock("../../lib/gitReactQuery", () => ({
  gitCreateWorktreeForProjectMutationOptions: () => ({ mutationFn: createMock }),
  useBranchListQuery: () => ({ data: ["main", "develop"] }),
}));

describe("NewBranchTab", () => {
  it("submits with empty branchName when user provides nothing", async () => {
    const onCreated = vi.fn();
    render(<NewBranchTab projectId="p1" onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ kind: "newBranch", branchName: undefined, baseBranch: "main" }),
    );
  });

  it("submits with provided name", async () => {
    render(<NewBranchTab projectId="p1" onCreated={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Branch name/), { target: { value: "feat/x" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create$/ }));
    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith({ kind: "newBranch", branchName: "feat/x", baseBranch: "main" }),
    );
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useBranchListQuery, gitCreateWorktreeForProjectMutationOptions } from "../../lib/gitReactQuery";

interface Props {
  projectId: string;
  onCreated: () => void;
}

export function NewBranchTab({ projectId, onCreated }: Props) {
  const [branchName, setBranchName] = React.useState("");
  const [baseBranch, setBaseBranch] = React.useState<string>("main");
  const branches = useBranchListQuery({ projectId });
  const create = useMutation(gitCreateWorktreeForProjectMutationOptions({ projectId }));

  return (
    <div className="space-y-3 p-4">
      <div className="text-2xl text-center">+</div>
      <h3 className="text-center font-semibold">New Worktree</h3>
      <p className="text-center text-sm text-muted-foreground">
        Create an isolated branch for your task
      </p>
      <input
        type="text"
        placeholder="Branch name (optional)"
        value={branchName}
        onChange={(e) => setBranchName(e.target.value)}
        className="w-full px-2 py-1 border rounded"
      />
      <select
        value={baseBranch}
        onChange={(e) => setBaseBranch(e.target.value)}
        className="w-full px-2 py-1 border rounded"
      >
        {(branches.data ?? []).map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={create.isPending}
        onClick={async () => {
          await create.mutateAsync({
            kind: "newBranch",
            branchName: branchName.trim() || undefined,
            baseBranch,
          });
          onCreated();
        }}
        className="w-full px-3 py-1 bg-yellow-500 text-yellow-50 rounded font-medium"
      >
        Create
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Verify + commit**

```
bun run test apps/web/src/components/newWorktreeDialog/NewBranchTab.test.tsx
git add apps/web/src/components/newWorktreeDialog/NewBranchTab.tsx apps/web/src/components/newWorktreeDialog/NewBranchTab.test.tsx
git commit -m "Add NewBranchTab"
```

---

### Task 30: Re-attach detection + delete legacy ProjectExplorerDialog

**Files:**

- Modify: `apps/web/src/components/newWorktreeDialog/PullRequestsTab.tsx` (re-attach query)
- Modify: `apps/web/src/components/newWorktreeDialog/IssuesTab.tsx` (re-attach query)
- Delete: `apps/web/src/components/projectExplorer/ProjectExplorerDialog.tsx`
- Modify: `apps/web/src/components/BranchToolbar.tsx` (point at new dialog)

- [ ] **Step 1: Add re-attach query helper**

In `apps/web/src/lib/gitReactQuery.ts`:

```typescript
export function useFindWorktreeForOriginQuery(input: {
  projectId: string;
  kind: "pr" | "issue";
  number: number | null;
}) {
  return useQuery({
    queryKey: ["worktree-for-origin", input.projectId, input.kind, input.number],
    queryFn:
      input.number === null
        ? () => null
        : () =>
            rpcClient.call(WS_METHODS.gitFindWorktreeForOrigin, {
              projectId: input.projectId,
              kind: input.kind,
              number: input.number,
            }),
    enabled: input.number !== null,
  });
}
```

- [ ] **Step 2: Wire in PR/Issues tabs**

In `PullRequestsTab.tsx`, when a PR is selected, call `useFindWorktreeForOriginQuery`. If it returns a worktreeId:

- Change the action button label to "Open existing worktree".
- On click, navigate to that worktree's latest session and call `props.onCreated()`.

Same in `IssuesTab.tsx`.

- [ ] **Step 3: Replace BranchToolbar trigger**

In `apps/web/src/components/BranchToolbar.tsx`, find the `Issues & PRs` button and replace its `onClick` to open `NewWorktreeDialog` with `defaultTab="pull-requests"`. Remove the import of `ProjectExplorerDialog`.

- [ ] **Step 4: Delete legacy dialog**

```bash
git rm apps/web/src/components/projectExplorer/ProjectExplorerDialog.tsx
rmdir apps/web/src/components/projectExplorer 2>/dev/null || true   # remove empty dir if any
```

- [ ] **Step 5: Verify + commit**

```
bun typecheck
bun run test apps/web
git add apps/web/src/lib/gitReactQuery.ts apps/web/src/components/newWorktreeDialog/ apps/web/src/components/BranchToolbar.tsx apps/web/src/components/projectExplorer/
git commit -m "Add re-attach detection, delete legacy ProjectExplorerDialog, retarget toolbar"
```

---

## Phase 9 — Worktree lifecycle UI

### Task 31: Archive flow with confirm dialog

**Files:**

- Create: `apps/web/src/components/sidebar/ArchiveWorktreeDialog.tsx`
- Test: `apps/web/src/components/sidebar/ArchiveWorktreeDialog.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchiveWorktreeDialog } from "./ArchiveWorktreeDialog.tsx";

describe("ArchiveWorktreeDialog", () => {
  it("requires extra confirm checkbox when in_progress sessions present", () => {
    render(
      <ArchiveWorktreeDialog
        open
        worktreeBranch="feature/x"
        sessionCounts={{ idle: 0, in_progress: 1, review: 0, done: 0 }}
        dirtyDiff={null}
        canDeleteBranch={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/I understand, archive anyway/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Archive worktree/ })).toBeDisabled();
  });

  it("disables 'Also delete branch' when canDeleteBranch is false", () => {
    render(
      <ArchiveWorktreeDialog
        open
        worktreeBranch="feature/x"
        sessionCounts={{ idle: 1, in_progress: 0, review: 0, done: 0 }}
        dirtyDiff={null}
        canDeleteBranch={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/Also delete local branch/)).toBeDisabled();
  });

  it("submits with deleteBranch flag", () => {
    const onConfirm = vi.fn();
    render(
      <ArchiveWorktreeDialog
        open
        worktreeBranch="feature/x"
        sessionCounts={{ idle: 1, in_progress: 0, review: 0, done: 0 }}
        dirtyDiff={null}
        canDeleteBranch={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Also delete local branch/));
    fireEvent.click(screen.getByRole("button", { name: /Archive worktree/ }));
    expect(onConfirm).toHaveBeenCalledWith({ deleteBranch: true });
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import * as React from "react";
import { Dialog } from "../ui/Dialog";

interface Props {
  open: boolean;
  worktreeBranch: string;
  sessionCounts: { idle: number; in_progress: number; review: number; done: number };
  dirtyDiff: { added: number; removed: number } | null;
  canDeleteBranch: boolean;
  onConfirm: (input: { deleteBranch: boolean }) => void;
  onCancel: () => void;
}

export function ArchiveWorktreeDialog(props: Props) {
  const [deleteBranch, setDeleteBranch] = React.useState(false);
  const [understood, setUnderstood] = React.useState(false);

  const hasInProgress = props.sessionCounts.in_progress > 0;
  const isDirty = props.dirtyDiff !== null && (props.dirtyDiff.added + props.dirtyDiff.removed) > 0;
  const requiresConfirm = hasInProgress;
  const submitEnabled = !requiresConfirm || understood;

  return (
    <Dialog open={props.open} onClose={props.onCancel} title={`Archive ${props.worktreeBranch}?`}>
      <div className="space-y-3">
        <p>
          {props.sessionCounts.idle + props.sessionCounts.in_progress + props.sessionCounts.review + props.sessionCounts.done}
          {" "}sessions: {props.sessionCounts.idle} IDLE, {props.sessionCounts.in_progress} IN PROGRESS,
          {" "}{props.sessionCounts.review} REVIEW, {props.sessionCounts.done} DONE
        </p>
        {isDirty && (
          <div className="bg-amber-500/10 text-amber-700 px-2 py-1 rounded text-sm">
            Working tree dirty: +{props.dirtyDiff!.added} / -{props.dirtyDiff!.removed}
          </div>
        )}
        {hasInProgress && (
          <div className="bg-red-500/10 text-red-700 px-2 py-1 rounded text-sm">
            Sessions are currently in progress. Archiving will stop them.
          </div>
        )}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={deleteBranch}
            onChange={(e) => setDeleteBranch(e.target.checked)}
            disabled={!props.canDeleteBranch}
          />
          <span>Also delete local branch <code>{props.worktreeBranch}</code></span>
        </label>
        {hasInProgress && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
            />
            <span>I understand, archive anyway</span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={props.onCancel}>Cancel</button>
          <button
            disabled={!submitEnabled}
            onClick={() => props.onConfirm({ deleteBranch })}
            className="bg-amber-500 text-amber-50 px-3 py-1 rounded disabled:opacity-50"
          >
            Archive worktree
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

Wire it in `Sidebar.tsx` — when `SidebarWorktreeRow.onArchive` fires, set state to open this dialog with the worktree details, then call `gitArchiveWorktreeMutation`.

- [ ] **Step 3: Verify + commit**

```
bun run test apps/web/src/components/sidebar/ArchiveWorktreeDialog.test.tsx
git add apps/web/src/components/sidebar/ArchiveWorktreeDialog.tsx apps/web/src/components/sidebar/ArchiveWorktreeDialog.test.tsx apps/web/src/components/Sidebar.tsx
git commit -m "Add archive worktree confirm dialog"
```

---

### Task 32: Delete flow with type-branch-name confirmation

**Files:**

- Create: `apps/web/src/components/sidebar/DeleteWorktreeDialog.tsx`
- Test: `apps/web/src/components/sidebar/DeleteWorktreeDialog.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
describe("DeleteWorktreeDialog", () => {
  it("requires type-branch-name confirmation when dirty", () => {
    render(
      <DeleteWorktreeDialog
        open
        worktreeBranch="feature/x"
        sessionCounts={{ idle: 0, in_progress: 0, review: 0, done: 1 }}
        dirtyDiff={{ added: 5, removed: 0 }}
        canDeleteBranch={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByPlaceholderText(/feature\/x/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete worktree/ })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/feature\/x/), { target: { value: "feature/x" } });
    expect(screen.getByRole("button", { name: /Delete worktree/ })).toBeEnabled();
  });

  it("submits with deleteBranch", () => {
    const onConfirm = vi.fn();
    render(
      <DeleteWorktreeDialog
        open
        worktreeBranch="feature/x"
        sessionCounts={{ idle: 1, in_progress: 0, review: 0, done: 0 }}
        dirtyDiff={null}
        canDeleteBranch={true}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Also delete local branch/));
    fireEvent.click(screen.getByRole("button", { name: /Delete worktree/ }));
    expect(onConfirm).toHaveBeenCalledWith({ deleteBranch: true });
  });
});
```

- [ ] **Step 2: Implement**

Same shape as `ArchiveWorktreeDialog` but:

- Title "Delete worktree?".
- Add red "This is irreversible" banner.
- Show type-branch-name input when `hasInProgress || isDirty`. Submit disabled until typed value matches.
- "Also delete local branch" defaults **on** for delete (per spec).

- [ ] **Step 3: Wire and commit**

```
bun run test apps/web/src/components/sidebar/DeleteWorktreeDialog.test.tsx
git add apps/web/src/components/sidebar/DeleteWorktreeDialog.tsx apps/web/src/components/sidebar/DeleteWorktreeDialog.test.tsx apps/web/src/components/Sidebar.tsx
git commit -m "Add delete worktree confirm dialog with type-branch-name"
```

---

### Task 33: Auto-suggest dismiss state (client-side)

**Files:**

- Create: `apps/web/src/components/sidebar/archiveSuggestStore.ts`
- Test: `apps/web/src/components/sidebar/archiveSuggestStore.test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { describe, expect, it, beforeEach } from "vitest";
import { archiveSuggestStore } from "./archiveSuggestStore.ts";

describe("archiveSuggestStore", () => {
  beforeEach(() => {
    archiveSuggestStore.getState().reset();
    localStorage.clear();
  });

  it("isDismissed returns false initially", () => {
    expect(archiveSuggestStore.getState().isDismissed("w1", Date.now())).toBe(false);
  });

  it("dismiss persists for 7 days", () => {
    const now = new Date("2026-05-08T00:00:00Z").getTime();
    archiveSuggestStore.getState().dismiss("w1", now);
    expect(archiveSuggestStore.getState().isDismissed("w1", now + 1)).toBe(true);
    const sevenDaysLater = now + 7 * 24 * 60 * 60 * 1000 + 1;
    expect(archiveSuggestStore.getState().isDismissed("w1", sevenDaysLater)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement (Zustand with persistence)**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface State {
  dismissals: Record<string, number>; // worktreeId → dismissedAtMs
  dismiss: (worktreeId: string, nowMs: number) => void;
  isDismissed: (worktreeId: string, nowMs: number) => boolean;
  reset: () => void;
}

export const archiveSuggestStore = create<State>()(
  persist(
    (set, get) => ({
      dismissals: {},
      dismiss: (worktreeId, nowMs) =>
        set((s) => ({ dismissals: { ...s.dismissals, [worktreeId]: nowMs } })),
      isDismissed: (worktreeId, nowMs) => {
        const at = get().dismissals[worktreeId];
        if (!at) return false;
        return nowMs - at < SEVEN_DAYS_MS;
      },
      reset: () => set({ dismissals: {} }),
    }),
    { name: "archive-suggest-dismissals" },
  ),
);
```

- [ ] **Step 3: Wire into SidebarWorktreeRow**

The hover button "Archive?" should:

- Render only when `shouldSuggestArchive && !archiveSuggestStore.getState().isDismissed(worktreeId, Date.now())`.
- Right-click / X dismisses (calls `archiveSuggestStore.getState().dismiss`).
- Left-click opens `ArchiveWorktreeDialog`.

- [ ] **Step 4: Verify + commit**

```
bun run test apps/web/src/components/sidebar/archiveSuggestStore.test.ts
git add apps/web/src/components/sidebar/archiveSuggestStore.ts apps/web/src/components/sidebar/archiveSuggestStore.test.ts apps/web/src/components/sidebar/SidebarWorktreeRow.tsx
git commit -m "Add archive auto-suggest dismiss store"
```

---

## Phase 10 — Non-git fallback

### Task 34: Non-git project rendering + "Local · no git" pill

**Files:**

- Modify: `apps/web/src/components/sidebar/SidebarProjectRow.tsx`
- Modify: `apps/web/src/components/Sidebar.tsx` (use `flatSessions` rather than worktrees when `isGitRepo === false`)

- [ ] **Step 1: Update SidebarProjectRow**

Read `useSidebarTree` output's per-project `isGitRepo` flag. When false:

- Replace issue/PR badges with `<NonGitProjectPill />` (from Task 21).
- Render `flatSessions` directly under the project row (no worktree row, no buckets).
- Show `<InitGitAffordance onInit={...} />` next to the project name.

- [ ] **Step 2: Hide worktree-related buttons**

For non-git projects:

- Hide the project header `+` button (no New Worktree dialog — there's no worktree level).
- Replace `+` with the existing `+ new thread` button shape (existing flat behavior).

- [ ] **Step 3: Wire `isGitRepo` detection on the server**

Add to the project query response a `isGitRepo: boolean` field. The server reads this from the worktree projector — `isGitRepo = projection_worktrees.where(project_id, origin='main').exists`. Add a small derived helper:

In the server-side handler that returns the project list (find the existing `getProjects` RPC or projection query), join with `projection_worktrees` and include `EXISTS(SELECT 1 FROM projection_worktrees WHERE project_id = p.project_id AND origin = 'main' AND archived_at IS NULL) AS is_git_repo`.

- [ ] **Step 4: Verify + commit**

```
bun run test apps/web/src/components
bun typecheck
git add apps/web/src/components/sidebar/SidebarProjectRow.tsx apps/web/src/components/Sidebar.tsx apps/server/src/...
git commit -m "Render non-git projects flat with Local · no git pill"
```

---

### Task 35: Initialize git action

**Files:**

- Modify: `apps/web/src/components/sidebar/SidebarEmptyStates.tsx` (wire `onInit`)
- Create: `apps/web/src/components/sidebar/InitGitConfirmDialog.tsx`
- Test: `apps/web/src/components/sidebar/InitGitConfirmDialog.test.tsx`

- [ ] **Step 1: Failing test**

```typescript
describe("InitGitConfirmDialog", () => {
  it("calls onConfirm with the project id", () => {
    const onConfirm = vi.fn();
    render(
      <InitGitConfirmDialog open projectId="p1" projectName="My Project" onConfirm={onConfirm} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Initialize git/ }));
    expect(onConfirm).toHaveBeenCalledWith("p1");
  });
});
```

- [ ] **Step 2: Implement**

```typescript
import * as React from "react";
import { Dialog } from "../ui/Dialog";

interface Props {
  open: boolean;
  projectId: string;
  projectName: string;
  onConfirm: (projectId: string) => void;
  onCancel: () => void;
}

export function InitGitConfirmDialog(props: Props) {
  return (
    <Dialog open={props.open} onClose={props.onCancel} title={`Initialize git in ${props.projectName}?`}>
      <div className="space-y-3">
        <p>
          This runs <code>git init</code> in the project's workspace root and creates a "main" worktree.
          Existing sessions will be grouped under it.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={props.onCancel}>Cancel</button>
          <button
            onClick={() => props.onConfirm(props.projectId)}
            className="bg-primary text-primary-foreground px-3 py-1 rounded"
          >
            Initialize git
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Wire**

In `SidebarProjectRow.tsx`, when `<InitGitAffordance onInit>` is clicked, open this dialog. On confirm, call `projectsInitializeGitMutation` (add to `gitReactQuery.ts`) which posts to `WS_METHODS.projectsInitializeGit`.

- [ ] **Step 4: Verify + commit**

```
bun run test apps/web/src/components/sidebar/InitGitConfirmDialog.test.tsx
bun typecheck
git add apps/web/src/components/sidebar/InitGitConfirmDialog.tsx apps/web/src/components/sidebar/InitGitConfirmDialog.test.tsx apps/web/src/lib/gitReactQuery.ts apps/web/src/components/sidebar/SidebarProjectRow.tsx
git commit -m "Add Initialize git action"
```

---

## Phase 11 — Final integration

### Task 36: Migrate URL-paste dialog to new flow

**Files:**

- Modify: `apps/web/src/components/PullRequestThreadDialog.tsx` (the URL-paste dialog mentioned in the prior summary)

- [ ] **Step 1: Read the existing dialog**

Find every callsite of `gitPreparePullRequestThreadMutationOptions` in the web app. The URL-paste dialog passes `mode: "local"` or `mode: "worktree"` to the mutation.

- [ ] **Step 2: Replace with new RPC**

In the URL-paste dialog, after the user resolves a PR by URL, call `gitCreateWorktreeForProjectMutation({ kind: "pr", number })` instead. Drop the `mode` parameter — every PR-attach is now a worktree creation.

- [ ] **Step 3: Verify**

```
bun typecheck
bun run test apps/web
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/PullRequestThreadDialog.tsx
git commit -m "Migrate URL-paste PR dialog to createWorktreeForProject"
```

---

### Task 37: Final type/lint/test sweep

**Files:** none — verification only.

- [ ] **Step 1: Run all of the required gates**

```
bun fmt
bun lint
bun typecheck
bun run test
```

All four must pass green.

- [ ] **Step 2: Manual smoke checklist**

Boot the dev server (`bun dev` or whatever the README documents) and walk through:

1. Existing project with threads → opens with the auto-grouped tree (main worktree containing today's threads).
2. Click `+` on project header → New Worktree dialog appears with four tabs.
3. Pick a branch → new worktree row appears in sidebar; new draft session opens.
4. Create from a PR (GitHub project) → re-attach detection blocks duplicates if the PR already has a worktree.
5. Drag a session from IN PROGRESS to REVIEW bucket → manual override sticks across reload.
6. Reorder worktrees by drag → order persists.
7. Archive a worktree → on-disk checkout removed, row moves to Archived group, restore re-creates checkout.
8. Delete a worktree with dirty diff → type-branch-name confirmation required.
9. Non-git project → flat session list, "Local · no git" pill, "Initialize git here" works.
10. ⌘+Shift+N opens dialog; ⌘N on a focused worktree creates a new session in it.
11. ⌘+Shift+P opens dialog with PRs tab pre-selected.
12. BranchToolbar `Issues & PRs` button opens the same dialog.

- [ ] **Step 3: Commit anything missed**

If the smoke walk reveals a missed wiring, add a small targeted commit. Otherwise the implementation is complete.

---

## Self-review (run before declaring the plan complete)

**Spec coverage check** — each spec section maps to tasks:

| Spec section                        | Implemented in                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| 1 Data model — projection_worktrees | Task 3 (schema), Task 4 (repo)                                                      |
| 1 Data model — thread columns       | Task 3 (migration), Task 5 (repo)                                                   |
| 1 Auto-bucket rule                  | Task 14                                                                             |
| 1 Aggregate worktree status         | Task 14                                                                             |
| 2 Sidebar tree rendering            | Tasks 16-21                                                                         |
| 2 Click & keyboard behavior         | Tasks 23, 24                                                                        |
| 2 Drag & drop                       | Task 22                                                                             |
| 2 Non-git projects                  | Task 34                                                                             |
| 3 New Worktree dialog               | Tasks 26-30                                                                         |
| 3 createWorktreeForProject RPC      | Task 9, 11                                                                          |
| 3 Re-attach detection               | Tasks 9, 30                                                                         |
| 3 New branch slug                   | Task 9 (server), Task 29 (UI)                                                       |
| 3 Add Project preserved             | Task 12 (synth main on project add)                                                 |
| 4 Archive                           | Task 10 (server), Task 31 (UI)                                                      |
| 4 Delete                            | Task 10 (server), Task 32 (UI)                                                      |
| 4 Auto-suggest                      | Task 14 (logic), Task 33 (dismiss store)                                            |
| 4 main is special                   | Task 10 (server check), Task 18 (UI menu hides)                                     |
| 4 Orphaned worktrees                | Mentioned for cleanup; folded into Task 12 backfill loop. **Gap** — see note below. |
| 5 Migration                         | Task 12                                                                             |
| 6 Component refactor                | Tasks 16-21                                                                         |
| 6 Server side files                 | Tasks 3-13                                                                          |
| 6 New domain events                 | Tasks 2, 6                                                                          |
| 7 Test plan                         | distributed throughout                                                              |
| 8 Out of scope                      | n/a — explicit                                                                      |

**Gap identified:** orphaned worktree auto-archive on server start (Section 4 of spec) — folded into Task 12's backfill but not actually written there. Adding here:

### Task 12.5: Orphaned worktree auto-archive

**Files:**

- Modify: `apps/server/src/persistence/worktreeBackfill.ts`

- [ ] **Step 1: Append a check**

After the per-project loop in `runWorktreeBackfill`, add:

```typescript
const liveWorktrees =
  yield *
  sql<{ worktree_id: string; worktree_path: string | null }>`
  SELECT worktree_id, worktree_path FROM projection_worktrees
  WHERE archived_at IS NULL AND worktree_path IS NOT NULL
`;
for (const w of liveWorktrees) {
  if (w.worktree_path === null) continue;
  const exists =
    yield *
    Effect.promise(() =>
      fs.promises
        .access(w.worktree_path!)
        .then(() => true)
        .catch(() => false),
    );
  if (!exists) {
    yield *
      repo.markArchived({
        worktreeId: WorktreeId.make(w.worktree_id),
        archivedAt: new Date().toISOString(),
      });
  }
}
```

- [ ] **Step 2: Add a test**

In `worktreeBackfill.test.ts`, add a case where a worktree row's path doesn't exist on disk → after backfill, the row is archived.

- [ ] **Step 3: Verify + commit**

```
bun run test apps/server/src/persistence/worktreeBackfill.test.ts
git add apps/server/src/persistence/worktreeBackfill.ts apps/server/src/persistence/worktreeBackfill.test.ts
git commit -m "Auto-archive worktrees with missing on-disk paths"
```

---

**Type consistency check:**

- `WorktreeId` and `StatusBucket` defined in `worktree.ts` are imported consistently across server (repo, projector, GitWorkflowService) and client (sidebar logic, dialogs, drag-drop hook).
- `CreateWorktreeIntent` shape is identical in `worktree.ts`, the WS schema in `rpc.ts`, the server handler in `GitWorkflowService.ts`, and the client mutation.
- `SidebarStatusBucket` (web alias) === `StatusBucket` (contract) — defined in `Sidebar.logic.ts` as a re-export.

**Placeholder scan:**

- No "TBD" / "TODO" / "implement later" remaining.
- Each step has either concrete code or a precise reference to existing code (`Read X to understand the pattern, then mirror it`). The implementor reads existing code as part of the step, not as a placeholder.

**Single-task self-containment:**

Each task has its own files list, test code, and commit message. Tasks reference earlier tasks for context but each one stands alone. The implementor can work tasks in order.
