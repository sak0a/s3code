import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import {
  DetectedServerRegistry,
  DetectedServerRegistryLive,
} from "./Services/DetectedServerRegistry.ts";
import {
  DetectedServersIngress,
  DetectedServersIngressLive,
} from "./Layers/DetectedServersIngress.ts";
import { LivenessHeartbeat } from "./Layers/LivenessHeartbeat.ts";
import { SocketProbe, type ProbeResult } from "./Layers/SocketProbe.ts";

const stubProbe = (rows: ReadonlyArray<ProbeResult> = []) =>
  Layer.succeed(SocketProbe, { probe: () => Effect.succeed(rows) });

const stubHeartbeat = (ok: boolean) =>
  Layer.succeed(LivenessHeartbeat, { check: () => Effect.succeed(ok) });

const buildLayer = (probe: Layer.Layer<SocketProbe>, heartbeat: Layer.Layer<LivenessHeartbeat>) => {
  const deps = Layer.mergeAll(DetectedServerRegistryLive, probe, heartbeat);
  return Layer.mergeAll(deps, DetectedServersIngressLive.pipe(Layer.provide(deps)));
};

describe("DetectedServersIngress", () => {
  it("trackAgentCommand returns a noop tracker when isLikelyServer is false", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const ingress = yield* DetectedServersIngress;
        const registry = yield* DetectedServerRegistry;
        const tracker = yield* ingress.trackAgentCommand(
          {
            threadId: "t",
            turnId: "u",
            itemId: "i",
            argv: ["ls", "-la"],
            cwd: "/tmp",
          },
          "codex",
          undefined,
        );
        tracker.feed("hello\n");
        tracker.end("success");
        yield* Effect.sleep(10);
        const servers = yield* registry.getCurrent("t");
        expect(servers).toHaveLength(0);
      }).pipe(Effect.provide(buildLayer(stubProbe(), stubHeartbeat(false)))),
    );
  });

  it("trackPty registers predicted, then candidate when the sniffer sees a URL", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const ingress = yield* DetectedServersIngress;
        const registry = yield* DetectedServerRegistry;
        const tracker = yield* ingress.trackPty(
          {
            threadId: "t-pty",
            terminalId: "term-1",
            pid: 12345,
            argv: ["bun", "run", "dev"],
            cwd: "/repo",
          },
          { scripts: { dev: "vite" } },
        );
        const initial = yield* registry.getCurrent("t-pty");
        expect(initial).toHaveLength(1);
        expect(initial[0]!.status).toBe("predicted");
        expect(initial[0]!.framework).toBe("vite");
        expect(initial[0]!.terminalId).toBe("term-1");

        tracker.feed("  VITE v5.0.0 ready in 432 ms\n  ➜  Local: http://localhost:5173/\n");
        yield* Effect.sleep(20);

        const updated = yield* registry.getCurrent("t-pty");
        expect(updated[0]!.status === "candidate" || updated[0]!.status === "live").toBe(true);
        expect(updated[0]!.port).toBe(5173);
        tracker.end(0);
      }).pipe(Effect.provide(buildLayer(stubProbe(), stubHeartbeat(false)))),
    );
  });

  it("trackPty transitions toward live when SocketProbe returns a matching row and heartbeat agrees", async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const ingress = yield* DetectedServersIngress;
        const registry = yield* DetectedServerRegistry;
        const tracker = yield* ingress.trackPty(
          {
            threadId: "t-live",
            terminalId: "term-2",
            pid: process.pid,
            argv: ["bun", "run", "dev"],
            cwd: "/repo",
          },
          { scripts: { dev: "vite" } },
        );
        // Seed sniffedPort so the probe loop's `matching` lookup is deterministic.
        tracker.feed("  ➜  Local: http://localhost:5173/\n");

        // Poll up to 5s for the probe loop to land a "live" update.
        let observed: string = "predicted";
        for (let i = 0; i < 50; i += 1) {
          yield* Effect.sleep(100);
          const servers = yield* registry.getCurrent("t-live");
          if (servers[0]?.status === "live") {
            observed = "live";
            break;
          }
        }
        expect(observed).toBe("live");
        const final = yield* registry.getCurrent("t-live");
        expect(final[0]!.port).toBe(5173);
        tracker.end(0);
      }).pipe(
        Effect.provide(
          buildLayer(
            stubProbe([{ pid: process.pid, port: 5173, host: "127.0.0.1" }]),
            stubHeartbeat(true),
          ),
        ),
      ),
    );
  });

  it("end() interrupts the probe fiber so no further SocketProbe calls fire", async () => {
    let probeCalls = 0;
    const countingProbe = Layer.succeed(SocketProbe, {
      probe: () =>
        Effect.sync(() => {
          probeCalls += 1;
          return [] as ProbeResult[];
        }),
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const ingress = yield* DetectedServersIngress;
        const tracker = yield* ingress.trackPty(
          {
            threadId: "t-end",
            terminalId: "term-3",
            pid: process.pid,
            argv: ["bun", "run", "dev"],
            cwd: "/repo",
          },
          { scripts: { dev: "vite" } },
        );
        // Let one or two probe cycles run.
        yield* Effect.sleep(400);
        const callsBeforeEnd = probeCalls;
        expect(callsBeforeEnd).toBeGreaterThan(0);
        tracker.end(0);
        // Wait through several poll intervals — no further calls should land.
        yield* Effect.sleep(800);
        expect(probeCalls).toBe(callsBeforeEnd);
      }).pipe(Effect.provide(buildLayer(countingProbe, stubHeartbeat(false)))),
    );
  });
});
