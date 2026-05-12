# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce role-aware WebSocket authorization, remove ambient-cookie WebSocket auth, scope project file access to server-owned roots, and harden user-controlled process arguments.

**Architecture:** `ws.ts` receives the full authenticated session and gates every method through a small role-policy helper. WebSocket upgrades require short-lived `wsToken` plus accepted browser origins. Auth access streams become owner-only. Project file APIs migrate from caller-owned `cwd` roots to server-resolved project/worktree roots. Git clone and Windows editor launches get focused argument hardening.

**Spec:** `docs/superpowers/specs/2026-05-12-security-hardening-design.md`

---

## Task 1: Add WebSocket RPC authorization primitives

**Files:**

- Create: `apps/server/src/auth/wsAuthorization.ts`
- Modify: `apps/server/src/ws.ts`
- Test: `apps/server/src/auth/wsAuthorization.test.ts`

- [ ] Add `WsRpcAccess = "owner" | "authenticated"` and `authorizeWsRpc(session, access, method)`.
- [ ] Return a typed 403 `AuthError` for owner-only calls from non-owner sessions.
- [ ] Change `makeWsRpcLayer(currentSessionId)` to accept the full authenticated session.
- [ ] Preserve `currentSessionId` behavior by reading `session.sessionId`.
- [ ] Add unit tests for owner allowed, client rejected, and authenticated allowed.
- [ ] Run `bun run test apps/server/src/auth/wsAuthorization.test.ts`.

## Task 2: Classify and gate WebSocket methods

**Files:**

- Modify: `apps/server/src/ws.ts`
- Test: add or extend WS route/RPC tests under `apps/server/src`

- [ ] Add a local policy map or wrapper helpers: `ownerRpc(method, effect)` and `authenticatedRpc(method, effect)`.
- [ ] Default all mutation, terminal, filesystem, source-control write, and shell-open methods to owner-only.
- [ ] Keep only clearly read-only metadata/state methods as authenticated.
- [ ] Gate `ORCHESTRATION_WS_METHODS.dispatchCommand` as owner-only.
- [ ] Gate `serverUpdateSettings`, keybinding upsert, project read/write/list/search by `cwd`, `filesystemBrowse`, `shellOpenInEditor`, terminal methods, VCS mutations, clone/publish, and setup-script execution as owner-only.
- [ ] Add regression tests proving a `client` session receives 403 for representative methods: dispatch command, update settings, read file, terminal open, auth access stream.
- [ ] Add regression tests proving an `owner` session reaches the same handlers.
- [ ] Run the focused WS tests with `bun run test ...`.

## Task 3: Split or restrict auth access streaming

**Files:**

- Modify: `apps/server/src/ws.ts`
- Modify if needed: `packages/contracts/src/auth.ts`
- Modify if needed: web connections/settings components consuming `subscribeAuthAccess`
- Test: auth access stream tests

- [ ] Make `subscribeAuthAccess` owner-only first.
- [ ] Verify the current UI only subscribes from owner contexts.
- [ ] If client UI needs current-session state, add a separate minimal current-session method/stream without pairing links or other-client metadata.
- [ ] Stop broadcasting raw pairing credentials over any broad stream; pairing credentials should be returned only from owner-only creation flows.
- [ ] Add tests showing client sessions cannot receive pairing links through WS.
- [ ] Run focused auth/WS tests.

## Task 4: Require `wsToken` and validate WebSocket origins

**Files:**

- Modify: `apps/server/src/auth/Layers/ServerAuth.ts`
- Modify: `apps/server/src/ws.ts`
- Modify: `apps/server/src/auth/http.ts`
- Modify: `apps/web/src/environments/primary` and runtime connection code if primary still uses cookie WS auth
- Test: auth and runtime connection tests

- [ ] Remove `authenticateWebSocketUpgrade` fallback to `authenticateRequest`.
- [ ] Add an origin validator for WS upgrades.
- [ ] Accept missing `Origin` only for non-browser token clients.
- [ ] Accept configured local/dev/desktop origins and same-origin loopback origins.
- [ ] Reject unexpected origins with 403 before the RPC layer is built.
- [ ] Ensure every client connection path requests `/api/auth/ws-token` before opening `/ws`.
- [ ] Set session cookies `secure: true` when the request is HTTPS or the configured exposure is HTTPS.
- [ ] Add tests for missing token, expired token, valid token, bad origin, good origin, and no-origin non-browser token.
- [ ] Run `bun run test` for the auth/WS test files touched.

## Task 5: Move project file APIs to server-resolved roots

**Files:**

- Modify: `packages/contracts/src/project.ts`
- Modify: `packages/contracts/src/rpc.ts`
- Modify: `apps/server/src/ws.ts`
- Modify or create: server workspace/project root resolver module
- Modify: web callers in preview/project explorer/proposed-plan file write paths
- Test: workspace/project file API tests

- [ ] Introduce project file inputs based on `projectId` plus optional `worktreeId` or `threadId`.
- [ ] Resolve roots on the server from projection state before calling `WorkspaceFileSystem`.
- [ ] Keep existing `WorkspaceFileSystem` realpath containment checks after root resolution.
- [ ] Rename or isolate any remaining arbitrary-`cwd` operations under owner-only filesystem APIs.
- [ ] Update web callers to send project/worktree/thread identifiers instead of raw `cwd` where possible.
- [ ] Add tests showing caller-supplied roots cannot redirect reads/writes outside the resolved project root.
- [ ] Add tests for symlink containment still rejecting outside-root targets.
- [ ] Run focused workspace/project tests.

## Task 6: Harden source-control clone inputs

**Files:**

- Modify: `apps/server/src/sourceControl/SourceControlRepositoryService.ts`
- Test: `apps/server/src/sourceControl/SourceControlRepositoryService.test.ts`

- [ ] Insert `--` before `remoteUrl` in `git clone` args.
- [ ] Add URL validation for accepted clone forms: `https://`, `ssh://`, and SCP-style `git@host:owner/repo`.
- [ ] Decide whether local path clones are allowed; if yes, require owner-only call path and explicit local-path validation.
- [ ] Reject leading-dash `remoteUrl` inputs before Git execution.
- [ ] Add tests for valid HTTPS/SSH/SCP URLs, invalid schemes, and leading-dash values.
- [ ] Run `bun run test apps/server/src/sourceControl/SourceControlRepositoryService.test.ts`.

## Task 7: Harden editor/process launch on Windows

**Files:**

- Modify: `apps/server/src/open.ts`
- Test: `apps/server/src/open.test.ts` or equivalent existing file

- [ ] Prefer direct executable spawning with `shell: false` on Windows.
- [ ] If shell launch remains necessary, add a single Windows escaping helper.
- [ ] Cover embedded quotes, trailing backslashes, ampersands, pipes, percent signs, and parentheses in tests.
- [ ] Verify each supported `EditorLaunchStyle` still produces expected args.
- [ ] Run the focused open/editor tests.

## Task 8: Browser token storage hardening and UX copy

**Files:**

- Modify: remote/browser pairing settings components.
- Modify if chosen: session TTL constants or auth issuance policy.
- Test: relevant settings/runtime tests.

- [ ] Add concise copy where browser-saved remote environments are paired: bearer tokens are stored in this browser profile.
- [ ] Prefer desktop secret storage when `desktopBridge` is present.
- [ ] Consider shorter bearer TTLs for browser-only remote sessions.
- [ ] Ensure logout/revoke removes browser-saved bearer tokens.
- [ ] Add tests for token removal on revoke/logout if missing.

## Task 9: Full verification

- [ ] Run `bun fmt`.
- [ ] Run `bun lint`.
- [ ] Run `bun typecheck`.
- [ ] Run all focused tests added/modified with `bun run test ...`.
- [ ] Manually verify:
  - owner can use existing local app flows;
  - paired client cannot manage auth access or terminals;
  - remote reconnect uses `wsToken`;
  - project preview/edit still works for known projects;
  - clone rejects malicious leading-dash inputs.
