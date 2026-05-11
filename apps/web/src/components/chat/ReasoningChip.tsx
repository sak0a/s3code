import { type ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";
import { BrainIcon, SparklesIcon } from "lucide-react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { applyDescriptorSelection } from "./traitsMenuLogic";
import { useUiStateStore } from "../../uiStateStore";
import { cn } from "~/lib/utils";

type EffortDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

type LevelKey = "low" | "medium" | "high" | "xhigh" | "max" | "ultrathink";

const LEVEL_ORDINAL: Record<Exclude<LevelKey, "ultrathink">, number> = {
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 4,
  max: 5,
};

const LEVEL_ABBREVIATION: Record<LevelKey, string> = {
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "XHi",
  max: "Max",
  ultrathink: "Ultra",
};

const LEVEL_TINT_CLASSES: Record<LevelKey, string> = {
  low: "bg-slate-400/15 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300",
  medium: "bg-blue-500/15 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  high: "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  xhigh: "bg-violet-500/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  max: "bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
  ultrathink:
    "bg-gradient-to-br from-pink-500/20 to-purple-500/25 text-fuchsia-700 ring-1 ring-fuchsia-500/25 dark:text-fuchsia-300",
};

function normalizeLevel(value: string | undefined): LevelKey {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max" ||
    value === "ultrathink"
  ) {
    return value;
  }
  return "medium";
}

export interface ReasoningChipProps {
  descriptor: EffortDescriptor;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  prompt: string;
  primarySelectDescriptorId: string | undefined;
  ultrathinkInBodyText: boolean;
  ultrathinkPromptControlled: boolean;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
  onPromptChange: (prompt: string) => void;
}

export const ReasoningChip = memo(function ReasoningChip(props: ReasoningChipProps) {
  const indicatorStyle = useUiStateStore((state) => state.reasoningIndicatorStyle);
  const effectiveValue = props.ultrathinkPromptControlled
    ? "ultrathink"
    : typeof props.descriptor.currentValue === "string"
      ? props.descriptor.currentValue
      : undefined;
  const level = normalizeLevel(effectiveValue);
  const isUltra = level === "ultrathink";
  const abbreviation = LEVEL_ABBREVIATION[level];

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Reasoning: ${abbreviation}`}
            title={`Reasoning: ${abbreviation}`}
            className={cn(
              "h-7 gap-1.5 rounded-md px-2 font-medium text-xs",
              LEVEL_TINT_CLASSES[level],
            )}
          />
        }
      >
        {isUltra ? (
          <>
            <SparklesIcon aria-hidden="true" className="size-3" />
            <span>Ultra</span>
          </>
        ) : indicatorStyle === "text" ? (
          <span>{abbreviation}</span>
        ) : (
          <>
            <BrainIcon aria-hidden="true" className="size-3" />
            <span className="inline-flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((position) => {
                const on = position <= LEVEL_ORDINAL[level];
                return (
                  <span
                    key={position}
                    data-testid={on ? "reasoning-dot-on" : "reasoning-dot-off"}
                    className={cn(
                      "size-[5px] rounded-full bg-current",
                      on ? "opacity-100" : "opacity-30",
                    )}
                  />
                );
              })}
            </span>
          </>
        )}
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup
          value={effectiveValue ?? ""}
          onValueChange={(value) => {
            applyDescriptorSelection({
              descriptors: props.descriptors,
              descriptor: props.descriptor,
              value,
              prompt: props.prompt,
              primarySelectDescriptorId: props.primarySelectDescriptorId,
              ultrathinkInBodyText: props.ultrathinkInBodyText,
              ultrathinkPromptControlled: props.ultrathinkPromptControlled,
              onChangeDescriptors: props.onChangeDescriptors,
              onPromptChange: props.onPromptChange,
            });
          }}
        >
          {props.descriptor.options.map((option) => (
            <MenuRadioItem
              key={option.id}
              value={option.id}
              disabled={
                props.ultrathinkInBodyText &&
                props.descriptor.id === props.primarySelectDescriptorId
              }
            >
              {option.label}
              {option.isDefault ? " (default)" : ""}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
});
