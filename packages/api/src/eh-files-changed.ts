/**
 * Files touched during an Envoy Harness turn (review UX).
 */

export interface EhFilesChangedEvent {
  turnId: string;
  /** Project-relative or absolute paths touched this turn. */
  files: string[];
  /** Sidebar chat thread that owns this turn (parallel per-chat turns). */
  chatId?: string;
}
