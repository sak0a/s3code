import { PlusIcon } from "lucide-react";
import { memo, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";
import type { SidebarStatusBucket } from "../Sidebar.logic";
import { tabKeyboardHint } from "./ChatSessionTabs.logic";

const BUCKET_DOT: Record<SidebarStatusBucket, string> = {
  done: "bg-muted-foreground/45",
  idle: "bg-muted-foreground/30",
  in_progress: "bg-sky-500 dark:bg-sky-300/80",
  review: "bg-amber-500 dark:bg-amber-300/90",
};

export interface ChatSessionTabsItem {
  key: string;
  title: string;
  bucket: SidebarStatusBucket;
}

export interface ChatSessionTabsProps {
  items: ReadonlyArray<ChatSessionTabsItem>;
  activeKey: string | null;
  onSelect: (key: string) => void;
  onPrefetchEnter?: ((key: string) => void) | undefined;
  onPrefetchLeave?: ((key: string) => void) | undefined;
  onNew?: (() => void) | undefined;
}

export const ChatSessionTabs = memo(function ChatSessionTabs(props: ChatSessionTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || props.activeKey === null) return;
    const active = containerRef.current.querySelector<HTMLElement>(
      `[data-session-tab-key="${CSS.escape(props.activeKey)}"]`,
    );
    if (active) {
      active.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [props.activeKey]);

  if (props.items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Sessions in this worktree"
      className="-mb-px flex min-h-7 shrink-0 items-end gap-0.5 overflow-x-auto"
    >
      {props.items.map((item, index) => {
        const isActive = item.key === props.activeKey;
        const hint = tabKeyboardHint(index);
        const prefetchEnter =
          !isActive && props.onPrefetchEnter ? () => props.onPrefetchEnter?.(item.key) : undefined;
        const prefetchLeave =
          !isActive && props.onPrefetchLeave ? () => props.onPrefetchLeave?.(item.key) : undefined;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-session-tab-key={item.key}
            onClick={() => props.onSelect(item.key)}
            onPointerEnter={prefetchEnter}
            onFocus={prefetchEnter}
            onPointerLeave={prefetchLeave}
            onBlur={prefetchLeave}
            className={cn(
              "group/tab relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 text-xs transition-colors",
              isActive
                ? "border-border/60 bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
            title={item.title}
          >
            <span
              aria-hidden
              className={cn(
                "inline-flex size-2 shrink-0 items-center justify-center",
                item.bucket === "in_progress" ? "animate-pulse" : "",
              )}
            >
              <span className={cn("size-1.5 rounded-full", BUCKET_DOT[item.bucket])} />
            </span>
            {hint ? (
              <kbd className="shrink-0 rounded border border-border/60 bg-muted/40 px-1 font-mono text-[9px] text-muted-foreground/80">
                {hint}
              </kbd>
            ) : null}
            <span className="min-w-0 max-w-40 truncate">{item.title}</span>
          </button>
        );
      })}
      {props.onNew ? (
        <button
          type="button"
          aria-label="New session in this worktree"
          title="New session in this worktree"
          onClick={props.onNew}
          className="ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
        >
          <PlusIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
});
