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
