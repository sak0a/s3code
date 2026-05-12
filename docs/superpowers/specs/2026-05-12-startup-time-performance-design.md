# Startup Time Performance Initiative

## Goal

Improve S3Code startup time without breaking existing desktop, server, or web
behavior.

Primary target: **desktop packaged cold start**, from app launch to a usable
S3Code window with the primary environment connected.

Supporting targets:

- Server CLI startup: process start to listening/ready.
- Web initial load: route boot to shell/sidebar ready.
- Reconnect startup: WebSocket reconnect to shell snapshot applied.

The work should reduce real blocking work first, not only mask latency with
loading UI.

## Non-goals

- No WebSocket protocol changes.
- No provider settings schema removals.
- No authentication or pairing flow changes.
- No port-selection behavior changes beyond measurement.
- No broad ChatView or Sidebar refactor.
- No SQLite pragma tuning without a benchmark proving benefit.
- No projection data model rewrite in the first phase.
- No change to the requirement that desktop-launched backends can find provider
  CLIs such as `codex`, `claude`, `cursor`, and `opencode`.

## Startup Definitions

Desktop packaged startup is measured as:

1. `desktop.launch`: Electron main process begins executing app code.
2. `desktop.ready`: `app.whenReady()` resolves.
3. `desktop.backend.spawn`: backend child process spawn is requested.
4. `desktop.backend.listening`: backend emits the listening signal or the
   environment endpoint responds.
5. `web.root.ready`: root route finishes environment/auth bootstrap.
6. `web.ws.connected`: primary WebSocket is connected.
7. `web.shell.applied`: primary shell snapshot is applied to the store.
8. `desktop.window.usable`: main window is visible and the primary shell is
   ready enough for sidebar/session interaction.

Server CLI startup is measured as process start to HTTP listening plus command
gate readiness.

Web startup is measured as document load to primary shell snapshot applied.

## Current Bottlenecks

### Desktop shell environment capture

`apps/desktop/src/main.ts` calls `syncShellEnvironment()` at module load. The
shared implementation uses a synchronous login-shell process with a 5s timeout.
This can block Electron before `app.whenReady()`, especially on macOS machines
with slow shell startup files.

This path exists for a good reason: provider CLIs are often only available from
the user's login shell environment. The optimization must preserve that
reliability.

### Saved environment fan-out

`apps/web/src/environments/runtime/service.ts` creates the primary connection,
then connects every saved environment with `Promise.all`. A user with many saved
environments pays for multiple WebSockets, metadata reads, config/lifecycle
subscriptions, and shell snapshots during initial app startup.

### Startup bundle weight from icons

`apps/web/src/vscode-icons.ts` imports the full VS Code icon manifest and
language association JSON. Lightweight helpers such as `basenameOfPath` are
imported by composer code, so startup can pay the parse cost for icon data before
any icon lookup is needed.

### Static asset serving

`apps/server/src/http.ts` stats and reads static files for each request and does
not set cache headers for hashed build assets. This adds avoidable work during
desktop/web startup and prevents the browser from reusing immutable assets as
effectively as it could.

### Projection and provider startup work

Recent code already moved several provider and source-control operations into
background paths. Remaining candidates include provider instance materialization
for disabled/default providers and per-event projection work. These are worth
addressing after baseline measurements, but they are not first-phase startup
fixes because they carry more correctness risk.

## Design

### 1. Startup instrumentation baseline

Add low-overhead timings before changing behavior.

Desktop:

- Add a small `startupTiming` helper in `apps/desktop`.
- Mark launch, app ready, shell environment start/end/cache hit/cache miss,
  backend spawn, backend listening, window create, first reveal, and backend
  readiness source.
- Write timings to the existing desktop log sink. Do not add a new telemetry
  service.

Server:

- Reuse existing Effect spans/logging where available.
- Add explicit phase logs for config resolution, directory preparation, SQLite
  setup/migrations, provider registry hydration, runtime startup, HTTP
  listening, and command gate readiness.
- Log shell snapshot query duration and result sizes for projects, worktrees,
  threads, and sessions.

Web:

- Add dev-safe `performance.mark`/`performance.measure` helpers for root route
  boot, primary WebSocket connect, primary shell snapshot received, shell
  snapshot applied, and first usable shell.
- Keep browser timing code inert when `performance` is unavailable.

The first implementation task should land instrumentation with tests before any
optimization, so before/after numbers are comparable.

### 2. Desktop shell environment cache and deferred refresh

Replace top-level synchronous shell environment capture with a cache-first
startup flow.

Behavior:

- Read a persisted shell environment cache synchronously from desktop user data.
  The cache stores only the small set of environment variables currently captured
  by `syncShellEnvironment()`, plus shell path, created time, and source.
- Apply a valid cache to `process.env` before `startBackend()`.
- Start an async login-shell refresh during bootstrap. If it completes before
  backend spawn, use the fresh value. If it does not, use the valid cache.
- If no valid cache exists, preserve current reliability by waiting for one
  login-shell capture before backend spawn, with the existing timeout semantics.
- Persist successful refreshes atomically for the next launch.
- If refresh fails but a cache exists, log the error and continue with the cache.
- If refresh fails and no cache exists, fall back to inherited process env and
  surface the existing provider-unavailable behavior rather than crashing the
  desktop app.

This gives returning users a faster path while keeping first-run behavior safe.
Moving the work out of module top-level also lets Electron reach app readiness
without being blocked by shell startup files.

### 3. Saved environment staged connection

Keep the primary environment on the critical path and move saved environments
off it.

Behavior:

- Primary environment connection remains immediate.
- Saved environment registry hydration still happens at startup, but connection
  attempts are scheduled.
- Connect saved environments with a small concurrency limit, initially 1 or 2.
- Prioritize environments that are active, recently used, or visible in current
  UI state. Remaining environments connect after the primary shell is applied or
  during idle time.
- Manual user actions that target a saved environment promote that environment
  to immediate connection.
- Saved records remain visible while pending; the connection state should show
  pending/disconnected using existing status surfaces.
- Disconnect stale saved environments exactly as today.

The public environment model does not change. This only changes connection
timing.

### 4. Web icon manifest split

Separate path helpers from heavy icon data.

Behavior:

- Move `basenameOfPath` and `inferEntryKindFromPath` into a lightweight module
  that imports no JSON manifest.
- Keep `getVscodeIconUrlForEntry` in an icon-specific module.
- Update composer code that only needs path helpers to import from the light
  module.
- Where icon lookup is needed, keep the current visual result. If dynamic import
  is used for icon lookup, render the existing generic file/folder icon until the
  manifest is loaded.
- Preserve all existing icon lookup tests, adding tests for the light helper
  module.

This is a pure bundle/startup optimization with no contract changes.

### 5. Static asset serving cache behavior

Make static serving cheaper and more browser-cache friendly.

Behavior:

- Serve immutable hashed assets with long-lived cache headers.
- Serve `index.html` with no-cache or short cache headers so app updates are not
  trapped.
- Avoid rereading `index.html` for every SPA fallback request. Either use
  `HttpServerResponse.file` if it handles streaming and headers cleanly, or add a
  tiny in-memory cache keyed by path plus mtime/size.
- Keep path traversal checks and MIME behavior intact.
- Keep attachment and favicon routes unchanged except where shared cache helper
  code is directly reusable.

### 6. Follow-up runtime/startup reductions

These are valuable, but should follow instrumentation and first-phase startup
fixes:

- Provider instance registry: represent disabled instances with lightweight
  snapshots and defer full driver creation until enabled or used.
- Projection pipeline: route event types only to relevant projectors, then
  reduce per-event transactions.
- Thread shell summaries: replace full message/plan/activity reloads with
  incremental counters or targeted SQL aggregates.
- Store shell snapshots: apply structural diffs instead of rebuilding all shell
  records on every snapshot.
- Streaming markdown: render streaming code fences as plain text or debounce
  highlighting, then cache final Shiki output after completion.

## Data and Compatibility

- Shell environment cache is local desktop data only. It is not synced and does
  not affect server data formats.
- No contract package changes are required for phase one.
- No database migration is required for phase one.
- Saved environment staging uses existing saved environment records and existing
  connection state.
- Static cache behavior only affects HTTP response headers and server-side file
  reads.

## Error Handling

- Shell env cache parse failure: ignore the cache, log once, and refresh from
  login shell.
- Shell env refresh timeout: use valid cache if present; otherwise keep current
  first-run fallback behavior.
- Saved environment connection failure: preserve current per-environment runtime
  error handling. A failed saved environment must not block primary readiness.
- Static file cache mismatch or read failure: fall back to current error
  responses.
- Instrumentation failures must never block startup.

## Testing

Required verification for implementation PRs:

- `bun fmt`
- `bun lint`
- `bun typecheck`
- Targeted `bun run test` suites for changed modules

Targeted coverage:

- Shell environment cache read/write, invalid cache, stale cache, refresh
  fallback, and first-run no-cache behavior.
- Saved environment scheduler ordering, concurrency, cancellation, and manual
  promotion.
- Icon helper split and existing icon lookup behavior.
- Static asset cache headers and SPA fallback behavior.
- Startup timing helper name/phase formatting.

Manual validation:

- Desktop packaged launch with existing shell cache.
- Desktop packaged first launch with no shell cache.
- Desktop launch when login shell is slow or fails.
- Web startup with zero saved environments.
- Web startup with many saved environments.
- Browser reload verifies static asset cache headers and fresh `index.html`.

## Risks

- **Provider CLI lookup regression.** Mitigated by keeping first-run shell
  refresh before backend spawn when no valid cache exists.
- **Stale shell environment.** Mitigated by refreshing asynchronously every
  launch and persisting successful refreshes.
- **Saved environment appears disconnected for longer.** Mitigated by preserving
  records, showing existing pending/disconnected state, and promoting on user
  interaction.
- **Bundle split changes icon timing.** Mitigated by keeping generic fallback
  icons and preserving final icon lookup behavior.
- **Static cache traps old app shell.** Mitigated by no-cache behavior for
  `index.html` and long-lived caching only for hashed immutable assets.

## Rollout

Implement in small PR-sized phases:

1. Instrumentation only.
2. Desktop shell env cache/deferred refresh.
3. Saved environment staged connection.
4. Icon manifest split.
5. Static asset cache behavior.
6. Follow-up provider/projection/runtime reductions after measurement.

Each phase should be shippable independently and should preserve current
behavior when the optimization path cannot be used.
