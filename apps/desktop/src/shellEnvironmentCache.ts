import * as FS from "node:fs";
import * as Path from "node:path";

import { mergePathEntries } from "@s3tools/shared/shell";

const CACHE_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_ENV_NAMES = [
  "PATH",
  "SSH_AUTH_SOCK",
  "HOMEBREW_PREFIX",
  "HOMEBREW_CELLAR",
  "HOMEBREW_REPOSITORY",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "FNM_DIR",
  "FNM_MULTISHELL_PATH",
] as const;

export interface ShellEnvironmentCacheRecord {
  readonly version: typeof CACHE_VERSION;
  readonly capturedAt: string;
  readonly platform: NodeJS.Platform;
  readonly shell: string | null;
  readonly environment: Partial<Record<(typeof CACHE_ENV_NAMES)[number], string>>;
}

export type ShellEnvironmentCacheReadResult =
  | { readonly kind: "hit"; readonly record: ShellEnvironmentCacheRecord }
  | { readonly kind: "miss"; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEnvironment(value: unknown) {
  if (!isRecord(value)) return null;

  const environment: ShellEnvironmentCacheRecord["environment"] = {};
  for (const name of CACHE_ENV_NAMES) {
    const raw = value[name];
    if (typeof raw === "string" && raw.length > 0) {
      environment[name] = raw;
    }
  }
  return environment;
}

export function pickShellEnvironment(env: NodeJS.ProcessEnv) {
  const environment: ShellEnvironmentCacheRecord["environment"] = {};
  for (const name of CACHE_ENV_NAMES) {
    const value = env[name];
    if (typeof value === "string" && value.length > 0) {
      environment[name] = value;
    }
  }
  return environment;
}

export function createShellEnvironmentCacheRecord(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
  readonly now?: Date;
}): ShellEnvironmentCacheRecord {
  return {
    version: CACHE_VERSION,
    capturedAt: (input.now ?? new Date()).toISOString(),
    platform: input.platform ?? process.platform,
    shell: input.env.SHELL ?? null,
    environment: pickShellEnvironment(input.env),
  };
}

export function readShellEnvironmentCache(
  cachePath: string,
  options: {
    readonly platform?: NodeJS.Platform;
    readonly now?: Date;
    readonly maxAgeMs?: number;
  } = {},
): ShellEnvironmentCacheReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(FS.readFileSync(cachePath, "utf8"));
  } catch {
    return { kind: "miss", reason: "unreadable" };
  }

  if (!isRecord(parsed) || parsed.version !== CACHE_VERSION) {
    return { kind: "miss", reason: "version" };
  }

  const platform = options.platform ?? process.platform;
  if (parsed.platform !== platform) {
    return { kind: "miss", reason: "platform" };
  }

  if (typeof parsed.capturedAt !== "string") {
    return { kind: "miss", reason: "capturedAt" };
  }

  const capturedAtMs = Date.parse(parsed.capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    return { kind: "miss", reason: "capturedAt" };
  }

  const nowMs = (options.now ?? new Date()).getTime();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (nowMs - capturedAtMs > maxAgeMs) {
    return { kind: "miss", reason: "stale" };
  }

  const environment = normalizeEnvironment(parsed.environment);
  if (!environment || Object.keys(environment).length === 0) {
    return { kind: "miss", reason: "environment" };
  }

  return {
    kind: "hit",
    record: {
      version: CACHE_VERSION,
      capturedAt: parsed.capturedAt,
      platform,
      shell: typeof parsed.shell === "string" && parsed.shell.length > 0 ? parsed.shell : null,
      environment,
    },
  };
}

export function applyShellEnvironmentCache(
  env: NodeJS.ProcessEnv,
  record: ShellEnvironmentCacheRecord,
): void {
  const cachedPath = record.environment.PATH;
  const mergedPath = mergePathEntries(cachedPath, env.PATH, record.platform);
  if (mergedPath) {
    env.PATH = mergedPath;
  }

  for (const name of CACHE_ENV_NAMES) {
    if (name === "PATH") continue;
    const value = record.environment[name];
    if (value && !env[name]) {
      env[name] = value;
    }
  }
}

export function writeShellEnvironmentCache(
  cachePath: string,
  record: ShellEnvironmentCacheRecord,
): void {
  FS.mkdirSync(Path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  FS.writeFileSync(tempPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, cachePath);
}
