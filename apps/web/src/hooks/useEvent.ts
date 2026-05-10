import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Returns a stable callback identity that always invokes the latest
 * version of `fn`. Use for event handlers passed to memoized children:
 * useCallback recreates the closure when its deps change, breaking
 * memo on the consumer; useEvent keeps the same function reference
 * forever and reads the latest closure via a ref.
 *
 * Tradeoff vs useCallback:
 * - Stable identity (memo-friendly) regardless of the inner closure's
 *   captured variables.
 * - Unsuitable as a useEffect dependency if you want the effect to
 *   re-run when the captured logic changes. (Almost never desired for
 *   event handlers.)
 *
 * Mirrors React's experimental useEffectEvent contract.
 */
export function useEvent<A extends readonly unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
