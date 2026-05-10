import path from "node:path";

import { sanitizeBranchFragment } from "@s3tools/shared/git";
import { resolveProjectWorktreesDir } from "./projectMetadataPaths.ts";

const RANDOM_WORD_CONSONANTS = "bcdfghjklmnpqrstvwxz";
const RANDOM_WORD_VOWELS = "aeiou";
const RANDOM_WORD_PATTERN = [
  RANDOM_WORD_CONSONANTS,
  RANDOM_WORD_VOWELS,
  RANDOM_WORD_CONSONANTS,
  RANDOM_WORD_VOWELS,
  RANDOM_WORD_CONSONANTS,
] as const;

function randomCharacter(alphabet: string): string {
  return alphabet.charAt(Math.floor(Math.random() * alphabet.length));
}

export function createRandomWorktreeWord(): string {
  return RANDOM_WORD_PATTERN.map(randomCharacter).join("");
}

function sanitizePathSegment(value: string): string {
  return sanitizeBranchFragment(value).replace(/\//g, "-");
}

export function buildWorktreeCheckoutDirectoryName(
  branchName: string,
  randomWord = createRandomWorktreeWord(),
): string {
  const branchSegment = sanitizePathSegment(branchName);
  const wordSegment = sanitizePathSegment(randomWord)
    .replace(/[^a-z]/g, "")
    .slice(0, 5);
  return `${branchSegment}__${wordSegment || createRandomWorktreeWord()}`;
}

export function resolveProjectWorktreeCheckoutPath(
  workspaceRoot: string,
  projectMetadataDir: string | null | undefined,
  branchName: string,
): string {
  return path.join(
    resolveProjectWorktreesDir(workspaceRoot, projectMetadataDir),
    buildWorktreeCheckoutDirectoryName(branchName),
  );
}
