/**
 * Phase 67-0 — Agent Network worker card refresh extracted from node-service-impl.
 */

import {
  AGENT_CARD_REFRESH_CONCURRENCY,
  AGENT_CARD_REFRESH_WARM_MS,
  agentCardRefreshTimeoutMs,
  mapPoolSettled,
} from "./agent-card-refresh.js";
import { raceWithTimeout } from "./outbound-warm-dial.js";
import { anLog, anWarn } from "./agent-network-debug.js";

export type AgentNetworkRefreshDeps = {
  getNodeConfig(): Promise<{ capabilityProviderEnabled?: boolean }>;
  announceLocalAgentCardToBondedPeers(): Promise<{ announced: number; failed: number }>;
  getBonds(): Promise<Array<{ peerOwnerId: string; level: string }>>;
  getPeerConnectionInfo(ownerId: string): Promise<{ connected: boolean }>;
  warmContactConnection(ownerId: string): Promise<unknown>;
  requestAgentCard(
    ownerId: string,
    opts?: { timeoutMs?: number },
  ): Promise<{ ok?: boolean } | null | undefined>;
  refreshAgentNetworkMembershipIndex(): Promise<unknown>;
  listAgentCards(): Promise<unknown[]>;
  emitHomeAgentCardsUpdated(cards: unknown[]): void;
  scheduleDeferredIndexRefresh(): void;
};

export async function refreshAgentNetworkWorkersViaRuntime(
  deps: AgentNetworkRefreshDeps,
): Promise<{ requested: number; failed: number }> {
  let requested = 0;
  let failed = 0;
  anLog("refresh", "refreshAgentNetworkWorkers start");
  try {
    const cfg = await deps.getNodeConfig();
    if (cfg.capabilityProviderEnabled === true) {
      try {
        const pushed = await deps.announceLocalAgentCardToBondedPeers();
        anLog("refresh", "announce local card", {
          announced: pushed.announced,
          failed: pushed.failed,
        });
        if (pushed.failed > 0) {
          anWarn("refresh", "announceLocalAgentCard partial failure", {
            announced: pushed.announced,
            failed: pushed.failed,
          });
        }
      } catch (err) {
        anWarn("refresh", "announceLocalAgentCardToBondedPeers failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      anLog("refresh", "skip announce — Join Agent Network off");
    }
    const bonds = (await deps.getBonds()).filter(
      (bond) => bond.level === "direct" || bond.level === "referred",
    );
    requested = bonds.length;
    anLog("refresh", "pull cards from bonded peers", { count: requested });
    const outcomes = await mapPoolSettled(
      bonds,
      AGENT_CARD_REFRESH_CONCURRENCY,
      async (bond) => {
        try {
          let connected = false;
          try {
            connected = (await deps.getPeerConnectionInfo(bond.peerOwnerId)).connected;
          } catch {
            /* treat as offline */
          }
          if (!connected) {
            try {
              await raceWithTimeout(
                deps.warmContactConnection(bond.peerOwnerId),
                AGENT_CARD_REFRESH_WARM_MS,
                `agentCardWarm(${bond.peerOwnerId.slice(0, 16)}…)`,
              );
              connected = (await deps.getPeerConnectionInfo(bond.peerOwnerId)).connected;
            } catch {
              /* still offline — use relay budget below */
            }
          }
          const timeoutMs = agentCardRefreshTimeoutMs(connected);
          const result = await raceWithTimeout(
            deps.requestAgentCard(bond.peerOwnerId, { timeoutMs }),
            timeoutMs,
            `requestAgentCard(${bond.peerOwnerId.slice(0, 16)}…)`,
          );
          return Boolean(result?.ok);
        } catch {
          return false;
        }
      },
    );
    failed = outcomes.filter((ok) => !ok).length;
    anLog("refresh", "card pull done", { requested, failed, ok: requested - failed });
  } catch {
    anWarn("refresh", "bond list / card pull failed — still refreshing index");
  }
  try {
    await deps.refreshAgentNetworkMembershipIndex();
    const cards = await deps.listAgentCards();
    deps.emitHomeAgentCardsUpdated(cards);
    anLog("refresh", "membership index refreshed", { cards: cards.length });
  } catch (err) {
    anWarn("refresh", "refreshAgentNetworkMembershipIndex failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  deps.scheduleDeferredIndexRefresh();
  return { requested, failed };
}

export function buildAgentNetworkRefreshDeps(host: any): AgentNetworkRefreshDeps {
  return {
    getNodeConfig: () => host.getNodeConfig(),
    announceLocalAgentCardToBondedPeers: () => host.announceLocalAgentCardToBondedPeers(),
    getBonds: () => host.getBonds(),
    getPeerConnectionInfo: (ownerId) => host.getPeerConnectionInfo(ownerId),
    warmContactConnection: (ownerId) => host.warmContactConnection(ownerId),
    requestAgentCard: (ownerId, opts) => host.requestAgentCard(ownerId, opts),
    refreshAgentNetworkMembershipIndex: () => host.refreshAgentNetworkMembershipIndex(),
    listAgentCards: () => host.listAgentCards(),
    emitHomeAgentCardsUpdated: (cards) =>
      host.emit("home:agent-cards-updated", { cards }),
    scheduleDeferredIndexRefresh: () => host._scheduleDeferredAgentNetworkIndexRefresh(),
  };
}
