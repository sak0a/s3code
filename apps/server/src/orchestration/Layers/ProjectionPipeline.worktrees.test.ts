import { CommandId, EventId, ProjectId, WorktreeId } from "@ryco/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { ProjectionWorktreeRepositoryLive } from "../../persistence/Layers/ProjectionWorktrees.ts";
import { ProjectionWorktreeRepository } from "../../persistence/Services/ProjectionWorktrees.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import { ProjectAvatarStore } from "../../project/Services/ProjectAvatarStore.ts";
import { ServerConfig } from "../../config.ts";
import {
  ORCHESTRATION_PROJECTOR_NAMES,
  OrchestrationProjectionPipelineLive,
} from "./ProjectionPipeline.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";

const MockProjectAvatarStoreLive = Layer.succeed(ProjectAvatarStore, {
  write: () => Effect.die("ProjectAvatarStore.write not implemented in test"),
  read: () => Effect.succeed(null),
  remove: () => Effect.void,
});

const layer = it.layer(
  OrchestrationProjectionPipelineLive.pipe(
    Layer.provideMerge(OrchestrationEventStoreLive),
    Layer.provideMerge(ProjectionWorktreeRepositoryLive),
    Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "s3-worktree-proj-" })),
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(MockProjectAvatarStoreLive),
    Layer.provideMerge(NodeServices.layer),
  ),
);

layer("OrchestrationProjectionPipeline worktrees", (it) => {
  it.effect("projects worktree lifecycle events", () =>
    Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const projectionPipeline = yield* OrchestrationProjectionPipeline;
      const worktrees = yield* ProjectionWorktreeRepository;
      const now = "2026-05-08T00:00:00.000Z";
      const archivedAt = "2026-05-09T00:00:00.000Z";
      const worktreeId = WorktreeId.make("worktree-pipeline");

      const created = yield* eventStore.append({
        type: "worktree.created",
        eventId: EventId.make("evt-worktree-created"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-worktree"),
        occurredAt: now,
        commandId: CommandId.make("cmd-worktree-created"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-worktree-created"),
        metadata: {},
        payload: {
          worktreeId,
          projectId: ProjectId.make("project-worktree"),
          branch: "main",
          worktreePath: null,
          origin: "main",
          prNumber: null,
          issueNumber: null,
          prTitle: null,
          issueTitle: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      yield* projectionPipeline.projectEvent(created);
      const createdRow = yield* worktrees.getById({ worktreeId });
      assert.equal(Option.getOrThrow(createdRow).origin, "main");

      const archived = yield* eventStore.append({
        type: "worktree.archived",
        eventId: EventId.make("evt-worktree-archived"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-worktree"),
        occurredAt: archivedAt,
        commandId: CommandId.make("cmd-worktree-archived"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-worktree-archived"),
        metadata: {},
        payload: {
          worktreeId,
          archivedAt,
          deletedBranch: false,
        },
      });

      yield* projectionPipeline.projectEvent(archived);
      const archivedRow = yield* worktrees.getById({ worktreeId });
      assert.equal(Option.getOrThrow(archivedRow).archivedAt, archivedAt);

      const renamed = yield* eventStore.append({
        type: "worktree.metaUpdated",
        eventId: EventId.make("evt-worktree-renamed"),
        aggregateKind: "worktree",
        aggregateId: worktreeId,
        occurredAt: "2026-05-10T00:00:00.000Z",
        commandId: CommandId.make("cmd-worktree-renamed"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-worktree-renamed"),
        metadata: {},
        payload: {
          worktreeId,
          title: "Renamed Worktree",
          changedAt: "2026-05-10T00:00:00.000Z",
        },
      });

      yield* projectionPipeline.projectEvent(renamed);
      const renamedRow = yield* worktrees.getById({ worktreeId });
      assert.equal(Option.getOrThrow(renamedRow).title, "Renamed Worktree");
    }),
  );

  it.effect("registers the worktree projector name", () =>
    Effect.sync(() => {
      assert.equal(ORCHESTRATION_PROJECTOR_NAMES.worktrees, "projection.worktrees");
    }),
  );
});
