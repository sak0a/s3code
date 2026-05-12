export interface StartupTimingEntry {
  readonly phase: string;
  readonly elapsedMs: number;
  readonly deltaMs: number;
  readonly detail: string | undefined;
}

export interface StartupTiming {
  readonly mark: (phase: string, detail?: string) => StartupTimingEntry;
  readonly entries: () => ReadonlyArray<StartupTimingEntry>;
}

export function createStartupTiming(options: { readonly now?: () => number } = {}): StartupTiming {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  let previousAt = startedAt;
  const entries: StartupTimingEntry[] = [];

  return {
    mark: (phase, detail) => {
      const markedAt = now();
      const entry: StartupTimingEntry = {
        phase,
        elapsedMs: markedAt - startedAt,
        deltaMs: markedAt - previousAt,
        detail,
      };
      previousAt = markedAt;
      entries.push(entry);
      return entry;
    },
    entries: () => [...entries],
  };
}

export function formatStartupTimingEntry(entry: StartupTimingEntry): string {
  const base = `startup timing phase=${entry.phase} elapsedMs=${Math.round(entry.elapsedMs)} deltaMs=${Math.round(entry.deltaMs)}`;
  return entry.detail ? `${base} ${entry.detail}` : base;
}
