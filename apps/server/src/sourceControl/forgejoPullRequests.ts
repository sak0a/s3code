import { Cause, DateTime, Exit, Option, Result, Schema } from "effect";
import {
  PositiveInt,
  TrimmedNonEmptyString,
  type SourceControlChangeRequestCommit,
  type SourceControlChangeRequestFile,
} from "@s3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@s3tools/shared/schemaJson";

import {
  ForgejoCommentListSchema,
  ForgejoUserSchema,
  forgejoAuthorName,
  normalizeForgejoComment,
  type NormalizedForgejoComment,
} from "./forgejoIssues.ts";

export interface NormalizedForgejoRepository {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
  readonly defaultBranch: string | null;
}

export interface NormalizedForgejoPullRequestRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly headLabel: string | null;
  readonly state: "open" | "closed" | "merged";
  readonly updatedAt: Option.Option<DateTime.Utc>;
  readonly isCrossRepository?: boolean;
  readonly isDraft?: boolean;
  readonly author: string | null;
  readonly commentsCount: number | null;
  readonly headRepositoryNameWithOwner: string | null;
  readonly headRepositoryOwnerLogin: string | null;
  readonly headRepositoryCloneUrl: string | null;
  readonly headRepositorySshUrl: string | null;
}

export interface NormalizedForgejoPullRequestDetail extends NormalizedForgejoPullRequestRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<NormalizedForgejoComment>;
  readonly commits: ReadonlyArray<SourceControlChangeRequestCommit>;
  readonly additions: number;
  readonly deletions: number;
  readonly changedFiles: number;
  readonly files: ReadonlyArray<SourceControlChangeRequestFile>;
}

export const ForgejoRepositorySchema = Schema.Struct({
  full_name: TrimmedNonEmptyString,
  html_url: Schema.optional(Schema.String),
  clone_url: Schema.optional(Schema.String),
  ssh_url: Schema.optional(Schema.String),
  default_branch: Schema.optional(Schema.NullOr(Schema.String)),
});

const ForgejoPullRequestBranchSchema = Schema.Struct({
  ref: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
  repo: Schema.optional(Schema.NullOr(ForgejoRepositorySchema)),
  repo_id: Schema.optional(Schema.NullOr(Schema.Number)),
});

export const ForgejoPullRequestSchema = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: Schema.optional(Schema.String),
  html_url: Schema.optional(Schema.String),
  state: Schema.optional(Schema.NullOr(Schema.String)),
  merged: Schema.optional(Schema.Boolean),
  draft: Schema.optional(Schema.Boolean),
  body: Schema.optional(Schema.NullOr(Schema.String)),
  comments: Schema.optional(Schema.NullOr(Schema.Number)),
  user: Schema.optional(Schema.NullOr(ForgejoUserSchema)),
  updated_at: Schema.optional(Schema.OptionFromNullOr(Schema.DateTimeUtcFromString)),
  head: ForgejoPullRequestBranchSchema,
  base: ForgejoPullRequestBranchSchema,
});

const ForgejoCommitSchema = Schema.Struct({
  sha: Schema.optional(Schema.String),
  html_url: Schema.optional(Schema.String),
  commit: Schema.optional(
    Schema.Struct({
      message: Schema.optional(Schema.String),
      author: Schema.optional(
        Schema.NullOr(
          Schema.Struct({
            name: Schema.optional(Schema.String),
            date: Schema.optional(Schema.String),
          }),
        ),
      ),
    }),
  ),
  author: Schema.optional(Schema.NullOr(ForgejoUserSchema)),
});

const ForgejoChangedFileSchema = Schema.Struct({
  filename: TrimmedNonEmptyString,
  additions: Schema.optional(Schema.Number),
  deletions: Schema.optional(Schema.Number),
});

export const ForgejoPullRequestListSchema = Schema.Array(ForgejoPullRequestSchema);
export const ForgejoCommitListSchema = Schema.Array(ForgejoCommitSchema);
export const ForgejoChangedFileListSchema = Schema.Array(ForgejoChangedFileSchema);

export const formatForgejoPullRequestDecodeError = formatSchemaError;

function trimOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeState(input: {
  readonly state?: string | null | undefined;
  readonly merged?: boolean | undefined;
}): "open" | "closed" | "merged" {
  if (input.merged === true) {
    return "merged";
  }
  return input.state?.trim().toLowerCase() === "closed" ? "closed" : "open";
}

function ownerLoginFromNameWithOwner(nameWithOwner: string | null): string | null {
  return trimOptionalString(nameWithOwner?.split("/")[0]);
}

function normalizeRepository(
  raw: Schema.Schema.Type<typeof ForgejoRepositorySchema>,
): NormalizedForgejoRepository {
  return {
    nameWithOwner: raw.full_name,
    url: raw.clone_url ?? raw.html_url ?? raw.full_name,
    sshUrl: raw.ssh_url ?? raw.clone_url ?? raw.html_url ?? raw.full_name,
    defaultBranch: trimOptionalString(raw.default_branch),
  };
}

export function normalizeForgejoRepositoryCloneUrls(
  raw: Schema.Schema.Type<typeof ForgejoRepositorySchema>,
): {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
} {
  const repository = normalizeRepository(raw);
  return {
    nameWithOwner: repository.nameWithOwner,
    url: repository.url,
    sshUrl: repository.sshUrl,
  };
}

export function normalizeForgejoPullRequestRecord(
  raw: Schema.Schema.Type<typeof ForgejoPullRequestSchema>,
): NormalizedForgejoPullRequestRecord {
  const headRepository = raw.head.repo ? normalizeRepository(raw.head.repo) : null;
  const baseRepository = raw.base.repo ? normalizeRepository(raw.base.repo) : null;
  const headRepositoryNameWithOwner = headRepository?.nameWithOwner ?? null;
  const baseRepositoryNameWithOwner = baseRepository?.nameWithOwner ?? null;
  const isCrossRepository =
    headRepositoryNameWithOwner && baseRepositoryNameWithOwner
      ? headRepositoryNameWithOwner.toLowerCase() !== baseRepositoryNameWithOwner.toLowerCase()
      : typeof raw.head.repo_id === "number" && typeof raw.base.repo_id === "number"
        ? raw.head.repo_id !== raw.base.repo_id
        : undefined;

  return {
    number: raw.number,
    title: raw.title,
    url: raw.html_url ?? raw.url ?? `#${raw.number}`,
    baseRefName: trimOptionalString(raw.base.ref) ?? "main",
    headRefName: trimOptionalString(raw.head.ref) ?? trimOptionalString(raw.head.label) ?? "HEAD",
    headLabel: trimOptionalString(raw.head.label),
    state: normalizeState({ state: raw.state, merged: raw.merged }),
    updatedAt: raw.updated_at ?? Option.none(),
    ...(typeof isCrossRepository === "boolean" ? { isCrossRepository } : {}),
    ...(raw.draft !== undefined ? { isDraft: raw.draft } : {}),
    author: forgejoAuthorName(raw.user),
    commentsCount: raw.comments ?? null,
    headRepositoryNameWithOwner,
    headRepositoryOwnerLogin: ownerLoginFromNameWithOwner(headRepositoryNameWithOwner),
    headRepositoryCloneUrl: headRepository?.url ?? null,
    headRepositorySshUrl: headRepository?.sshUrl ?? null,
  };
}

function normalizeCommit(
  raw: Schema.Schema.Type<typeof ForgejoCommitSchema>,
): SourceControlChangeRequestCommit | null {
  const oid = trimOptionalString(raw.sha);
  if (!oid) return null;
  const headline = trimOptionalString(raw.commit?.message?.split(/\r?\n/)[0]) ?? "";
  return {
    oid,
    shortOid: oid.slice(0, 12),
    messageHeadline: headline,
    ...(raw.commit?.author?.date ? { committedDate: raw.commit.author.date } : {}),
    ...((forgejoAuthorName(raw.author) ?? raw.commit?.author?.name)
      ? { author: forgejoAuthorName(raw.author) ?? raw.commit?.author?.name }
      : {}),
  };
}

function normalizeChangedFile(
  raw: Schema.Schema.Type<typeof ForgejoChangedFileSchema>,
): SourceControlChangeRequestFile {
  return {
    path: raw.filename,
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
  };
}

export function normalizeForgejoPullRequestDetail(input: {
  readonly pullRequest: Schema.Schema.Type<typeof ForgejoPullRequestSchema>;
  readonly comments: ReadonlyArray<Schema.Schema.Type<typeof ForgejoCommentListSchema>[number]>;
  readonly commits: ReadonlyArray<Schema.Schema.Type<typeof ForgejoCommitListSchema>[number]>;
  readonly files: ReadonlyArray<Schema.Schema.Type<typeof ForgejoChangedFileListSchema>[number]>;
}): NormalizedForgejoPullRequestDetail {
  const files = input.files.map(normalizeChangedFile);
  return {
    ...normalizeForgejoPullRequestRecord(input.pullRequest),
    body: input.pullRequest.body ?? "",
    comments: input.comments.map(normalizeForgejoComment),
    commits: input.commits
      .map(normalizeCommit)
      .filter((commit): commit is SourceControlChangeRequestCommit => commit !== null),
    additions: files.reduce((total, file) => total + file.additions, 0),
    deletions: files.reduce((total, file) => total + file.deletions, 0),
    changedFiles: files.length,
    files,
  };
}

const decodePullRequestList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodePullRequestDetail = decodeJsonResult(ForgejoPullRequestSchema);
const decodePullRequestEntry = Schema.decodeUnknownExit(ForgejoPullRequestSchema);

export function decodeForgejoPullRequestListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedForgejoPullRequestRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodePullRequestList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);

  const pullRequests: NormalizedForgejoPullRequestRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodePullRequestEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    pullRequests.push(normalizeForgejoPullRequestRecord(decoded.value));
  }

  return Result.succeed(pullRequests);
}

export function decodeForgejoPullRequestDetailJson(
  raw: string,
): Result.Result<NormalizedForgejoPullRequestDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodePullRequestDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  return Result.succeed(
    normalizeForgejoPullRequestDetail({
      pullRequest: result.success,
      comments: [],
      commits: [],
      files: [],
    }),
  );
}
