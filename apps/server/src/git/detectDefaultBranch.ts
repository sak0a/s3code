export type GitExec = (
  args: ReadonlyArray<string>,
) => Promise<{ readonly stdout: string; readonly exitCode: number }>;

function normalizeOriginHead(stdout: string): string | null {
  const ref = stdout.trim();
  if (ref.length === 0) {
    return null;
  }

  const branch = ref.replace(/^refs\/remotes\/origin\//u, "").replace(/^origin\//u, "");
  return branch.length > 0 ? branch : null;
}

function firstListedBranch(stdout: string): string | null {
  for (const line of stdout.split("\n")) {
    const branch = line.trim().replace(/^\*\s*/u, "");
    if (branch.length > 0) {
      return branch;
    }
  }
  return null;
}

export async function detectDefaultBranch(cwd: string, exec: GitExec): Promise<string> {
  void cwd;

  const attempts: ReadonlyArray<() => Promise<string | null>> = [
    async () => {
      const result = await exec(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
      return result.exitCode === 0 ? normalizeOriginHead(result.stdout) : null;
    },
    async () => {
      const result = await exec(["show-ref", "--verify", "--quiet", "refs/heads/main"]);
      return result.exitCode === 0 ? "main" : null;
    },
    async () => {
      const result = await exec(["show-ref", "--verify", "--quiet", "refs/heads/master"]);
      return result.exitCode === 0 ? "master" : null;
    },
    async () => {
      const result = await exec(["branch", "--list", "--format=%(refname:short)"]);
      return result.exitCode === 0 ? firstListedBranch(result.stdout) : null;
    },
  ];

  for (const attempt of attempts) {
    try {
      const branch = await attempt();
      if (branch) {
        return branch;
      }
    } catch {
      // Keep walking the fallback chain when git is unavailable or a probe fails.
    }
  }

  return "main";
}
