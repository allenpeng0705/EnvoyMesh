/**
 * EnvoyMesh Icon Library
 * SVG outline icons (24x24 viewBox, stroke-based, currentColor).
 *
 * Usage: <ChatIcon size={20} className="my-class" />
 *
 * All icons use stroke="currentColor" so they inherit text color.
 */
import type { SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function mkIcon(
  paths: React.ReactNode,
  defaultLabel: string,
): React.FC<IconProps> {
  function Icon({ size = 24, className, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...rest}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = defaultLabel;
  return Icon;
}

// ---- Navigation ----
export const ChatIcon = mkIcon(
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  "ChatIcon",
);

export const ContactsIcon = mkIcon(
  <>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </>,
  "ContactsIcon",
);

export const SearchIcon = mkIcon(
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </>,
  "SearchIcon",
);

export const ProfileIcon = mkIcon(
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>,
  "ProfileIcon",
);

export const SettingsIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
  "SettingsIcon",
);

// ---- Actions ----
export const SendIcon = mkIcon(
  <>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </>,
  "SendIcon",
);

export const BackIcon = mkIcon(
  <polyline points="15 18 9 12 15 6" />,
  "BackIcon",
);

export const CloseIcon = mkIcon(
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>,
  "CloseIcon",
);

export const CheckIcon = mkIcon(
  <polyline points="20 6 9 17 4 12" />,
  "CheckIcon",
);

export const EditIcon = mkIcon(
  <>
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </>,
  "EditIcon",
);

export const SaveIcon = mkIcon(
  <>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </>,
  "SaveIcon",
);

export const AddIcon = mkIcon(
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>,
  "AddIcon",
);

export const RemoveIcon = mkIcon(
  <>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </>,
  "RemoveIcon",
);

export const CopyIcon = mkIcon(
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
  "CopyIcon",
);

export const MoreIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="19" r="1" />
  </>,
  "MoreIcon",
);

export const QRCodeIcon = mkIcon(
  <>
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <line x1="14" y1="14" x2="14" y2="21" />
    <line x1="21" y1="14" x2="21" y2="17.5" />
    <line x1="14" y1="17.5" x2="18" y2="17.5" />
    <line x1="18" y1="21" x2="18" y2="19.5" />
    <line x1="18" y1="14.5" x2="21" y2="14.5" />
  </>,
  "QRCodeIcon",
);

export const ExpandIcon = mkIcon(
  <polyline points="6 9 12 15 18 9" />,
  "ExpandIcon",
);

export const CollapseIcon = mkIcon(
  <polyline points="18 15 12 9 6 15" />,
  "CollapseIcon",
);

// ---- Status ----
export const StatusOnlineIcon = mkIcon(
  <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" opacity="0.2" />,
  "StatusOnlineIcon",
);

export const StatusOfflineIcon = mkIcon(
  <circle cx="12" cy="12" r="10" stroke="currentColor" opacity="0.4" />,
  "StatusOfflineIcon",
);

export const InboxIcon = mkIcon(
  <>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>,
  "InboxIcon",
);

// ---- AI / Network ----
export const AIIcon = mkIcon(
  <>
    <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
    <path d="M12 15v5" />
    <path d="M9 18h6" />
  </>,
  "AIIcon",
);

export const BridgeIcon = mkIcon(
  <>
    <path d="M2 12h20" />
    <path d="M12 2v20" />
    <circle cx="12" cy="12" r="3" />
    <circle cx="2" cy="12" r="2" />
    <circle cx="22" cy="12" r="2" />
  </>,
  "BridgeIcon",
);

export const P2PIcon = mkIcon(
  <>
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="18" r="3" />
    <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
    <polyline points="16 8 11 8 11 3" />
  </>,
  "P2PIcon",
);

export const AttachIcon = mkIcon(
  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  "AttachIcon",
);

export const SmileIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
    <line x1="9" y1="9" x2="9.01" y2="9" />
    <line x1="15" y1="9" x2="15.01" y2="9" />
  </>,
  "SmileIcon",
);

export const RelayIcon = mkIcon(
  <>
    <circle cx="12" cy="5" r="2" />
    <circle cx="5" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
    <line x1="12" y1="7" x2="12" y2="10" />
    <line x1="8.5" y1="10.5" x2="6.5" y2="10.5" />
    <line x1="15.5" y1="10.5" x2="17.5" y2="10.5" />
    <line x1="8.5" y1="13.5" x2="6.5" y2="13.5" />
    <line x1="15.5" y1="13.5" x2="17.5" y2="13.5" />
    <line x1="12" y1="14" x2="12" y2="17" />
  </>,
  "RelayIcon",
);

// ---- Visibility / Theme ----
export const PublicIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </>,
  "PublicIcon",
);

export const PrivateIcon = mkIcon(
  <>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>,
  "PrivateIcon",
);

export const LanguageIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </>,
  "LanguageIcon",
);

export const DarkModeIcon = mkIcon(
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  "DarkModeIcon",
);

export const LightModeIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </>,
  "LightModeIcon",
);

// ---- Feedback ----
export const WarningIcon = mkIcon(
  <>
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </>,
  "WarningIcon",
);

export const ErrorIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </>,
  "ErrorIcon",
);

export const InfoIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </>,
  "InfoIcon",
);

export const DeclineIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </>,
  "DeclineIcon",
);

export const PendingIcon = mkIcon(
  <>
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </>,
  "PendingIcon",
);

// ---- Icon name map for programmatic use ----
export type IconName =
  | "chat"
  | "contacts"
  | "search"
  | "profile"
  | "settings"
  | "send"
  | "back"
  | "close"
  | "check"
  | "edit"
  | "save"
  | "add"
  | "remove"
  | "copy"
  | "more"
  | "qrCode"
  | "expand"
  | "collapse"
  | "statusOnline"
  | "statusOffline"
  | "inbox"
  | "ai"
  | "bridge"
  | "p2p"
  | "relay"
  | "public"
  | "private"
  | "darkMode"
  | "lightMode"
  | "warning"
  | "error"
  | "info"
  | "decline"
  | "pending";

export const ICON_MAP: Record<IconName, React.FC<IconProps>> = {
  chat: ChatIcon,
  contacts: ContactsIcon,
  search: SearchIcon,
  profile: ProfileIcon,
  settings: SettingsIcon,
  send: SendIcon,
  back: BackIcon,
  close: CloseIcon,
  check: CheckIcon,
  edit: EditIcon,
  save: SaveIcon,
  add: AddIcon,
  remove: RemoveIcon,
  copy: CopyIcon,
  more: MoreIcon,
  qrCode: QRCodeIcon,
  expand: ExpandIcon,
  collapse: CollapseIcon,
  statusOnline: StatusOnlineIcon,
  statusOffline: StatusOfflineIcon,
  inbox: InboxIcon,
  ai: AIIcon,
  bridge: BridgeIcon,
  p2p: P2PIcon,
  relay: RelayIcon,
  public: PublicIcon,
  private: PrivateIcon,
  darkMode: DarkModeIcon,
  lightMode: LightModeIcon,
  warning: WarningIcon,
  error: ErrorIcon,
  info: InfoIcon,
  decline: DeclineIcon,
  pending: PendingIcon,
};
