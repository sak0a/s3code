# S3Code

S3Code is a fork of T3 Code, a minimal Agent GUI for coding agents (currently Codex,
Claude, and OpenCode, Cursor, more coming soon).

The fork is moving the project naming toward **S3Code**. Some commands, package
names, storage keys, and upstream references still use `t3`, `t3code`, or T3 Code
while the rename is completed.

## Why this fork?

S3Code keeps the original T3 Code goal of being a small, practical coding-agent
workspace, but pushes the product toward faster day-to-day use, clearer local
customization, and better visibility into provider behavior.

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

## Installation

> [!WARNING]
> T3 Code currently supports Codex, Claude, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Run without installing

```bash
npx t3
```

### Desktop app

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

```bash
yay -S t3code-bin
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

Need support? Join the [Discord](https://discord.gg/jn4EGJjrvv).
