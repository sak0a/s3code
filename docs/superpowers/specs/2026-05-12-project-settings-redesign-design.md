# Project Settings Dialog Redesign

Status: design ready for implementation plan
Date: 2026-05-12

## Summary

The current `ProjectSettingsDialog` in `apps/web/src/components/Sidebar.tsx:1317` mixes editable settings with read-only information in a wide two-column layout. It shows the project root path in three places, displays a non-functional generic image placeholder twice, and gives equal visual weight to low-frequency developer fields and the most common one (display name). Worktree state is listed inside the settings dialog even though it is not a setting.

This design replaces the dialog with a sidebar-nav layout that mirrors the global `SettingsDialog`. It removes the duplications, adds a real custom project image (upload + remove with server-side storage), and exposes all git remotes with a per-project "preferred primary" choice instead of always taking the auto-detected one.

## Problems with the current dialog

Concrete issues observed in `apps/web/src/components/Sidebar.tsx:1317-1526`:

1. The project root path appears three times: in the header subtitle (`environmentLabel · cwd`), as the "Active project root" input, and as the "Base workspace" row inside the worktree list.
2. The header's `ImageIcon` and the right column's "Project image" card are both non-functional placeholders. There is no backend support for setting a project image today.
3. The right column mixes a non-functional image card, a remote link card, and a worktree summary. None of these are settings.
4. The "Project metadata folder" field (`.s3code`) is presented with the same visual weight as the display name even though most users never touch it.
5. `max-w-5xl` (1024 px) is too wide for what is effectively four form fields.
6. `resolveProjectRemoteLink` only surfaces the one auto-picked remote (priority: `upstream` > `origin` > alphabetical). Users with both an `origin` fork and an `upstream` parent have no way to see or pick between them from this dialog. The sidebar's "Open remote" then jumps to `upstream`, which surprises users whose primary working remote is `origin`.

## Goals

- Single, unambiguous place to edit each project setting.
- Match the global `SettingsDialog` shape (header + left nav + content area + footer) so the two dialogs feel like one family.
- Make the "Project image" affordance real: upload, store, display, remove.
- Expose all git remotes and let the user pin which one is the "primary" (used by the sidebar's "Open remote" action and the chat header link).
- Move worktree state out of the settings dialog — it is project state, not configuration, and is already visible in the sidebar.

## Non-goals

- Editing git remotes themselves. The source of truth remains `.git/config`. The dialog only displays remotes and stores a per-project preference for which one is "primary".
- Project image cropping UI on the client. The server resizes uploads to a 256×256 max while preserving aspect ratio.
- Project deletion / archival flows. Those stay in the existing context menu.
- Worktree management UI inside the dialog. Worktrees keep their existing sidebar treatment.

## Final design

### Dimensions and shell

- Dialog width: `max-w-[760px]` (down from `max-w-5xl`).
- Dialog height: `h-[min(70vh,620px)]`, matching the global `SettingsDialog` shape but slightly shorter since there are fewer sections.
- Layout: `header` / horizontal split (`nav` + scrollable content) / `footer`. Reuses `Dialog`, `DialogPopup`, `DialogTitle` from `apps/web/src/components/ui/dialog.tsx` and the same `ScrollArea` pattern as the global settings dialog.

### Header

- Title: `Project settings`.
- Subtitle: `<displayName> · <environmentLabel>`. The cwd is intentionally omitted — it is the editable field in the Location section, so the subtitle would otherwise duplicate it.
- No large icon (the current 64×64 generic image is removed).

### Left navigation

The nav follows the same shape as `SettingsDialog`: `w-12` icon-only on mobile, `sm:w-48` with labels on larger screens. Items:

| Section id | Label | Icon |
| --- | --- | --- |
| `general` | General | `Settings2Icon` |
| `location` | Location | `FolderOpenIcon` |
| `ai` | AI | `SparklesIcon` |

Selection state is local component state (no persistent store) since there is only one dialog instance and it is short-lived. Default section is `general`.

### General section

Vertical stack inside a `max-w-[520px]` content column:

**Project image.** 96×96 preview on the left, label + helper line + buttons on the right.

- Helper line: `PNG, JPG, or WebP · up to 2 MB`. When no custom image is set, the helper changes to `Using auto-detected favicon · upload to override`.
- Buttons: `Upload` (outline) and `Remove` (ghost, disabled when no custom image is set).
- Drag-and-drop on the preview is supported. A dashed outline appears on `dragover`.
- Resolution chain when rendering:
  1. If `project.customAvatarContentHash` is set, fetch from `/api/project-avatar?projectId=<id>` (cached by ETag).
  2. Else fetch from `/api/project-favicon?cwd=<cwd>` (existing endpoint).
  3. Else render `FolderIcon` fallback.

**Display name.** Plain `Input`. Enter submits the form. Empty string is rejected with a warning toast (same validation as today).

**Linked repositories.** Only rendered when the project has at least one git remote.

- Single-remote case: one row with the remote name, provider mark, owner/repo, and an `Open ↗` button. No primary selector.
- Multi-remote case: a card with one selectable row per remote plus a top "Auto-detect" row.
  - Top row: radio button labelled `Auto-detect (currently: <name>)` where `<name>` is what the existing priority logic would pick.
  - Each remote row: radio button + remote name + provider mark + owner/repo + per-row `Open ↗` button.
  - A `primary` badge is shown on whichever row is currently selected (the one with the active radio). This makes the radio choice's effect visible at a glance.
  - Header includes a small `<n> remotes` count and a one-line helper: `Pick which remote the sidebar "Open remote" uses.`
- Selection is saved as `project.preferredRemoteName: string | null` on the existing `project.meta.update` command via the dialog's `Save changes` button (same flow as display name and project root). `null` means "auto-detect".
- Stale-value handling: if a stored `preferredRemoteName` no longer matches any remote (remote renamed or deleted in `.git/config`), the radio falls back to "Auto-detect" visually and the `resolveProjectRemoteLink` resolver also falls back to the auto-picked locator. The stored value is left in place — it becomes active again if a remote with that name reappears.

### Location section

Vertical stack inside the same `max-w-[520px]` column:

**Project root.** `Input` with helper line `The absolute path the project is anchored to.` and a `Browse` button to its right that opens the native folder picker through the existing `api.dialogs.pickFolder` flow.

**Metadata folder.** `Input` with helper line `Where worktrees and project data are stored.` and `.s3code` placeholder.

**Worktree path preview.** A muted, monospaced read-only block below the two inputs showing `<root>/<metadataDir>/worktrees`. Updates live as either input changes.

### AI section

Single field inside the same `max-w-[520px]` column:

**Custom system prompt.** `Textarea` with `min-h-32 resize-y` and the existing `PROJECT_CUSTOM_SYSTEM_PROMPT_MAX_CHARS` limit (4000).

- Helper line: `Appended to every assistant prompt for this project.`
- Character counter in the bottom-right of the textarea showing `N / 4000`. Muted by default; amber within 10% of the limit; red at the limit.
- Empty string saves as `null` (existing behavior).

### Footer

- `Cancel` (ghost) — closes the dialog without saving. Same `closeProjectSettingsDialog` reset logic as today.
- `Save changes` — disabled when no field has changed, matching the existing dirty check. While saving, the label changes to `Saving…`.

## Data model and API changes

### Contracts (`packages/contracts/`)

**`Project` projection adds two fields:**

- `customAvatarContentHash: string | null` — hash of the currently stored avatar bytes. `null` means no custom image; the client falls back to the auto-favicon.
- `preferredRemoteName: string | null` — explicit remote name the user has chosen as primary. `null` means auto-detect (current behavior).

**`RepositoryIdentity` adds one field:**

- `remotes: ReadonlyArray<{ name: string; url: string; provider: SourceControlProviderKind | null; ownerRepo: string | null }>` — all remotes fetched from `git remote -v`. The existing `locator` and top-level `provider`/`owner`/`name` continue to describe the resolver's auto-picked primary so existing consumers do not break.

**`project.meta.update` command extends with one optional field:**

- `preferredRemoteName?: string | null` — same semantics as the projection field. When omitted, no change. When present and `null`, clear back to auto-detect.

**New command `project.avatar.set`:**

```ts
{
  type: "project.avatar.set",
  commandId: CommandId,
  projectId: ProjectId,
  contentHash: string | null, // null clears the avatar and deletes the file
}
```

### Server (`apps/server/`)

**`RepositoryIdentityResolver`** (`apps/server/src/project/Layers/RepositoryIdentityResolver.ts`):

- Continue using `pickPrimaryRemote` to choose the locator (no behavior change for existing consumers).
- Additionally project all parsed remotes into `RepositoryIdentity.remotes` using `detectSourceControlProviderFromGitRemoteUrl` for each and `normalizeGitRemoteUrl` for the canonical ownerRepo.

**Avatar upload endpoint** (new):

- `POST /api/project-avatar/upload?projectId=<id>` (multipart/form-data, field name `avatar`).
- Validates content type against `image/png`, `image/jpeg`, `image/webp`.
- Rejects payloads > 2 MB with HTTP 413.
- Resizes to 256×256 max with aspect preserved. Stores as PNG at `<server-data-dir>/project-avatars/<projectId>.png`.
- Returns `{ contentHash: string }` where `contentHash` is the sha256 of the stored PNG bytes.

**Avatar serving endpoint** (new):

- `GET /api/project-avatar?projectId=<id>`. Sends the stored PNG with `Cache-Control: private, max-age=0, must-revalidate` and a strong `ETag` derived from `contentHash`. Returns 404 when no custom avatar is set.

**Projector / decider:**

- `project.avatar.set` with a non-null `contentHash`: write `customAvatarContentHash` on the projection. Server trusts that the upload endpoint already wrote the file.
- `project.avatar.set` with `null`: delete the file at `<server-data-dir>/project-avatars/<projectId>.png` (best-effort, missing-file is fine) and write `customAvatarContentHash: null` on the projection.
- `project.meta.update` with `preferredRemoteName` present: write the field as-is to the projection.

### Web client (`apps/web/`)

**`ProjectFavicon`** (`apps/web/src/components/ProjectFavicon.tsx`):

- Accept an optional `customAvatarContentHash: string | null` prop.
- When the hash is non-null, build the src as `/api/project-avatar?projectId=<id>&v=<contentHash>` (the `v` cache-buster ensures hash changes invalidate the browser cache without server-side fingerprinting).
- Fall back to the existing favicon URL when the hash is null. The fallback chain to `FolderIcon` on load error is preserved.

**`ProjectSettingsDialog`** (`apps/web/src/components/Sidebar.tsx`):

- Replace the current implementation in-file. The dialog stays co-located with the parent state owner; the existing prop surface expands by:
  - `customAvatarContentHash: string | null`
  - `onAvatarUpload: (file: File) => Promise<void>` — handles the two-step flow (POST upload, then dispatch `project.avatar.set`)
  - `onAvatarRemove: () => Promise<void>` — dispatches `project.avatar.set` with `null`
  - `remotes: ReadonlyArray<{ name; url; provider; ownerRepo }>`
  - `preferredRemoteName: string | null`
  - `onPreferredRemoteChange: (name: string | null) => void`
- Drop the props that are no longer needed: `worktrees`, `onCopyPath`, related state in the parent (`projectSettingsWorktrees`, etc.).
- Local state owns the active nav section (`useState<"general" | "location" | "ai">("general")`).
- Save flow split: the project image saves immediately on upload/remove (two-step: HTTP upload, then `project.avatar.set` command). All other fields — display name, project root, metadata folder, custom system prompt, preferred remote — accumulate in local state and persist together via the `Save changes` button calling `project.meta.update`.
- The existing dirty-check therefore only needs to expand for `preferredRemoteNameChanged`. The image is never part of the Save-button dirty state because it commits on its own.
- Image upload UX: while the upload request is in flight, the preview shows a small loading state. On success, the local state's `customAvatarContentHash` is updated from the server response and the preview re-renders. On failure, a toast surfaces the error and the preview reverts.

**`resolveProjectRemoteLink`** (in `Sidebar.tsx`):

- Honor `project.preferredRemoteName`: if set and matched by a remote in `RepositoryIdentity.remotes`, use that remote. Otherwise fall back to the existing `locator` (which holds the auto-picked primary).

## Alternatives considered

### A. Single-column scrolling form (no left nav)

Smaller scope and arguably simpler. Rejected because the user explicitly asked for consistency with the global `SettingsDialog`, and the sidebar-nav pattern gives a clearer home for future additions (e.g., per-project model defaults, environment overrides).

### B. Tabs (`General` / `Advanced`)

Lighter than a full sidebar nav. Rejected for the same consistency reason. Tabs also do not scale as well to future per-project preference categories.

### C. Per-repo image stored inside `<metadataDir>/avatar.png`

Tempting because it would survive repo moves and could even be source-controlled. Rejected because:

- The project metadata folder is also synced into worktrees, which would unnecessarily duplicate the file across each worktree's metadata dir.
- The server-side store matches how the existing `/api/project-favicon` resolver is shaped.
- Per-projectId storage allows different worktrees of the same repo to have distinct avatars if a user wants.

### D. Store all remotes inside the projection instead of `RepositoryIdentity`

Considered separating "static identity" from "live remotes". Rejected because the resolver already runs git in the same code path that builds `RepositoryIdentity`, so producing the full list there avoids a second git invocation per project.

## Open questions

None at design time. All decisions captured above were either:

- Determined by the existing architecture (event sourcing, server-managed projects, current resolver).
- Confirmed by the user during the brainstorming session (sidebar-nav layout, full image upload, multi-remote with manual override, worktree list removed).
