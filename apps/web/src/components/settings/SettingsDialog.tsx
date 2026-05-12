// apps/web/src/components/settings/SettingsDialog.tsx
import { useCallback, useState, type ComponentType } from "react";
import {
  ArchiveIcon,
  BlocksIcon,
  GitBranchIcon,
  Link2Icon,
  PaletteIcon,
  RotateCcwIcon,
  ServerIcon,
  Settings2Icon,
} from "lucide-react";

import { type SettingsSectionId, useSettingsDialogStore } from "../../settingsDialogStore";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import { AppearanceSettingsPanel } from "./AppearanceSettings";
import { ConnectionsSettings } from "./ConnectionsSettings";
import { McpServersSettings } from "./McpServersSettings";
import { ProvidersSettingsPanel } from "./ProvidersSettingsPanel";
import { ArchivedThreadsPanel, GeneralSettingsPanel, useSettingsRestore } from "./SettingsPanels";
import { SourceControlSettingsPanel } from "./SourceControlSettings";

interface NavItem {
  id: SettingsSectionId;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { id: "general", label: "General", icon: Settings2Icon },
  { id: "providers", label: "Providers", icon: BlocksIcon },
  { id: "mcp-servers", label: "MCP Servers", icon: ServerIcon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "source-control", label: "Source Control", icon: GitBranchIcon },
  { id: "connections", label: "Connections", icon: Link2Icon },
  { id: "archived", label: "Archive", icon: ArchiveIcon },
];

const SECTIONS_WITH_RESTORE: ReadonlySet<SettingsSectionId> = new Set([
  "general",
  "providers",
  "appearance",
]);

function RestoreDefaultsButton({ onRestored }: { onRestored: () => void }) {
  const { changedSettingLabels, restoreDefaults } = useSettingsRestore(onRestored);
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={changedSettingLabels.length === 0}
      onClick={() => void restoreDefaults()}
    >
      <RotateCcwIcon className="size-3.5" />
      Restore defaults
    </Button>
  );
}

function SectionPanel({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case "general":
      return <GeneralSettingsPanel />;
    case "providers":
      return <ProvidersSettingsPanel />;
    case "mcp-servers":
      return <McpServersSettings />;
    case "appearance":
      return <AppearanceSettingsPanel />;
    case "source-control":
      return <SourceControlSettingsPanel />;
    case "connections":
      return <ConnectionsSettings />;
    case "archived":
      return <ArchivedThreadsPanel />;
  }
}

export function SettingsDialog() {
  const open = useSettingsDialogStore((s) => s.open);
  const section = useSettingsDialogStore((s) => s.section);
  const closeSettings = useSettingsDialogStore((s) => s.closeSettings);
  const setSection = useSettingsDialogStore((s) => s.setSection);

  const [restoreSignal, setRestoreSignal] = useState(0);
  const handleRestored = useCallback(() => {
    setRestoreSignal((v) => v + 1);
  }, []);

  const showRestore = SECTIONS_WITH_RESTORE.has(section);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeSettings();
      }}
    >
      <DialogPopup
        className="h-[min(80vh,720px)] max-w-[960px] overflow-hidden p-0"
        bottomStickOnMobile={false}
        showCloseButton={true}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-5">
          <DialogTitle className="text-base font-semibold">Settings</DialogTitle>
          <div className="flex items-center gap-2 pr-9">
            {showRestore ? <RestoreDefaultsButton onRestored={handleRestored} /> : null}
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-row">
          <nav className="flex w-12 shrink-0 flex-col gap-1 border-r border-border p-2 sm:w-48">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] outline-hidden ring-ring transition-colors focus-visible:ring-2",
                    isActive
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground/70 hover:text-foreground/80",
                  )}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      isActive ? "text-foreground" : "text-muted-foreground/60",
                    )}
                  />
                  <span className="hidden truncate sm:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <ScrollArea className="min-h-0 flex-1 min-w-0">
            <div key={restoreSignal} className="flex flex-col">
              <SectionPanel section={section} />
            </div>
          </ScrollArea>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
