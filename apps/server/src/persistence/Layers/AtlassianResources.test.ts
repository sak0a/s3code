import { AtlassianConnectionId, AtlassianResourceId } from "@ryco/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { AtlassianResourceRepository } from "../Services/AtlassianResources.ts";
import { AtlassianResourceRepositoryLive } from "./AtlassianResources.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  AtlassianResourceRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("AtlassianResourceRepository", (it) => {
  it.effect("upsertForConnection replaces stale resources for a connection", () =>
    Effect.gen(function* () {
      const repo = yield* AtlassianResourceRepository;
      const connectionId = AtlassianConnectionId.make("atl-conn-resources");

      yield* repo.upsertForConnection({
        connectionId,
        resources: [
          {
            resourceId: AtlassianResourceId.make("res-old"),
            connectionId,
            product: "jira",
            name: "Old Jira",
            url: "https://old.atlassian.net",
            capabilities: ["jira:read"],
            cloudId: "old-cloud",
            workspaceSlug: null,
            avatarUrl: null,
            updatedAt: "2026-05-12T10:00:00.000Z",
          },
        ],
      });

      yield* repo.upsertForConnection({
        connectionId,
        resources: [
          {
            resourceId: AtlassianResourceId.make("res-new"),
            connectionId,
            product: "bitbucket",
            name: "Acme workspace",
            url: "https://bitbucket.org/acme",
            capabilities: ["bitbucket:read"],
            cloudId: null,
            workspaceSlug: "acme",
            avatarUrl: null,
            updatedAt: "2026-05-12T11:00:00.000Z",
          },
        ],
      });

      const rows = yield* repo.list({ connectionId });
      assert.deepStrictEqual(
        rows.map((row) => row.resourceId),
        ["res-new"],
      );
    }),
  );
});
