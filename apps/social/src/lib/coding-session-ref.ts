/** Shared Coding tab selection (EH / Pi / Ext Agent Tier B). */
import type {
  CodingHarnessId,
  CodingUiBucket,
  TerminalSessionSummary,
} from "@envoymesh/api";

export type CodingSessionRef =
  | {
      kind: "eh";
      chatId: string;
      /** Display hints for workspace shell header (optional on deep link). */
      title?: string;
      cwd?: string;
      /** Live sidebar summary bucket (refreshed with EH list). */
      uiBucket?: CodingUiBucket;
    }
  | {
      kind: "pi";
      sessionId: string;
      /** Fresh ensure/list row — prefer over terminalSessions lookup. */
      session?: TerminalSessionSummary;
    }
  | {
      kind: "ext";
      sessionId: string;
      harness: CodingHarnessId;
      cwd: string;
      title?: string;
    };

export function codingSessionKey(ref: CodingSessionRef): string {
  if (ref.kind === "eh") return `eh:${ref.chatId}`;
  if (ref.kind === "pi") return `pi:${ref.sessionId}`;
  return `ext:${ref.sessionId}`;
}

export function sameCodingSession(
  a: CodingSessionRef | null,
  b: CodingSessionRef | null,
): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "eh") return a.chatId === (b as { chatId: string }).chatId;
  if (a.kind === "pi")
    return a.sessionId === (b as { sessionId: string }).sessionId;
  return a.sessionId === (b as { sessionId: string }).sessionId;
}
