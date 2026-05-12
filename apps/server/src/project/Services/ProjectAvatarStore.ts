import { Context } from "effect";
import type { Effect } from "effect";
import type { ProjectId } from "@s3tools/contracts";

export interface ProjectAvatarStoreShape {
  readonly write: (input: {
    readonly projectId: ProjectId;
    readonly bytes: Buffer;
    readonly contentType: string;
  }) => Effect.Effect<{ readonly contentHash: string }, ProjectAvatarStoreError>;
  readonly read: (
    projectId: ProjectId,
  ) => Effect.Effect<{ readonly bytes: Buffer; readonly contentHash: string } | null, never>;
  readonly remove: (projectId: ProjectId) => Effect.Effect<void, never>;
}

export class ProjectAvatarStoreError extends Error {
  readonly _tag = "ProjectAvatarStoreError";
}

export const ProjectAvatarStore = Context.Service<ProjectAvatarStoreShape>(
  "@s3tools/server/ProjectAvatarStore",
);
