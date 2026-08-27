/**
 * Phase D / Item 16 — per-message feedback sidecar CRUD.
 *
 * Sidecar lives next to the session JSONL as
 * `<sessionId>.feedback.json`.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
function sidecarPath(sessionFilePath) {
    if (sessionFilePath.endsWith(".jsonl")) {
        return sessionFilePath.slice(0, -".jsonl".length) + ".feedback.json";
    }
    return sessionFilePath + ".feedback.json";
}
/**
 * Open a CRUD sidecar next to a session file.
 */
export function createFeedbackSidecar(options) {
    const filePath = sidecarPath(options.sessionFilePath);
    async function readAll() {
        try {
            const raw = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed;
        }
        catch (err) {
            if (err.code === "ENOENT")
                return [];
            throw err;
        }
    }
    async function writeAll(entries) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, JSON.stringify(entries, null, 2) + "\n", "utf8");
    }
    return {
        filePath,
        async list() {
            return readAll();
        },
        async put(entry) {
            const all = await readAll();
            const updated = {
                messageIndex: entry.messageIndex,
                polarity: entry.polarity,
                updatedAt: entry.updatedAt ?? new Date().toISOString(),
                ...(entry.note !== undefined ? { note: entry.note } : {}),
                ...(entry.score !== undefined ? { score: entry.score } : {}),
            };
            const idx = all.findIndex((e) => e.messageIndex === updated.messageIndex);
            if (idx >= 0)
                all[idx] = updated;
            else
                all.push(updated);
            all.sort((a, b) => a.messageIndex - b.messageIndex);
            await writeAll(all);
            return updated;
        },
        async delete(messageIndex) {
            const all = await readAll();
            const next = all.filter((e) => e.messageIndex !== messageIndex);
            if (next.length === all.length)
                return false;
            await writeAll(next);
            return true;
        },
    };
}
//# sourceMappingURL=sidecar.js.map