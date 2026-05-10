const UNKNOWN_AUTHOR_PLACEHOLDER = "unknown";

export function avatarUrlForAuthor(author: string): string | null {
  const trimmed = author.trim();
  if (trimmed.length === 0) return null;
  if (trimmed === UNKNOWN_AUTHOR_PLACEHOLDER) return null;
  return `https://github.com/${encodeURIComponent(trimmed)}.png?size=80`;
}

const ASSOCIATION_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MEMBER: "Member",
  COLLABORATOR: "Collaborator",
  CONTRIBUTOR: "Contributor",
  FIRST_TIME_CONTRIBUTOR: "First-time contributor",
  FIRST_TIMER: "First-time contributor",
};

export function authorAssociationLabel(association: string | undefined): string | null {
  if (association === undefined) return null;
  if (association.length === 0) return null;
  return ASSOCIATION_LABELS[association] ?? null;
}

export function hashAuthorToHue(author: string): number {
  const seed = author.length === 0 ? "@anon@" : author;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}
