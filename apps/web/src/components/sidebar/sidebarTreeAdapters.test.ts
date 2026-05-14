import { scopedThreadKey, scopeThreadRef } from "@ryco/client-runtime";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@ryco/contracts";
import { describe, expect, it } from "vitest";
import type { DraftThreadState } from "../../composerDraftStore";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import {
  adaptDraftThreadsForSidebarProject,
  adaptProjectForSidebarTree,
} from "./sidebarTreeAdapters";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-1");

describe("sidebarTreeAdapters", () => {
  it("adapts active draft sessions into placeholder sidebar tree rows", () => {
    const draftThread = makeDraftThread();
    const draftRows = adaptDraftThreadsForSidebarProject({
      draftThreadsByThreadKey: {
        "draft-1": draftThread,
      },
      project: makeSidebarProjectSnapshot(),
    });

    expect(draftRows).toHaveLength(1);
    expect(draftRows[0]).toMatchObject({
      archivedAt: null,
      branch: "feature/sidebar",
      draftId: "draft-1",
      id: draftThread.threadId,
      projectId: "environment-local:project-1",
      title: "Empty Session",
      worktreePath: "/repo/project-feature",
    });

    const treeInput = adaptProjectForSidebarTree({
      project: makeSidebarProjectSnapshot(),
      threads: draftRows,
      worktrees: [],
    });

    expect(
      treeInput.threads.map((thread) =>
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
      ),
    ).toEqual([scopedThreadKey(scopeThreadRef(environmentId, draftThread.threadId))]);
  });

  it("omits drafts that have already been promoted", () => {
    const draftRows = adaptDraftThreadsForSidebarProject({
      draftThreadsByThreadKey: {
        "draft-promoted": {
          ...makeDraftThread(),
          promotedTo: scopeThreadRef(environmentId, ThreadId.make("thread-promoted")),
        },
      },
      project: makeSidebarProjectSnapshot(),
    });

    expect(draftRows).toEqual([]);
  });
});

function makeDraftThread(overrides: Partial<DraftThreadState> = {}): DraftThreadState {
  return {
    branch: "feature/sidebar",
    createdAt: "2026-05-09T00:00:00.000Z",
    environmentId,
    envMode: "worktree",
    interactionMode: "default",
    logicalProjectKey: "environment-local:project-1",
    projectId,
    runtimeMode: "full-access",
    threadId: ThreadId.make("thread-draft"),
    worktreePath: "/repo/project-feature",
    ...overrides,
  };
}

function makeSidebarProjectSnapshot(): SidebarProjectSnapshot {
  return {
    id: projectId,
    environmentId,
    name: "Project",
    cwd: "/repo/project",
    repositoryIdentity: null,
    defaultModelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.4",
    },
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    scripts: [],
    displayName: "Project",
    environmentPresence: "local-only",
    groupedProjectCount: 1,
    memberProjectRefs: [{ environmentId, projectId }],
    memberProjects: [
      {
        id: projectId,
        environmentId,
        name: "Project",
        cwd: "/repo/project",
        repositoryIdentity: null,
        defaultModelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
        scripts: [],
        environmentLabel: null,
        physicalProjectKey: "environment-local:project-1",
      },
    ],
    projectKey: "environment-local:project-1",
    remoteEnvironmentLabels: [],
  };
}
