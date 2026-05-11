import { type ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";

import { Button } from "../ui/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "../ui/menu";
import { replaceDescriptorCurrentValue } from "./traitsMenuLogic";
import { cn } from "~/lib/utils";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

export interface ContextWindowChipProps {
  descriptor: SelectDescriptor;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
}

export const ContextWindowChip = memo(function ContextWindowChip(
  props: ContextWindowChipProps,
) {
  const value =
    typeof props.descriptor.currentValue === "string" ? props.descriptor.currentValue : "";
  const label =
    props.descriptor.options.find((option) => option.id === value)?.label ?? value;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Context window: ${label}`}
            title="Context window"
            className={cn(
              "h-7 gap-1.5 rounded-md px-2 font-medium text-xs",
              "bg-muted/40 text-muted-foreground",
            )}
          />
        }
      >
        <span>{label}</span>
      </MenuTrigger>
      <MenuPopup align="start">
        <MenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (!next || next === value) return;
            props.onChangeDescriptors(
              replaceDescriptorCurrentValue(props.descriptors, props.descriptor.id, next),
            );
          }}
        >
          {props.descriptor.options.map((option) => (
            <MenuRadioItem key={option.id} value={option.id}>
              {option.label}
              {option.isDefault ? " (default)" : ""}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
});
