/**
 * Envoy Harness turn-end follow-ups and deferred tasks.
 */

export interface EhDeferredTask {
  task: string;
  reason: string;
}

export interface EhTurnHintsEvent {
  followUps?: string[];
  deferred?: EhDeferredTask[];
}
