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
