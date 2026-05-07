import { Cause, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@t3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@t3tools/shared/schemaJson";

export interface NormalizedBitbucketIssueRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

export interface NormalizedBitbucketIssueDetail extends NormalizedBitbucketIssueRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const BitbucketUserSchema = Schema.Struct({
  username: Schema.optional(Schema.String),
  display_name: Schema.optional(Schema.String),
});

export const BitbucketIssueSchema = Schema.Struct({
  id: PositiveInt,
  title: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updated_on: Schema.optional(Schema.NullOr(Schema.String)),
  reporter: Schema.optional(Schema.NullOr(BitbucketUserSchema)),
  links: Schema.Struct({
    html: Schema.optional(Schema.Struct({ href: TrimmedNonEmptyString })),
    self: Schema.optional(Schema.Struct({ href: Schema.String })),
  }),
  content: Schema.optional(
    Schema.NullOr(
      Schema.Struct({ raw: Schema.optional(Schema.NullOr(Schema.String)) }),
    ),
  ),
});

export const BitbucketIssueListSchema = Schema.Struct({
  values: Schema.Array(BitbucketIssueSchema),
});

export const BitbucketCommentSchema = Schema.Struct({
  user: Schema.optional(Schema.NullOr(BitbucketUserSchema)),
  content: Schema.optional(
    Schema.NullOr(
      Schema.Struct({ raw: Schema.optional(Schema.NullOr(Schema.String)) }),
    ),
  ),
  created_on: Schema.String,
});

export const BitbucketCommentListSchema = Schema.Struct({
  values: Schema.Array(BitbucketCommentSchema),
});

export interface BitbucketComment {
  readonly author: string;
  readonly body: string;
  readonly createdAt: string;
}

function authorOf(
  reporter:
    | {
        readonly username?: string | undefined;
        readonly display_name?: string | undefined;
      }
    | null
    | undefined,
): string | null {
  return (reporter?.username?.trim() || reporter?.display_name?.trim()) ?? null;
}

function normalizeState(raw: string | null | undefined): "open" | "closed" {
  const s = raw?.trim().toLowerCase();
  if (!s) return "open";
  return s === "new" || s === "open" || s === "submitted" ? "open" : "closed";
}

export function normalizeBitbucketIssueRecord(
  raw: Schema.Schema.Type<typeof BitbucketIssueSchema>,
): NormalizedBitbucketIssueRecord {
  return {
    number: raw.id,
    title: raw.title,
    url: raw.links.html?.href ?? "",
    state: normalizeState(raw.state),
    author: authorOf(raw.reporter),
    updatedAt: raw.updated_on ? Option.some(raw.updated_on) : Option.none(),
    labels: [],
  };
}

export function normalizeBitbucketCommentList(
  decoded: Schema.Schema.Type<typeof BitbucketCommentListSchema>,
): ReadonlyArray<BitbucketComment> {
  return decoded.values
    .filter((c) => (c.content?.raw?.trim() ?? "").length > 0)
    .map((c) => ({
      author: authorOf(c.user) ?? "unknown",
      body: c.content?.raw ?? "",
      createdAt: c.created_on,
    }));
}

const decodeIssueList = decodeJsonResult(BitbucketIssueListSchema);
const decodeIssueDetail = decodeJsonResult(BitbucketIssueSchema);
const decodeCommentList = decodeJsonResult(BitbucketCommentListSchema);

export const formatBitbucketIssueDecodeError = formatSchemaError;

export function decodeBitbucketIssueListJson(
  raw: string,
): Result.Result<ReadonlyArray<NormalizedBitbucketIssueRecord>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  return Result.succeed(result.success.values.map(normalizeBitbucketIssueRecord));
}

export function decodeBitbucketIssueDetailJson(
  raw: string,
): Result.Result<NormalizedBitbucketIssueDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeIssueDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalizeBitbucketIssueRecord(result.success);
  return Result.succeed({
    ...summary,
    body: result.success.content?.raw ?? "",
    comments: [],
  });
}

export function decodeBitbucketCommentListJson(
  raw: string,
): Result.Result<ReadonlyArray<BitbucketComment>, Cause.Cause<Schema.SchemaError>> {
  const result = decodeCommentList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  return Result.succeed(normalizeBitbucketCommentList(result.success));
}
