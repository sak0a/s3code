import { useMemo } from "react";
import { useDetectedServerStore } from "../../detectedServerStore.ts";
import { DetectedServerRow } from "./DetectedServerRow.tsx";
import { DetectedServerLogView } from "./DetectedServerLogView.tsx";

interface Props {
  threadKey: string;
}

export const DetectedServersPanel = ({ threadKey }: Props) => {
  const serversMap = useDetectedServerStore((s) => s.serversByThreadKey[threadKey]);
  const activeId = useDetectedServerStore((s) => s.activeServerIdByThreadKey[threadKey] ?? null);
  const setActive = useDetectedServerStore((s) => s.setActive);

  const servers = useMemo(() => (serversMap ? [...serversMap.values()] : []), [serversMap]);
  const active = activeId && serversMap ? (serversMap.get(activeId) ?? null) : null;

  if (servers.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        No servers detected yet. They&apos;ll appear here when an agent runs{" "}
        <code className="mx-1">dev</code>/<code className="mx-1">serve</code> commands.
      </div>
    );
  }

  const handleStop = async (serverId: string) => {
    // wsRpcClient.detectedServers.stop({ serverId }) — wire when wsRpcClient is in scope
    // For Task 26 this stays a TODO; Task 28 wires actions through ChatView
    console.warn("stop server", serverId);
  };

  const handleCopy = (url: string) => {
    void navigator.clipboard.writeText(url);
  };

  const handleOpen = (serverId: string) => {
    // wsRpcClient.detectedServers.openInBrowser({ serverId }) — wired in Task 28
    console.warn("open server", serverId);
  };

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-border p-1">
        {servers.map((s) => (
          <DetectedServerRow
            key={s.id}
            server={s}
            active={s.id === activeId}
            onSelect={() => setActive(threadKey, s.id)}
            onOpen={() => handleOpen(s.id)}
            onCopy={() => s.url && handleCopy(s.url)}
            onStop={() => void handleStop(s.id)}
          />
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {active ? (
          <DetectedServerLogView serverId={active.id} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Select a server to view logs
          </div>
        )}
      </div>
    </div>
  );
};
