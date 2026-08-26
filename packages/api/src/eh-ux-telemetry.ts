export type EhUxTelemetryAction =
  | "review_opened"
  | "revert_attempted"
  | "revert_completed"
  | "revert_conflicted"
  | "search_used"
  | "command_rail_used";

export interface EhUxTelemetryEvent {
  action: EhUxTelemetryAction;
  surface: "social" | "envoygo" | "terminal";
  outcome?: "success" | "conflict" | "unavailable" | "cancelled";
  /** Slash verb only; never arguments, prompts, paths, or file contents. */
  command?: string;
  resultCount?: number;
  occurredAt: string;
}
