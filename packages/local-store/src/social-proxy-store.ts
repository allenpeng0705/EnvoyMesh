import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const FILE_NAME = "social-proxy-sessions.json";

export type SocialProxySessionStatus =
  | "discovered"
  | "syncing"
  | "intro_proposed"
  | "awaiting_peer"
  | "commitment_ready"
  | "hello_pending"
  | "hello_sent"
  | "chatting"
  | "owner_review"
  | "bonded"
  | "declined"
  | "expired"
  | "cancelled";

/** Persisted session shape — matches @envoymesh/api SocialProxySession. */
export interface SocialProxySessionRecord {
  sessionId: string;
  correlationId: string;
  postureRef: string;
  candidateOwnerId?: string;
  candidatePeerId?: string;
  candidateAgentPeerId?: string;
  introProposalMessageId?: string;
  ownerCommitmentRef?: string;
  status: SocialProxySessionStatus;
  trustPathSummary?: string;
  lastAgentChatAt?: string;
  introCountToday?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface SocialProxySessionStore {
  list(): Promise<SocialProxySessionRecord[]>;
  get(sessionId: string): Promise<SocialProxySessionRecord | undefined>;
  save(session: SocialProxySessionRecord): Promise<void>;
  saveAll(sessions: SocialProxySessionRecord[]): Promise<void>;
}

interface SessionFile {
  version: "0.1";
  sessions: SocialProxySessionRecord[];
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function createSocialProxySessionStore(profileDir: string): SocialProxySessionStore {
  const filePath = join(profileDir, FILE_NAME);
  let writeChain: Promise<void> = Promise.resolve();

  async function loadFile(): Promise<SessionFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as SessionFile;
      if (parsed.version !== "0.1" || !Array.isArray(parsed.sessions)) {
        return { version: "0.1", sessions: [] };
      }
      return parsed;
    } catch (error) {
      if (isMissing(error)) return { version: "0.1", sessions: [] };
      throw error;
    }
  }

  async function writeFileAtomic(data: SessionFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp`;
    const payload = JSON.stringify(data, null, 2);
    await writeFile(tmp, payload, { mode: 0o600 });
    try {
      await rename(tmp, filePath);
    } catch (error) {
      // Race: a test cleanup (or parallel writer) deleted the .tmp file
      // between writeFile and rename. ENOENT on the rename means the tmp
      // is already gone — fall back to writing directly to the destination
      // (best effort, swallowing a second ENOENT if the dir itself was rm'd).
      if (
        error instanceof Error &&
        "code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        try {
          await writeFile(filePath, payload, { mode: 0o600 });
        } catch (fallbackError) {
          if (isMissing(fallbackError)) return;
          throw fallbackError;
        }
        return;
      }
      throw error;
    }
  }

  return {
    async list() {
      const file = await loadFile();
      return file.sessions;
    },
    async get(sessionId) {
      const file = await loadFile();
      return file.sessions.find((s) => s.sessionId === sessionId);
    },
    async save(session) {
      const run = async () => {
        const file = await loadFile();
        const idx = file.sessions.findIndex((s) => s.sessionId === session.sessionId);
        if (idx >= 0) file.sessions[idx] = session;
        else file.sessions.push(session);
        await writeFileAtomic(file);
      };
      writeChain = writeChain.then(run, run);
      await writeChain;
    },
    async saveAll(sessions) {
      const run = async () => {
        await writeFileAtomic({ version: "0.1", sessions });
      };
      writeChain = writeChain.then(run, run);
      await writeChain;
    },
  };
}
