/**
 * Minimal action journal for `/undo` — one stack per agent session.
 */
import { promises as fs } from "node:fs";
export class ActionJournal {
    stack = [];
    push(entry) {
        this.stack.push(entry);
    }
    canUndo() {
        return this.stack.length > 0;
    }
    pop() {
        return this.stack.pop();
    }
    clear() {
        this.stack.length = 0;
    }
    /** Restore the last journaled file change. */
    async undoLast() {
        const entry = this.pop();
        if (entry === undefined) {
            throw new Error("nothing to undo");
        }
        if (entry.previousContent === null) {
            await fs.unlink(entry.path);
            return { path: entry.path, action: "removed" };
        }
        await fs.writeFile(entry.path, entry.previousContent, "utf8");
        return { path: entry.path, action: "restored" };
    }
}
//# sourceMappingURL=action-journal.js.map