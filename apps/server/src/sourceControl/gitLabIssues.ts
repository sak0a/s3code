import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedGitLabIssueRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

export interface NormalizedGitLabIssueDetail extends NormalizedGitLabIssueRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const GitLabIssueSchema = Schema.Struct({
  iid: PositiveInt,
  title: TrimmedNonEmptyString,
  web_url: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updated_at: Schema.optional(Schema.NullOr(Schema.String)),
  author: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        username: Schema.optional(Schema.String),
        name: Schema.optional(Schema.String),
      }),
    ),
  ),
  labels: Schema.optional(Schema.Array(Schema.String)),
  description: Schema.optional(Schema.NullOr(Schema.String)),
  notes: Schema.optional(
    Schema.Array(
      Schema.Struct({
        author: Schema.optional(
          Schema.NullOr(
            Schema.Struct({
              username: Schema.optional(Schema.String),
              name: Schema.optional(Schema.String),
            }),
          ),
        ),
        body: Schema.String,
        created_at: Schema.String,
      }),
    ),
  ),
});

function normalizeIssueState(raw: string | null | undefined): "open" | "closed" {
  return raw?.trim().toLowerCase() === "closed" ? "closed" : "open";
}

function authorName(
  author:
    | { readonly username?: string | undefined; readonly name?: string | undefined }
    | null
    | undefined,
): string | null {
  return author?.username?.trim() || author?.name?.trim() || null;
}

function normalizeGitLabIssueRecord(
  raw: Schema.Schema.Type<typeof GitLabIssueSchema>,
): NormalizedGitLabIssueRecord {
  return {
    number: raw.iid,
    title: raw.title,
    url: raw.web_url,
    state: normalizeIssueState(raw.state),
    author: authorName(raw.author),
    updatedAt: raw.updated_at ? Option.some(raw.updated_at) : Option.none(),
    labels: raw.labels ?? [],
  };
}

const decodeIssueList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeIssueDetail = decodeJsonResult(GitLabIssueSchema);
const decodeIssueEntry = Schema.decodeUnknownExit(GitLabIssueSchema);

export const formatGitLabIssueDecodeError = formatSchemaError;

export function decodeGitLabIssueListJson(
  raw: string,
): Result.Result<ReadonlyArray<NormalizedGitLabIssueRecord>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const issues: NormalizedGitLabIssueRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodeIssueEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    issues.push(normalizeGitLabIssueRecord(decoded.value));
  }
  return Result.succeed(issues);
}

export function decodeGitLabIssueDetailJson(
  raw: string,
): Result.Result<NormalizedGitLabIssueDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeGitLabIssueRecord(result.success);
  const detail: NormalizedGitLabIssueDetail = {
    ...summary,
    body: result.success.description ?? "",
    comments: (result.success.notes ?? []).map((note) => ({
      author: authorName(note.author) ?? "unknown",
      body: note.body,
      createdAt: note.created_at,
    })),
  };
  return Result.succeed(detail);
}
