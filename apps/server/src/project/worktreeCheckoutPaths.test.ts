import { describe, expect, it } from "vitest";

import {
  buildWorktreeCheckoutDirectoryName,
  resolveProjectWorktreeCheckoutPath,
} from "./worktreeCheckoutPaths.ts";

describe("worktree checkout paths", () => {
  it("builds checkout directory names from branch and a short word", () => {
    expect(buildWorktreeCheckoutDirectoryName("feature/My PR Branch", "pearl")).toBe(
      "feature-my-pr-branch__pearl",
    );
  });

  it("limits the random word segment to five letters", () => {
    expect(buildWorktreeCheckoutDirectoryName("task/demo", "silver")).toBe("task-demo__silve");
  });

  it("resolves worktrees under the project metadata worktrees directory", () => {
    expect(resolveProjectWorktreeCheckoutPath("/repo", ".s3code", "bug/fix")).toMatch(
      /^\/repo\/\.s3code\/worktrees\/bug-fix__[a-z]{5}$/,
    );
  });
});
