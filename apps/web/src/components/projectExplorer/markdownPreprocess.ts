const FENCED_CODE_BLOCK = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const INLINE_CODE = /(`[^`\n]+`)/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const TRIPLE_BLANK_LINE = /\n{3,}/g;

type Token = { kind: "code" | "text"; value: string };

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  const fences = [...text.matchAll(FENCED_CODE_BLOCK)];
  for (const match of fences) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: text.slice(cursor, start) });
    }
    tokens.push({ kind: "code", value: match[0] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    tokens.push({ kind: "text", value: text.slice(cursor) });
  }
  return tokens;
}

function tokenizeInlineCode(text: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_CODE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: text.slice(cursor, start) });
    }
    tokens.push({ kind: "code", value: match[0] });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    tokens.push({ kind: "text", value: text.slice(cursor) });
  }
  return tokens;
}

export function stripHtmlComments(text: string): string {
  const out = tokenize(text)
    .map((token) => {
      if (token.kind === "code") return token.value;
      return tokenizeInlineCode(token.value)
        .map((inner) =>
          inner.kind === "code" ? inner.value : inner.value.replace(HTML_COMMENT, ""),
        )
        .join("");
    })
    .join("");
  return out.replace(TRIPLE_BLANK_LINE, "\n\n");
}
