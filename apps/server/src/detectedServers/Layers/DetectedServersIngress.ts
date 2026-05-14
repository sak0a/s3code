import { Context, DateTime, Duration, Effect, Fiber, Layer } from "effect";
import pidtree from "pidtree";
import { DetectedServerRegistry } from "../Services/DetectedServerRegistry.ts";
import { SocketProbe } from "./SocketProbe.ts";
import { LivenessHeartbeat } from "./LivenessHeartbeat.ts";
import { StdoutSniffer } from "./StdoutSniffer.ts";
import { hintFromArgv, type PackageJsonShape } from "./ArgvHinter.ts";

const DEBUGGER_PORTS = new Set([9229, 9230]);

const argvHasInspect = (argv: ReadonlyArray<string>): number[] => {
  const out: number[] = [];
  for (const t of argv) {
    const m = t.match(/--inspect(?:-brk|-wait)?=(?:[^:]*:)?(\d+)/);
    if (m) out.push(Number.parseInt(m[1]!, 10));
  }
  return out;
};

export interface CodexCommandSource {
  threadId: string;
  turnId: string;
  itemId: string;
  argv: ReadonlyArray<string>;
  cwd: string;
}

export interface PtyCommandSource {
  threadId: string;
  pid: number;
  argv: ReadonlyArray<string>;
  cwd: string;
}

export interface CommandTracker {
  feed: (chunk: string) => void;
  end: (result: "success" | "error") => void;
}

export interface PtyTracker {
  feed: (chunk: string) => void;
  end: (exitCode: number | null) => void;
}

export interface DetectedServersIngressShape {
  readonly trackAgentCommand: (
    source: CodexCommandSource,
    sourceKind: "codex" | "acp",
    pkg: PackageJsonShape | undefined,
  ) => Effect.Effect<CommandTracker>;
  readonly trackPty: (
    source: PtyCommandSource,
    pkg: PackageJsonShape | undefined,
  ) => Effect.Effect<PtyTracker>;
}

export class DetectedServersIngress extends Context.Service<
  DetectedServersIngress,
  DetectedServersIngressShape
>()("s3/detectedServers/Layers/DetectedServersIngress") {}

const noopTracker = (): CommandTracker => ({ feed: () => {}, end: () => {} });
const noopPtyTracker = (): PtyTracker => ({ feed: () => {}, end: () => {} });

export const DetectedServersIngressLive = Layer.effect(
  DetectedServersIngress,
  Effect.gen(function* () {
    const registry = yield* DetectedServerRegistry;
    const probe = yield* SocketProbe;
    const heartbeat = yield* LivenessHeartbeat;
    const context = yield* Effect.context<never>();
    const runFork = Effect.runForkWith(context);

    const trackAgentCommand = (
      source: CodexCommandSource,
      sourceKind: "codex" | "acp",
      pkg: PackageJsonShape | undefined,
    ): Effect.Effect<CommandTracker> =>
      Effect.gen(function* () {
        const hint = hintFromArgv(source.argv, pkg);
        if (!hint.isLikelyServer) return noopTracker();

        const identityKey = `${source.threadId}::${sourceKind}::${source.turnId}::${source.itemId}`;
        const server = yield* registry.registerOrUpdate({
          threadId: source.threadId,
          source: sourceKind,
          identityKey,
          patch: {
            framework: hint.framework,
            status: "predicted",
            argv: source.argv,
            cwd: source.cwd,
          },
        });

        const sniffer = new StdoutSniffer();
        const unsubCandidate = sniffer.onCandidate((c) => {
          runFork(
            registry.registerOrUpdate({
              threadId: source.threadId,
              source: sourceKind,
              identityKey,
              patch: {
                status: "candidate",
                framework: c.framework !== "unknown" ? c.framework : hint.framework,
                url: c.url,
                port: c.port,
                host: c.host,
              },
            }),
          );
        });

        return {
          feed: (chunk: string) => {
            sniffer.feed(chunk);
            runFork(registry.publishLog(server.id, chunk));
          },
          end: (result: "success" | "error") => {
            unsubCandidate();
            runFork(
              registry.registerOrUpdate({
                threadId: source.threadId,
                source: sourceKind,
                identityKey,
                patch: {
                  status: "exited",
                  exitedAt: DateTime.fromDateUnsafe(new Date()),
                  exitReason: result === "success" ? "stopped" : "crashed",
                },
              }),
            );
          },
        };
      });

    const trackPty = (
      source: PtyCommandSource,
      pkg: PackageJsonShape | undefined,
    ): Effect.Effect<PtyTracker> =>
      Effect.gen(function* () {
        const hint = hintFromArgv(source.argv, pkg);
        if (!hint.isLikelyServer) return noopPtyTracker();

        const identityKey = `${source.threadId}::pty::${source.pid}`;
        const server = yield* registry.registerOrUpdate({
          threadId: source.threadId,
          source: "pty",
          identityKey,
          patch: {
            framework: hint.framework,
            status: "predicted",
            pid: source.pid,
            argv: source.argv,
            cwd: source.cwd,
          },
        });

        const sniffer = new StdoutSniffer();
        let sniffedPort: number | null = null;
        const unsubCandidate = sniffer.onCandidate((c) => {
          sniffedPort = c.port;
          runFork(
            registry.registerOrUpdate({
              threadId: source.threadId,
              source: "pty",
              identityKey,
              patch: {
                status: "candidate",
                framework: c.framework !== "unknown" ? c.framework : hint.framework,
                url: c.url,
                port: c.port,
                host: c.host,
              },
            }),
          );
        });

        const denyPorts = new Set<number>([...DEBUGGER_PORTS, ...argvHasInspect(source.argv)]);

        // Probe fiber: polls SocketProbe + LivenessHeartbeat
        const probeFiber = runFork(
          Effect.gen(function* () {
            let liveSeenAt: Date | null = null;
            let emittedConfirmed = false;
            while (true) {
              const pids = yield* Effect.tryPromise({
                try: () => pidtree(source.pid, { root: true }),
                catch: () => new Error("pidtree failed"),
              }).pipe(Effect.orElseSucceed(() => [source.pid] as number[]));
              const rows = yield* probe.probe(pids);
              const candidates = rows.filter((r) => !denyPorts.has(r.port));
              const matching = sniffedPort
                ? candidates.find((r) => r.port === sniffedPort)
                : candidates[0];
              if (matching && !liveSeenAt) {
                const ok = yield* heartbeat.check(`http://localhost:${matching.port}`);
                if (ok) {
                  liveSeenAt = new Date();
                  yield* registry.registerOrUpdate({
                    threadId: source.threadId,
                    source: "pty",
                    identityKey,
                    patch: {
                      status: "live",
                      port: matching.port,
                      host: matching.host,
                      url: `http://localhost:${matching.port}`,
                      liveAt: DateTime.fromDateUnsafe(liveSeenAt),
                    },
                  });
                } else if (!emittedConfirmed) {
                  emittedConfirmed = true;
                  yield* registry.registerOrUpdate({
                    threadId: source.threadId,
                    source: "pty",
                    identityKey,
                    patch: {
                      status: "confirmed",
                      port: matching.port,
                      host: matching.host,
                    },
                  });
                }
              }
              yield* Effect.sleep(liveSeenAt ? Duration.seconds(2) : Duration.millis(250));
            }
          }),
        );

        return {
          feed: (chunk: string) => {
            sniffer.feed(chunk);
            runFork(registry.publishLog(server.id, chunk));
          },
          end: (exitCode: number | null) => {
            unsubCandidate();
            runFork(Fiber.interrupt(probeFiber).pipe(Effect.ignore));
            const status = exitCode === 0 || exitCode === null ? "exited" : "crashed";
            const exitReason: "stopped" | "crashed" = status === "exited" ? "stopped" : "crashed";
            runFork(
              registry.registerOrUpdate({
                threadId: source.threadId,
                source: "pty",
                identityKey,
                patch: {
                  status,
                  exitedAt: DateTime.fromDateUnsafe(new Date()),
                  exitReason,
                },
              }),
            );
          },
        };
      });

    return { trackAgentCommand, trackPty };
  }),
);
