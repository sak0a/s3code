export type DiffLineKind = "hunk" | "context" | "add" | "remove";

export interface DiffLine {
  kind: DiffLineKind;
  oldLineNumber: number | null;
  newLineNumber: number | null;
  text: string;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseDiffLines(patch: string): DiffLine[] {
  if (patch.length === 0) return [];

  const lines = patch.split("\n");
  const out: DiffLine[] = [];
  let inHunks = false;
  let oldCursor = 0;
  let newCursor = 0;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunks = true;
      const match = line.match(HUNK_HEADER);
      if (match) {
        oldCursor = Number.parseInt(match[1] ?? "0", 10);
        newCursor = Number.parseInt(match[2] ?? "0", 10);
      }
      out.push({ kind: "hunk", oldLineNumber: null, newLineNumber: null, text: line });
      continue;
    }
    if (!inHunks) continue;

    if (line.startsWith("+")) {
      out.push({ kind: "add", oldLineNumber: null, newLineNumber: newCursor, text: line });
      newCursor += 1;
    } else if (line.startsWith("-")) {
      out.push({ kind: "remove", oldLineNumber: oldCursor, newLineNumber: null, text: line });
      oldCursor += 1;
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — render as context but don't advance counters
      out.push({ kind: "context", oldLineNumber: null, newLineNumber: null, text: line });
    } else {
      out.push({ kind: "context", oldLineNumber: oldCursor, newLineNumber: newCursor, text: line });
      oldCursor += 1;
      newCursor += 1;
    }
  }

  return out;
}
