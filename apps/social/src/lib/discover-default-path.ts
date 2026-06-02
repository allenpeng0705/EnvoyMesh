import type { NodeConfig } from "@envoymesh/api";

export type DiscoverPath = "nearby" | "code" | "wider";

export function resolveDiscoverDefaultPath(_nodeConfig: NodeConfig | null | undefined): DiscoverPath {
  return "wider";
}
