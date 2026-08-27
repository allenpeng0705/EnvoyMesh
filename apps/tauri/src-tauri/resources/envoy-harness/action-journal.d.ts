/**
 * Minimal action journal for `/undo` — one stack per agent session.
 */
export interface UndoEntry {
    /** Absolute path that was written or edited. */
    path: string;
    /** File content before the tool ran; `null` if the file did not exist. */
    previousContent: string | null;
}
export declare class ActionJournal {
    private readonly stack;
    push(entry: UndoEntry): void;
    canUndo(): boolean;
    pop(): UndoEntry | undefined;
    clear(): void;
    /** Restore the last journaled file change. */
    undoLast(): Promise<{
        path: string;
        action: "restored" | "removed";
    }>;
}
//# sourceMappingURL=action-journal.d.ts.map