export type PreviewFileKind = "image" | "text" | "binary";

export const PREVIEW_FILE_SIZE_LIMIT_BYTES = 512 * 1024;

const IMAGE_EXTENSIONS = new Set(["gif", "jpeg", "jpg", "png", "svg", "webp"]);
const TEXT_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "conf",
  "cpp",
  "css",
  "csv",
  "dockerfile",
  "env",
  "gitignore",
  "go",
  "h",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "mdx",
  "py",
  "rs",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ["css", "css"],
  ["go", "go"],
  ["html", "html"],
  ["js", "js"],
  ["json", "json"],
  ["jsx", "jsx"],
  ["md", "markdown"],
  ["mdx", "markdown"],
  ["py", "python"],
  ["rs", "rust"],
  ["sh", "bash"],
  ["ts", "ts"],
  ["tsx", "tsx"],
  ["yaml", "yaml"],
  ["yml", "yaml"],
]);

const TEXT_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "application/toml",
  "application/typescript",
  "application/xml",
  "application/x-sh",
  "application/yaml",
  "application/xhtml+xml",
  "image/svg+xml",
]);

function getPreviewBasename(filePath: string): string {
  const withoutQuery = filePath.split(/[?#]/, 1)[0] ?? filePath;
  return withoutQuery.toLowerCase().split("/").at(-1) ?? withoutQuery.toLowerCase();
}

function getPreviewExtension(filePath: string): string {
  const basename = getPreviewBasename(filePath);
  const dotIndex = basename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === basename.length - 1) {
    return basename;
  }
  return basename.slice(dotIndex + 1);
}

export function inferPreviewLanguage(filePath: string): string {
  const basename = getPreviewBasename(filePath);
  if (basename === "dockerfile") return "dockerfile";
  if (basename === ".gitignore") return "ini";
  return LANGUAGE_BY_EXTENSION.get(getPreviewExtension(filePath)) ?? "text";
}

export function detectPreviewFileKind(input: {
  readonly filePath: string;
  readonly mimeType?: string | null;
}): PreviewFileKind {
  const mimeType = input.mimeType?.toLowerCase().split(";", 1)[0]?.trim();
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType && (mimeType.startsWith("text/") || TEXT_MIME_TYPES.has(mimeType))) {
    return "text";
  }

  const extension = getPreviewExtension(input.filePath);
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  return "binary";
}

export type PreviewSizeGuard =
  | {
      readonly state: "within-limit";
      readonly shouldFetch: true;
      readonly sizeBytes: number;
      readonly limitBytes: number;
    }
  | {
      readonly state: "too-large";
      readonly shouldFetch: false;
      readonly sizeBytes: number;
      readonly limitBytes: number;
    };

export function resolvePreviewSizeGuard(
  sizeBytes: number,
  limitBytes = PREVIEW_FILE_SIZE_LIMIT_BYTES,
): PreviewSizeGuard {
  if (sizeBytes > limitBytes) {
    return { state: "too-large", shouldFetch: false, sizeBytes, limitBytes };
  }
  return { state: "within-limit", shouldFetch: true, sizeBytes, limitBytes };
}
