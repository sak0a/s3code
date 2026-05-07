import { memo } from "react";
import { cn } from "~/lib/utils";

export type ContextPickerTab = {
  id: string;
  label: string;
  count?: number;
};

export const ContextPickerTabs = memo(function ContextPickerTabs(props: {
  tabs: ReadonlyArray<ContextPickerTab>;
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 px-3 py-1.5 border-b border-border">
      {props.tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={props.activeId === tab.id}
          onClick={() => props.onSelect(tab.id)}
          className={cn(
            "rounded-md px-2 py-1 text-xs",
            props.activeId === tab.id
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
          {typeof tab.count === "number" ? (
            <span className="ml-1 opacity-60">{tab.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
});
