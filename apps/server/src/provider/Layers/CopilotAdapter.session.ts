import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type ChatAttachment,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  type ProviderSession,
  type ProviderTurnStartResult,
} from "@s3tools/contracts";
import {
  CopilotClient,
  type CopilotClientOptions,
  type MessageOptions,
  type SessionConfig,
  type SessionEvent,
} from "@github/copilot-sdk";
import { Effect } from "effect";
import { getModelSelectionStringOptionValue } from "@s3tools/shared/model";

import { resolveAttachmentPath } from "../../attachmentStore.ts";
import {
  ProviderAdapterProcessError,
  ProviderAdapterRequestError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import type { CopilotAdapterShape } from "../Services/CopilotAdapter.ts";
import {
  COPILOT_DRIVER_KIND,
  DEFAULT_BINARY_PATH,
  type ActiveCopilotSession,
  type CopilotAdapterLiveOptions,
  type PendingApprovalRequest,
  type PendingUserInputRequest,
  buildThreadSnapshot,
  isSessionNotFoundError,
  makeNodeWrapperCliPath,
  selectionTargetsCopilotInstance,
  toMessage,
} from "./CopilotAdapter.types.ts";

type CopilotReasoningEffort = "low" | "medium" | "high" | "xhigh";

export interface SessionOpsDeps {
  readonly sessions: Map<ThreadId, ActiveCopilotSession>;
  readonly serverConfig: { readonly attachmentsDir: string };
  readonly copilotSettings: { readonly binaryPath: string };
  readonly environment?: NodeJS.ProcessEnv;
  readonly options: CopilotAdapterLiveOptions | undefined;
  readonly instanceId: ProviderInstanceId;
  readonly emit: (events: ReadonlyArray<ProviderRuntimeEvent>) => Effect.Effect<void>;
  readonly makeSyntheticEvent: (
    threadId: ThreadId,
    type: string,
    payload: unknown,
    extra?: { turnId?: TurnId; itemId?: string; requestId?: string },
  ) => Effect.Effect<ProviderRuntimeEvent>;
  readonly buildSessionConfig: (
    input: {
      threadId: ThreadId;
      runtimeMode: ProviderSession["runtimeMode"];
      cwd?: string;
      modelSelection?: ProviderSendTurnInput["modelSelection"] | ProviderSession["resumeCursor"];
    },
    pendingApprovals: Map<string, PendingApprovalRequest>,
    pendingUserInputs: Map<string, PendingUserInputRequest>,
    activeTurnId: () => TurnId | undefined,
    stoppedRef: { stopped: boolean },
  ) => SessionConfig;
  readonly handleEvent: (session: ActiveCopilotSession, event: SessionEvent) => Effect.Effect<void>;
  readonly requireSession: (
    threadId: ThreadId,
  ) => Effect.Effect<ActiveCopilotSession, ProviderAdapterSessionNotFoundError>;
}

function parseResumeCursor(resumeCursor: unknown): string | undefined {
  return typeof resumeCursor === "object" &&
    resumeCursor !== null &&
    "sessionId" in resumeCursor &&
    typeof resumeCursor.sessionId === "string" &&
    resumeCursor.sessionId.trim().length > 0
    ? resumeCursor.sessionId.trim()
    : undefined;
}

function attachmentMimeType(attachment: ChatAttachment): string {
  return attachment.mimeType;
}

export const makeStartSession =
  (deps: SessionOpsDeps): CopilotAdapterShape["startSession"] =>
  (input) =>
    Effect.gen(function* () {
      if (input.provider !== undefined && input.provider !== COPILOT_DRIVER_KIND) {
        return yield* new ProviderAdapterValidationError({
          provider: COPILOT_DRIVER_KIND,
          operation: "startSession",
          issue: `Expected provider '${COPILOT_DRIVER_KIND}' but received '${input.provider}'.`,
        });
      }
      if (input.providerInstanceId !== undefined && input.providerInstanceId !== deps.instanceId) {
        return yield* new ProviderAdapterValidationError({
          provider: COPILOT_DRIVER_KIND,
          operation: "startSession",
          issue: `Expected provider instance '${deps.instanceId}' but received '${input.providerInstanceId}'.`,
        });
      }

      const existing = deps.sessions.get(input.threadId);
      if (existing) {
        return {
          provider: COPILOT_DRIVER_KIND,
          providerInstanceId: deps.instanceId,
          status: existing.activeTurnId ? "running" : "ready",
          runtimeMode: existing.runtimeMode,
          threadId: input.threadId,
          ...(existing.cwd ? { cwd: existing.cwd } : {}),
          ...(existing.model ? { model: existing.model } : {}),
          resumeCursor: { sessionId: existing.session.sessionId },
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
          ...(existing.lastError ? { lastError: existing.lastError } : {}),
        } satisfies ProviderSession;
      }

      const useCustomBinary = deps.copilotSettings.binaryPath !== DEFAULT_BINARY_PATH;
      const resolvedCliPath = useCustomBinary
        ? deps.copilotSettings.binaryPath
        : makeNodeWrapperCliPath();
      const clientOptions: CopilotClientOptions = {
        ...(resolvedCliPath !== undefined ? { cliPath: resolvedCliPath } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(deps.environment ? { env: deps.environment } : {}),
        logLevel: "error",
      };
      const client =
        deps.options?.clientFactory?.(clientOptions) ?? new CopilotClient(clientOptions);
      const pendingApprovals = new Map<string, PendingApprovalRequest>();
      const pendingUserInputs = new Map<string, PendingUserInputRequest>();
      let activeTurn: TurnId | undefined;
      const stoppedRef = { stopped: false };
      const sessionConfig = deps.buildSessionConfig(
        {
          threadId: input.threadId,
          runtimeMode: input.runtimeMode,
          ...(input.cwd ? { cwd: input.cwd } : {}),
          ...(input.modelSelection ? { modelSelection: input.modelSelection } : {}),
        },
        pendingApprovals,
        pendingUserInputs,
        () => activeTurn,
        stoppedRef,
      );

      const session = yield* Effect.tryPromise({
        try: () => {
          const sessionId = parseResumeCursor(input.resumeCursor);
          return sessionId
            ? client.resumeSession(sessionId, sessionConfig)
            : client.createSession(sessionConfig);
        },
        catch: (cause) =>
          new ProviderAdapterProcessError({
            provider: COPILOT_DRIVER_KIND,
            threadId: input.threadId,
            detail: toMessage(cause, "Failed to start GitHub Copilot session."),
            cause,
          }),
      });

      const createdAt = new Date().toISOString();
      const record: ActiveCopilotSession = {
        client,
        session,
        threadId: input.threadId,
        providerInstanceId: deps.instanceId,
        createdAt,
        runtimeMode: input.runtimeMode,
        pendingApprovals,
        pendingUserInputs,
        turns: [],
        renewSession: () => client.createSession(sessionConfig),
        unsubscribe: () => {},
        cwd: input.cwd,
        model: selectionTargetsCopilotInstance(input.modelSelection, deps.instanceId)
          ? input.modelSelection.model
          : undefined,
        updatedAt: createdAt,
        lastError: undefined,
        activeTurnId: undefined,
        activeMessageId: undefined,
        lastUsage: undefined,
        get stopped() {
          return stoppedRef.stopped;
        },
        set stopped(value: boolean) {
          stoppedRef.stopped = value;
        },
      };

      record.unsubscribe = session.on((event) => {
        activeTurn =
          event.type === "assistant.turn_start" ? TurnId.make(event.data.turnId) : activeTurn;
        void deps
          .handleEvent(record, event)
          .pipe(Effect.runPromise)
          .catch(() => undefined);
        activeTurn = record.activeTurnId;
      });

      deps.sessions.set(input.threadId, record);

      yield* deps.emit([
        yield* deps.makeSyntheticEvent(
          input.threadId,
          "session.started",
          input.resumeCursor !== undefined ? { resume: input.resumeCursor } : {},
        ),
        yield* deps.makeSyntheticEvent(input.threadId, "thread.started", {
          providerThreadId: session.sessionId,
        }),
        yield* deps.makeSyntheticEvent(input.threadId, "session.state.changed", {
          state: "ready",
          reason: "session.started",
        }),
      ]);

      return {
        provider: COPILOT_DRIVER_KIND,
        providerInstanceId: deps.instanceId,
        status: "ready",
        runtimeMode: input.runtimeMode,
        threadId: input.threadId,
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(record.model ? { model: record.model } : {}),
        resumeCursor: { sessionId: session.sessionId },
        createdAt,
        updatedAt: createdAt,
      } satisfies ProviderSession;
    });

export const makeSendTurn =
  (deps: SessionOpsDeps): CopilotAdapterShape["sendTurn"] =>
  (input) =>
    Effect.gen(function* () {
      const record = yield* deps.requireSession(input.threadId);
      const attachments: MessageOptions["attachments"] = yield* Effect.forEach(
        input.attachments ?? [],
        (attachment) =>
          Effect.gen(function* () {
            const filePath = resolveAttachmentPath({
              attachmentsDir: deps.serverConfig.attachmentsDir,
              attachment,
            });
            if (!filePath) {
              return yield* new ProviderAdapterRequestError({
                provider: COPILOT_DRIVER_KIND,
                method: "session.send",
                detail: `Invalid attachment id '${attachment.id}'.`,
              });
            }
            const bytes = yield* Effect.tryPromise({
              try: () => readFile(filePath),
              catch: (cause) =>
                new ProviderAdapterRequestError({
                  provider: COPILOT_DRIVER_KIND,
                  method: "session.send",
                  detail: `Failed to read attachment '${attachment.name}'.`,
                  cause,
                }),
            });
            return {
              type: "blob" as const,
              data: bytes.toString("base64"),
              mimeType: attachmentMimeType(attachment),
              displayName: attachment.name,
            };
          }),
      );

      const copilotModelSelection = selectionTargetsCopilotInstance(
        input.modelSelection,
        deps.instanceId,
      )
        ? input.modelSelection
        : undefined;

      if (copilotModelSelection) {
        record.model = copilotModelSelection.model;
        const reasoningEffort = getModelSelectionStringOptionValue(
          copilotModelSelection,
          "reasoningEffort",
        );
        const setModelOptions = reasoningEffort
          ? { reasoningEffort: reasoningEffort as CopilotReasoningEffort }
          : undefined;

        yield* Effect.tryPromise({
          try: async () => {
            try {
              await record.session.setModel(copilotModelSelection.model, setModelOptions);
            } catch (firstError) {
              if (!isSessionNotFoundError(firstError)) throw firstError;
              const freshSession = await record.renewSession();
              record.session = freshSession;
              await record.session.setModel(copilotModelSelection.model, setModelOptions);
            }
          },
          catch: (cause) =>
            new ProviderAdapterRequestError({
              provider: COPILOT_DRIVER_KIND,
              method: "session.setModel",
              detail: toMessage(cause, "Failed to apply GitHub Copilot model selection."),
              cause,
            }),
        });
      }

      const turnId = TurnId.make(`copilot-turn-${randomUUID()}`);
      record.activeTurnId = turnId;
      record.updatedAt = new Date().toISOString();

      const sendPayload: Parameters<typeof record.session.send>[0] = {
        prompt: input.input ?? "",
        ...(attachments.length > 0 ? { attachments } : {}),
        mode: "immediate",
      };

      yield* Effect.tryPromise({
        try: async () => {
          try {
            await record.session.send(sendPayload);
          } catch (firstError) {
            if (!isSessionNotFoundError(firstError)) throw firstError;
            const freshSession = await record.renewSession();
            record.session = freshSession;
            await record.session.send(sendPayload);
          }
        },
        catch: (cause) =>
          new ProviderAdapterRequestError({
            provider: COPILOT_DRIVER_KIND,
            method: "session.send",
            detail: toMessage(cause, "Failed to send GitHub Copilot turn."),
            cause,
          }),
      });

      return {
        threadId: input.threadId,
        turnId,
        resumeCursor: { sessionId: record.session.sessionId },
      } satisfies ProviderTurnStartResult;
    });

export const makeInterruptTurn =
  (deps: SessionOpsDeps): CopilotAdapterShape["interruptTurn"] =>
  (threadId) =>
    Effect.gen(function* () {
      const record = yield* deps.requireSession(threadId);
      yield* Effect.tryPromise({
        try: () => record.session.abort(),
        catch: (cause) =>
          new ProviderAdapterRequestError({
            provider: COPILOT_DRIVER_KIND,
            method: "session.abort",
            detail: toMessage(cause, "Failed to interrupt GitHub Copilot turn."),
            cause,
          }),
      });
    });

export const stopSessionRecord = (
  record: ActiveCopilotSession,
): Effect.Effect<void, ProviderAdapterRequestError> =>
  Effect.tryPromise({
    try: async () => {
      record.stopped = true;
      record.unsubscribe();
      for (const pending of record.pendingApprovals.values()) {
        pending.resolve({ kind: "reject" });
      }
      for (const pending of record.pendingUserInputs.values()) {
        pending.resolve({ answer: "", wasFreeform: true });
      }
      record.pendingApprovals.clear();
      record.pendingUserInputs.clear();
      await record.session.disconnect();
      await record.client.stop();
    },
    catch: (cause) =>
      new ProviderAdapterRequestError({
        provider: COPILOT_DRIVER_KIND,
        method: "session.stop",
        detail: toMessage(cause, "Failed to stop GitHub Copilot session."),
        cause,
      }),
  });

export const makeStopSession =
  (deps: SessionOpsDeps): CopilotAdapterShape["stopSession"] =>
  (threadId) =>
    Effect.gen(function* () {
      const record = yield* deps.requireSession(threadId);
      deps.sessions.delete(threadId);
      yield* stopSessionRecord(record);
    });

export const makeStopAll =
  (deps: SessionOpsDeps): CopilotAdapterShape["stopAll"] =>
  () =>
    Effect.gen(function* () {
      const records = Array.from(deps.sessions.values());
      deps.sessions.clear();
      yield* Effect.forEach(records, stopSessionRecord, {
        concurrency: "unbounded",
        discard: true,
      });
    });

export const makeListSessions =
  (deps: SessionOpsDeps): CopilotAdapterShape["listSessions"] =>
  () =>
    Effect.sync(() =>
      Array.from(deps.sessions.values()).map((record): ProviderSession => {
        const session: { -readonly [K in keyof ProviderSession]: ProviderSession[K] } = {
          provider: COPILOT_DRIVER_KIND,
          providerInstanceId: deps.instanceId,
          status: record.activeTurnId ? "running" : "ready",
          runtimeMode: record.runtimeMode,
          threadId: record.threadId,
          resumeCursor: { sessionId: record.session.sessionId },
          activeTurnId: record.activeTurnId,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
        if (record.cwd) session.cwd = record.cwd;
        if (record.model) session.model = record.model;
        if (record.lastError) session.lastError = record.lastError;
        return session;
      }),
    );

export const makeHasSession =
  (deps: SessionOpsDeps): CopilotAdapterShape["hasSession"] =>
  (threadId) =>
    Effect.sync(() => deps.sessions.has(threadId));

export const makeReadThread =
  (deps: SessionOpsDeps): CopilotAdapterShape["readThread"] =>
  (threadId) =>
    Effect.gen(function* () {
      const record = yield* deps.requireSession(threadId);
      return buildThreadSnapshot(threadId, record.turns);
    });

export const makeRollbackThread = (): CopilotAdapterShape["rollbackThread"] => (threadId) =>
  Effect.succeed({
    threadId,
    turns: [],
  });
