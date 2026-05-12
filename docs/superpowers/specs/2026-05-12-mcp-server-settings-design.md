# MCP Server Settings Panel Design

Status: research design and example implementation plan
Date: 2026-05-12

## Summary

S3Code can add an MCP server settings panel without becoming its own MCP host. The best fit is to use Codex app-server as the source of truth for Codex MCP configuration and status, then expose a thin S3Code WebSocket API plus a React settings surface.

The initial scope should be Codex-only. S3Code currently brokers Codex through app-server, and the generated local app-server bindings already expose the needed MCP and config methods. Other provider drivers can be added later behind the same S3Code MCP contracts if they expose equivalent configuration and inventory surfaces.

## Research Findings

Current S3Code architecture:

- Settings already have a modal/nav structure in `apps/web/src/components/settings/SettingsDialog.tsx` with `SettingsSectionId` in `apps/web/src/settingsDialogStore.ts`.
- Server-backed settings flow through `packages/contracts/src/settings.ts`, `apps/server/src/serverSettings.ts`, `apps/server/src/ws.ts`, `apps/web/src/hooks/useSettings.ts`, and `apps/web/src/rpc/serverState.ts`.
- Provider instances are the right routing boundary. `ServerSettings.providerInstances` stores user-authored provider instance envelopes, while `ProviderInstanceRegistryHydration` bridges legacy per-driver settings into the new map.
- Codex instances can share a real `CODEX_HOME` while using a `shadowHomePath` for account-specific auth. `CodexHomeLayout` symlinks shared state, including `config.toml`, into shadow homes. This means MCP servers should be grouped by Codex workspace/home, not blindly duplicated for every Codex account row.
- Chat timeline rendering already recognizes MCP tool calls as a work-log item type. It uses a wrench icon and extracts Codex `mcpToolCall` result/error previews in `apps/web/src/session-logic.ts` and `apps/web/src/components/chat/MessagesTimeline.tsx`.

Codex MCP/app-server surface found locally:

- Local Codex CLI version checked: `codex-cli 0.130.0`.
- `codex mcp` supports `list`, `get`, `add`, `remove`, `login`, and `logout`; `list` and `get` support JSON output.
- Generated app-server bindings expose:
  - `config/read`
  - `config/value/write`
  - `config/batchWrite`
  - `config/mcpServer/reload`
  - `mcpServerStatus/list`
  - `mcpServer/oauth/login`
  - `mcpServer/resource/read`
  - `mcpServer/tool/call`
  - notifications for `mcpServer/oauthLogin/completed` and `mcpServer/startupStatus/updated`

OpenAI Codex docs consulted:

- `https://developers.openai.com/codex/mcp`
- `https://developers.openai.com/codex/app-server`
- `https://developers.openai.com/codex/config-reference`

Relevant current Codex behavior from the docs:

- MCP config lives in Codex `config.toml`, normally under `~/.codex/config.toml`.
- Codex also supports project-scoped `.codex/config.toml` for trusted projects.
- Supported server types are local stdio servers and streamable HTTP servers.
- Supported config fields include stdio `command`, `args`, `env`, `env_vars`, `cwd`, HTTP `url`, bearer token env var, static/env-backed HTTP headers, timeouts, `enabled`, `required`, `enabled_tools`, `disabled_tools`, OAuth scopes, and OAuth callback settings.
- App-server can reload MCP config, list MCP status/inventory, start OAuth login, and emits MCP startup/OAuth notifications.

## Recommendation

Use a new S3Code MCP domain backed by Codex app-server config and status APIs.

Do not store MCP servers in S3Code `settings.json` as the source of truth. Codex CLI and IDE extension already share `config.toml`; duplicating that state in S3Code would make behavior unpredictable. S3Code should read and write Codex config through app-server, then call `config/mcpServer/reload`.

Group the UI by Codex workspace:

- Workspace identity: the resolved Codex home/continuation identity used by `CodexHomeLayout`.
- Workspace display: resolved home path plus the Codex provider instances that use it.
- Shared-home/shadow-home accounts appear once, with "used by" instance chips.
- Separate `CODEX_HOME` values appear as separate MCP workspaces.

## Alternatives Considered

### A. Wrap `codex mcp` CLI commands

This is the fastest implementation path for add/list/remove/login, and delete support is known to exist. It is weaker for live status, inventory, config layering, and typed validation. It also makes the UI dependent on parsing CLI output and command behavior.

Use this only as a fallback for remove/logout if app-server config writes cannot remove tables safely in the target Codex version.

### B. Use Codex app-server config/status RPCs

This is the recommended path. It avoids hand-written TOML manipulation, matches the generated protocol package already in the repo, provides status and inventory through typed schemas, and can hot-reload loaded Codex threads.

The main caveat is table deletion. The implementation should first verify whether `config/value/write` or `config/batchWrite` can remove `mcp_servers.<name>` safely. If not, use `codex mcp remove <name>` with the same binary path, `CODEX_HOME`, and provider environment as a bounded fallback.

### C. Store MCP settings in S3Code settings

This gives S3Code total UI control but breaks the shared Codex CLI/IDE config model. It also forces S3Code to become responsible for MCP process configuration semantics. This is not recommended for the first version.

## Product Design

Add a new settings section named `MCP Servers`.

Panel layout:

- Header row with workspace selector, refresh button, and add-server button.
- Workspace selector only appears when more than one Codex workspace is configured.
- Server list shows one card per configured MCP server.
- Empty state offers "Add server" and "Open config.toml".

Server card collapsed state:

- Server name.
- Transport: stdio or HTTP.
- Enabled/disabled switch.
- Startup status: ready, starting, failed, disabled, or unknown.
- Auth status: unsupported, not logged in, bearer token, or OAuth.
- Tool count and resource/template count from `mcpServerStatus/list`.
- Source indicator: user config, project config, managed/system config, or mixed.

Server card expanded state:

- Connection fields:
  - Stdio: command, args, cwd.
  - HTTP: URL, bearer token env var, static headers, env-backed headers.
- Environment fields:
  - Env var allow-list (`env_vars`) and direct env map (`env`).
  - Static direct env/header values are marked as stored in Codex `config.toml`.
  - Sensitive values should normally be stored as provider instance environment variables, then referenced by name from the MCP config.
- Common fields:
  - Enabled.
  - Required.
  - Startup timeout.
  - Tool timeout.
  - Enabled tools.
  - Disabled tools.
  - OAuth scopes.
- Inventory:
  - Tools with descriptions and input schema preview.
  - Resources and resource templates, loaded lazily with `detail: "full"`.
- Actions:
  - Save.
  - Reload.
  - OAuth login when `authStatus === "notLoggedIn"` for an OAuth-capable server.
  - Disable.
  - Remove.

Chat/session display changes:

- Keep existing MCP tool call work-log rendering.
- Improve labels to prefer `server.tool` when available from raw Codex item data.
- Map `mcpServer/startupStatus/updated` into `ProviderRuntimeEvent` as `mcp.status.updated`; show required-server failures near the provider/session error surfaces.
- OAuth completion should show a settings toast and refresh the selected MCP workspace.

## Server Design

Add a server-side MCP service, for example `apps/server/src/mcp/CodexMcpService.ts`.

Responsibilities:

- Discover Codex MCP workspaces from `ServerSettingsService.getSettings`.
- Resolve effective Codex home layout using existing `resolveCodexHomeLayout`.
- Start and initialize Codex app-server clients for a workspace when the MCP panel subscribes or when a mutation/OAuth operation needs one.
- Ref-count app-server clients by workspace, with an idle timeout so the settings panel does not leave processes alive forever.
- Expose list, status refresh, upsert, remove, reload, OAuth login, and optional resource-read operations.
- Publish workspace/server status updates through a PubSub used by a WebSocket subscription.

Suggested WebSocket methods:

- `mcp.listWorkspaces`
- `mcp.listServers`
- `mcp.upsertServer`
- `mcp.setServerEnabled`
- `mcp.removeServer`
- `mcp.reloadServers`
- `mcp.startOauthLogin`
- `mcp.readResource`
- `subscribeMcpServers`

Suggested contract package:

- Add `packages/contracts/src/mcp.ts`.
- Keep this package schema-only.
- Export schemas from `packages/contracts/src/index.ts`.

Key contract shapes:

- `McpWorkspace`: workspace id, display path, provider instances using it, selected provider instance.
- `McpServerConfig`: normalized UI config for stdio or HTTP plus common options.
- `McpServerStatus`: name, startup status, auth status, tools, resources, resource templates, errors, source.
- `McpServerUpsertInput`: workspace id, name, config, optional source target.
- `McpOauthLoginInput`: workspace id, server name, optional scopes and timeout seconds.

Config write behavior:

- Reads use `config/read` and `mcpServerStatus/list`.
- Adds and updates use `config/batchWrite` with `keyPath: "mcp_servers.<name>"`, `mergeStrategy: "upsert"` or `replace`, then `config/mcpServer/reload`.
- Enable/disable can write `mcp_servers.<name>.enabled`.
- Removal should prefer verified app-server table deletion. If deletion is not supported, run `codex mcp remove <name>` in a scoped process with the same `CODEX_HOME` and environment, then call `config/mcpServer/reload`.
- Project-level `.codex/config.toml` is read-only in the first version. If project settings override the user config, the UI shows the effective value and origin but writes only to the user config.

Security behavior:

- Do not echo sensitive provider environment values to the client.
- Prefer env var names over raw secret values for MCP configuration.
- If the UI allows static `env` or `http_headers`, label them as values stored in Codex `config.toml`.
- Reuse existing provider instance environment secret handling for sensitive process env vars. The MCP panel can show whether each referenced env var is present on each provider instance in the selected workspace, without exposing values.

Reliability behavior:

- All app-server calls should use bounded timeouts.
- Pagination loops must cap pages and item count.
- Failed app-server clients should produce per-workspace errors, not break the whole settings dialog.
- After every mutation, reread config and status instead of trusting optimistic local state.
- Registry/settings updates can rebuild provider instances; the MCP service should derive workspaces fresh on every list call and stop clients for removed workspaces.

## Web Design

Add `apps/web/src/components/settings/McpServersSettings.tsx`.

Supporting web modules:

- `apps/web/src/mcpServers.ts` for pure formatting, grouping, filtering, and validation helpers.
- `apps/web/src/components/settings/McpServerCard.tsx`.
- `apps/web/src/components/settings/AddMcpServerDialog.tsx`.
- `apps/web/src/components/settings/McpServerInventory.tsx`.

Settings integration:

- Add `"mcp-servers"` to `SettingsSectionId`.
- Add a nav item in `SettingsDialog.tsx`.
- Keep the panel outside the existing `Providers` section because MCP is a workspace/tool configuration surface, not an agent account/provider configuration surface.

UI validation:

- Restrict server names in the MVP to letters, digits, `_`, and `-`, starting with a letter. This avoids TOML dotted-key quoting edge cases.
- Require exactly one transport: stdio command or HTTP URL.
- Split args/env var lists with explicit row editors, not comma-only free text.
- Validate timeout fields as positive numbers.
- Validate tool allow/deny rows as non-empty strings.

## Example Implementation Plan

1. Contracts
   - Add `packages/contracts/src/mcp.ts` with schemas and RPC payloads.
   - Add the new WS method names and RPC definitions in `packages/contracts/src/rpc.ts`.
   - Export MCP schemas from `packages/contracts/src/index.ts`.
   - Add schema tests for stdio, HTTP, pagination result, OAuth input, and invalid names.

2. Server MCP service
   - Add `apps/server/src/mcp/CodexMcpService.ts`.
   - Implement workspace discovery from server settings and Codex home layout.
   - Implement scoped Codex app-server client pooling with initialize/initialized.
   - Implement list/status/reload/upsert/enable/remove/OAuth methods.
   - Add tests with a fake Codex app-server client and a temporary CODEX_HOME.

3. WebSocket bridge
   - Wire MCP RPC handlers into `apps/server/src/ws.ts`.
   - Add `subscribeMcpServers` stream using the MCP service PubSub.
   - Extend `apps/web/src/rpc/wsRpcClient.ts`, `apps/web/src/localApi.ts`, and `packages/contracts/src/ipc.ts`.

4. Settings UI
   - Add the new settings section id and nav item.
   - Build `McpServersSettings` with workspace selector, server cards, add/edit dialog, status refresh, OAuth login, and inventory expansion.
   - Add focused pure-logic tests for validation, grouping, and status presentation.

5. Runtime event polish
   - Map Codex `mcpServer/startupStatus/updated` to `mcp.status.updated` in `CodexAdapter`.
   - Improve MCP work-log labels to show server/tool names where raw item data contains them.
   - Add tests in `CodexAdapter.test.ts` and `session-logic.test.ts`.

6. Validation and docs
   - Add a short user doc under `docs/providers/` explaining how MCP config relates to Codex homes and shadow homes.
   - Run `bun fmt`, `bun lint`, and `bun typecheck`.

## First Slice

The smallest useful slice is read-only:

- Add contracts for MCP workspaces/status.
- Add `mcp.listWorkspaces`, `mcp.listServers`, and `subscribeMcpServers`.
- Build a settings panel that lists servers, status, auth, tools, and origins.
- Add manual refresh and "Open config.toml".

This proves workspace grouping, app-server status calls, pagination, and UI shape before taking write/delete/OAuth risks.

Second slice:

- Add enable/disable and reload.
- Add add/edit for stdio and HTTP servers.
- Add remove with verified app-server deletion or CLI fallback.

Third slice:

- Add OAuth login tracking.
- Add full inventory/resource viewing.
- Add runtime notification polish.

## Risks

- Codex app-server MCP/config APIs are marked experimental. The generated schema should be treated as the compatibility boundary for the installed Codex version.
- Table deletion semantics are not explicit in the current app-server docs. Verify before relying on config write for removal.
- Project-scoped config can override user config. The first version should show project origins but avoid editing project config from the global settings dialog.
- Shared Codex homes with different provider environments can make an MCP server work under one account but not another. The UI should surface env var availability by provider instance.
- Static env/header values are plaintext in Codex `config.toml`; default users toward env var references and existing provider environment secrets.

## Spec Self-Review

- No app behavior is implemented by this document.
- The first implementation scope is small enough to ship incrementally: read-only status first, then writes, then OAuth/resource polish.
- The source of truth is explicit: Codex `config.toml`, accessed through Codex app-server where possible.
- Multi-account Codex behavior is explicit: group by workspace/home so shadow-home accounts do not duplicate shared MCP config.
- The main unknown, removal semantics, has a concrete implementation rule: prefer verified app-server deletion, otherwise use `codex mcp remove` as a bounded fallback.
