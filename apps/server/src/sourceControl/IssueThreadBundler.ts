import {
  SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES,
  SOURCE_CONTROL_DETAIL_COMMENT_BODY_MAX_BYTES,
  SOURCE_CONTROL_DETAIL_MAX_COMMENTS,
} from "@t3tools/contracts";

export interface IssueThreadCommentInput {
  readonly author: string;
  readonly body: string;
  readonly createdAt: string | { readonly toJSON: () => string };
}

export interface IssueThreadInput {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly comments: ReadonlyArray<IssueThreadCommentInput>;
  readonly url: string;
  readonly author: string;
}

function truncateUtf8(
  value: string,
  maxBytes: number,
): { readonly value: string; readonly cut: boolean } {
  let bytes = 0;
  let output = "";

  for (const char of value) {
    const nextBytes = Buffer.byteLength(char, "utf8");
    if (bytes + nextBytes > maxBytes) {
      return { value: output, cut: true };
    }
    bytes += nextBytes;
    output += char;
  }

  return { value, cut: false };
}

function formatBoundedText(value: string, maxBytes: number): string {
  const result = truncateUtf8(value, maxBytes);
  return result.cut ? `${result.value}\n[truncated]` : result.value;
}

function formatCreatedAt(createdAt: IssueThreadCommentInput["createdAt"]): string {
  return typeof createdAt === "string" ? createdAt : createdAt.toJSON();
}

export function bundleIssueThread(input: IssueThreadInput): string {
  const lines: string[] = [];
  lines.push(`## Issue #${input.number}: ${input.title}`);
  lines.push(`Author: ${input.author}`);
  lines.push(`URL: ${input.url}`);
  lines.push("");
  lines.push("### Body");
  lines.push(formatBoundedText(input.body, SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES));
  lines.push("");

  for (const comment of input.comments.slice(0, SOURCE_CONTROL_DETAIL_MAX_COMMENTS)) {
    lines.push(`### Comment by ${comment.author} at ${formatCreatedAt(comment.createdAt)}`);
    lines.push(formatBoundedText(comment.body, SOURCE_CONTROL_DETAIL_COMMENT_BODY_MAX_BYTES));
    lines.push("");
  }

  if (input.comments.length > SOURCE_CONTROL_DETAIL_MAX_COMMENTS) {
    lines.push(
      `[truncated: showing ${SOURCE_CONTROL_DETAIL_MAX_COMMENTS} of ${input.comments.length} comments]`,
    );
  }

  return lines.join("\n").trimEnd();
}
