import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DateTime } from "effect";
import type { SourceControlIssueComment } from "@t3tools/contracts";
import { CommentThread } from "./CommentThread";

function comment(
  partial: Partial<SourceControlIssueComment> & { author: string },
): SourceControlIssueComment {
  return {
    body: partial.body ?? "Hello world",
    createdAt: partial.createdAt ?? DateTime.fromDateUnsafe(new Date("2026-03-14T10:00:00Z")),
    author: partial.author,
    ...(partial.authorAssociation !== undefined
      ? { authorAssociation: partial.authorAssociation }
      : {}),
  };
}

describe("CommentThread", () => {
  it("renders an avatar image pointing at the author's GitHub profile", () => {
    const markup = renderToStaticMarkup(
      <CommentThread comments={[comment({ author: "octocat" })]} />,
    );
    expect(markup).toContain('src="https://github.com/octocat.png?size=80"');
  });

  it("falls back to a colored initial bubble when the author is unknown", () => {
    const markup = renderToStaticMarkup(
      <CommentThread comments={[comment({ author: "unknown" })]} />,
    );
    expect(markup).not.toContain("github.com/unknown.png");
    expect(markup).toContain("hsl(");
    expect(markup).toContain(">U<");
  });

  it("renders an author-association badge when present and recognized", () => {
    const markup = renderToStaticMarkup(
      <CommentThread comments={[comment({ author: "alice", authorAssociation: "OWNER" })]} />,
    );
    expect(markup).toContain("Owner");
  });

  it("hides the badge for NONE", () => {
    const markup = renderToStaticMarkup(
      <CommentThread comments={[comment({ author: "alice", authorAssociation: "NONE" })]} />,
    );
    expect(markup).not.toMatch(/>None</);
  });

  it("hides the badge for unknown association values", () => {
    const markup = renderToStaticMarkup(
      <CommentThread comments={[comment({ author: "alice", authorAssociation: "MANNEQUIN" })]} />,
    );
    expect(markup).not.toMatch(/>Mannequin</);
  });
});
