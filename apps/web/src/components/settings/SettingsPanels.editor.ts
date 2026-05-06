import { FolderClosedIcon } from "lucide-react";
import { EDITORS, type EditorId } from "@t3tools/contracts";
import {
  AntigravityIcon,
  CursorIcon,
  type Icon,
  KiroIcon,
  TraeIcon,
  VisualStudioCode,
  VisualStudioCodeInsiders,
  VSCodium,
  Zed,
} from "../Icons";
import {
  AquaIcon,
  CLionIcon,
  DataGripIcon,
  DataSpellIcon,
  GoLandIcon,
  IntelliJIdeaIcon,
  PhpStormIcon,
  PyCharmIcon,
  RiderIcon,
  RubyMineIcon,
  RustRoverIcon,
  WebStormIcon,
} from "../JetBrainsIcons";
import { isMacPlatform, isWindowsPlatform } from "../../lib/utils";

export const EDITOR_ICONS = {
  cursor: CursorIcon,
  trae: TraeIcon,
  kiro: KiroIcon,
  vscode: VisualStudioCode,
  "vscode-insiders": VisualStudioCodeInsiders,
  vscodium: VSCodium,
  zed: Zed,
  antigravity: AntigravityIcon,
  idea: IntelliJIdeaIcon,
  aqua: AquaIcon,
  clion: CLionIcon,
  datagrip: DataGripIcon,
  dataspell: DataSpellIcon,
  goland: GoLandIcon,
  phpstorm: PhpStormIcon,
  pycharm: PyCharmIcon,
  rider: RiderIcon,
  rubymine: RubyMineIcon,
  rustrover: RustRoverIcon,
  webstorm: WebStormIcon,
  "file-manager": FolderClosedIcon,
} satisfies Record<EditorId, Icon>;

export function getEditorLabel(editor: EditorId, platform: string): string {
  if (editor === "file-manager") {
    if (isMacPlatform(platform)) return "Finder";
    if (isWindowsPlatform(platform)) return "Explorer";
    return "Files";
  }
  return EDITORS.find((e) => e.id === editor)?.label ?? editor;
}
