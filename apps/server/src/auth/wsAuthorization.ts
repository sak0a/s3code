import { AuthRpcError } from "@ryco/contracts";
import { Effect } from "effect";

import type { AuthenticatedSession } from "./Services/ServerAuth.ts";

export type WsRpcAccess = "owner" | "authenticated";

export function authorizeWsRpc(
  session: AuthenticatedSession,
  access: WsRpcAccess,
  method: string,
): Effect.Effect<void, AuthRpcError> {
  if (access === "owner" && session.role !== "owner") {
    return Effect.fail(
      new AuthRpcError({
        message: `Only owner sessions can call ${method}.`,
        status: 403,
      }),
    );
  }

  return Effect.void;
}
