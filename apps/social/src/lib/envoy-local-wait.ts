import type { EnvoyLocalStatus } from "@envoymesh/api";

/** Wall-clock cap while polling after a detached enable/download (not per-RPC). */
export const ENVOY_LOCAL_IDLE_WAIT_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * Poll status until the node finishes a detached Envoy Local op.
 * Enable/download RPCs return immediately; progress lives on `download`.
 */
export async function waitForEnvoyLocalIdle(
  getStatus: () => Promise<EnvoyLocalStatus>,
  options?: {
    onUpdate?: (st: EnvoyLocalStatus) => void;
    intervalMs?: number;
    timeoutMs?: number;
  },
): Promise<EnvoyLocalStatus> {
  const intervalMs = options?.intervalMs ?? 1_000;
  const timeoutMs = options?.timeoutMs ?? ENVOY_LOCAL_IDLE_WAIT_TIMEOUT_MS;
  const started = Date.now();
  let st = await getStatus();
  options?.onUpdate?.(st);
  while (st.operationInProgress) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Envoy Local operation timed out after ${Math.round(timeoutMs / 60_000)} minutes. ` +
          "If the download is stuck near 100%, turn on a VPN (GitHub/Hugging Face) and retry — partial downloads resume.",
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
    st = await getStatus();
    options?.onUpdate?.(st);
  }
  return st;
}
