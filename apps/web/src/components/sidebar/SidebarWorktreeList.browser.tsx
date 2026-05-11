import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@s3tools/contracts";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_INTERACTION_MODE } from "../../types";
import type { SidebarTreeProject, SidebarTreeThread } from "./hooks/useSidebarTree";
import { SidebarWorktreeList } from "./SidebarWorktreeList";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-1");

describe("SidebarWorktreeList", () => {
  it("renders worktree sections collapsed by default and expands them on demand", async () => {
    await render(
      <SidebarWorktreeList
        attachThreadListAutoAnimateRef={() => undefined}
        projectExpanded
        renderThread={(thread) => <div>{thread.title}</div>}
        treeProject={makeTreeProject()}
        visibleThreadKeys={null}
        onArchiveWorktree={vi.fn()}
        onCopyWorktreePath={vi.fn()}
        onDeleteWorktree={vi.fn()}
        onNewSession={vi.fn()}
        onOpenInEditor={vi.fn()}
        onOpenWorktree={vi.fn()}
        onRenameWorktree={vi.fn()}
        onRestoreWorktree={vi.fn()}
      />,
    );

    expect(document.body.textContent).toContain("main");
    expect(document.body.textContent).not.toContain("Release checklist");

    await page.getByRole("button", { name: "Expand main", exact: true }).click();

    await expect.element(page.getByText("Release checklist")).toBeInTheDocument();
  });
});

function makeTreeProject(): SidebarTreeProject {
  const thread = makeThread();
  return {
    archivedSessions: [],
    archivedWorktrees: [],
    flatSessions: [],
    isGitRepo: true,
    project: {
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
    },
    worktrees: [
      {
        aggregateStatus: "idle",
        archivedSessions: [],
        buckets: {
          done: [],
          idle: [thread],
          in_progress: [],
          review: [],
        },
        diffStats: null,
        sessions: [thread],
        shouldSuggestArchive: false,
        worktree: {
          worktreeId: "worktree-main",
          projectId,
          branch: "main",
          worktreePath: null,
          origin: "main",
          archivedAt: null,
          manualPosition: 0,
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      },
    ],
  };
}

function makeThread(): SidebarTreeThread {
  return {
    id: ThreadId.make("thread-1"),
    environmentId,
    projectId,
    title: "Release checklist",
    interactionMode: DEFAULT_INTERACTION_MODE,
    session: null,
    createdAt: "2026-05-01T00:00:00.000Z",
    archivedAt: null,
    updatedAt: "2026-05-01T00:00:00.000Z",
    latestTurn: null,
    branch: "main",
    worktreePath: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    manualStatusBucket: null,
    statusPill: null,
    worktreeId: "worktree-main",
  };
}
