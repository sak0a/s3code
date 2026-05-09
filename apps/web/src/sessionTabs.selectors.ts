import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime";
import type { ChatSessionTabsItem } from "./components/chat/ChatSessionTabs";
import {
  deriveStatusBucket,
  resolveThreadStatusPill,
  type SidebarStatusBucket,
} from "./components/Sidebar.logic";
import type { SidebarThreadSummary } from "./types";

export interface SessionTabsFilter {
  worktreeId: string | null | undefined;
  worktreePath: string | null | undefined;
}

interface CachedItem {
  item: ChatSessionTabsItem;
  inputs: {
    title: string;
    bucket: SidebarStatusBucket;
  };
}

export function createSessionTabsSelector(): (
  threads: ReadonlyArray<SidebarThreadSummary>,
  filter: SessionTabsFilter,
) => ReadonlyArray<ChatSessionTabsItem> {
  const cache = new Map<string, CachedItem>();
  let lastResult: ReadonlyArray<ChatSessionTabsItem> | null = null;

  return (threads, filter) => {
    const matching: SidebarThreadSummary[] = [];
    for (const thread of threads) {
      if (thread.archivedAt !== null) continue;
      if (thread.worktreeId !== undefined && thread.worktreeId !== null && filter.worktreeId) {
        if (thread.worktreeId !== filter.worktreeId) continue;
      } else if (filter.worktreePath) {
        if (thread.worktreePath !== filter.worktreePath) continue;
      } else {
        continue;
      }
      matching.push(thread);
    }
    matching.sort(
      (a, b) =>
        (Date.parse(b.updatedAt ?? b.createdAt ?? "") || 0) -
        (Date.parse(a.updatedAt ?? a.createdAt ?? "") || 0),
    );

    const seenKeys = new Set<string>();
    const items: ChatSessionTabsItem[] = [];
    let identical = lastResult !== null && lastResult.length === matching.length;
    for (let i = 0; i < matching.length; i += 1) {
      const thread = matching[i]!;
      const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      seenKeys.add(key);
      const bucket = deriveStatusBucket({
        manualBucket: thread.manualStatusBucket ?? null,
        statusPill: resolveThreadStatusPill({ thread }),
      });
      const cached = cache.get(key);
      let item: ChatSessionTabsItem;
      if (cached && cached.inputs.title === thread.title && cached.inputs.bucket === bucket) {
        item = cached.item;
      } else {
        item = { key, title: thread.title, bucket };
        cache.set(key, { item, inputs: { title: thread.title, bucket } });
      }
      items.push(item);
      if (identical && lastResult![i] !== item) identical = false;
    }

    for (const key of cache.keys()) {
      if (!seenKeys.has(key)) cache.delete(key);
    }

    if (identical && lastResult) return lastResult;
    lastResult = items;
    return items;
  };
}
