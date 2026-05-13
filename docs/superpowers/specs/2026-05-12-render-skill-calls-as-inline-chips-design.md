# Render Skill Calls as Inline Chips — Design

## Background

Skill mentions in chat messages currently render as raw `$<skillName>` text.
When a user sends a message containing a valid skill token, the composer
strips/styles it, but the rendered message still shows the plain text. This
breaks the cohesion between the composer's chip-styled token and how it
appears in the conversation timeline once sent.

This is a faithful port of [t3code PR #2572](https://github.com/pingdotgg/t3code/pull/2572)
into our codebase. Our pre-port state matches t3code's pre-PR state 1:1 —
same file structure, same helper APIs (`formatProviderSkillDisplayName`),
same shared class constants in `composerInlineChip.ts`, same `ServerProvider.skills`
contract field — so the port maps file-for-file.

## Goals

- Render `$<skillName>` tokens as styled chips inside chat messages (user
  and assistant) when the token matches a known skill on the active
  provider.
- Reuse the composer's existing skill chip styling for visual consistency.
- Leave tokens that don't match a known skill rendered as plain text.
- Skip transformation inside markdown `code` and `a` nodes so that code
  fences, inline code, and link text are not corrupted.

## Non-Goals

- Adding new skill metadata, hover cards, or interactivity beyond the
  visual chip.
- Touching the composer's chip rendering pipeline (already works correctly).
- New tests beyond what the existing test suite covers (matches t3code's
  PR scope; AGENTS.md only requires `bun fmt`/`bun lint`/`bun typecheck`).

## Token Format

Match pattern: `/(^|\s)\$([a-zA-Z][a-zA-Z0-9:_-]*)(?=\s|$)/g`

- Must be preceded by start-of-string or whitespace
- Must be followed by whitespace or end-of-string
- Name starts with a letter, then allows letters, digits, `:`, `_`, `-`
- Match is only converted to a chip if the captured `name` matches the
  `name` field of a skill on the active provider's `skills` array

## Architecture

### New module: `apps/web/src/components/chat/SkillInlineText.tsx`

Two exported helpers:

1. `SkillInlineText({ text, skills })` — pure function component that
   scans a plain string for skill tokens and returns a fragment of mixed
   string slices and `<SkillChip>` elements. Used for user-message
   rendering where the source is a raw string, not a markdown AST.

2. `renderSkillInlineMarkdownChildren(children, skills)` — recursive
   helper that walks `ReactNode` children, replacing string leaves with
   `<SkillInlineText>` and recursing into element children. Skips `code`
   and `a` element types so inline code and link labels stay untouched.

Internal `SkillChip` component reuses the composer's chip class names so
it renders identically to the composer's `$skill` mention:

- `COMPOSER_INLINE_SKILL_CHIP_CLASS_NAME` for the wrapper
- `COMPOSER_INLINE_CHIP_ICON_CLASS_NAME` for the icon
- `COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME` for the label
- `SKILL_CHIP_ICON_SVG` for the icon markup

### Shared constant: `composerInlineChip.ts`

The icon SVG markup currently lives as a private const inside
`ComposerPromptEditor.tsx`. The port hoists it to the shared
`composerInlineChip.ts` module so both the composer and the new
`SkillChip` component reference the same source. The composer imports it
from there instead of redefining it locally.

### Threading `skills` through the render tree

`ChatView` → `MessagesTimeline` → `TimelineRowSharedState` (context) →
`UserMessageBody` and `ChatMarkdown`.

- `ChatView` already computes `activeProviderStatus`. Pass
  `activeProviderStatus?.skills ?? EMPTY_PROVIDER_SKILLS` to
  `MessagesTimeline`.
- `MessagesTimeline` accepts a new optional `skills` prop, adds it to
  `TimelineRowSharedState`, and forwards it to `UserMessageBody` and
  `ChatMarkdown`.
- `UserMessageBody` uses `SkillInlineText` for raw text rendering. In
  the branch that interleaves text segments with inline terminal-context
  labels, each text slice is wrapped in `SkillInlineText` so chips and
  terminal-context chips can coexist in a single message.
- `ChatMarkdown` accepts an optional `skills` prop, defaults to
  `EMPTY_MARKDOWN_SKILLS`, and overrides the `p` and `li` markdown
  components to wrap children via `renderSkillInlineMarkdownChildren`.
  The `skills` value is added to the `markdownComponents` `useMemo` dep
  list so the renderer rebuilds when the provider's skill set changes.

### Performance considerations

- `EMPTY_PROVIDER_SKILLS` / `EMPTY_TIMELINE_SKILLS` / `EMPTY_MARKDOWN_SKILLS`
  module-level constants keep the default reference stable so React's
  shallow equality on `useMemo`/`memo` continues to work as before.
- The token scan is `O(text length)` and only runs on text leaves; for
  messages without skill tokens it produces a single fragment and falls
  through quickly.
- `skills` is added to `MessagesTimeline`'s `sharedState` `useMemo` and
  to `ChatMarkdown`'s `markdownComponents` `useMemo` dep arrays so
  stable provider skill arrays don't churn renders.

## File-Level Changes

| File                                                | Change                                                                                                          |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/components/composerInlineChip.ts`     | Add `SKILL_CHIP_ICON_SVG` constant                                                                              |
| `apps/web/src/components/ComposerPromptEditor.tsx`  | Remove local `SKILL_CHIP_ICON_SVG`; import from `composerInlineChip`                                            |
| `apps/web/src/components/chat/SkillInlineText.tsx`  | NEW — exports `SkillInlineText`, `renderSkillInlineMarkdownChildren`                                            |
| `apps/web/src/components/ChatMarkdown.tsx`          | Add optional `skills` prop; override `p` and `li` to wrap children                                              |
| `apps/web/src/components/chat/MessagesTimeline.tsx` | Add optional `skills` prop; thread through `TimelineRowSharedState`; use `SkillInlineText` in `UserMessageBody` |
| `apps/web/src/components/ChatView.tsx`              | Add `EMPTY_PROVIDER_SKILLS` constant; pass `activeProviderStatus?.skills` to `MessagesTimeline`                 |

## Acceptance Criteria

- `$known-skill` in a user message renders as a styled chip identical
  to the composer's chip.
- `$known-skill` in an assistant markdown message renders as a styled
  chip inside `<p>` and `<li>` blocks.
- `$unknown` (not in `activeProviderStatus.skills`) renders as plain
  text.
- `$skill` inside a markdown link text or inline code stays as plain
  text.
- `bun fmt`, `bun lint`, and `bun typecheck` all pass.
