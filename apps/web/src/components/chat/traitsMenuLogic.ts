import { type ProviderOptionDescriptor } from "@ryco/contracts";
import { applyClaudePromptEffortPrefix } from "@ryco/shared/model";

const ULTRATHINK_PROMPT_PREFIX = "Ultrathink:\n";

export function replaceDescriptorCurrentValue(
  descriptors: ReadonlyArray<ProviderOptionDescriptor>,
  descriptorId: string,
  currentValue: string | boolean | undefined,
): ReadonlyArray<ProviderOptionDescriptor> {
  return descriptors.map((descriptor) =>
    descriptor.id !== descriptorId
      ? descriptor
      : descriptor.type === "boolean"
        ? {
            ...descriptor,
            ...(typeof currentValue === "boolean" ? { currentValue } : {}),
          }
        : {
            ...descriptor,
            ...(typeof currentValue === "string" ? { currentValue } : {}),
          },
  );
}

export interface ApplyDescriptorSelectionInput {
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>;
  value: string;
  prompt: string;
  primarySelectDescriptorId: string | undefined;
  ultrathinkInBodyText: boolean;
  ultrathinkPromptControlled: boolean;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
  onPromptChange: (prompt: string) => void;
}

export function applyDescriptorSelection(input: ApplyDescriptorSelectionInput): void {
  const {
    descriptors,
    descriptor,
    value,
    prompt,
    primarySelectDescriptorId,
    ultrathinkInBodyText,
    ultrathinkPromptControlled,
    onChangeDescriptors,
    onPromptChange,
  } = input;

  if (!value) return;

  if (descriptor.promptInjectedValues?.includes(value)) {
    const nextPrompt =
      prompt.trim().length === 0
        ? ULTRATHINK_PROMPT_PREFIX
        : applyClaudePromptEffortPrefix(prompt, "ultrathink");
    onPromptChange(nextPrompt);
    return;
  }

  if (ultrathinkInBodyText && descriptor.id === primarySelectDescriptorId) {
    return;
  }

  if (ultrathinkPromptControlled && descriptor.id === primarySelectDescriptorId) {
    const stripped = prompt.replace(/^Ultrathink:\s*/i, "");
    onPromptChange(stripped);
  }

  onChangeDescriptors(replaceDescriptorCurrentValue(descriptors, descriptor.id, value));
}
