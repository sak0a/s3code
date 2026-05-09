import { memo, useMemo } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type Options as ReactMarkdownOptions,
} from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeOptions } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "~/lib/utils";
import { stripHtmlComments } from "./markdownPreprocess";

interface MarkdownViewProps {
  text: string;
  className?: string;
  raw?: boolean;
}

// Allow GitHub-flavored disclosure widgets, alignment attributes on table cells, and basic
// inline styling that PR/issue bodies commonly rely on. We extend the safe default schema
// rather than replacing it so things like <script> stay disallowed.
const sanitizeSchema: SanitizeOptions = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
  attributes: {
    ...defaultSchema.attributes,
    details: ["open"],
    summary: ["className"],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "align"],
  },
};

const markdownComponents: Components = {
  a({ node: _node, href, ...props }) {
    return <a {...props} href={href} target="_blank" rel="noopener noreferrer" />;
  },
  img({ node: _node, alt, src, ...props }) {
    return (
      <img
        {...props}
        alt={alt ?? ""}
        src={src}
        loading="lazy"
        className={cn("max-w-full rounded-md border border-border/50", props.className)}
      />
    );
  },
  details({ node: _node, className, ...props }) {
    return (
      <details
        {...props}
        className={cn(
          "my-2 rounded-md border border-border/60 bg-muted/24 px-3 py-2 [&_summary]:cursor-pointer",
          className,
        )}
      />
    );
  },
  summary({ node: _node, className, ...props }) {
    return (
      <summary {...props} className={cn("font-medium text-sm text-foreground/90", className)} />
    );
  },
  pre({ node: _node, className, ...props }) {
    return (
      <pre
        {...props}
        className={cn(
          "my-2 w-full min-w-0 overflow-x-auto rounded-md border border-border/50 bg-muted/30 p-3 text-foreground/85 text-xs leading-relaxed",
          className,
        )}
      />
    );
  },
  code({ node: _node, className, ...props }) {
    // Inline `code` (no language class) keeps its inline styling; block code is wrapped in <pre>
    // and uses the default rendering inside it.
    if (className && className.includes("language-")) {
      return <code {...props} className={className} />;
    }
    return (
      <code
        {...props}
        className={cn(
          "rounded bg-muted/50 px-1 py-0.5 font-mono text-[0.85em] text-foreground/85",
          className,
        )}
      />
    );
  },
};

const remarkPlugins: ReactMarkdownOptions["remarkPlugins"] = [remarkGfm];
const rehypePlugins: ReactMarkdownOptions["rehypePlugins"] = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
];

function urlTransform(href: string): string {
  return defaultUrlTransform(href);
}

export const MarkdownView = memo(function MarkdownView({
  text,
  className,
  raw = false,
}: MarkdownViewProps) {
  const stripped = useMemo(() => (raw ? text : stripHtmlComments(text)), [text, raw]);

  if (stripped.trim().length === 0) {
    return <p className="text-muted-foreground text-sm italic">No description provided.</p>;
  }

  if (raw) {
    return (
      <pre
        className={cn(
          "w-full min-w-0 overflow-x-auto rounded-md border border-border/50 bg-muted/30 p-3 text-foreground/85 text-xs leading-relaxed",
          className,
        )}
      >
        {text}
      </pre>
    );
  }

  return (
    <div
      className={cn(
        "chat-markdown w-full min-w-0 text-foreground/90 text-sm leading-relaxed",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
        urlTransform={urlTransform}
      >
        {stripped}
      </ReactMarkdown>
    </div>
  );
});
