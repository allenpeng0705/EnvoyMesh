import type { LocalPeerDirectoryStore } from "@envoymesh/local-store";
import type { NodeArgs } from "./args.js";

const OWNER_ID_PREFIX = "envoy:owner:";

export async function resolveNodeArgsTargetsByOwnerId(
  args: NodeArgs,
  store: LocalPeerDirectoryStore,
): Promise<NodeArgs> {
  return {
    ...args,
    pingTarget: await resolveTarget(args.pingTarget, store),
    signalTarget: await resolveTarget(args.signalTarget, store),
    knowledgeQueryTarget: await resolveTarget(args.knowledgeQueryTarget, store),
    bondRequestTarget: await resolveTarget(args.bondRequestTarget, store),
    discoveryRequestTarget: await resolveTarget(args.discoveryRequestTarget, store),
    taskMandateTarget: await resolveTarget(args.taskMandateTarget, store),
    taskProposeTarget: await resolveTarget(args.taskProposeTarget, store),
    taskCancelTarget: await resolveTarget(args.taskCancelTarget, store),
    reportCreateTarget: await resolveTarget(args.reportCreateTarget, store),
  };
}

async function resolveTarget(
  target: string | undefined,
  store: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  if (!target || !target.startsWith(OWNER_ID_PREFIX)) {
    return target;
  }
  const record = await store.getPeerByOwnerId(target);
  if (!record) {
    throw new Error(`No LAN peer mapping found for owner target: ${target}`);
  }
  return record.peerId;
}
