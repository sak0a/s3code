import { useEffect, useLayoutEffect, useRef } from "react";

export const TAB_SWITCH_MARK_PREFIX = "s3:tab-switch:";
export const COMPONENT_RENDER_MARK_PREFIX = "s3:render:";

export type TabSwitchPhase = "click" | "first-paint";

export function makeTabSwitchMarkName(phase: TabSwitchPhase, key: string): string {
  if (!key) {
    throw new Error("tab-switch mark name requires a non-empty key");
  }
  return `${TAB_SWITCH_MARK_PREFIX}${phase}:${key}`;
}

export function markTabSwitchClick(key: string): void {
  if (!import.meta.env.DEV || typeof performance === "undefined") return;
  performance.mark(makeTabSwitchMarkName("click", key));
}

export function markTabSwitchFirstPaint(key: string): void {
  if (!import.meta.env.DEV || typeof performance === "undefined") return;
  const name = makeTabSwitchMarkName("first-paint", key);
  if (performance.getEntriesByName(name).length > 0) return;
  performance.mark(name);
  try {
    performance.measure(`s3:tab-switch:${key}`, makeTabSwitchMarkName("click", key), name);
  } catch {
    // No matching click mark — initial mount, ignore.
  }
}

export function useRenderCounter(label: string): void {
  const count = useRef(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    count.current += 1;
    console.debug(`[render] ${label} #${count.current}`);
  });
}

/**
 * Dev-only: log which prop changed between renders. Use to figure out
 * why a memoized component is re-rendering. Logs `[memo:<label>] <key>
 * changed` for each prop whose identity differs from the previous
 * render. Add at the top of a component's body.
 */
export function useDevPropDiff<T extends Record<string, unknown>>(props: T, label: string): void {
  const prevRef = useRef<T | null>(null);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (prevRef.current !== null) {
      const prev = prevRef.current;
      const keys = new Set([...Object.keys(prev), ...Object.keys(props)]);
      for (const key of keys) {
        if (!Object.is(prev[key as keyof T], props[key as keyof T])) {
          console.debug(`[memo:${label}] ${String(key)} changed`);
        }
      }
    }
    prevRef.current = props;
  });
}

/**
 * Dev-only render-duration mark. Sets a `<prefix><label>:start:N` mark in the
 * render body and a matching `:end:N` in useLayoutEffect (runs synchronously
 * after commit, before paint). The N-suffix avoids the "latest-mark wins"
 * problem when a component re-renders multiple times during a single
 * interaction. Inspect via:
 *
 *   performance.getEntriesByType("measure")
 *     .filter(m => m.name.startsWith("s3:render:"))
 */
export function usePerfMark(label: string): void {
  const seq = useRef(0);
  if (import.meta.env.DEV && typeof performance !== "undefined") {
    seq.current += 1;
    performance.mark(`${COMPONENT_RENDER_MARK_PREFIX}${label}:start:${seq.current}`);
  }
  useLayoutEffect(() => {
    if (!import.meta.env.DEV || typeof performance === "undefined") return;
    const i = seq.current;
    const startName = `${COMPONENT_RENDER_MARK_PREFIX}${label}:start:${i}`;
    const endName = `${COMPONENT_RENDER_MARK_PREFIX}${label}:end:${i}`;
    performance.mark(endName);
    try {
      performance.measure(`${COMPONENT_RENDER_MARK_PREFIX}${label}#${i}`, startName, endName);
    } catch {
      // Ignore — start mark may have been cleared.
    }
  });
}
