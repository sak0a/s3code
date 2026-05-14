import path from "node:path";

import { DEFAULT_PROJECT_METADATA_DIR } from "@ryco/contracts";

export function resolveProjectMetadataDir(
  workspaceRoot: string,
  projectMetadataDir: string | null | undefined,
): string {
  return path.join(workspaceRoot, projectMetadataDir?.trim() || DEFAULT_PROJECT_METADATA_DIR);
}

export function resolveProjectWorktreesDir(
  workspaceRoot: string,
  projectMetadataDir: string | null | undefined,
): string {
  return path.join(resolveProjectMetadataDir(workspaceRoot, projectMetadataDir), "worktrees");
}
