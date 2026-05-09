export interface TabPrefetchControllerInput {
  retain: (key: string) => () => void;
  releaseDelayMs: number;
}

interface Entry {
  release: () => void;
  pendingReleaseTimer: ReturnType<typeof setTimeout> | null;
}

export interface TabPrefetchController {
  enter: (key: string) => void;
  leave: (key: string) => void;
  dispose: () => void;
}

function clearPendingRelease(entry: Entry): void {
  if (entry.pendingReleaseTimer !== null) {
    clearTimeout(entry.pendingReleaseTimer);
    entry.pendingReleaseTimer = null;
  }
}

export function createTabPrefetchController(
  input: TabPrefetchControllerInput,
): TabPrefetchController {
  const entries = new Map<string, Entry>();

  return {
    enter: (key) => {
      const existing = entries.get(key);
      if (existing) {
        clearPendingRelease(existing);
        return;
      }
      const release = input.retain(key);
      entries.set(key, { release, pendingReleaseTimer: null });
    },
    leave: (key) => {
      const entry = entries.get(key);
      if (!entry) return;
      clearPendingRelease(entry);
      entry.pendingReleaseTimer = setTimeout(() => {
        entry.release();
        entries.delete(key);
      }, input.releaseDelayMs);
    },
    dispose: () => {
      for (const entry of entries.values()) {
        clearPendingRelease(entry);
        entry.release();
      }
      entries.clear();
    },
  };
}
