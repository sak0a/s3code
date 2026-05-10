const FILE_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const NEW_PATH = /^\+\+\+ (?:b\/)?(.+)$/;
const OLD_PATH = /^--- (?:a\/)?(.+)$/;

function pickPathForChunk(lines: ReadonlyArray<string>, fallback: string): string {
  let oldPath: string | null = null;
  let newPath: string | null = null;
  for (const line of lines) {
    if (line.startsWith("+++ ")) {
      const match = line.match(NEW_PATH);
      if (match && match[1] && match[1] !== "/dev/null") newPath = match[1];
    } else if (line.startsWith("--- ")) {
      const match = line.match(OLD_PATH);
      if (match && match[1] && match[1] !== "/dev/null") oldPath = match[1];
    }
    if (newPath !== null && oldPath !== null) break;
  }
  return newPath ?? oldPath ?? fallback;
}

export function splitUnifiedDiffByFile(diff: string): Map<string, string> {
  const result = new Map<string, string>();
  if (diff.length === 0) return result;

  const lines = diff.split("\n");
  let currentChunk: string[] = [];
  let currentFallback = "";

  const flush = () => {
    if (currentChunk.length === 0) return;
    const path = pickPathForChunk(currentChunk, currentFallback);
    result.set(path, currentChunk.join("\n"));
  };

  for (const line of lines) {
    const headerMatch = line.match(FILE_HEADER);
    if (headerMatch) {
      flush();
      currentChunk = [line];
      currentFallback = headerMatch[2] ?? headerMatch[1] ?? "";
    } else if (currentChunk.length > 0) {
      currentChunk.push(line);
    }
  }
  flush();
  return result;
}
