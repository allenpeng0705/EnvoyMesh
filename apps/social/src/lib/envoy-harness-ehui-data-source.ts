/**
 * Remote EhuiDataSource — each panel op maps to invokeEnvoyHarnessEhui on the node.
 */

import type {
  ClientClusterStatus,
  ClientDiscoveryEvent,
  ClientPeerInfo,
  ClientScoreboardEntry,
  ClientSessionSummary,
  ClientTeamJob,
  EhuiDataSource,
} from "@envoymesh/envoy-harness-client/ehui";
import type { EhuiInvokeRequest } from "@envoymesh/api";

export interface EnvoyHarnessEhuiNodeService {
  invokeEnvoyHarnessEhui(request: EhuiInvokeRequest): Promise<unknown>;
}

export interface CreateRemoteEhuiDataSourceOptions {
  /** Scope plan/memory/git/sessions to this EH chat workspace. */
  chatId?: string;
}

export function createRemoteEhuiDataSource(
  nodeService: EnvoyHarnessEhuiNodeService,
  options: CreateRemoteEhuiDataSourceOptions = {},
): EhuiDataSource {
  const chatId = options.chatId;
  const invoke = (request: EhuiInvokeRequest): Promise<unknown> =>
    nodeService.invokeEnvoyHarnessEhui(
      chatId !== undefined ? { ...request, chatId } : request,
    );

  return {
    sessionId: chatId ?? "envoy-mesh",
    plan: (action, options) =>
      invoke({
        op: "plan",
        action,
        ...(options?.text !== undefined ? { text: options.text } : {}),
        ...(options?.reason !== undefined ? { reason: options.reason } : {}),
      }) as Promise<string>,
    memory: (memoryOp, options) =>
      invoke({
        op: "memory",
        memoryOp,
        ...(options?.name !== undefined ? { name: options.name } : {}),
        ...(options?.body !== undefined ? { body: options.body } : {}),
      }) as Promise<string>,
    gitDiff: (options) =>
      invoke({
        op: "gitDiff",
        ...(options?.staged !== undefined ? { staged: options.staged } : {}),
        ...(options?.stat !== undefined ? { stat: options.stat } : {}),
      }) as Promise<string>,
    gitStatus: () => invoke({ op: "gitStatus" }) as Promise<string>,
    clusterStatus: () =>
      invoke({ op: "clusterStatus" }) as Promise<ClientClusterStatus>,
    listPeers: () => invoke({ op: "listPeers" }) as Promise<ClientPeerInfo[]>,
    teamJobs: () => invoke({ op: "teamJobs" }) as Promise<ClientTeamJob[]>,
    scoreboardSummary: () =>
      invoke({ op: "scoreboardSummary" }) as Promise<ClientScoreboardEntry[]>,
    listSessions: () =>
      invoke({ op: "listSessions" }) as Promise<ClientSessionSummary[]>,
    subscribeDiscovery: async (listener) => {
      let lastLen = 0;
      const poll = async (): Promise<void> => {
        const snapshot = (await invoke({
          op: "discoverySnapshot",
        })) as ClientDiscoveryEvent[];
        for (let i = lastLen; i < snapshot.length; i += 1) {
          listener(snapshot[i]!);
        }
        lastLen = snapshot.length;
      };
      await poll();
      const timer = setInterval(() => {
        void poll().catch(() => {
          //
        });
      }, 4000);
      return () => clearInterval(timer);
    },
  };
}
