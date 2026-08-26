/** Live tool / model progress during an Envoy Harness turn (`session/activity`). */

export interface EhActivityEvent {
  activityId?: string;
  turnId?: string;
  kind: string;
  summary: string;
  toolName?: string;
  ts?: string;
  chatId?: string;
  status?: "running" | "succeeded" | "failed" | "cancelled";
}
