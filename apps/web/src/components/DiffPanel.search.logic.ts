export type DiffSearchLineKind = "addition" | "deletion";

export interface DiffSearchFile {
  readonly name?: string | null;
  readonly prevName?: string | null;
  readonly additionLines: readonly string[];
  readonly deletionLines: readonly string[];
}

export interface DiffSearchMatch {
  readonly fileIndex: number;
  readonly field: "path" | "previousPath" | DiffSearchLineKind;
  readonly lineIndex?: number;
  readonly start: number;
  readonly end: number;
}

export function resolveDiffFilePath(fileDiff: Pick<DiffSearchFile, "name" | "prevName">): string {
  const raw = fileDiff.name ?? fileDiff.prevName ?? "";
  if (raw.startsWith("a/") || raw.startsWith("b/")) {
    return raw.slice(2);
  }
  return raw;
}

export function normalizeDiffSearchQuery(query: string, caseSensitive = false): string {
  const trimmed = query.trim();
  return caseSensitive ? trimmed : trimmed.toLowerCase();
}

function collectTextMatches(input: {
  readonly text: string;
  readonly needle: string;
  readonly caseSensitive: boolean;
  readonly fileIndex: number;
  readonly field: DiffSearchMatch["field"];
  readonly lineIndex?: number;
}): DiffSearchMatch[] {
  const haystack = input.caseSensitive ? input.text : input.text.toLowerCase();
  const matches: DiffSearchMatch[] = [];
  let from = 0;
  while (true) {
    const start = haystack.indexOf(input.needle, from);
    if (start === -1) return matches;
    const end = start + input.needle.length;
    matches.push({
      fileIndex: input.fileIndex,
      field: input.field,
      ...(input.lineIndex === undefined ? {} : { lineIndex: input.lineIndex }),
      start,
      end,
    });
    from = end > start ? end : start + 1;
  }
}

export function findDiffSearchMatches(
  files: readonly DiffSearchFile[],
  query: string,
  options?: { readonly caseSensitive?: boolean },
): DiffSearchMatch[] {
  const caseSensitive = options?.caseSensitive ?? false;
  const needle = normalizeDiffSearchQuery(query, caseSensitive);
  if (!needle) return [];

  const matches: DiffSearchMatch[] = [];
  files.forEach((file, fileIndex) => {
    matches.push(
      ...collectTextMatches({
        text: resolveDiffFilePath(file),
        needle,
        caseSensitive,
        fileIndex,
        field: "path",
      }),
    );
    if (file.prevName) {
      matches.push(
        ...collectTextMatches({
          text: file.prevName,
          needle,
          caseSensitive,
          fileIndex,
          field: "previousPath",
        }),
      );
    }

    file.additionLines.forEach((line, lineIndex) => {
      matches.push(
        ...collectTextMatches({
          text: line,
          needle,
          caseSensitive,
          fileIndex,
          field: "addition",
          lineIndex,
        }),
      );
    });
    file.deletionLines.forEach((line, lineIndex) => {
      matches.push(
        ...collectTextMatches({
          text: line,
          needle,
          caseSensitive,
          fileIndex,
          field: "deletion",
          lineIndex,
        }),
      );
    });
  });

  return matches;
}

export function deriveDiffSearchFileIndexes(matches: readonly DiffSearchMatch[]): number[] {
  return [...new Set(matches.map((match) => match.fileIndex))];
}

export function getNextDiffSearchMatchIndex(
  currentIndex: number,
  matchCount: number,
  delta: 1 | -1,
): number {
  if (matchCount <= 0) return 0;
  return (currentIndex + delta + matchCount) % matchCount;
}
