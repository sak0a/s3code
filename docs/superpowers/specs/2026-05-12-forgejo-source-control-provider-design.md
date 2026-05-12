# Forgejo Source Control Provider

## Goal

Add Forgejo as a first-class source-control provider in S3Code, matching the
current GitHub, GitLab, Bitbucket, and Azure DevOps provider surface:

- detect Forgejo remotes
- show Forgejo readiness in Settings -> Source Control
- clone and publish repositories
- create, list, search, view, and check out pull requests
- list, search, and view issues
- surface current-branch pull-request status in the Git action control

Forgejo support should use the existing `SourceControlProviderShape` and
`SourceControlRepositoryService` abstractions. The feature should not add
provider-specific behavior directly to UI flows or git workflow code when a
shared provider boundary already exists.

## Research Summary

Primary references:

- Forgejo API usage: https://forgejo.org/docs/latest/user/api-usage/
- Forgejo token scopes: https://forgejo.org/docs/latest/user/token-scope/
- Forgejo versioning and Gitea compatibility: https://forgejo.org/docs/latest/user/versions/
- Forgejo bundled CLI: https://forgejo.org/docs/latest/admin/command-line/
- Forgejo OpenAPI document, using Codeberg as a public Forgejo instance:
  https://codeberg.org/swagger.v1.json
- Tea CLI reference point: https://about.gitea.com/products/tea

Relevant findings:

- Forgejo exposes an OpenAPI-described REST API under `/api/v1`, with an
  auto-generated Swagger UI at `/api/swagger` and a JSON schema at
  `/swagger.v1.json`.
- Forgejo supports API authentication with basic auth, `Authorization: token`,
  and `Authorization: Bearer` headers. For user-generated API tokens, this
  integration should send `Authorization: token <token>` because that is the
  documented historical API-token form and remains supported.
- API responses are paginated with `page` and `limit`. Forgejo instances expose
  pagination defaults and maximums at `/api/v1/settings/api`; the documented
  default max is 50.
- Scoped tokens are available. The provider should document `read:repository`
  and `read:issue` for read-only browsing, plus `write:repository` for creating
  repositories and pull requests. Organization repository creation can require
  organization permissions on some instances, so the UX should surface the API
  error rather than hiding it behind generic auth copy.
- Forgejo versions advertise Gitea API compatibility metadata, and tools built
  for Gitea 1.22 and below are documented as compatible with Forgejo 7+.
  However, S3Code should still implement against Forgejo's own REST API docs and
  schema rather than assuming every Gitea client behavior is stable.
- The bundled `forgejo` binary is an admin/server CLI. It starts the web server,
  manages users, performs migrations, handles Actions runner administration, and
  performs maintenance tasks. It is not a user-facing equivalent to `gh` or
  `glab` for daily issue and pull-request workflows.
- `fj` is a user-facing Forgejo CLI from `forgejo-contrib`. It can create and
  list Forgejo credentials, but it does not provide the stable JSON API surface
  S3Code needs for normalized issue, pull-request, and repository operations.
- Tea is the official Gitea CLI and has useful issue/pull/repository commands,
  but it is not Forgejo-owned. Using it would add a third-party compatibility
  dependency where Forgejo's REST API is already available.

## Recommendation

Implement Forgejo through a direct REST API provider, following the Bitbucket
API-provider pattern rather than the GitHub/GitLab CLI-provider pattern. Accept
`fj` credentials as an optional token source so users who already ran
`fj auth login` or `fj auth add-key` do not need to duplicate the token in
`S3CODE_FORGEJO_TOKEN`.

This gives S3Code deterministic JSON contracts, removes an extra CLI dependency,
works for Codeberg and self-hosted Forgejo instances, and keeps checkout/publish
behavior inside the existing provider and git-driver boundaries.

## Approaches Considered

### Direct Forgejo REST API Provider

Pros:

- Official Forgejo integration surface.
- No dependency on Tea, Gitea CLI release cadence, or human-formatted CLI output.
- Works on hosted and self-hosted Forgejo instances with the same code path.
- Fits the existing `BitbucketApi` pattern for API-token providers.
- Easier to test with mocked HTTP responses and schema decoders.
- Can reuse `fj` token files as a credential source without making `fj` a
  runtime command dependency.

Cons:

- Requires implementing endpoint wrappers and normalizers.
- Requires S3Code-owned credential configuration when `fj` credentials are not
  available.
- Checkout needs a provider-local Git path, similar to Bitbucket.

### Tea CLI Provider

Pros:

- Existing command-line concepts for issues, pulls, repositories, and checkout.
- Familiar to users who already use Gitea/Forgejo-compatible tooling.

Cons:

- Tea is a Gitea CLI, not a Forgejo-owned CLI.
- JSON output and auth behavior are another dependency surface.
- Adds install and auth setup burden comparable to `gh`/`glab`, without the same
  Forgejo documentation backing.
- Multi-instance support would depend on Tea's login profiles instead of
  S3Code's provider discovery model.

### Treat Forgejo as GitLab or Generic Git

Pros:

- Lowest initial implementation effort.

Cons:

- Incorrect API, URL, and terminology behavior.
- No issue or pull-request support beyond raw Git operations.
- Does not satisfy the user-visible provider feature set S3Code already exposes.

## User-Visible Behavior

### Settings

- Settings -> Source Control lists **Forgejo** under Source Control Providers.
- If no Forgejo credentials are configured, the row is available as a supported
  integration but unauthenticated, with setup guidance.
- If one configured Forgejo instance authenticates successfully, the row shows
  the account returned by `GET /api/v1/user`.
- If multiple instances are configured, the row shows an authenticated status
  and a detail such as `2 Forgejo instances configured`; account display can use
  the first successful probe.
- The install hint must not tell users to install the `forgejo` server/admin
  binary. It should tell users to configure Forgejo API tokens or authenticate
  with `fj`.

### Clone and Publish

- Add Project includes **Forgejo repository** beside GitHub, GitLab, Bitbucket,
  Azure DevOps, and Git URL.
- The repository input hint is `owner/repo`.
- Clone lookup resolves `owner/repo` through the configured Forgejo instance and
  uses the requested clone protocol.
- Publish Repository includes Forgejo as a provider option.
- Publishing creates the remote repository, adds a remote, and pushes the current
  branch through the existing `SourceControlRepositoryService` flow.

### Pull Requests

- The Git action control uses Forgejo terminology as pull requests and shows the
  Forgejo provider icon/name when the current branch belongs to a detected
  Forgejo remote.
- Creating a pull request posts to `/repos/{owner}/{repo}/pulls`.
- Listing current-branch pull requests fetches Forgejo pulls and filters by
  `head.ref` or `head.label` because the Forgejo list endpoint does not expose a
  direct head-branch query parameter.
- Closed and merged states are normalized from Forgejo's `state` and `merged`
  fields. `merged: true` maps to S3Code's `merged`; closed non-merged PRs map to
  `closed`.
- Pull-request detail includes body, recent issue-thread comments, commits,
  changed files when available, and full diff from `/pulls/{index}.diff`.
- Checkout fetches the PR head branch with Git, adding a remote for forked PRs
  when needed. This should mirror the narrow provider-local Git escape hatch
  already used by Bitbucket.

### Issues

- Issue lists and search use Forgejo issue endpoints with `type=issues` to avoid
  mixing pull requests into issue results.
- Issue detail includes body and recent comments from
  `/repos/{owner}/{repo}/issues/{index}/comments`.
- Linked PR numbers can be omitted in the first implementation. Forgejo exposes
  enough issue and PR metadata for browsing; automatic link extraction can be
  added later if there is a tested API source for it.

## Configuration

Forgejo is self-hosted-first, so a single hard-coded host is not enough. Support
both a simple single-instance configuration and a multi-instance configuration.
Also read `fj` credentials from the Forgejo CLI `keys.json` store when present.

Single instance:

```bash
S3CODE_FORGEJO_BASE_URL=https://codeberg.org
S3CODE_FORGEJO_TOKEN=...
```

Forgejo CLI credentials:

```bash
fj auth login
# or
fj auth add-key
```

Optional credentials-file override:

```bash
S3CODE_FORGEJO_CLI_KEYS_FILE=/path/to/keys.json
```

Multiple instances:

```bash
S3CODE_FORGEJO_INSTANCES='[
  {"baseUrl":"https://codeberg.org","token":"..."},
  {"baseUrl":"https://forge.example.com","token":"..."}
]'
```

Rules:

- `baseUrl` is the Forgejo web root, not the API root. The provider appends
  `/api/v1`.
- A `baseUrl` ending in `/api/v1` should be normalized to the web root to avoid
  double-appending API paths.
- Matching is by normalized host and optional base path. This matters for
  Forgejo instances hosted below a path prefix.
- `S3CODE_FORGEJO_INSTANCES` wins over the single-instance variables when both
  are present.
- An explicit S3Code token wins over a matching `fj` token.
- `fj` credential hosts are added to the known Forgejo instance list so
  self-hosted remotes can be detected without separate environment variables.
- Tokens are server-side secrets. They are never sent to the browser.

## Provider Detection

Static detection should recognize:

- `codeberg.org`
- `code.forgejo.org`
- hosts containing `forgejo`

Configured detection should recognize every host from
`S3CODE_FORGEJO_BASE_URL` and `S3CODE_FORGEJO_INSTANCES`.

Implementation detail:

- Keep the shared static detector in `@s3tools/shared/sourceControl`.
- Add a server-side configured-host matcher in the Forgejo API module.
- Refactor `GitManager.resolveHostingProvider` to use
  `SourceControlProviderRegistry.resolveHandle({ cwd })` or an equivalent
  provider-context helper so configured Forgejo hosts show up in git status.
- Keep pure shared tests for static hosts and server tests for configured hosts.

This avoids network probing during status reads. S3Code should not try to guess
that an arbitrary unknown remote is Forgejo by calling that remote under load.

## API Mapping

| S3Code operation               | Forgejo endpoint                                            |
| ------------------------------ | ----------------------------------------------------------- |
| Probe auth                     | `GET /api/v1/user`                                          |
| Repository lookup              | `GET /api/v1/repos/{owner}/{repo}`                          |
| Create user repository         | `POST /api/v1/user/repos`                                   |
| Create organization repository | `POST /api/v1/orgs/{org}/repos`                             |
| Default branch                 | `GET /api/v1/repos/{owner}/{repo}` -> `default_branch`      |
| List pull requests             | `GET /api/v1/repos/{owner}/{repo}/pulls`                    |
| Create pull request            | `POST /api/v1/repos/{owner}/{repo}/pulls`                   |
| Pull request detail            | `GET /api/v1/repos/{owner}/{repo}/pulls/{index}`            |
| Pull request diff              | `GET /api/v1/repos/{owner}/{repo}/pulls/{index}.diff`       |
| Pull request commits           | `GET /api/v1/repos/{owner}/{repo}/pulls/{index}/commits`    |
| Pull request files             | `GET /api/v1/repos/{owner}/{repo}/pulls/{index}/files`      |
| Issue list/search in repo      | `GET /api/v1/repos/{owner}/{repo}/issues?type=issues&q=...` |
| Cross-repo issue/PR search     | `GET /api/v1/repos/issues/search`                           |
| Issue detail                   | `GET /api/v1/repos/{owner}/{repo}/issues/{index}`           |
| Issue/PR comments              | `GET /api/v1/repos/{owner}/{repo}/issues/{index}/comments`  |

## Data Normalization

Create Forgejo-specific parser modules instead of reusing GitLab parsers.
Forgejo and GitLab both use merge/pull request concepts, but the JSON shapes are
different and should stay independently testable.

Suggested modules:

- `apps/server/src/sourceControl/forgejoIssues.ts`
- `apps/server/src/sourceControl/forgejoPullRequests.ts`

Normalize these fields:

- Repository: `full_name`, `html_url`, `clone_url`, `ssh_url`,
  `default_branch`
- Pull request: `number`, `title`, `html_url`, `state`, `merged`,
  `updated_at`, `base.ref`, `head.ref`, `head.label`, `head.repo.full_name`,
  `head.repo.clone_url`, `head.repo.ssh_url`, `user.login`, `body`
- Issue: `number`, `title`, `html_url`, `state`, `updated_at`, `user.login`,
  `labels`, `assignees`, `comments`, `body`
- Comments: `user.login`, `body`, `created_at`
- Commits/files: map only the fields S3Code contracts expose and tolerate
  missing optional fields.

Parser behavior should match the existing provider modules: skip malformed
entries in lists when possible, but fail detail endpoints on invalid JSON.

## Error Handling

Forgejo API errors should map to `SourceControlProviderError` with stable,
actionable detail strings:

- Missing token for a write operation: tell the user to configure a Forgejo API
  token.
- `401` or `403`: token missing, expired, invalid, or missing required scope.
- `404` on repo/issue/PR detail: repository, issue, or pull request not found.
- Network errors: include host and operation, not token values.
- Invalid JSON: report that Forgejo returned invalid JSON for the operation.

The provider should clamp per-page limits to the instance maximum once
`/settings/api` has been probed, and otherwise default to the documented
maximum of 50.

## Contracts and UI

Contract changes:

- Add `"forgejo"` to `SourceControlProviderKind`.

Shared presentation changes:

- Add Forgejo provider presentation:
  - provider name: `Forgejo`
  - short name: `PR`
  - long name: `pull request`
  - checkout example: no CLI example, or `git fetch ...` only if the UI needs
    one
  - URL example: `https://codeberg.org/owner/repo/pulls/42`

Web changes:

- Add `ForgejoIcon` or use the generic pull-request icon until a small,
  license-compatible Forgejo mark is added.
- Add Forgejo to Source Control settings icons.
- Add Forgejo to Add Project clone sources.
- Add Forgejo to Publish Repository provider options.
- Add Forgejo to source-control presentation switches in
  `apps/web/src/sourceControlPresentation.ts` and sidebar helper switches.
- Add Forgejo PR URL parsing to `apps/web/src/pullRequestReference.ts`:
  `https://<host>/<owner>/<repo>/pulls/<number>`.

## Non-Goals

- Forgejo Actions support.
- Forgejo issue or PR creation from the project explorer.
- Admin operations through the bundled `forgejo` binary.
- OAuth app flow in S3Code. API tokens are enough for this provider.
- Runtime auto-detection of arbitrary unknown hosts through network probes.
- Full Gitea provider support. The design should leave room for a later Gitea
  provider, but the provider kind and setup copy should be Forgejo-specific.

## Testing

Server unit tests:

- Forgejo remote URL parsing:
  - HTTPS
  - SSH scp-style
  - `ssh://`
  - configured instance with path prefix
- Forgejo config parsing:
  - single instance
  - multi-instance JSON
  - `fj` credentials file
  - malformed JSON produces unauthenticated discovery detail
- Auth probe maps successful `/user` to authenticated account.
- Auth probe maps no token to unauthenticated.
- Repository lookup and creation map clone URLs correctly.
- Pull-request list filters by head branch and state.
- Pull-request create sends `base`, `head`, `title`, and `body`.
- Pull-request detail fetches PR, comments, commits/files when available, and
  truncates body/comments through shared contract helpers.
- Pull-request diff returns raw diff text.
- Checkout same-repo and forked PR paths use `GitVcsDriver` remote helpers
  without shelling out manually.
- Issue list/search/detail normalize issue-only results and comments.
- Registry resolves Forgejo remotes to the Forgejo provider.
- Discovery includes Forgejo alongside other providers.

Web/unit tests:

- Source Control settings renders Forgejo discovery rows.
- Add Project includes Forgejo and respects readiness.
- Publish Repository includes Forgejo and respects readiness.
- Source-control presentation returns Forgejo name, icon, and PR terminology.
- PR URL parser accepts Forgejo `/pulls/{number}` URLs.

Repository checks:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- Targeted `bun run test` files for Forgejo parser/provider/discovery tests.

Do not run `bun test`.

## Rollout Plan

Ship Forgejo as a single feature slice, but implement it in dependency order:

1. Contracts and shared provider presentation.
2. Forgejo API config, host matching, HTTP client, and parser modules.
3. `ForgejoSourceControlProvider` implementing `SourceControlProviderShape`.
4. Registry/discovery integration.
5. Git status/provider detection refactor for configured Forgejo hosts.
6. Web UI provider list additions.
7. Documentation and tests.

The feature can be hidden behind missing credentials without a separate feature
flag: unauthenticated Forgejo simply appears in Settings with setup guidance.

## Open Risks

- Forgejo instances can be hosted below a path prefix. The parser and URL
  matcher must strip the configured base path before extracting `owner/repo`.
- The pull-request list endpoint does not accept a head-branch filter. S3Code
  must fetch a bounded page and filter locally; this can miss older PRs if a
  branch has many stale PRs. Mitigation: request `state=all`, sort by recent
  update, and keep the same small-limit behavior used by other providers.
- Organization repository creation scopes may differ by instance policy. The
  provider should surface exact Forgejo API errors and the docs should tell users
  to grant organization access when publishing to an organization fails.
- Forgejo and future Gitea API compatibility can diverge. The parser modules
  must be Forgejo-specific and covered by fixtures from the Forgejo OpenAPI
  schema and real Codeberg responses where practical.
