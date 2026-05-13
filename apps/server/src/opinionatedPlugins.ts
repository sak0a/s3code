import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ClaudeSettings,
  type ClaudeSettings as ClaudeSettingsConfig,
  defaultInstanceIdForDriver,
  OpinionatedPluginError,
  type OpinionatedPluginCatalogItem,
  type OpinionatedPluginId,
  type OpinionatedPluginInstallInput,
  type OpinionatedPluginInstallResult,
  type OpinionatedPluginStatus,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceConfigMap,
  type ProviderInstanceEnvironment,
  type ProviderInstanceId,
  type ServerProvider,
  type ServerSettings,
} from "@s3tools/contracts";
import { Schema } from "effect";

import { expandHomePath } from "./pathExpansion.ts";
import { runProcess, type ProcessRunResult } from "./processRunner.ts";
import { checkRtkAvailability, invalidateRtkAvailabilityCache } from "./tokenReduction.ts";

const RTK_ID = "rtk" satisfies OpinionatedPluginId;
const CAVEMAN_ID = "caveman" satisfies OpinionatedPluginId;
const TOKEN_OPTIMIZER_ID = "token-optimizer" satisfies OpinionatedPluginId;
const TOKEN_SAVIOR_ID = "token-savior" satisfies OpinionatedPluginId;
const LEAN_CTX_ID = "lean-ctx" satisfies OpinionatedPluginId;
const CODEX_DRIVER = ProviderDriverKind.make("codex");
const CLAUDE_DRIVER = ProviderDriverKind.make("claudeAgent");

const RTK_MANUAL_STEPS = [
  "Install RTK manually with Homebrew: brew install rtk-ai/tap/rtk",
  "Initialize shell integration: rtk init -g",
  "If Homebrew is unavailable, review RTK's official install script before running it.",
] as const;

const CAVEMAN_CODEX_MANUAL_STEPS = [
  "Codex Caveman support is experimental. Install it manually as a Codex skill, then refresh providers.",
] as const;

const TOKEN_OPTIMIZER_MANUAL_STEPS = [
  "Review the plugin's prompt changes before enabling it in any provider.",
  "Prefer S3Code token mode first; only add Token Optimizer if you want stricter response shaping.",
] as const;

const TOKEN_SAVIOR_MANUAL_STEPS = [
  "Use Token Savior as an MCP/code-index experiment for large repositories.",
  "Configure it per project so it can index the correct workspace root.",
] as const;

const LEAN_CTX_MANUAL_STEPS = [
  "Use LeanCTX as an MCP/code-index experiment for targeted repository context.",
  "Configure it per project so indexing and cache paths are scoped to that workspace.",
] as const;

const CATALOG: ReadonlyArray<OpinionatedPluginCatalogItem> = [
  {
    id: RTK_ID,
    name: "RTK",
    summary: "Compresses noisy CLI output before agents read it.",
    description:
      "A command proxy for git, package-manager, docker, cargo, and similar shell commands. It can substantially reduce input tokens when agents inspect large command output.",
    impact: "tool-output",
    scope: "global",
    homepageUrl: "https://www.rtk-ai.app/docs/",
    docsUrl: "https://www.rtk-ai.app/docs/",
    supportedDrivers: [CODEX_DRIVER, CLAUDE_DRIVER, ProviderDriverKind.make("opencode")],
    installNotes: [...RTK_MANUAL_STEPS],
  },
  {
    id: CAVEMAN_ID,
    name: "Caveman",
    summary: "Shortens agent prose for lower output-token usage.",
    description:
      "A terse-response plugin/skill that reduces assistant output tokens. Claude plugin installation is supported here; Codex skill usage is shown as experimental/manual.",
    impact: "assistant-output",
    scope: "provider-instance",
    homepageUrl: "https://github.com/JuliusBrussee/caveman",
    docsUrl: "https://github.com/JuliusBrussee/caveman/blob/main/INSTALL.md",
    supportedDrivers: [CLAUDE_DRIVER, CODEX_DRIVER],
    installNotes: [
      "Claude install uses the configured Claude binary and provider HOME.",
      "Codex support is treated as experimental and is not installed automatically.",
    ],
  },
  {
    id: TOKEN_OPTIMIZER_ID,
    name: "Token Optimizer",
    summary: "Prompt-level response compression for stricter token budgets.",
    description:
      "An assistant-output plugin pattern that nudges agents to produce shorter answers. S3Code surfaces it as a manual option because prompt-shaping plugins can overlap with token mode and provider-specific system prompts.",
    impact: "assistant-output",
    scope: "provider-instance",
    homepageUrl: "https://jean.build/docs/manage/opinionated-plugins",
    docsUrl: "https://jean.build/docs/manage/opinionated-plugins",
    supportedDrivers: [CLAUDE_DRIVER, CODEX_DRIVER],
    installNotes: [...TOKEN_OPTIMIZER_MANUAL_STEPS],
  },
  {
    id: TOKEN_SAVIOR_ID,
    name: "Token Savior",
    summary: "MCP/code-index context retrieval for large codebases.",
    description:
      "A manual MCP-style option for reducing broad file reads by retrieving narrower repository context. S3Code does not auto-install it because indexing scope and cache placement should be project-specific.",
    impact: "tool-output",
    scope: "global",
    homepageUrl: "https://jean.build/docs/manage/opinionated-plugins",
    docsUrl: "https://jean.build/docs/manage/opinionated-plugins",
    supportedDrivers: [CLAUDE_DRIVER, CODEX_DRIVER, ProviderDriverKind.make("opencode")],
    installNotes: [...TOKEN_SAVIOR_MANUAL_STEPS],
  },
  {
    id: LEAN_CTX_ID,
    name: "LeanCTX",
    summary: "MCP/code-index context retrieval with leaner project context.",
    description:
      "A manual MCP-style option for targeted context retrieval. It may reduce token usage on large repos, but should be enabled only where its index lifecycle is clear.",
    impact: "tool-output",
    scope: "global",
    homepageUrl: "https://jean.build/docs/manage/opinionated-plugins",
    docsUrl: "https://jean.build/docs/manage/opinionated-plugins",
    supportedDrivers: [CLAUDE_DRIVER, CODEX_DRIVER, ProviderDriverKind.make("opencode")],
    installNotes: [...LEAN_CTX_MANUAL_STEPS],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

function nonEmpty(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function commandString(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

function outputText(result: ProcessRunResult): string {
  return [result.stdout, result.stderr]
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n");
}

function pluginError(input: {
  readonly pluginId?: OpinionatedPluginId | undefined;
  readonly detail: string;
  readonly cause?: unknown;
}): OpinionatedPluginError {
  return new OpinionatedPluginError({
    ...(input.pluginId ? { pluginId: input.pluginId } : {}),
    detail: nonEmpty(input.detail) ?? "Unknown plugin error.",
    ...(input.cause !== undefined ? { cause: input.cause } : {}),
  });
}

function buildProviderConfigMap(settings: ServerSettings): ProviderInstanceConfigMap {
  const merged: Record<string, ProviderInstanceConfig> = { ...settings.providerInstances };
  for (const driver of [CODEX_DRIVER, CLAUDE_DRIVER]) {
    const instanceId = defaultInstanceIdForDriver(driver);
    if (instanceId in merged) continue;
    const legacyConfig = settings.providers[driver as keyof ServerSettings["providers"]];
    if (legacyConfig === undefined) continue;
    merged[instanceId] = {
      driver,
      config: legacyConfig,
    };
  }
  return merged as ProviderInstanceConfigMap;
}

function providerLabel(provider: ServerProvider): string {
  return provider.displayName ?? provider.badgeLabel ?? String(provider.instanceId);
}

function providerTargetStatusBase(provider: ServerProvider, pluginId: OpinionatedPluginId) {
  return {
    pluginId,
    targetKind: "provider-instance" as const,
    providerInstanceId: provider.instanceId,
    providerDriver: provider.driver,
    providerDisplayName: providerLabel(provider),
    checkedAt: nowIso(),
  };
}

function applyProviderEnvironment(
  environment: ProviderInstanceEnvironment | undefined,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (!environment || environment.length === 0) {
    return baseEnv;
  }
  const next = { ...baseEnv };
  for (const variable of environment) {
    next[variable.name] = variable.value;
  }
  return next;
}

function resolveClaudeHomePath(homePath: string | undefined): string {
  const trimmed = homePath?.trim() ?? "";
  return path.resolve(trimmed.length > 0 ? expandHomePath(trimmed) : os.homedir());
}

function decodeClaudeSettings(entry: ProviderInstanceConfig): ClaudeSettingsConfig {
  return Schema.decodeSync(ClaudeSettings)(entry.config ?? {});
}

function findCavemanMarker(root: string, depth: number): boolean {
  if (depth < 0) return false;
  let entries: ReadonlyArray<fs.Dirent>;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    const name = entry.name.toLowerCase();
    if (name.includes("caveman")) {
      return true;
    }
    if (entry.isDirectory() && findCavemanMarker(path.join(root, entry.name), depth - 1)) {
      return true;
    }
  }
  return false;
}

function isClaudeCavemanInstalled(homePath: string): boolean {
  const claudeRoot = path.join(homePath, ".claude");
  const candidateRoots = [
    path.join(claudeRoot, "plugins", "data"),
    path.join(claudeRoot, "plugins", "cache"),
    path.join(claudeRoot, "skills"),
  ];
  return candidateRoots.some((root) => findCavemanMarker(root, 4));
}

function buildClaudeCavemanStatus(input: {
  readonly provider: ServerProvider;
  readonly configMap: ProviderInstanceConfigMap;
}): OpinionatedPluginStatus {
  const base = providerTargetStatusBase(input.provider, CAVEMAN_ID);
  const entry = input.configMap[input.provider.instanceId];
  if (entry === undefined || entry.driver !== CLAUDE_DRIVER) {
    return {
      ...base,
      state: "error",
      canInstall: false,
      detail: "Claude provider settings are unavailable for this instance.",
      manualSteps: [],
    };
  }

  try {
    const claudeConfig = decodeClaudeSettings(entry);
    const homePath = resolveClaudeHomePath(claudeConfig.homePath);
    const installed = isClaudeCavemanInstalled(homePath);
    return {
      ...base,
      state: installed ? "installed" : "not-installed",
      canInstall: true,
      detail: installed
        ? `Detected Caveman files under ${path.join(homePath, ".claude")}.`
        : `Not detected under ${path.join(homePath, ".claude")}.`,
      manualSteps: [],
    };
  } catch (cause) {
    return {
      ...base,
      state: "error",
      canInstall: false,
      detail: cause instanceof Error ? cause.message : "Failed to decode Claude settings.",
      manualSteps: [],
    };
  }
}

function buildCodexCavemanStatus(provider: ServerProvider): OpinionatedPluginStatus {
  const installedSkill = provider.skills.find((skill) => /caveman/i.test(skill.name));
  return {
    ...providerTargetStatusBase(provider, CAVEMAN_ID),
    state: installedSkill ? "installed" : "not-installed",
    canInstall: false,
    detail: installedSkill
      ? `Detected Codex skill '${installedSkill.name}'.`
      : "Codex Caveman support is experimental; install it manually as a skill.",
    manualSteps: [...CAVEMAN_CODEX_MANUAL_STEPS],
  };
}

export function listOpinionatedPlugins() {
  return { plugins: [...CATALOG] };
}

export async function checkOpinionatedPlugins(input: {
  readonly settings: ServerSettings;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly pluginId?: OpinionatedPluginId | undefined;
}) {
  const statuses: OpinionatedPluginStatus[] = [];
  const include = (pluginId: OpinionatedPluginId) =>
    input.pluginId === undefined || input.pluginId === pluginId;

  if (include(RTK_ID)) {
    invalidateRtkAvailabilityCache();
    const availability = await checkRtkAvailability();
    statuses.push({
      pluginId: RTK_ID,
      targetKind: "global",
      state: availability.installed ? "installed" : "not-installed",
      canInstall: true,
      checkedAt: nowIso(),
      ...(availability.version ? { version: availability.version } : {}),
      detail: availability.installed
        ? "RTK is available on PATH."
        : (availability.detail ?? "RTK is not available on PATH."),
      manualSteps: [...RTK_MANUAL_STEPS],
    });
  }

  if (include(CAVEMAN_ID)) {
    const configMap = buildProviderConfigMap(input.settings);
    for (const provider of input.providers) {
      if (provider.driver === CLAUDE_DRIVER) {
        statuses.push(buildClaudeCavemanStatus({ provider, configMap }));
      } else if (provider.driver === CODEX_DRIVER) {
        statuses.push(buildCodexCavemanStatus(provider));
      }
    }
  }

  if (include(TOKEN_OPTIMIZER_ID)) {
    statuses.push({
      pluginId: TOKEN_OPTIMIZER_ID,
      targetKind: "global",
      state: "not-installed",
      canInstall: false,
      checkedAt: nowIso(),
      detail: "Tracked as a manual prompt/plugin option; S3Code token mode is built in.",
      manualSteps: [...TOKEN_OPTIMIZER_MANUAL_STEPS],
    });
  }

  if (include(TOKEN_SAVIOR_ID)) {
    statuses.push({
      pluginId: TOKEN_SAVIOR_ID,
      targetKind: "global",
      state: "not-installed",
      canInstall: false,
      checkedAt: nowIso(),
      detail: "Tracked as a manual MCP/code-index option for project-scoped evaluation.",
      manualSteps: [...TOKEN_SAVIOR_MANUAL_STEPS],
    });
  }

  if (include(LEAN_CTX_ID)) {
    statuses.push({
      pluginId: LEAN_CTX_ID,
      targetKind: "global",
      state: "not-installed",
      canInstall: false,
      checkedAt: nowIso(),
      detail: "Tracked as a manual MCP/code-index option for project-scoped evaluation.",
      manualSteps: [...LEAN_CTX_MANUAL_STEPS],
    });
  }

  return { statuses };
}

async function commandSucceeds(command: string, args: readonly string[]): Promise<boolean> {
  try {
    await runProcess(command, args, {
      timeoutMs: 5_000,
      maxBufferBytes: 16 * 1024,
      outputMode: "truncate",
    });
    return true;
  } catch {
    return false;
  }
}

async function installRtk(): Promise<OpinionatedPluginInstallResult> {
  const commands: string[] = [];
  const output: string[] = [];
  let availability = await checkRtkAvailability();

  if (!availability.installed) {
    const hasBrew = await commandSucceeds("brew", ["--version"]);
    if (!hasBrew) {
      throw pluginError({
        pluginId: RTK_ID,
        detail:
          "Homebrew is not available. Install RTK manually, then use Refresh to re-check status.",
      });
    }

    commands.push(commandString("brew", ["install", "rtk-ai/tap/rtk"]));
    const installResult = await runProcess("brew", ["install", "rtk-ai/tap/rtk"], {
      timeoutMs: 180_000,
      maxBufferBytes: 128 * 1024,
      outputMode: "truncate",
    });
    output.push(outputText(installResult));
  }

  commands.push(commandString("rtk", ["init", "-g"]));
  const initResult = await runProcess("rtk", ["init", "-g"], {
    timeoutMs: 60_000,
    maxBufferBytes: 64 * 1024,
    outputMode: "truncate",
  });
  output.push(outputText(initResult));

  invalidateRtkAvailabilityCache();
  availability = await checkRtkAvailability();
  return {
    pluginId: RTK_ID,
    commands,
    status: {
      pluginId: RTK_ID,
      targetKind: "global",
      state: availability.installed ? "installed" : "error",
      canInstall: true,
      checkedAt: nowIso(),
      ...(availability.version ? { version: availability.version } : {}),
      detail: availability.installed
        ? "RTK is installed and initialized."
        : (availability.detail ?? "RTK initialization completed but RTK was not found on PATH."),
      manualSteps: [...RTK_MANUAL_STEPS],
    },
    stdout: output.filter(Boolean).join("\n\n"),
  };
}

async function installClaudeCaveman(input: {
  readonly settings: ServerSettings;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly providerInstanceId: ProviderInstanceId;
  readonly cwd: string;
}): Promise<OpinionatedPluginInstallResult> {
  const configMap = buildProviderConfigMap(input.settings);
  const entry = configMap[input.providerInstanceId];
  const provider = input.providers.find(
    (candidate) => candidate.instanceId === input.providerInstanceId,
  );
  if (entry === undefined || entry.driver !== CLAUDE_DRIVER || provider?.driver !== CLAUDE_DRIVER) {
    throw pluginError({
      pluginId: CAVEMAN_ID,
      detail: "Caveman automatic install is only supported for Claude provider instances.",
    });
  }

  let claudeConfig: ClaudeSettingsConfig;
  try {
    claudeConfig = decodeClaudeSettings(entry);
  } catch (cause) {
    throw pluginError({
      pluginId: CAVEMAN_ID,
      detail: cause instanceof Error ? cause.message : "Failed to decode Claude settings.",
      cause,
    });
  }

  const env = {
    ...applyProviderEnvironment(entry.environment),
    HOME: resolveClaudeHomePath(claudeConfig.homePath),
  };
  const command = claudeConfig.binaryPath || "claude";
  const commands = [
    commandString(command, ["plugin", "marketplace", "add", "JuliusBrussee/caveman"]),
    commandString(command, ["plugin", "install", "caveman@caveman"]),
  ];
  const output: string[] = [];

  for (const args of [
    ["plugin", "marketplace", "add", "JuliusBrussee/caveman"] as const,
    ["plugin", "install", "caveman@caveman"] as const,
  ]) {
    const result = await runProcess(command, args, {
      cwd: input.cwd,
      env,
      timeoutMs: 180_000,
      maxBufferBytes: 128 * 1024,
      outputMode: "truncate",
    });
    output.push(outputText(result));
  }

  return {
    pluginId: CAVEMAN_ID,
    commands,
    status: buildClaudeCavemanStatus({ provider, configMap }),
    stdout: output.filter(Boolean).join("\n\n"),
  };
}

export async function installOpinionatedPlugin(input: {
  readonly request: OpinionatedPluginInstallInput;
  readonly settings: ServerSettings;
  readonly providers: ReadonlyArray<ServerProvider>;
  readonly cwd: string;
}): Promise<OpinionatedPluginInstallResult> {
  try {
    switch (input.request.pluginId) {
      case RTK_ID:
        return await installRtk();
      case CAVEMAN_ID:
        if (input.request.providerInstanceId === undefined) {
          throw pluginError({
            pluginId: CAVEMAN_ID,
            detail: "Choose a Claude provider instance before installing Caveman.",
          });
        }
        return await installClaudeCaveman({
          settings: input.settings,
          providers: input.providers,
          providerInstanceId: input.request.providerInstanceId,
          cwd: input.cwd,
        });
      case TOKEN_OPTIMIZER_ID:
      case TOKEN_SAVIOR_ID:
      case LEAN_CTX_ID:
        throw pluginError({
          pluginId: input.request.pluginId,
          detail: "This plugin is tracked as a manual option and is not installed automatically.",
        });
    }
  } catch (cause) {
    if (Schema.is(OpinionatedPluginError)(cause)) {
      throw cause;
    }
    throw pluginError({
      pluginId: input.request.pluginId,
      detail: cause instanceof Error ? cause.message : "Plugin install failed.",
      cause,
    });
  }
}
