# Forgejo Source Control Provider Implementation Plan

Spec: `docs/superpowers/specs/2026-05-12-forgejo-source-control-provider-design.md`

## Phase 1 - Contracts and Shared Presentation

- Add `"forgejo"` to `SourceControlProviderKind` in
  `packages/contracts/src/sourceControl.ts`.
- Update contract fixtures/tests that enumerate provider kinds.
- Extend `ChangeRequestPresentation.icon` in
  `packages/shared/src/sourceControl.ts` with `"forgejo"`.
- Add Forgejo presentation:
  - provider: `Forgejo`
  - terminology: pull request / PR
  - URL example: `https://codeberg.org/owner/repo/pulls/42`
- Add static host detection for `codeberg.org`, `code.forgejo.org`, and hosts
  containing `forgejo`.
- Add shared tests for Forgejo remote detection and presentation.

## Phase 2 - Forgejo API Core

- Add `apps/server/src/sourceControl/ForgejoApi.ts`.
- Add config parsing for:
  - `RYCO_FORGEJO_BASE_URL`
  - `RYCO_FORGEJO_TOKEN`
  - `RYCO_FORGEJO_INSTANCES`
- Normalize base URLs to web roots and build `/api/v1` URLs internally.
- Implement credential lookup by host and optional configured base path.
- Implement repository locator parsing for:
  - `owner/repo`
  - HTTPS remote URLs
  - `git@host:owner/repo.git`
  - `ssh://git@host/owner/repo.git`
  - configured path-prefixed instances
- Implement HTTP helpers:
  - JSON request/response decoding
  - text response for diffs
  - `Authorization: token <token>`
  - status-specific error mapping
  - token-safe error detail strings
- Implement auth probe against `GET /api/v1/user`.
- Unit test config parsing, host matching, auth probe, and error mapping.

## Phase 3 - Forgejo Parsers

- Add `apps/server/src/sourceControl/forgejoIssues.ts`.
- Add `apps/server/src/sourceControl/forgejoPullRequests.ts`.
- Define Effect schemas for the subset of Forgejo JSON Ryco consumes.
- Normalize issue summaries/details/comments.
- Normalize pull-request summaries/details, including merged-state mapping.
- Normalize commits and changed files when endpoints return them.
- Make list decoders tolerant of malformed entries and detail decoders strict.
- Add parser fixture tests using representative Forgejo/OpenAPI-shaped JSON.

## Phase 4 - Provider Implementation

- Add `apps/server/src/sourceControl/ForgejoSourceControlProvider.ts`.
- Implement all `SourceControlProviderShape` methods:
  - `listChangeRequests`
  - `getChangeRequest`
  - `createChangeRequest`
  - `getRepositoryCloneUrls`
  - `createRepository`
  - `getDefaultBranch`
  - `checkoutChangeRequest`
  - `listIssues`
  - `getIssue`
  - `searchIssues`
  - `searchChangeRequests`
  - `getChangeRequestDetail`
  - `getChangeRequestDiff`
- For PR checkout, mirror Bitbucket's provider-local Git flow:
  - resolve destination repo
  - resolve PR head repo/branch
  - ensure remote for forked PRs
  - fetch branch
  - set upstream
  - switch ref
- For create repository:
  - call `/user/repos` when owner matches authenticated user
  - call `/orgs/{org}/repos` otherwise
  - surface scope/permission errors as actionable provider errors
- Add provider tests with mocked `ForgejoApi`.

## Phase 5 - Registry and Discovery

- Add Forgejo discovery builder in
  `apps/server/src/sourceControl/SourceControlProviderDiscoveryCatalog.ts`.
- Register Forgejo in
  `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`.
- Provide `ForgejoApi` to the lazy Forgejo provider.
- Add registry tests:
  - Forgejo appears in discovery.
  - Forgejo remotes resolve to the Forgejo provider.
  - Configured Forgejo hosts resolve even when the hostname is not a static
    Forgejo-looking host.
- Refactor `GitManager.resolveHostingProvider` to rely on provider context from
  `SourceControlProviderRegistry.resolveHandle` or the same configured-host
  matcher, so git status reports Forgejo for configured hosts.

## Phase 6 - Web UI Wiring

- Add or select a Forgejo icon in `apps/web/src/components/Icons.tsx`.
- Add Forgejo to:
  - `apps/web/src/sourceControlPresentation.ts`
  - `apps/web/src/components/settings/SourceControlSettings.tsx`
  - `apps/web/src/components/GitActionsControl.tsx`
  - `apps/web/src/components/CommandPalette.tsx`
  - provider switch helpers in `apps/web/src/components/Sidebar.tsx`
- Add Forgejo to Add Project search terms.
- Add Forgejo to Publish Repository provider options with:
  - label `Forgejo`
  - host placeholder `codeberg.org`
  - path placeholder `owner/repo`
- Add Forgejo PR URL parsing to `apps/web/src/pullRequestReference.ts`.
- Update web/browser tests that enumerate provider discovery rows or provider
  option lists.

## Phase 7 - Documentation

- Update `docs/source-control-providers.md`:
  - add Forgejo to supported providers
  - document token setup
  - document optional `fj` credential reuse and `RYCO_FORGEJO_CLI_KEYS_FILE`
  - document single-instance and multi-instance environment variables
  - document recommended scopes
  - clarify that the bundled `forgejo` binary is not required
- Add troubleshooting notes for:
  - missing/invalid token
  - wrong instance base URL
  - organization publish permission failures
  - self-hosted instance behind a path prefix

## Phase 8 - Verification

- Run targeted tests with `bun run test`, not `bun test`:
  - Forgejo parser tests
  - Forgejo API/provider tests
  - source-control registry/discovery tests
  - shared source-control detection tests
  - web provider presentation/CommandPalette/GitActionsControl tests touched by
    the UI wiring
- Run required repository checks:
  - `bun fmt`
  - `bun lint`
  - `bun typecheck`

## Suggested Commit Slices

1. Contracts/shared detection/presentation.
2. Forgejo API config, schemas, parsers, and tests.
3. Forgejo provider, checkout behavior, registry, and discovery.
4. Web UI wiring and docs.

Each slice should keep `bun fmt`, `bun lint`, and `bun typecheck` green before
moving on.
