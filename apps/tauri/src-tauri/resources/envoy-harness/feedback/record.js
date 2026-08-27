/**
 * Phase D / Item 16 — append-only feedback event store.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as path from "node:path";
/**
 * Create an append-only feedback store. Events are never
 * mutated or deleted (immutability contract).
 */
export function createFeedbackStore(options) {
    const logPath = path.join(options.dir, "feedback.jsonl");
    let chain = Promise.resolve();
    async function ensureDir() {
        await fs.mkdir(options.dir, { recursive: true });
    }
    async function readAll() {
        try {
            const raw = await fs.readFile(logPath, "utf8");
            const out = [];
            for (const line of raw.split("\n")) {
                if (line.length === 0)
                    continue;
                out.push(JSON.parse(line));
            }
            return out;
        }
        catch (err) {
            if (err.code === "ENOENT")
                return [];
            throw err;
        }
    }
    return {
        logPath,
        async record(input) {
            await ensureDir();
            const event = {
                id: randomUUID(),
                ts: new Date().toISOString(),
                sessionId: input.sessionId,
                polarity: input.polarity,
                ...(input.messageIndex !== undefined
                    ? { messageIndex: input.messageIndex }
                    : {}),
                ...(input.note !== undefined ? { note: input.note } : {}),
                ...(input.score !== undefined ? { score: input.score } : {}),
            };
            const line = JSON.stringify(event) + "\n";
            chain = chain.then(() => fs.writeFile(logPath, line, { encoding: "utf8", flag: "a" }));
            await chain;
            return event;
        },
        async list(sessionId) {
            const all = await readAll();
            if (sessionId === undefined)
                return all;
            return all.filter((e) => e.sessionId === sessionId);
        },
    };
}
/**
 * Map feedback events to self-evolve signals.
 * **Contamination guard:** raw `note` text is never included.
 */
export function toSelfEvolveSignals(events) {
    return events.map((e) => {
        const score = e.score ??
            (e.polarity === "up" ? 1 : e.polarity === "down" ? -1 : 0);
        const signal = {
            polarity: e.polarity,
            score,
            sessionId: e.sessionId,
            ts: e.ts,
        };
        if (e.messageIndex !== undefined) {
            signal.messageIndex = e.messageIndex;
        }
        return signal;
    });
}
//# sourceMappingURL=record.js.map