import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "~/lib/utils";

interface MarkdownViewProps {
  text: string;
  className?: string;
}

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
};

function urlTransform(href: string): string {
  return defaultUrlTransform(href);
}

export const MarkdownView = memo(function MarkdownView({ text, className }: MarkdownViewProps) {
  if (text.trim().length === 0) {
    return <p className="text-muted-foreground text-sm italic">No description provided.</p>;
  }
  return (
    <div
      className={cn(
        "chat-markdown w-full min-w-0 text-foreground/90 text-sm leading-relaxed",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        urlTransform={urlTransform}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
