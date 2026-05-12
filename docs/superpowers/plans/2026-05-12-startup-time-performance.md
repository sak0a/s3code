# Startup Time Performance Implementation Plan

> **For agentic workers:** Implement this plan task-by-task. Keep each task
> independently shippable, update checkboxes as work completes, and run the
> required verification commands before considering the implementation complete.

**Goal:** Improve desktop packaged cold-start time without breaking provider
CLI discovery, WebSocket contracts, auth/pairing, saved environment records, or
static app delivery.

**Architecture:** Measure first, then remove blocking startup work in staged
changes. The critical path is desktop launch -> backend listening -> web root
ready -> primary WebSocket connected -> primary shell snapshot applied. Phase one
does not change contracts or database schemas.

**Required verification:** `bun fmt`, `bun lint`, `bun typecheck`, and targeted
`bun run test` suites for changed modules. Do not run `bun test`.

**Out of scope for this plan:**

- Projection pipeline rewrite
- Provider driver lazy materialization
- Broad ChatView or Sidebar decomposition
- SQLite pragma changes
- New auth, pairing, or port-selection behavior

---

## Task 1: Add startup timing instrumentation

**Purpose:** Establish before/after startup timings without changing behavior.

**Files:**

- Create: `apps/desktop/src/startupTiming.ts`
- Modify: `apps/desktop/src/main.ts`
- Create: `apps/web/src/perf/startupInstrumentation.ts`
- Modify: `apps/web/src/routes/__root.tsx`
- Modify: `apps/web/src/environments/runtime/service.ts`
- Modify: `apps/server/src/serverRuntimeStartup.ts`
- Modify: `apps/server/src/config.ts`
- Modify: `apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts`
- Add tests near new pure helpers where practical

- [ ] Add a desktop timing helper with `markStartupPhase(name)` and
      `measureStartupPhase(start, end)` functions. It should use monotonic time and
      write concise entries to the existing desktop log sink.
- [ ] Mark desktop launch, `app.whenReady()`, shell-env start/end, backend spawn,
      backend listening, window creation, first reveal, and backend readiness source.
- [ ] Add server phase logs for config resolution, directory setup, SQLite setup,
      runtime startup, HTTP listening, and command gate readiness.
- [ ] Add shell snapshot timing/result-size logs around
      `ProjectionSnapshotQuery.getShellSnapshot`.
- [ ] Add web `performance.mark` helpers for root boot, auth/environment ready,
      primary WebSocket connect, shell snapshot received, shell snapshot applied, and
      first usable shell.
- [ ] Ensure all instrumentation is best-effort and never throws into startup
      code paths.
- [ ] Add unit tests for helper formatting and no-op behavior when browser
      `performance` is unavailable.
- [ ] Run targeted tests for new helper modules.
- [ ] Run `bun fmt`, `bun lint`, and `bun typecheck`.

**Acceptance criteria:**

- Desktop logs show ordered startup phases.
- Web dev builds expose startup measures through `performance.getEntriesByType("measure")`.
- Server logs identify shell snapshot duration and size.
- Startup behavior is otherwise unchanged.

---

## Task 2: Cache and defer desktop shell environment capture

**Purpose:** Remove synchronous login-shell work from Electron module load while
preserving provider CLI discovery.

**Files:**

- Create: `apps/desktop/src/shellEnvironmentCache.ts`
- Modify: `apps/desktop/src/main.ts`
- Modify if needed: `packages/shared/src/shell.ts`
- Add tests for the cache module and orchestration helpers

- [ ] Move `syncShellEnvironment()` out of top-level module execution in
      `apps/desktop/src/main.ts`.
- [ ] Introduce a cache file under the desktop user data path. Store only the
      variables currently captured by shell sync, plus shell path, captured time, and
      schema version.
- [ ] Implement atomic cache writes: write temp file, then rename.
- [ ] Implement cache reads that validate version, variable shape, and freshness.
      Invalid cache should be ignored with a single log entry.
- [ ] During bootstrap, start async shell refresh early.
- [ ] Before `startBackend()`, apply the freshest available environment in this
      order: completed refresh, valid cache, current first-run login-shell fallback.
- [ ] If no cache exists and refresh is slow, preserve first-run reliability by
      waiting for the existing login-shell timeout before backend spawn.
- [ ] If refresh fails and cache exists, start backend with the cache and log the
      refresh failure.
- [ ] If refresh fails and no cache exists, start backend with inherited env and
      rely on existing provider unavailable statuses instead of crashing.
- [ ] Persist successful refreshes for the next launch.
- [ ] Add tests for valid cache, invalid JSON, stale cache, refresh success,
      refresh failure with cache, and refresh failure without cache.
- [ ] Run targeted tests for desktop shell environment code.
- [ ] Run `bun fmt`, `bun lint`, and `bun typecheck`.

**Acceptance criteria:**

- Returning desktop launches do not block Electron module load on login-shell
  startup.
- First launch still gives provider CLIs the best available login-shell env.
- Backend child env remains compatible with existing provider discovery.

---

## Task 3: Stage saved environment connections

**Purpose:** Keep saved environments from competing with primary startup.

**Files:**

- Create: `apps/web/src/environments/runtime/savedEnvironmentConnectionScheduler.ts`
- Modify: `apps/web/src/environments/runtime/service.ts`
- Extend: `apps/web/src/environments/runtime/service.savedEnvironments.test.ts`
- Add scheduler unit tests

- [ ] Extract scheduling logic from `syncSavedEnvironmentConnections` into a
      pure/controller module.
- [ ] Keep stale saved environment disconnects immediate.
- [ ] Connect saved environments through a concurrency-limited queue, starting
      with concurrency `2`.
- [ ] Prioritize active/recently used/visible environments when that data is
      available. Keep deterministic insertion order as the fallback.
- [ ] Delay non-priority saved environment connection until after primary shell
      snapshot has been applied.
- [ ] Add manual promotion so a user action targeting a saved environment starts
      that connection immediately.
- [ ] Preserve existing runtime error behavior for failed saved environment
      connections.
- [ ] Ensure service disposal cancels pending scheduled connection attempts.
- [ ] Add tests for ordering, concurrency, cancellation, stale disconnects, and
      manual promotion.
- [ ] Run targeted saved environment tests.
- [ ] Run `bun fmt`, `bun lint`, and `bun typecheck`.

**Acceptance criteria:**

- Primary environment reaches shell-ready without waiting for all saved
  environments.
- Saved environments still connect automatically after startup.
- User-targeted saved environments connect immediately.
- No saved environment record format changes.

---

## Task 4: Split lightweight path helpers from VS Code icon manifest

**Purpose:** Avoid parsing large icon JSON during initial composer/app startup
when only path helpers are needed.

**Files:**

- Create: `apps/web/src/pathEntry.ts`
- Modify: `apps/web/src/vscode-icons.ts`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`
- Modify: `apps/web/src/components/ComposerPromptEditor.tsx`
- Modify: `apps/web/src/components/chat/VscodeEntryIcon.tsx` if dynamic loading
  is used
- Add/extend tests: `apps/web/src/pathEntry.test.ts`,
  `apps/web/src/vscode-icons.test.ts`

- [ ] Move `basenameOfPath` and `inferEntryKindFromPath` to `pathEntry.ts`.
- [ ] Ensure `pathEntry.ts` imports no icon manifest JSON.
- [ ] Update composer and prompt editor imports that only need path helpers.
- [ ] Keep icon lookup behavior in `vscode-icons.ts`.
- [ ] If dynamic import is used for icon lookup, render a stable generic
      file/folder fallback until lookup resolves.
- [ ] Add tests for path helper behavior.
- [ ] Preserve existing icon lookup tests.
- [ ] Build or inspect bundle output to verify the manifest is no longer pulled
      into composer-only paths.
- [ ] Run targeted tests for path/icon modules.
- [ ] Run `bun fmt`, `bun lint`, and `bun typecheck`.

**Acceptance criteria:**

- Path helper consumers do not import `vscode-icons-manifest.json`.
- File/folder icons resolve as before once the icon module is loaded.
- No user-facing icon regression beyond an optional transient generic fallback.

---

## Task 5: Improve static asset serving cache behavior

**Purpose:** Reduce repeated disk reads and let browsers reuse immutable assets.

**Files:**

- Modify: `apps/server/src/http.ts`
- Add/extend HTTP route tests if an existing harness is available

- [ ] Add a helper that classifies static responses:
  - `index.html`: `Cache-Control: no-cache`
  - hashed build assets: `Cache-Control: public, max-age=31536000, immutable`
  - other static files: short or no-cache behavior matching current update
    safety expectations
- [ ] Preserve existing path traversal checks.
- [ ] Use `HttpServerResponse.file` if it supports the needed headers and error
      handling cleanly. Otherwise add a tiny in-memory cache keyed by path, mtime,
      and size.
- [ ] Cache `index.html` fallback reads safely while preserving fresh update
      behavior.
- [ ] Keep attachment and favicon cache behavior intact.
- [ ] Add tests for cache headers, SPA fallback, path traversal rejection, and
      missing file behavior.
- [ ] Run targeted HTTP tests.
- [ ] Run `bun fmt`, `bun lint`, and `bun typecheck`.

**Acceptance criteria:**

- Hashed assets get immutable cache headers.
- `index.html` remains update-safe.
- Static file serving avoids unnecessary rereads where safe.
- Existing attachment and favicon routes keep their behavior.

---

## Task 6: Compare startup metrics and decide follow-ups

**Purpose:** Use the new measurements to choose the next safe optimization.

**Files:**

- Update: `docs/superpowers/specs/2026-05-12-startup-time-performance-design.md`
  only if measurements change scope or priorities
- Optional new note under `docs/` if the team wants persistent benchmark results

- [ ] Capture desktop packaged startup with no shell cache.
- [ ] Capture desktop packaged startup with a valid shell cache.
- [ ] Capture web startup with zero saved environments.
- [ ] Capture web startup with many saved environments.
- [ ] Capture browser reload behavior for static assets.
- [ ] Compare timings against the baseline from Task 1.
- [ ] Decide whether the next PR should target provider lazy materialization,
      projection routing, shell snapshot diffing, or streaming markdown highlighting.
- [ ] Run final `bun fmt`, `bun lint`, and `bun typecheck`.

**Acceptance criteria:**

- Before/after numbers are available for each changed startup path.
- Follow-up work is chosen based on measured remaining bottlenecks.
- No first-phase change requires users to migrate settings, sessions, or saved
  environments.
