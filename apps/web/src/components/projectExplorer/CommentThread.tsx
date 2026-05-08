import type { SourceControlIssueComment } from "@t3tools/contracts";
import { DateTime } from "effect";
import { memo } from "react";
import { MarkdownView } from "./MarkdownView";

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatCommentDate(value: SourceControlIssueComment["createdAt"]): string {
  return dateTimeFmt.format(DateTime.toDate(value));
}

function avatarInitials(author: string): string {
  const trimmed = author.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export const CommentThread = memo(function CommentThread(props: {
  comments: ReadonlyArray<SourceControlIssueComment>;
}) {
  if (props.comments.length === 0) {
    return null;
  }
  return (
    <ol className="space-y-4">
      {props.comments.map((comment, index) => (
        <li
          key={`${comment.author}-${index}`}
          className="rounded-xl border border-border/60 bg-muted/24 p-3"
        >
          <header className="mb-2 flex items-center gap-2">
            <span
              className="inline-flex size-6 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
              aria-hidden
            >
              {avatarInitials(comment.author)}
            </span>
            <span className="font-medium text-sm">{comment.author}</span>
            <span className="text-muted-foreground text-xs">
              {formatCommentDate(comment.createdAt)}
            </span>
          </header>
          <MarkdownView text={comment.body} />
        </li>
      ))}
    </ol>
  );
});
