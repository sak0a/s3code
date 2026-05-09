import { memo } from "react";
import {
  CircleDotIcon,
  CheckCircle2Icon,
  GitMergeIcon,
  GitPullRequestIcon,
  GitPullRequestDraftIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "~/lib/utils";

export type StateBadgeKind =
  | "issue-open"
  | "issue-closed"
  | "pr-open"
  | "pr-closed"
  | "pr-merged"
  | "pr-draft";

const variants: Record<StateBadgeKind, { label: string; className: string; Icon: LucideIcon }> = {
  "issue-open": {
    label: "Open",
    className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    Icon: CircleDotIcon,
  },
  "issue-closed": {
    label: "Closed",
    className: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    Icon: CheckCircle2Icon,
  },
  "pr-open": {
    label: "Open",
    className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    Icon: GitPullRequestIcon,
  },
  "pr-closed": {
    label: "Closed",
    className: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
    Icon: XCircleIcon,
  },
  "pr-merged": {
    label: "Merged",
    className: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
    Icon: GitMergeIcon,
  },
  "pr-draft": {
    label: "Draft",
    className: "bg-zinc-500/14 text-zinc-700 dark:text-zinc-300",
    Icon: GitPullRequestDraftIcon,
  },
};

export const StateBadge = memo(function StateBadge(props: {
  kind: StateBadgeKind;
  className?: string;
}) {
  const variant = variants[props.kind];
  const Icon = variant.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs",
        variant.className,
        props.className,
      )}
    >
      <Icon className="size-3" />
      {variant.label}
    </span>
  );
});

export function changeRequestStateKind(
  state: "open" | "closed" | "merged",
  isDraft?: boolean,
): StateBadgeKind {
  if (state === "merged") return "pr-merged";
  if (state === "closed") return "pr-closed";
  return isDraft ? "pr-draft" : "pr-open";
}
