import type { EnvironmentId } from "@t3tools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { requireEnvironmentConnection } from "~/environments/runtime";

export const sourceControlContextQueryKeys = {
  all: ["sourceControl"] as const,
  issueList: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    state: "open" | "closed" | "all",
    limit?: number,
  ) =>
    [
      "sourceControl",
      "issues",
      environmentId ?? null,
      cwd,
      "list",
      state,
      limit ?? null,
    ] as const,
  issueDetail: (environmentId: EnvironmentId | null, cwd: string | null, reference: string) =>
    ["sourceControl", "issues", environmentId ?? null, cwd, "detail", reference] as const,
  issueSearch: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    query: string,
    limit?: number,
  ) =>
    [
      "sourceControl",
      "issues",
      environmentId ?? null,
      cwd,
      "search",
      query,
      limit ?? null,
    ] as const,
  changeRequestList: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    state: "open" | "closed" | "merged" | "all",
    limit?: number,
  ) =>
    [
      "sourceControl",
      "changeRequests",
      environmentId ?? null,
      cwd,
      "list",
      state,
      limit ?? null,
    ] as const,
  changeRequestDetail: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    reference: string,
  ) =>
    [
      "sourceControl",
      "changeRequests",
      environmentId ?? null,
      cwd,
      "detail",
      reference,
    ] as const,
  changeRequestSearch: (
    environmentId: EnvironmentId | null,
    cwd: string | null,
    query: string,
    limit?: number,
  ) =>
    [
      "sourceControl",
      "changeRequests",
      environmentId ?? null,
      cwd,
      "search",
      query,
      limit ?? null,
    ] as const,
};

export function issueListQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  state: "open" | "closed" | "all";
  limit?: number;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: sourceControlContextQueryKeys.issueList(
      input.environmentId,
      input.cwd,
      input.state,
      input.limit,
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Issue list is unavailable.");
      }
      const client = requireEnvironmentConnection(input.environmentId).client;
      return client.sourceControl.listIssues({
        cwd: input.cwd,
        state: input.state,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null && input.cwd !== null,
    staleTime: 60_000,
  });
}

export function issueDetailQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  reference: string | null;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: sourceControlContextQueryKeys.issueDetail(
      input.environmentId,
      input.cwd,
      input.reference ?? "",
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId || !input.reference) {
        throw new Error("Issue detail is unavailable.");
      }
      const client = requireEnvironmentConnection(input.environmentId).client;
      return client.sourceControl.getIssue({
        cwd: input.cwd,
        reference: input.reference,
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.reference !== null,
    staleTime: 300_000,
  });
}

export function searchIssuesQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  query: string;
  limit?: number;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: sourceControlContextQueryKeys.issueSearch(
      input.environmentId,
      input.cwd,
      input.query,
      input.limit,
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Issue search is unavailable.");
      }
      const client = requireEnvironmentConnection(input.environmentId).client;
      return client.sourceControl.searchIssues({
        cwd: input.cwd,
        query: input.query,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.query.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Lists change requests by searching with an empty query.
 *
 * Note: the server does not expose a dedicated list-change-requests WS route;
 * this factory delegates to `sourceControl.searchChangeRequests` with an empty
 * query string. The `state` parameter is accepted for API consistency but is
 * not forwarded to the server (the server-side search is not state-filtered).
 */
export function changeRequestListQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  state: "open" | "closed" | "merged" | "all";
  limit?: number;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: sourceControlContextQueryKeys.changeRequestList(
      input.environmentId,
      input.cwd,
      input.state,
      input.limit,
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Change request list is unavailable.");
      }
      const client = requireEnvironmentConnection(input.environmentId).client;
      return client.sourceControl.searchChangeRequests({
        cwd: input.cwd,
        query: "",
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
    },
    enabled: (input.enabled ?? true) && input.environmentId !== null && input.cwd !== null,
    staleTime: 60_000,
  });
}

export function searchChangeRequestsQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  query: string;
  limit?: number;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: sourceControlContextQueryKeys.changeRequestSearch(
      input.environmentId,
      input.cwd,
      input.query,
      input.limit,
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId) {
        throw new Error("Change request search is unavailable.");
      }
      const client = requireEnvironmentConnection(input.environmentId).client;
      return client.sourceControl.searchChangeRequests({
        cwd: input.cwd,
        query: input.query,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.query.length > 0,
    staleTime: 30_000,
  });
}

export function changeRequestDetailQueryOptions(input: {
  environmentId: EnvironmentId | null;
  cwd: string | null;
  reference: string | null;
  enabled?: boolean;
}) {
  return queryOptions({
    queryKey: sourceControlContextQueryKeys.changeRequestDetail(
      input.environmentId,
      input.cwd,
      input.reference ?? "",
    ),
    queryFn: async () => {
      if (!input.cwd || !input.environmentId || !input.reference) {
        throw new Error("Change request detail is unavailable.");
      }
      const client = requireEnvironmentConnection(input.environmentId).client;
      return client.sourceControl.getChangeRequestDetail({
        cwd: input.cwd,
        reference: input.reference,
      });
    },
    enabled:
      (input.enabled ?? true) &&
      input.environmentId !== null &&
      input.cwd !== null &&
      input.reference !== null,
    staleTime: 300_000,
  });
}
