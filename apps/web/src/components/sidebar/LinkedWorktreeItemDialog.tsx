import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useState } from "react";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { IssueDetail } from "../projectExplorer/IssueDetail";
import { PullRequestDetail } from "../projectExplorer/PullRequestDetail";

export type LinkedWorktreeItem = { kind: "pr"; number: number } | { kind: "issue"; number: number };

export interface LinkedWorktreeItemDialogProps {
  open: boolean;
  item: LinkedWorktreeItem | null;
  environmentId: EnvironmentId | null;
  cwd: string | null;
  onOpenChange: (open: boolean) => void;
}

export function LinkedWorktreeItemDialog(props: LinkedWorktreeItemDialogProps) {
  const [pivotIssue, setPivotIssue] = useState<number | null>(null);

  const close = useCallback(() => props.onOpenChange(false), [props]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        setPivotIssue(null);
      }
      props.onOpenChange(next);
    },
    [props],
  );

  const handleSelectLinkedIssue = useCallback((issueNumber: number) => {
    setPivotIssue(issueNumber);
  }, []);

  const handleBackFromPivotIssue = useCallback(() => {
    setPivotIssue(null);
  }, []);

  const item = props.item;

  return (
    <Dialog open={props.open} onOpenChange={handleOpenChange}>
      <DialogPopup className="flex h-[80vh] max-h-[800px] w-full max-w-3xl flex-col p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">
          {item?.kind === "pr"
            ? `Pull request #${item.number}`
            : item?.kind === "issue"
              ? `Issue #${item.number}`
              : "Linked item"}
        </DialogTitle>

        {item === null ? null : pivotIssue !== null ? (
          <IssueDetail
            environmentId={props.environmentId}
            cwd={props.cwd}
            issueNumber={pivotIssue}
            onBack={handleBackFromPivotIssue}
          />
        ) : item.kind === "pr" ? (
          <PullRequestDetail
            environmentId={props.environmentId}
            cwd={props.cwd}
            pullRequestNumber={item.number}
            onBack={close}
            onSelectLinkedIssue={handleSelectLinkedIssue}
          />
        ) : (
          <IssueDetail
            environmentId={props.environmentId}
            cwd={props.cwd}
            issueNumber={item.number}
            onBack={close}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}
