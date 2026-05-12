import type {
  AtlassianConnectionId,
  AtlassianProjectLink,
  EnvironmentId,
  ProjectId,
  WorkItemStateFilter,
  WorkItemSummary,
} from "@s3tools/contracts";
import { DateTime, Option } from "effect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@tanstack/react-pacer";
import { RotateCwIcon, SearchIcon, TicketCheckIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type RefObject } from "react";
import { readEnvironmentConnection } from "~/environments/runtime";
import {
  workItemListQueryOptions,
  workItemsQueryKeys,
  workItemSearchQueryOptions,
} from "~/lib/workItemsRpc";
import { cn } from "~/lib/utils";
import type { WsRpcClient } from "~/rpc/wsRpcClient";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { stackedThreadToast, toastManager } from "../ui/toast";

const workItemStateOptions: ReadonlyArray<{ id: WorkItemStateFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "in_progress", label: "In progress" },
  { id: "done", label: "Done" },
  { id: "all", label: "All" },
];

const dateFmt = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

interface WorkItemsTabProps {
  environmentId: EnvironmentId | null;
  projectId: ProjectId | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  stateFilter: WorkItemStateFilter;
  onStateFilterChange: (state: WorkItemStateFilter) => void;
  onSelect: (item: WorkItemSummary) => void;
}

function splitProjectKeys(value: string): string[] {
  return value
    .split(/[,\s]+/u)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);
}

function connectionIdValue(value: AtlassianConnectionId | null | undefined): string {
  return value ?? "";
}

function defaultProjectLink(input: {
  readonly projectId: ProjectId;
  readonly existing: AtlassianProjectLink | null | undefined;
  readonly jiraConnectionId: AtlassianConnectionId | null;
  readonly jiraSiteUrl: string | null;
  readonly jiraProjectKeys: ReadonlyArray<string>;
}) {
  return {
    projectId: input.projectId,
    jiraConnectionId: input.jiraConnectionId,
    bitbucketConnectionId: input.existing?.bitbucketConnectionId ?? null,
    jiraCloudId: input.existing?.jiraCloudId ?? null,
    jiraSiteUrl: input.jiraSiteUrl,
    jiraProjectKeys: input.jiraProjectKeys,
    bitbucketWorkspace: input.existing?.bitbucketWorkspace ?? null,
    bitbucketRepoSlug: input.existing?.bitbucketRepoSlug ?? null,
    defaultIssueTypeName: input.existing?.defaultIssueTypeName ?? null,
    branchNameTemplate: input.existing?.branchNameTemplate ?? "{issueKey}-{titleSlug}",
    commitMessageTemplate: input.existing?.commitMessageTemplate ?? "{issueKey}: {summary}",
    pullRequestTitleTemplate: input.existing?.pullRequestTitleTemplate ?? "{issueKey}: {summary}",
    smartLinkingEnabled: input.existing?.smartLinkingEnabled ?? true,
    autoAttachWorkItems: input.existing?.autoAttachWorkItems ?? true,
  };
}

export function WorkItemsTab(props: WorkItemsTabProps) {
  const queryClient = useQueryClient();
  const [debouncedQuery] = useDebouncedValue(props.query, { wait: 200 });
  const connection =
    props.environmentId !== null ? readEnvironmentConnection(props.environmentId) : null;
  const client = connection?.client ?? null;

  const projectLinkQuery = useQuery({
    queryKey: workItemsQueryKeys.projectLink(props.environmentId, props.projectId),
    queryFn: async () => {
      if (!client || !props.projectId) return null;
      return client.atlassian.getProjectLink({ projectId: props.projectId });
    },
    enabled: client !== null && props.projectId !== null,
  });

  const connectionsQuery = useQuery({
    queryKey: ["atlassian", "connections", props.environmentId] as const,
    queryFn: async () => {
      if (!client) return [];
      return client.atlassian.listConnections();
    },
    enabled: client !== null,
  });

  const jiraConnections = useMemo(
    () =>
      (connectionsQuery.data ?? []).filter(
        (item) => item.status === "connected" && item.products.includes("jira"),
      ),
    [connectionsQuery.data],
  );

  const projectLink = projectLinkQuery.data ?? null;
  const configured =
    projectLink?.jiraConnectionId !== null &&
    projectLink?.jiraConnectionId !== undefined &&
    projectLink?.jiraSiteUrl !== null &&
    projectLink?.jiraSiteUrl !== undefined &&
    projectLink.jiraProjectKeys.length > 0;

  const listQuery = useQuery(
    workItemListQueryOptions({
      environmentId: props.environmentId,
      projectId: props.projectId,
      state: props.stateFilter,
      limit: 100,
      enabled: configured,
    }),
  );

  const cachedItems = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const filteredItems = useMemo(() => {
    const needle = props.query.trim().toLowerCase();
    if (!needle) return cachedItems;
    return cachedItems.filter(
      (item) =>
        item.key.toLowerCase().includes(needle) ||
        item.title.toLowerCase().includes(needle) ||
        (item.issueType?.toLowerCase().includes(needle) ?? false),
    );
  }, [cachedItems, props.query]);

  const needsServerSearch = filteredItems.length === 0 && debouncedQuery.trim().length >= 2;
  const searchQuery = useQuery(
    workItemSearchQueryOptions({
      environmentId: props.environmentId,
      projectId: props.projectId,
      query: debouncedQuery,
      limit: 50,
      enabled: configured && needsServerSearch,
    }),
  );

  const items = needsServerSearch ? (searchQuery.data ?? []) : filteredItems;
  const isLoading = projectLinkQuery.isLoading || listQuery.isLoading || searchQuery.isLoading;
  const error = projectLinkQuery.error ?? listQuery.error ?? searchQuery.error;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {configured ? (
        <>
          <div className="flex items-center gap-2 border-border/60 border-b px-4 py-2.5">
            <div className="relative flex-1">
              <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-2 size-3.5 text-muted-foreground" />
              <Input
                ref={props.searchInputRef}
                value={props.query}
                onChange={(event) => props.onQueryChange(event.target.value)}
                placeholder="Search Jira work items by key or title…"
                className="h-8 pl-7 text-sm"
              />
            </div>
            <WorkItemStateFilterButtons
              value={props.stateFilter}
              onChange={props.onStateFilterChange}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => listQuery.refetch()}
              disabled={listQuery.isFetching}
              aria-label="Refresh"
            >
              <RotateCwIcon
                className={listQuery.isFetching ? "size-3.5 animate-spin" : "size-3.5"}
              />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <p className="px-4 py-6 text-destructive text-sm">
                {error instanceof Error ? error.message : "Failed to load Jira work items."}
              </p>
            ) : (
              <WorkItemList
                items={items}
                isLoading={isLoading}
                emptyText={
                  props.query.trim().length > 0
                    ? "No Jira work items match this search."
                    : "No Jira work items to show."
                }
                onSelect={props.onSelect}
              />
            )}
          </div>
        </>
      ) : (
        <JiraProjectSetup
          environmentId={props.environmentId}
          projectId={props.projectId}
          client={client}
          connections={jiraConnections}
          connectionsPending={connectionsQuery.isLoading}
          projectLink={projectLink}
          onSaved={() => {
            void queryClient.invalidateQueries({
              queryKey: workItemsQueryKeys.projectLink(props.environmentId, props.projectId),
            });
            void queryClient.invalidateQueries({ queryKey: workItemsQueryKeys.all });
          }}
        />
      )}
    </div>
  );
}

function WorkItemStateFilterButtons(props: {
  readonly value: WorkItemStateFilter;
  readonly onChange: (state: WorkItemStateFilter) => void;
}) {
  return (
    <div className="inline-flex rounded-md border border-border/70 bg-background p-0.5">
      {workItemStateOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          className={cn(
            "h-6 rounded-sm px-2 text-xs transition",
            props.value === option.id
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => props.onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function WorkItemList(props: {
  readonly items: ReadonlyArray<WorkItemSummary>;
  readonly isLoading: boolean;
  readonly emptyText: string;
  readonly onSelect: (item: WorkItemSummary) => void;
}) {
  if (props.isLoading && props.items.length === 0) {
    return <div className="px-4 py-8 text-center text-muted-foreground text-sm">Loading…</div>;
  }
  if (props.items.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground text-sm">{props.emptyText}</div>
    );
  }
  return (
    <ul role="listbox" className="divide-y divide-border/40">
      {props.items.map((item) => (
        <li key={`${item.provider}:${item.key}`}>
          <button
            type="button"
            onClick={() => props.onSelect(item)}
            className={cn(
              "flex w-full items-start gap-3 px-4 py-3 text-left",
              "hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none",
            )}
          >
            <TicketCheckIcon className="mt-0.5 size-4 shrink-0 text-blue-600 dark:text-blue-300" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground text-xs">{item.key}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-sm">{item.title}</span>
                <Badge
                  variant={
                    item.state === "done" || item.state === "closed" ? "secondary" : "outline"
                  }
                  size="sm"
                >
                  {item.state.replace("_", " ")}
                </Badge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                {item.issueType ? <span>{item.issueType}</span> : null}
                {item.assignee ? <span>assigned to {item.assignee}</span> : null}
                {item.priority ? <span>{item.priority}</span> : null}
                {item.updatedAt && Option.isSome(item.updatedAt) ? (
                  <span className="ml-auto">
                    {dateFmt.format(DateTime.toDate(item.updatedAt.value))}
                  </span>
                ) : null}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function JiraProjectSetup(props: {
  readonly environmentId: EnvironmentId | null;
  readonly projectId: ProjectId | null;
  readonly client: WsRpcClient | null;
  readonly connections: ReadonlyArray<{
    readonly connectionId: AtlassianConnectionId;
    readonly label: string;
    readonly baseUrl: string | null;
  }>;
  readonly connectionsPending: boolean;
  readonly projectLink: AtlassianProjectLink | null;
  readonly onSaved: () => void;
}) {
  const [connectionId, setConnectionId] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [projectKeys, setProjectKeys] = useState("");

  useEffect(() => {
    const first = props.connections[0];
    setConnectionId(connectionIdValue(props.projectLink?.jiraConnectionId ?? first?.connectionId));
    setSiteUrl(props.projectLink?.jiraSiteUrl ?? first?.baseUrl ?? "");
    setProjectKeys(props.projectLink?.jiraProjectKeys.join(", ") ?? "");
  }, [props.connections, props.projectLink]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!props.client || !props.projectId) throw new Error("No project connection is available.");
      const selectedConnectionId = connectionId.trim() as AtlassianConnectionId;
      const keys = splitProjectKeys(projectKeys);
      if (!selectedConnectionId || siteUrl.trim().length === 0 || keys.length === 0) {
        throw new Error("Select a Jira connection, site URL, and at least one project key.");
      }
      return props.client.atlassian.saveProjectLink(
        defaultProjectLink({
          projectId: props.projectId,
          existing: props.projectLink,
          jiraConnectionId: selectedConnectionId,
          jiraSiteUrl: siteUrl.trim(),
          jiraProjectKeys: keys,
        }),
      );
    },
    onSuccess: () => {
      props.onSaved();
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: "Jira project linked",
          description: "Work items will now load in the project explorer.",
        }),
      );
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not link Jira project",
          description: error instanceof Error ? error.message : "The project link was not saved.",
        }),
      );
    },
  });

  const canSave =
    props.client !== null &&
    props.projectId !== null &&
    connectionId.trim().length > 0 &&
    siteUrl.trim().length > 0 &&
    splitProjectKeys(projectKeys).length > 0 &&
    !saveMutation.isPending;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-border/70 bg-muted/50">
            <TicketCheckIcon className="size-4 text-blue-600 dark:text-blue-300" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm">Link this project to Jira</h3>
            <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
              Save a Jira token in Source Control settings, then choose the Jira site and project
              keys that belong to this repository.
            </p>
          </div>
        </div>

        {props.connectionsPending ? (
          <div className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-3 text-muted-foreground text-sm">
            <Spinner className="size-4" />
            Loading Jira connections…
          </div>
        ) : props.connections.length === 0 ? (
          <div className="rounded-md border border-border/70 px-3 py-3 text-muted-foreground text-sm">
            No Jira token is stored yet. Add one from Settings, Source Control, Atlassian Workflow.
          </div>
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              if (canSave) saveMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label className="text-xs">Jira connection</Label>
              <Select
                value={connectionId}
                onValueChange={(value) => {
                  if (typeof value === "string") setConnectionId(value);
                }}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Select Jira connection" />
                </SelectTrigger>
                <SelectPopup>
                  {props.connections.map((connection) => (
                    <SelectItem key={connection.connectionId} value={connection.connectionId}>
                      {connection.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="work-item-jira-site" className="text-xs">
                Jira site URL
              </Label>
              <Input
                id="work-item-jira-site"
                size="sm"
                value={siteUrl}
                inputMode="url"
                onChange={(event) => setSiteUrl(event.currentTarget.value)}
                placeholder="https://your-team.atlassian.net"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="work-item-jira-project-keys" className="text-xs">
                Project keys
              </Label>
              <Input
                id="work-item-jira-project-keys"
                size="sm"
                value={projectKeys}
                onChange={(event) => setProjectKeys(event.currentTarget.value)}
                placeholder="WEB, API"
              />
            </div>
            <Button type="submit" size="sm" className="h-8 justify-self-start" disabled={!canSave}>
              {saveMutation.isPending ? <Spinner className="size-3.5" /> : null}
              Link Jira Project
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
