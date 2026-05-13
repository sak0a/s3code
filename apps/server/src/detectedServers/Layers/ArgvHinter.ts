import type { ServerFramework } from "@s3tools/contracts";

export interface ArgvHint {
  framework: ServerFramework;
  isLikelyServer: boolean;
}

export interface PackageJsonShape {
  scripts?: Record<string, string>;
}

const DENY_TOKENS = new Set([
  "build",
  "test",
  "tsc",
  "eslint",
  "prettier",
  "playwright",
  "typecheck",
  "lint",
  "fmt",
]);

const SERVER_TRIGGER_TOKENS = new Set(["dev", "serve", "start", "watch"]);

const FRAMEWORK_TOKEN_MAP: ReadonlyArray<readonly [string, ServerFramework]> = [
  ["vite", "vite"],
  ["next", "next"],
  ["nuxt", "nuxt"],
  ["nuxi", "nuxt"],
  ["astro", "astro"],
  ["remix", "remix"],
  ["wrangler", "wrangler"],
  ["storybook", "storybook"],
  ["webpack-dev-server", "webpack"],
];

const PACKAGE_RUNNERS = new Set(["npm", "pnpm", "yarn", "bun"]);

export const hintFromArgv = (
  argv: ReadonlyArray<string>,
  pkg: PackageJsonShape | undefined,
): ArgvHint => {
  const tokens = argv.map((t) => t.toLowerCase());

  // Indirect invocation: <runner> run <script-name>
  if (
    tokens.length >= 3 &&
    PACKAGE_RUNNERS.has(tokens[0]!) &&
    tokens[1] === "run" &&
    pkg?.scripts?.[tokens[2]!]
  ) {
    const inner = pkg.scripts[tokens[2]!]!.split(/\s+/).filter(Boolean);
    return hintFromArgv(inner, undefined);
  }

  // Shortcut: <runner> dev / serve / start / watch (no explicit "run" keyword)
  if (
    tokens.length >= 2 &&
    PACKAGE_RUNNERS.has(tokens[0]!) &&
    SERVER_TRIGGER_TOKENS.has(tokens[1]!)
  ) {
    if (pkg?.scripts?.[tokens[1]!]) {
      const inner = pkg.scripts[tokens[1]!]!.split(/\s+/).filter(Boolean);
      return hintFromArgv(inner, undefined);
    }
  }

  // Special-case: vitest --ui (UI mode is a server; vitest run is not)
  if (tokens[0] === "vitest" && tokens.includes("--ui")) {
    return { framework: "vitest-ui", isLikelyServer: true };
  }

  // Framework token match
  for (const [tok, fw] of FRAMEWORK_TOKEN_MAP) {
    if (tokens[0]?.endsWith(tok) || tokens.includes(tok)) {
      const hasDeny = tokens.some((t) => DENY_TOKENS.has(t));
      if (hasDeny) return { framework: fw, isLikelyServer: false };
      return { framework: fw, isLikelyServer: true };
    }
  }

  // Generic server trigger tokens
  const hasServerTrigger = tokens.some((t) => SERVER_TRIGGER_TOKENS.has(t));
  const hasDeny = tokens.some((t) => DENY_TOKENS.has(t));
  if (hasServerTrigger && !hasDeny) {
    return { framework: "unknown", isLikelyServer: true };
  }

  return { framework: "unknown", isLikelyServer: false };
};
