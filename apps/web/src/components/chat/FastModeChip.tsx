import { type ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";
import { ZapIcon } from "lucide-react";

import { Button } from "../ui/button";
import { replaceDescriptorCurrentValue } from "./traitsMenuLogic";
import { cn } from "~/lib/utils";

type FastDescriptor = Extract<ProviderOptionDescriptor, { type: "boolean" }>;

export interface FastModeChipProps {
  descriptor: FastDescriptor;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
}

export const FastModeChip = memo(function FastModeChip(props: FastModeChipProps) {
  const isOn = props.descriptor.currentValue === true;
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Fast mode"
      aria-pressed={isOn}
      title={isOn ? "Fast mode: on (click to disable)" : "Fast mode: off (click to enable)"}
      className={cn(
        "h-7 gap-1.5 rounded-md px-2 font-medium text-xs",
        isOn
          ? "bg-yellow-500/15 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300"
          : "text-muted-foreground/60 ring-1 ring-border ring-inset hover:text-foreground",
      )}
      onClick={() => {
        props.onChangeDescriptors(
          replaceDescriptorCurrentValue(props.descriptors, props.descriptor.id, !isOn),
        );
      }}
    >
      <ZapIcon
        aria-hidden="true"
        className={cn("size-3", isOn ? "fill-current" : undefined)}
      />
    </Button>
  );
});
