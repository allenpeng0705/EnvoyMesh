import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
/** Mirrors {@link import("@envoymesh/api").ContactAutoReplyLimitState} — kept local to avoid a package cycle. */
export interface ContactAutoReplyLimitState {
  hourlySentAt: number[];
  dailyDateKey: string;
  dailyCount: number;
  pausedReason?: "hourly_cap" | "daily_cap" | "thread_paused";
  pausedAt?: string;
}

const FILE_NAME = "auto-reply-limits.json";

interface AutoReplyLimitFile {
  version: "0.1";
  contacts: Record<string, ContactAutoReplyLimitState>;
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export interface AutoReplyLimitStore {
  get(contactOwnerId: string): Promise<ContactAutoReplyLimitState | undefined>;
  set(contactOwnerId: string, state: ContactAutoReplyLimitState): Promise<void>;
  clearPause(contactOwnerId: string): Promise<void>;
}

export function createAutoReplyLimitStore(profileDir: string): AutoReplyLimitStore {
  const filePath = join(profileDir, FILE_NAME);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<AutoReplyLimitFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as AutoReplyLimitFile;
      if (parsed.version !== "0.1" || typeof parsed.contacts !== "object") {
        return { version: "0.1", contacts: {} };
      }
      return parsed;
    } catch (error) {
      if (isMissing(error)) return { version: "0.1", contacts: {} };
      throw error;
    }
  }

  async function writeFileAtomic(data: AutoReplyLimitFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(tmp, filePath);
  }

  function enqueueWrite(task: () => Promise<void>): Promise<void> {
    const done = writeChain.then(task);
    writeChain = done.then(
      () => {},
      () => {},
    );
    return done;
  }

  return {
    async get(contactOwnerId) {
      const file = await loadFile();
      return file.contacts[contactOwnerId];
    },

    async set(contactOwnerId, state) {
      await enqueueWrite(async () => {
        const file = await loadFile();
        file.contacts[contactOwnerId] = state;
        await writeFileAtomic(file);
      });
    },

    async clearPause(contactOwnerId) {
      await enqueueWrite(async () => {
        const file = await loadFile();
        const cur = file.contacts[contactOwnerId];
        if (!cur) return;
        file.contacts[contactOwnerId] = {
          ...cur,
          pausedReason: undefined,
          pausedAt: undefined,
        };
        await writeFileAtomic(file);
      });
    },
  };
}
