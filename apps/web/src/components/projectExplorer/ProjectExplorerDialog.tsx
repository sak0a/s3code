import type {
  ChangeRequest,
  EnvironmentId,
  ProjectId,
  SourceControlIssueSummary,
  ThreadId,
} from "@s3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { gitPreparePullRequestThreadMutationOptions } from "~/lib/gitReactQuery";
import { ContextPickerTabs } from "../chat/ContextPickerTabs";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { IssueDetail } from "./IssueDetail";
import { IssuesTab } from "./IssuesTab";
import { PullRequestDetail } from "./PullRequestDetail";
import { PullRequestsTab } from "./PullRequestsTab";
import type { ChangeRequestStateFilter, IssueStateFilter } from "./StateFilterButtons";

type TabId = "issues" | "prs";

type Selection = { kind: "issue"; number: number } | { kind: "pr"; number: number } | null;

interface ProjectExplorerDialogProps {
  open: boolean;
  environmentId: EnvironmentId | null;
  projectId?: ProjectId | null;
  threadId: ThreadId | null;
  cwd: string | null;
  onOpenChange: (open: boolean) => void;
  onPullRequestPrepared?: (input: {
    branch: string;
    worktreePath: string | null;
  }) => Promise<void> | void;
}

export function ProjectExplorerDialog(props: ProjectExplorerDialogProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("issues");
  const [issueQuery, setIssueQuery] = useState("");
  const [prQuery, setPrQuery] = useState("");
  const [issueStateFilter, setIssueStateFilter] = useState<IssueStateFilter>("open");
  const [prStateFilter, setPrStateFilter] = useState<ChangeRequestStateFilter>("open");
  const [selection, setSelection] = useState<Selection>(null);
  const [attachInProgress, setAttachInProgress] = useState<"local" | "worktree" | null>(null);
  const issueInputRef = useRef<HTMLInputElement>(null);
  const prInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) {
      setSelection(null);
      setAttachInProgress(null);
    }
  }, [props.open]);

  useEffect(() => {
    if (!props.open || selection !== null) return;
    const frame = window.requestAnimationFrame(() => {
      const target = activeTab === "issues" ? issueInputRef.current : prInputRef.current;
      target?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.open, activeTab, selection]);

  const preparePullRequestThreadMutation = useMutation(
    gitPreparePullRequestThreadMutationOptions({
      environmentId: props.environmentId,
      cwd: props.cwd,
      projectId: props.projectId ?? null,
      queryClient,
    }),
  );

  const handleAttachPullRequest = useCallback(
    async (mode: "local" | "worktree") => {
      if (selection?.kind !== "pr" || !props.cwd || !props.environmentId) {
        return;
      }
      setAttachInProgress(mode);
      try {
        const result = await preparePullRequestThreadMutation.mutateAsync({
          reference: String(selection.number),
          mode,
          ...(mode === "worktree" && props.threadId ? { threadId: props.threadId } : {}),
        });
        if (props.onPullRequestPrepared) {
          await props.onPullRequestPrepared({
            branch: result.branch,
            worktreePath: result.worktreePath,
          });
        }
        props.onOpenChange(false);
      } catch {
        // Error surfaces via the mutation's `error` field; nothing to do here.
      } finally {
        setAttachInProgress(null);
      }
    },
    [preparePullRequestThreadMutation, props, selection],
  );

  const handleSelectIssue = useCallback((issue: SourceControlIssueSummary) => {
    setSelection({ kind: "issue", number: issue.number });
  }, []);

  const handleSelectChangeRequest = useCallback((cr: ChangeRequest) => {
    setSelection({ kind: "pr", number: cr.number });
  }, []);

  const handleSelectLinkedIssue = useCallback((issueNumber: number) => {
    setActiveTab("issues");
    setSelection({ kind: "issue", number: issueNumber });
  }, []);

  const handleBack = useCallback(() => setSelection(null), []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "1") {
        event.preventDefault();
        setActiveTab("issues");
        setSelection(null);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "2") {
        event.preventDefault();
        setActiveTab("prs");
        setSelection(null);
        return;
      }
      if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        const target = activeTab === "issues" ? issueInputRef.current : prInputRef.current;
        target?.focus();
      }
    },
    [activeTab],
  );

  const tabs = useMemo(
    () => [
      { id: "issues" as const, label: "Issues" },
      { id: "prs" as const, label: "Pull requests" },
    ],
    [],
  );

  const errorMessage =
    preparePullRequestThreadMutation.error instanceof Error
      ? preparePullRequestThreadMutation.error.message
      : preparePullRequestThreadMutation.error
        ? "Failed to prepare pull request thread."
        : null;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup
        className="flex h-[80vh] max-h-[800px] w-full max-w-3xl flex-col p-0 sm:max-w-3xl"
        onKeyDown={handleKeyDown}
      >
        <header className="flex items-center justify-between border-border/60 border-b px-5 py-3">
          <DialogTitle className="text-base">Project explorer</DialogTitle>
          <span className="text-muted-foreground text-xs">
            ⌘1 issues · ⌘2 PRs · / focus search · Esc close
          </span>
        </header>

        {selection === null ? (
          <>
            <ContextPickerTabs
              tabs={tabs}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as TabId)}
            />
            <div className="min-h-0 flex-1">
              {activeTab === "issues" ? (
                <IssuesTab
                  environmentId={props.environmentId}
                  cwd={props.cwd}
                  searchInputRef={issueInputRef}
                  query={issueQuery}
                  onQueryChange={setIssueQuery}
                  stateFilter={issueStateFilter}
                  onStateFilterChange={setIssueStateFilter}
                  onSelect={handleSelectIssue}
                />
              ) : (
                <PullRequestsTab
                  environmentId={props.environmentId}
                  cwd={props.cwd}
                  searchInputRef={prInputRef}
                  query={prQuery}
                  onQueryChange={setPrQuery}
                  stateFilter={prStateFilter}
                  onStateFilterChange={setPrStateFilter}
                  onSelect={handleSelectChangeRequest}
                />
              )}
            </div>
          </>
        ) : selection.kind === "issue" ? (
          <IssueDetail
            environmentId={props.environmentId}
            cwd={props.cwd}
            issueNumber={selection.number}
            onBack={handleBack}
          />
        ) : (
          <PullRequestDetail
            environmentId={props.environmentId}
            cwd={props.cwd}
            pullRequestNumber={selection.number}
            onBack={handleBack}
            onSelectLinkedIssue={handleSelectLinkedIssue}
            onAttach={props.onPullRequestPrepared ? handleAttachPullRequest : undefined}
            attachInProgress={attachInProgress}
          />
        )}

        {errorMessage ? (
          <p className="border-border/60 border-t bg-destructive/10 px-5 py-2 text-destructive text-xs">
            {errorMessage}
          </p>
        ) : null}
      </DialogPopup>
    </Dialog>
  );
}
