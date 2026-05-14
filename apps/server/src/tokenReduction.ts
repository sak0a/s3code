import type { AgentTokenMode } from "@ryco/contracts";

import { runProcess } from "./processRunner.ts";

export interface RtkAvailability {
  readonly installed: boolean;
  readonly version?: string | undefined;
  readonly detail?: string | undefined;
}

let rtkAvailabilityCache: Promise<RtkAvailability> | undefined;

function parseRtkVersion(output: string): string | undefined {
  const trimmed = output.trim();
  if (!trimmed) return undefined;
  return trimmed.split(/\s+/).find((part) => /\d+\.\d+/.test(part)) ?? trimmed.split(/\r?\n/)[0];
}

async function loadRtkAvailability(): Promise<RtkAvailability> {
  try {
    const result = await runProcess("rtk", ["--version"], {
      timeoutMs: 3_000,
      maxBufferBytes: 16 * 1024,
      outputMode: "truncate",
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    const version = parseRtkVersion(output);
    return {
      installed: true,
      ...(version ? { version } : {}),
    };
  } catch (cause) {
    return {
      installed: false,
      detail: cause instanceof Error ? cause.message : "rtk is not available on PATH.",
    };
  }
}

export function checkRtkAvailability(): Promise<RtkAvailability> {
  rtkAvailabilityCache ??= loadRtkAvailability();
  return rtkAvailabilityCache;
}

export function invalidateRtkAvailabilityCache(): void {
  rtkAvailabilityCache = undefined;
}

export const RTK_RUNTIME_INSTRUCTIONS =
  "Token optimization: RTK is installed. For read-heavy shell commands that commonly produce large output, prefer `rtk <command>` when it preserves the user's intent. This is most useful for git, package-manager, docker, cargo, and broad search commands. Use the raw command when exact byte-for-byte output, interactive behavior, stdin/stdout piping, or tool-specific side effects matter.";

const TOKEN_MODE_INSTRUCTIONS: Record<AgentTokenMode, string | undefined> = {
  off: undefined,
  balanced:
    "Token mode: balanced. Keep responses focused on the user's objective, avoid restating tool output unless it changes the decision, and prefer targeted file reads or searches over broad dumps. Preserve important caveats, exact errors, file paths, and verification results.",
  aggressive:
    "Token mode: aggressive. Minimize nonessential prose and avoid copying large command, file, or log output into responses. Use targeted searches, small file windows, and summaries by default. Still include exact commands, paths, errors, and decisions when they are needed for correctness or auditability.",
};

export function buildAgentTokenModeInstructions(mode: AgentTokenMode): string | undefined {
  return TOKEN_MODE_INSTRUCTIONS[mode];
}

export function buildTokenReductionInstructions(input: {
  readonly tokenMode: AgentTokenMode;
  readonly rtkInstalled: boolean;
}): string | undefined {
  if (input.tokenMode === "off") {
    return undefined;
  }

  const instructions = [
    buildAgentTokenModeInstructions(input.tokenMode),
    input.rtkInstalled ? RTK_RUNTIME_INSTRUCTIONS : undefined,
  ].filter((value): value is string => value !== undefined && value.trim().length > 0);

  return instructions.length > 0 ? instructions.join("\n\n") : undefined;
}
