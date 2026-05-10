import {
  ArchiveIcon,
  ArrowUpDownIcon,
  ChevronRightIcon,
  CloudIcon,
  CircleDotIcon,
  CopyIcon,
  Edit3Icon,
  ExternalLinkIcon,
  FolderPlusIcon,
  FolderOpenIcon,
  GitPullRequestIcon,
  ImageIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import {
  ChangeRequestStatusIcon,
  prStatusIndicator,
  resolveThreadPr,
  terminalStatusFromRunningIds,
  ThreadStatusLabel,
} from "./ThreadStatusIndicators";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  AzureDevOpsIcon,
  BitbucketIcon,
  GitHubIcon,
  GitIcon,
  GitLabIcon,
  type Icon,
} from "./Icons";
import { autoAnimate } from "@formkit/auto-animate";
import React, { useCallback, useEffect, memo, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  DndContext,
  type DragCancelEvent,
  type CollisionDetection,
  PointerSensor,
  type DragStartEvent,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  type SortableContextProps,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { restrictToFirstScrollableAncestor, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import {
  type ContextMenuItem,
  type DesktopUpdateState,
  PROJECT_CUSTOM_SYSTEM_PROMPT_MAX_CHARS,
  ProjectId,
  type RepositoryIdentity,
  type ScopedThreadRef,
  type SidebarProjectGroupingMode,
  type ThreadEnvMode,
  ThreadId,
  WorktreeId,
} from "@s3tools/contracts";
import {
  parseScopedThreadKey,
  scopedProjectKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@s3tools/client-runtime";
import { Link, useLocation, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useQueries } from "@tanstack/react-query";
import {
  type SidebarProjectSortOrder,
  type SidebarThreadSortOrder,
} from "@s3tools/contracts/settings";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { isElectron } from "../env";
import { APP_STAGE_LABEL, APP_VERSION } from "../branding";
import { isTerminalFocused } from "../lib/terminalFocus";
import { cn, isMacPlatform, newCommandId } from "../lib/utils";
import {
  selectProjectByRef,
  selectProjectsAcrossEnvironments,
  selectSidebarThreadsForProjectRefs,
  selectSidebarThreadsAcrossEnvironments,
  selectSidebarWorktreesAcrossEnvironments,
  selectSidebarWorktreesForProjectRefs,
  selectThreadByRef,
  useStore,
} from "../store";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useUiStateStore } from "../uiStateStore";
import {
  resolveShortcutCommand,
  shortcutLabelForCommand,
  shouldShowThreadJumpHintsForModifiers,
  threadJumpCommandForIndex,
  threadJumpIndexFromCommand,
  threadTraversalDirectionFromCommand,
} from "../keybindings";
import { useModelPickerOpen } from "../modelPickerOpenState";
import { useShortcutModifierState } from "../shortcutModifierState";
import { useGitStatus } from "../lib/gitStatusState";
import { readLocalApi } from "../localApi";
import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { useNewThreadHandler } from "../hooks/useHandleNewThread";
import { retainThreadDetailSubscription } from "../environments/runtime/service";

import { useThreadActions } from "../hooks/useThreadActions";
import {
  buildThreadRouteParams,
  resolveThreadRouteRef,
  resolveThreadRouteTarget,
} from "../threadRoutes";
import { stackedThreadToast, toastManager } from "./ui/toast";
import { formatRelativeTimeLabel } from "../timestampFormat";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import { Kbd } from "./ui/kbd";
import {
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateInstallConfirmationMessage,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  shouldShowArm64IntelBuildWarning,
  shouldToastDesktopUpdateActionResult,
} from "./desktopUpdate.logic";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "./ui/alert";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import {
  Menu,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { useCommandPaletteStore } from "../commandPaletteStore";
import {
  getSidebarThreadIdsToPrewarm,
  canArchiveSidebarThread,
  resolveAdjacentThreadId,
  isContextMenuPointerDown,
  resolveProjectStatusIndicator,
  resolveSidebarNewThreadSeedContext,
  resolveSidebarNewThreadEnvMode,
  resolveThreadRowClassName,
  resolveThreadStatusPill,
  orderItemsByPreferredIds,
  shouldClearThreadSelectionOnMouseDown,
  shouldConfirmCloseSidebarThread,
  sortProjectsForSidebar,
  useThreadJumpHintVisibility,
  ThreadStatusPill,
} from "./Sidebar.logic";
import { sortThreads } from "../lib/threadSort";
import { SidebarUpdatePill } from "./sidebar/SidebarUpdatePill";
import { SidebarWorktreeList } from "./sidebar/SidebarWorktreeList";
import {
  adaptDraftThreadsForSidebarProject,
  adaptProjectForSidebarTree,
} from "./sidebar/sidebarTreeAdapters";
import {
  composeSidebarTree,
  useSidebarTree,
  type SidebarTreeThread,
  type SidebarTreeWorktree,
} from "./sidebar/hooks/useSidebarTree";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { openInPreferredEditor } from "../editorPreferences";
import { CommandDialogTrigger } from "./ui/command";
import { readEnvironmentApi } from "../environmentApi";
import { useSettings, useUpdateSettings } from "~/hooks/useSettings";
import { NewWorktreeDialog, type NewWorktreeDialogTab } from "./worktrees/NewWorktreeDialog";
import {
  changeRequestListQueryOptions,
  issueListQueryOptions,
} from "~/lib/sourceControlContextRpc";
import { useServerKeybindings } from "../rpc/serverState";
import {
  derivePhysicalProjectKey,
  deriveProjectGroupingOverrideKey,
  getProjectOrderKey,
} from "../logicalProject";
import {
  useSavedEnvironmentRegistryStore,
  useSavedEnvironmentRuntimeStore,
} from "../environments/runtime";
import type { SidebarThreadSummary, SidebarWorktreeSummary } from "../types";
import {
  buildPhysicalToLogicalProjectKeyMap,
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../sidebarProjectGrouping";
const THREAD_PREVIEW_LIMIT = 6;
const SIDEBAR_SORT_LABELS: Record<SidebarProjectSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
  manual: "Manual",
};
const SIDEBAR_THREAD_SORT_LABELS: Record<SidebarThreadSortOrder, string> = {
  updated_at: "Last user message",
  created_at: "Created at",
};
const SIDEBAR_LIST_ANIMATION_OPTIONS = {
  duration: 180,
  easing: "ease-out",
} as const;
const EMPTY_THREAD_JUMP_LABELS = new Map<string, string>();
const PROJECT_GROUPING_MODE_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository path",
  separate: "Keep separate",
};
const SortableContextComponent = SortableContext as React.ComponentType<SortableContextProps>;

function formatProjectMemberActionLabel(
  member: SidebarProjectGroupMember,
  groupedProjectCount: number,
): string {
  if (groupedProjectCount <= 1) {
    return member.name;
  }

  return member.environmentLabel ? `${member.environmentLabel} — ${member.cwd}` : member.cwd;
}

function projectGroupingModeDescription(mode: SidebarProjectGroupingMode): string {
  switch (mode) {
    case "repository":
      return "Projects from the same repository share one sidebar row.";
    case "repository_path":
      return "Projects group only when both the repository and repo-relative path match.";
    case "separate":
      return "Every project path gets its own sidebar row.";
  }
}

function buildThreadJumpLabelMap(input: {
  keybindings: ReturnType<typeof useServerKeybindings>;
  platform: string;
  terminalOpen: boolean;
  threadJumpCommandByKey: ReadonlyMap<
    string,
    NonNullable<ReturnType<typeof threadJumpCommandForIndex>>
  >;
}): ReadonlyMap<string, string> {
  if (input.threadJumpCommandByKey.size === 0) {
    return EMPTY_THREAD_JUMP_LABELS;
  }

  const shortcutLabelOptions = {
    platform: input.platform,
    context: {
      terminalFocus: false,
      terminalOpen: input.terminalOpen,
    },
  } as const;
  const mapping = new Map<string, string>();
  for (const [threadKey, command] of input.threadJumpCommandByKey) {
    const label = shortcutLabelForCommand(input.keybindings, command, shortcutLabelOptions);
    if (label) {
      mapping.set(threadKey, label);
    }
  }
  return mapping.size > 0 ? mapping : EMPTY_THREAD_JUMP_LABELS;
}

interface SidebarThreadRowProps {
  thread: SidebarThreadSummary & { draftId?: DraftId | undefined };
  projectCwd: string | null;
  orderedProjectThreadKeys: readonly string[];
  isActive: boolean;
  isTreeChild?: boolean | undefined;
  jumpLabel: string | null;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  navigateToDraft: (draftId: DraftId, threadRef: ScopedThreadRef) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  closeThread: (
    thread: SidebarThreadSummary & { draftId?: DraftId | undefined },
    opts?: { deletedThreadKeys?: ReadonlySet<string> },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (event: React.MouseEvent<HTMLElement>, prUrl: string) => void;
}

const SidebarThreadRow = memo(function SidebarThreadRow(props: SidebarThreadRowProps) {
  const {
    orderedProjectThreadKeys,
    isActive,
    jumpLabel,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    handleThreadClick,
    navigateToThread,
    navigateToDraft,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    closeThread,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    thread,
  } = props;
  const threadRef = scopeThreadRef(thread.environmentId, thread.id);
  const threadKey = scopedThreadKey(threadRef);
  const draftId = thread.draftId ?? null;
  const lastVisitedAt = useUiStateStore((state) => state.threadLastVisitedAtById[threadKey]);
  const isSelected = useThreadSelectionStore((state) => state.selectedThreadKeys.has(threadKey));
  const hasSelection = useThreadSelectionStore((state) => state.selectedThreadKeys.size > 0);
  const runningTerminalIds = useTerminalStateStore(
    (state) =>
      selectThreadTerminalState(state.terminalStateByThreadKey, threadRef).runningTerminalIds,
  );
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const isRemoteThread =
    primaryEnvironmentId !== null && thread.environmentId !== primaryEnvironmentId;
  const remoteEnvLabel = useSavedEnvironmentRuntimeStore(
    (s) => s.byId[thread.environmentId]?.descriptor?.label ?? null,
  );
  const remoteEnvSavedLabel = useSavedEnvironmentRegistryStore(
    (s) => s.byId[thread.environmentId]?.label ?? null,
  );
  const threadEnvironmentLabel = isRemoteThread
    ? (remoteEnvLabel ?? remoteEnvSavedLabel ?? "Remote")
    : null;
  // For grouped projects, the thread may belong to a different environment
  // than the representative project.  Look up the thread's own project cwd
  // so git status (and thus PR detection) queries the correct path.
  const threadProjectCwd = useStore(
    useMemo(
      () => (state: import("../store").AppState) =>
        selectProjectByRef(state, scopeProjectRef(thread.environmentId, thread.projectId))?.cwd ??
        null,
      [thread.environmentId, thread.projectId],
    ),
  );
  const gitCwd = thread.worktreePath ?? threadProjectCwd ?? props.projectCwd;
  const gitStatus = useGitStatus({
    environmentId: thread.environmentId,
    cwd: thread.branch != null ? gitCwd : null,
  });
  const isHighlighted = isActive || isSelected;
  const isThreadRunning =
    thread.session?.status === "running" && thread.session.activeTurnId != null;
  const threadStatus = resolveThreadStatusPill({
    thread: {
      ...thread,
      lastVisitedAt,
    },
  });
  const pr = resolveThreadPr(thread.branch, gitStatus.data);
  const prStatus = prStatusIndicator(pr, gitStatus.data?.sourceControlProvider);
  const terminalStatus = terminalStatusFromRunningIds(runningTerminalIds);
  const isConfirmingArchive = confirmingArchiveThreadKey === threadKey && !isThreadRunning;
  const canArchiveThread = !draftId && canArchiveSidebarThread(thread);
  const canCloseThread = props.isTreeChild && !isThreadRunning;
  const threadMetaClassName = isConfirmingArchive
    ? "pointer-events-none opacity-0"
    : !isThreadRunning
      ? "pointer-events-none transition-opacity duration-150 max-sm:pr-10 group-hover/menu-sub-item:opacity-0 group-focus-within/menu-sub-item:opacity-0"
      : "pointer-events-none";
  const clearConfirmingArchive = useCallback(() => {
    setConfirmingArchiveThreadKey((current) => (current === threadKey ? null : current));
  }, [setConfirmingArchiveThreadKey, threadKey]);
  const handleMouseLeave = useCallback(() => {
    clearConfirmingArchive();
  }, [clearConfirmingArchive]);
  const handleBlurCapture = useCallback(
    (event: React.FocusEvent<HTMLLIElement>) => {
      const currentTarget = event.currentTarget;
      requestAnimationFrame(() => {
        if (currentTarget.contains(document.activeElement)) {
          return;
        }
        clearConfirmingArchive();
      });
    },
    [clearConfirmingArchive],
  );
  const handleRowClick = useCallback(
    (event: React.MouseEvent) => {
      if (draftId) {
        const isMac = isMacPlatform(navigator.platform);
        if ((isMac ? event.metaKey : event.ctrlKey) || event.shiftKey) {
          event.preventDefault();
          return;
        }
        navigateToDraft(draftId, threadRef);
        return;
      }
      handleThreadClick(event, threadRef, orderedProjectThreadKeys);
    },
    [draftId, handleThreadClick, navigateToDraft, orderedProjectThreadKeys, threadRef],
  );
  const handleRowKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (draftId) {
        navigateToDraft(draftId, threadRef);
        return;
      }
      navigateToThread(threadRef);
    },
    [draftId, navigateToDraft, navigateToThread, threadRef],
  );
  const handleRowContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      if (draftId) {
        if (hasSelection) {
          clearSelection();
        }
        return;
      }
      if (hasSelection && isSelected) {
        void handleMultiSelectContextMenu({
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }

      if (hasSelection) {
        clearSelection();
      }
      void handleThreadContextMenu(threadRef, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [
      clearSelection,
      handleMultiSelectContextMenu,
      handleThreadContextMenu,
      draftId,
      hasSelection,
      isSelected,
      threadRef,
    ],
  );
  const handlePrClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (!prStatus) return;
      openPrLink(event, prStatus.url);
    },
    [openPrLink, prStatus],
  );
  const handleRenameInputRef = useCallback(
    (element: HTMLInputElement | null) => {
      if (element && renamingInputRef.current !== element) {
        renamingInputRef.current = element;
        element.focus();
        element.select();
      }
    },
    [renamingInputRef],
  );
  const handleRenameInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRenamingTitle(event.target.value);
    },
    [setRenamingTitle],
  );
  const handleRenameInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        void commitRename(threadRef, renamingTitle, thread.title);
      } else if (event.key === "Escape") {
        event.preventDefault();
        renamingCommittedRef.current = true;
        cancelRename();
      }
    },
    [cancelRename, commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef],
  );
  const handleRenameInputBlur = useCallback(() => {
    if (!renamingCommittedRef.current) {
      void commitRename(threadRef, renamingTitle, thread.title);
    }
  }, [commitRename, renamingCommittedRef, renamingTitle, thread.title, threadRef]);
  const handleRenameInputClick = useCallback((event: React.MouseEvent<HTMLInputElement>) => {
    event.stopPropagation();
  }, []);
  const handleConfirmArchiveRef = useCallback(
    (element: HTMLButtonElement | null) => {
      if (element) {
        confirmArchiveButtonRefs.current.set(threadKey, element);
      } else {
        confirmArchiveButtonRefs.current.delete(threadKey);
      }
    },
    [confirmArchiveButtonRefs, threadKey],
  );
  const stopPropagationOnPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    [],
  );
  const handleConfirmArchiveClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      clearConfirmingArchive();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, clearConfirmingArchive, threadRef],
  );
  const handleStartArchiveConfirmation = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setConfirmingArchiveThreadKey(threadKey);
      requestAnimationFrame(() => {
        confirmArchiveButtonRefs.current.get(threadKey)?.focus();
      });
    },
    [confirmArchiveButtonRefs, setConfirmingArchiveThreadKey, threadKey],
  );
  const handleArchiveImmediateClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void attemptArchiveThread(threadRef);
    },
    [attemptArchiveThread, threadRef],
  );
  const handleCloseClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void closeThread(thread);
    },
    [closeThread, thread],
  );
  const rowButtonRender = useMemo(() => <div role="button" tabIndex={0} />, []);

  return (
    <SidebarMenuSubItem
      className={cn(
        "w-full",
        props.isTreeChild &&
          "pl-5 before:absolute before:top-0 before:bottom-0 before:left-2 before:w-px before:bg-sidebar-border/70 after:absolute after:left-2 after:top-1/2 after:h-px after:w-3 after:bg-sidebar-border/70",
      )}
      data-thread-item
      onMouseLeave={handleMouseLeave}
      onBlurCapture={handleBlurCapture}
    >
      <SidebarMenuSubButton
        render={rowButtonRender}
        size="sm"
        isActive={isActive}
        data-testid={`thread-row-${thread.id}`}
        className={`${resolveThreadRowClassName({
          isActive,
          isSelected,
        })} relative isolate`}
        onClick={handleRowClick}
        onKeyDown={handleRowKeyDown}
        onContextMenu={handleRowContextMenu}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
          {prStatus && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={prStatus.tooltip}
                    className={`inline-flex items-center justify-center ${prStatus.colorClass} cursor-pointer rounded-sm outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                    onClick={handlePrClick}
                  >
                    <ChangeRequestStatusIcon className="size-3" />
                  </button>
                }
              />
              <TooltipPopup side="top">{prStatus.tooltip}</TooltipPopup>
            </Tooltip>
          )}
          {threadStatus && <ThreadStatusLabel status={threadStatus} />}
          {renamingThreadKey === threadKey ? (
            <input
              ref={handleRenameInputRef}
              className="min-w-0 flex-1 truncate text-base sm:text-xs bg-transparent outline-none border border-ring rounded px-0.5"
              value={renamingTitle}
              onChange={handleRenameInputChange}
              onKeyDown={handleRenameInputKeyDown}
              onBlur={handleRenameInputBlur}
              onClick={handleRenameInputClick}
            />
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    data-testid={`thread-title-${thread.id}`}
                  >
                    {thread.title}
                  </span>
                }
              />
              <TooltipPopup side="top" className="max-w-80 whitespace-normal leading-tight">
                {thread.title}
              </TooltipPopup>
            </Tooltip>
          )}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {terminalStatus && (
            <span
              role="img"
              aria-label={terminalStatus.label}
              title={terminalStatus.label}
              className={`inline-flex items-center justify-center ${terminalStatus.colorClass}`}
            >
              <TerminalIcon className={`size-3 ${terminalStatus.pulse ? "animate-pulse" : ""}`} />
            </span>
          )}
          <div
            className={`flex min-w-12 justify-end ${
              isRemoteThread ? "max-sm:min-w-24" : "max-sm:min-w-20"
            }`}
          >
            {isConfirmingArchive ? (
              <button
                ref={handleConfirmArchiveRef}
                type="button"
                data-thread-selection-safe
                data-testid={`thread-archive-confirm-${thread.id}`}
                aria-label={`Confirm archive ${thread.title}`}
                className="absolute top-1/2 right-1 inline-flex h-5 -translate-y-1/2 cursor-pointer items-center rounded-full bg-destructive/12 px-2 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/18 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-destructive/40"
                onPointerDown={stopPropagationOnPointerDown}
                onClick={handleConfirmArchiveClick}
              >
                Confirm
              </button>
            ) : canCloseThread || (canArchiveThread && !isThreadRunning) ? (
              <div className="pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100">
                {canCloseThread ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          data-thread-selection-safe
                          data-testid={`thread-close-${thread.id}`}
                          aria-label={`Close ${thread.title}`}
                          className="inline-flex size-5 cursor-pointer items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          onPointerDown={stopPropagationOnPointerDown}
                          onClick={handleCloseClick}
                        >
                          <XIcon className="size-3.5" />
                        </button>
                      }
                    />
                    <TooltipPopup side="top">Close</TooltipPopup>
                  </Tooltip>
                ) : null}
                {canArchiveThread && !isThreadRunning && appSettingsConfirmThreadArchive ? (
                  <button
                    type="button"
                    data-thread-selection-safe
                    data-testid={`thread-archive-${thread.id}`}
                    aria-label={`Archive ${thread.title}`}
                    className="inline-flex size-5 cursor-pointer items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    onPointerDown={stopPropagationOnPointerDown}
                    onClick={handleStartArchiveConfirmation}
                  >
                    <ArchiveIcon className="size-3.5" />
                  </button>
                ) : null}
                {canArchiveThread && !isThreadRunning && !appSettingsConfirmThreadArchive ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          data-thread-selection-safe
                          data-testid={`thread-archive-${thread.id}`}
                          aria-label={`Archive ${thread.title}`}
                          className="inline-flex size-5 cursor-pointer items-center justify-center text-muted-foreground/60 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          onPointerDown={stopPropagationOnPointerDown}
                          onClick={handleArchiveImmediateClick}
                        >
                          <ArchiveIcon className="size-3.5" />
                        </button>
                      }
                    />
                    <TooltipPopup side="top">Archive</TooltipPopup>
                  </Tooltip>
                ) : null}
              </div>
            ) : null}
            <span className={threadMetaClassName}>
              <span className="inline-flex items-center gap-1">
                {isRemoteThread && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          aria-label={threadEnvironmentLabel ?? "Remote"}
                          className="inline-flex h-5 items-center justify-center"
                        />
                      }
                    >
                      <CloudIcon className="block size-3 text-muted-foreground/60" />
                    </TooltipTrigger>
                    <TooltipPopup side="top">{threadEnvironmentLabel}</TooltipPopup>
                  </Tooltip>
                )}
                {jumpLabel ? (
                  <span
                    className="inline-flex h-5 items-center rounded-full border border-border/80 bg-background/90 px-1.5 font-mono text-[10px] font-medium tracking-tight text-foreground shadow-sm"
                    title={jumpLabel}
                  >
                    {jumpLabel}
                  </span>
                ) : (
                  <span
                    className={`text-[10px] ${
                      isHighlighted
                        ? "text-foreground/72 dark:text-foreground/82"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    {formatRelativeTimeLabel(
                      thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
                    )}
                  </span>
                )}
              </span>
            </span>
          </div>
        </div>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
});

interface SidebarProjectThreadListProps {
  projectKey: string;
  projectExpanded: boolean;
  hasOverflowingThreads: boolean;
  hiddenThreadStatus: ThreadStatusPill | null;
  orderedProjectThreadKeys: readonly string[];
  renderedThreads: readonly SidebarThreadSummary[];
  showEmptyThreadState: boolean;
  shouldShowThreadPanel: boolean;
  isThreadListExpanded: boolean;
  projectCwd: string;
  activeRouteThreadKey: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  appSettingsConfirmThreadArchive: boolean;
  renamingThreadKey: string | null;
  renamingTitle: string;
  setRenamingTitle: (title: string) => void;
  renamingInputRef: React.RefObject<HTMLInputElement | null>;
  renamingCommittedRef: React.RefObject<boolean>;
  confirmingArchiveThreadKey: string | null;
  setConfirmingArchiveThreadKey: React.Dispatch<React.SetStateAction<string | null>>;
  confirmArchiveButtonRefs: React.RefObject<Map<string, HTMLButtonElement>>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  handleThreadClick: (
    event: React.MouseEvent,
    threadRef: ScopedThreadRef,
    orderedProjectThreadKeys: readonly string[],
  ) => void;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  navigateToDraft: (draftId: DraftId, threadRef: ScopedThreadRef) => void;
  handleMultiSelectContextMenu: (position: { x: number; y: number }) => Promise<void>;
  handleThreadContextMenu: (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => Promise<void>;
  closeThread: (
    thread: SidebarThreadSummary & { draftId?: DraftId | undefined },
    opts?: { deletedThreadKeys?: ReadonlySet<string> },
  ) => Promise<void>;
  clearSelection: () => void;
  commitRename: (
    threadRef: ScopedThreadRef,
    newTitle: string,
    originalTitle: string,
  ) => Promise<void>;
  cancelRename: () => void;
  attemptArchiveThread: (threadRef: ScopedThreadRef) => Promise<void>;
  openPrLink: (event: React.MouseEvent<HTMLElement>, prUrl: string) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
}

const SidebarProjectThreadList = memo(function SidebarProjectThreadList(
  props: SidebarProjectThreadListProps,
) {
  const {
    projectKey,
    projectExpanded,
    hasOverflowingThreads,
    hiddenThreadStatus,
    orderedProjectThreadKeys,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
    isThreadListExpanded,
    projectCwd,
    activeRouteThreadKey,
    threadJumpLabelByKey,
    appSettingsConfirmThreadArchive,
    renamingThreadKey,
    renamingTitle,
    setRenamingTitle,
    renamingInputRef,
    renamingCommittedRef,
    confirmingArchiveThreadKey,
    setConfirmingArchiveThreadKey,
    confirmArchiveButtonRefs,
    attachThreadListAutoAnimateRef,
    handleThreadClick,
    navigateToThread,
    navigateToDraft,
    handleMultiSelectContextMenu,
    handleThreadContextMenu,
    closeThread,
    clearSelection,
    commitRename,
    cancelRename,
    attemptArchiveThread,
    openPrLink,
    expandThreadListForProject,
    collapseThreadListForProject,
  } = props;
  const showMoreButtonRender = useMemo(() => <button type="button" />, []);
  const showLessButtonRender = useMemo(() => <button type="button" />, []);

  return (
    <SidebarMenuSub
      ref={attachThreadListAutoAnimateRef}
      className="mx-1 my-0 w-full translate-x-0 gap-0.5 overflow-hidden px-1.5 py-0"
    >
      {shouldShowThreadPanel && showEmptyThreadState ? (
        <SidebarMenuSubItem className="w-full" data-thread-selection-safe>
          <div
            data-thread-selection-safe
            className="flex h-6 w-full translate-x-0 items-center px-2 text-left text-[10px] text-muted-foreground/60"
          >
            <span>No threads yet</span>
          </div>
        </SidebarMenuSubItem>
      ) : null}
      {shouldShowThreadPanel &&
        renderedThreads.map((thread) => {
          const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
          return (
            <SidebarThreadRow
              key={threadKey}
              thread={thread}
              projectCwd={projectCwd}
              orderedProjectThreadKeys={orderedProjectThreadKeys}
              isActive={activeRouteThreadKey === threadKey}
              jumpLabel={threadJumpLabelByKey.get(threadKey) ?? null}
              appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
              renamingThreadKey={renamingThreadKey}
              renamingTitle={renamingTitle}
              setRenamingTitle={setRenamingTitle}
              renamingInputRef={renamingInputRef}
              renamingCommittedRef={renamingCommittedRef}
              confirmingArchiveThreadKey={confirmingArchiveThreadKey}
              setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
              confirmArchiveButtonRefs={confirmArchiveButtonRefs}
              handleThreadClick={handleThreadClick}
              navigateToThread={navigateToThread}
              navigateToDraft={navigateToDraft}
              handleMultiSelectContextMenu={handleMultiSelectContextMenu}
              handleThreadContextMenu={handleThreadContextMenu}
              closeThread={closeThread}
              clearSelection={clearSelection}
              commitRename={commitRename}
              cancelRename={cancelRename}
              attemptArchiveThread={attemptArchiveThread}
              openPrLink={openPrLink}
            />
          );
        })}

      {projectExpanded && hasOverflowingThreads && !isThreadListExpanded && (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={showMoreButtonRender}
            data-thread-selection-safe
            size="sm"
            className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
            onClick={() => {
              expandThreadListForProject(projectKey);
            }}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {hiddenThreadStatus && <ThreadStatusLabel status={hiddenThreadStatus} compact />}
              <span>Show more</span>
            </span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
      {projectExpanded && hasOverflowingThreads && isThreadListExpanded && (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={showLessButtonRender}
            data-thread-selection-safe
            size="sm"
            className="h-6 w-full translate-x-0 justify-start px-2 text-left text-[10px] text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground/80"
            onClick={() => {
              collapseThreadListForProject(projectKey);
            }}
          >
            <span>Show less</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      )}
    </SidebarMenuSub>
  );
});

interface SidebarProjectItemProps {
  project: SidebarProjectSnapshot;
  isThreadListExpanded: boolean;
  activeRouteThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  handleNewThread: ReturnType<typeof useNewThreadHandler>["handleNewThread"];
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  isManualProjectSorting: boolean;
  dragHandleProps: SortableProjectHandleProps | null;
}

function ProjectSourceControlBadges(props: { issueCount: number; pullRequestCount: number }) {
  if (props.issueCount === 0 && props.pullRequestCount === 0) {
    return null;
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {props.issueCount > 0 ? (
        <ProjectSourceControlBadge
          count={props.issueCount}
          label="Open issues"
          tone="issues"
          icon={<CircleDotIcon className="size-2.5" />}
        />
      ) : null}
      {props.pullRequestCount > 0 ? (
        <ProjectSourceControlBadge
          count={props.pullRequestCount}
          label="Open pull requests"
          tone="pullRequests"
          icon={<GitPullRequestIcon className="size-2.5" />}
        />
      ) : null}
    </span>
  );
}

function ProjectSourceControlBadge(props: {
  count: number;
  icon: React.ReactNode;
  label: string;
  tone: "issues" | "pullRequests";
}) {
  const className =
    props.tone === "issues"
      ? "border-emerald-500/16 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400"
      : "border-blue-500/16 bg-blue-500/10 text-blue-500 dark:text-blue-400";

  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center justify-center gap-0.5 rounded-sm border px-1 text-[9px] font-semibold tabular-nums leading-none",
        className,
      )}
      title={`${props.label}: ${props.count}`}
      aria-label={`${props.label}: ${props.count}`}
    >
      {props.icon}
      <span>{formatCompactSourceControlCount(props.count)}</span>
    </span>
  );
}

function formatCompactSourceControlCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function sumSourceControlQueryCounts(
  queries: ReadonlyArray<{ readonly data?: ReadonlyArray<unknown> | undefined }>,
): number {
  return queries.reduce((total, query) => total + (query.data?.length ?? 0), 0);
}

interface ProjectRemoteLink {
  readonly label: string;
  readonly provider: string | undefined;
  readonly providerLabel: string;
  readonly url: string;
}

function formatRepositoryProviderLabel(provider: string | undefined): string {
  switch (provider) {
    case "github":
      return "GitHub";
    case "gitlab":
      return "GitLab";
    case "azure-devops":
      return "Azure DevOps";
    case "bitbucket":
      return "Bitbucket";
    default:
      return "Remote";
  }
}

function resolveRepositoryProviderIcon(provider: string | undefined): Icon {
  switch (provider) {
    case "github":
      return GitHubIcon;
    case "gitlab":
      return GitLabIcon;
    case "azure-devops":
      return AzureDevOpsIcon;
    case "bitbucket":
      return BitbucketIcon;
    default:
      return GitIcon;
  }
}

function ProjectRemoteProviderMark(props: { readonly provider: string | undefined }) {
  const ProviderIcon = resolveRepositoryProviderIcon(props.provider);
  return (
    <span className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-foreground shadow-xs">
      <ProviderIcon className="size-5" aria-hidden />
    </span>
  );
}

function stripGitSuffix(path: string): string {
  return path.replace(/\/+$/g, "").replace(/\.git$/i, "");
}

function resolveRemoteUrlToBrowserUrl(remoteUrl: string): string | null {
  const trimmed = remoteUrl.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      url.pathname = stripGitSuffix(url.pathname);
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  if (/^(?:ssh|git):\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const repositoryPath = stripGitSuffix(url.pathname)
        .split("/")
        .filter((segment) => segment.length > 0)
        .join("/");
      return url.hostname && repositoryPath ? `https://${url.hostname}/${repositoryPath}` : null;
    } catch {
      return null;
    }
  }

  const scpStyleRemote = /^git@([^:/\s]+)[:/]([^#?\s]+)$/i.exec(trimmed);
  if (scpStyleRemote?.[1] && scpStyleRemote[2]) {
    return `https://${scpStyleRemote[1]}/${stripGitSuffix(scpStyleRemote[2])}`;
  }

  return null;
}

function resolveProjectRemoteLink(
  repositoryIdentity: RepositoryIdentity | null | undefined,
): ProjectRemoteLink | null {
  const remoteUrl = repositoryIdentity?.locator.remoteUrl;
  if (!remoteUrl) {
    return null;
  }
  const url = resolveRemoteUrlToBrowserUrl(remoteUrl);
  if (!url) {
    return null;
  }
  return {
    url,
    label: repositoryIdentity.displayName ?? repositoryIdentity.canonicalKey,
    provider: repositoryIdentity.provider,
    providerLabel: formatRepositoryProviderLabel(repositoryIdentity.provider),
  };
}

function ProjectSettingsMenu(props: {
  project: SidebarProjectSnapshot;
  onCopyPath: (member: SidebarProjectGroupMember) => void;
  onGrouping: (member: SidebarProjectGroupMember) => void;
  onOpenRemote: (member: SidebarProjectGroupMember) => void;
  onRemove: (member: SidebarProjectGroupMember) => void;
  onRename: (member: SidebarProjectGroupMember) => void;
  onSettings: (member: SidebarProjectGroupMember) => void;
}) {
  const renderActions = (member: SidebarProjectGroupMember) => {
    const remoteLink = resolveProjectRemoteLink(member.repositoryIdentity);
    const RemoteIcon = resolveRepositoryProviderIcon(remoteLink?.provider);
    return (
      <>
        <MenuItem onClick={() => props.onSettings(member)} className="min-h-7 py-1 sm:text-xs">
          <SettingsIcon className="size-3.5" />
          Project settings
        </MenuItem>
        {remoteLink ? (
          <MenuItem onClick={() => props.onOpenRemote(member)} className="min-h-7 py-1 sm:text-xs">
            <RemoteIcon className="size-3.5" />
            Open remote
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuItem onClick={() => props.onRename(member)} className="min-h-7 py-1 sm:text-xs">
          <Edit3Icon className="size-3.5" />
          Rename project
        </MenuItem>
        <MenuItem onClick={() => props.onGrouping(member)} className="min-h-7 py-1 sm:text-xs">
          <SettingsIcon className="size-3.5" />
          Project grouping...
        </MenuItem>
        <MenuItem onClick={() => props.onCopyPath(member)} className="min-h-7 py-1 sm:text-xs">
          <CopyIcon className="size-3.5" />
          Copy Project Path
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onClick={() => props.onRemove(member)}
          variant="destructive"
          className="min-h-7 py-1 sm:text-xs"
        >
          <Trash2Icon className="size-3.5" />
          Remove project
        </MenuItem>
      </>
    );
  };

  if (props.project.memberProjects.length === 1) {
    return <MenuGroup>{renderActions(props.project.memberProjects[0]!)}</MenuGroup>;
  }

  return (
    <>
      {props.project.memberProjects.map((member, index) => (
        <MenuGroup key={member.physicalProjectKey}>
          <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {formatProjectMemberActionLabel(member, props.project.groupedProjectCount)}
          </div>
          {renderActions(member)}
          {index < props.project.memberProjects.length - 1 ? <MenuSeparator /> : null}
        </MenuGroup>
      ))}
    </>
  );
}

function ProjectSettingsDialog(props: {
  onClose: () => void;
  onCopyPath: (path: string) => void;
  onPickWorkspaceRoot: () => void;
  onOpenRemote: (member: SidebarProjectGroupMember) => void;
  onSave: () => void;
  open: boolean;
  saving: boolean;
  target: SidebarProjectGroupMember | null;
  title: string;
  customSystemPrompt: string;
  workspaceRoot: string;
  worktrees: readonly SidebarWorktreeSummary[];
  onCustomSystemPromptChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  onWorkspaceRootChange: (value: string) => void;
}) {
  const target = props.target;
  const visibleWorktrees = props.worktrees.slice(0, 5);
  const archivedWorktreeCount = props.worktrees.filter((worktree) => worktree.archivedAt).length;
  const activeWorktreeCount = props.worktrees.length - archivedWorktreeCount;
  const remoteLink = resolveProjectRemoteLink(target?.repositoryIdentity);

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose();
        }
      }}
    >
      <DialogPopup className="max-w-5xl">
        <DialogHeader className="border-border/70 border-b px-6 py-5">
          <div className="flex min-w-0 items-start gap-4">
            <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-secondary text-muted-foreground shadow-xs">
              <ImageIcon className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate text-base">Project settings</DialogTitle>
              <DialogDescription className="mt-1 truncate">
                {target?.environmentLabel
                  ? `${target.environmentLabel} · ${target.cwd}`
                  : target?.cwd}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogPanel className="px-6 py-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
            <section className="space-y-4">
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">Display name</span>
                <Input
                  aria-label="Project display name"
                  value={props.title}
                  onChange={(event) => props.onTitleChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      props.onSave();
                    }
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">Active project root</span>
                <div className="flex min-w-0 gap-2">
                  <Input
                    aria-label="Active project root"
                    value={props.workspaceRoot}
                    onChange={(event) => props.onWorkspaceRootChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        props.onSave();
                      }
                    }}
                  />
                  <Button variant="outline" onClick={props.onPickWorkspaceRoot}>
                    <FolderOpenIcon className="size-4" />
                    Browse
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-foreground">Custom system prompt</span>
                <Textarea
                  aria-label="Custom system prompt"
                  value={props.customSystemPrompt}
                  maxLength={PROJECT_CUSTOM_SYSTEM_PROMPT_MAX_CHARS}
                  placeholder="Always use TypeScript."
                  className="min-h-28 resize-y"
                  onChange={(event) => props.onCustomSystemPromptChange(event.target.value)}
                />
              </div>
            </section>
            <aside className="space-y-4">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-background text-muted-foreground">
                    <ImageIcon className="size-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground">Project image</div>
                    <div className="mt-1 truncate text-[11px] text-muted-foreground">
                      Default project image
                    </div>
                  </div>
                </div>
              </div>
              {target && remoteLink ? (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ProjectRemoteProviderMark provider={remoteLink.provider} />
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-foreground">
                          <span className="truncate">{remoteLink.providerLabel} repository</span>
                        </div>
                        <div className="mt-1 truncate text-[11px] text-muted-foreground">
                          {remoteLink.label}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="xs"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => props.onOpenRemote(target)}
                    >
                      <ExternalLinkIcon className="size-3.5" />
                      Open
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="rounded-lg border border-border/70 bg-muted/20">
                <div className="flex items-center justify-between gap-3 border-border/70 border-b px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-xs font-medium text-foreground">
                      Worktree location
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {activeWorktreeCount} active
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  <ProjectPathRow
                    label="Base workspace"
                    path={target?.cwd ?? ""}
                    onCopy={props.onCopyPath}
                  />
                  {visibleWorktrees.map((worktree) => (
                    <ProjectPathRow
                      key={`${worktree.environmentId}:${worktree.id}`}
                      label={worktree.title?.trim() || worktree.branch}
                      path={worktree.worktreePath ?? target?.cwd ?? ""}
                      muted={worktree.archivedAt !== null}
                      onCopy={props.onCopyPath}
                    />
                  ))}
                  {props.worktrees.length > visibleWorktrees.length ? (
                    <div className="px-2 text-[11px] text-muted-foreground">
                      {props.worktrees.length - visibleWorktrees.length} more worktrees
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </DialogPanel>
        <DialogFooter className="border-border/70 border-t px-6 py-4">
          <Button variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={props.onSave} disabled={props.saving}>
            {props.saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ProjectPathRow(props: {
  label: string;
  path: string;
  muted?: boolean | undefined;
  onCopy: (path: string) => void;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md bg-background px-2 py-1.5">
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-xs font-medium", props.muted && "text-muted-foreground")}>
          {props.label}
        </div>
        <div className="truncate font-mono text-[11px] text-muted-foreground">{props.path}</div>
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Copy path for ${props.label}`}
        onClick={() => props.onCopy(props.path)}
      >
        <CopyIcon className="size-3.5" />
      </Button>
    </div>
  );
}

const SidebarProjectItem = memo(function SidebarProjectItem(props: SidebarProjectItemProps) {
  const {
    project,
    isThreadListExpanded,
    activeRouteThreadKey,
    handleNewThread,
    archiveThread,
    deleteThread,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    isManualProjectSorting,
    dragHandleProps,
  } = props;
  const threadSortOrder = useSettings<SidebarThreadSortOrder>(
    (settings) => settings.sidebarThreadSortOrder,
  );
  const appSettingsConfirmThreadDelete = useSettings<boolean>(
    (settings) => settings.confirmThreadDelete,
  );
  const appSettingsConfirmThreadArchive = false;
  const defaultThreadEnvMode = useSettings<ThreadEnvMode>(
    (settings) => settings.defaultThreadEnvMode,
  );
  const projectGroupingSettings = useSettings((settings) => ({
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  }));
  const { updateSettings } = useUpdateSettings();
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const markThreadUnread = useUiStateStore((state) => state.markThreadUnread);
  const toggleProject = useUiStateStore((state) => state.toggleProject);
  const toggleThreadSelection = useThreadSelectionStore((state) => state.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((state) => state.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const removeFromSelection = useThreadSelectionStore((state) => state.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);
  const selectedThreadCount = useThreadSelectionStore((state) => state.selectedThreadKeys.size);
  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{
    path: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: ctx.path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const openPrLink = useCallback((event: React.MouseEvent<HTMLElement>, prUrl: string) => {
    event.preventDefault();
    event.stopPropagation();

    const api = readLocalApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Link opening is unavailable.",
      });
      return;
    }

    void api.shell.openExternal(prUrl).catch((error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Unable to open pull request link",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    });
  }, []);
  const sidebarThreads = useStore(
    useShallow(
      useMemo(
        () => (state: import("../store").AppState) =>
          selectSidebarThreadsForProjectRefs(state, project.memberProjectRefs),
        [project.memberProjectRefs],
      ),
    ),
  );
  const sidebarWorktrees = useStore(
    useShallow(
      useMemo(
        () => (state: import("../store").AppState) =>
          selectSidebarWorktreesForProjectRefs(state, project.memberProjectRefs),
        [project.memberProjectRefs],
      ),
    ),
  );
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const projectDraftThreads = useMemo(
    () =>
      adaptDraftThreadsForSidebarProject({
        draftThreadsByThreadKey,
        project,
      }),
    [draftThreadsByThreadKey, project],
  );
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Keep a ref so callbacks can read the latest map without appearing in
  // dependency arrays (avoids invalidating every thread-row memo on each
  // thread-list change).
  const sidebarThreadByKeyRef = useRef(sidebarThreadByKey);
  sidebarThreadByKeyRef.current = sidebarThreadByKey;
  const projectThreads = useMemo(
    () => [...sidebarThreads, ...projectDraftThreads],
    [projectDraftThreads, sidebarThreads],
  );
  const projectExpanded = useUiStateStore(
    (state) => state.projectExpandedById[project.projectKey] ?? true,
  );
  const threadLastVisitedAts = useUiStateStore(
    useShallow((state) =>
      projectThreads.map(
        (thread) =>
          state.threadLastVisitedAtById[
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
          ] ?? null,
      ),
    ),
  );
  const lastVisitedAtByThreadKey = useMemo(
    () =>
      new Map(
        projectThreads.map((thread, index) => [
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          threadLastVisitedAts[index] ?? null,
        ]),
      ),
    [projectThreads, threadLastVisitedAts],
  );
  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [confirmingArchiveThreadKey, setConfirmingArchiveThreadKey] = useState<string | null>(null);
  const [newWorktreeDialogOpen, setNewWorktreeDialogOpen] = useState(false);
  const [newWorktreeInitialTab, setNewWorktreeInitialTab] =
    useState<NewWorktreeDialogTab>("branches");
  const [projectRenameTarget, setProjectRenameTarget] = useState<SidebarProjectGroupMember | null>(
    null,
  );
  const [projectRenameTitle, setProjectRenameTitle] = useState("");
  const [projectGroupingTarget, setProjectGroupingTarget] =
    useState<SidebarProjectGroupMember | null>(null);
  const [projectGroupingSelection, setProjectGroupingSelection] = useState<
    SidebarProjectGroupingMode | "inherit"
  >("inherit");
  const [projectSettingsTarget, setProjectSettingsTarget] =
    useState<SidebarProjectGroupMember | null>(null);
  const [projectSettingsTitle, setProjectSettingsTitle] = useState("");
  const [projectSettingsWorkspaceRoot, setProjectSettingsWorkspaceRoot] = useState("");
  const [projectSettingsCustomSystemPrompt, setProjectSettingsCustomSystemPrompt] = useState("");
  const [projectSettingsSaving, setProjectSettingsSaving] = useState(false);
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const confirmArchiveButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const memberProjectByScopedKey = useMemo(
    () =>
      new Map(
        project.memberProjects.map((member) => [
          scopedProjectKey(scopeProjectRef(member.environmentId, member.id)),
          member,
        ]),
      ),
    [project.memberProjects],
  );
  const memberThreadCountByPhysicalKey = useMemo(() => {
    const counts = new Map<string, number>(
      project.memberProjects.map((member) => [member.physicalProjectKey, 0] as const),
    );
    for (const thread of projectThreads) {
      const member = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      if (!member) {
        continue;
      }
      counts.set(member.physicalProjectKey, (counts.get(member.physicalProjectKey) ?? 0) + 1);
    }
    return counts;
  }, [memberProjectByScopedKey, project.memberProjects, projectThreads]);
  const sourceControlIssueQueries = useQueries({
    queries: project.memberProjects.map((member) =>
      issueListQueryOptions({
        environmentId: member.environmentId,
        cwd: member.cwd,
        state: "open",
        limit: 100,
      }),
    ),
  });
  const sourceControlPullRequestQueries = useQueries({
    queries: project.memberProjects.map((member) =>
      changeRequestListQueryOptions({
        environmentId: member.environmentId,
        cwd: member.cwd,
        state: "open",
        limit: 100,
      }),
    ),
  });
  const sourceControlCounts = useMemo(
    () => ({
      issues: sumSourceControlQueryCounts(sourceControlIssueQueries),
      pullRequests: sumSourceControlQueryCounts(sourceControlPullRequestQueries),
    }),
    [sourceControlIssueQueries, sourceControlPullRequestQueries],
  );

  const { projectStatus, visibleProjectThreads, orderedProjectThreadKeys } = useMemo(() => {
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const visibleProjectThreads = sortThreads(
      projectThreads.filter((thread) => thread.archivedAt === null),
      threadSortOrder,
    );
    const projectStatus = resolveProjectStatusIndicator(
      visibleProjectThreads.map((thread) => resolveProjectThreadStatus(thread)),
    );
    return {
      orderedProjectThreadKeys: visibleProjectThreads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
      projectStatus,
      visibleProjectThreads,
    };
  }, [lastVisitedAtByThreadKey, projectThreads, threadSortOrder]);

  const pinnedCollapsedThread = useMemo(() => {
    const activeThreadKey = activeRouteThreadKey ?? undefined;
    if (!activeThreadKey || projectExpanded) {
      return null;
    }
    return (
      visibleProjectThreads.find(
        (thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) === activeThreadKey,
      ) ?? null
    );
  }, [activeRouteThreadKey, projectExpanded, visibleProjectThreads]);

  const {
    hasOverflowingThreads,
    hiddenThreadStatus,
    renderedThreads,
    showEmptyThreadState,
    shouldShowThreadPanel,
  } = useMemo(() => {
    const resolveProjectThreadStatus = (thread: SidebarThreadSummary) => {
      const lastVisitedAt = lastVisitedAtByThreadKey.get(
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      );
      return resolveThreadStatusPill({
        thread: {
          ...thread,
          ...(lastVisitedAt !== null && lastVisitedAt !== undefined ? { lastVisitedAt } : {}),
        },
      });
    };
    const hasOverflowingThreads = visibleProjectThreads.length > THREAD_PREVIEW_LIMIT;
    const previewThreads =
      isThreadListExpanded || !hasOverflowingThreads
        ? visibleProjectThreads
        : visibleProjectThreads.slice(0, THREAD_PREVIEW_LIMIT);
    const visibleThreadKeys = new Set(
      [...previewThreads, ...(pinnedCollapsedThread ? [pinnedCollapsedThread] : [])].map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    );
    const renderedThreads = pinnedCollapsedThread
      ? [pinnedCollapsedThread]
      : visibleProjectThreads.filter((thread) =>
          visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
        );
    const hiddenThreads = visibleProjectThreads.filter(
      (thread) =>
        !visibleThreadKeys.has(scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))),
    );
    return {
      hasOverflowingThreads,
      hiddenThreadStatus: resolveProjectStatusIndicator(
        hiddenThreads.map((thread) => resolveProjectThreadStatus(thread)),
      ),
      renderedThreads,
      showEmptyThreadState: projectExpanded && visibleProjectThreads.length === 0,
      shouldShowThreadPanel: projectExpanded || pinnedCollapsedThread !== null,
    };
  }, [
    isThreadListExpanded,
    lastVisitedAtByThreadKey,
    pinnedCollapsedThread,
    projectExpanded,
    visibleProjectThreads,
  ]);
  const sidebarTreeInput = useMemo(() => {
    return adaptProjectForSidebarTree({
      lastVisitedAtByThreadKey,
      project,
      threads: sortThreads(projectThreads, threadSortOrder),
      worktrees: sidebarWorktrees,
    });
  }, [lastVisitedAtByThreadKey, project, projectThreads, sidebarWorktrees, threadSortOrder]);
  const sidebarTree = useSidebarTree({
    projects: [sidebarTreeInput.project],
    threads: sidebarTreeInput.threads,
    worktrees: sidebarTreeInput.worktrees,
  });
  const treeProject = sidebarTree.projects[0] ?? null;
  const visibleTreeThreadKeys = useMemo(() => {
    if (projectExpanded) {
      return null;
    }
    if (!pinnedCollapsedThread) {
      return new Set<string>();
    }
    return new Set([
      scopedThreadKey(
        scopeThreadRef(pinnedCollapsedThread.environmentId, pinnedCollapsedThread.id),
      ),
    ]);
  }, [pinnedCollapsedThread, projectExpanded]);
  const projectSettingsWorktrees = useMemo(() => {
    if (!projectSettingsTarget) {
      return [];
    }
    return sidebarWorktrees.filter(
      (worktree) =>
        worktree.environmentId === projectSettingsTarget.environmentId &&
        worktree.projectId === projectSettingsTarget.id,
    );
  }, [projectSettingsTarget, sidebarWorktrees]);

  const handleProjectButtonClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (suppressProjectClickForContextMenuRef.current) {
        suppressProjectClickForContextMenuRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (dragInProgressRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (suppressProjectClickAfterDragRef.current) {
        suppressProjectClickAfterDragRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (selectedThreadCount > 0) {
        clearSelection();
      }
      toggleProject(project.projectKey);
    },
    [
      clearSelection,
      dragInProgressRef,
      project.projectKey,
      selectedThreadCount,
      suppressProjectClickAfterDragRef,
      suppressProjectClickForContextMenuRef,
      toggleProject,
    ],
  );

  const handleProjectButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (dragInProgressRef.current) {
        return;
      }
      toggleProject(project.projectKey);
    },
    [dragInProgressRef, project.projectKey, toggleProject],
  );

  const handleProjectButtonPointerDownCapture = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      suppressProjectClickForContextMenuRef.current = false;
      if (
        isContextMenuPointerDown({
          button: event.button,
          ctrlKey: event.ctrlKey,
          isMac: isMacPlatform(navigator.platform),
        })
      ) {
        event.stopPropagation();
      }

      suppressProjectClickAfterDragRef.current = false;
    },
    [suppressProjectClickAfterDragRef, suppressProjectClickForContextMenuRef],
  );

  const openProjectRenameDialog = useCallback((member: SidebarProjectGroupMember) => {
    setProjectRenameTarget(member);
    setProjectRenameTitle(member.name);
  }, []);

  const openProjectGroupingDialog = useCallback(
    (member: SidebarProjectGroupMember) => {
      const overrideKey = deriveProjectGroupingOverrideKey(member);
      setProjectGroupingTarget(member);
      setProjectGroupingSelection(
        projectGroupingSettings.sidebarProjectGroupingOverrides?.[overrideKey] ?? "inherit",
      );
    },
    [projectGroupingSettings.sidebarProjectGroupingOverrides],
  );

  const openProjectSettingsDialog = useCallback((member: SidebarProjectGroupMember) => {
    setProjectSettingsTarget(member);
    setProjectSettingsTitle(member.name);
    setProjectSettingsWorkspaceRoot(member.cwd);
    setProjectSettingsCustomSystemPrompt(member.customSystemPrompt ?? "");
    setProjectSettingsSaving(false);
  }, []);

  const openProjectRemoteLink = useCallback((member: SidebarProjectGroupMember) => {
    const remoteLink = resolveProjectRemoteLink(member.repositoryIdentity);
    if (!remoteLink) {
      toastManager.add({
        type: "warning",
        title: "No remote link available",
      });
      return;
    }

    const api = readLocalApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Link opening is unavailable.",
      });
      return;
    }

    void api.shell.openExternal(remoteLink.url).catch((error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Unable to open remote repository",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    });
  }, []);

  const removeProject = useCallback(
    async (member: SidebarProjectGroupMember, options: { force?: boolean } = {}): Promise<void> => {
      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const draftStore = useComposerDraftStore.getState();
      const projectDraftThread = draftStore.getDraftThreadByProjectRef(memberProjectRef);
      if (projectDraftThread) {
        draftStore.clearDraftThread(projectDraftThread.draftId);
      }
      draftStore.clearProjectDraftThreadId(memberProjectRef);

      const projectApi = readEnvironmentApi(member.environmentId);
      if (!projectApi) {
        throw new Error("Project API unavailable.");
      }

      await projectApi.orchestration.dispatchCommand({
        type: "project.delete",
        commandId: newCommandId(),
        projectId: member.id,
        ...(options.force === true ? { force: true } : {}),
      });
    },
    [],
  );

  const handleRemoveProject = useCallback(
    async (member: SidebarProjectGroupMember) => {
      const api = readLocalApi();
      if (!api) {
        return;
      }

      const memberProjectRef = scopeProjectRef(member.environmentId, member.id);
      const memberThreadCount = memberThreadCountByPhysicalKey.get(member.physicalProjectKey) ?? 0;
      if (memberThreadCount > 0) {
        const warningToastId = toastManager.add(
          stackedThreadToast({
            type: "warning",
            title: "Project is not empty",
            description: "Delete all threads in this project before removing it.",
            actionVariant: "destructive",
            actionProps: {
              children: "Delete anyway",
              onClick: () => {
                void (async () => {
                  toastManager.close(warningToastId);
                  await new Promise<void>((resolve) => {
                    window.setTimeout(resolve, 180);
                  });

                  const latestProjectThreads = selectSidebarThreadsForProjectRefs(
                    useStore.getState(),
                    [memberProjectRef],
                  );
                  const confirmed = await api.dialogs.confirm(
                    latestProjectThreads.length > 0
                      ? [
                          `Remove project "${member.name}" and delete its ${latestProjectThreads.length} thread${
                            latestProjectThreads.length === 1 ? "" : "s"
                          }?`,
                          `Path: ${member.cwd}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This permanently clears conversation history for those threads.",
                          "This removes only this project entry.",
                          "This action cannot be undone.",
                        ].join("\n")
                      : [
                          `Remove project "${member.name}"?`,
                          `Path: ${member.cwd}`,
                          ...(member.environmentLabel
                            ? [`Environment: ${member.environmentLabel}`]
                            : []),
                          "This removes only this project entry.",
                        ].join("\n"),
                  );
                  if (!confirmed) {
                    return;
                  }

                  await removeProject(member, { force: true });
                })().catch((error) => {
                  const message =
                    error instanceof Error ? error.message : "Unknown error removing project.";
                  console.error("Failed to remove project", {
                    projectId: member.id,
                    environmentId: member.environmentId,
                    error,
                  });
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: `Failed to remove "${member.name}"`,
                      description: message,
                    }),
                  );
                });
              },
            },
          }),
        );
        return;
      }

      const message = [
        `Remove project "${member.name}"?`,
        `Path: ${member.cwd}`,
        ...(member.environmentLabel ? [`Environment: ${member.environmentLabel}`] : []),
        "This removes only this project entry.",
      ].join("\n");
      const confirmed = await api.dialogs.confirm(message);
      if (!confirmed) {
        return;
      }

      try {
        await removeProject(member);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error removing project.";
        console.error("Failed to remove project", {
          projectId: member.id,
          environmentId: member.environmentId,
          error,
        });
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `Failed to remove "${member.name}"`,
            description: message,
          }),
        );
      }
    },
    [memberThreadCountByPhysicalKey, removeProject],
  );

  const handleProjectButtonContextMenu = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      suppressProjectClickForContextMenuRef.current = true;
      void (async () => {
        const api = readLocalApi();
        if (!api) return;

        const actionHandlers = new Map<string, () => Promise<void> | void>();
        const makeLeaf = (
          action: "settings" | "open-remote" | "rename" | "grouping" | "copy-path" | "delete",
          member: SidebarProjectGroupMember,
          options?: {
            destructive?: boolean;
            disabled?: boolean;
          },
        ): ContextMenuItem<string> => {
          const id = `${action}:${member.physicalProjectKey}`;
          actionHandlers.set(id, () => {
            switch (action) {
              case "settings":
                openProjectSettingsDialog(member);
                return;
              case "open-remote":
                openProjectRemoteLink(member);
                return;
              case "rename":
                openProjectRenameDialog(member);
                return;
              case "grouping":
                openProjectGroupingDialog(member);
                return;
              case "copy-path":
                copyPathToClipboard(member.cwd, { path: member.cwd });
                return;
              case "delete":
                return handleRemoveProject(member);
            }
          });

          return {
            id,
            label: formatProjectMemberActionLabel(member, project.groupedProjectCount),
            ...(options?.destructive ? { destructive: true } : {}),
            ...(options?.disabled ? { disabled: true } : {}),
          };
        };

        const buildTargetedItem = (
          action: "settings" | "open-remote" | "rename" | "grouping" | "copy-path" | "delete",
          label: string,
          options?: {
            destructive?: boolean;
            isDisabled?: (member: SidebarProjectGroupMember) => boolean;
          },
        ): ContextMenuItem<string> => {
          if (project.memberProjects.length === 1) {
            const singleMember = project.memberProjects[0]!;
            return {
              ...makeLeaf(action, singleMember, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.isDisabled?.(singleMember) ? { disabled: true } : {}),
              }),
              label,
            };
          }

          return {
            id: `${action}:submenu`,
            label,
            children: project.memberProjects.map((member) =>
              makeLeaf(action, member, {
                ...(options?.destructive ? { destructive: true } : {}),
                ...(options?.isDisabled?.(member) ? { disabled: true } : {}),
              }),
            ),
          };
        };

        const hasAnyRemoteLink = project.memberProjects.some(
          (member) => resolveProjectRemoteLink(member.repositoryIdentity) !== null,
        );
        const menuItems: ContextMenuItem<string>[] = [
          buildTargetedItem("settings", "Project settings"),
          ...(hasAnyRemoteLink
            ? [
                buildTargetedItem("open-remote", "Open remote", {
                  isDisabled: (member) =>
                    resolveProjectRemoteLink(member.repositoryIdentity) === null,
                }),
              ]
            : []),
          buildTargetedItem("rename", "Rename project"),
          buildTargetedItem("grouping", "Project grouping…"),
          buildTargetedItem("copy-path", "Copy Project Path"),
          buildTargetedItem("delete", "Remove project", {
            destructive: true,
          }),
        ];

        const clicked = await api.contextMenu.show(menuItems, {
          x: event.clientX,
          y: event.clientY,
        });

        if (!clicked) {
          return;
        }

        await actionHandlers.get(clicked)?.();
      })();
    },
    [
      copyPathToClipboard,
      handleRemoveProject,
      openProjectGroupingDialog,
      openProjectRemoteLink,
      openProjectRenameDialog,
      openProjectSettingsDialog,
      project.groupedProjectCount,
      project.memberProjects,
      suppressProjectClickForContextMenuRef,
    ],
  );

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const navigateToDraft = useCallback(
    (draftId: DraftId, threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/draft/$draftId",
        params: { draftId },
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const closeThread = useCallback(
    async (
      thread: SidebarThreadSummary & { draftId?: DraftId | undefined },
      opts: { deletedThreadKeys?: ReadonlySet<string> } = {},
    ) => {
      if (thread.draftId) {
        const draftStore = useComposerDraftStore.getState();
        draftStore.clearDraftThread(thread.draftId);
        const currentRouteParams =
          router.state.matches[router.state.matches.length - 1]?.params ?? {};
        const currentRouteTarget = resolveThreadRouteTarget(currentRouteParams);
        if (currentRouteTarget?.kind === "draft" && currentRouteTarget.draftId === thread.draftId) {
          await router.navigate({ to: "/", replace: true });
        }
        return;
      }
      const threadRef = scopeThreadRef(thread.environmentId, thread.id);
      const shouldConfirmClose = shouldConfirmCloseSidebarThread(thread);
      if (shouldConfirmClose) {
        const message = [
          `Close session "${thread.title}"?`,
          "This permanently clears conversation history for this thread.",
        ].join("\n");
        const localApi = readLocalApi();
        const confirmed = localApi
          ? await localApi.dialogs.confirm(message)
          : window.confirm(message);
        if (!confirmed) {
          return;
        }
      }
      await deleteThread(threadRef, {
        ...opts,
        // Always optimistic after the (synchronous) confirmation. The
        // non-optimistic branch awaits the WS round-trip before touching
        // the UI — perceived as a multi-second freeze. The optimistic
        // branch already toasts errors if the server delete fails.
        optimistic: true,
      });
    },
    [deleteThread, router],
  );

  const handleThreadClick = useCallback(
    (
      event: React.MouseEvent,
      threadRef: ScopedThreadRef,
      orderedProjectThreadKeys: readonly string[],
    ) => {
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;
      const threadKey = scopedThreadKey(threadRef);
      const currentSelectionCount = useThreadSelectionStore.getState().selectedThreadKeys.size;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadKey);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadKey, orderedProjectThreadKeys);
        return;
      }

      if (currentSelectionCount > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadKey);
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [
      clearSelection,
      isMobile,
      rangeSelectTo,
      router,
      setOpenMobile,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKeys = [...useThreadSelectionStore.getState().selectedThreadKeys];
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;

      const clicked = await api.contextMenu.show(
        [
          { id: "mark-unread", label: `Mark unread (${count})` },
          { id: "delete", label: `Delete (${count})`, destructive: true },
        ],
        position,
      );

      if (clicked === "mark-unread") {
        for (const threadKey of threadKeys) {
          const thread = sidebarThreadByKeyRef.current.get(threadKey);
          markThreadUnread(threadKey, thread?.latestTurn?.completedAt);
        }
        clearSelection();
        return;
      }

      if (clicked !== "delete") return;

      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete ${count} thread${count === 1 ? "" : "s"}?`,
            "This permanently clears conversation history for these threads.",
          ].join("\n"),
        );
        if (!confirmed) return;
      }

      const deletedThreadKeys = new Set(threadKeys);
      for (const threadKey of threadKeys) {
        const thread = sidebarThreadByKeyRef.current.get(threadKey);
        if (!thread) continue;
        await deleteThread(scopeThreadRef(thread.environmentId, thread.id), {
          deletedThreadKeys,
        });
      }
      removeFromSelection(threadKeys);
    },
    [
      appSettingsConfirmThreadDelete,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
    ],
  );

  const createThreadForProjectMember = useCallback(
    (
      member: SidebarProjectGroupMember,
      seedOverride?: {
        branch?: string | null;
        envMode: ThreadEnvMode;
        worktreePath?: string | null;
      },
    ) => {
      const currentRouteParams =
        router.state.matches[router.state.matches.length - 1]?.params ?? {};
      const currentRouteTarget = resolveThreadRouteTarget(currentRouteParams);
      const currentActiveThread =
        currentRouteTarget?.kind === "server"
          ? (selectThreadByRef(useStore.getState(), currentRouteTarget.threadRef) ?? null)
          : null;
      const draftStore = useComposerDraftStore.getState();
      const currentActiveDraftThread =
        currentRouteTarget?.kind === "server"
          ? (draftStore.getDraftThread(currentRouteTarget.threadRef) ?? null)
          : currentRouteTarget?.kind === "draft"
            ? (draftStore.getDraftSession(currentRouteTarget.draftId) ?? null)
            : null;
      const seedContext =
        seedOverride ??
        resolveSidebarNewThreadSeedContext({
          projectId: member.id,
          defaultEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: defaultThreadEnvMode,
          }),
          activeThread:
            currentActiveThread && currentActiveThread.projectId === member.id
              ? {
                  projectId: currentActiveThread.projectId,
                  branch: currentActiveThread.branch,
                  worktreePath: currentActiveThread.worktreePath,
                }
              : null,
          activeDraftThread:
            currentActiveDraftThread && currentActiveDraftThread.projectId === member.id
              ? {
                  projectId: currentActiveDraftThread.projectId,
                  branch: currentActiveDraftThread.branch,
                  worktreePath: currentActiveDraftThread.worktreePath,
                  envMode: currentActiveDraftThread.envMode,
                }
              : null,
        });
      if (isMobile) {
        setOpenMobile(false);
      }
      void handleNewThread(scopeProjectRef(member.environmentId, member.id), {
        ...(seedContext.branch !== undefined ? { branch: seedContext.branch } : {}),
        ...(seedContext.worktreePath !== undefined
          ? { worktreePath: seedContext.worktreePath }
          : {}),
        envMode: seedContext.envMode,
      });
    },
    [defaultThreadEnvMode, handleNewThread, isMobile, router, setOpenMobile],
  );

  const handleOpenNewWorktreeClick = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setNewWorktreeInitialTab("branches");
    setNewWorktreeDialogOpen(true);
  }, []);

  const createThreadInWorktree = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      const targetMember = project.memberProjects[0];
      if (!targetMember) {
        return;
      }
      createThreadForProjectMember(targetMember, {
        branch: worktreeNode.worktree.branch,
        envMode: worktreeNode.worktree.worktreePath ? "worktree" : "local",
        worktreePath: worktreeNode.worktree.worktreePath,
      });
    },
    [createThreadForProjectMember, project.memberProjects],
  );

  const openWorktree = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      const activeThreads = worktreeNode.sessions.toSorted(
        (left, right) =>
          Date.parse(right.updatedAt ?? right.createdAt) -
          Date.parse(left.updatedAt ?? left.createdAt),
      );
      const targetThread = activeThreads[0];
      if (targetThread) {
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return;
      }
      createThreadInWorktree(worktreeNode);
    },
    [createThreadInWorktree, navigateToThread],
  );

  const resolveWorktreeFilesystemPath = useCallback(
    (worktreeNode: SidebarTreeWorktree) => worktreeNode.worktree.worktreePath ?? project.cwd,
    [project.cwd],
  );

  const copyWorktreePath = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      const path = resolveWorktreeFilesystemPath(worktreeNode);
      if (!path) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Path unavailable",
            description: "This worktree does not have a workspace path to copy.",
          }),
        );
        return;
      }
      copyPathToClipboard(path, { path });
    },
    [copyPathToClipboard, resolveWorktreeFilesystemPath],
  );

  const openWorktreeInEditor = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      const path = resolveWorktreeFilesystemPath(worktreeNode);
      const api = readLocalApi();
      if (!api || !path) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open worktree",
            description: "No local editor bridge is available.",
          }),
        );
        return;
      }
      void openInPreferredEditor(api, path).catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Unable to open worktree",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      });
    },
    [resolveWorktreeFilesystemPath],
  );

  const archiveWorktree = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      const api = readEnvironmentApi(project.environmentId);
      const archive = api?.git.archiveWorktree;
      if (!archive) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Archive unavailable",
            description: "This environment does not support worktree archiving.",
          }),
        );
        return;
      }
      void archive({
        worktreeId: WorktreeId.make(worktreeNode.worktree.worktreeId),
        deleteBranch: false,
      }).catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive worktree",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      });
    },
    [project.environmentId],
  );

  const deleteWorktree = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      void (async () => {
        const localApi = readLocalApi();
        if (localApi) {
          const confirmed = await localApi.dialogs.confirm(
            [
              `Delete worktree "${worktreeNode.worktree.branch}"?`,
              "This permanently removes the worktree and its sessions.",
            ].join("\n"),
          );
          if (!confirmed) {
            return;
          }
        }
        const api = readEnvironmentApi(project.environmentId);
        const deleteRpc = api?.git.deleteWorktree;
        if (!deleteRpc) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Delete unavailable",
              description: "This environment does not support worktree deletion.",
            }),
          );
          return;
        }
        await deleteRpc({
          worktreeId: WorktreeId.make(worktreeNode.worktree.worktreeId),
          deleteBranch: false,
        });
      })().catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to delete worktree",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      });
    },
    [project.environmentId],
  );

  const restoreWorktree = useCallback(
    (worktreeNode: SidebarTreeWorktree) => {
      const api = readEnvironmentApi(project.environmentId);
      const restore = api?.git.restoreWorktree;
      if (!restore) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Restore unavailable",
            description: "This environment does not support worktree restore.",
          }),
        );
        return;
      }
      void restore({
        worktreeId: WorktreeId.make(worktreeNode.worktree.worktreeId),
      }).catch((error: unknown) => {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to restore worktree",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      });
    },
    [project.environmentId],
  );

  const renameWorktree = useCallback(
    async (worktreeNode: SidebarTreeWorktree, title: string) => {
      const trimmed = title.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Worktree title cannot be empty",
        });
        return;
      }

      const api = readEnvironmentApi(project.environmentId);
      if (!api) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename worktree",
            description: "Project API unavailable.",
          }),
        );
        return;
      }

      try {
        const changedAt = new Date().toISOString();
        const worktreeId = WorktreeId.make(worktreeNode.worktree.worktreeId);
        await api.orchestration.dispatchCommand({
          type: "worktree.meta.update",
          commandId: newCommandId(),
          worktreeId,
          title: trimmed,
          changedAt,
        });
        useStore
          .getState()
          .setSidebarWorktreeTitle(project.environmentId, worktreeId, trimmed, changedAt);
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename worktree",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [project.environmentId],
  );

  const attemptArchiveThread = useCallback(
    async (threadRef: ScopedThreadRef) => {
      try {
        const thread = sidebarThreadByKeyRef.current.get(scopedThreadKey(threadRef)) ?? null;
        if (thread && !canArchiveSidebarThread(thread)) {
          toastManager.add({
            type: "warning",
            title: "Send a message before archiving",
          });
          return;
        }
        await archiveThread(threadRef);
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    },
    [archiveThread],
  );

  const cancelRename = useCallback(() => {
    setRenamingThreadKey(null);
    renamingInputRef.current = null;
  }, []);

  const commitRename = useCallback(
    async (threadRef: ScopedThreadRef, newTitle: string, originalTitle: string) => {
      const threadKey = scopedThreadKey(threadRef);
      const finishRename = () => {
        setRenamingThreadKey((current) => {
          if (current !== threadKey) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const api = readEnvironmentApi(threadRef.environmentId);
      if (!api) {
        finishRename();
        return;
      }
      try {
        await api.orchestration.dispatchCommand({
          type: "thread.meta.update",
          commandId: newCommandId(),
          threadId: threadRef.threadId,
          title: trimmed,
        });
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      finishRename();
    },
    [],
  );

  const closeProjectRenameDialog = useCallback(() => {
    setProjectRenameTarget(null);
    setProjectRenameTitle("");
  }, []);

  const closeProjectSettingsDialog = useCallback(() => {
    setProjectSettingsTarget(null);
    setProjectSettingsTitle("");
    setProjectSettingsWorkspaceRoot("");
    setProjectSettingsCustomSystemPrompt("");
    setProjectSettingsSaving(false);
  }, []);

  const pickProjectSettingsWorkspaceRoot = useCallback(async () => {
    const api = readLocalApi();
    if (!api) {
      toastManager.add({
        type: "error",
        title: "Folder picker is unavailable.",
      });
      return;
    }

    const picked = await api.dialogs.pickFolder({
      initialPath: projectSettingsWorkspaceRoot.trim() || projectSettingsTarget?.cwd || null,
    });
    if (picked) {
      setProjectSettingsWorkspaceRoot(picked);
    }
  }, [projectSettingsTarget?.cwd, projectSettingsWorkspaceRoot]);

  const submitProjectSettings = useCallback(async () => {
    if (!projectSettingsTarget || projectSettingsSaving) {
      return;
    }

    const title = projectSettingsTitle.trim();
    const workspaceRoot = projectSettingsWorkspaceRoot.trim();
    const customSystemPrompt = projectSettingsCustomSystemPrompt.trim();
    if (title.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project title cannot be empty",
      });
      return;
    }
    if (workspaceRoot.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project root cannot be empty",
      });
      return;
    }

    const titleChanged = title !== projectSettingsTarget.name;
    const workspaceRootChanged = workspaceRoot !== projectSettingsTarget.cwd;
    const currentCustomSystemPrompt = projectSettingsTarget.customSystemPrompt?.trim() ?? "";
    const customSystemPromptChanged = customSystemPrompt !== currentCustomSystemPrompt;
    if (!titleChanged && !workspaceRootChanged && !customSystemPromptChanged) {
      closeProjectSettingsDialog();
      return;
    }

    const api = readEnvironmentApi(projectSettingsTarget.environmentId);
    if (!api) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to update project",
          description: "Project API unavailable.",
        }),
      );
      return;
    }

    setProjectSettingsSaving(true);
    try {
      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: projectSettingsTarget.id,
        ...(titleChanged ? { title } : {}),
        ...(workspaceRootChanged ? { workspaceRoot } : {}),
        ...(customSystemPromptChanged
          ? { customSystemPrompt: customSystemPrompt.length > 0 ? customSystemPrompt : null }
          : {}),
      });
      closeProjectSettingsDialog();
    } catch (error) {
      setProjectSettingsSaving(false);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to update project",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [
    closeProjectSettingsDialog,
    projectSettingsSaving,
    projectSettingsCustomSystemPrompt,
    projectSettingsTarget,
    projectSettingsTitle,
    projectSettingsWorkspaceRoot,
  ]);

  const submitProjectRename = useCallback(async () => {
    if (!projectRenameTarget) {
      return;
    }

    const trimmed = projectRenameTitle.trim();
    if (trimmed.length === 0) {
      toastManager.add({
        type: "warning",
        title: "Project title cannot be empty",
      });
      return;
    }

    if (trimmed === projectRenameTarget.name) {
      closeProjectRenameDialog();
      return;
    }

    const api = readEnvironmentApi(projectRenameTarget.environmentId);
    if (!api) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to rename project",
          description: "Project API unavailable.",
        }),
      );
      return;
    }

    try {
      await api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: projectRenameTarget.id,
        title: trimmed,
      });
      closeProjectRenameDialog();
    } catch (error) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to rename project",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    }
  }, [closeProjectRenameDialog, projectRenameTarget, projectRenameTitle]);

  const closeProjectGroupingDialog = useCallback(() => {
    setProjectGroupingTarget(null);
    setProjectGroupingSelection("inherit");
  }, []);

  const saveProjectGroupingPreference = useCallback(() => {
    if (!projectGroupingTarget) {
      return;
    }

    const overrideKey = deriveProjectGroupingOverrideKey(projectGroupingTarget);
    const nextOverrides = {
      ...projectGroupingSettings.sidebarProjectGroupingOverrides,
    };
    if (projectGroupingSelection === "inherit") {
      delete nextOverrides[overrideKey];
    } else {
      nextOverrides[overrideKey] = projectGroupingSelection;
    }
    updateSettings({
      sidebarProjectGroupingOverrides: nextOverrides,
    });
    closeProjectGroupingDialog();
  }, [
    closeProjectGroupingDialog,
    projectGroupingSelection,
    projectGroupingSettings.sidebarProjectGroupingOverrides,
    projectGroupingTarget,
    updateSettings,
  ]);

  const handleThreadContextMenu = useCallback(
    async (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKey = scopedThreadKey(threadRef);
      const thread = sidebarThreadByKeyRef.current.get(threadKey) ?? null;
      if (!thread) return;
      const draftId = (thread as SidebarThreadSummary & { draftId?: DraftId | undefined }).draftId;
      const archiveAvailable = !draftId && canArchiveSidebarThread(thread);
      const threadProject = memberProjectByScopedKey.get(
        scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
      );
      const threadWorkspacePath = thread.worktreePath ?? threadProject?.cwd ?? project.cwd ?? null;
      if (draftId) {
        if (selectedThreadCount > 0) {
          clearSelection();
        }
        const clicked = await api.contextMenu.show(
          [{ id: "close", label: "Close session" }],
          position,
        );
        if (clicked === "close") {
          await closeThread(thread);
        }
        return;
      }
      const clicked = await api.contextMenu.show(
        [
          { id: "rename", label: "Rename thread" },
          { id: "mark-unread", label: "Mark unread" },
          { id: "copy-path", label: "Copy Path" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          ...(archiveAvailable ? [{ id: "archive", label: "Archive session" }] : []),
          {
            id: "close",
            label: thread.worktreeId || thread.worktreePath ? "Close session" : "Delete thread",
            destructive: true,
          },
        ],
        position,
      );

      if (clicked === "rename") {
        setRenamingThreadKey(threadKey);
        setRenamingTitle(thread.title);
        renamingCommittedRef.current = false;
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadKey, thread.latestTurn?.completedAt);
        return;
      }
      if (clicked === "copy-path") {
        if (!threadWorkspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Path unavailable",
              description: "This thread does not have a workspace path to copy.",
            }),
          );
          return;
        }
        copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
        return;
      }
      if (clicked === "copy-thread-id") {
        copyThreadIdToClipboard(thread.id, { threadId: thread.id });
        return;
      }
      if (clicked === "archive") {
        await attemptArchiveThread(threadRef);
        return;
      }
      if (clicked !== "close") return;
      await closeThread(thread);
    },
    [
      attemptArchiveThread,
      clearSelection,
      closeThread,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      markThreadUnread,
      memberProjectByScopedKey,
      project.cwd,
      selectedThreadCount,
    ],
  );

  return (
    <>
      <div className="group/project-header relative">
        <SidebarMenuButton
          ref={isManualProjectSorting ? dragHandleProps?.setActivatorNodeRef : undefined}
          size="sm"
          className={`gap-2 px-2 py-1.5 pr-14 text-left hover:bg-accent group-hover/project-header:bg-accent group-hover/project-header:text-sidebar-accent-foreground ${
            isManualProjectSorting ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
          }`}
          {...(isManualProjectSorting && dragHandleProps ? dragHandleProps.attributes : {})}
          {...(isManualProjectSorting && dragHandleProps ? dragHandleProps.listeners : {})}
          onPointerDownCapture={handleProjectButtonPointerDownCapture}
          onClick={handleProjectButtonClick}
          onKeyDown={handleProjectButtonKeyDown}
          onContextMenu={handleProjectButtonContextMenu}
        >
          {!projectExpanded && projectStatus ? (
            <span
              aria-hidden="true"
              title={projectStatus.label}
              className={`-ml-0.5 relative inline-flex size-3.5 shrink-0 items-center justify-center ${projectStatus.colorClass}`}
            >
              <span className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover/project-header:opacity-0">
                <span
                  className={`size-[9px] rounded-full ${projectStatus.dotClass} ${
                    projectStatus.pulse ? "animate-pulse" : ""
                  }`}
                />
              </span>
              <ChevronRightIcon className="absolute inset-0 m-auto size-3.5 text-muted-foreground/70 opacity-0 transition-opacity duration-150 group-hover/project-header:opacity-100" />
            </span>
          ) : (
            <ChevronRightIcon
              className={`-ml-0.5 size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
                projectExpanded ? "rotate-90" : ""
              }`}
            />
          )}
          <ProjectFavicon environmentId={project.environmentId} cwd={project.cwd} />
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-xs font-medium text-foreground/90">
              {project.displayName}
            </span>
            <ProjectSourceControlBadges
              issueCount={sourceControlCounts.issues}
              pullRequestCount={sourceControlCounts.pullRequests}
            />
            {project.groupedProjectCount > 1 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {project.groupedProjectCount} projects
              </span>
            ) : null}
          </span>
        </SidebarMenuButton>
        {/* Environment badge – visible by default, crossfades with the
            "new thread" button on hover using the same pointer-events +
            opacity pattern as the thread row archive/timestamp swap. */}
        {project.environmentPresence === "remote-only" && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span
                  aria-label={
                    project.environmentPresence === "remote-only"
                      ? "Remote project"
                      : "Available in multiple environments"
                  }
                  className="pointer-events-none absolute top-1 right-1.5 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-opacity duration-150 max-sm:right-7 group-hover/project-header:opacity-0 group-focus-within/project-header:opacity-0 max-sm:group-hover/project-header:opacity-100 max-sm:group-focus-within/project-header:opacity-100"
                />
              }
            >
              <CloudIcon className="size-3" />
            </TooltipTrigger>
            <TooltipPopup side="top">
              Remote environment: {project.remoteEnvironmentLabels.join(", ")}
            </TooltipPopup>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <div className="pointer-events-none absolute top-1 right-7 opacity-0 transition-opacity duration-150 max-sm:pointer-events-auto max-sm:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100">
                <button
                  type="button"
                  aria-label={`Create new workspace in ${project.displayName}`}
                  data-testid="new-thread-button"
                  className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={handleOpenNewWorktreeClick}
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </div>
            }
          />
          <TooltipPopup side="top">New workspace</TooltipPopup>
        </Tooltip>
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  aria-label={`Open project settings for ${project.displayName}`}
                  className="pointer-events-none absolute top-1 right-1.5 inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity duration-150 hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring max-sm:pointer-events-auto max-sm:opacity-100 group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100"
                />
              }
            >
              <MoreHorizontalIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipPopup side="top">Project settings</TooltipPopup>
          </Tooltip>
          <MenuPopup align="end" side="bottom" className="min-w-48">
            <ProjectSettingsMenu
              project={project}
              onCopyPath={(member) => {
                copyPathToClipboard(member.cwd, { path: member.cwd });
              }}
              onGrouping={openProjectGroupingDialog}
              onOpenRemote={openProjectRemoteLink}
              onRemove={(member) => {
                void handleRemoveProject(member);
              }}
              onRename={openProjectRenameDialog}
              onSettings={openProjectSettingsDialog}
            />
          </MenuPopup>
        </Menu>
      </div>

      {treeProject?.isGitRepo ? (
        <SidebarWorktreeList
          treeProject={treeProject}
          projectExpanded={projectExpanded}
          visibleThreadKeys={visibleTreeThreadKeys}
          attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
          onArchiveWorktree={archiveWorktree}
          onCopyWorktreePath={copyWorktreePath}
          onDeleteWorktree={deleteWorktree}
          onNewSession={createThreadInWorktree}
          onOpenInEditor={openWorktreeInEditor}
          onOpenWorktree={openWorktree}
          onRenameWorktree={renameWorktree}
          onRestoreWorktree={restoreWorktree}
          renderThread={(thread: SidebarTreeThread, treeThreadKeys) => {
            const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
            return (
              <SidebarThreadRow
                key={threadKey}
                thread={thread}
                projectCwd={project.cwd}
                orderedProjectThreadKeys={treeThreadKeys}
                isActive={activeRouteThreadKey === threadKey}
                jumpLabel={threadJumpLabelByKey.get(threadKey) ?? null}
                appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
                renamingThreadKey={renamingThreadKey}
                renamingTitle={renamingTitle}
                setRenamingTitle={setRenamingTitle}
                renamingInputRef={renamingInputRef}
                renamingCommittedRef={renamingCommittedRef}
                confirmingArchiveThreadKey={confirmingArchiveThreadKey}
                setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
                confirmArchiveButtonRefs={confirmArchiveButtonRefs}
                handleThreadClick={handleThreadClick}
                navigateToThread={navigateToThread}
                navigateToDraft={navigateToDraft}
                handleMultiSelectContextMenu={handleMultiSelectContextMenu}
                handleThreadContextMenu={handleThreadContextMenu}
                closeThread={closeThread}
                clearSelection={clearSelection}
                commitRename={commitRename}
                cancelRename={cancelRename}
                attemptArchiveThread={attemptArchiveThread}
                openPrLink={openPrLink}
                isTreeChild
              />
            );
          }}
        />
      ) : (
        <SidebarProjectThreadList
          projectKey={project.projectKey}
          projectExpanded={projectExpanded}
          hasOverflowingThreads={hasOverflowingThreads}
          hiddenThreadStatus={hiddenThreadStatus}
          orderedProjectThreadKeys={orderedProjectThreadKeys}
          renderedThreads={renderedThreads}
          showEmptyThreadState={showEmptyThreadState}
          shouldShowThreadPanel={shouldShowThreadPanel}
          isThreadListExpanded={isThreadListExpanded}
          projectCwd={project.cwd}
          activeRouteThreadKey={activeRouteThreadKey}
          threadJumpLabelByKey={threadJumpLabelByKey}
          appSettingsConfirmThreadArchive={appSettingsConfirmThreadArchive}
          renamingThreadKey={renamingThreadKey}
          renamingTitle={renamingTitle}
          setRenamingTitle={setRenamingTitle}
          renamingInputRef={renamingInputRef}
          renamingCommittedRef={renamingCommittedRef}
          confirmingArchiveThreadKey={confirmingArchiveThreadKey}
          setConfirmingArchiveThreadKey={setConfirmingArchiveThreadKey}
          confirmArchiveButtonRefs={confirmArchiveButtonRefs}
          attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
          handleThreadClick={handleThreadClick}
          navigateToThread={navigateToThread}
          navigateToDraft={navigateToDraft}
          handleMultiSelectContextMenu={handleMultiSelectContextMenu}
          handleThreadContextMenu={handleThreadContextMenu}
          closeThread={closeThread}
          clearSelection={clearSelection}
          commitRename={commitRename}
          cancelRename={cancelRename}
          attemptArchiveThread={attemptArchiveThread}
          openPrLink={openPrLink}
          expandThreadListForProject={expandThreadListForProject}
          collapseThreadListForProject={collapseThreadListForProject}
        />
      )}

      <NewWorktreeDialog
        open={newWorktreeDialogOpen}
        environmentId={project.environmentId}
        projectId={project.id}
        cwd={project.cwd}
        initialTab={newWorktreeInitialTab}
        onCreated={(result) => {
          navigateToThread(scopeThreadRef(project.environmentId, result.sessionId));
        }}
        onOpenChange={setNewWorktreeDialogOpen}
      />

      <ProjectSettingsDialog
        open={projectSettingsTarget !== null}
        target={projectSettingsTarget}
        title={projectSettingsTitle}
        customSystemPrompt={projectSettingsCustomSystemPrompt}
        workspaceRoot={projectSettingsWorkspaceRoot}
        worktrees={projectSettingsWorktrees}
        saving={projectSettingsSaving}
        onCustomSystemPromptChange={setProjectSettingsCustomSystemPrompt}
        onOpenRemote={openProjectRemoteLink}
        onTitleChange={setProjectSettingsTitle}
        onWorkspaceRootChange={setProjectSettingsWorkspaceRoot}
        onPickWorkspaceRoot={() => void pickProjectSettingsWorkspaceRoot()}
        onCopyPath={(path) => {
          copyPathToClipboard(path, { path });
        }}
        onSave={() => void submitProjectSettings()}
        onClose={closeProjectSettingsDialog}
      />

      <Dialog
        open={projectRenameTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectRenameDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              {projectRenameTarget
                ? `Update the title for ${projectRenameTarget.cwd}.`
                : "Update the project title."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Project title</span>
              <Input
                aria-label="Project title"
                value={projectRenameTitle}
                onChange={(event) => setProjectRenameTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void submitProjectRename();
                  }
                }}
              />
            </div>
            {projectRenameTarget?.environmentLabel ? (
              <p className="text-xs text-muted-foreground">
                Environment: {projectRenameTarget.environmentLabel}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeProjectRenameDialog}>
              Cancel
            </Button>
            <Button onClick={() => void submitProjectRename()}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={projectGroupingTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            closeProjectGroupingDialog();
          }
        }}
      >
        <DialogPopup className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Project grouping</DialogTitle>
            <DialogDescription>
              {projectGroupingTarget
                ? `Choose how ${projectGroupingTarget.cwd} should be grouped in the sidebar.`
                : "Choose how this project should be grouped in the sidebar."}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-4">
            <div className="grid gap-1.5">
              <span className="text-xs font-medium text-foreground">Grouping rule</span>
              <Select
                value={projectGroupingSelection}
                onValueChange={(value) => {
                  if (
                    value === "inherit" ||
                    value === "repository" ||
                    value === "repository_path" ||
                    value === "separate"
                  ) {
                    setProjectGroupingSelection(value);
                  }
                }}
              >
                <SelectTrigger className="w-full" aria-label="Project grouping rule">
                  <SelectValue>
                    {projectGroupingSelection === "inherit"
                      ? `Use global default (${PROJECT_GROUPING_MODE_LABELS[projectGroupingSettings.sidebarProjectGroupingMode]})`
                      : PROJECT_GROUPING_MODE_LABELS[projectGroupingSelection]}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem hideIndicator value="inherit">
                    Use global default
                  </SelectItem>
                  <SelectItem hideIndicator value="repository">
                    {PROJECT_GROUPING_MODE_LABELS.repository}
                  </SelectItem>
                  <SelectItem hideIndicator value="repository_path">
                    {PROJECT_GROUPING_MODE_LABELS.repository_path}
                  </SelectItem>
                  <SelectItem hideIndicator value="separate">
                    {PROJECT_GROUPING_MODE_LABELS.separate}
                  </SelectItem>
                </SelectPopup>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {projectGroupingSelection === "inherit"
                ? projectGroupingModeDescription(projectGroupingSettings.sidebarProjectGroupingMode)
                : projectGroupingModeDescription(projectGroupingSelection)}
            </p>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={closeProjectGroupingDialog}>
              Cancel
            </Button>
            <Button onClick={saveProjectGroupingPreference}>Save</Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});

const SidebarProjectListRow = memo(function SidebarProjectListRow(props: SidebarProjectItemProps) {
  return (
    <SidebarMenuItem className="rounded-md">
      <SidebarProjectItem {...props} />
    </SidebarMenuItem>
  );
});

function S3Wordmark() {
  return (
    <svg
      aria-label="S3"
      className="h-2.5 w-auto shrink-0 text-foreground"
      viewBox="0 0 243 159"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="matrix(1,0,0,1,-134.679688,-176.671158)">
        <g transform="matrix(4.283862,0,0,4.283862,-474.060918,-546.497586)">
          <text
            x="139.855px"
            y="205.214px"
            style={{
              fontFamily: "'ArialMT', 'Arial', sans-serif",
              fontSize: "50px",
              fill: "currentColor",
            }}
          >
            S3
          </text>
        </g>
      </g>
    </svg>
  );
}

type SortableProjectHandleProps = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners" | "setActivatorNodeRef"
>;

function ProjectSortMenu({
  projectSortOrder,
  threadSortOrder,
  projectGroupingMode,
  onProjectSortOrderChange,
  onThreadSortOrderChange,
  onProjectGroupingModeChange,
}: {
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  projectGroupingMode: SidebarProjectGroupingMode;
  onProjectSortOrderChange: (sortOrder: SidebarProjectSortOrder) => void;
  onThreadSortOrderChange: (sortOrder: SidebarThreadSortOrder) => void;
  onProjectGroupingModeChange: (mode: SidebarProjectGroupingMode) => void;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground" />
          }
        >
          <ArrowUpDownIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">Sort projects</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom" className="min-w-44">
        <MenuGroup>
          <div className="px-2 py-1 sm:text-xs font-medium text-muted-foreground">
            Sort projects
          </div>
          <MenuRadioGroup
            value={projectSortOrder}
            onValueChange={(value) => {
              onProjectSortOrderChange(value as SidebarProjectSortOrder);
            }}
          >
            {(Object.entries(SIDEBAR_SORT_LABELS) as Array<[SidebarProjectSortOrder, string]>).map(
              ([value, label]) => (
                <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                  {label}
                </MenuRadioItem>
              ),
            )}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 sm:text-xs font-medium text-muted-foreground">
            Sort threads
          </div>
          <MenuRadioGroup
            value={threadSortOrder}
            onValueChange={(value) => {
              onThreadSortOrderChange(value as SidebarThreadSortOrder);
            }}
          >
            {(
              Object.entries(SIDEBAR_THREAD_SORT_LABELS) as Array<[SidebarThreadSortOrder, string]>
            ).map(([value, label]) => (
              <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground sm:text-xs">
            Group projects
          </div>
          <MenuRadioGroup
            value={projectGroupingMode}
            onValueChange={(value) => {
              if (value === "repository" || value === "repository_path" || value === "separate") {
                onProjectGroupingModeChange(value);
              }
            }}
          >
            {(
              Object.entries(PROJECT_GROUPING_MODE_LABELS) as Array<
                [SidebarProjectGroupingMode, string]
              >
            ).map(([value, label]) => (
              <MenuRadioItem key={value} value={value} className="min-h-7 py-1 sm:text-xs">
                {label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function SortableProjectItem({
  projectId,
  disabled = false,
  children,
}: {
  projectId: string;
  disabled?: boolean;
  children: (handleProps: SortableProjectHandleProps) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: projectId, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      className={`group/menu-item relative rounded-md ${
        isDragging ? "z-20 opacity-80" : ""
      } ${isOver && !isDragging ? "ring-1 ring-primary/40" : ""}`}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
    >
      {children({ attributes, listeners, setActivatorNodeRef })}
    </li>
  );
}

const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const wordmark = (
    <div className="flex items-center gap-2">
      <SidebarTrigger className="shrink-0 md:hidden" />
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              aria-label="Go to threads"
              className="ml-1 flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md outline-hidden ring-ring transition-colors hover:text-foreground focus-visible:ring-2"
              to="/"
            >
              <S3Wordmark />
              <span className="truncate text-sm font-medium tracking-tight text-muted-foreground">
                Code
              </span>
              <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-muted-foreground/60">
                {APP_STAGE_LABEL}
              </span>
            </Link>
          }
        />
        <TooltipPopup side="bottom" sideOffset={2}>
          Version {APP_VERSION}
        </TooltipPopup>
      </Tooltip>
    </div>
  );

  return isElectron ? (
    <SidebarHeader className="drag-region h-[52px] flex-row items-center gap-2 px-4 py-0 pl-[90px] wco:h-[env(titlebar-area-height)] wco:pl-[calc(env(titlebar-area-x)+1em)]">
      {wordmark}
    </SidebarHeader>
  ) : (
    <SidebarHeader className="gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3">{wordmark}</SidebarHeader>
  );
});

const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarFooter className="p-2">
      <SidebarUpdatePill />
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
            onClick={handleSettingsClick}
          >
            <SettingsIcon className="size-3.5" />
            <span className="text-xs">Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});

interface SidebarProjectsContentProps {
  showArm64IntelBuildWarning: boolean;
  arm64IntelBuildWarningDescription: string | null;
  desktopUpdateButtonAction: "download" | "install" | "none";
  desktopUpdateButtonDisabled: boolean;
  handleDesktopUpdateButtonClick: () => void;
  projectSortOrder: SidebarProjectSortOrder;
  threadSortOrder: SidebarThreadSortOrder;
  projectGroupingMode: SidebarProjectGroupingMode;
  updateSettings: ReturnType<typeof useUpdateSettings>["updateSettings"];
  openAddProject: () => void;
  isManualProjectSorting: boolean;
  projectDnDSensors: ReturnType<typeof useSensors>;
  projectCollisionDetection: CollisionDetection;
  handleProjectDragStart: (event: DragStartEvent) => void;
  handleProjectDragEnd: (event: DragEndEvent) => void;
  handleProjectDragCancel: (event: DragCancelEvent) => void;
  handleNewThread: ReturnType<typeof useNewThreadHandler>["handleNewThread"];
  archiveThread: ReturnType<typeof useThreadActions>["archiveThread"];
  deleteThread: ReturnType<typeof useThreadActions>["deleteThread"];
  sortedProjects: readonly SidebarProjectSnapshot[];
  expandedThreadListsByProject: ReadonlySet<string>;
  activeRouteProjectKey: string | null;
  routeThreadKey: string | null;
  newThreadShortcutLabel: string | null;
  commandPaletteShortcutLabel: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
  expandThreadListForProject: (projectKey: string) => void;
  collapseThreadListForProject: (projectKey: string) => void;
  dragInProgressRef: React.RefObject<boolean>;
  suppressProjectClickAfterDragRef: React.RefObject<boolean>;
  suppressProjectClickForContextMenuRef: React.RefObject<boolean>;
  attachProjectListAutoAnimateRef: (node: HTMLElement | null) => void;
  projectsLength: number;
}

const SidebarProjectsContent = memo(function SidebarProjectsContent(
  props: SidebarProjectsContentProps,
) {
  const {
    showArm64IntelBuildWarning,
    arm64IntelBuildWarningDescription,
    desktopUpdateButtonAction,
    desktopUpdateButtonDisabled,
    handleDesktopUpdateButtonClick,
    projectSortOrder,
    threadSortOrder,
    projectGroupingMode,
    updateSettings,
    openAddProject,
    isManualProjectSorting,
    projectDnDSensors,
    projectCollisionDetection,
    handleProjectDragStart,
    handleProjectDragEnd,
    handleProjectDragCancel,
    handleNewThread,
    archiveThread,
    deleteThread,
    sortedProjects,
    expandedThreadListsByProject,
    activeRouteProjectKey,
    routeThreadKey,
    newThreadShortcutLabel,
    commandPaletteShortcutLabel,
    threadJumpLabelByKey,
    attachThreadListAutoAnimateRef,
    expandThreadListForProject,
    collapseThreadListForProject,
    dragInProgressRef,
    suppressProjectClickAfterDragRef,
    suppressProjectClickForContextMenuRef,
    attachProjectListAutoAnimateRef,
    projectsLength,
  } = props;

  const handleProjectSortOrderChange = useCallback(
    (sortOrder: SidebarProjectSortOrder) => {
      updateSettings({ sidebarProjectSortOrder: sortOrder });
    },
    [updateSettings],
  );
  const handleThreadSortOrderChange = useCallback(
    (sortOrder: SidebarThreadSortOrder) => {
      updateSettings({ sidebarThreadSortOrder: sortOrder });
    },
    [updateSettings],
  );
  const handleProjectGroupingModeChange = useCallback(
    (groupingMode: SidebarProjectGroupingMode) => {
      updateSettings({ sidebarProjectGroupingMode: groupingMode });
    },
    [updateSettings],
  );

  return (
    <SidebarContent className="gap-0">
      <SidebarGroup className="px-2 pt-2 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <CommandDialogTrigger
              render={
                <SidebarMenuButton
                  size="sm"
                  className="gap-2 px-2 py-1.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground focus-visible:ring-0"
                  data-testid="command-palette-trigger"
                />
              }
            >
              <SearchIcon className="size-3.5" />
              <span className="flex-1 truncate text-left text-xs">Search</span>
              {commandPaletteShortcutLabel ? (
                <Kbd className="h-4 min-w-0 rounded-sm px-1.5 text-[10px]">
                  {commandPaletteShortcutLabel}
                </Kbd>
              ) : null}
            </CommandDialogTrigger>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      {showArm64IntelBuildWarning && arm64IntelBuildWarningDescription ? (
        <SidebarGroup className="px-2 pt-2 pb-0">
          <Alert variant="warning" className="rounded-2xl border-warning/40 bg-warning/8">
            <TriangleAlertIcon />
            <AlertTitle>Intel build on Apple Silicon</AlertTitle>
            <AlertDescription>{arm64IntelBuildWarningDescription}</AlertDescription>
            {desktopUpdateButtonAction !== "none" ? (
              <AlertAction>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={desktopUpdateButtonDisabled}
                  onClick={handleDesktopUpdateButtonClick}
                >
                  {desktopUpdateButtonAction === "download"
                    ? "Download ARM build"
                    : "Install ARM build"}
                </Button>
              </AlertAction>
            ) : null}
          </Alert>
        </SidebarGroup>
      ) : null}
      <SidebarGroup className="px-2 py-2">
        <div className="mb-1 flex items-center justify-between pl-2 pr-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Projects
          </span>
          <div className="flex items-center gap-1">
            <ProjectSortMenu
              projectSortOrder={projectSortOrder}
              threadSortOrder={threadSortOrder}
              projectGroupingMode={projectGroupingMode}
              onProjectSortOrderChange={handleProjectSortOrderChange}
              onThreadSortOrderChange={handleThreadSortOrderChange}
              onProjectGroupingModeChange={handleProjectGroupingModeChange}
            />
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Add project"
                    data-testid="sidebar-add-project-trigger"
                    className="inline-flex size-5 cursor-pointer items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                    onClick={openAddProject}
                  />
                }
              >
                <FolderPlusIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipPopup side="right">Add project</TooltipPopup>
            </Tooltip>
          </div>
        </div>

        {isManualProjectSorting ? (
          <DndContext
            sensors={projectDnDSensors}
            collisionDetection={projectCollisionDetection}
            modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
            onDragStart={handleProjectDragStart}
            onDragEnd={handleProjectDragEnd}
            onDragCancel={handleProjectDragCancel}
          >
            <SidebarMenu>
              <SortableContextComponent
                items={sortedProjects.map((project) => project.projectKey)}
                strategy={verticalListSortingStrategy}
              >
                {sortedProjects.map((project) => (
                  <SortableProjectItem key={project.projectKey} projectId={project.projectKey}>
                    {(dragHandleProps) => (
                      <SidebarProjectItem
                        project={project}
                        isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                        activeRouteThreadKey={
                          activeRouteProjectKey === project.projectKey ? routeThreadKey : null
                        }
                        newThreadShortcutLabel={newThreadShortcutLabel}
                        handleNewThread={handleNewThread}
                        archiveThread={archiveThread}
                        deleteThread={deleteThread}
                        threadJumpLabelByKey={threadJumpLabelByKey}
                        attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                        expandThreadListForProject={expandThreadListForProject}
                        collapseThreadListForProject={collapseThreadListForProject}
                        dragInProgressRef={dragInProgressRef}
                        suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                        suppressProjectClickForContextMenuRef={
                          suppressProjectClickForContextMenuRef
                        }
                        isManualProjectSorting={isManualProjectSorting}
                        dragHandleProps={dragHandleProps}
                      />
                    )}
                  </SortableProjectItem>
                ))}
              </SortableContextComponent>
            </SidebarMenu>
          </DndContext>
        ) : (
          <SidebarMenu ref={attachProjectListAutoAnimateRef}>
            {sortedProjects.map((project) => (
              <SidebarProjectListRow
                key={project.projectKey}
                project={project}
                isThreadListExpanded={expandedThreadListsByProject.has(project.projectKey)}
                activeRouteThreadKey={
                  activeRouteProjectKey === project.projectKey ? routeThreadKey : null
                }
                newThreadShortcutLabel={newThreadShortcutLabel}
                handleNewThread={handleNewThread}
                archiveThread={archiveThread}
                deleteThread={deleteThread}
                threadJumpLabelByKey={threadJumpLabelByKey}
                attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
                expandThreadListForProject={expandThreadListForProject}
                collapseThreadListForProject={collapseThreadListForProject}
                dragInProgressRef={dragInProgressRef}
                suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
                suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
                isManualProjectSorting={isManualProjectSorting}
                dragHandleProps={null}
              />
            ))}
          </SidebarMenu>
        )}

        {projectsLength === 0 && (
          <div className="px-2 pt-4 text-center text-xs text-muted-foreground/60">
            No projects yet
          </div>
        )}
      </SidebarGroup>
    </SidebarContent>
  );
});

export default function Sidebar() {
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const sidebarThreads = useStore(useShallow(selectSidebarThreadsAcrossEnvironments));
  const sidebarWorktrees = useStore(useShallow(selectSidebarWorktreesAcrossEnvironments));
  const draftThreadsByThreadKey = useComposerDraftStore((store) => store.draftThreadsByThreadKey);
  const projectExpandedById = useUiStateStore((store) => store.projectExpandedById);
  const projectOrder = useUiStateStore((store) => store.projectOrder);
  const reorderProjects = useUiStateStore((store) => store.reorderProjects);
  const navigate = useNavigate();
  const pathname = useLocation({ select: (loc) => loc.pathname });
  const isOnSettings = pathname.startsWith("/settings");
  const sidebarThreadSortOrder = useSettings((s) => s.sidebarThreadSortOrder);
  const sidebarProjectSortOrder = useSettings((s) => s.sidebarProjectSortOrder);
  const sidebarProjectGroupingMode = useSettings((s) => s.sidebarProjectGroupingMode);
  const projectGroupingSettings = useSettings((settings) => ({
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  }));
  const { updateSettings } = useUpdateSettings();
  const { handleNewThread } = useNewThreadHandler();
  const { archiveThread, deleteThread } = useThreadActions();
  const { isMobile, setOpenMobile } = useSidebar();
  const routeThreadRef = useParams({
    strict: false,
    select: (params) => resolveThreadRouteRef(params),
  });
  const routeDraftId = useParams({
    strict: false,
    select: (params) => (typeof params.draftId === "string" ? (params.draftId as DraftId) : null),
  });
  const routeThreadKey = routeThreadRef ? scopedThreadKey(routeThreadRef) : null;
  const routeDraftThread = routeDraftId ? (draftThreadsByThreadKey[routeDraftId] ?? null) : null;
  const routeDraftThreadKey = routeDraftThread
    ? scopedThreadKey(scopeThreadRef(routeDraftThread.environmentId, routeDraftThread.threadId))
    : null;
  const activeRouteThreadKey = routeThreadKey ?? routeDraftThreadKey;
  const keybindings = useServerKeybindings();
  const openAddProjectCommandPalette = useCommandPaletteStore((store) => store.openAddProject);
  const [expandedThreadListsByProject, setExpandedThreadListsByProject] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const { showThreadJumpHints, updateThreadJumpHintsVisibility } = useThreadJumpHintVisibility();
  const dragInProgressRef = useRef(false);
  const suppressProjectClickAfterDragRef = useRef(false);
  const suppressProjectClickForContextMenuRef = useRef(false);
  const [desktopUpdateState, setDesktopUpdateState] = useState<DesktopUpdateState | null>(null);
  const selectedThreadCount = useThreadSelectionStore((s) => s.selectedThreadKeys.size);
  const clearSelection = useThreadSelectionStore((s) => s.clearSelection);
  const setSelectionAnchor = useThreadSelectionStore((s) => s.setAnchor);
  const platform = navigator.platform;
  const shortcutModifiers = useShortcutModifierState();
  const modelPickerOpen = useModelPickerOpen();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const savedEnvironmentRegistry = useSavedEnvironmentRegistryStore((s) => s.byId);
  const savedEnvironmentRuntimeById = useSavedEnvironmentRuntimeStore((s) => s.byId);
  const orderedProjects = useMemo(() => {
    return orderItemsByPreferredIds({
      items: projects,
      preferredIds: projectOrder,
      getId: getProjectOrderKey,
    });
  }, [projectOrder, projects]);

  // Build a mapping from physical project key → logical project key for
  // cross-environment grouping.  Projects that share a repositoryIdentity
  // canonicalKey are treated as one logical project in the sidebar.
  const physicalToLogicalKey = useMemo(() => {
    return buildPhysicalToLogicalProjectKeyMap({
      projects: orderedProjects,
      settings: projectGroupingSettings,
    });
  }, [orderedProjects, projectGroupingSettings]);
  const projectPhysicalKeyByScopedRef = useMemo(
    () =>
      new Map(
        orderedProjects.map((project) => [
          scopedProjectKey(scopeProjectRef(project.environmentId, project.id)),
          derivePhysicalProjectKey(project),
        ]),
      ),
    [orderedProjects],
  );

  const sidebarProjects = useMemo<SidebarProjectSnapshot[]>(() => {
    return buildSidebarProjectSnapshots({
      projects: orderedProjects,
      settings: projectGroupingSettings,
      primaryEnvironmentId,
      resolveEnvironmentLabel: (environmentId) => {
        const rt = savedEnvironmentRuntimeById[environmentId];
        const saved = savedEnvironmentRegistry[environmentId];
        return rt?.descriptor?.label ?? saved?.label ?? null;
      },
    });
  }, [
    orderedProjects,
    projectGroupingSettings,
    primaryEnvironmentId,
    savedEnvironmentRegistry,
    savedEnvironmentRuntimeById,
  ]);

  const sidebarProjectByKey = useMemo(
    () => new Map(sidebarProjects.map((project) => [project.projectKey, project] as const)),
    [sidebarProjects],
  );
  const sidebarThreadByKey = useMemo(
    () =>
      new Map(
        sidebarThreads.map(
          (thread) =>
            [scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)), thread] as const,
        ),
      ),
    [sidebarThreads],
  );
  // Resolve the active route's project key to a logical key so it matches the
  // sidebar's grouped project entries.
  const activeRouteProjectKey = useMemo(() => {
    if (!activeRouteThreadKey) {
      return null;
    }
    const activeThread =
      sidebarThreadByKey.get(activeRouteThreadKey) ??
      (routeDraftThread
        ? ({
            environmentId: routeDraftThread.environmentId,
            projectId: routeDraftThread.projectId,
          } as Pick<SidebarThreadSummary, "environmentId" | "projectId">)
        : null);
    if (!activeThread) return null;
    const physicalKey =
      projectPhysicalKeyByScopedRef.get(
        scopedProjectKey(scopeProjectRef(activeThread.environmentId, activeThread.projectId)),
      ) ?? scopedProjectKey(scopeProjectRef(activeThread.environmentId, activeThread.projectId));
    return physicalToLogicalKey.get(physicalKey) ?? physicalKey;
  }, [
    activeRouteThreadKey,
    routeDraftThread,
    sidebarThreadByKey,
    physicalToLogicalKey,
    projectPhysicalKeyByScopedRef,
  ]);

  // Group threads by logical project key so all threads from grouped projects
  // are displayed together.
  const threadsByProjectKey = useMemo(() => {
    const next = new Map<string, SidebarThreadSummary[]>();
    for (const thread of sidebarThreads) {
      const physicalKey =
        projectPhysicalKeyByScopedRef.get(
          scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
        ) ?? scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      const logicalKey = physicalToLogicalKey.get(physicalKey) ?? physicalKey;
      const existing = next.get(logicalKey);
      if (existing) {
        existing.push(thread);
      } else {
        next.set(logicalKey, [thread]);
      }
    }
    return next;
  }, [sidebarThreads, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);
  const worktreesByProjectKey = useMemo(() => {
    const next = new Map<string, typeof sidebarWorktrees>();
    for (const worktree of sidebarWorktrees) {
      const physicalKey =
        projectPhysicalKeyByScopedRef.get(
          scopedProjectKey(scopeProjectRef(worktree.environmentId, worktree.projectId)),
        ) ?? scopedProjectKey(scopeProjectRef(worktree.environmentId, worktree.projectId));
      const logicalKey = physicalToLogicalKey.get(physicalKey) ?? physicalKey;
      const existing = next.get(logicalKey);
      if (existing) {
        existing.push(worktree);
      } else {
        next.set(logicalKey, [worktree]);
      }
    }
    return next;
  }, [sidebarWorktrees, physicalToLogicalKey, projectPhysicalKeyByScopedRef]);
  const getCurrentSidebarShortcutContext = useCallback(
    () => ({
      terminalFocus: isTerminalFocused(),
      terminalOpen: routeThreadRef
        ? selectThreadTerminalState(
            useTerminalStateStore.getState().terminalStateByThreadKey,
            routeThreadRef,
          ).terminalOpen
        : false,
      modelPickerOpen,
    }),
    [modelPickerOpen, routeThreadRef],
  );
  const newThreadShortcutLabelOptions = useMemo(
    () => ({
      platform,
      context: {
        terminalFocus: false,
        terminalOpen: false,
      },
    }),
    [platform],
  );
  const newThreadShortcutLabel =
    shortcutLabelForCommand(keybindings, "chat.newLocal", newThreadShortcutLabelOptions) ??
    shortcutLabelForCommand(keybindings, "chat.new", newThreadShortcutLabelOptions);

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, navigate, setOpenMobile, setSelectionAnchor],
  );

  const projectDnDSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const projectCollisionDetection = useCallback<CollisionDetection>((args) => {
    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length > 0) {
      return pointerCollisions;
    }

    return closestCorners(args);
  }, []);

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (sidebarProjectSortOrder !== "manual") {
        dragInProgressRef.current = false;
        return;
      }
      dragInProgressRef.current = false;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeProject = sidebarProjects.find((project) => project.projectKey === active.id);
      const overProject = sidebarProjects.find((project) => project.projectKey === over.id);
      if (!activeProject || !overProject) return;
      const activeMemberKeys = activeProject.memberProjects.map(
        (member) => member.physicalProjectKey,
      );
      const overMemberKeys = overProject.memberProjects.map((member) => member.physicalProjectKey);
      reorderProjects(activeMemberKeys, overMemberKeys);
    },
    [sidebarProjectSortOrder, reorderProjects, sidebarProjects],
  );

  const handleProjectDragStart = useCallback(
    (_event: DragStartEvent) => {
      if (sidebarProjectSortOrder !== "manual") {
        return;
      }
      dragInProgressRef.current = true;
      suppressProjectClickAfterDragRef.current = true;
    },
    [sidebarProjectSortOrder],
  );

  const handleProjectDragCancel = useCallback((_event: DragCancelEvent) => {
    dragInProgressRef.current = false;
  }, []);

  const animatedProjectListsRef = useRef(new WeakSet<HTMLElement>());
  const attachProjectListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedProjectListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedProjectListsRef.current.add(node);
  }, []);

  const animatedThreadListsRef = useRef(new WeakSet<HTMLElement>());
  const attachThreadListAutoAnimateRef = useCallback((node: HTMLElement | null) => {
    if (!node || animatedThreadListsRef.current.has(node)) {
      return;
    }
    autoAnimate(node, SIDEBAR_LIST_ANIMATION_OPTIONS);
    animatedThreadListsRef.current.add(node);
  }, []);

  const visibleThreads = useMemo(
    () => sidebarThreads.filter((thread) => thread.archivedAt === null),
    [sidebarThreads],
  );
  const sortedProjects = useMemo(() => {
    const sortableProjects = sidebarProjects.map((project) => ({
      ...project,
      id: project.projectKey,
    }));
    const sortableThreads = visibleThreads.map((thread) => {
      const physicalKey =
        projectPhysicalKeyByScopedRef.get(
          scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId)),
        ) ?? scopedProjectKey(scopeProjectRef(thread.environmentId, thread.projectId));
      return {
        ...thread,
        projectId: (physicalToLogicalKey.get(physicalKey) ?? physicalKey) as ProjectId,
      };
    });
    return sortProjectsForSidebar(
      sortableProjects,
      sortableThreads,
      sidebarProjectSortOrder,
    ).flatMap((project) => {
      const resolvedProject = sidebarProjectByKey.get(project.id);
      return resolvedProject ? [resolvedProject] : [];
    });
  }, [
    sidebarProjectSortOrder,
    physicalToLogicalKey,
    projectPhysicalKeyByScopedRef,
    sidebarProjectByKey,
    sidebarProjects,
    visibleThreads,
  ]);
  const isManualProjectSorting = sidebarProjectSortOrder === "manual";
  const visibleSidebarThreadKeys = useMemo(
    () =>
      sortedProjects.flatMap((project) => {
        const projectThreads = sortThreads(
          threadsByProjectKey.get(project.projectKey) ?? [],
          sidebarThreadSortOrder,
        );
        const projectExpanded = projectExpandedById[project.projectKey] ?? true;
        const activeThreadKey = routeThreadKey ?? undefined;
        const pinnedCollapsedThreadKey =
          !projectExpanded && activeThreadKey
            ? projectThreads
                .filter((thread) => thread.archivedAt === null)
                .find(
                  (thread) =>
                    scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) ===
                    activeThreadKey,
                )
              ? activeThreadKey
              : null
            : null;
        if (!projectExpanded && !pinnedCollapsedThreadKey) {
          return [];
        }

        const treeInput = adaptProjectForSidebarTree({
          project,
          threads: projectThreads,
          worktrees: worktreesByProjectKey.get(project.projectKey) ?? [],
        });
        const treeProject = composeSidebarTree({
          nowMs: 0,
          projects: [treeInput.project],
          threads: treeInput.threads,
          worktrees: treeInput.worktrees,
        }).projects[0];
        if (!treeProject) {
          return [];
        }

        return treeProject.worktrees.flatMap((worktree) =>
          worktree.sessions
            .filter((thread) => thread.archivedAt === null)
            .map((thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)))
            .filter((threadKey) => projectExpanded || threadKey === pinnedCollapsedThreadKey),
        );
      }),
    [
      sidebarThreadSortOrder,
      projectExpandedById,
      routeThreadKey,
      sortedProjects,
      threadsByProjectKey,
      worktreesByProjectKey,
    ],
  );
  const threadJumpCommandByKey = useMemo(() => {
    const mapping = new Map<string, NonNullable<ReturnType<typeof threadJumpCommandForIndex>>>();
    for (const [visibleThreadIndex, threadKey] of visibleSidebarThreadKeys.entries()) {
      const jumpCommand = threadJumpCommandForIndex(visibleThreadIndex);
      if (!jumpCommand) {
        return mapping;
      }
      mapping.set(threadKey, jumpCommand);
    }

    return mapping;
  }, [visibleSidebarThreadKeys]);
  const threadJumpThreadKeys = useMemo(
    () => [...threadJumpCommandByKey.keys()],
    [threadJumpCommandByKey],
  );
  const sidebarShortcutContext = useMemo(
    () => ({
      terminalFocus: false,
      terminalOpen: routeThreadRef
        ? selectThreadTerminalState(
            useTerminalStateStore.getState().terminalStateByThreadKey,
            routeThreadRef,
          ).terminalOpen
        : false,
      modelPickerOpen,
    }),
    [modelPickerOpen, routeThreadRef],
  );
  const threadJumpLabelByKey = useMemo(
    () =>
      buildThreadJumpLabelMap({
        keybindings,
        platform,
        terminalOpen: sidebarShortcutContext.terminalOpen,
        threadJumpCommandByKey,
      }),
    [keybindings, platform, sidebarShortcutContext.terminalOpen, threadJumpCommandByKey],
  );
  const shouldShowThreadJumpHintsNow = shouldShowThreadJumpHintsForModifiers(
    shortcutModifiers,
    keybindings,
    {
      platform,
      context: sidebarShortcutContext,
    },
  );
  const visibleThreadJumpLabelByKey = showThreadJumpHints
    ? threadJumpLabelByKey
    : EMPTY_THREAD_JUMP_LABELS;
  const orderedSidebarThreadKeys = visibleSidebarThreadKeys;
  const prewarmedSidebarThreadKeys = useMemo(
    () => getSidebarThreadIdsToPrewarm(visibleSidebarThreadKeys),
    [visibleSidebarThreadKeys],
  );
  const prewarmedSidebarThreadRefs = useMemo(
    () =>
      prewarmedSidebarThreadKeys.flatMap((threadKey) => {
        const ref = parseScopedThreadKey(threadKey);
        return ref ? [ref] : [];
      }),
    [prewarmedSidebarThreadKeys],
  );

  useEffect(() => {
    const releases = prewarmedSidebarThreadRefs.map((ref) =>
      retainThreadDetailSubscription(ref.environmentId, ref.threadId),
    );

    return () => {
      for (const release of releases) {
        release();
      }
    };
  }, [prewarmedSidebarThreadRefs]);

  useEffect(() => {
    updateThreadJumpHintsVisibility(shouldShowThreadJumpHintsNow);
  }, [shouldShowThreadJumpHintsNow, updateThreadJumpHintsVisibility]);

  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const shortcutContext = getCurrentSidebarShortcutContext();

      if (event.defaultPrevented || event.repeat) {
        return;
      }

      const command = resolveShortcutCommand(event, keybindings, {
        platform,
        context: shortcutContext,
      });
      const traversalDirection = threadTraversalDirectionFromCommand(command);
      if (traversalDirection !== null) {
        const targetThreadKey = resolveAdjacentThreadId({
          threadIds: orderedSidebarThreadKeys,
          currentThreadId: routeThreadKey,
          direction: traversalDirection,
        });
        if (!targetThreadKey) {
          return;
        }
        const targetThread = sidebarThreadByKey.get(targetThreadKey);
        if (!targetThread) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
        return;
      }

      const jumpIndex = threadJumpIndexFromCommand(command ?? "");
      if (jumpIndex === null) {
        return;
      }

      const targetThreadKey = threadJumpThreadKeys[jumpIndex];
      if (!targetThreadKey) {
        return;
      }
      const targetThread = sidebarThreadByKey.get(targetThreadKey);
      if (!targetThread) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
    };

    window.addEventListener("keydown", onWindowKeyDown);

    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    getCurrentSidebarShortcutContext,
    keybindings,
    navigateToThread,
    orderedSidebarThreadKeys,
    platform,
    routeThreadKey,
    sidebarThreadByKey,
    threadJumpThreadKeys,
  ]);

  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      if (selectedThreadCount === 0) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!shouldClearThreadSelectionOnMouseDown(target)) return;
      clearSelection();
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [clearSelection, selectedThreadCount]);

  useEffect(() => {
    if (!isElectron) return;
    const bridge = window.desktopBridge;
    if (
      !bridge ||
      typeof bridge.getUpdateState !== "function" ||
      typeof bridge.onUpdateState !== "function"
    ) {
      return;
    }

    let disposed = false;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = bridge.onUpdateState((nextState) => {
      if (disposed) return;
      receivedSubscriptionUpdate = true;
      setDesktopUpdateState(nextState);
    });

    void bridge
      .getUpdateState()
      .then((nextState) => {
        if (disposed || receivedSubscriptionUpdate) return;
        setDesktopUpdateState(nextState);
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  const desktopUpdateButtonDisabled = isDesktopUpdateButtonDisabled(desktopUpdateState);
  const desktopUpdateButtonAction = desktopUpdateState
    ? resolveDesktopUpdateButtonAction(desktopUpdateState)
    : "none";
  const showArm64IntelBuildWarning =
    isElectron && shouldShowArm64IntelBuildWarning(desktopUpdateState);
  const arm64IntelBuildWarningDescription =
    desktopUpdateState && showArm64IntelBuildWarning
      ? getArm64IntelBuildWarningDescription(desktopUpdateState)
      : null;
  const commandPaletteShortcutLabel = shortcutLabelForCommand(
    keybindings,
    "commandPalette.toggle",
    newThreadShortcutLabelOptions,
  );
  const handleDesktopUpdateButtonClick = useCallback(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !desktopUpdateState) return;
    if (desktopUpdateButtonDisabled || desktopUpdateButtonAction === "none") return;

    if (desktopUpdateButtonAction === "download") {
      void bridge
        .downloadUpdate()
        .then((result) => {
          if (result.completed) {
            toastManager.add({
              type: "success",
              title: "Update downloaded",
              description: "Restart the app from the update button to install it.",
            });
          }
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not download update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not start update download",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        });
      return;
    }

    if (desktopUpdateButtonAction === "install") {
      const confirmed = window.confirm(
        getDesktopUpdateInstallConfirmationMessage(desktopUpdateState),
      );
      if (!confirmed) return;
      void bridge
        .installUpdate()
        .then((result) => {
          if (!shouldToastDesktopUpdateActionResult(result)) return;
          const actionError = getDesktopUpdateActionError(result);
          if (!actionError) return;
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: actionError,
            }),
          );
        })
        .catch((error) => {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not install update",
              description: error instanceof Error ? error.message : "An unexpected error occurred.",
            }),
          );
        });
    }
  }, [desktopUpdateButtonAction, desktopUpdateButtonDisabled, desktopUpdateState]);

  const expandThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (current.has(projectKey)) return current;
      const next = new Set(current);
      next.add(projectKey);
      return next;
    });
  }, []);

  const collapseThreadListForProject = useCallback((projectKey: string) => {
    setExpandedThreadListsByProject((current) => {
      if (!current.has(projectKey)) return current;
      const next = new Set(current);
      next.delete(projectKey);
      return next;
    });
  }, []);

  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />

      {isOnSettings ? (
        <SettingsSidebarNav pathname={pathname} />
      ) : (
        <>
          <SidebarProjectsContent
            showArm64IntelBuildWarning={showArm64IntelBuildWarning}
            arm64IntelBuildWarningDescription={arm64IntelBuildWarningDescription}
            desktopUpdateButtonAction={desktopUpdateButtonAction}
            desktopUpdateButtonDisabled={desktopUpdateButtonDisabled}
            handleDesktopUpdateButtonClick={handleDesktopUpdateButtonClick}
            projectSortOrder={sidebarProjectSortOrder}
            threadSortOrder={sidebarThreadSortOrder}
            projectGroupingMode={sidebarProjectGroupingMode}
            updateSettings={updateSettings}
            openAddProject={openAddProjectCommandPalette}
            isManualProjectSorting={isManualProjectSorting}
            projectDnDSensors={projectDnDSensors}
            projectCollisionDetection={projectCollisionDetection}
            handleProjectDragStart={handleProjectDragStart}
            handleProjectDragEnd={handleProjectDragEnd}
            handleProjectDragCancel={handleProjectDragCancel}
            handleNewThread={handleNewThread}
            archiveThread={archiveThread}
            deleteThread={deleteThread}
            sortedProjects={sortedProjects}
            expandedThreadListsByProject={expandedThreadListsByProject}
            activeRouteProjectKey={activeRouteProjectKey}
            routeThreadKey={activeRouteThreadKey}
            newThreadShortcutLabel={newThreadShortcutLabel}
            commandPaletteShortcutLabel={commandPaletteShortcutLabel}
            threadJumpLabelByKey={visibleThreadJumpLabelByKey}
            attachThreadListAutoAnimateRef={attachThreadListAutoAnimateRef}
            expandThreadListForProject={expandThreadListForProject}
            collapseThreadListForProject={collapseThreadListForProject}
            dragInProgressRef={dragInProgressRef}
            suppressProjectClickAfterDragRef={suppressProjectClickAfterDragRef}
            suppressProjectClickForContextMenuRef={suppressProjectClickForContextMenuRef}
            attachProjectListAutoAnimateRef={attachProjectListAutoAnimateRef}
            projectsLength={projects.length}
          />

          <SidebarSeparator />
          <SidebarChromeFooter />
        </>
      )}
    </>
  );
}
