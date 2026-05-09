import { describe, expect, it } from "vitest";
import { authorAssociationLabel, avatarUrlForAuthor, hashAuthorToHue } from "./CommentThread.logic";

describe("avatarUrlForAuthor", () => {
  it("returns null for unknown author", () => {
    expect(avatarUrlForAuthor("unknown")).toBeNull();
  });

  it("returns null for empty author", () => {
    expect(avatarUrlForAuthor("")).toBeNull();
  });

  it("returns the GitHub avatar redirect URL for a normal login", () => {
    expect(avatarUrlForAuthor("octocat")).toBe("https://github.com/octocat.png?size=80");
  });

  it("URL-encodes special characters in the login", () => {
    expect(avatarUrlForAuthor("foo bar")).toBe("https://github.com/foo%20bar.png?size=80");
  });
});

describe("authorAssociationLabel", () => {
  it("returns null when association is undefined", () => {
    expect(authorAssociationLabel(undefined)).toBeNull();
  });

  it("returns null for NONE", () => {
    expect(authorAssociationLabel("NONE")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(authorAssociationLabel("")).toBeNull();
  });

  it("returns null for unknown values", () => {
    expect(authorAssociationLabel("WHATEVER")).toBeNull();
  });

  it("returns 'Owner' for OWNER", () => {
    expect(authorAssociationLabel("OWNER")).toBe("Owner");
  });

  it("returns 'Member' for MEMBER", () => {
    expect(authorAssociationLabel("MEMBER")).toBe("Member");
  });

  it("returns 'Collaborator' for COLLABORATOR", () => {
    expect(authorAssociationLabel("COLLABORATOR")).toBe("Collaborator");
  });

  it("returns 'Contributor' for CONTRIBUTOR", () => {
    expect(authorAssociationLabel("CONTRIBUTOR")).toBe("Contributor");
  });

  it("returns 'Author' for FIRST_TIME_CONTRIBUTOR and FIRST_TIMER", () => {
    expect(authorAssociationLabel("FIRST_TIME_CONTRIBUTOR")).toBe("First-time contributor");
    expect(authorAssociationLabel("FIRST_TIMER")).toBe("First-time contributor");
  });
});

describe("hashAuthorToHue", () => {
  it("returns a deterministic hue in 0-359 for any author", () => {
    const a = hashAuthorToHue("alice");
    const b = hashAuthorToHue("alice");
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });

  it("returns different hues for different authors", () => {
    const a = hashAuthorToHue("alice");
    const b = hashAuthorToHue("bob");
    expect(a).not.toBe(b);
  });

  it("handles empty author with a stable fallback", () => {
    expect(hashAuthorToHue("")).toBeGreaterThanOrEqual(0);
    expect(hashAuthorToHue("")).toBeLessThan(360);
  });
});
