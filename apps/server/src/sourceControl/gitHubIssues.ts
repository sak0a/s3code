import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedGitHubIssueRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
  readonly assignees: ReadonlyArray<string>;
  readonly commentsCount: number | null;
}

export interface NormalizedGitHubIssueDetail extends NormalizedGitHubIssueRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const GitHubIssueSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updatedAt: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
  labels: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
  assignees: Schema.optional(Schema.Array(Schema.Struct({ login: Schema.String }))),
  body: Schema.optional(Schema.NullOr(Schema.String)),
  comments: Schema.optional(
    Schema.Union([
      // `gh issue view` returns full comment objects.
      Schema.Array(
        Schema.Struct({
          author: Schema.optional(Schema.NullOr(Schema.Struct({ login: Schema.String }))),
          body: Schema.String,
          createdAt: Schema.String,
        }),
      ),
      // `gh issue list` returns just the count.
      Schema.Number,
    ]),
  ),
});

function normalizeIssueState(raw: string | null | undefined): "open" | "closed" {
  return raw?.trim().toUpperCase() === "CLOSED" ? "closed" : "open";
}

function normalizeGitHubIssueRecord(
  raw: Schema.Schema.Type<typeof GitHubIssueSchema>,
): NormalizedGitHubIssueRecord {
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
    state: normalizeIssueState(raw.state),
    author: raw.author?.login ?? null,
    updatedAt: raw.updatedAt ? Option.some(raw.updatedAt) : Option.none(),
    labels: (raw.labels ?? []).map((l) => l.name),
    assignees: (raw.assignees ?? []).map((a) => a.login),
    commentsCount,
  };
}

const decodeIssueList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeIssueDetail = decodeJsonResult(GitHubIssueSchema);
const decodeIssueEntry = Schema.decodeUnknownExit(GitHubIssueSchema);

export const formatGitHubIssueDecodeError = formatSchemaError;

export function decodeGitHubIssueListJson(
  raw: string,
): Result.Result<ReadonlyArray<NormalizedGitHubIssueRecord>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const issues: NormalizedGitHubIssueRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodeIssueEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    issues.push(normalizeGitHubIssueRecord(decoded.value));
  }
  return Result.succeed(issues);
}

export function decodeGitHubIssueDetailJson(
  raw: string,
): Result.Result<NormalizedGitHubIssueDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeGitHubIssueRecord(result.success);
  const rawComments = Array.isArray(result.success.comments) ? result.success.comments : [];
  const detail: NormalizedGitHubIssueDetail = {
    ...summary,
    body: result.success.body ?? "",
    comments: rawComments.map((c) => ({
      author: c.author?.login ?? "unknown",
      body: c.body,
      createdAt: c.createdAt,
    })),
  };
  return Result.succeed(detail);
}
