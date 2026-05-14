# Atlassian Bitbucket + Jira Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement first-class Atlassian support: easier Bitbucket setup, richer Bitbucket pull request support, Jira Cloud work-item context, and useful Jira/Bitbucket workflow actions.

**Spec:** [`docs/superpowers/specs/2026-05-12-atlassian-bitbucket-jira-integration-design.md`](../specs/2026-05-12-atlassian-bitbucket-jira-integration-design.md)

**Tech stack:** TypeScript, Effect, Effect Schema, SQLite migrations, React, TanStack Query, Vitest, Bun monorepo.

**Final verification gate:** run all before claiming completion:

```bash
bun fmt
bun lint
bun typecheck
bun run test
```

Never run `bun test`; this repository uses `bun run test`.

---

## Phase 0 - Orientation and Baseline

### Task 0.1: Confirm branch, working tree, and current behavior

**Files:** none.

- [ ] Run `git status --short`.
- [ ] Confirm current branch is the intended feature branch.
- [ ] Read:
  - `apps/server/src/sourceControl/BitbucketApi.ts`
  - `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`
  - `apps/server/src/sourceControl/SourceControlProvider.ts`
  - `apps/server/src/sourceControl/SourceControlProviderRegistry.ts`
  - `apps/web/src/lib/sourceControlContextRpc.ts`
  - `apps/web/src/components/projectExplorer/PullRequestDetail.tsx`
  - `apps/web/src/components/settings/SourceControlSettings.tsx`
- [ ] Run the current targeted tests:

```bash
bun run test apps/server/src/sourceControl/BitbucketApi.test.ts
bun run test apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts
bun run test apps/web/src/lib/sourceControlContextRpc.test.ts
```

If a listed test file does not exist, note it in the task log and continue.

---

## Phase 1 - Contracts

### Task 1.1: Add Atlassian contract schemas

**Files:**

- Create `packages/contracts/src/atlassian.ts`
- Modify `packages/contracts/src/index.ts`
- Create `packages/contracts/src/atlassian.test.ts`

- [ ] Add branded ids:
  - `AtlassianConnectionId`
  - `AtlassianResourceId`
- [ ] Add literals:
  - `AtlassianConnectionKind`: `oauth_3lo`, `bitbucket_token`, `env_fallback`
  - `AtlassianProduct`: `jira`, `bitbucket`
  - `AtlassianConnectionStatus`: `connected`, `needs_reauth`, `invalid`, `revoked`
  - `AtlassianCapability`: `jira:read`, `jira:write`, `bitbucket:read`, `bitbucket:write`
- [ ] Add schemas:
  - `AtlassianConnectionSummary`
  - `AtlassianResourceSummary`
  - `AtlassianProjectLink`
  - `AtlassianStartOAuthInput`
  - `AtlassianStartOAuthResult`
  - `AtlassianDisconnectInput`
  - `AtlassianSaveProjectLinkInput`
- [ ] Export from `packages/contracts/src/index.ts`.
- [ ] Tests:
  - decode connected OAuth connection
  - decode manual Bitbucket token connection
  - reject unknown product/capability
  - decode project link with Jira project keys and Bitbucket repo locator

Run:

```bash
bun run test packages/contracts/src/atlassian.test.ts
bun typecheck
```

### Task 1.2: Add work item contract schemas

**Files:**

- Create `packages/contracts/src/workItems.ts`
- Create `packages/contracts/src/workItems.test.ts`
- Modify `packages/contracts/src/index.ts`

- [ ] Add:
  - `WorkItemProviderKind = "jira"`
  - `WorkItemState = "open" | "in_progress" | "done" | "closed" | "unknown"`
  - `WorkItemTransition`
  - `LinkedChangeRequest`
  - `WorkItemSummary`
  - `WorkItemDetail`
  - `ComposerWorkItemContext`
- [ ] Reuse existing `SourceControlIssueComment` shape where possible.
- [ ] Add token-budget constants or reuse source-control caps:
  - body cap
  - comment cap
  - max comments
- [ ] Export from `index.ts`.
- [ ] Tests:
  - Jira issue `PROJ-123` decodes
  - detail with comments/transitions decodes
  - invalid provider rejects

Run:

```bash
bun run test packages/contracts/src/workItems.test.ts
bun typecheck
```

### Task 1.3: Extend source-control contracts for richer Bitbucket PR detail

**Files:**

- Modify `packages/contracts/src/sourceControl.ts`
- Modify `packages/contracts/src/sourceControl.test.ts`

- [ ] Add optional fields to `ChangeRequest` if not already present:
  - `isDraft`
  - `author`
  - `assignees`
  - `labels`
  - `commentsCount`
- [ ] Add optional fields to `SourceControlChangeRequestDetail`:
  - `participants`
  - `tasksCount`
  - `linkedWorkItemKeys`
- [ ] Keep all fields optional to avoid breaking GitHub/GitLab/Azure providers.
- [ ] Add tests for round-tripping a rich Bitbucket PR detail object.

Run:

```bash
bun run test packages/contracts/src/sourceControl.test.ts
bun typecheck
```

### Task 1.4: Add RPC method contracts

**Files:**

- Modify `packages/contracts/src/rpc.ts`
- Modify any generated/runtime RPC mapping tests if present.

- [ ] Add WS method names:
  - `atlassian.listConnections`
  - `atlassian.startOAuth`
  - `atlassian.disconnect`
  - `atlassian.refresh`
  - `atlassian.listResources`
  - `atlassian.getProjectLink`
  - `atlassian.saveProjectLink`
  - `sourceControl.listChangeRequests`
  - `workItems.list`
  - `workItems.search`
  - `workItems.get`
  - `workItems.addComment`
  - `workItems.listTransitions`
  - `workItems.transition`
- [ ] Add `Rpc.make(...)` definitions using contract schemas.
- [ ] Add client shape mapping if the RPC client has a typed grouped API.
- [ ] Tests:
  - method names are stable
  - payload schemas reject missing required fields

Run:

```bash
bun run test packages/contracts/src/rpc.test.ts
bun typecheck
```

---

## Phase 2 - Persistence and Secret Storage

### Task 2.1: Add persistence service interfaces

**Files:**

- Create `apps/server/src/persistence/Services/AtlassianConnections.ts`
- Create `apps/server/src/persistence/Services/AtlassianResources.ts`
- Create `apps/server/src/persistence/Services/ProjectAtlassianLinks.ts`

- [ ] Define repository service shapes:
  - create/update/list/get/disconnect connection
  - upsert/list resources
  - get/save project link
- [ ] Use Effect service style matching existing persistence services.
- [ ] Keep secret values out of these repository interfaces.

### Task 2.2: Add SQLite migrations

**Files:**

- Create next migration files under `apps/server/src/persistence/Migrations/`
- Modify `apps/server/src/persistence/Migrations.ts`
- Create migration tests

- [ ] Add table `atlassian_connections`.
- [ ] Add table `atlassian_resources`.
- [ ] Add table `project_atlassian_links`.
- [ ] Add useful indexes:
  - `atlassian_connections(status)`
  - `atlassian_resources(connection_id, product)`
  - `project_atlassian_links(project_id)`
- [ ] Tests:
  - migration creates all tables
  - migration is idempotent
  - project links can be deleted by project id if project deletion cleanup exists

Run:

```bash
bun run test apps/server/src/persistence/Migrations/*Atlassian*.test.ts
```

### Task 2.3: Implement persistence layers

**Files:**

- Create `apps/server/src/persistence/Layers/AtlassianConnections.ts`
- Create `apps/server/src/persistence/Layers/AtlassianResources.ts`
- Create `apps/server/src/persistence/Layers/ProjectAtlassianLinks.ts`
- Create tests beside each layer

- [ ] Implement all repository methods.
- [ ] Serialize arrays as JSON text.
- [ ] Decode JSON defensively; corrupt rows should fail with persistence error.
- [ ] Tests:
  - create/list/update connection
  - upsert resources replaces stale duplicates
  - save/get project link
  - disconnect marks status but does not delete history unless explicitly requested

Run:

```bash
bun run test apps/server/src/persistence/Layers/AtlassianConnections.test.ts
bun run test apps/server/src/persistence/Layers/AtlassianResources.test.ts
bun run test apps/server/src/persistence/Layers/ProjectAtlassianLinks.test.ts
```

---

## Phase 3 - Atlassian Server Services

### Task 3.1: Implement Atlassian error and HTTP client helpers

**Files:**

- Create `apps/server/src/atlassian/AtlassianErrors.ts`
- Create `apps/server/src/atlassian/AtlassianClient.ts`
- Create `apps/server/src/atlassian/AtlassianClient.test.ts`

- [ ] Add `AtlassianApiError` with:
  - operation
  - product
  - status
  - detail
  - retryAfter
  - cause
- [ ] Add HTTP helpers:
  - `executeJson`
  - `executeText`
  - `executePaged`
  - `withBearerAuth`
  - sanitized response error extraction
- [ ] Detect:
  - 401/403
  - 404
  - 429 with retry-after
  - invalid JSON
- [ ] Tests with mocked `HttpClient`:
  - successful JSON decode
  - bearer header present
  - token never appears in thrown detail
  - 429 maps retry-after

### Task 3.2: Implement Atlassian connection service

**Files:**

- Create `apps/server/src/atlassian/AtlassianConnectionService.ts`
- Create `apps/server/src/atlassian/AtlassianConnectionService.test.ts`

- [ ] Inject:
  - connection persistence repo
  - resources repo
  - `ServerSecretStore`
  - `AtlassianClient`
- [ ] Implement:
  - `listConnections`
  - `getConnection`
  - `saveManualBitbucketToken`
  - `disconnect`
  - `refresh`
  - `verify`
  - `listResources`
- [ ] Manual Bitbucket token save:
  - persist redacted metadata
  - write token to `ServerSecretStore`
  - probe Bitbucket `/user`
  - mark `connected` or `invalid`
- [ ] Tests:
  - stores secret outside DB
  - disconnect removes secret
  - invalid token becomes `invalid` or `needs_reauth`
  - env fallback appears as readonly connection summary if no stored connection exists

### Task 3.3: Implement OAuth start/callback skeleton

**Files:**

- Create `apps/server/src/atlassian/AtlassianOAuthService.ts`
- Modify server HTTP routing file, likely `apps/server/src/http.ts`
- Create tests

- [ ] Add config variables:
  - Atlassian client id
  - Atlassian client secret, if required by chosen app type
  - redirect base URL
- [ ] `startOAuth`:
  - generate state
  - generate PKCE verifier/challenge if supported
  - store short-lived state record
  - return authorization URL
- [ ] `callback`:
  - validate state
  - exchange code for token
  - store token
  - discover accessible Jira resources
  - redirect to Settings success route
- [ ] Tests:
  - state mismatch rejects
  - expired state rejects
  - token exchange stores token through `ServerSecretStore`
  - callback never returns token to browser

If OAuth app credentials are not configured, the Settings UI should show manual Bitbucket token setup and "Jira OAuth not configured on this server."

---

## Phase 4 - Bitbucket Auth Migration and Correctness

### Task 4.1: Add Bitbucket credential provider

**Files:**

- Create `apps/server/src/sourceControl/BitbucketCredentials.ts`
- Create `apps/server/src/sourceControl/BitbucketCredentials.test.ts`
- Modify `apps/server/src/ws.ts` layer wiring

- [ ] Implement credential resolution order:
  1. project-linked Atlassian connection with Bitbucket capability
  2. default stored Bitbucket connection
  3. env fallback from current `RYCO_BITBUCKET_*` vars
  4. unauthenticated
- [ ] Expose credential shape:
  - bearer token
  - basic auth email/token
  - unauthenticated status
- [ ] Tests:
  - stored credential wins over env
  - env fallback still works
  - missing credential returns unauthenticated detail

### Task 4.2: Refactor `BitbucketApi.ts` to use credentials

**Files:**

- Modify `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify `apps/server/src/sourceControl/BitbucketApi.test.ts`

- [ ] Inject `BitbucketCredentials`.
- [ ] Remove direct auth selection from request helper, except inside env fallback provider.
- [ ] Update `probeAuth`:
  - no credential -> unauthenticated
  - valid credential -> authenticated
  - invalid credential -> unauthenticated with clear detail
  - configured but probe failed for network reasons -> unknown
- [ ] Preserve `RYCO_BITBUCKET_API_BASE_URL`.
- [ ] Tests:
  - bearer auth header
  - basic auth header
  - invalid 401 maps unauthenticated
  - existing env tests still pass

Run:

```bash
bun run test apps/server/src/sourceControl/BitbucketApi.test.ts
```

### Task 4.3: Add Settings RPC for manual Bitbucket token

**Files:**

- Modify `packages/contracts/src/rpc.ts`
- Modify `apps/server/src/ws.ts`
- Modify web RPC client grouping if needed
- Add server tests

- [ ] Add RPC:
  - `atlassian.saveManualBitbucketToken`
- [ ] Payload:
  - label
  - email
  - token
- [ ] Server handler calls `AtlassianConnectionService.saveManualBitbucketToken`.
- [ ] Return redacted `AtlassianConnectionSummary`.
- [ ] Tests:
  - token not present in response
  - error detail redacts token

---

## Phase 5 - Dedicated Change Request Listing

### Task 5.1: Add `listChangeRequests` RPC route

**Files:**

- Modify `packages/contracts/src/rpc.ts`
- Modify `apps/server/src/ws.ts`
- Modify `apps/web/src/lib/sourceControlContextRpc.ts`
- Add tests

- [ ] Add payload:

```ts
{
  cwd: string;
  state: "open" | "closed" | "merged" | "all";
  limit?: number;
  query?: string;
}
```

- [ ] Server:
  - resolve provider by `cwd`
  - if `query` is non-empty, call `searchChangeRequests`
  - otherwise call provider `listChangeRequests`
  - for branchless UI listing, add provider method support for "all heads" if needed, or add a provider-neutral list mode
- [ ] Web:
  - stop using `searchChangeRequests({ query: "" })` as list
  - pass state filter through
- [ ] Tests:
  - state filter reaches provider
  - query path still uses search
  - empty query does not create title wildcard BBQL

### Task 5.2: Extend provider interface for unscoped PR list if needed

**Files:**

- Modify `apps/server/src/sourceControl/SourceControlProvider.ts`
- Modify all providers
- Modify provider tests

Current provider `listChangeRequests` requires `headSelector`, which is good for "current branch" but bad for Project Explorer "all PRs." Choose one:

Option A:

- Add `listRepositoryChangeRequests({ cwd, state, limit })`.

Option B:

- Make `headSelector` optional.

Recommendation: Option A for clarity.

- [ ] Add method to interface.
- [ ] Add unsupported-provider stub.
- [ ] Implement GitHub/GitLab/Azure with native list commands.
- [ ] Implement Bitbucket with `/pullrequests?state=...`.
- [ ] Wire Project Explorer list RPC to repository-list method.
- [ ] Keep branch status detection using existing head-filtered method.

---

## Phase 6 - Rich Bitbucket Pull Requests

### Task 6.1: Add Bitbucket pagination helper

**Files:**

- Modify `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify `apps/server/src/sourceControl/BitbucketApi.test.ts`

- [ ] Add schema for paged responses with `values` and `next`.
- [ ] Add helper that:
  - accepts initial URL/path and schema
  - follows `next`
  - stops at requested limit
  - clamps page size
- [ ] Tests:
  - single page
  - two pages
  - stops at limit before fetching third page
  - propagates decode errors with operation name

### Task 6.2: Extend Bitbucket PR decoders

**Files:**

- Modify `apps/server/src/sourceControl/bitbucketPullRequests.ts`
- Modify `apps/server/src/sourceControl/bitbucketPullRequests.test.ts`

- [ ] Decode fields:
  - author
  - reviewers
  - participants
  - draft
  - comment/task counts where present
  - links for diff/diffstat/commits/comments when useful
- [ ] Add commit schema:
  - hash
  - message
  - date
  - author
- [ ] Add diffstat/file schema:
  - path
  - additions
  - deletions
- [ ] Add normalization helpers.
- [ ] Tests with realistic Bitbucket JSON fixtures.

### Task 6.3: Implement Bitbucket PR detail aggregation

**Files:**

- Modify `apps/server/src/sourceControl/BitbucketApi.ts`
- Modify `apps/server/src/sourceControl/BitbucketSourceControlProvider.ts`
- Modify tests

- [ ] In `getPullRequestDetail`, fetch in parallel:
  - PR detail
  - comments
  - commits
  - diffstat
- [ ] For each optional child endpoint:
  - 404 -> empty child data
  - 403 -> preserve PR detail but log unavailable child data if appropriate
  - decode failure -> fail detail request, unless endpoint is documented as optional
- [ ] Add `linkedWorkItemKeys` by parsing title/body/branch/commits.
- [ ] Map fields into `SourceControlChangeRequestDetail`.
- [ ] Tests:
  - body/comments preserved
  - reviewers mapped
  - commits mapped
  - files/additions/deletions mapped
  - child 404 gives empty arrays

### Task 6.4: Implement Bitbucket PR diff endpoint

**Files:**

- Modify `BitbucketApiShape`
- Modify `BitbucketApi.ts`
- Modify `BitbucketSourceControlProvider.ts`
- Modify tests

- [ ] Add `getPullRequestDiff`.
- [ ] Use text response, not JSON.
- [ ] Bound maximum diff bytes to avoid huge UI payloads.
- [ ] Return empty string only when endpoint is unavailable with expected 404, not as default.
- [ ] Wire `getChangeRequestDiff`.
- [ ] Tests:
  - returns unified diff text
  - truncates or errors predictably for oversized response
  - provider maps errors correctly

---

## Phase 7 - Jira Backend Provider

### Task 7.1: Create work item provider interface and registry

**Files:**

- Create `apps/server/src/workItems/WorkItemProvider.ts`
- Create `apps/server/src/workItems/WorkItemProviderRegistry.ts`
- Create tests

- [ ] Define provider shape:
  - `kind`
  - `listWorkItems`
  - `searchWorkItems`
  - `getWorkItem`
  - `listTransitions`
  - `transitionWorkItem`
  - `addComment`
- [ ] Add unsupported provider fallback.
- [ ] Add registry resolving project link and provider kind.
- [ ] Tests:
  - resolves Jira provider when project link exists
  - unsupported error is clear

### Task 7.2: Add Jira API decoders

**Files:**

- Create `apps/server/src/workItems/jiraIssues.ts`
- Create `apps/server/src/workItems/jiraIssues.test.ts`

- [ ] Decode Jira search response.
- [ ] Decode Jira issue detail.
- [ ] Decode comments.
- [ ] Decode transitions.
- [ ] Normalize:
  - key
  - summary
  - status
  - status category
  - issue type
  - priority
  - assignee/reporter
  - labels/components
  - description text
- [ ] For Jira rich text descriptions:
  - implement minimal Atlassian Document Format to text conversion
  - keep unsupported nodes as plain text when possible
- [ ] Tests:
  - search list decodes
  - detail with ADF description decodes to text
  - missing optional fields are tolerated

### Task 7.3: Implement `JiraWorkItemProvider`

**Files:**

- Create `apps/server/src/workItems/JiraWorkItemProvider.ts`
- Create `apps/server/src/workItems/JiraWorkItemProvider.test.ts`

- [ ] Inject:
  - `AtlassianClient`
  - project link repository
  - connection service
- [ ] Implement JQL builder:
  - project keys filter
  - status filter
  - text search
  - key direct lookup
- [ ] Escape user query safely.
- [ ] Fetch comments and transitions for detail in parallel.
- [ ] Add comments.
- [ ] Transition issues.
- [ ] Tests:
  - direct key lookup uses issue endpoint
  - text search uses JQL
  - project key filter applied
  - add comment uses POST
  - transition uses POST

### Task 7.4: Wire work-item RPC routes

**Files:**

- Modify `apps/server/src/ws.ts`
- Modify layer wiring near source-control providers
- Modify web RPC client types if needed
- Add tests

- [ ] Add handlers for all `workItems.*` methods.
- [ ] Observe RPC effects with aggregate `work-items`.
- [ ] Ensure errors map to contract error type.
- [ ] Tests:
  - `workItems.search` calls registry provider
  - missing project link returns actionable error

---

## Phase 8 - Project Atlassian Links

### Task 8.1: Implement project link service

**Files:**

- Create `apps/server/src/atlassian/ProjectAtlassianLinkService.ts`
- Create tests

- [ ] Implement:
  - `getProjectLink(projectId)`
  - `saveProjectLink(input)`
  - `inferFromRepository(projectId, cwd)`
  - `testProjectLink(projectId)`
- [ ] Inference:
  - use `RepositoryIdentityResolver`
  - if provider is Bitbucket, parse workspace/repo slug
  - default Jira project keys empty until user selects or branch history suggests keys
- [ ] Tests:
  - Bitbucket remote infers workspace/repo
  - non-Bitbucket remote does not set Bitbucket fields
  - save preserves templates

### Task 8.2: Add issue-key extraction helper

**Files:**

- Create `packages/shared/src/atlassian.ts`
- Create `packages/shared/src/atlassian.test.ts`
- Add subpath export in `packages/shared/package.json` if needed

- [ ] Implement `extractJiraIssueKeys(text, allowedProjectKeys?)`.
- [ ] Implement `slugifyJiraSummaryForBranch(summary)`.
- [ ] Implement `formatJiraBranchName(template, issue)`.
- [ ] Implement `formatJiraPrTitle(template, issue, generatedTitle)`.
- [ ] Tests:
  - extracts `PROJ-123`
  - ignores lowercase false positives
  - filters by allowed keys
  - branch name sanitized

---

## Phase 9 - Settings UI

### Task 9.1: Add Atlassian React Query hooks

**Files:**

- Create `apps/web/src/lib/atlassianReactQuery.ts`
- Create tests if existing query helper tests pattern exists

- [ ] Add query keys:
  - all connections
  - resources
  - project link
- [ ] Add mutation options:
  - start OAuth
  - save manual Bitbucket token
  - disconnect
  - refresh
  - save project link
- [ ] Invalidate source-control discovery after Bitbucket credential changes.

### Task 9.2: Redesign Source Control settings section

**Files:**

- Modify `apps/web/src/components/settings/SourceControlSettings.tsx`
- Add small child components if file becomes too large:
  - `AtlassianConnectionCard.tsx`
  - `ManualBitbucketTokenDialog.tsx`
  - `AtlassianResourcesList.tsx`
- Add tests/browser tests

- [ ] Preserve existing VCS/provider discovery display.
- [ ] Add Atlassian card:
  - connected account
  - Jira sites count
  - Bitbucket workspaces count
  - status badge
  - refresh/disconnect actions
- [ ] Add manual Bitbucket token dialog:
  - email input
  - token password input
  - save/test button
  - clear error messages
- [ ] Add OAuth connect button:
  - disabled with explanation when server OAuth config missing
  - opens returned authorization URL
- [ ] Empty states:
  - no Atlassian connection
  - needs reauth
  - missing scopes
- [ ] Tests:
  - connected card renders
  - invalid token error renders
  - token value not shown after save

### Task 9.3: Add project-level Atlassian link UI

**Files:**

- Locate current project settings surface.
- Create `ProjectAtlassianLinkPanel.tsx`.
- Add tests.

- [ ] Select connection.
- [ ] Select Jira site.
- [ ] Multi-select Jira project keys.
- [ ] Show inferred Bitbucket workspace/repo.
- [ ] Branch template field.
- [ ] PR title template field.
- [ ] Toggles:
  - comment on Jira after PR creation
  - transition on branch creation
  - transition on PR creation
- [ ] Test link action.

---

## Phase 10 - Project Explorer UI

### Task 10.1: Fix provider-aware PR detail text

**Files:**

- Modify `apps/web/src/components/projectExplorer/PullRequestDetail.tsx`
- Add/modify tests

- [ ] Replace hard-coded "View on GitHub" with provider-aware label:
  - GitHub -> View on GitHub
  - GitLab -> View on GitLab
  - Bitbucket -> View on Bitbucket
  - Azure -> View on Azure DevOps
- [ ] Use existing source-control presentation helper if possible.
- [ ] Test with Bitbucket detail object.

### Task 10.2: Populate Bitbucket Files and Commits tabs

**Files:**

- Modify `PullRequestDetail.tsx` only if rendering assumes GitHub-specific data.
- Mostly backend from Phase 6 should make existing UI work.
- Add browser/unit tests.

- [ ] Ensure empty files tab says unavailable only when provider returned no diff.
- [ ] Render additions/deletions/file count for Bitbucket.
- [ ] Render commit list for Bitbucket commits.
- [ ] Test with Bitbucket detail fixture.

### Task 10.3: Add Jira tab to Project Explorer

**Files:**

- Modify `ProjectExplorerDialog.tsx`
- Create `JiraTab.tsx`
- Create `JiraIssueList.tsx`
- Create `JiraIssueDetail.tsx`
- Create tests

- [ ] Add tab only when project has Jira link or Atlassian connection can be linked.
- [ ] List recent issues from linked Jira project keys.
- [ ] Search by key/text.
- [ ] Detail view:
  - title/key/status
  - type/priority/assignee/reporter
  - description
  - comments
  - linked PRs
  - transitions menu
- [ ] Actions:
  - attach to chat
  - start work
  - open in Jira
- [ ] Empty states:
  - no Jira link
  - no matching issues
  - auth missing

---

## Phase 11 - Composer Context

### Task 11.1: Extend composer draft store for work item contexts

**Files:**

- Modify `apps/web/src/composerDraftStore.ts`
- Modify tests
- Modify provider turn payload wiring if needed

- [ ] Add `workItemContexts` beside `sourceControlContexts`.
- [ ] Dedupe by provider + key.
- [ ] Persist in client draft storage.
- [ ] Clear on accepted send.
- [ ] Tests:
  - add Jira context
  - duplicate prevented
  - clear on send lifecycle

### Task 11.2: Add work-item RPC query hooks

**Files:**

- Create `apps/web/src/lib/workItemContextRpc.ts`
- Add tests if pattern exists

- [ ] Query keys:
  - list
  - search
  - detail
  - transitions
- [ ] Hooks mirror `sourceControlContextRpc.ts`.
- [ ] Stale time similar to source-control context.

### Task 11.3: Update context picker

**Files:**

- Modify `apps/web/src/components/chat/ContextPickerPopup.tsx`
- Modify `ContextPickerList.tsx`
- Create `WorkItemContextChip.tsx`
- Modify `ChatComposer.tsx`
- Modify tests/browser tests

- [ ] Add Jira tab.
- [ ] If query matches issue key, prioritize Jira direct lookup.
- [ ] Existing Issues/PRs behavior remains.
- [ ] Add chip rendering:
  - Jira key
  - title
  - status
  - remove button
- [ ] Attach work item detail to composer.
- [ ] Tests:
  - `#PROJ-123` shows Jira result
  - selecting Jira issue creates chip
  - source-control chips still work

### Task 11.4: Format work-item context for agents

**Files:**

- Modify `packages/shared/src/sourceControlContextFormatter.ts` or create `workItemContextFormatter.ts`
- Modify server/provider prompt assembly path
- Add tests

- [ ] Add section:

```md
## Attached Jira context

### PROJ-123: Title

URL:
Status:
Assignee:
Priority:

Description...

Recent comments:

- ...
```

- [ ] Include linked PRs if present.
- [ ] Mark stale/truncated context.
- [ ] Tests for formatting.

---

## Phase 12 - Git/Jira Workflow Actions

### Task 12.1: Add server workflow: start work from Jira issue

**Files:**

- Modify `apps/server/src/git/GitManager.ts` or add a new orchestration service if cleaner.
- Modify contracts/RPC if not already added.
- Add tests.

- [ ] Input:
  - cwd/project id
  - Jira key
  - mode: current worktree or new worktree
- [ ] Flow:
  - fetch Jira issue
  - derive branch name from project template
  - create/switch branch or worktree
  - optionally transition issue
  - return branch/worktree info and context
- [ ] Tests:
  - branch name includes key
  - invalid key fails clearly
  - transition skipped when disabled

### Task 12.2: Make PR creation Jira-aware

**Files:**

- Modify `apps/server/src/git/GitManager.ts`
- Modify `apps/server/src/textGeneration/TextGenerationPrompts.ts` if PR prompt needs Jira context
- Add tests

- [ ] During `runPrStep`:
  - extract Jira key from branch
  - inspect attached work-item context if available
  - apply PR title template
  - include Jira link/key in PR body
- [ ] After PR creation:
  - optionally add Jira comment with PR link
  - optionally transition issue
- [ ] Tests:
  - PR title includes key
  - body includes Jira URL/key
  - comment called when enabled
  - no Jira action when no key/link

### Task 12.3: Add UI entry points

**Files:**

- Modify `ProjectExplorerDialog.tsx` / `JiraIssueDetail.tsx`
- Modify `BranchToolbar.tsx` or `GitActionsControl.tsx`
- Modify command palette if desired

- [ ] Jira issue row action: `Start work`.
- [ ] Jira detail action: `Create branch`.
- [ ] Git action surface: show detected Jira key on branch.
- [ ] Optional command palette action: `Start from Jira issue`.
- [ ] Tests/browser tests for visible actions.

---

## Phase 13 - Documentation and Migration

### Task 13.1: Update user docs

**Files:**

- Modify `docs/source-control-providers.md`
- Add screenshots later if browser QA captures are kept in docs/assets.

- [ ] Replace env-only Bitbucket instructions with:
  - Connect in Settings
  - Manual token fallback
  - env fallback for servers/headless deployments
- [ ] Add Jira section:
  - connect Atlassian
  - link project
  - attach Jira issues
  - start work from Jira
- [ ] Add troubleshooting:
  - missing scopes
  - Jira site not visible
  - Bitbucket workspace not visible
  - rate limited

### Task 13.2: Add migration/backward compatibility notes

**Files:**

- Same docs or release notes location if one exists.

- [ ] State that existing `RYCO_BITBUCKET_*` env vars continue to work.
- [ ] Explain Settings-stored credentials take precedence over env fallback.
- [ ] Explain Jira workflow actions are opt-in per project.

---

## Phase 14 - Final Verification

### Task 14.1: Targeted server tests

Run:

```bash
bun run test apps/server/src/sourceControl/BitbucketApi.test.ts
bun run test apps/server/src/sourceControl/BitbucketSourceControlProvider.test.ts
bun run test apps/server/src/workItems
bun run test apps/server/src/atlassian
bun run test apps/server/src/persistence/Layers/AtlassianConnections.test.ts
bun run test apps/server/src/persistence/Layers/AtlassianResources.test.ts
bun run test apps/server/src/persistence/Layers/ProjectAtlassianLinks.test.ts
```

### Task 14.2: Targeted web tests

Run relevant tests after locating exact filenames:

```bash
bun run test apps/web/src/components/settings
bun run test apps/web/src/components/projectExplorer
bun run test apps/web/src/components/chat
bun run test apps/web/src/lib
```

### Task 14.3: Full repo gate

Run:

```bash
bun fmt
bun lint
bun typecheck
bun run test
```

### Task 14.4: Manual QA

- [ ] Connect Atlassian with OAuth on a test Jira Cloud site.
- [ ] Save manual Bitbucket token on a test Bitbucket Cloud workspace.
- [ ] Clone a Bitbucket repository.
- [ ] Open Project Explorer -> Pull Requests.
- [ ] Open a Bitbucket PR detail and verify comments, commits, and files.
- [ ] Link Jira project.
- [ ] Search `PROJ-123` in composer.
- [ ] Attach Jira issue to chat.
- [ ] Start work from Jira issue.
- [ ] Create PR and verify Jira key in title/body.
- [ ] If enabled, verify Jira comment and transition.

### Task 14.5: Browser visual QA

Use the Browser plugin for local UI verification after the app runs:

- [ ] Settings Atlassian card.
- [ ] Manual Bitbucket token dialog.
- [ ] Project link panel.
- [ ] Project Explorer PR detail.
- [ ] Project Explorer Jira detail.
- [ ] Composer context picker with Jira tab.

Check desktop and narrow viewport. Ensure text does not overflow buttons/cards and provider labels are not GitHub-specific.

---

## Implementation Notes and Risk Controls

- Keep Bitbucket env fallback until at least one release after Settings-based credentials ship.
- Do not send token values to the browser, telemetry, logs, or error messages.
- Keep Jira write actions opt-in.
- Avoid server-side broad Jira caches in v1; use short web query caching and resource discovery caching only.
- Prefer additive contract fields over changing existing source-control shapes.
- If OAuth setup is blocked by missing app credentials, continue with manual Bitbucket token milestone and leave Jira UI disabled with an actionable setup state.
- If Bitbucket diff payloads are too large, cap server response and show a truncated-state message in Files tab.
