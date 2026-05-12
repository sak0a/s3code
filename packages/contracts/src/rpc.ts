import { Schema } from "effect";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";

import { OpenError, OpenInEditorInput } from "./editor.ts";
import { AuthAccessStreamEvent } from "./auth.ts";
import { ProjectId, ThreadId } from "./baseSchemas.ts";
import {
  FilesystemBrowseInput,
  FilesystemBrowseResult,
  FilesystemBrowseError,
} from "./filesystem.ts";
import {
  GitActionProgressEvent,
  VcsSwitchRefInput,
  VcsSwitchRefResult,
  GitCommandError,
  VcsCreateRefInput,
  VcsCreateRefResult,
  VcsCreateWorktreeInput,
  VcsCreateWorktreeResult,
  VcsInitInput,
  VcsListRefsInput,
  VcsListRefsResult,
  GitManagerServiceError,
  GitPreparePullRequestThreadInput,
  GitPreparePullRequestThreadResult,
  VcsPullInput,
  GitPullRequestRefInput,
  VcsPullResult,
  VcsRemoveWorktreeInput,
  GitResolvePullRequestResult,
  GitRunStackedActionInput,
  VcsStatusInput,
  VcsStatusResult,
  VcsStatusStreamEvent,
} from "./git.ts";
import { KeybindingsConfigError } from "./keybindings.ts";
import {
  McpListServersInput,
  McpListServersResult,
  McpListWorkspacesResult,
  McpOauthLoginInput,
  McpOauthLoginResult,
  McpServerEnabledInput,
  McpServerRemoveInput,
  McpServerUpsertInput,
  McpServersReloadInput,
  McpSettingsError,
} from "./mcp.ts";
import {
  ClientOrchestrationCommand,
  ORCHESTRATION_WS_METHODS,
  OrchestrationDispatchCommandError,
  OrchestrationGetFullThreadDiffError,
  OrchestrationGetFullThreadDiffInput,
  OrchestrationGetSnapshotError,
  OrchestrationGetTurnDiffError,
  OrchestrationGetTurnDiffInput,
  OrchestrationReplayEventsError,
  OrchestrationReplayEventsInput,
  OrchestrationRpcSchemas,
} from "./orchestration.ts";
import { ProviderInstanceId } from "./providerInstance.ts";
import {
  ProjectListEntriesError,
  ProjectListEntriesInput,
  ProjectListEntriesResult,
  ProjectReadFileError,
  ProjectReadFileInput,
  ProjectReadFileResult,
  ProjectSearchEntriesError,
  ProjectSearchEntriesInput,
  ProjectSearchEntriesResult,
  ProjectWriteFileError,
  ProjectWriteFileInput,
  ProjectWriteFileResult,
} from "./project.ts";
import {
  TerminalClearInput,
  TerminalCloseInput,
  TerminalError,
  TerminalEvent,
  TerminalOpenInput,
  TerminalResizeInput,
  TerminalRestartInput,
  TerminalSessionSnapshot,
  TerminalWriteInput,
} from "./terminal.ts";
import {
  ServerConfigStreamEvent,
  ServerConfig,
  ServerLifecycleStreamEvent,
  ServerProviderUpdatedPayload,
  ServerUpsertKeybindingInput,
  ServerUpsertKeybindingResult,
} from "./server.ts";
import { ServerSettings, ServerSettingsError, ServerSettingsPatch } from "./settings.ts";
import {
  SourceControlCloneRepositoryInput,
  SourceControlCloneRepositoryResult,
  SourceControlDiscoveryResult,
  SourceControlPublishRepositoryInput,
  SourceControlPublishRepositoryResult,
  SourceControlRepositoryError,
  SourceControlRepositoryInfo,
  SourceControlRepositoryLookupInput,
  ChangeRequest,
  SourceControlChangeRequestDetail,
  SourceControlIssueDetail,
  SourceControlIssueSummary,
  SourceControlProviderError,
} from "./sourceControl.ts";
import { VcsError } from "./vcs.ts";
import {
  CreateWorktreeIntent,
  StatusBucket,
  WorktreeCheckoutLocation,
  WorktreeId,
} from "./worktree.ts";

export const WS_METHODS = {
  // Project registry methods
  projectsList: "projects.list",
  projectsAdd: "projects.add",
  projectsRemove: "projects.remove",
  projectsListEntries: "projects.listEntries",
  projectsSearchEntries: "projects.searchEntries",
  projectsReadFile: "projects.readFile",
  projectsWriteFile: "projects.writeFile",

  // Shell methods
  shellOpenInEditor: "shell.openInEditor",

  // Filesystem methods
  filesystemBrowse: "filesystem.browse",

  // VCS methods
  vcsPull: "vcs.pull",
  vcsRefreshStatus: "vcs.refreshStatus",
  vcsListRefs: "vcs.listRefs",
  vcsCreateWorktree: "vcs.createWorktree",
  vcsRemoveWorktree: "vcs.removeWorktree",
  vcsCreateRef: "vcs.createRef",
  vcsSwitchRef: "vcs.switchRef",
  vcsInit: "vcs.init",

  // Git workflow methods
  gitRunStackedAction: "git.runStackedAction",
  gitResolvePullRequest: "git.resolvePullRequest",
  gitPreparePullRequestThread: "git.preparePullRequestThread",
  gitCreateWorktreeForProject: "git.createWorktreeForProject",
  gitFindWorktreeForOrigin: "git.findWorktreeForOrigin",
  gitArchiveWorktree: "git.archiveWorktree",
  gitRestoreWorktree: "git.restoreWorktree",
  gitDeleteWorktree: "git.deleteWorktree",

  // Sidebar hierarchy methods
  threadsSetManualBucket: "threads.setManualBucket",
  threadsSetManualPosition: "threads.setManualPosition",
  worktreesSetManualPosition: "worktrees.setManualPosition",
  projectsInitializeGit: "projects.initializeGit",

  // Terminal methods
  terminalOpen: "terminal.open",
  terminalWrite: "terminal.write",
  terminalResize: "terminal.resize",
  terminalClear: "terminal.clear",
  terminalRestart: "terminal.restart",
  terminalClose: "terminal.close",

  // Server meta
  serverGetConfig: "server.getConfig",
  serverRefreshProviders: "server.refreshProviders",
  serverUpsertKeybinding: "server.upsertKeybinding",
  serverGetSettings: "server.getSettings",
  serverUpdateSettings: "server.updateSettings",
  serverDiscoverSourceControl: "server.discoverSourceControl",

  // MCP settings methods
  mcpListWorkspaces: "mcp.listWorkspaces",
  mcpListServers: "mcp.listServers",
  mcpUpsertServer: "mcp.upsertServer",
  mcpSetServerEnabled: "mcp.setServerEnabled",
  mcpRemoveServer: "mcp.removeServer",
  mcpReloadServers: "mcp.reloadServers",
  mcpStartOauthLogin: "mcp.startOauthLogin",

  // Source control methods
  sourceControlLookupRepository: "sourceControl.lookupRepository",
  sourceControlCloneRepository: "sourceControl.cloneRepository",
  sourceControlPublishRepository: "sourceControl.publishRepository",
  sourceControlListIssues: "sourceControl.listIssues",
  sourceControlGetIssue: "sourceControl.getIssue",
  sourceControlSearchIssues: "sourceControl.searchIssues",
  sourceControlSearchChangeRequests: "sourceControl.searchChangeRequests",
  sourceControlGetChangeRequestDetail: "sourceControl.getChangeRequestDetail",
  sourceControlGetChangeRequestDiff: "sourceControl.getChangeRequestDiff",

  // Streaming subscriptions
  subscribeVcsStatus: "subscribeVcsStatus",
  subscribeTerminalEvents: "subscribeTerminalEvents",
  subscribeServerConfig: "subscribeServerConfig",
  subscribeServerLifecycle: "subscribeServerLifecycle",
  subscribeAuthAccess: "subscribeAuthAccess",
} as const;

export const GitCreateWorktreeForProjectInput = Schema.Struct({
  projectId: ProjectId,
  intent: CreateWorktreeIntent,
  // "projectMetadata" preserves the legacy project-local checkout location.
  // New worktrees should use the default app-managed location.
  worktreeLocation: Schema.optional(WorktreeCheckoutLocation),
});
export type GitCreateWorktreeForProjectInput = typeof GitCreateWorktreeForProjectInput.Type;

export const GitCreateWorktreeForProjectOutput = Schema.Struct({
  worktreeId: WorktreeId,
  sessionId: ThreadId,
});
export type GitCreateWorktreeForProjectOutput = typeof GitCreateWorktreeForProjectOutput.Type;

export const GitFindWorktreeForOriginInput = Schema.Struct({
  projectId: ProjectId,
  kind: Schema.Literals(["pr", "issue"]),
  number: Schema.Number,
});
export type GitFindWorktreeForOriginInput = typeof GitFindWorktreeForOriginInput.Type;

export const GitFindWorktreeForOriginOutput = Schema.NullOr(WorktreeId);
export type GitFindWorktreeForOriginOutput = typeof GitFindWorktreeForOriginOutput.Type;

export const GitArchiveWorktreeInput = Schema.Struct({
  worktreeId: WorktreeId,
  deleteBranch: Schema.Boolean,
});
export type GitArchiveWorktreeInput = typeof GitArchiveWorktreeInput.Type;

export const GitRestoreWorktreeInput = Schema.Struct({
  worktreeId: WorktreeId,
});
export type GitRestoreWorktreeInput = typeof GitRestoreWorktreeInput.Type;

export const GitDeleteWorktreeInput = Schema.Struct({
  worktreeId: WorktreeId,
  deleteBranch: Schema.Boolean,
  force: Schema.optional(Schema.Boolean),
});
export type GitDeleteWorktreeInput = typeof GitDeleteWorktreeInput.Type;

export const ThreadsSetManualBucketInput = Schema.Struct({
  threadId: ThreadId,
  bucket: Schema.NullOr(StatusBucket),
});
export type ThreadsSetManualBucketInput = typeof ThreadsSetManualBucketInput.Type;

export const ThreadsSetManualPositionInput = Schema.Struct({
  threadId: ThreadId,
  position: Schema.Number,
});
export type ThreadsSetManualPositionInput = typeof ThreadsSetManualPositionInput.Type;

export const WorktreesSetManualPositionInput = Schema.Struct({
  worktreeId: WorktreeId,
  position: Schema.Number,
});
export type WorktreesSetManualPositionInput = typeof WorktreesSetManualPositionInput.Type;

export const ProjectsInitializeGitInput = Schema.Struct({
  projectId: ProjectId,
});
export type ProjectsInitializeGitInput = typeof ProjectsInitializeGitInput.Type;

export const EmptyRpcResult = Schema.Struct({});
export type EmptyRpcResult = typeof EmptyRpcResult.Type;

export const WsServerUpsertKeybindingRpc = Rpc.make(WS_METHODS.serverUpsertKeybinding, {
  payload: ServerUpsertKeybindingInput,
  success: ServerUpsertKeybindingResult,
  error: KeybindingsConfigError,
});

export const WsServerGetConfigRpc = Rpc.make(WS_METHODS.serverGetConfig, {
  payload: Schema.Struct({}),
  success: ServerConfig,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
});

export const WsServerRefreshProvidersRpc = Rpc.make(WS_METHODS.serverRefreshProviders, {
  payload: Schema.Struct({
    /**
     * When supplied, only refresh this specific provider instance. When
     * omitted, refresh all configured instances — the legacy `refresh()`
     * behaviour retained for transports that still dispatch untargeted
     * refreshes.
     */
    instanceId: Schema.optional(ProviderInstanceId),
  }),
  success: ServerProviderUpdatedPayload,
});

export const WsServerGetSettingsRpc = Rpc.make(WS_METHODS.serverGetSettings, {
  payload: Schema.Struct({}),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerUpdateSettingsRpc = Rpc.make(WS_METHODS.serverUpdateSettings, {
  payload: Schema.Struct({ patch: ServerSettingsPatch }),
  success: ServerSettings,
  error: ServerSettingsError,
});

export const WsServerDiscoverSourceControlRpc = Rpc.make(WS_METHODS.serverDiscoverSourceControl, {
  payload: Schema.Struct({}),
  success: SourceControlDiscoveryResult,
});

export const WsMcpListWorkspacesRpc = Rpc.make(WS_METHODS.mcpListWorkspaces, {
  payload: Schema.Struct({}),
  success: McpListWorkspacesResult,
  error: McpSettingsError,
});

export const WsMcpListServersRpc = Rpc.make(WS_METHODS.mcpListServers, {
  payload: McpListServersInput,
  success: McpListServersResult,
  error: McpSettingsError,
});

export const WsMcpUpsertServerRpc = Rpc.make(WS_METHODS.mcpUpsertServer, {
  payload: McpServerUpsertInput,
  success: McpListServersResult,
  error: McpSettingsError,
});

export const WsMcpSetServerEnabledRpc = Rpc.make(WS_METHODS.mcpSetServerEnabled, {
  payload: McpServerEnabledInput,
  success: McpListServersResult,
  error: McpSettingsError,
});

export const WsMcpRemoveServerRpc = Rpc.make(WS_METHODS.mcpRemoveServer, {
  payload: McpServerRemoveInput,
  success: McpListServersResult,
  error: McpSettingsError,
});

export const WsMcpReloadServersRpc = Rpc.make(WS_METHODS.mcpReloadServers, {
  payload: McpServersReloadInput,
  success: McpListServersResult,
  error: McpSettingsError,
});

export const WsMcpStartOauthLoginRpc = Rpc.make(WS_METHODS.mcpStartOauthLogin, {
  payload: McpOauthLoginInput,
  success: McpOauthLoginResult,
  error: McpSettingsError,
});

export const WsSourceControlLookupRepositoryRpc = Rpc.make(
  WS_METHODS.sourceControlLookupRepository,
  {
    payload: SourceControlRepositoryLookupInput,
    success: SourceControlRepositoryInfo,
    error: SourceControlRepositoryError,
  },
);

export const WsSourceControlCloneRepositoryRpc = Rpc.make(WS_METHODS.sourceControlCloneRepository, {
  payload: SourceControlCloneRepositoryInput,
  success: SourceControlCloneRepositoryResult,
  error: SourceControlRepositoryError,
});

export const WsSourceControlPublishRepositoryRpc = Rpc.make(
  WS_METHODS.sourceControlPublishRepository,
  {
    payload: SourceControlPublishRepositoryInput,
    success: SourceControlPublishRepositoryResult,
    error: SourceControlRepositoryError,
  },
);

export const WsSourceControlListIssuesRpc = Rpc.make(WS_METHODS.sourceControlListIssues, {
  payload: Schema.Struct({
    cwd: Schema.String,
    state: Schema.Literals(["open", "closed", "all"]),
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(SourceControlIssueSummary),
  error: SourceControlProviderError,
});

export const WsSourceControlGetIssueRpc = Rpc.make(WS_METHODS.sourceControlGetIssue, {
  payload: Schema.Struct({
    cwd: Schema.String,
    reference: Schema.String,
    fullContent: Schema.optional(Schema.Boolean),
  }),
  success: SourceControlIssueDetail,
  error: SourceControlProviderError,
});

export const WsSourceControlSearchIssuesRpc = Rpc.make(WS_METHODS.sourceControlSearchIssues, {
  payload: Schema.Struct({
    cwd: Schema.String,
    query: Schema.String,
    limit: Schema.optional(Schema.Number),
  }),
  success: Schema.Array(SourceControlIssueSummary),
  error: SourceControlProviderError,
});

export const WsSourceControlSearchChangeRequestsRpc = Rpc.make(
  WS_METHODS.sourceControlSearchChangeRequests,
  {
    payload: Schema.Struct({
      cwd: Schema.String,
      query: Schema.String,
      limit: Schema.optional(Schema.Number),
    }),
    success: Schema.Array(ChangeRequest),
    error: SourceControlProviderError,
  },
);

export const WsSourceControlGetChangeRequestDetailRpc = Rpc.make(
  WS_METHODS.sourceControlGetChangeRequestDetail,
  {
    payload: Schema.Struct({
      cwd: Schema.String,
      reference: Schema.String,
      fullContent: Schema.optional(Schema.Boolean),
    }),
    success: SourceControlChangeRequestDetail,
    error: SourceControlProviderError,
  },
);

export const WsSourceControlGetChangeRequestDiffRpc = Rpc.make(
  WS_METHODS.sourceControlGetChangeRequestDiff,
  {
    payload: Schema.Struct({
      cwd: Schema.String,
      reference: Schema.String,
    }),
    success: Schema.String,
    error: SourceControlProviderError,
  },
);

export const WsProjectsSearchEntriesRpc = Rpc.make(WS_METHODS.projectsSearchEntries, {
  payload: ProjectSearchEntriesInput,
  success: ProjectSearchEntriesResult,
  error: ProjectSearchEntriesError,
});

export const WsProjectsListEntriesRpc = Rpc.make(WS_METHODS.projectsListEntries, {
  payload: ProjectListEntriesInput,
  success: ProjectListEntriesResult,
  error: ProjectListEntriesError,
});

export const WsProjectsReadFileRpc = Rpc.make(WS_METHODS.projectsReadFile, {
  payload: ProjectReadFileInput,
  success: ProjectReadFileResult,
  error: ProjectReadFileError,
});

export const WsProjectsWriteFileRpc = Rpc.make(WS_METHODS.projectsWriteFile, {
  payload: ProjectWriteFileInput,
  success: ProjectWriteFileResult,
  error: ProjectWriteFileError,
});

export const WsShellOpenInEditorRpc = Rpc.make(WS_METHODS.shellOpenInEditor, {
  payload: OpenInEditorInput,
  error: OpenError,
});

export const WsFilesystemBrowseRpc = Rpc.make(WS_METHODS.filesystemBrowse, {
  payload: FilesystemBrowseInput,
  success: FilesystemBrowseResult,
  error: FilesystemBrowseError,
});

export const WsSubscribeVcsStatusRpc = Rpc.make(WS_METHODS.subscribeVcsStatus, {
  payload: VcsStatusInput,
  success: VcsStatusStreamEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsVcsPullRpc = Rpc.make(WS_METHODS.vcsPull, {
  payload: VcsPullInput,
  success: VcsPullResult,
  error: GitCommandError,
});

export const WsVcsRefreshStatusRpc = Rpc.make(WS_METHODS.vcsRefreshStatus, {
  payload: VcsStatusInput,
  success: VcsStatusResult,
  error: GitManagerServiceError,
});

export const WsGitRunStackedActionRpc = Rpc.make(WS_METHODS.gitRunStackedAction, {
  payload: GitRunStackedActionInput,
  success: GitActionProgressEvent,
  error: GitManagerServiceError,
  stream: true,
});

export const WsGitResolvePullRequestRpc = Rpc.make(WS_METHODS.gitResolvePullRequest, {
  payload: GitPullRequestRefInput,
  success: GitResolvePullRequestResult,
  error: GitManagerServiceError,
});

export const WsGitPreparePullRequestThreadRpc = Rpc.make(WS_METHODS.gitPreparePullRequestThread, {
  payload: GitPreparePullRequestThreadInput,
  success: GitPreparePullRequestThreadResult,
  error: GitManagerServiceError,
});

export const WsGitCreateWorktreeForProjectRpc = Rpc.make(WS_METHODS.gitCreateWorktreeForProject, {
  payload: GitCreateWorktreeForProjectInput,
  success: GitCreateWorktreeForProjectOutput,
  error: GitManagerServiceError,
});

export const WsGitFindWorktreeForOriginRpc = Rpc.make(WS_METHODS.gitFindWorktreeForOrigin, {
  payload: GitFindWorktreeForOriginInput,
  success: GitFindWorktreeForOriginOutput,
  error: GitManagerServiceError,
});

export const WsGitArchiveWorktreeRpc = Rpc.make(WS_METHODS.gitArchiveWorktree, {
  payload: GitArchiveWorktreeInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsGitRestoreWorktreeRpc = Rpc.make(WS_METHODS.gitRestoreWorktree, {
  payload: GitRestoreWorktreeInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsGitDeleteWorktreeRpc = Rpc.make(WS_METHODS.gitDeleteWorktree, {
  payload: GitDeleteWorktreeInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsThreadsSetManualBucketRpc = Rpc.make(WS_METHODS.threadsSetManualBucket, {
  payload: ThreadsSetManualBucketInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsThreadsSetManualPositionRpc = Rpc.make(WS_METHODS.threadsSetManualPosition, {
  payload: ThreadsSetManualPositionInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsWorktreesSetManualPositionRpc = Rpc.make(WS_METHODS.worktreesSetManualPosition, {
  payload: WorktreesSetManualPositionInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsProjectsInitializeGitRpc = Rpc.make(WS_METHODS.projectsInitializeGit, {
  payload: ProjectsInitializeGitInput,
  success: EmptyRpcResult,
  error: GitManagerServiceError,
});

export const WsVcsListRefsRpc = Rpc.make(WS_METHODS.vcsListRefs, {
  payload: VcsListRefsInput,
  success: VcsListRefsResult,
  error: GitCommandError,
});

export const WsVcsCreateWorktreeRpc = Rpc.make(WS_METHODS.vcsCreateWorktree, {
  payload: VcsCreateWorktreeInput,
  success: VcsCreateWorktreeResult,
  error: GitCommandError,
});

export const WsVcsRemoveWorktreeRpc = Rpc.make(WS_METHODS.vcsRemoveWorktree, {
  payload: VcsRemoveWorktreeInput,
  error: GitCommandError,
});

export const WsVcsCreateRefRpc = Rpc.make(WS_METHODS.vcsCreateRef, {
  payload: VcsCreateRefInput,
  success: VcsCreateRefResult,
  error: GitCommandError,
});

export const WsVcsSwitchRefRpc = Rpc.make(WS_METHODS.vcsSwitchRef, {
  payload: VcsSwitchRefInput,
  success: VcsSwitchRefResult,
  error: GitCommandError,
});

export const WsVcsInitRpc = Rpc.make(WS_METHODS.vcsInit, {
  payload: VcsInitInput,
  error: VcsError,
});

export const WsTerminalOpenRpc = Rpc.make(WS_METHODS.terminalOpen, {
  payload: TerminalOpenInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalWriteRpc = Rpc.make(WS_METHODS.terminalWrite, {
  payload: TerminalWriteInput,
  error: TerminalError,
});

export const WsTerminalResizeRpc = Rpc.make(WS_METHODS.terminalResize, {
  payload: TerminalResizeInput,
  error: TerminalError,
});

export const WsTerminalClearRpc = Rpc.make(WS_METHODS.terminalClear, {
  payload: TerminalClearInput,
  error: TerminalError,
});

export const WsTerminalRestartRpc = Rpc.make(WS_METHODS.terminalRestart, {
  payload: TerminalRestartInput,
  success: TerminalSessionSnapshot,
  error: TerminalError,
});

export const WsTerminalCloseRpc = Rpc.make(WS_METHODS.terminalClose, {
  payload: TerminalCloseInput,
  error: TerminalError,
});

export const WsOrchestrationDispatchCommandRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.dispatchCommand,
  {
    payload: ClientOrchestrationCommand,
    success: OrchestrationRpcSchemas.dispatchCommand.output,
    error: OrchestrationDispatchCommandError,
  },
);

export const WsOrchestrationGetTurnDiffRpc = Rpc.make(ORCHESTRATION_WS_METHODS.getTurnDiff, {
  payload: OrchestrationGetTurnDiffInput,
  success: OrchestrationRpcSchemas.getTurnDiff.output,
  error: OrchestrationGetTurnDiffError,
});

export const WsOrchestrationGetFullThreadDiffRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.getFullThreadDiff,
  {
    payload: OrchestrationGetFullThreadDiffInput,
    success: OrchestrationRpcSchemas.getFullThreadDiff.output,
    error: OrchestrationGetFullThreadDiffError,
  },
);

export const WsOrchestrationReplayEventsRpc = Rpc.make(ORCHESTRATION_WS_METHODS.replayEvents, {
  payload: OrchestrationReplayEventsInput,
  success: OrchestrationRpcSchemas.replayEvents.output,
  error: OrchestrationReplayEventsError,
});

export const WsOrchestrationSubscribeShellRpc = Rpc.make(ORCHESTRATION_WS_METHODS.subscribeShell, {
  payload: OrchestrationRpcSchemas.subscribeShell.input,
  success: OrchestrationRpcSchemas.subscribeShell.output,
  error: OrchestrationGetSnapshotError,
  stream: true,
});

export const WsOrchestrationSubscribeThreadRpc = Rpc.make(
  ORCHESTRATION_WS_METHODS.subscribeThread,
  {
    payload: OrchestrationRpcSchemas.subscribeThread.input,
    success: OrchestrationRpcSchemas.subscribeThread.output,
    error: OrchestrationGetSnapshotError,
    stream: true,
  },
);

export const WsSubscribeTerminalEventsRpc = Rpc.make(WS_METHODS.subscribeTerminalEvents, {
  payload: Schema.Struct({}),
  success: TerminalEvent,
  stream: true,
});

export const WsSubscribeServerConfigRpc = Rpc.make(WS_METHODS.subscribeServerConfig, {
  payload: Schema.Struct({}),
  success: ServerConfigStreamEvent,
  error: Schema.Union([KeybindingsConfigError, ServerSettingsError]),
  stream: true,
});

export const WsSubscribeServerLifecycleRpc = Rpc.make(WS_METHODS.subscribeServerLifecycle, {
  payload: Schema.Struct({}),
  success: ServerLifecycleStreamEvent,
  stream: true,
});

export const WsSubscribeAuthAccessRpc = Rpc.make(WS_METHODS.subscribeAuthAccess, {
  payload: Schema.Struct({}),
  success: AuthAccessStreamEvent,
  stream: true,
});

export const WsRpcGroup = RpcGroup.make(
  WsServerGetConfigRpc,
  WsServerRefreshProvidersRpc,
  WsServerUpsertKeybindingRpc,
  WsServerGetSettingsRpc,
  WsServerUpdateSettingsRpc,
  WsServerDiscoverSourceControlRpc,
  WsMcpListWorkspacesRpc,
  WsMcpListServersRpc,
  WsMcpUpsertServerRpc,
  WsMcpSetServerEnabledRpc,
  WsMcpRemoveServerRpc,
  WsMcpReloadServersRpc,
  WsMcpStartOauthLoginRpc,
  WsSourceControlLookupRepositoryRpc,
  WsSourceControlCloneRepositoryRpc,
  WsSourceControlPublishRepositoryRpc,
  WsSourceControlListIssuesRpc,
  WsSourceControlGetIssueRpc,
  WsSourceControlSearchIssuesRpc,
  WsSourceControlSearchChangeRequestsRpc,
  WsSourceControlGetChangeRequestDetailRpc,
  WsSourceControlGetChangeRequestDiffRpc,
  WsProjectsListEntriesRpc,
  WsProjectsSearchEntriesRpc,
  WsProjectsReadFileRpc,
  WsProjectsWriteFileRpc,
  WsShellOpenInEditorRpc,
  WsFilesystemBrowseRpc,
  WsSubscribeVcsStatusRpc,
  WsVcsPullRpc,
  WsVcsRefreshStatusRpc,
  WsGitRunStackedActionRpc,
  WsGitResolvePullRequestRpc,
  WsGitPreparePullRequestThreadRpc,
  WsGitCreateWorktreeForProjectRpc,
  WsGitFindWorktreeForOriginRpc,
  WsGitArchiveWorktreeRpc,
  WsGitRestoreWorktreeRpc,
  WsGitDeleteWorktreeRpc,
  WsThreadsSetManualBucketRpc,
  WsThreadsSetManualPositionRpc,
  WsWorktreesSetManualPositionRpc,
  WsProjectsInitializeGitRpc,
  WsVcsListRefsRpc,
  WsVcsCreateWorktreeRpc,
  WsVcsRemoveWorktreeRpc,
  WsVcsCreateRefRpc,
  WsVcsSwitchRefRpc,
  WsVcsInitRpc,
  WsTerminalOpenRpc,
  WsTerminalWriteRpc,
  WsTerminalResizeRpc,
  WsTerminalClearRpc,
  WsTerminalRestartRpc,
  WsTerminalCloseRpc,
  WsSubscribeTerminalEventsRpc,
  WsSubscribeServerConfigRpc,
  WsSubscribeServerLifecycleRpc,
  WsSubscribeAuthAccessRpc,
  WsOrchestrationDispatchCommandRpc,
  WsOrchestrationGetTurnDiffRpc,
  WsOrchestrationGetFullThreadDiffRpc,
  WsOrchestrationReplayEventsRpc,
  WsOrchestrationSubscribeShellRpc,
  WsOrchestrationSubscribeThreadRpc,
);
