/**
 * Resolve a Coding-tab harness to a backend (dedicated sidecar or catalog ACP).
 */

import {
  getCodingProvider,
  isCodingTierBHarness,
} from "@envoymesh/api/core";
import { createBackend } from "./backends.js";
import { createCatalogAcpBackend } from "./catalog-acp-backend.js";
import { isExtAgentSidecarKind, type ExtAgentBackend } from "./types.js";

export function createCodingHarnessBackend(harness: string): ExtAgentBackend {
  const id = harness.trim();
  if (!isCodingTierBHarness(id)) {
    throw new Error(`createCodingHarnessBackend: not a Tier B harness: ${id}`);
  }
  const entry = getCodingProvider(id);
  if (!entry) {
    throw new Error(`createCodingHarnessBackend: unknown harness ${id}`);
  }
  if (entry.sidecarKind && isExtAgentSidecarKind(entry.sidecarKind)) {
    return createBackend(entry.sidecarKind);
  }
  return createCatalogAcpBackend(entry);
}
