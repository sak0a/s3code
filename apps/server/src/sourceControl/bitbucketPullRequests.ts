import { Cause, DateTime, Option, Result, Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "@s3tools/contracts";
import { decodeJsonResult } from "@s3tools/shared/schemaJson";

export interface NormalizedBitbucketPullRequestRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state: "open" | "closed" | "merged";
  readonly updatedAt: Option.Option<DateTime.Utc>;
  readonly author?: string;
  readonly isCrossRepository?: boolean;
  readonly commentsCount?: number;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

export const BitbucketRepositoryRefSchema = Schema.Struct({
  full_name: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  workspace: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        slug: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
      }),
    ),
  ),
});

export const BitbucketPullRequestBranchSchema = Schema.Struct({
  repository: Schema.optional(Schema.NullOr(BitbucketRepositoryRefSchema)),
  branch: Schema.Struct({
    name: TrimmedNonEmptyString,
  }),
});

export const BitbucketPullRequestUserSchema = Schema.Struct({
  display_name: Schema.optional(Schema.NullOr(Schema.String)),
  nickname: Schema.optional(Schema.NullOr(Schema.String)),
  account_id: Schema.optional(Schema.NullOr(Schema.String)),
  username: Schema.optional(Schema.NullOr(Schema.String)),
});

export const BitbucketPullRequestParticipantSchema = Schema.Struct({
  user: BitbucketPullRequestUserSchema,
  role: Schema.optional(Schema.NullOr(Schema.String)),
  approved: Schema.optional(Schema.Boolean),
});

export const BitbucketPullRequestSchema = Schema.Struct({
  id: PositiveInt,
  title: TrimmedNonEmptyString,
  state: Schema.optional(Schema.NullOr(Schema.String)),
  updated_on: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  author: Schema.optional(Schema.NullOr(BitbucketPullRequestUserSchema)),
  reviewers: Schema.optional(Schema.Array(BitbucketPullRequestUserSchema)),
  participants: Schema.optional(Schema.Array(BitbucketPullRequestParticipantSchema)),
  comment_count: Schema.optional(Schema.Number),
  task_count: Schema.optional(Schema.Number),
  links: Schema.Struct({
    html: Schema.Struct({
      href: TrimmedNonEmptyString,
    }),
  }),
  source: BitbucketPullRequestBranchSchema,
  destination: BitbucketPullRequestBranchSchema,
});

export const BitbucketPullRequestListSchema = Schema.Struct({
  values: Schema.Array(BitbucketPullRequestSchema),
  next: Schema.optional(TrimmedNonEmptyString),
});

function trimOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function repositoryOwner(repository: Schema.Schema.Type<typeof BitbucketRepositoryRefSchema>) {
  return (
    trimOptionalString(repository.workspace?.slug) ??
    (repository.full_name?.includes("/") ? (repository.full_name.split("/")[0] ?? null) : null)
  );
}

function normalizeBitbucketPullRequestState(state: string | null | undefined) {
  switch (state?.trim().toUpperCase()) {
    case "MERGED":
      return "merged" as const;
    case "DECLINED":
    case "SUPERSEDED":
      return "closed" as const;
    case "OPEN":
    default:
      return "open" as const;
  }
}

function bitbucketUserDisplayName(
  user: typeof BitbucketPullRequestUserSchema.Type | null | undefined,
): string | null {
  const display =
    trimOptionalString(user?.display_name) ??
    trimOptionalString(user?.nickname) ??
    trimOptionalString(user?.username) ??
    trimOptionalString(user?.account_id);
  return display;
}

export function normalizeBitbucketPullRequestRecord(
  raw: Schema.Schema.Type<typeof BitbucketPullRequestSchema>,
): NormalizedBitbucketPullRequestRecord {
  const headRepositoryNameWithOwner = trimOptionalString(raw.source.repository?.full_name);
  const baseRepositoryNameWithOwner = trimOptionalString(raw.destination.repository?.full_name);
  const headRepositoryOwnerLogin = raw.source.repository
    ? repositoryOwner(raw.source.repository)
    : null;
  const author = bitbucketUserDisplayName(raw.author);
  const isCrossRepository =
    headRepositoryNameWithOwner !== null &&
    baseRepositoryNameWithOwner !== null &&
    headRepositoryNameWithOwner !== baseRepositoryNameWithOwner;

  return {
    number: raw.id,
    title: raw.title,
    url: raw.links.html.href,
    baseRefName: raw.destination.branch.name,
    headRefName: raw.source.branch.name,
    state: normalizeBitbucketPullRequestState(raw.state),
    updatedAt: raw.updated_on ?? Option.none(),
    ...(author ? { author } : {}),
    ...(typeof raw.comment_count === "number" ? { commentsCount: raw.comment_count } : {}),
    ...(isCrossRepository ? { isCrossRepository: true } : {}),
    ...(headRepositoryNameWithOwner ? { headRepositoryNameWithOwner } : {}),
    ...(headRepositoryOwnerLogin ? { headRepositoryOwnerLogin } : {}),
  };
}

export interface NormalizedBitbucketPullRequestDetail extends NormalizedBitbucketPullRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
  readonly reviewers: ReadonlyArray<string>;
  readonly participants: ReadonlyArray<{
    readonly displayName: string;
    readonly username?: string;
    readonly role?: string;
    readonly approved?: boolean;
  }>;
  readonly tasksCount?: number;
  readonly linkedWorkItemKeys: ReadonlyArray<string>;
}

export const BitbucketPullRequestDetailSchema = Schema.Struct({
  ...BitbucketPullRequestSchema.fields,
  summary: Schema.optional(
    Schema.NullOr(Schema.Struct({ raw: Schema.optional(Schema.NullOr(Schema.String)) })),
  ),
});

const decodeBitbucketPullRequestDetailDecoder = decodeJsonResult(BitbucketPullRequestDetailSchema);

const WORK_ITEM_KEY_PATTERN = /\b[A-Z][A-Z0-9]+-\d+\b/gu;

function extractWorkItemKeys(input: string): ReadonlyArray<string> {
  return Array.from(new Set(input.match(WORK_ITEM_KEY_PATTERN) ?? []));
}

export function normalizeBitbucketPullRequestDetailRecord(
  raw: Schema.Schema.Type<typeof BitbucketPullRequestDetailSchema>,
  comments: NormalizedBitbucketPullRequestDetail["comments"],
): NormalizedBitbucketPullRequestDetail {
  const summary = normalizeBitbucketPullRequestRecord(raw);
  const body = raw.summary?.raw ?? "";
  return {
    ...summary,
    body,
    comments,
    reviewers: (raw.reviewers ?? [])
      .map(bitbucketUserDisplayName)
      .filter((value): value is string => value !== null),
    participants: (raw.participants ?? [])
      .map((participant) => {
        const displayName = bitbucketUserDisplayName(participant.user);
        if (displayName === null) return null;
        const detail: {
          readonly displayName: string;
          username?: string;
          role?: string;
          approved?: boolean;
        } = {
          displayName,
        };
        if (participant.user.nickname) detail.username = participant.user.nickname;
        if (participant.role) detail.role = participant.role;
        if (participant.approved !== undefined) detail.approved = participant.approved;
        return detail;
      })
      .filter((value): value is NonNullable<typeof value> => value !== null),
    ...(typeof raw.task_count === "number" ? { tasksCount: raw.task_count } : {}),
    linkedWorkItemKeys: extractWorkItemKeys(`${raw.title}\n${body}`),
  };
}

export function decodeBitbucketPullRequestDetailJson(
  raw: string,
): Result.Result<NormalizedBitbucketPullRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeBitbucketPullRequestDetailDecoder(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  return Result.succeed(normalizeBitbucketPullRequestDetailRecord(result.success, []));
}
