/**
 * Cross-view flag for an in-flight Envoy AI turn.
 * App keeps the assistant tree mounted (hidden) while this is true so
 * navigating away does not tear down the wait / live chat:message handlers.
 */

type Listener = () => void;

let inflight = false;
const listeners = new Set<Listener>();

export function getEnvoyAiInflight(): boolean {
  return inflight;
}

export function setEnvoyAiInflight(next: boolean): void {
  if (inflight === next) return;
  inflight = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

export function subscribeEnvoyAiInflight(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
