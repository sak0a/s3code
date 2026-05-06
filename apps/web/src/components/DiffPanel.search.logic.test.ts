import { describe, expect, it } from "vitest";

import {
  deriveDiffSearchFileIndexes,
  type DiffSearchFile,
  findDiffSearchMatches,
  getNextDiffSearchMatchIndex,
} from "./DiffPanel.search.logic";

const files = [
  {
    name: "b/src/alpha.ts",
    prevName: "a/src/alpha.ts",
    additionLines: ["Alpha beta", "literal .* pattern"],
    deletionLines: ["removed alpha"],
  },
  {
    name: "b/src/bravo.ts",
    prevName: "a/src/bravo.ts",
    additionLines: ["bravo ALPHA"],
    deletionLines: ["unchanged"],
  },
] satisfies DiffSearchFile[];

describe("findDiffSearchMatches", () => {
  it("finds matches across file paths and hunk lines case-insensitively by default", () => {
    const matches = findDiffSearchMatches(files, "alpha");
    expect(matches.map((match) => [match.fileIndex, match.field, match.lineIndex])).toEqual([
      [0, "path", undefined],
      [0, "previousPath", undefined],
      [0, "addition", 0],
      [0, "deletion", 0],
      [1, "addition", 0],
    ]);
    expect(deriveDiffSearchFileIndexes(matches)).toEqual([0, 1]);
  });

  it("honors case-sensitive search when requested", () => {
    expect(findDiffSearchMatches(files, "Alpha", { caseSensitive: true })).toEqual([
      {
        fileIndex: 0,
        field: "addition",
        lineIndex: 0,
        start: 0,
        end: 5,
      },
    ]);
  });

  it("returns no matches for an empty query", () => {
    expect(findDiffSearchMatches(files, "")).toEqual([]);
    expect(findDiffSearchMatches(files, "   ")).toEqual([]);
  });

  it("treats multibyte characters and regex syntax as literal text", () => {
    const matches = findDiffSearchMatches(
      [
        {
          name: "b/src/café.ts",
          additionLines: ["const label = 'naïve .* pattern';"],
          deletionLines: [],
        },
      ],
      "naïve .*",
    );

    expect(matches).toEqual([
      {
        fileIndex: 0,
        field: "addition",
        lineIndex: 0,
        start: 15,
        end: 23,
      },
    ]);
    expect(findDiffSearchMatches(matchesFileWithCafePath(), "café")).toHaveLength(1);
  });
});

describe("getNextDiffSearchMatchIndex", () => {
  it("wraps next navigation from the last match to the first", () => {
    expect(getNextDiffSearchMatchIndex(2, 3, 1)).toBe(0);
  });

  it("wraps previous navigation from the first match to the last", () => {
    expect(getNextDiffSearchMatchIndex(0, 3, -1)).toBe(2);
  });

  it("returns zero when there are no matches", () => {
    expect(getNextDiffSearchMatchIndex(3, 0, 1)).toBe(0);
  });
});

function matchesFileWithCafePath(): DiffSearchFile[] {
  return [
    {
      name: "b/src/café.ts",
      additionLines: [],
      deletionLines: [],
    },
  ];
}
