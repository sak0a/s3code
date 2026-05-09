import type { SourceControlIssueComment } from "@t3tools/contracts";
import { DateTime } from "effect";
import { memo, useState } from "react";
import { cn } from "../../lib/utils";
import { authorAssociationLabel, avatarUrlForAuthor, hashAuthorToHue } from "./CommentThread.logic";
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

function CommentAvatar({ author }: { author: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const url = avatarUrlForAuthor(author);
  const hue = hashAuthorToHue(author);
  const initials = avatarInitials(author);

  if (!url || imageFailed) {
    return (
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        style={{ backgroundColor: `hsl(${hue} 60% 40%)` }}
        aria-hidden
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      onError={() => setImageFailed(true)}
      className="inline-flex size-7 shrink-0 rounded-full bg-muted/40 object-cover"
      aria-hidden
    />
  );
}

function AuthorAssociationBadge({ association }: { association: string | undefined }) {
  const label = authorAssociationLabel(association);
  if (label === null) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center rounded-full border border-border/60 bg-muted px-1.5 text-[10px] font-medium text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export const CommentThread = memo(function CommentThread(props: {
  comments: ReadonlyArray<SourceControlIssueComment>;
}) {
  if (props.comments.length === 0) {
    return null;
  }
  return (
    <ol className="space-y-4">
      {props.comments.map((comment, index) => {
        const isoDate = DateTime.toDate(comment.createdAt).toISOString();
        return (
          <li
            key={`${comment.author}-${index}`}
            className="rounded-xl border border-border/60 bg-muted/24 p-3"
          >
            <header className="mb-2 flex items-center gap-2">
              <CommentAvatar author={comment.author} />
              <span className="font-medium text-sm">{comment.author}</span>
              <AuthorAssociationBadge association={comment.authorAssociation} />
              <time dateTime={isoDate} className="text-muted-foreground text-xs" title={isoDate}>
                {formatCommentDate(comment.createdAt)}
              </time>
            </header>
            <MarkdownView text={comment.body} />
          </li>
        );
      })}
    </ol>
  );
});
