/**
 * Home-node Coding Tier B runtime store (cwd / model / compatible creds).
 * Isolated from Ext Agent bridge-config and session-model-store.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  normalizeCodingHarnessProviderKind,
  type CodingHarnessProviderKind,
} from "@envoymesh/api";

const FILE_NAME = "coding-harness-runtime.json";

export type CodingRuntimeRecord = {
  cwd: string;
  model?: string;
  providerKind?: CodingHarnessProviderKind;
  endpoint?: string;
  apiKey?: string;
  updatedAt: string;
};

type StoreFile = {
  version: 1;
  sessions: Record<string, CodingRuntimeRecord>;
};

function storePath(profileDir: string): string {
  return join(profileDir, FILE_NAME);
}

function parseRecord(raw: unknown): CodingRuntimeRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const cwd = typeof r.cwd === "string" ? r.cwd.trim() : "";
  if (!cwd) return null;
  const providerKind = normalizeCodingHarnessProviderKind(r.providerKind);
  const model =
    typeof r.model === "string" && r.model.trim() ? r.model.trim() : undefined;
  const endpoint =
    typeof r.endpoint === "string" && r.endpoint.trim()
      ? r.endpoint.trim()
      : undefined;
  const apiKey =
    typeof r.apiKey === "string" && r.apiKey.trim()
      ? r.apiKey.trim()
      : undefined;
  const updatedAt =
    typeof r.updatedAt === "string" && r.updatedAt
      ? r.updatedAt
      : new Date(0).toISOString();
  return {
    cwd,
    updatedAt,
    ...(model ? { model } : {}),
    ...(providerKind ? { providerKind } : {}),
    ...(endpoint ? { endpoint } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}

export class CodingRuntimeStore {
  private sessions = new Map<string, CodingRuntimeRecord>();
  private filePath: string | null = null;
  private initialized = false;

  async init(profileDir: string): Promise<void> {
    const path = storePath(profileDir);
    if (this.initialized && this.filePath === path) return;
    this.filePath = path;
    this.sessions.clear();
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      const rows =
        parsed?.sessions && typeof parsed.sessions === "object"
          ? parsed.sessions
          : {};
      for (const [id, row] of Object.entries(rows)) {
        const key = id.trim();
        if (!key) continue;
        const rec = parseRecord(row);
        if (rec) this.sessions.set(key, rec);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
        console.warn("[coding.runtime] failed to load store:", err);
      }
    }
    this.initialized = true;
  }

  get(codingSessionId: string): CodingRuntimeRecord | undefined {
    return this.sessions.get(codingSessionId.trim());
  }

  async set(
    codingSessionId: string,
    patch: {
      cwd: string;
      model?: string;
      providerKind?: CodingHarnessProviderKind;
      endpoint?: string;
      apiKey?: string;
    },
  ): Promise<CodingRuntimeRecord> {
    const id = codingSessionId.trim();
    if (!id) throw new Error("codingSessionId required");
    const cwd = patch.cwd.trim();
    if (!cwd) throw new Error("cwd required");
    const prev = this.sessions.get(id);
    const model = patch.model?.trim() || undefined;
    const endpoint = patch.endpoint?.trim() || undefined;
    const nextApiKey =
      typeof patch.apiKey === "string"
        ? patch.apiKey.trim() || undefined
        : prev?.apiKey;
    const providerKind = patch.providerKind ?? prev?.providerKind;
    const next: CodingRuntimeRecord = {
      cwd,
      updatedAt: new Date().toISOString(),
      ...(model ? { model } : {}),
      ...(providerKind ? { providerKind } : {}),
      ...(endpoint ? { endpoint } : {}),
      ...(nextApiKey ? { apiKey: nextApiKey } : {}),
    };
    this.sessions.set(id, next);
    await this.persist();
    return next;
  }

  async clear(codingSessionId: string): Promise<boolean> {
    const id = codingSessionId.trim();
    if (!id) return false;
    const existed = this.sessions.delete(id);
    if (existed) await this.persist();
    return existed;
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return;
    const sessions: Record<string, CodingRuntimeRecord> = {};
    for (const [id, rec] of this.sessions) {
      sessions[id] = rec;
    }
    const payload: StoreFile = { version: 1, sessions };
    const tmp = `${this.filePath}.tmp`;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(tmp, JSON.stringify(payload, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(tmp, this.filePath);
  }
}

/** Build spawn env for OpenAI / Anthropic compatible overrides. */
export function codingRuntimeToSpawnEnv(
  rec:
    | Pick<CodingRuntimeRecord, "providerKind" | "endpoint" | "apiKey">
    | null
    | undefined,
): NodeJS.ProcessEnv | undefined {
  if (!rec?.apiKey?.trim()) return undefined;
  const env: NodeJS.ProcessEnv = {};
  const key = rec.apiKey.trim();
  const endpoint = rec.endpoint?.trim();
  if (rec.providerKind === "anthropic-compatible") {
    env.ANTHROPIC_API_KEY = key;
    if (endpoint) env.ANTHROPIC_BASE_URL = endpoint;
  } else {
    env.OPENAI_API_KEY = key;
    if (endpoint) env.OPENAI_BASE_URL = endpoint;
  }
  return env;
}
