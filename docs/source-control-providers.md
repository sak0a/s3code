# Source Control Integrations

Ryco connects directly to your Git hosting provider so you can create pull requests, review code, and manage repositories without leaving your editor. Work stays in flow—no more jumping between browser tabs and terminal windows.

## Supported Providers

Ryco works with the platforms your team already uses:

- **GitHub** – Pull requests, repository creation, and clone integration
- **GitLab** – Merge requests, repository publishing, and hosted clones
- **Forgejo / Codeberg** – Pull requests, issues, repository publishing, and hosted clones
- **Bitbucket** – Pull request workflows (via API token authentication)
- **Azure DevOps** – Pull request support for Microsoft-hosted repositories

## What You Can Do

### Start Projects from Anywhere

**Clone repositories directly**

- Open the Command Palette (`Cmd/Ctrl + K`) → **Add Project**
- Choose **GitHub repository**, **GitLab repository**, **Forgejo repository**, **Bitbucket repository**, **Azure DevOps repository**, or paste any **Git URL**
- Enter the repository path (`owner/repo`, `group/project`, `workspace/repository`, or `project/repository`) or a full Git URL, pick a destination, and start coding

**Publish local projects to the cloud**

- Have a local Git repository without a remote?
- Use the **Publish Repository** action to create a new hosted repository (GitHub, GitLab, Forgejo, Bitbucket, or Azure DevOps), add it as your origin remote, and push—all in one flow
- Perfect for turning a weekend prototype into a real project

### Manage Code Reviews Without Context Switching

**Create pull requests while you work**

- Push a branch and create a pull request from the Git panel
- Ryco can suggest titles and descriptions based on your commits
- Supports GitHub Pull Requests, GitLab Merge Requests, Forgejo Pull Requests, and Bitbucket Pull Requests

**Stay on top of open reviews**

- See if your current branch already has an open PR/MR
- Open the review directly in your browser with one click
- Check out a teammate's branch to review code locally

### Know Your Setup at a Glance

The **Source Control settings** page shows you exactly what's connected:

- ✅ Which providers are authenticated and ready
- ⚠️ What's missing and how to fix it
- 👤 Which account is signed in (when available)

Run a quick **Rescan** after setting up a new machine or changing credentials.

## Getting Started

### For GitHub (Recommended for most users)

1. Install the GitHub CLI on the machine running Ryco:
   ```bash
   brew install gh
   ```
2. Sign in:
   ```bash
   gh auth login
   ```
3. Open **Settings → Source Control** in Ryco and verify GitHub shows as authenticated

That's it—you can now clone, publish, and create pull requests.

### For GitLab

1. Install the GitLab CLI:
   ```bash
   brew install glab
   ```
2. Authenticate:
   ```bash
   glab auth login
   ```
3. Check **Settings → Source Control** to confirm the connection

### For Bitbucket

Bitbucket uses API tokens instead of a CLI tool:

1. Create an API token in your Atlassian account with read/write access to pull requests and repositories
2. Add these environment variables to the environment running Ryco:
   ```bash
   export RYCO_BITBUCKET_EMAIL="you@example.com"
   export RYCO_BITBUCKET_API_TOKEN="your-token"
   ```
3. Restart Ryco and verify the connection in **Source Control settings**

### For Forgejo / Codeberg

Forgejo uses direct REST API access. Public Codeberg repositories can be read without a token; creating repositories or pull requests requires a token. If you already use the `fj` CLI, Ryco can read the token created by `fj auth login` or `fj auth add-key`; Ryco still calls Forgejo's API directly after it has found that token.

Choose one of the following setup methods.

#### Option A: Use the Forgejo CLI (`fj`)

1. Install `fj` on the machine running Ryco.
2. Sign in to Codeberg:
   ```bash
   fj auth login
   ```
3. Confirm the login. `fj whoami` may need an explicit host, so use:
   ```bash
   fj auth list
   fj -H codeberg.org whoami
   ```
4. Restart Ryco and open **Settings → Source Control → Rescan**. Forgejo should show the account and host, for example `saka on codeberg.org`.

Ryco looks for `fj` credentials in the standard Forgejo CLI data locations, including:

- macOS: `~/Library/Application Support/Cyborus.forgejo-cli/keys.json`
- Linux: `~/.local/share/forgejo-cli/keys.json`
- Linux with XDG: `$XDG_DATA_HOME/forgejo-cli/keys.json`

If your install stores the file somewhere else, point Ryco at it:

```bash
export RYCO_FORGEJO_CLI_KEYS_FILE="/path/to/keys.json"
```

#### Option B: Use Ryco environment variables

1. Create an access token on your Forgejo instance with read/write access to repositories and pull requests.
2. Add these environment variables to the environment running Ryco:
   ```bash
   export RYCO_FORGEJO_BASE_URL="https://codeberg.org"
   export RYCO_FORGEJO_TOKEN="your-token"
   ```
3. Restart Ryco and verify the connection in **Source Control settings**.

#### Option C: Configure multiple Forgejo instances

Set `RYCO_FORGEJO_INSTANCES` to a JSON array:

```bash
export RYCO_FORGEJO_INSTANCES='[{"baseUrl":"https://codeberg.org","token":"codeberg-token"},{"baseUrl":"https://forge.example.com","token":"self-hosted-token"}]'
```

Then restart Ryco and verify the connection in **Source Control settings**.

### For Azure DevOps

1. Install Azure CLI:
   ```bash
   brew install azure-cli
   ```
2. Add the DevOps extension:
   ```bash
   az extension add --name azure-devops
   ```
3. Sign in:
   ```bash
   az login
   ```

---

## Requirements & Troubleshooting

**Git is required** – Ryco uses Git for all local operations. Ensure `git` is installed on your server.

**Server-side setup** – Authentication happens on the machine running Ryco (the server), not your local browser. If you're using a hosted or team instance, your administrator may have already configured providers.

**Common issues:**

- **Provider shows "Not authenticated"** – Run the login command for that provider (e.g., `gh auth login`) in a terminal on the server, then rescan in Settings
- **Bitbucket not connecting** – Double-check your environment variables are set in the correct shell profile and the server was restarted
- **Forgejo not connecting** – If you use `fj`, run `fj auth list` and `fj -H codeberg.org whoami` on the server, then restart Ryco and rescan. If that works but Ryco still cannot authenticate, set `RYCO_FORGEJO_CLI_KEYS_FILE` to the `fj` `keys.json` path. If you use environment variables, confirm `RYCO_FORGEJO_BASE_URL` points at the instance root and the token has repository access.
- **Can't push to a remote** – Verify your Git remote URL matches the provider you've authenticated with (SSH vs HTTPS remotes may need different credentials)

**Need more help?** Check your provider's CLI documentation:

- [GitHub CLI](https://cli.github.com/)
- [GitLab CLI](https://gitlab.com/gitlab-org/cli)
- [Forgejo API Usage](https://forgejo.org/docs/latest/user/api-usage/)
- [Forgejo CLI (`fj`)](https://codeberg.org/forgejo-contrib/forgejo-cli)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/)
