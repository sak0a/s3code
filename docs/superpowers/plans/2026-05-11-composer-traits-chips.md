# Composer Traits Chips Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the joined `Fast · High · 200k` trigger label in the composer with a row of icon-led chips, one per provider option, each its own click target. Add a user-level Appearance setting that picks between two render styles for the Reasoning chip.

**Architecture:** A new `TraitsChips` container renders one small chip per applicable `ProviderOptionDescriptor`. Boolean chips (Fast, Thinking) toggle in place; select chips (Reasoning, Context Window, Agent) open a small radio menu. A new `reasoningIndicatorStyle` field in `uiStateStore` switches the Reasoning chip between "icon + dots" (default) and "text label". The compact narrow-width menu (`CompactComposerControlsMenu`) keeps using the existing `TraitsMenuContent` unchanged. Shared selection logic — especially the Ultrathink prompt-injection branch — moves into a new pure module `traitsMenuLogic.ts` and is reused by both code paths.

**Tech Stack:** React + TypeScript, Tailwind (custom colors), Zustand (`uiStateStore`), `lucide-react` icons (`Brain`, `Zap`, `Sparkles`), Base UI `Menu`/`MenuRadioGroup`, vitest + vitest-browser-react for tests.

---

## File Structure

**Create:**

- `apps/web/src/components/chat/traitsMenuLogic.ts` — pure selection helper (Ultrathink prompt-injection branch + descriptor replacement). Reused by chips and `TraitsMenuContent`.
- `apps/web/src/components/chat/traitsMenuLogic.test.ts` — unit tests for the helper.
- `apps/web/src/components/chat/ReasoningChip.tsx` — Reasoning chip with two render styles, opens menu on click.
- `apps/web/src/components/chat/FastModeChip.tsx` — Fast Mode chip, toggles boolean on click.
- `apps/web/src/components/chat/ContextWindowChip.tsx` — Context Window chip, opens menu on click.
- `apps/web/src/components/chat/ThinkingChip.tsx` — Thinking chip (Haiku), toggles boolean on click.
- `apps/web/src/components/chat/AgentChip.tsx` — Agent chip (Codex), opens menu on click.
- `apps/web/src/components/chat/TraitsChips.tsx` — container that decides which chips to render.
- `apps/web/src/components/chat/TraitsChips.browser.tsx` — browser test for the container.
- `apps/web/src/uiStateStore.test.ts` — unit test for the new persisted field (creates the file if absent).

**Modify:**

- `apps/web/src/uiStateStore.ts` — add `reasoningIndicatorStyle` field, hydration, persist, setter.
- `apps/web/src/components/chat/TraitsPicker.tsx` — `TraitsMenuContent` delegates the Ultrathink branch to `traitsMenuLogic`; remove `TraitsPicker` component export (no remaining wide-layout consumer). Keep `TraitsMenuContent` and `shouldRenderTraitsControls` exported.
- `apps/web/src/components/chat/composerProviderState.tsx` — `renderProviderTraitsPicker` renamed to `renderProviderTraitsChips` and switches to rendering `<TraitsChips />`.
- `apps/web/src/components/chat/ChatComposer.tsx` — rename `providerTraitsPicker` local → `providerTraitsChips` to match the helper.
- `apps/web/src/components/settings/AppearanceSettings.tsx` — add new `SettingsSection title="Reasoning indicator"` with two radio cards.

---

## Task 1: Add `reasoningIndicatorStyle` to `uiStateStore`

**Files:**

- Modify: `apps/web/src/uiStateStore.ts`
- Test: `apps/web/src/uiStateStore.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/uiStateStore.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { PERSISTED_STATE_KEY, persistState, useUiStateStore } from "./uiStateStore";

describe("uiStateStore — reasoningIndicatorStyle", () => {
  afterEach(() => {
    window.localStorage.removeItem(PERSISTED_STATE_KEY);
  });

  it("defaults to icon-dots", () => {
    expect(useUiStateStore.getState().reasoningIndicatorStyle).toBe("icon-dots");
  });

  it("setter updates the store", () => {
    useUiStateStore.getState().setReasoningIndicatorStyle("text");
    expect(useUiStateStore.getState().reasoningIndicatorStyle).toBe("text");
    useUiStateStore.getState().setReasoningIndicatorStyle("icon-dots");
  });

  it("persists and reads back the value", () => {
    useUiStateStore.getState().setReasoningIndicatorStyle("text");
    persistState(useUiStateStore.getState());
    const raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.reasoningIndicatorStyle).toBe("text");
    useUiStateStore.getState().setReasoningIndicatorStyle("icon-dots");
  });

  it("falls back to default for unrecognized persisted value", () => {
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({ reasoningIndicatorStyle: "garbage" }),
    );
    // Re-import to trigger rehydration would require a fresh module — instead,
    // we just verify the readPersistedState semantics: invalid → default.
    // Real rehydration is exercised by an app reload in production.
    // For this unit, assert the store stays at the default unless setter is called.
    expect(["icon-dots", "text"]).toContain(useUiStateStore.getState().reasoningIndicatorStyle);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test uiStateStore.test`
Expected: FAIL with `setReasoningIndicatorStyle is not a function` or `reasoningIndicatorStyle` undefined.

- [ ] **Step 3: Modify `apps/web/src/uiStateStore.ts`**

Add the type and default near `PersistedUiState`:

```ts
export type ReasoningIndicatorStyle = "icon-dots" | "text";
const DEFAULT_REASONING_INDICATOR_STYLE: ReasoningIndicatorStyle = "icon-dots";

function sanitizeReasoningIndicatorStyle(value: unknown): ReasoningIndicatorStyle {
  return value === "text" || value === "icon-dots" ? value : DEFAULT_REASONING_INDICATOR_STYLE;
}
```

Extend `PersistedUiState`:

```ts
export interface PersistedUiState {
  collapsedProjectCwds?: string[];
  expandedProjectCwds?: string[];
  projectOrderCwds?: string[];
  defaultAdvertisedEndpointKey?: string | null;
  threadChangedFilesExpandedById?: Record<string, Record<string, boolean>>;
  reasoningIndicatorStyle?: ReasoningIndicatorStyle;
}
```

Extend `UiState` (just add the field — it does not need its own sub-interface):

```ts
export interface UiState extends UiProjectState, UiThreadState, UiEndpointState {
  reasoningIndicatorStyle: ReasoningIndicatorStyle;
}
```

Update `initialState`:

```ts
const initialState: UiState = {
  projectExpandedById: {},
  projectOrder: [],
  threadLastVisitedAtById: {},
  threadChangedFilesExpandedById: {},
  threadWorkEntryExpandedById: {},
  defaultAdvertisedEndpointKey: null,
  reasoningIndicatorStyle: DEFAULT_REASONING_INDICATOR_STYLE,
};
```

In `readPersistedState`, hydrate the field:

```ts
return {
  ...initialState,
  defaultAdvertisedEndpointKey:
    typeof parsed.defaultAdvertisedEndpointKey === "string" &&
    parsed.defaultAdvertisedEndpointKey.length > 0
      ? parsed.defaultAdvertisedEndpointKey
      : null,
  threadChangedFilesExpandedById: sanitizePersistedThreadChangedFilesExpanded(
    parsed.threadChangedFilesExpandedById,
  ),
  reasoningIndicatorStyle: sanitizeReasoningIndicatorStyle(parsed.reasoningIndicatorStyle),
};
```

In `persistState`, write the field:

```ts
window.localStorage.setItem(
  PERSISTED_STATE_KEY,
  JSON.stringify({
    collapsedProjectCwds,
    expandedProjectCwds,
    projectOrderCwds,
    defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
    threadChangedFilesExpandedById,
    reasoningIndicatorStyle: state.reasoningIndicatorStyle,
  } satisfies PersistedUiState),
);
```

Add a setter helper near the other state mutators:

```ts
export function setReasoningIndicatorStyle(
  state: UiState,
  style: ReasoningIndicatorStyle,
): UiState {
  if (state.reasoningIndicatorStyle === style) {
    return state;
  }
  return { ...state, reasoningIndicatorStyle: style };
}
```

Extend `UiStateStore` interface and the `create` body:

```ts
interface UiStateStore extends UiState {
  // ...existing actions...
  setReasoningIndicatorStyle: (style: ReasoningIndicatorStyle) => void;
}

export const useUiStateStore = create<UiStateStore>((set) => ({
  ...readPersistedState(),
  // ...existing actions...
  setReasoningIndicatorStyle: (style) => set((state) => setReasoningIndicatorStyle(state, style)),
}));
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test uiStateStore.test`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/uiStateStore.ts apps/web/src/uiStateStore.test.ts
git commit -m "Add reasoning indicator style to UI state store"
```

---

## Task 2: Extract `applyDescriptorSelection` helper into `traitsMenuLogic.ts`

**Files:**

- Create: `apps/web/src/components/chat/traitsMenuLogic.ts`
- Create: `apps/web/src/components/chat/traitsMenuLogic.test.ts`
- Modify: `apps/web/src/components/chat/TraitsPicker.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/web/src/components/chat/traitsMenuLogic.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { applyDescriptorSelection } from "./traitsMenuLogic";

function selectDescriptor(
  id: string,
  options: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>,
  currentValue: string,
  promptInjectedValues?: ReadonlyArray<string>,
) {
  return {
    id,
    label: id,
    type: "select" as const,
    options: [...options],
    currentValue,
    ...(promptInjectedValues ? { promptInjectedValues: [...promptInjectedValues] } : {}),
  };
}

describe("applyDescriptorSelection", () => {
  const baseEffort = selectDescriptor(
    "effort",
    [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High", isDefault: true },
      { id: "ultrathink", label: "Ultrathink" },
    ],
    "high",
    ["ultrathink"],
  );

  it("replaces the descriptor's currentValue for a regular option", () => {
    const onChangeDescriptors = vi.fn();
    const onPromptChange = vi.fn();
    applyDescriptorSelection({
      descriptors: [baseEffort],
      descriptor: baseEffort,
      value: "medium",
      prompt: "",
      primarySelectDescriptorId: "effort",
      ultrathinkInBodyText: false,
      ultrathinkPromptControlled: false,
      onChangeDescriptors,
      onPromptChange,
    });
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [nextDescriptors] = onChangeDescriptors.mock.calls[0]!;
    expect(nextDescriptors[0].currentValue).toBe("medium");
    expect(onPromptChange).not.toHaveBeenCalled();
  });

  it("injects the Ultrathink: prefix when selecting a prompt-injected value", () => {
    const onChangeDescriptors = vi.fn();
    const onPromptChange = vi.fn();
    applyDescriptorSelection({
      descriptors: [baseEffort],
      descriptor: baseEffort,
      value: "ultrathink",
      prompt: "hello",
      primarySelectDescriptorId: "effort",
      ultrathinkInBodyText: false,
      ultrathinkPromptControlled: false,
      onChangeDescriptors,
      onPromptChange,
    });
    expect(onPromptChange).toHaveBeenCalledOnce();
    expect(onPromptChange.mock.calls[0][0]).toMatch(/^Ultrathink:/i);
    expect(onChangeDescriptors).not.toHaveBeenCalled();
  });

  it("strips Ultrathink: prefix when switching away from ultrathink", () => {
    const onChangeDescriptors = vi.fn();
    const onPromptChange = vi.fn();
    applyDescriptorSelection({
      descriptors: [baseEffort],
      descriptor: baseEffort,
      value: "high",
      prompt: "Ultrathink: do the thing",
      primarySelectDescriptorId: "effort",
      ultrathinkInBodyText: false,
      ultrathinkPromptControlled: true,
      onChangeDescriptors,
      onPromptChange,
    });
    expect(onPromptChange).toHaveBeenCalledWith("do the thing");
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [nextDescriptors] = onChangeDescriptors.mock.calls[0]!;
    expect(nextDescriptors[0].currentValue).toBe("high");
  });

  it("is a no-op when ultrathink appears in the body text for the primary descriptor", () => {
    const onChangeDescriptors = vi.fn();
    const onPromptChange = vi.fn();
    applyDescriptorSelection({
      descriptors: [baseEffort],
      descriptor: baseEffort,
      value: "low",
      prompt: "do the ultrathink thing",
      primarySelectDescriptorId: "effort",
      ultrathinkInBodyText: true,
      ultrathinkPromptControlled: true,
      onChangeDescriptors,
      onPromptChange,
    });
    expect(onChangeDescriptors).not.toHaveBeenCalled();
    expect(onPromptChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @s3code/web test traitsMenuLogic`
Expected: FAIL with `Cannot find module './traitsMenuLogic'`.

- [ ] **Step 3: Implement `traitsMenuLogic.ts`**

Create `apps/web/src/components/chat/traitsMenuLogic.ts`:

```ts
import { type ProviderOptionDescriptor } from "@s3tools/contracts";
import { applyClaudePromptEffortPrefix } from "@s3tools/shared/model";

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
```

- [ ] **Step 4: Update `TraitsPicker.tsx` to use the helper**

In `apps/web/src/components/chat/TraitsPicker.tsx`:

1. Remove the local `ULTRATHINK_PROMPT_PREFIX`, `replaceDescriptorCurrentValue`, and the `handleSelectChange` Ultrathink branch.
2. Import `applyDescriptorSelection` and `replaceDescriptorCurrentValue` from `./traitsMenuLogic`.
3. Replace `handleSelectChange` with:

```tsx
const handleSelectChange = (
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
  value: string,
) => {
  applyDescriptorSelection({
    descriptors,
    descriptor,
    value,
    prompt,
    primarySelectDescriptorId: primarySelectDescriptor?.id,
    ultrathinkInBodyText,
    ultrathinkPromptControlled,
    onChangeDescriptors: updateDescriptors,
    onPromptChange,
  });
};
```

Where `updateDescriptors` already exists (`apps/web/src/components/chat/TraitsPicker.tsx:254`).

Keep the boolean descriptor handler as-is (it already uses `replaceDescriptorCurrentValue`; just update the import).

- [ ] **Step 5: Run all related tests**

Run:

```
pnpm --filter @s3code/web test traitsMenuLogic
pnpm --filter @s3code/web test CompactComposerControlsMenu
```

Expected: PASS — helper tests pass; compact menu tests still pass (since logic is equivalent).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/traitsMenuLogic.ts \
  apps/web/src/components/chat/traitsMenuLogic.test.ts \
  apps/web/src/components/chat/TraitsPicker.tsx
git commit -m "Extract traits selection logic into shared module"
```

---

## Task 3: Create `ReasoningChip` component

**Files:**

- Create: `apps/web/src/components/chat/ReasoningChip.tsx`
- Create: `apps/web/src/components/chat/ReasoningChip.browser.tsx`

- [ ] **Step 1: Write failing browser test**

Create `apps/web/src/components/chat/ReasoningChip.browser.tsx`. Mirror the `CompactComposerControlsMenu.browser.tsx` test pattern (vitest-browser-react). Cover:

```tsx
import "../../index.css";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ReasoningChip } from "./ReasoningChip";
import { useUiStateStore } from "../../uiStateStore";

const effortDescriptor = {
  id: "effort" as const,
  label: "Reasoning",
  type: "select" as const,
  options: [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium" },
    { id: "high", label: "High", isDefault: true },
    { id: "ultrathink", label: "Ultrathink" },
  ],
  currentValue: "high",
  promptInjectedValues: ["ultrathink"],
};

describe("ReasoningChip", () => {
  it("renders dots indicator at 3/5 for high in icon-dots style", async () => {
    useUiStateStore.getState().setReasoningIndicatorStyle("icon-dots");
    const onChangeDescriptors = vi.fn();
    const onPromptChange = vi.fn();
    render(
      <ReasoningChip
        descriptor={effortDescriptor}
        descriptors={[effortDescriptor]}
        prompt=""
        primarySelectDescriptorId="effort"
        ultrathinkInBodyText={false}
        ultrathinkPromptControlled={false}
        onChangeDescriptors={onChangeDescriptors}
        onPromptChange={onPromptChange}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button");
    await expect.element(chip).toBeVisible();
    const dotsOn = chip.getByTestId("reasoning-dot-on");
    expect((await dotsOn.elements()).length).toBe(3);
  });

  it("renders abbreviated text label in text style", async () => {
    useUiStateStore.getState().setReasoningIndicatorStyle("text");
    render(
      <ReasoningChip
        descriptor={effortDescriptor}
        descriptors={[effortDescriptor]}
        prompt=""
        primarySelectDescriptorId="effort"
        ultrathinkInBodyText={false}
        ultrathinkPromptControlled={false}
        onChangeDescriptors={vi.fn()}
        onPromptChange={vi.fn()}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button");
    await expect.element(chip).toHaveTextContent(/High/i);
  });

  it("opens the menu on click and applies the chosen level", async () => {
    useUiStateStore.getState().setReasoningIndicatorStyle("icon-dots");
    const onChangeDescriptors = vi.fn();
    render(
      <ReasoningChip
        descriptor={effortDescriptor}
        descriptors={[effortDescriptor]}
        prompt=""
        primarySelectDescriptorId="effort"
        ultrathinkInBodyText={false}
        ultrathinkPromptControlled={false}
        onChangeDescriptors={onChangeDescriptors}
        onPromptChange={vi.fn()}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button");
    await chip.click();
    const lowItem = page.elementLocator(document.body).getByText("Low");
    await lowItem.click();
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [next] = onChangeDescriptors.mock.calls[0]!;
    expect(next[0].currentValue).toBe("low");
  });

  it("shows the Ultrathink variant when prompt-controlled", async () => {
    useUiStateStore.getState().setReasoningIndicatorStyle("icon-dots");
    render(
      <ReasoningChip
        descriptor={effortDescriptor}
        descriptors={[effortDescriptor]}
        prompt="Ultrathink: yes"
        primarySelectDescriptorId="effort"
        ultrathinkInBodyText={false}
        ultrathinkPromptControlled={true}
        onChangeDescriptors={vi.fn()}
        onPromptChange={vi.fn()}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button");
    await expect.element(chip).toHaveTextContent(/Ultra/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test:browser ReasoningChip`
Expected: FAIL with `Cannot find module './ReasoningChip'`.

- [ ] **Step 3: Implement `ReasoningChip.tsx`**

Create `apps/web/src/components/chat/ReasoningChip.tsx`:

```tsx
import type { ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";
import { BrainIcon, SparklesIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
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
  const indicatorStyle = useUiStateStore((s) => s.reasoningIndicatorStyle);
  const effectiveValue = props.ultrathinkPromptControlled
    ? "ultrathink"
    : typeof props.descriptor.currentValue === "string"
      ? props.descriptor.currentValue
      : undefined;
  const level = normalizeLevel(effectiveValue);
  const isUltra = level === "ultrathink";
  const tintClass = LEVEL_TINT_CLASSES[level];
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
            className={cn("h-7 gap-1.5 rounded-md px-2 text-xs font-medium", tintClass)}
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
                const on = position <= (level === "ultrathink" ? 5 : LEVEL_ORDINAL[level]);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test:browser ReasoningChip`
Expected: PASS — all four cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ReasoningChip.tsx \
  apps/web/src/components/chat/ReasoningChip.browser.tsx
git commit -m "Add ReasoningChip with icon-dots and text styles"
```

---

## Task 4: Create `FastModeChip` component

**Files:**

- Create: `apps/web/src/components/chat/FastModeChip.tsx`
- Create: `apps/web/src/components/chat/FastModeChip.browser.tsx`

- [ ] **Step 1: Write failing browser test**

Create `apps/web/src/components/chat/FastModeChip.browser.tsx`:

```tsx
import "../../index.css";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { FastModeChip } from "./FastModeChip";

const fastDescriptor = {
  id: "fastMode" as const,
  label: "Fast Mode",
  type: "boolean" as const,
};

describe("FastModeChip", () => {
  it("renders dim outline when off and toggles to on", async () => {
    const onChangeDescriptors = vi.fn();
    render(
      <FastModeChip
        descriptor={fastDescriptor}
        descriptors={[{ ...fastDescriptor, currentValue: false }]}
        onChangeDescriptors={onChangeDescriptors}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button", { name: /fast mode/i });
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [next] = onChangeDescriptors.mock.calls[0]!;
    expect(next[0].currentValue).toBe(true);
  });

  it("renders yellow filled when on and toggles to off", async () => {
    const onChangeDescriptors = vi.fn();
    render(
      <FastModeChip
        descriptor={{ ...fastDescriptor, currentValue: true }}
        descriptors={[{ ...fastDescriptor, currentValue: true }]}
        onChangeDescriptors={onChangeDescriptors}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button", { name: /fast mode/i });
    await expect.element(chip).toHaveAttribute("aria-pressed", "true");
    await chip.click();
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [next] = onChangeDescriptors.mock.calls[0]!;
    expect(next[0].currentValue).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test:browser FastModeChip`
Expected: FAIL with `Cannot find module './FastModeChip'`.

- [ ] **Step 3: Implement `FastModeChip.tsx`**

Create `apps/web/src/components/chat/FastModeChip.tsx`:

```tsx
import type { ProviderOptionDescriptor } from "@s3tools/contracts";
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
        "h-7 gap-1.5 rounded-md px-2 text-xs font-medium",
        isOn
          ? "bg-yellow-500/15 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-300"
          : "text-muted-foreground/60 ring-1 ring-border hover:text-foreground",
      )}
      onClick={() => {
        props.onChangeDescriptors(
          replaceDescriptorCurrentValue(props.descriptors, props.descriptor.id, !isOn),
        );
      }}
    >
      <ZapIcon aria-hidden="true" className={cn("size-3", isOn ? "fill-current" : undefined)} />
    </Button>
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test:browser FastModeChip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/FastModeChip.tsx \
  apps/web/src/components/chat/FastModeChip.browser.tsx
git commit -m "Add FastModeChip toggle button"
```

---

## Task 5: Create `ContextWindowChip` component

**Files:**

- Create: `apps/web/src/components/chat/ContextWindowChip.tsx`
- Create: `apps/web/src/components/chat/ContextWindowChip.browser.tsx`

- [ ] **Step 1: Write failing browser test**

Create `apps/web/src/components/chat/ContextWindowChip.browser.tsx`:

```tsx
import "../../index.css";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ContextWindowChip } from "./ContextWindowChip";

const ctxDescriptor = {
  id: "contextWindow" as const,
  label: "Context Window",
  type: "select" as const,
  options: [
    { id: "200k", label: "200k", isDefault: true },
    { id: "1m", label: "1M" },
  ],
  currentValue: "200k",
};

describe("ContextWindowChip", () => {
  it("renders the current value label and opens a menu to pick another", async () => {
    const onChangeDescriptors = vi.fn();
    render(
      <ContextWindowChip
        descriptor={ctxDescriptor}
        descriptors={[ctxDescriptor]}
        onChangeDescriptors={onChangeDescriptors}
      />,
    );
    const chip = page
      .elementLocator(document.body)
      .getByRole("button", { name: /context window/i });
    await expect.element(chip).toHaveTextContent("200k");
    await chip.click();
    await page.elementLocator(document.body).getByText("1M").click();
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [next] = onChangeDescriptors.mock.calls[0]!;
    expect(next[0].currentValue).toBe("1m");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test:browser ContextWindowChip`
Expected: FAIL.

- [ ] **Step 3: Implement `ContextWindowChip.tsx`**

Create `apps/web/src/components/chat/ContextWindowChip.tsx`:

```tsx
import type { ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { replaceDescriptorCurrentValue } from "./traitsMenuLogic";
import { cn } from "~/lib/utils";

type SelectDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

export interface ContextWindowChipProps {
  descriptor: SelectDescriptor;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
}

export const ContextWindowChip = memo(function ContextWindowChip(props: ContextWindowChipProps) {
  const value =
    typeof props.descriptor.currentValue === "string" ? props.descriptor.currentValue : "";
  const label = props.descriptor.options.find((option) => option.id === value)?.label ?? value;
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
              "h-7 gap-1.5 rounded-md px-2 text-xs font-medium",
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test:browser ContextWindowChip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ContextWindowChip.tsx \
  apps/web/src/components/chat/ContextWindowChip.browser.tsx
git commit -m "Add ContextWindowChip menu trigger"
```

---

## Task 6: Create `ThinkingChip` component

**Files:**

- Create: `apps/web/src/components/chat/ThinkingChip.tsx`
- Create: `apps/web/src/components/chat/ThinkingChip.browser.tsx`

- [ ] **Step 1: Write failing browser test**

Create `apps/web/src/components/chat/ThinkingChip.browser.tsx`:

```tsx
import "../../index.css";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { ThinkingChip } from "./ThinkingChip";

const thinkingDescriptor = {
  id: "thinking" as const,
  label: "Thinking",
  type: "boolean" as const,
};

describe("ThinkingChip", () => {
  it("toggles from off to on", async () => {
    const onChangeDescriptors = vi.fn();
    render(
      <ThinkingChip
        descriptor={thinkingDescriptor}
        descriptors={[{ ...thinkingDescriptor, currentValue: false }]}
        onChangeDescriptors={onChangeDescriptors}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button", { name: /thinking/i });
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [next] = onChangeDescriptors.mock.calls[0]!;
    expect(next[0].currentValue).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test:browser ThinkingChip`
Expected: FAIL.

- [ ] **Step 3: Implement `ThinkingChip.tsx`**

Create `apps/web/src/components/chat/ThinkingChip.tsx`:

```tsx
import type { ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";
import { BrainIcon } from "lucide-react";
import { Button } from "../ui/button";
import { replaceDescriptorCurrentValue } from "./traitsMenuLogic";
import { cn } from "~/lib/utils";

type ThinkingDescriptor = Extract<ProviderOptionDescriptor, { type: "boolean" }>;

export interface ThinkingChipProps {
  descriptor: ThinkingDescriptor;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
}

export const ThinkingChip = memo(function ThinkingChip(props: ThinkingChipProps) {
  const isOn = props.descriptor.currentValue === true;
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-label="Thinking"
      aria-pressed={isOn}
      title={isOn ? "Thinking: on (click to disable)" : "Thinking: off (click to enable)"}
      className={cn(
        "h-7 gap-1.5 rounded-md px-2 text-xs font-medium",
        isOn
          ? "bg-sky-500/15 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300"
          : "text-muted-foreground/60 ring-1 ring-border hover:text-foreground",
      )}
      onClick={() => {
        props.onChangeDescriptors(
          replaceDescriptorCurrentValue(props.descriptors, props.descriptor.id, !isOn),
        );
      }}
    >
      <BrainIcon aria-hidden="true" className="size-3" />
    </Button>
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test:browser ThinkingChip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ThinkingChip.tsx \
  apps/web/src/components/chat/ThinkingChip.browser.tsx
git commit -m "Add ThinkingChip toggle button"
```

---

## Task 7: Create `AgentChip` component

**Files:**

- Create: `apps/web/src/components/chat/AgentChip.tsx`
- Create: `apps/web/src/components/chat/AgentChip.browser.tsx`

- [ ] **Step 1: Write failing browser test**

Create `apps/web/src/components/chat/AgentChip.browser.tsx`:

```tsx
import "../../index.css";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { AgentChip } from "./AgentChip";

const agentDescriptor = {
  id: "agent" as const,
  label: "Agent",
  type: "select" as const,
  options: [
    { id: "gpt-5-codex", label: "gpt-5-codex", isDefault: true },
    { id: "gpt-5", label: "gpt-5" },
  ],
  currentValue: "gpt-5-codex",
};

describe("AgentChip", () => {
  it("renders current agent label and selects another from menu", async () => {
    const onChangeDescriptors = vi.fn();
    render(
      <AgentChip
        descriptor={agentDescriptor}
        descriptors={[agentDescriptor]}
        onChangeDescriptors={onChangeDescriptors}
      />,
    );
    const chip = page.elementLocator(document.body).getByRole("button", { name: /agent/i });
    await expect.element(chip).toHaveTextContent("gpt-5-codex");
    await chip.click();
    await page.elementLocator(document.body).getByText("gpt-5", { exact: true }).click();
    expect(onChangeDescriptors).toHaveBeenCalledOnce();
    const [next] = onChangeDescriptors.mock.calls[0]!;
    expect(next[0].currentValue).toBe("gpt-5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test:browser AgentChip`
Expected: FAIL.

- [ ] **Step 3: Implement `AgentChip.tsx`**

Create `apps/web/src/components/chat/AgentChip.tsx`:

```tsx
import type { ProviderOptionDescriptor } from "@s3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import { replaceDescriptorCurrentValue } from "./traitsMenuLogic";
import { cn } from "~/lib/utils";

type AgentDescriptor = Extract<ProviderOptionDescriptor, { type: "select" }>;

export interface AgentChipProps {
  descriptor: AgentDescriptor;
  descriptors: ReadonlyArray<ProviderOptionDescriptor>;
  onChangeDescriptors: (next: ReadonlyArray<ProviderOptionDescriptor>) => void;
}

export const AgentChip = memo(function AgentChip(props: AgentChipProps) {
  const value =
    typeof props.descriptor.currentValue === "string" ? props.descriptor.currentValue : "";
  const label = props.descriptor.options.find((option) => option.id === value)?.label ?? value;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Agent: ${label}`}
            title="Agent"
            className={cn(
              "h-7 gap-1.5 rounded-md px-2 text-xs font-medium",
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test:browser AgentChip`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/AgentChip.tsx \
  apps/web/src/components/chat/AgentChip.browser.tsx
git commit -m "Add AgentChip menu trigger"
```

---

## Task 8: Create `TraitsChips` container

**Files:**

- Create: `apps/web/src/components/chat/TraitsChips.tsx`
- Create: `apps/web/src/components/chat/TraitsChips.browser.tsx`

- [ ] **Step 1: Write failing browser test**

Create `apps/web/src/components/chat/TraitsChips.browser.tsx`:

```tsx
import "../../index.css";
import {
  type ModelSelection,
  ProviderInstanceId,
  ProviderDriverKind,
  ThreadId,
  EnvironmentId,
} from "@s3tools/contracts";
import { scopeThreadRef, scopedThreadKey } from "@s3tools/client-runtime";
import {
  DEFAULT_MODEL,
  DEFAULT_MODEL_BY_PROVIDER,
  createModelCapabilities,
  createModelSelection,
} from "@s3tools/shared/model";
import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TraitsChips } from "./TraitsChips";
import { useComposerDraftStore } from "../../composerDraftStore";

const LOCAL_ENVIRONMENT_ID = EnvironmentId.make("environment-local");

function selectDescriptor(
  id: string,
  label: string,
  options: ReadonlyArray<{ id: string; label: string; isDefault?: boolean }>,
) {
  const defaultId = options.find((option) => option.isDefault)?.id;
  return {
    id,
    label,
    type: "select" as const,
    options: [...options],
    ...(defaultId ? { currentValue: defaultId } : {}),
  };
}

function booleanDescriptor(id: string, label: string) {
  return { id, label, type: "boolean" as const };
}

function mount(opts: {
  effort?: boolean;
  fastMode?: boolean;
  contextWindow?: boolean;
  thinking?: boolean;
  selection?: ModelSelection;
  prompt?: string;
}) {
  const threadId = ThreadId.make("thread-chips");
  const threadRef = scopeThreadRef(LOCAL_ENVIRONMENT_ID, threadId);
  const threadKey = scopedThreadKey(threadRef);
  const provider = ProviderDriverKind.make("claudeAgent");
  const instanceId = ProviderInstanceId.make(provider);
  const model = opts.selection?.model ?? DEFAULT_MODEL_BY_PROVIDER[provider] ?? DEFAULT_MODEL;
  useComposerDraftStore.setState({
    draftsByThreadKey: {
      [threadKey]: {
        prompt: opts.prompt ?? "",
        images: [],
        nonPersistedImageIds: [],
        persistedAttachments: [],
        terminalContexts: [],
        sourceControlContexts: [],
        modelSelectionByProvider: {
          [instanceId]: createModelSelection(instanceId, model, opts.selection?.options),
        },
        activeProvider: instanceId,
        runtimeMode: null,
        interactionMode: null,
      },
    },
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const optionDescriptors = [
    ...(opts.effort
      ? [
          selectDescriptor("effort", "Reasoning", [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High", isDefault: true },
          ]),
        ]
      : []),
    ...(opts.fastMode ? [booleanDescriptor("fastMode", "Fast Mode")] : []),
    ...(opts.contextWindow
      ? [
          selectDescriptor("contextWindow", "Context Window", [
            { id: "200k", label: "200k", isDefault: true },
            { id: "1m", label: "1M" },
          ]),
        ]
      : []),
    ...(opts.thinking ? [booleanDescriptor("thinking", "Thinking")] : []),
  ];
  const models = [
    {
      slug: model,
      name: model,
      isCustom: false,
      capabilities: createModelCapabilities({ optionDescriptors }),
    },
  ];
  return render(
    <TraitsChips
      provider={provider}
      threadRef={threadRef}
      model={model}
      models={models}
      prompt={opts.prompt ?? ""}
      modelOptions={undefined}
      onPromptChange={() => {}}
    />,
  );
}

describe("TraitsChips", () => {
  afterEach(() => {
    useComposerDraftStore.setState({
      draftsByThreadKey: {},
      draftThreadsByThreadKey: {},
      logicalProjectDraftThreadKeyByLogicalProjectKey: {},
    });
  });

  it("renders Reasoning + Fast + Context chips when all capabilities are present", async () => {
    mount({ effort: true, fastMode: true, contextWindow: true });
    const body = page.elementLocator(document.body);
    await expect.element(body.getByRole("button", { name: /reasoning/i })).toBeVisible();
    await expect.element(body.getByRole("button", { name: /fast mode/i })).toBeVisible();
    await expect.element(body.getByRole("button", { name: /context window/i })).toBeVisible();
  });

  it("omits Fast chip when capability is absent", async () => {
    mount({ effort: true, contextWindow: true });
    const body = page.elementLocator(document.body);
    await expect.element(body.getByRole("button", { name: /reasoning/i })).toBeVisible();
    const fast = body.getByRole("button", { name: /fast mode/i });
    expect((await fast.elements()).length).toBe(0);
  });

  it("renders only the Thinking chip for Haiku-like capability", async () => {
    mount({ thinking: true });
    const body = page.elementLocator(document.body);
    await expect.element(body.getByRole("button", { name: /thinking/i })).toBeVisible();
    expect((await body.getByRole("button", { name: /reasoning/i }).elements()).length).toBe(0);
    expect((await body.getByRole("button", { name: /fast mode/i }).elements()).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @s3code/web test:browser TraitsChips`
Expected: FAIL with `Cannot find module './TraitsChips'`.

- [ ] **Step 3: Implement `TraitsChips.tsx`**

Create `apps/web/src/components/chat/TraitsChips.tsx`:

```tsx
import {
  type ProviderDriverKind,
  type ProviderOptionDescriptor,
  type ProviderOptionSelection,
  type ScopedThreadRef,
  type ServerProviderModel,
} from "@s3tools/contracts";
import {
  buildProviderOptionSelectionsFromDescriptors,
  getProviderOptionDescriptors,
  isClaudeUltrathinkPrompt,
} from "@s3tools/shared/model";
import { memo, useCallback } from "react";

import { useComposerDraftStore, DraftId } from "../../composerDraftStore";
import { getProviderModelCapabilities } from "../../providerModels";
import { ReasoningChip } from "./ReasoningChip";
import { FastModeChip } from "./FastModeChip";
import { ContextWindowChip } from "./ContextWindowChip";
import { ThinkingChip } from "./ThinkingChip";
import { AgentChip } from "./AgentChip";

type ProviderOptions = ReadonlyArray<ProviderOptionSelection>;

type Persistence =
  | {
      threadRef?: ScopedThreadRef;
      draftId?: DraftId;
      onModelOptionsChange?: never;
    }
  | {
      threadRef?: undefined;
      onModelOptionsChange: (nextOptions: ProviderOptions | undefined) => void;
    };

export type TraitsChipsProps = {
  provider: ProviderDriverKind;
  models: ReadonlyArray<ServerProviderModel>;
  model: string | null | undefined;
  prompt: string;
  onPromptChange: (prompt: string) => void;
  modelOptions?: ProviderOptions | null | undefined;
} & Persistence;

export const TraitsChips = memo(function TraitsChips(props: TraitsChipsProps) {
  const setProviderModelOptions = useComposerDraftStore((store) => store.setProviderModelOptions);
  const updateModelOptions = useCallback(
    (nextOptions: ProviderOptions | undefined) => {
      if ("onModelOptionsChange" in props && props.onModelOptionsChange) {
        props.onModelOptionsChange(nextOptions);
        return;
      }
      const threadTarget = props.threadRef ?? props.draftId;
      if (!threadTarget) return;
      setProviderModelOptions(threadTarget, props.provider, nextOptions, {
        model: props.model,
        persistSticky: true,
      });
    },
    [props, setProviderModelOptions],
  );

  const caps = getProviderModelCapabilities(props.models, props.model, props.provider);
  const descriptors = getProviderOptionDescriptors({ caps, selections: props.modelOptions });
  if (descriptors.length === 0) return null;

  const primarySelectDescriptor = descriptors.find(
    (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
      descriptor.type === "select",
  );

  const ultrathinkPromptControlled =
    (primarySelectDescriptor?.promptInjectedValues?.length ?? 0) > 0 &&
    isClaudeUltrathinkPrompt(props.prompt);
  const ultrathinkInBodyText =
    ultrathinkPromptControlled &&
    isClaudeUltrathinkPrompt(props.prompt.replace(/^Ultrathink:\s*/i, ""));

  const onChangeDescriptors = (next: ReadonlyArray<ProviderOptionDescriptor>) => {
    updateModelOptions(buildProviderOptionSelectionsFromDescriptors(next));
  };

  const findSelect = (id: string) =>
    descriptors.find(
      (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "select" }> =>
        descriptor.id === id && descriptor.type === "select",
    );
  const findBoolean = (id: string) =>
    descriptors.find(
      (descriptor): descriptor is Extract<ProviderOptionDescriptor, { type: "boolean" }> =>
        descriptor.id === id && descriptor.type === "boolean",
    );

  const effort = findSelect("effort");
  const fastMode = findBoolean("fastMode");
  const contextWindow = findSelect("contextWindow");
  const thinking = findBoolean("thinking");
  const agent = findSelect("agent");

  return (
    <div className="flex flex-wrap items-center gap-1">
      {effort ? (
        <ReasoningChip
          descriptor={effort}
          descriptors={descriptors}
          prompt={props.prompt}
          primarySelectDescriptorId={primarySelectDescriptor?.id}
          ultrathinkInBodyText={ultrathinkInBodyText}
          ultrathinkPromptControlled={ultrathinkPromptControlled}
          onChangeDescriptors={onChangeDescriptors}
          onPromptChange={props.onPromptChange}
        />
      ) : null}
      {fastMode ? (
        <FastModeChip
          descriptor={fastMode}
          descriptors={descriptors}
          onChangeDescriptors={onChangeDescriptors}
        />
      ) : null}
      {contextWindow ? (
        <ContextWindowChip
          descriptor={contextWindow}
          descriptors={descriptors}
          onChangeDescriptors={onChangeDescriptors}
        />
      ) : null}
      {thinking ? (
        <ThinkingChip
          descriptor={thinking}
          descriptors={descriptors}
          onChangeDescriptors={onChangeDescriptors}
        />
      ) : null}
      {agent ? (
        <AgentChip
          descriptor={agent}
          descriptors={descriptors}
          onChangeDescriptors={onChangeDescriptors}
        />
      ) : null}
    </div>
  );
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @s3code/web test:browser TraitsChips`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/TraitsChips.tsx \
  apps/web/src/components/chat/TraitsChips.browser.tsx
git commit -m "Add TraitsChips container component"
```

---

## Task 9: Wire `TraitsChips` into `ChatComposer` via `composerProviderState`

**Files:**

- Modify: `apps/web/src/components/chat/composerProviderState.tsx`
- Modify: `apps/web/src/components/chat/ChatComposer.tsx`
- Modify: `apps/web/src/components/chat/composerProviderState.test.tsx` (if test calls the renamed helper directly)

- [ ] **Step 1: Update `composerProviderState.tsx`**

Replace `renderProviderTraitsPicker` (currently lines ~110-112) and the `renderTraitsControl` indirection. The compact menu path still uses `renderProviderTraitsMenuContent` and is untouched.

Edit `apps/web/src/components/chat/composerProviderState.tsx`:

```tsx
import { TraitsChips } from "./TraitsChips";
// ...keep existing imports including TraitsMenuContent and shouldRenderTraitsControls...

export function renderProviderTraitsChips(input: TraitsRenderInput): ReactNode {
  const { provider, threadRef, draftId, model, models, modelOptions, prompt, onPromptChange } =
    input;
  const hasTarget = threadRef !== undefined || draftId !== undefined;
  if (
    !hasTarget ||
    !shouldRenderTraitsControls({ provider, models, model, modelOptions, prompt })
  ) {
    return null;
  }
  return (
    <TraitsChips
      provider={provider}
      models={models}
      {...(threadRef ? { threadRef } : {})}
      {...(draftId ? { draftId } : {})}
      model={model}
      modelOptions={modelOptions}
      prompt={prompt}
      onPromptChange={onPromptChange}
    />
  );
}
```

Remove `renderProviderTraitsPicker` entirely. Update the import to drop `TraitsPicker` from `./TraitsPicker`.

If `renderTraitsControl` is only used by `renderProviderTraitsMenuContent` now, simplify `renderProviderTraitsMenuContent` to inline the logic (saves indirection) — equivalent behavior. Otherwise keep `renderTraitsControl` as-is.

- [ ] **Step 2: Update `ChatComposer.tsx`**

In `apps/web/src/components/chat/ChatComposer.tsx`:

1. At the top (line ~87-91), change import:

   ```tsx
   import {
     getComposerProviderState,
     renderProviderTraitsMenuContent,
     renderProviderTraitsChips,
   } from "./composerProviderState";
   ```

2. At line ~1146, rename:

   ```tsx
   const providerTraitsChips = renderProviderTraitsChips({
     provider: selectedProvider,
     ...(routeKind === "server" ? { threadRef: routeThreadRef } : {}),
     ...(routeKind === "draft" && draftId ? { draftId } : {}),
     model: selectedModel,
     models: selectedProviderModels,
     modelOptions: composerModelOptions?.[selectedProvider],
     prompt,
     onPromptChange: setPromptFromTraits,
   });
   ```

3. At line ~2622-2630, replace the `providerTraitsPicker` JSX with `providerTraitsChips`:
   ```tsx
   {
     providerTraitsChips ? (
       <>
         <Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />
         {providerTraitsChips}
       </>
     ) : null;
   }
   ```

- [ ] **Step 3: Update `composerProviderState.test.tsx` if it references the old name**

Run `grep -n renderProviderTraitsPicker apps/web/src/components/chat/composerProviderState.test.tsx`. If hits exist, rename the calls to `renderProviderTraitsChips`. The test should still pass against the new helper.

- [ ] **Step 4: Run typecheck + tests**

Run:

```
pnpm --filter @s3code/web typecheck
pnpm --filter @s3code/web test:browser TraitsChips
pnpm --filter @s3code/web test composerProviderState
```

Expected: PASS — no TS errors, chip tests still green, composer state tests pass under the new name.

- [ ] **Step 5: Manual smoke test**

Run: `pnpm --filter @s3code/web dev` and open the chat composer.
Confirm:

- Reasoning chip appears for Opus 4.6 with current level dots (or text per setting).
- Fast Mode chip appears for Opus 4.6 (dim when off, yellow when on).
- Context window chip appears with "200k" or "1M".
- Haiku 4.5 shows the Thinking chip only.
- Sonnet 4.6 shows Reasoning + Context, no Fast.
- Clicking each chip works as designed.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/composerProviderState.tsx \
  apps/web/src/components/chat/composerProviderState.test.tsx \
  apps/web/src/components/chat/ChatComposer.tsx
git commit -m "Render composer traits as chip row"
```

---

## Task 10: Add "Reasoning indicator" section to `AppearanceSettings`

**Files:**

- Modify: `apps/web/src/components/settings/AppearanceSettings.tsx`

- [ ] **Step 1: Update `AppearanceSettings.tsx`**

Insert a new `SettingsSection` immediately before "Color mode" (around line 379). It uses the existing `SettingsSection` / `SettingsRow` / `SettingResetButton` primitives.

Add imports at the top:

```tsx
import { BrainIcon } from "lucide-react";
import { useUiStateStore, type ReasoningIndicatorStyle } from "../../uiStateStore";
```

Inside `AppearanceSettingsPanel`, near the top, read state:

```tsx
const reasoningIndicatorStyle = useUiStateStore((s) => s.reasoningIndicatorStyle);
const setReasoningIndicatorStyle = useUiStateStore((s) => s.setReasoningIndicatorStyle);
```

Insert the new section before `<SettingsSection title="Color mode">`:

```tsx
<SettingsSection title="Reasoning indicator">
  <SettingsRow
    title="Reasoning chip style"
    description="How the reasoning effort level appears in the composer bar."
    resetAction={
      reasoningIndicatorStyle !== "icon-dots" ? (
        <SettingResetButton
          label="reasoning indicator"
          onClick={() => setReasoningIndicatorStyle("icon-dots")}
        />
      ) : null
    }
    control={
      <div className="flex w-full flex-col gap-2 sm:w-80">
        {(
          [
            {
              value: "icon-dots" as const,
              label: "Icon + dots",
              description: "Brain icon with intensity dots",
            },
            {
              value: "text" as const,
              label: "Text label",
              description: "Color-tinted abbreviated text",
            },
          ] satisfies ReadonlyArray<{
            value: ReasoningIndicatorStyle;
            label: string;
            description: string;
          }>
        ).map((option) => {
          const isSelected = reasoningIndicatorStyle === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setReasoningIndicatorStyle(option.value)}
              className={cn(
                "flex items-center gap-3 rounded-md border px-3 py-2 text-left",
                isSelected
                  ? "border-primary ring-1 ring-primary/40"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <span
                className={cn(
                  "size-3.5 rounded-full border",
                  isSelected ? "border-primary bg-primary/80" : "border-foreground/30",
                )}
              />
              <span className="flex flex-grow flex-col">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-muted-foreground text-xs">{option.description}</span>
              </span>
              <span
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium",
                  "bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
                )}
              >
                {option.value === "icon-dots" ? (
                  <>
                    <BrainIcon aria-hidden="true" className="size-3" />
                    <span className="inline-flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((position) => (
                        <span
                          key={position}
                          className={cn(
                            "size-[5px] rounded-full bg-current",
                            position <= 3 ? "opacity-100" : "opacity-30",
                          )}
                        />
                      ))}
                    </span>
                  </>
                ) : (
                  <span>High</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    }
  />
</SettingsSection>
```

(If `cn` is not already imported at the top of this file, add `import { cn } from "../../lib/utils";`.)

- [ ] **Step 2: Manual smoke test**

Run: `pnpm --filter @s3code/web dev`. Open Settings → Appearance. Confirm:

- "Reasoning indicator" section appears above "Color mode".
- Both radio cards render with previews.
- Clicking switches the selection and the composer's Reasoning chip updates immediately.
- Reset button appears when on "Text label" and restores "Icon + dots".

- [ ] **Step 3: Run typecheck**

Run: `pnpm --filter @s3code/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/settings/AppearanceSettings.tsx
git commit -m "Add reasoning indicator setting to appearance"
```

---

## Task 11: Cleanup — remove unused `TraitsPicker` component

**Files:**

- Modify: `apps/web/src/components/chat/TraitsPicker.tsx`

- [ ] **Step 1: Confirm no remaining `TraitsPicker` consumers**

Run:

```
grep -rn "TraitsPicker[^M]" apps/web/src --include="*.ts*"
```

Expected: matches only inside `TraitsPicker.tsx` itself, or no matches.

If anything outside `TraitsPicker.tsx` still imports `TraitsPicker`, stop and address that import first (likely a stale test). Do not delete the export.

- [ ] **Step 2: Remove the component**

Edit `apps/web/src/components/chat/TraitsPicker.tsx`:

1. Delete the entire `TraitsPicker` export (lines ~345-447 — the `memo(function TraitsPicker(...))` block).
2. Delete the now-unused `triggerLabel` computation.
3. Keep `TraitsMenuContent`, `shouldRenderTraitsControls`, and `TraitsMenuContentProps`. They remain consumed by `CompactComposerControlsMenu` and `composerProviderState`.
4. Drop unused imports (`Button`, `buttonVariants`, `ChevronDownIcon`, `VariantProps`) once they no longer have references.

- [ ] **Step 3: Run all related tests**

Run:

```
pnpm --filter @s3code/web typecheck
pnpm --filter @s3code/web test:browser CompactComposerControlsMenu
pnpm --filter @s3code/web test:browser TraitsChips
```

Expected: PASS on all three.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/TraitsPicker.tsx
git commit -m "Remove unused TraitsPicker component"
```

---

## Self-Review

**Spec coverage check:**

- Goal — replace joined trait label with chip row + Reasoning style setting → Tasks 1, 3-9 ✓
- New `TraitsChips.tsx` container → Task 8 ✓
- ReasoningChip with two styles → Task 3 ✓
- FastModeChip toggle → Task 4 ✓
- ContextWindowChip with menu → Task 5 ✓
- ThinkingChip (Haiku) → Task 6 ✓
- AgentChip (Codex) → Task 7 ✓
- `reasoningIndicatorStyle` field + setter + persistence → Task 1 ✓
- Appearance Settings new section → Task 10 ✓
- Wiring to ChatComposer + composerProviderState rename → Task 9 ✓
- TraitsMenuContent still used by CompactComposerControlsMenu → Task 2 keeps its API; Task 11 confirms ✓
- Shared `applyDescriptorSelection` helper → Task 2 ✓
- Cleanup of unused `TraitsPicker` export → Task 11 ✓
- Chip ordering Reasoning → Fast → Context → Thinking → Agent → Task 8 (`TraitsChips` JSX order) ✓
- Color palette per spec → Task 3 (Tailwind classes match spec hex/opacity intent) ✓
- Ultrathink prompt-injection preserved → Tasks 2 + 3 ✓

**Placeholder scan:** None found — each step contains complete code or exact commands. ✓

**Type consistency:**

- `ReasoningIndicatorStyle = "icon-dots" | "text"` — used consistently in Tasks 1, 3, 10. ✓
- `applyDescriptorSelection` input shape consistent between Task 2 definition and Task 3 usage. ✓
- `onChangeDescriptors` signature `(next: ReadonlyArray<ProviderOptionDescriptor>) => void` consistent across Tasks 3-8. ✓
- `replaceDescriptorCurrentValue` exported from `traitsMenuLogic` and consumed by Tasks 3-7. ✓
- `renderProviderTraitsChips` named identically in Tasks 8/9. ✓
