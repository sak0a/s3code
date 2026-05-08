import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";
import { SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES } from "@t3tools/contracts";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as GitHubCli from "./GitHubCli.ts";
import * as GitHubSourceControlProvider from "./GitHubSourceControlProvider.ts";

const processResult = (stdout: string): VcsProcess.VcsProcessOutput => ({
  exitCode: ChildProcessSpawner.ExitCode(0),
  stdout,
  stderr: "",
  stdoutTruncated: false,
  stderrTruncated: false,
});

function makeProvider(github: Partial<GitHubCli.GitHubCliShape>) {
  return GitHubSourceControlProvider.make().pipe(
    Effect.provide(Layer.mock(GitHubCli.GitHubCli)(github)),
  );
}

it.effect("maps GitHub PR summaries into provider-neutral change requests", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      getPullRequest: () =>
        Effect.succeed({
          number: 42,
          title: "Add GitHub provider",
          url: "https://github.com/pingdotgg/t3code/pull/42",
          baseRefName: "main",
          headRefName: "feature/source-control",
          state: "open",
          isCrossRepository: true,
          headRepositoryNameWithOwner: "fork/t3code",
          headRepositoryOwnerLogin: "fork",
        }),
    });

    const changeRequest = yield* provider.getChangeRequest({
      cwd: "/repo",
      reference: "42",
    });

    assert.deepStrictEqual(changeRequest, {
      provider: "github",
      number: 42,
      title: "Add GitHub provider",
      url: "https://github.com/pingdotgg/t3code/pull/42",
      baseRefName: "main",
      headRefName: "feature/source-control",
      state: "open",
      updatedAt: Option.none(),
      isCrossRepository: true,
      headRepositoryNameWithOwner: "fork/t3code",
      headRepositoryOwnerLogin: "fork",
    });
  }),
);

it.effect("uses gh json listing for non-open change request state queries", () =>
  Effect.gen(function* () {
    let executeArgs: ReadonlyArray<string> = [];
    const provider = yield* makeProvider({
      execute: (input) => {
        executeArgs = input.args;
        return Effect.succeed(
          processResult(
            JSON.stringify([
              {
                number: 7,
                title: "Merged work",
                url: "https://github.com/pingdotgg/t3code/pull/7",
                baseRefName: "main",
                headRefName: "feature/merged",
                state: "merged",
                updatedAt: "2026-01-02T00:00:00.000Z",
              },
            ]),
          ),
        );
      },
    });

    const changeRequests = yield* provider.listChangeRequests({
      cwd: "/repo",
      headSelector: "feature/merged",
      state: "all",
      limit: 10,
    });

    assert.deepStrictEqual(executeArgs, [
      "pr",
      "list",
      "--head",
      "feature/merged",
      "--state",
      "all",
      "--limit",
      "10",
      "--json",
      "number,title,url,baseRefName,headRefName,state,mergedAt,updatedAt,isCrossRepository,isDraft,author,assignees,labels,comments,headRepository,headRepositoryOwner",
    ]);
    assert.strictEqual(changeRequests[0]?.provider, "github");
    assert.strictEqual(changeRequests[0]?.state, "merged");
    assert.deepStrictEqual(
      changeRequests[0]?.updatedAt,
      Option.some(DateTime.makeUnsafe("2026-01-02T00:00:00.000Z")),
    );
  }),
);

it.effect("treats empty non-open change request listing output as no results", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      execute: () => Effect.succeed(processResult("")),
    });

    const changeRequests = yield* provider.listChangeRequests({
      cwd: "/repo",
      headSelector: "feature/empty",
      state: "all",
      limit: 10,
    });

    assert.deepStrictEqual(changeRequests, []);
  }),
);

it.effect("creates GitHub PRs through provider-neutral input names", () =>
  Effect.gen(function* () {
    let createInput: Parameters<GitHubCli.GitHubCliShape["createPullRequest"]>[0] | null = null;
    const provider = yield* makeProvider({
      createPullRequest: (input) => {
        createInput = input;
        return Effect.void;
      },
    });

    yield* provider.createChangeRequest({
      cwd: "/repo",
      baseRefName: "main",
      headSelector: "owner:feature/provider",
      title: "Provider PR",
      bodyFile: "/tmp/body.md",
    });

    assert.deepStrictEqual(createInput, {
      cwd: "/repo",
      baseBranch: "main",
      headSelector: "owner:feature/provider",
      title: "Provider PR",
      bodyFile: "/tmp/body.md",
    });
  }),
);

it.effect("listIssues returns summaries with provider: github", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      listIssues: () =>
        Effect.succeed([
          {
            number: 42,
            title: "Bug report",
            url: "https://github.com/owner/repo/issues/42",
            state: "open" as const,
            author: "alice",
            updatedAt: Option.some("2026-01-02T00:00:00.000Z"),
            labels: ["bug"],
            assignees: [],
            commentsCount: 0,
          },
        ]),
    });

    const issues = yield* provider.listIssues({ cwd: "/repo", state: "open" });

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0]?.provider, "github");
    assert.strictEqual(issues[0]?.number, 42);
    assert.strictEqual(issues[0]?.title, "Bug report");
    assert.strictEqual(issues[0]?.state, "open");
    assert.strictEqual(issues[0]?.author, "alice");
    assert.deepStrictEqual(
      issues[0]?.updatedAt,
      Option.some(DateTime.fromDateUnsafe(new Date("2026-01-02T00:00:00.000Z"))),
    );
  }),
);

it.effect("getIssue returns truncated details when body exceeds 8 KB", () =>
  Effect.gen(function* () {
    const bigBody = "x".repeat(SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES + 100);
    const provider = yield* makeProvider({
      getIssue: () =>
        Effect.succeed({
          number: 7,
          title: "Large issue",
          url: "https://github.com/owner/repo/issues/7",
          state: "open" as const,
          author: "bob",
          updatedAt: Option.none(),
          labels: [],
          assignees: [],
          commentsCount: 0,
          body: bigBody,
          comments: [],
        }),
    });

    const detail = yield* provider.getIssue({ cwd: "/repo", reference: "7" });

    assert.strictEqual(detail.truncated, true);
    assert.strictEqual(detail.provider, "github");
    assert.ok(Buffer.byteLength(detail.body, "utf8") <= SOURCE_CONTROL_DETAIL_BODY_MAX_BYTES);
  }),
);

it.effect("searchIssues passes query through to cli.searchIssues", () =>
  Effect.gen(function* () {
    let capturedQuery: string | undefined;
    const provider = yield* makeProvider({
      searchIssues: (input) => {
        capturedQuery = input.query;
        return Effect.succeed([]);
      },
    });

    yield* provider.searchIssues({ cwd: "/repo", query: "memory leak" });

    assert.strictEqual(capturedQuery, "memory leak");
  }),
);

it.effect("searchChangeRequests passes query through to cli.searchPullRequests", () =>
  Effect.gen(function* () {
    let capturedQuery: string | undefined;
    const provider = yield* makeProvider({
      searchPullRequests: (input) => {
        capturedQuery = input.query;
        return Effect.succeed([]);
      },
    });

    yield* provider.searchChangeRequests({ cwd: "/repo", query: "fix memory" });

    assert.strictEqual(capturedQuery, "fix memory");
  }),
);

it.effect("getChangeRequestDetail returns body and comments", () =>
  Effect.gen(function* () {
    const provider = yield* makeProvider({
      getPullRequestDetail: () =>
        Effect.succeed({
          number: 99,
          title: "Add feature",
          url: "https://github.com/owner/repo/pull/99",
          baseRefName: "main",
          headRefName: "feature/add",
          state: "open" as const,
          isCrossRepository: false,
          author: null,
          assignees: [],
          labels: [],
          commentsCount: 1,
          body: "PR body text",
          comments: [
            { author: "reviewer", body: "Looks good!", createdAt: "2026-03-01T10:00:00Z" },
          ],
          linkedIssueNumbers: [],
        }),
    });

    const detail = yield* provider.getChangeRequestDetail({ cwd: "/repo", reference: "99" });

    assert.strictEqual(detail.provider, "github");
    assert.strictEqual(detail.number, 99);
    assert.strictEqual(detail.body, "PR body text");
    assert.strictEqual(detail.comments.length, 1);
    assert.strictEqual(detail.comments[0]?.author, "reviewer");
    assert.strictEqual(detail.comments[0]?.body, "Looks good!");
    assert.strictEqual(detail.truncated, false);
  }),
);
