import type { SourceControlLabel } from "@s3tools/contracts";
import { memo, useMemo } from "react";
import { cn } from "~/lib/utils";

const HEX6 = /^[0-9a-fA-F]{6}$/;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(color: string | undefined): Rgb | null {
  if (!color) return null;
  const trimmed = color.replace(/^#/, "").trim();
  if (!HEX6.test(trimmed)) return null;
  const r = Number.parseInt(trimmed.slice(0, 2), 16);
  const g = Number.parseInt(trimmed.slice(2, 4), 16);
  const b = Number.parseInt(trimmed.slice(4, 6), 16);
  return { r, g, b };
}

function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Per WCAG-style relative luminance, returns 0..1.
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b);
}

// Lift dark colors toward white so text stays legible against the (often dark) page bg.
function readableTextColor(rgb: Rgb): Rgb {
  const lum = relativeLuminance(rgb);
  if (lum >= 0.4) return rgb;
  const lift = Math.min(0.7, (0.4 - lum) * 1.6);
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * lift),
    g: Math.round(rgb.g + (255 - rgb.g) * lift),
    b: Math.round(rgb.b + (255 - rgb.b) * lift),
  };
}

export const LabelChip = memo(function LabelChip(props: {
  label: SourceControlLabel | string;
  className?: string;
}) {
  const label: SourceControlLabel =
    typeof props.label === "string" ? { name: props.label } : props.label;

  const style = useMemo(() => {
    const rgb = parseHex(label.color);
    if (rgb === null) return null;
    const text = readableTextColor(rgb);
    return {
      backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
      borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`,
      color: `rgb(${text.r}, ${text.g}, ${text.b})`,
    };
  }, [label.color]);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-0.5 font-medium text-[10px]",
        style === null ? "border-border/60 bg-muted/40 text-muted-foreground" : null,
        props.className,
      )}
      style={style ?? undefined}
      title={label.description ?? label.name}
    >
      {label.name}
    </span>
  );
});
