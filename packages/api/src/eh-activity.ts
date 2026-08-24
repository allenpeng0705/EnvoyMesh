/** Live tool / model progress during an Envoy Harness turn (`session/activity`). */

export interface EhActivityEvent {
  kind: string;
  summary: string;
  toolName?: string;
  ts?: string;
}
