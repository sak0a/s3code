import type { SourceControlIssueSummary } from "@ryco/contracts";

export function searchSourceControlSummaries<T extends SourceControlIssueSummary>(
  items: ReadonlyArray<T>,
  query: string,
): ReadonlyArray<T> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return items;

  const scored = items.flatMap((item) => {
    const title = item.title.toLowerCase();
    const number = String(item.number);
    if (number === q || number.startsWith(q)) return [{ item, score: 0 }];
    if (title.startsWith(q)) return [{ item, score: 1 }];
    if (title.includes(q)) return [{ item, score: 2 }];
    return [];
  });

  scored.sort((a, b) => a.score - b.score || a.item.title.length - b.item.title.length);
  return scored.map((s) => s.item);
}
