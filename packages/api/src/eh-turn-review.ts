export interface EhTurnReviewFile {
  path: string;
  status: "modified" | "added" | "deleted";
  diff?: string;
  /** Runtime-observed files are safe to revert; workspace-detected files are review-only. */
  attribution?: "runtime" | "workspace";
  revertible?: boolean;
}

export interface EhTurnReview {
  turnId: string;
  chatId?: string;
  checkpointId: string;
  files: EhTurnReviewFile[];
  canRevert: boolean;
  revertBlockedReason?: string;
}

export interface EhRevertTurnResult {
  reverted: boolean;
  files: string[];
  conflicts?: string[];
  reason?: string;
}

export interface EhAcceptTurnReviewResult {
  accepted: boolean;
  remainingFiles: number;
  cleared?: boolean;
}
