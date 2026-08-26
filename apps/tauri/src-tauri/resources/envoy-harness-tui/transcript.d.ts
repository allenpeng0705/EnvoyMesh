/**
 * Transcript line shown in the TUI (committed messages only).
 */
export type TranscriptRole = "user" | "assistant" | "tool" | "system" | "status";
export interface TranscriptLine {
    role: TranscriptRole;
    text: string;
    at: string;
}
export interface TranscriptFormatOptions {
    /** When false, omit ANSI (plain mode / `--no-color`). */
    useColor?: boolean;
}
/** Default cyan accent for status bar + active tab (U6a.2). */
export declare const DEFAULT_ACCENT: "\u001B[36m";
/** Role label shown in the transcript margin. */
export declare function transcriptTag(role: TranscriptRole): string;
/**
 * Format one transcript line for display (plain ANSI — no markdown engine).
 * Multi-line messages use a continued margin so code blocks and tool
 * output read like Claude Code / Codex transcripts.
 */
export declare function formatTranscriptLine(line: TranscriptLine, options?: TranscriptFormatOptions): string;
/** Render message body: light structure for tools + fenced code blocks. */
export declare function formatMessageBody(role: TranscriptRole, text: string, options?: TranscriptFormatOptions): string;
export declare function formatPermissionBlock(req: {
    toolName: string;
    description: string;
    args: unknown;
}, preview?: string, options?: TranscriptFormatOptions): string;
//# sourceMappingURL=transcript.d.ts.map