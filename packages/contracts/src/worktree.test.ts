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
