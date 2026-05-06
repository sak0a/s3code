import { resolvePathLinkTarget } from "../terminal-links";

export type DiffOpenLineType = "change-addition" | "change-deletion" | "context";

export interface DiffOpenInEditorTargetInput {
  readonly filePath: string;
  readonly cwd?: string | null | undefined;
  readonly lineNumber?: number | undefined;
  readonly lineType?: DiffOpenLineType | string;
}

export function resolveDiffOpenInEditorTarget(input: DiffOpenInEditorTargetInput): string {
  const resolvedPath = input.cwd
    ? resolvePathLinkTarget(input.filePath, input.cwd)
    : input.filePath;
  return typeof input.lineNumber === "number"
    ? `${resolvedPath}:${input.lineNumber}`
    : resolvedPath;
}
