import { Cause, DateTime, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedAzureDevOpsPullRequestRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state: "open" | "closed" | "merged";
  readonly updatedAt: Option.Option<DateTime.Utc>;
}

const AzureDevOpsPullRequestSchema = Schema.Struct({
  pullRequestId: PositiveInt,
  title: TrimmedNonEmptyString,
  url: Schema.optional(Schema.String),
  sourceRefName: TrimmedNonEmptyString,
  targetRefName: TrimmedNonEmptyString,
  status: Schema.String,
  creationDate: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  closedDate: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  _links: Schema.optional(
    Schema.Struct({
      web: Schema.optional(
        Schema.Struct({
          href: Schema.String,
        }),
      ),
    }),
  ),
});

function trimOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeRefName(refName: string): string {
  return refName.trim().replace(/^refs\/heads\//, "");
}

function normalizeAzureDevOpsPullRequestState(status: string): "open" | "closed" | "merged" {
  switch (status.trim().toLowerCase()) {
    case "completed":
      return "merged";
    case "abandoned":
      return "closed";
    default:
      return "open";
  }
}

function normalizeAzureDevOpsPullRequestRecord(
  raw: Schema.Schema.Type<typeof AzureDevOpsPullRequestSchema>,
): NormalizedAzureDevOpsPullRequestRecord {
  return {
    number: raw.pullRequestId,
    title: raw.title,
    url: trimOptionalString(raw._links?.web?.href) ?? trimOptionalString(raw.url) ?? "",
    baseRefName: normalizeRefName(raw.targetRefName),
    headRefName: normalizeRefName(raw.sourceRefName),
    state: normalizeAzureDevOpsPullRequestState(raw.status),
    updatedAt: (raw.closedDate ?? Option.none()).pipe(
      Option.orElse(() => raw.creationDate ?? Option.none()),
    ),
  };
}

const decodeAzureDevOpsPullRequestList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeAzureDevOpsPullRequest = decodeJsonResult(AzureDevOpsPullRequestSchema);
const decodeAzureDevOpsPullRequestEntry = Schema.decodeUnknownExit(AzureDevOpsPullRequestSchema);

export const formatAzureDevOpsJsonDecodeError = formatSchemaError;

export function decodeAzureDevOpsPullRequestListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedAzureDevOpsPullRequestRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeAzureDevOpsPullRequestList(raw);
  if (Result.isSuccess(result)) {
    const pullRequests: NormalizedAzureDevOpsPullRequestRecord[] = [];
    for (const entry of result.success) {
      const decodedEntry = decodeAzureDevOpsPullRequestEntry(entry);
      if (Exit.isFailure(decodedEntry)) {
        continue;
      }
      pullRequests.push(normalizeAzureDevOpsPullRequestRecord(decodedEntry.value));
    }
    return Result.succeed(pullRequests);
  }
  return Result.fail(result.failure);
}

export function decodeAzureDevOpsPullRequestJson(
  raw: string,
): Result.Result<NormalizedAzureDevOpsPullRequestRecord, Cause.Cause<Schema.SchemaError>> {
  const result = decodeAzureDevOpsPullRequest(raw);
  if (Result.isSuccess(result)) {
    return Result.succeed(normalizeAzureDevOpsPullRequestRecord(result.success));
  }
  return Result.fail(result.failure);
}

export interface NormalizedAzureDevOpsPullRequestDetail extends NormalizedAzureDevOpsPullRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const AzureThreadCommentSchema = Schema.Struct({
  author: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        uniqueName: Schema.optional(Schema.String),
        displayName: Schema.optional(Schema.String),
      }),
    ),
  ),
  content: Schema.optional(Schema.NullOr(Schema.String)),
  publishedDate: Schema.optional(Schema.NullOr(Schema.String)),
});

const AzureDevOpsPullRequestDetailSchema = Schema.Struct({
  ...AzureDevOpsPullRequestSchema.fields,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  threads: Schema.optional(
    Schema.Array(
      Schema.Struct({
        comments: Schema.optional(Schema.Array(AzureThreadCommentSchema)),
        isDeleted: Schema.optional(Schema.NullOr(Schema.Boolean)),
      }),
    ),
  ),
});

const decodeAzurePullRequestDetail = decodeJsonResult(AzureDevOpsPullRequestDetailSchema);

export function decodeAzureDevOpsPullRequestDetailJson(
  raw: string,
): Result.Result<NormalizedAzureDevOpsPullRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeAzurePullRequestDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeAzureDevOpsPullRequestRecord(result.success);
  const comments = (result.success.threads ?? [])
    .filter((t) => !t.isDeleted)
    .flatMap((t) => t.comments ?? [])
    .filter((c) => (c.content?.trim() ?? "").length > 0)
    .map((c) => ({
      author: c.author?.uniqueName?.trim() ?? c.author?.displayName?.trim() ?? "unknown",
      body: c.content ?? "",
      createdAt: c.publishedDate ?? "",
    }));
  return Result.succeed({
    ...summary,
    body: result.success.description ?? "",
    comments,
  });
}

export interface NormalizedAzureDevOpsThreadComment {
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
}

const AzureDevOpsThreadListSchema = Schema.Array(
  Schema.Struct({
    comments: Schema.optional(Schema.Array(AzureThreadCommentSchema)),
    isDeleted: Schema.optional(Schema.NullOr(Schema.Boolean)),
  }),
);

const decodeThreadList = decodeJsonResult(AzureDevOpsThreadListSchema);

export function decodeAzureDevOpsPullRequestThreadsJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedAzureDevOpsThreadComment>,
  Cause.Cause<Schema.SchemaError>
> {
  if (raw.length === 0) return Result.succeed([]);
  const result = decodeThreadList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const comments = result.success
    .filter((t) => !t.isDeleted)
    .flatMap((t) => t.comments ?? [])
    .filter((c) => (c.content?.trim() ?? "").length > 0)
    .map((c) => ({
      author: c.author?.uniqueName?.trim() ?? c.author?.displayName?.trim() ?? "unknown",
      body: c.content ?? "",
      createdAt: c.publishedDate ?? "",
    }));
  return Result.succeed(comments);
}
