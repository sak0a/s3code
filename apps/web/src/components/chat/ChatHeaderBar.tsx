import { CircleDotIcon, GitPullRequestIcon } from "lucide-react";
import { memo } from "react";
import { cn } from "~/lib/utils";
import { ChatHeaderBreadcrumb } from "./ChatHeaderBreadcrumb";
import type { WorktreeOriginLike } from "./ChatSessionTabs.logic";

export interface ChatHeaderBarProps {
  projectName: string | null | undefined;
  isGitRepo: boolean;
  worktreeBranch: string | null | undefined;
  worktreeTitle: string | null | undefined;
  worktreeOrigin: WorktreeOriginLike;
  sessionTitle: string;
  issueCount?: number | undefined;
  pullRequestCount?: number | undefined;
  onSelectProject?: (() => void) | undefined;
  onSelectWorktree?: (() => void) | undefined;
  inlineActions?: React.ReactNode;
}

export const ChatHeaderBar = memo(function ChatHeaderBar(props: ChatHeaderBarProps) {
  return (
    <div className="@container/header-actions flex min-w-0 flex-1 items-center gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
        <ChatHeaderBreadcrumb
          projectName={props.projectName}
          worktreeBranch={props.worktreeBranch}
          worktreeTitle={props.worktreeTitle}
          worktreeOrigin={props.worktreeOrigin}
          sessionTitle={props.sessionTitle}
          {...(props.onSelectProject ? { onSelectProject: props.onSelectProject } : {})}
          {...(props.onSelectWorktree ? { onSelectWorktree: props.onSelectWorktree } : {})}
        />
        <SourceControlCounts
          issueCount={props.issueCount}
          pullRequestCount={props.pullRequestCount}
        />
        {props.projectName && !props.isGitRepo ? (
          <span className="shrink-0 rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
            No Git
          </span>
        ) : null}
      </div>
      {props.inlineActions ? (
        <div className="flex shrink-0 items-center justify-end gap-2 @3xl/header-actions:gap-3">
          {props.inlineActions}
        </div>
      ) : null}
    </div>
  );
});

function SourceControlCounts(props: {
  issueCount?: number | undefined;
  pullRequestCount?: number | undefined;
}) {
  const issues = props.issueCount ?? 0;
  const prs = props.pullRequestCount ?? 0;
  if (issues === 0 && prs === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {issues > 0 ? (
        <CountBadge
          icon={<CircleDotIcon className="size-2.5" />}
          count={issues}
          label={issues === 1 ? "1 open issue" : `${issues} open issues`}
          tone="issues"
        />
      ) : null}
      {prs > 0 ? (
        <CountBadge
          icon={<GitPullRequestIcon className="size-2.5" />}
          count={prs}
          label={prs === 1 ? "1 open pull request" : `${prs} open pull requests`}
          tone="pullRequests"
        />
      ) : null}
    </span>
  );
}

function CountBadge(props: {
  icon: React.ReactNode;
  count: number;
  label: string;
  tone: "issues" | "pullRequests";
}) {
  const tone =
    props.tone === "issues"
      ? "border-emerald-500/16 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
      : "border-blue-500/16 bg-blue-500/10 text-blue-500 dark:text-blue-400";
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center gap-0.5 rounded-sm border px-1 text-[9px] font-semibold tabular-nums leading-none",
        tone,
      )}
      aria-label={props.label}
      title={props.label}
    >
      {props.icon}
      <span>{props.count}</span>
    </span>
  );
}
