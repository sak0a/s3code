import { Cause, DateTime, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedGitHubPullRequestRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state: "open" | "closed" | "merged";
  readonly updatedAt: Option.Option<DateTime.Utc>;
  readonly isCrossRepository?: boolean;
  readonly isDraft?: boolean;
  readonly author: string | null;
  readonly assignees: ReadonlyArray<string>;
  readonly labels: ReadonlyArray<string>;
  readonly commentsCount: number | null;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

const GitHubPullRequestSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  baseRefName: TrimmedNonEmptyString,
  headRefName: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  mergedAt: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  isCrossRepository: Schema.optional(Schema.Boolean),
  isDraft: Schema.optional(Schema.Boolean),
  author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
  assignees: Schema.optional(Schema.Array(Schema.Struct({ login: Schema.String }))),
  labels: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
  headRepository: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        nameWithOwner: Schema.String,
      }),
    ),
  ),
  headRepositoryOwner: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        login: Schema.String,
      }),
    ),
  ),
  body: Schema.optional(Schema.NullOr(Schema.String)),
  comments: Schema.optional(
    Schema.Union([
      Schema.Array(
        Schema.Struct({
          author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
          authorAssociation: Schema.optional(Schema.NullOr(Schema.String)),
          body: Schema.String,
          createdAt: Schema.String,
        }),
      ),
      Schema.Number,
    ]),
  ),
});

function trimOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeGitHubPullRequestState(input: {
  state?: string | null | undefined;
  mergedAt?: string | null | undefined;
}): "open" | "closed" | "merged" {
  const normalizedState = input.state?.trim().toUpperCase();
  if (
    (typeof input.mergedAt === "string" && input.mergedAt.trim().length > 0) ||
    normalizedState === "MERGED"
  ) {
    return "merged";
  }
  if (normalizedState === "CLOSED") {
    return "closed";
  }
  return "open";
}

function normalizeGitHubPullRequestRecord(
  raw: Schema.Schema.Type<typeof GitHubPullRequestSchema>,
): NormalizedGitHubPullRequestRecord {
  const headRepositoryNameWithOwner = trimOptionalString(raw.headRepository?.nameWithOwner);
  const headRepositoryOwnerLogin =
    trimOptionalString(raw.headRepositoryOwner?.login) ??
    (typeof headRepositoryNameWithOwner === "string" && headRepositoryNameWithOwner.includes("/")
      ? (headRepositoryNameWithOwner.split("/")[0] ?? null)
      : null);
  const commentsCount =
    typeof raw.comments === "number"
      ? raw.comments
      : Array.isArray(raw.comments)
        ? raw.comments.length
        : null;

  return {
    number: raw.number,
    title: raw.title,
    url: raw.url,
    baseRefName: raw.baseRefName,
    headRefName: raw.headRefName,
    state: normalizeGitHubPullRequestState(raw),
    updatedAt: raw.updatedAt ?? Option.none(),
    author: raw.author?.login ?? null,
    assignees: (raw.assignees ?? []).map((a) => a.login),
    labels: (raw.labels ?? []).map((l) => l.name),
    commentsCount,
    ...(typeof raw.isCrossRepository === "boolean"
      ? { isCrossRepository: raw.isCrossRepository }
      : {}),
    ...(typeof raw.isDraft === "boolean" ? { isDraft: raw.isDraft } : {}),
    ...(headRepositoryNameWithOwner ? { headRepositoryNameWithOwner } : {}),
    ...(headRepositoryOwnerLogin ? { headRepositoryOwnerLogin } : {}),
  };
}

const decodeGitHubPullRequestList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeGitHubPullRequest = decodeJsonResult(GitHubPullRequestSchema);
const decodeGitHubPullRequestEntry = Schema.decodeUnknownExit(GitHubPullRequestSchema);

export const formatGitHubJsonDecodeError = formatSchemaError;

export function decodeGitHubPullRequestListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedGitHubPullRequestRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeGitHubPullRequestList(raw);
  if (Result.isSuccess(result)) {
    const pullRequests: NormalizedGitHubPullRequestRecord[] = [];
    for (const entry of result.success) {
      const decodedEntry = decodeGitHubPullRequestEntry(entry);
      if (Exit.isFailure(decodedEntry)) {
        continue;
      }
      pullRequests.push(normalizeGitHubPullRequestRecord(decodedEntry.value));
    }
    return Result.succeed(pullRequests);
  }
  return Result.fail(result.failure);
}

export function decodeGitHubPullRequestJson(
  raw: string,
): Result.Result<NormalizedGitHubPullRequestRecord, Cause.Cause<Schema.SchemaError>> {
  const result = decodeGitHubPullRequest(raw);
  if (Result.isSuccess(result)) {
    return Result.succeed(normalizeGitHubPullRequestRecord(result.success));
  }
  return Result.fail(result.failure);
}

export interface NormalizedGitHubPullRequestDetail extends NormalizedGitHubPullRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
    readonly authorAssociation?: string;
  }>;
  readonly linkedIssueNumbers: ReadonlyArray<number>;
}

function normalizePullRequestComment(raw: {
  readonly author?: { readonly login: string } | null;
  readonly authorAssociation?: string | null;
  readonly body: string;
  readonly createdAt: string;
}): NormalizedGitHubPullRequestDetail["comments"][number] {
  const base = {
    author: raw.author?.login ?? "unknown",
    body: raw.body,
    createdAt: raw.createdAt,
  };
  if (raw.authorAssociation) {
    return { ...base, authorAssociation: raw.authorAssociation };
  }
  return base;
}

const LINKED_ISSUE_PATTERN = /\b(?:close[sd]?|fixe?[sd]?|resolve[sd]?)\s+#(\d+)/giu;

export function parseLinkedIssueNumbers(body: string): ReadonlyArray<number> {
  if (!body) return [];
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const match of body.matchAll(LINKED_ISSUE_PATTERN)) {
    const captured = match[1];
    if (!captured) continue;
    const parsed = Number.parseInt(captured, 10);
    if (Number.isNaN(parsed) || seen.has(parsed)) continue;
    seen.add(parsed);
    numbers.push(parsed);
  }
  return numbers;
}

export function decodeGitHubPullRequestDetailJson(
  raw: string,
): Result.Result<NormalizedGitHubPullRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeGitHubPullRequest(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeGitHubPullRequestRecord(result.success);
  const body = result.success.body ?? "";
  const rawComments = Array.isArray(result.success.comments) ? result.success.comments : [];
  const detail: NormalizedGitHubPullRequestDetail = {
    ...summary,
    body,
    comments: rawComments.map((c) => normalizePullRequestComment(c)),
    linkedIssueNumbers: parseLinkedIssueNumbers(body),
  };
  return Result.succeed(detail);
}
