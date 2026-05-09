import { memo } from "react";
import { cn } from "~/lib/utils";

export type IssueStateFilter = "open" | "closed" | "all";
export type ChangeRequestStateFilter = "open" | "closed" | "merged" | "all";

const issueOptions: ReadonlyArray<{ id: IssueStateFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

const changeRequestOptions: ReadonlyArray<{ id: ChangeRequestStateFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

function FilterPills<T extends string>(props: {
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/40 p-0.5">
      {props.options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => props.onChange(option.id)}
          aria-pressed={props.value === option.id}
          className={cn(
            "rounded px-2 py-0.5 text-xs",
            props.value === option.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export const StateFilterButtons = memo(function StateFilterButtons(props: {
  value: IssueStateFilter;
  onChange: (value: IssueStateFilter) => void;
}) {
  return (
    <FilterPills<IssueStateFilter>
      value={props.value}
      options={issueOptions}
      onChange={props.onChange}
    />
  );
});

export const ChangeRequestStateFilterButtons = memo(
  function ChangeRequestStateFilterButtons(props: {
    value: ChangeRequestStateFilter;
    onChange: (value: ChangeRequestStateFilter) => void;
  }) {
    return (
      <FilterPills<ChangeRequestStateFilter>
        value={props.value}
        options={changeRequestOptions}
        onChange={props.onChange}
      />
    );
  },
);
