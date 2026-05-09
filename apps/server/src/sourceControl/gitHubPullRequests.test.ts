import { describe, expect, it } from "vitest";
import { Result } from "effect";
import {
  decodeGitHubPullRequestListJson,
  decodeGitHubPullRequestJson,
  decodeGitHubPullRequestDetailJson,
  parseLinkedIssueNumbers,
} from "./gitHubPullRequests.ts";

describe("decodeGitHubPullRequestListJson", () => {
  it("decodes a valid list with state normalization", () => {
    const raw = JSON.stringify([
      {
        number: 42,
        title: "Add feature",
        url: "https://github.com/owner/repo/pull/42",
        baseRefName: "main",
        headRefName: "feature/add",
        state: "OPEN",
        mergedAt: null,
      },
    ]);
    const result = decodeGitHubPullRequestListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success).toHaveLength(1);
    expect(result.success[0]?.number).toBe(42);
    expect(result.success[0]?.state).toBe("open");
  });

  it("skips invalid entries silently", () => {
    const raw = JSON.stringify([
      { number: "not-a-number", title: "bad" },
      {
        number: 7,
        title: "ok",
        url: "https://x/7",
        baseRefName: "main",
        headRefName: "fix/ok",
        state: "CLOSED",
      },
    ]);
    const result = decodeGitHubPullRequestListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.map((p) => p.number)).toEqual([7]);
  });

  it("fails on non-JSON", () => {
    const result = decodeGitHubPullRequestListJson("{not json");
    expect(Result.isFailure(result)).toBe(true);
  });
});

describe("decodeGitHubPullRequestJson", () => {
  it("decodes a single PR", () => {
    const raw = JSON.stringify({
      number: 42,
      title: "My PR",
      url: "https://github.com/owner/repo/pull/42",
      baseRefName: "main",
      headRefName: "feature/my-pr",
      state: "OPEN",
      mergedAt: null,
    });
    const result = decodeGitHubPullRequestJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.number).toBe(42);
    expect(result.success.state).toBe("open");
  });
});

describe("decodeGitHubPullRequestDetailJson", () => {
  it("decodes body and comments", () => {
    const raw = JSON.stringify({
      number: 42,
      title: "My PR",
      url: "https://github.com/owner/repo/pull/42",
      baseRefName: "main",
      headRefName: "feature/my-pr",
      state: "OPEN",
      mergedAt: null,
      body: "PR body text",
      comments: [
        { author: { login: "alice" }, body: "looks good", createdAt: "2026-03-14T10:00:00Z" },
        { author: null, body: "second comment", createdAt: "2026-03-14T11:00:00Z" },
      ],
    });
    const result = decodeGitHubPullRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("PR body text");
    expect(result.success.comments).toHaveLength(2);
    expect(result.success.comments[0]?.author).toBe("alice");
    expect(result.success.comments[1]?.author).toBe("unknown");
  });

  it("handles missing body and comments", () => {
    const raw = JSON.stringify({
      number: 1,
      title: "PR",
      url: "https://x/1",
      baseRefName: "main",
      headRefName: "fix",
      state: "OPEN",
    });
    const result = decodeGitHubPullRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.body).toBe("");
    expect(result.success.comments).toHaveLength(0);
    expect(result.success.linkedIssueNumbers).toEqual([]);
  });

  it("parses linked issue numbers from PR body", () => {
    const raw = JSON.stringify({
      number: 5,
      title: "Multi-link",
      url: "https://x/5",
      baseRefName: "main",
      headRefName: "feature/linked",
      state: "OPEN",
      body: "Closes #12. Also fixes #34, resolves #56.",
    });
    const result = decodeGitHubPullRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.linkedIssueNumbers).toEqual([12, 34, 56]);
  });

  it("preserves authorAssociation when present", () => {
    const raw = JSON.stringify({
      number: 42,
      title: "My PR",
      url: "https://github.com/owner/repo/pull/42",
      baseRefName: "main",
      headRefName: "feature/my-pr",
      state: "OPEN",
      mergedAt: null,
      body: "PR body",
      comments: [
        {
          author: { login: "alice" },
          authorAssociation: "OWNER",
          body: "looks good",
          createdAt: "2026-03-14T10:00:00Z",
        },
        {
          author: { login: "bob" },
          body: "no association",
          createdAt: "2026-03-14T11:00:00Z",
        },
      ],
    });
    const result = decodeGitHubPullRequestDetailJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success.comments[0]?.authorAssociation).toBe("OWNER");
    expect(result.success.comments[1]?.authorAssociation).toBeUndefined();
  });

  it("decodes integer comments count from list output", () => {
    const raw = JSON.stringify([
      {
        number: 9,
        title: "Counted",
        url: "https://x/9",
        baseRefName: "main",
        headRefName: "feature/c",
        state: "OPEN",
        comments: 7,
      },
    ]);
    const result = decodeGitHubPullRequestListJson(raw);
    expect(Result.isSuccess(result)).toBe(true);
    if (!Result.isSuccess(result)) return;
    expect(result.success[0]?.commentsCount).toBe(7);
  });
});

describe("parseLinkedIssueNumbers", () => {
  it("matches all close/fix/resolve verb forms", () => {
    expect(parseLinkedIssueNumbers("Closes #1, fixed #2, resolve #3")).toEqual([1, 2, 3]);
  });

  it("dedupes repeated numbers", () => {
    expect(parseLinkedIssueNumbers("Fixes #5 and closes #5")).toEqual([5]);
  });

  it("ignores unrelated # references", () => {
    expect(parseLinkedIssueNumbers("See #7 for context. Closes #8.")).toEqual([8]);
  });

  it("returns empty for empty body", () => {
    expect(parseLinkedIssueNumbers("")).toEqual([]);
  });
});
