/**
 * Phase G / 12b — resolve which engine backs the Pi RPC surface.
 *
 * `sendToPi` / `getPiStatus` / `pi:proposal` stay stable for EnvoyGo;
 * only the node-side destination switches.
 */

import type { PiSettings } from "@envoymesh/api";

export type PiCodingBackend = "pi" | "envoy-harness";

export function resolvePiCodingBackend(
  piSettings: PiSettings | undefined | null,
): PiCodingBackend {
  return piSettings?.codingBackend === "envoy-harness"
    ? "envoy-harness"
    : "pi";
}
