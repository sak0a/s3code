import { FileIcon, FolderIcon } from "lucide-react";
import { memo, useState } from "react";
import { useVscodeIconUrl } from "~/hooks/useVscodeIconUrl";
import { cn } from "~/lib/utils";

export const VscodeEntryIcon = memo(function VscodeEntryIcon(props: {
  pathValue: string;
  kind: "file" | "directory";
  theme: "light" | "dark";
  className?: string;
}) {
  const [failedIconUrl, setFailedIconUrl] = useState<string | null>(null);
  const iconUrl = useVscodeIconUrl(props.pathValue, props.kind, props.theme);
  const failed = iconUrl !== null && failedIconUrl === iconUrl;

  if (!iconUrl || failed) {
    return props.kind === "directory" ? (
      <FolderIcon className={cn("size-4 text-muted-foreground/80", props.className)} />
    ) : (
      <FileIcon className={cn("size-4 text-muted-foreground/80", props.className)} />
    );
  }

  return (
    <img
      src={iconUrl}
      alt=""
      aria-hidden="true"
      className={cn("size-4 shrink-0", props.className)}
      loading="lazy"
      onError={() => setFailedIconUrl(iconUrl)}
    />
  );
});
