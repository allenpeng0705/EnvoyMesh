/**
 * Node-side wiring seam for the Pi adapter (Sprint 3, first cut).
 *
 * The `PiAdapter` in `@envoymesh/agent-adapter` is runtime-agnostic; the
 * host injects `runPi` / `isReady` / `signResult`. This module bridges the
 * node's existing Pi runtime surface (`PiRuntime.prompt`, exposed via
 * `askPiViaRuntime` in `node-service-pi.ts`) into that contract.
 *
 * **Trace limitation (by design):** `PiPromptResult` exposes a tool-call
 * *count* but not tool names, so the live path produces results without a
 * tool trace. The Pi verifier then passes with `confidence: "low"` instead
 * of running loop / command-sequence checks. When the Pi runtime exposes
 * the trace (future), extend `promptTrace` to collect it.
 *
 * Design doc: `docs/improving-agent-network.en.md` §5.3.
 */

import { PiAdapter, type PiAdapterInput, type PiRunResult } from "@envoymesh/agent-adapter";
import type { PiPromptResult } from "@envoymesh/api";

export interface PiMapHost {
  /** One-shot prompt — mirrors `askPiViaRuntime(state, deps, prompt)`. */
  prompt: (prompt: string) => Promise<PiPromptResult>;
  /** Readiness probe — mirrors `isPiReadyViaRuntime(state)`. */
  isReady: () => boolean;
  /** The node's agent peerId; stamped into every result. */
  workerPeerId: string;
  /** Sign an unsigned `AgentResult` with the node-controlled signing key. */
  signResult: PiAdapterInput["signResult"];
  /** Pi version for the manifest. */
  runtimeVersion?: string | (() => string | Promise<string>);
}

export function createPiAdapterFromHost(host: PiMapHost): PiAdapter {
  return new PiAdapter({
    isReady: host.isReady,
    workerPeerId: host.workerPeerId,
    signResult: host.signResult,
    runtimeVersion: host.runtimeVersion,
    runPi: async ({ prompt }) => {
      const r = await host.prompt(prompt);
      const summary = r.text.trim();
      const run: PiRunResult = {
        summary: r.cancelled && !summary ? "(cancelled)" : summary,
      };
      return run;
    },
  });
}
