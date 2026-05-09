import { memo } from "react";
import { cn } from "~/lib/utils";

export const LabelChip = memo(function LabelChip(props: { label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-1.5 py-0.5 font-medium text-[10px] text-muted-foreground",
        props.className,
      )}
    >
      {props.label}
    </span>
  );
});
