/**
 * Pairing Kiosk runtime.
 *
 * Extracted from `node-service-impl.ts` (Phase 35D section). Owns the
 * three private/public methods that manage the kiosk server:
 *
 *   - syncPairingKioskFromConfig — starts the kiosk from the current
 *     config (no-op if disabled or admin token missing)
 *   - stopPairingKiosk — shuts it down
 *   - getPairingKioskStatus — returns enabled/running/address/port
 *
 * Each function takes a `PairingKioskContext` carrying only the fields
 * it reads or mutates. The class methods collapse to one-line
 * delegations.
 */
import {
  startPairingKioskServer,
  type PairingKioskServerHandle,
} from "./pairing-kiosk-server.js";
import { createCompanyInviteViaRuntime } from "./node-service-company-invite.js";
import type { LocalTaskStore } from "@envoymesh/local-store";
import type { PairingKioskStatus } from "@envoymesh/api";
import type { PersistedNodeConfig } from "./node-config-store.js";

/**
 * Subset of `CreateCompanyInviteDeps` (sans taskStore) that the
 * kiosk needs to mint an invite when a mobile app pairs.
 */
export interface KioskInviteCtx {
  ownerId: string;
  ownerPublicKey?: string;
  agentPeerId?: string;
  agentName?: string;
  wsUrl: string;
  lanWsUrl?: string;
  relayWsUrl?: string;
  homeNodePeerId?: string;
}

export interface PairingKioskContext {
  /** Load persisted node config (or undefined if none). */
  loadConfig(): Promise<PersistedNodeConfig | undefined>;
  /** Current kiosk handle, or null/undefined if not running. */
  getKiosk(): PairingKioskServerHandle | null | undefined;
  /** Replace the kiosk handle (null/undefined clears it). */
  setKiosk(handle: PairingKioskServerHandle | null): void;
  /** Stop the current kiosk if any. */
  stopKiosk(): Promise<void>;
  /** Local task store, or undefined if not initialised. */
  getTaskStore(): LocalTaskStore | undefined;
  /** Resolve the kiosk's invite context (private helper). */
  getCompanyInviteContext(): Promise<KioskInviteCtx>;
}

export async function syncPairingKioskFromConfigViaRuntime(
  ctx: PairingKioskContext,
): Promise<void> {
  const cfg = await ctx.loadConfig();
  if (!cfg) {
    await ctx.stopKiosk();
    return;
  }
  if (cfg.pairingKioskEnabled !== true) {
    await ctx.stopKiosk();
    return;
  }
  if (!cfg.pairingKioskAdminToken || cfg.pairingKioskAdminToken.length < 16) {
    console.warn("[pairing-kiosk] enabled without a valid admin token; ignoring.");
    await ctx.stopKiosk();
    return;
  }
  // Re-use the existing handle if config hasn't materially changed.
  if (ctx.getKiosk() != null) {
    // For now we restart on every call. This is cheap; the kiosk serves
    // a static page and proxies one mint-invite call. If we ever need
    // hot-reload (e.g. token rotation without restart), we can diff.
    await ctx.stopKiosk();
  }
  try {
    const taskStore = ctx.getTaskStore();
    const inviteCtx = await ctx.getCompanyInviteContext();
    const handle = await startPairingKioskServer({
      kioskAdminToken: cfg.pairingKioskAdminToken,
      bindAddress: cfg.pairingKioskBindAddress,
      port: cfg.pairingKioskPort,
      allowLanBind: cfg.pairingKioskAllowLanBind === true,
      kioskExpiresAt: cfg.pairingKioskExpiresAt,
      mintInvite: async (input) => {
        if (!taskStore) throw new Error("task store not initialized");
        const result = await createCompanyInviteViaRuntime(
          { taskStore, ...inviteCtx } as never,
          { expiresInHours: input.expiresInHours, note: input.note ?? "kiosk" },
        );
        return {
          uri: result.uri,
          expiresAt: result.invite.expiresAt,
          inviteId: result.invite.inviteId,
        };
      },
    });
    ctx.setKiosk(handle);
  } catch (err) {
    console.warn("[pairing-kiosk] failed to start:", err);
    ctx.setKiosk(null);
  }
}

export async function stopPairingKioskViaRuntime(
  ctx: Pick<PairingKioskContext, "getKiosk" | "setKiosk">,
): Promise<void> {
  const current = ctx.getKiosk();
  if (!current) return;
  try {
    await current.close();
  } catch (err) {
    console.warn("[pairing-kiosk] close failed:", err);
  }
  ctx.setKiosk(null);
}

export async function getPairingKioskStatusViaRuntime(
  ctx: Pick<PairingKioskContext, "loadConfig" | "getKiosk">,
): Promise<PairingKioskStatus> {
  const cfg = await ctx.loadConfig();
  const enabled = cfg?.pairingKioskEnabled === true;
  const running = ctx.getKiosk() != null;
  return {
    enabled,
    running,
    address: running ? (ctx.getKiosk() as PairingKioskServerHandle).address : undefined,
    port: running ? (ctx.getKiosk() as PairingKioskServerHandle).port : undefined,
    bindLan: cfg?.pairingKioskAllowLanBind === true,
    expiresAt: cfg?.pairingKioskExpiresAt,
  } as PairingKioskStatus;
}