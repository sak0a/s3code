import type {
  ComposerSourceControlContext,
  SourceControlIssueComment,
  SourceControlIssueDetail,
  SourceControlChangeRequestDetail,
} from "@ryco/contracts";

function formatComment(comment: SourceControlIssueComment): string {
  const ts =
    typeof comment.createdAt === "object" &&
    comment.createdAt !== null &&
    "toJSON" in comment.createdAt
      ? (comment.createdAt as { toJSON(): string }).toJSON()
      : String(comment.createdAt);
  return `- ${comment.author} (${ts}): ${comment.body}`;
}

function formatIssueSection(detail: SourceControlIssueDetail): string {
  const lines: string[] = [];
  lines.push(`### Issue #${detail.number}: ${detail.title}`);
  lines.push(`URL: ${detail.url}`);
  lines.push(`State: ${detail.state}`);
  if (detail.author) lines.push(`Author: ${detail.author}`);
  if (detail.labels && detail.labels.length > 0) {
    lines.push(`Labels: ${detail.labels.join(", ")}`);
  }
  lines.push("");
  lines.push(detail.body);
  if (detail.comments.length > 0) {
    lines.push("");
    lines.push("Recent comments:");
    for (const comment of detail.comments) {
      lines.push(formatComment(comment));
    }
  }
  if (detail.truncated) {
    lines.push("");
    lines.push("> Note: this context was truncated by the server.");
  }
  return lines.join("\n");
}

function formatChangeRequestSection(detail: SourceControlChangeRequestDetail): string {
  const lines: string[] = [];
  lines.push(`### Change Request #${detail.number}: ${detail.title}`);
  lines.push(`URL: ${detail.url}`);
  lines.push(`State: ${detail.state}`);
  lines.push(`Base: ${detail.baseRefName}`);
  lines.push(`Head: ${detail.headRefName}`);
  lines.push("");
  lines.push(detail.body);
  if (detail.comments.length > 0) {
    lines.push("");
    lines.push("Recent comments:");
    for (const comment of detail.comments) {
      lines.push(formatComment(comment));
    }
  }
  if (detail.truncated) {
    lines.push("");
    lines.push("> Note: this context was truncated by the server.");
  }
  return lines.join("\n");
}

export function formatSourceControlContextsForAgent(
  contexts: ReadonlyArray<ComposerSourceControlContext>,
): string {
  if (contexts.length === 0) return "";

  const sections = contexts.map((ctx) => {
    if (ctx.kind === "issue") {
      return formatIssueSection(ctx.detail as SourceControlIssueDetail);
    }
    return formatChangeRequestSection(ctx.detail as SourceControlChangeRequestDetail);
  });

  return `## Attached source-control context\n\n${sections.join("\n\n")}`;
}
