import { AtlassianConnectionId } from "@s3tools/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Option } from "effect";

import { AtlassianConnectionRepository } from "../Services/AtlassianConnections.ts";
import { AtlassianConnectionRepositoryLive } from "./AtlassianConnections.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  AtlassianConnectionRepositoryLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("AtlassianConnectionRepository", (it) => {
  it.effect("upsert + getById round-trips a connection without secrets", () =>
    Effect.gen(function* () {
      const repo = yield* AtlassianConnectionRepository;
      const connectionId = AtlassianConnectionId.make("atl-conn-1");

      yield* repo.upsert({
        connectionId,
        kind: "bitbucket_token",
        label: "Bitbucket token",
        status: "connected",
        products: ["bitbucket"],
        capabilities: ["bitbucket:read", "bitbucket:write"],
        accountName: "Alice",
        accountEmail: "alice@example.com",
        avatarUrl: null,
        baseUrl: "https://api.bitbucket.org/2.0",
        expiresAt: null,
        lastVerifiedAt: "2026-05-12T10:00:00.000Z",
        readonly: false,
        isDefault: true,
        createdAt: "2026-05-12T10:00:00.000Z",
        updatedAt: "2026-05-12T10:00:00.000Z",
      });

      const row = yield* repo.getById({ connectionId });
      assert.isTrue(Option.isSome(row));
      assert.deepStrictEqual(Option.getOrThrow(row).capabilities, [
        "bitbucket:read",
        "bitbucket:write",
      ]);
    }),
  );

  it.effect("disconnect marks a connection revoked", () =>
    Effect.gen(function* () {
      const repo = yield* AtlassianConnectionRepository;
      const connectionId = AtlassianConnectionId.make("atl-conn-disconnect");

      yield* repo.upsert({
        connectionId,
        kind: "oauth_3lo",
        label: "Acme Atlassian",
        status: "connected",
        products: ["jira"],
        capabilities: ["jira:read"],
        accountName: null,
        accountEmail: null,
        avatarUrl: null,
        baseUrl: null,
        expiresAt: null,
        lastVerifiedAt: null,
        readonly: false,
        isDefault: false,
        createdAt: "2026-05-12T10:00:00.000Z",
        updatedAt: "2026-05-12T10:00:00.000Z",
      });

      const changed = yield* repo.disconnect({
        connectionId,
        updatedAt: "2026-05-12T11:00:00.000Z",
      });
      const row = yield* repo.getById({ connectionId });

      assert.isTrue(changed);
      assert.equal(Option.getOrThrow(row).status, "revoked");
    }),
  );
});
