/**
 * Stable React context instances for the node service layer.
 * Keep createContext in this .ts file so Vite Fast Refresh can update
 * useNodeService.tsx without minting new context identities (same pattern as
 * i18n-context.ts / node-state-context.ts).
 *
 * Deliberately avoids importing useNodeService.js (circular). The Provider
 * supplies a NodeServiceClient; consumers cast via useNodeService().
 */
import { createContext } from "react";

export type TerminalSessionsContextValue = {
  sessions: import("@envoymesh/api").TerminalSessionSummary[];
  refresh: () => Promise<void>;
};

export type ModelProviderUiScope = "full" | "cloud-only";

export interface DesktopConnectionPrefs {
  wsUrl: string;
  autoConnect: boolean;
}

/** Opaque client handle — typed at the useNodeService() boundary. */
export const NodeServiceContext = createContext<unknown>(null);

export const TerminalSessionsContext = createContext<TerminalSessionsContextValue | null>(
  null,
);

/** True when WebSocket/mobile transport is up (daemon may still be stopped). */
export const TransportWsContext = createContext(false);

export const ModelProviderUiScopeContext = createContext<ModelProviderUiScope>("full");

export const DesktopConnectionPrefsContext = createContext<{
  updatePrefs: (patch: Partial<DesktopConnectionPrefs>) => void;
} | null>(null);
