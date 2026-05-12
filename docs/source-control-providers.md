# Source Control Integrations

S3Code connects directly to your Git hosting provider so you can create pull requests, review code, and manage repositories without leaving your editor. Work stays in flow—no more jumping between browser tabs and terminal windows.

## Supported Providers

S3Code works with the platforms your team already uses:

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
- S3Code can suggest titles and descriptions based on your commits
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

1. Install the GitHub CLI on the machine running S3Code:
   ```bash
   brew install gh
   ```
2. Sign in:
   ```bash
   gh auth login
   ```
3. Open **Settings → Source Control** in S3Code and verify GitHub shows as authenticated

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
2. Add these environment variables to the environment running S3Code:
   ```bash
   export S3CODE_BITBUCKET_EMAIL="you@example.com"
   export S3CODE_BITBUCKET_API_TOKEN="your-token"
   ```
3. Restart S3Code and verify the connection in **Source Control settings**

### For Forgejo / Codeberg

Forgejo uses direct REST API access. Public Codeberg repositories can be read without a token; creating repositories or pull requests requires a token. If you already use the `fj` CLI, S3Code can read the token created by `fj auth login` or `fj auth add-key`.

1. Either sign in with `fj`:
   ```bash
   fj auth login
   ```
   or create an access token on your Forgejo instance with repository and pull request access
2. Add these environment variables to the environment running S3Code:
   ```bash
   export S3CODE_FORGEJO_BASE_URL="https://codeberg.org"
   export S3CODE_FORGEJO_TOKEN="your-token"
   ```
   If you use `fj`, `S3CODE_FORGEJO_TOKEN` is optional. To point S3Code at a non-standard `fj` credentials file, set:
   ```bash
   export S3CODE_FORGEJO_CLI_KEYS_FILE="/path/to/keys.json"
   ```
3. For multiple instances without `fj`, set `S3CODE_FORGEJO_INSTANCES` to a JSON array:
   ```bash
   export S3CODE_FORGEJO_INSTANCES='[{"baseUrl":"https://codeberg.org","token":"codeberg-token"},{"baseUrl":"https://forge.example.com","token":"self-hosted-token"}]'
   ```
4. Restart S3Code and verify the connection in **Source Control settings**

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

**Git is required** – S3Code uses Git for all local operations. Ensure `git` is installed on your server.

**Server-side setup** – Authentication happens on the machine running S3Code (the server), not your local browser. If you're using a hosted or team instance, your administrator may have already configured providers.

**Common issues:**

- **Provider shows "Not authenticated"** – Run the login command for that provider (e.g., `gh auth login`) in a terminal on the server, then rescan in Settings
- **Bitbucket not connecting** – Double-check your environment variables are set in the correct shell profile and the server was restarted
- **Forgejo not connecting** – Confirm `S3CODE_FORGEJO_BASE_URL` points at the instance root and the token has repository access; if you use `fj`, run `fj auth list` on the server and confirm the host is present
- **Can't push to a remote** – Verify your Git remote URL matches the provider you've authenticated with (SSH vs HTTPS remotes may need different credentials)

**Need more help?** Check your provider's CLI documentation:

- [GitHub CLI](https://cli.github.com/)
- [GitLab CLI](https://gitlab.com/gitlab-org/cli)
- [Forgejo API Usage](https://forgejo.org/docs/latest/user/api-usage/)
- [Forgejo CLI (`fj`)](https://codeberg.org/forgejo-contrib/forgejo-cli)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/)
