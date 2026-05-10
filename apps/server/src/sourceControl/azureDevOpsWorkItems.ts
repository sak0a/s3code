import { Cause, Exit, Option, Result, Schema } from "effect";
import { PositiveInt } from "@s3tools/contracts";
import { decodeJsonResult, formatSchemaError } from "@s3tools/shared/schemaJson";

export interface NormalizedAzureDevOpsWorkItemRecord {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly state: "open" | "closed";
  readonly author: string | null;
  readonly updatedAt: Option.Option<string>;
  readonly labels: ReadonlyArray<string>;
}

export interface NormalizedAzureDevOpsWorkItemDetail extends NormalizedAzureDevOpsWorkItemRecord {
  readonly body: string;
  readonly comments: ReadonlyArray<{
    readonly author: string;
    readonly body: string;
    readonly createdAt: string;
  }>;
}

const AzureUserSchema = Schema.Struct({
  uniqueName: Schema.optional(Schema.String),
  displayName: Schema.optional(Schema.String),
});

const AzureFieldsSchema = Schema.Struct({
  "System.Title": Schema.optional(Schema.NullOr(Schema.String)),
  "System.State": Schema.optional(Schema.NullOr(Schema.String)),
  "System.Tags": Schema.optional(Schema.NullOr(Schema.String)),
  "System.ChangedDate": Schema.optional(Schema.NullOr(Schema.String)),
  "System.CreatedBy": Schema.optional(Schema.NullOr(AzureUserSchema)),
  "System.Description": Schema.optional(Schema.NullOr(Schema.String)),
});

const AzureWorkItemSchema = Schema.Struct({
  id: PositiveInt,
  fields: AzureFieldsSchema,
  url: Schema.optional(Schema.NullOr(Schema.String)),
});

const CLOSED_STATES = new Set([
  "closed",
  "resolved",
  "done",
  "completed",
  "removed",
  "cancelled",
  "canceled",
  "rejected",
]);

function normalizeState(raw: string | null | undefined): "open" | "closed" {
  return raw && CLOSED_STATES.has(raw.trim().toLowerCase()) ? "closed" : "open";
}

function authorOf(
  user:
    | { readonly uniqueName?: string | undefined; readonly displayName?: string | undefined }
    | null
    | undefined,
): string | null {
  return user?.uniqueName?.trim() || user?.displayName?.trim() || null;
}

function labelsFromTags(tags: string | null | undefined): ReadonlyArray<string> {
  if (!tags) return [];
  return tags
    .split(/;|,/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/gu, "");
}

function urlFor(raw: Schema.Schema.Type<typeof AzureWorkItemSchema>): string {
  // Prefer a synthesized human URL: /<org>/<proj>/_workitems/edit/<id>.
  // raw.url is the API URL (.../_apis/wit/workItems/<id>); convert it.
  const apiUrl = raw.url?.trim() ?? "";
  if (apiUrl.length === 0) return "";
  try {
    const parsed = new URL(apiUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    // Expect: <org>/<proj>/_apis/wit/workItems/<id>
    const apisIdx = segments.indexOf("_apis");
    if (apisIdx > 0) {
      const orgProj = segments.slice(0, apisIdx).join("/");
      return `${parsed.origin}/${orgProj}/_workitems/edit/${raw.id}`;
    }
  } catch {
    // fall through
  }
  return apiUrl;
}

function normalize(
  raw: Schema.Schema.Type<typeof AzureWorkItemSchema>,
): NormalizedAzureDevOpsWorkItemRecord {
  return {
    number: raw.id,
    title: raw.fields["System.Title"]?.trim() ?? "",
    url: urlFor(raw),
    state: normalizeState(raw.fields["System.State"]),
    author: authorOf(raw.fields["System.CreatedBy"]),
    updatedAt: raw.fields["System.ChangedDate"]
      ? Option.some(raw.fields["System.ChangedDate"])
      : Option.none(),
    labels: labelsFromTags(raw.fields["System.Tags"]),
  };
}

const decodeWorkItemList = decodeJsonResult(Schema.Array(Schema.Unknown));
const decodeWorkItemEntry = Schema.decodeUnknownExit(AzureWorkItemSchema);
const decodeWorkItemDetail = decodeJsonResult(AzureWorkItemSchema);

export const formatAzureDevOpsWorkItemDecodeError = formatSchemaError;

export function decodeAzureDevOpsWorkItemListJson(
  raw: string,
): Result.Result<
  ReadonlyArray<NormalizedAzureDevOpsWorkItemRecord>,
  Cause.Cause<Schema.SchemaError>
> {
  const result = decodeWorkItemList(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const items: NormalizedAzureDevOpsWorkItemRecord[] = [];
  for (const entry of result.success) {
    const decoded = decodeWorkItemEntry(entry);
    if (Exit.isFailure(decoded)) continue;
    if (!decoded.value.fields["System.Title"]) continue;
    items.push(normalize(decoded.value));
  }
  return Result.succeed(items);
}

export function decodeAzureDevOpsWorkItemDetailJson(
  raw: string,
): Result.Result<NormalizedAzureDevOpsWorkItemDetail, Cause.Cause<Schema.SchemaError>> {
  const result = decodeWorkItemDetail(raw);
  if (!Result.isSuccess(result)) return Result.fail(result.failure);
  const summary = normalize(result.success);
  return Result.succeed({
    ...summary,
    body: stripHtml(result.success.fields["System.Description"] ?? ""),
    comments: [], // populated by separate API/CLI call in the provider layer
  });
}
