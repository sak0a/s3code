import type { EnvironmentId } from "@t3tools/contracts";
import { DateTime, Option } from "effect";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, ExternalLinkIcon, GitBranchIcon, LinkIcon } from "lucide-react";
import { changeRequestDetailQueryOptions } from "~/lib/sourceControlContextRpc";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { CommentThread } from "./CommentThread";
import { LabelChip } from "./LabelChip";
import { MarkdownView } from "./MarkdownView";
import { changeRequestStateKind, StateBadge } from "./StateBadge";

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

interface PullRequestDetailProps {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  pullRequestNumber: number;
  onBack: () => void;
  onSelectLinkedIssue: (issueNumber: number) => void;
  onAttach?: ((mode: "local" | "worktree") => Promise<void> | void) | undefined;
  attachInProgress?: "local" | "worktree" | null;
}

export function PullRequestDetail(props: PullRequestDetailProps) {
  const reference = String(props.pullRequestNumber);
  const detailQuery = useQuery(
    changeRequestDetailQueryOptions({
      environmentId: props.environmentId,
      cwd: props.cwd,
      reference,
      fullContent: true,
    }),
  );

  const detail = detailQuery.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-border/60 border-b px-4 py-2">
        <Button type="button" size="sm" variant="ghost" onClick={props.onBack}>
          <ArrowLeftIcon className="size-3.5" />
          Back
        </Button>
        {detail ? (
          <a
            href={detail.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
          >
            <ExternalLinkIcon className="size-3" />
            View on GitHub
          </a>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {detailQuery.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Spinner className="size-4" />
            Loading pull request…
          </div>
        ) : detailQuery.isError ? (
          <p className="text-destructive text-sm">
            {detailQuery.error instanceof Error ? detailQuery.error.message : "Failed to load."}
          </p>
        ) : detail ? (
          <div className="space-y-5">
            <header className="space-y-2">
              <div className="flex items-start gap-3">
                <h2 className="flex-1 font-heading font-semibold text-xl leading-tight">
                  {detail.title}{" "}
                  <span className="font-normal text-muted-foreground">#{detail.number}</span>
                </h2>
                <StateBadge
                  kind={changeRequestStateKind(detail.state, detail.isDraft)}
                  className="mt-1"
                />
              </div>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                {detail.author ? <span>Opened by {detail.author}</span> : <span>Opened</span>}
                {detail.updatedAt && Option.isSome(detail.updatedAt) ? (
                  <span>updated {dateFmt.format(DateTime.toDate(detail.updatedAt.value))}</span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <GitBranchIcon className="size-3" />
                  <span className="font-mono">
                    {detail.headRefName} → {detail.baseRefName}
                  </span>
                </span>
              </p>
              {detail.labels && detail.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {detail.labels.map((label) => (
                    <LabelChip key={label} label={label} />
                  ))}
                </div>
              ) : null}
            </header>

            <section>
              <MarkdownView text={detail.body} />
            </section>

            {detail.linkedIssueNumbers && detail.linkedIssueNumbers.length > 0 ? (
              <section className="space-y-2">
                <h3 className="flex items-center gap-1 font-medium text-foreground text-sm">
                  <LinkIcon className="size-3.5" />
                  Linked issues
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {detail.linkedIssueNumbers.map((issueNumber) => (
                    <li key={issueNumber}>
                      <button
                        type="button"
                        onClick={() => props.onSelectLinkedIssue(issueNumber)}
                        className="rounded-md border border-border/60 bg-muted/40 px-2 py-1 font-medium text-xs hover:bg-accent/60"
                      >
                        #{issueNumber}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {detail.comments.length > 0 ? (
              <section className="space-y-2">
                <h3 className="font-medium text-foreground text-sm">
                  {detail.comments.length} comment{detail.comments.length === 1 ? "" : "s"}
                </h3>
                <CommentThread comments={detail.comments} />
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {props.onAttach ? (
        <footer className="flex items-center justify-end gap-2 border-border/60 border-t bg-muted/30 px-4 py-3">
          <span className="mr-auto text-muted-foreground text-xs">
            Check out this pull request in a chat thread
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!detail || props.attachInProgress !== null}
            onClick={() => props.onAttach?.("local")}
          >
            {props.attachInProgress === "local" ? "Preparing local…" : "Attach (Local)"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!detail || props.attachInProgress !== null}
            onClick={() => props.onAttach?.("worktree")}
          >
            {props.attachInProgress === "worktree" ? "Preparing worktree…" : "Attach (Worktree)"}
          </Button>
        </footer>
      ) : null}
    </div>
  );
}
