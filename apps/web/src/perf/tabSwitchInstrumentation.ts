import { useEffect, useRef } from "react";

export const TAB_SWITCH_MARK_PREFIX = "t3:tab-switch:";

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
    performance.measure(`t3:tab-switch:${key}`, makeTabSwitchMarkName("click", key), name);
  } catch {
    // No matching click mark — initial mount, ignore.
  }
}

export function useRenderCounter(label: string): void {
  const count = useRef(0);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    count.current += 1;
    // eslint-disable-next-line no-console
    console.debug(`[render] ${label} #${count.current}`);
  });
}
