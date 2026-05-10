import {
  type EnvironmentId,
  type EditorId,
  type ProjectScript,
  type ResolvedKeybindingsConfig,
  type ThreadId,
} from "@s3tools/contracts";
import { scopeThreadRef } from "@s3tools/client-runtime";
import { memo, useMemo } from "react";
import GitActionsControl from "../GitActionsControl";
import { type DraftId } from "~/composerDraftStore";
import { DiffIcon, FileTextIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import ProjectScriptsControl, { type NewProjectScriptInput } from "../ProjectScriptsControl";
import { Toggle } from "../ui/toggle";
import { SidebarTrigger } from "../ui/sidebar";
import { OpenInPicker } from "./OpenInPicker";
import { usePrimaryEnvironmentId } from "../../environments/primary";
import { ChatHeaderBar } from "./ChatHeaderBar";
import { ChatSessionTabs, type ChatSessionTabsItem } from "./ChatSessionTabs";
import type { WorktreeOriginLike } from "./ChatSessionTabs.logic";
import { usePerfMark, useDevPropDiff } from "../../perf/tabSwitchInstrumentation";

interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  draftId?: DraftId;
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  isGitRepo: boolean;
  openInCwd: string | null;
  activeProjectScripts: ProjectScript[] | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  previewAvailable: boolean;
  diffOpen: boolean;
  previewOpen: boolean;
  // New, optional props for the breadcrumb / tab strip. When omitted the
  // header still renders correctly with degraded info (no worktree segment,
  // no tab strip, no source-control counts).
  worktreeBranch?: string | null;
  worktreeTitle?: string | null;
  worktreeOrigin?: WorktreeOriginLike;
  sessionTabs?: ReadonlyArray<ChatSessionTabsItem>;
  activeSessionTabKey?: string | null;
  issueCount?: number;
  pullRequestCount?: number;
  onSelectSessionTab?: (key: string) => void;
  onPrefetchTabEnter?: (key: string) => void;
  onPrefetchTabLeave?: (key: string) => void;
  onNewSessionInWorktree?: () => void;
  onSelectProject?: () => void;
  onSelectWorktree?: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onToggleDiff: () => void;
  onTogglePreview: () => void;
}

export function shouldShowOpenInPicker(input: {
  readonly activeProjectName: string | undefined;
  readonly activeThreadEnvironmentId: EnvironmentId;
  readonly primaryEnvironmentId: EnvironmentId | null;
}): boolean {
  return (
    Boolean(input.activeProjectName) &&
    input.primaryEnvironmentId !== null &&
    input.activeThreadEnvironmentId === input.primaryEnvironmentId
  );
}

export const ChatHeader = memo(function ChatHeader(props: ChatHeaderProps) {
  usePerfMark("ChatHeader");
  useDevPropDiff(props as unknown as Record<string, unknown>, "ChatHeader");
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const showOpenInPicker = shouldShowOpenInPicker({
    activeProjectName: props.activeProjectName,
    activeThreadEnvironmentId: props.activeThreadEnvironmentId,
    primaryEnvironmentId,
  });

  const activeThreadRef = useMemo(
    () => scopeThreadRef(props.activeThreadEnvironmentId, props.activeThreadId),
    [props.activeThreadEnvironmentId, props.activeThreadId],
  );
  const inlineActions = (
    <>
      {props.activeProjectName ? (
        <GitActionsControl
          gitCwd={props.gitCwd}
          activeThreadRef={activeThreadRef}
          {...(props.draftId ? { draftId: props.draftId } : {})}
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0"
              pressed={props.previewOpen}
              onPressedChange={props.onTogglePreview}
              aria-label="Toggle file preview panel"
              variant="outline"
              size="xs"
              disabled={!props.previewAvailable}
            >
              <FileTextIcon className="size-3" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {!props.previewAvailable
            ? "File preview is unavailable until this thread has an active project."
            : "Toggle file preview panel"}
        </TooltipPopup>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className="shrink-0"
              pressed={props.diffOpen}
              onPressedChange={props.onToggleDiff}
              aria-label="Toggle diff panel"
              variant="outline"
              size="xs"
              disabled={!props.isGitRepo && !props.diffOpen}
            >
              <DiffIcon className="size-3" />
            </Toggle>
          }
        />
        <TooltipPopup side="bottom">
          {!props.isGitRepo && !props.diffOpen
            ? "Diff panel is unavailable because this project is not a git repository."
            : props.diffToggleShortcutLabel
              ? `Toggle diff panel (${props.diffToggleShortcutLabel})`
              : "Toggle diff panel"}
        </TooltipPopup>
      </Tooltip>
      {props.activeProjectScripts ? (
        <ProjectScriptsControl
          scripts={props.activeProjectScripts}
          keybindings={props.keybindings}
          preferredScriptId={props.preferredScriptId}
          onRunScript={props.onRunProjectScript}
          onAddScript={props.onAddProjectScript}
          onUpdateScript={props.onUpdateProjectScript}
          onDeleteScript={props.onDeleteProjectScript}
        />
      ) : null}
      {showOpenInPicker ? (
        <OpenInPicker
          keybindings={props.keybindings}
          availableEditors={props.availableEditors}
          openInCwd={props.openInCwd}
        />
      ) : null}
    </>
  );

  const tabs = props.sessionTabs ?? [];
  const showTabs = tabs.length > 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 items-center gap-2 pt-4 pb-2.5">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <ChatHeaderBar
          projectName={props.activeProjectName}
          isGitRepo={props.isGitRepo}
          worktreeBranch={props.worktreeBranch}
          worktreeTitle={props.worktreeTitle}
          worktreeOrigin={props.worktreeOrigin}
          sessionTitle={props.activeThreadTitle}
          {...(typeof props.issueCount === "number" ? { issueCount: props.issueCount } : {})}
          {...(typeof props.pullRequestCount === "number"
            ? { pullRequestCount: props.pullRequestCount }
            : {})}
          {...(props.onSelectProject ? { onSelectProject: props.onSelectProject } : {})}
          {...(props.onSelectWorktree ? { onSelectWorktree: props.onSelectWorktree } : {})}
          inlineActions={inlineActions}
        />
      </div>
      {showTabs && props.onSelectSessionTab ? (
        <ChatSessionTabs
          items={tabs}
          activeKey={props.activeSessionTabKey ?? null}
          onSelect={props.onSelectSessionTab}
          {...(props.onPrefetchTabEnter ? { onPrefetchEnter: props.onPrefetchTabEnter } : {})}
          {...(props.onPrefetchTabLeave ? { onPrefetchLeave: props.onPrefetchTabLeave } : {})}
          {...(props.onNewSessionInWorktree ? { onNew: props.onNewSessionInWorktree } : {})}
        />
      ) : null}
    </div>
  );
});
