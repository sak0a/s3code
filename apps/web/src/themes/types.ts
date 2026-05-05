export const THEME_TOKEN_NAMES = [
  "background",
  "app-chrome-background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  "info",
  "info-foreground",
  "success",
  "success-foreground",
  "warning",
  "warning-foreground",
  "scrollbar-thumb",
  "scrollbar-thumb-hover",
  "scrollbar-thumb-thin",
  "scrollbar-thumb-thin-hover",
  "noise-opacity",
  "radius",
] as const;

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number];

export type ThemeTokens = Partial<Record<ThemeTokenName, string>>;

export type ThemeVariant = "light" | "dark";

export type ThemeDefinition = {
  id: string;
  name: string;
  description?: string;
  builtIn?: boolean;
  light?: ThemeTokens;
  dark?: ThemeTokens;
};
