# S3Code

S3Code is a minimal web GUI for coding agents (currently Codex, Claude, and
OpenCode, more coming soon).

## Why S3Code?

S3Code is aimed at being a small, practical coding-agent workspace with faster
day-to-day use, clearer local customization, and better visibility into provider
behavior.

Implemented fork improvements include:

- Diff line clicks can open the configured editor directly at the selected file
  and line.
- Appearance settings now include custom themes, live theme editing, import and
  export, and a reusable color picker component.
- Codex provider usage is surfaced for both weekly and 5-hour usage windows.
- The diff panel supports occurrence search for faster navigation inside large
  changes.
- The app can remember and use a default editor selection for editor-opening
  workflows.
- Symlinked project paths are handled as the same workspace as their resolved
  paths, which keeps setups like Dropbox on macOS working whether the project is
  opened from `/Users/you/Dropbox/...` or
  `/Users/you/Library/CloudStorage/Dropbox/...`.
- Chat composer can attach issues and pull/merge requests / work items from
  GitHub, GitLab, Bitbucket, or Azure DevOps as structured turn context —
  opened via a 📎 button in the footer or the `#` keyboard trigger, with
  per-provider tabs, search, dedup, and stale-on-send refetch. Title, body,
  and recent comments are forwarded to the agent alongside the prompt.
- The terminal toggle button under the chat composer now reflects the drawer's
  state, switching between "Open Terminal" and "Close Terminal" so the action is
  always unambiguous.

## Installation

> [!WARNING]
> S3 Code currently supports Codex, Claude, OpenCode and (Early Access Cursor)
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

```bash
npx s3code
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/sak0a/s3code/releases), or from your favorite package registry:

#### macOS (Homebrew)

```bash
brew install --cask s3-code
```

#### Arch Linux (AUR)

```bash
yay -S s3code-bin
```

## Some notes

We are very very early in this project. Expect bugs.

We are not accepting contributions yet.

Observability guide: [docs/observability.md](./docs/observability.md)

## If you REALLY want to contribute still.... read this first

Before local development, prepare the environment and install dependencies:

```bash
# Optional: only needed if you use mise for dev tool management.
mise install
bun install .
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.
