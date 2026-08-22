/**
 * Round 3 — federation: merge standalone `PeerScoreboard` records (the
 * shared `VerdictEntry` schema) into the mesh's arbitration store, so
 * standalone verification feeds the mesh reputation ledger.
 */

import type { VerdictEntry } from "@envoymesh/protocol";

import {
  recordVerdictEntry,
  type ArbitrationStore,
} from "../chain-arbitration.js";

export function federatePeerScoreboard(
  store: ArbitrationStore,
  entries: readonly VerdictEntry[],
): ArbitrationStore {
  let next = store;
  for (const entry of entries) {
    next = recordVerdictEntry(next, entry);
  }
  return next;
}
