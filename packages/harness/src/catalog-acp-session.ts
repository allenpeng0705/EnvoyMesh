/**
 * Minimal ACP stdio session for catalog CLIs (JSON-RPC over NDJSON).
 *
 * Same wire as EnvoyCoder: newline-delimited JSON both ways. Content-Length
 * is still accepted on read for older mocks; agents (cursor / codex /
 * codewhale / envoy-harness) speak NDJSON.
 *
 * Permissions honor `permissionPolicy` (default safe-only). Without a Mesh
 * dock, tools that would require a prompt are cancelled — never silent Full.
 * `session/user_question` (ask_user) waits on `onUserQuestion` when present;
 * otherwise the question is cancelled. fs/read and fs/write stay under cwd.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
import { getCodingProvider } from "@envoymesh/api";
import {
  denyOptionId,
  extractCatalogAcpToolRequest,
  shouldAutoAllowCatalogPermission,
  type CatalogPermissionPolicy,
  type CatalogToolRequest,
} from "./catalog-acp-policy.js";
import {
  catalogUserQuestionReply,
  extractCatalogUserQuestion,
  type CatalogUserQuestion,
  type CatalogUserQuestionAnswer,
} from "./catalog-acp-user-question.js";
import { InstallMissingError } from "./daemon-supervisor.js";
import {
  augmentPathForExtAgentBins,
  resolveExtAgentBinary,
} from "./resolve-ext-agent-binary.js";

export type CatalogAcpSessionOpts = {
  command: string;
  args: string[];
  cwd: string;
  prompt: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  installHint?: string;
  onDelta?: (chunk: string) => void;
  /** Default `safe-only` — never silent Full access. */
  permissionPolicy?: CatalogPermissionPolicy;
  /**
   * Ask the human before a tool the policy does not already cover.
   *
   * **Absent means cancel, never allow.** A caller without a dock (the HTTP server, a
   * headless run) must leave this undefined; the session then cancels the tool, which is
   * the behaviour that existed before a dock could answer.
   */
  onPermissionRequest?: (req: CatalogToolRequest) => Promise<boolean>;
  /**
   * Answer `session/user_question` (model `ask_user`).
   *
   * **Absent means cancel.** One / many / free-text are all handled by the dock;
   * this callback returns the settled answer for the ACP reply body.
   */
  onUserQuestion?: (
    req: CatalogUserQuestion,
  ) => Promise<CatalogUserQuestionAnswer>;
};

/** NDJSON frame — EnvoyCoder / ACP agents. */
function encodeRpc(msg: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(msg)}\n`, "utf8");
}

/** Agents may echo request ids as number or string (codewhale). */
function pendingKey(id: unknown): number | undefined {
  if (typeof id === "number" && Number.isFinite(id)) return id;
  if (typeof id === "string" && /^\d+$/.test(id.trim())) return Number(id.trim());
  return undefined;
}

function pathInsideCwd(cwd: string, filePath: string): string | null {
  const abs = isAbsolute(filePath) ? resolve(filePath) : resolve(cwd, filePath);
  const rel = relative(resolve(cwd), abs);
  if (!rel || rel.startsWith("..") || rel === "..") return null;
  if (normalize(abs).includes("\0")) return null;
  return abs;
}

function allowOptionId(options: unknown): string | undefined {
  if (!Array.isArray(options) || options.length === 0) return undefined;
  const ids = options
    .map((o) =>
      o && typeof o === "object" && "optionId" in o
        ? String((o as { optionId: unknown }).optionId)
        : "",
    )
    .filter(Boolean);
  const prefer = ids.find((id) =>
    /allow|approve|accept|once/i.test(id),
  );
  return prefer ?? ids[0];
}

class RpcFramer {
  private buf = Buffer.alloc(0);
  private ndjson: boolean | undefined;
  readonly messages: unknown[] = [];

  push(chunk: Buffer): unknown[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: unknown[] = [];
    if (this.ndjson === undefined) {
      const s = this.buf.toString("utf8");
      if (s.startsWith("{") || s.startsWith("[")) this.ndjson = true;
      else if (/content-length:/i.test(s)) this.ndjson = false;
      else return out;
    }
    if (this.ndjson) {
      while (true) {
        const nl = this.buf.indexOf(0x0a);
        if (nl < 0) break;
        const line = this.buf.subarray(0, nl).toString("utf8").trim();
        this.buf = this.buf.subarray(nl + 1);
        if (!line) continue;
        try {
          out.push(JSON.parse(line) as unknown);
        } catch {
          // incomplete / log line
        }
      }
      return out;
    }
    while (true) {
      const headerEnd = this.buf.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = this.buf.subarray(0, headerEnd).toString("utf8");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.buf = this.buf.subarray(headerEnd + 4);
        continue;
      }
      const len = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buf.length < start + len) break;
      const body = this.buf.subarray(start, start + len).toString("utf8");
      this.buf = this.buf.subarray(start + len);
      try {
        out.push(JSON.parse(body) as unknown);
      } catch {
        // ignore
      }
    }
    return out;
  }
}

export async function runCatalogAcpPrompt(
  opts: CatalogAcpSessionOpts,
): Promise<string> {
  const cwd = opts.cwd.trim();
  if (!cwd) throw new Error("catalog ACP: cwd required");
  const resolvedCmd = resolveExtAgentBinary(opts.command) ?? opts.command;
  const env = augmentPathForExtAgentBins({
    ...process.env,
    ...(opts.env ?? {}),
  });
  const timeoutMs = opts.timeoutMs ?? 900_000;

  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(resolvedCmd, opts.args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      throw new InstallMissingError({
        command: opts.command,
        reason: "spawn-enoent",
        installHint: opts.installHint ?? `Install \`${opts.command}\`.`,
      });
    }
    throw err;
  }

  const framer = new RpcFramer();
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  let assistant = "";
  let childErr = "";

  const send = (msg: Record<string, unknown>) => {
    proc.stdin.write(encodeRpc(msg));
  };

  const request = (method: string, params: unknown) =>
    new Promise<unknown>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });

  const onMsg = async (msg: unknown) => {
    if (!msg || typeof msg !== "object") return;
    const m = msg as Record<string, unknown>;
    const replyId = pendingKey(m.id);
    if (replyId !== undefined && pending.has(replyId) && m.method == null) {
      const p = pending.get(replyId);
      pending.delete(replyId);
      if (m.error) {
        p?.reject(
          new Error(
            `ACP ${JSON.stringify(m.error)}`,
          ),
        );
      } else {
        p?.resolve(m.result);
      }
      return;
    }
    if (typeof m.method === "string" && m.id != null) {
      const method = m.method;
      const params = (m.params ?? {}) as Record<string, unknown>;
      let result: unknown = {};
      try {
        if (method === "session/request_permission") {
          const policy = opts.permissionPolicy ?? "safe-only";
          // Covered by the policy → run it. Otherwise a human decides, if anyone can be
          // asked; a caller with no dock cancels rather than allowing silently.
          const covered = shouldAutoAllowCatalogPermission(policy, params);
          const allow =
            covered || opts.onPermissionRequest === undefined
              ? covered
              : await opts.onPermissionRequest(extractCatalogAcpToolRequest(params));
          if (allow) {
            const optionId = allowOptionId(params.options);
            result = optionId
              ? { outcome: { outcome: "selected", optionId } }
              : { outcome: { outcome: "cancelled" } };
          } else {
            const optionId = denyOptionId(params.options);
            result = optionId
              ? { outcome: { outcome: "selected", optionId } }
              : { outcome: { outcome: "cancelled" } };
          }
        } else if (method === "session/user_question") {
          const question = extractCatalogUserQuestion(params);
          const answer =
            opts.onUserQuestion === undefined
              ? null
              : await opts.onUserQuestion(question);
          result = catalogUserQuestionReply(question, answer);
        } else if (method === "fs/read_text_file") {
          const path = String(params.path ?? "");
          const abs = pathInsideCwd(cwd, path);
          if (!abs) throw new Error("path outside project");
          result = { content: await readFile(abs, "utf8") };
        } else if (method === "fs/write_text_file") {
          const path = String(params.path ?? "");
          const abs = pathInsideCwd(cwd, path);
          if (!abs) throw new Error("path outside project");
          await mkdir(dirname(abs), { recursive: true });
          await writeFile(abs, String(params.content ?? ""), "utf8");
          result = {};
        } else {
          result = {};
        }
        send({ jsonrpc: "2.0", id: m.id, result });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id: m.id,
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : String(err),
          },
        });
      }
      return;
    }
    if (m.method === "session/update") {
      const params = (m.params ?? {}) as Record<string, unknown>;
      const update = (params.update ?? params) as Record<string, unknown>;
      const sessionUpdate = String(update.sessionUpdate ?? update.type ?? "");
      const chunk =
        (typeof update.text === "string" && update.text) ||
        (update.content &&
        typeof update.content === "object" &&
        "text" in update.content
          ? String((update.content as { text?: unknown }).text ?? "")
          : "") ||
        "";
      if (
        chunk &&
        (sessionUpdate.includes("agent_message") ||
          sessionUpdate.includes("message") ||
          sessionUpdate === "agent_message_chunk")
      ) {
        assistant += chunk;
        opts.onDelta?.(chunk);
      }
    }
  };

  proc.stdout.on("data", (chunk: Buffer) => {
    for (const msg of framer.push(Buffer.from(chunk))) {
      void onMsg(msg);
    }
  });
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (s: string) => {
    childErr += s;
  });

  const killed = new Promise<never>((_, reject) => {
    proc.on("error", (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") {
        reject(
          new InstallMissingError({
            command: opts.command,
            reason: "spawn-enoent",
            installHint: opts.installHint ?? `Install \`${opts.command}\`.`,
          }),
        );
        return;
      }
      reject(err);
    });
    proc.on("close", (code) => {
      if (pending.size > 0) {
        reject(
          new Error(
            `ACP process exited (code=${code ?? -1})${childErr.trim() ? `: ${childErr.trim().slice(0, 400)}` : ""}`,
          ),
        );
      }
    });
  });

  const timer = setTimeout(() => {
    try {
      proc.kill("SIGKILL");
    } catch {
      // gone
    }
  }, timeoutMs);
  timer.unref?.();

  try {
    await Promise.race([
      (async () => {
        await request("initialize", {
          protocolVersion: 1,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
          },
          clientInfo: { name: "envoymesh", version: "0.5.0" },
        });
        const created = (await request("session/new", {
          cwd,
          mcpServers: [],
        })) as { sessionId?: string };
        const sessionId = created?.sessionId || randomUUID();
        await request("session/prompt", {
          sessionId,
          prompt: [{ type: "text", text: opts.prompt }],
        });
      })(),
      killed,
    ]);
  } finally {
    clearTimeout(timer);
    try {
      proc.stdin.end();
    } catch {
      // ignore
    }
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }

  const text = assistant.trim();
  if (!text) {
    throw new Error(
      childErr.trim()
        ? `ACP returned no assistant text: ${childErr.trim().slice(0, 400)}`
        : "ACP returned no assistant text",
    );
  }
  return text;
}

/**
 * Model ids an ACP `session/new` configOptions list actually published.
 *
 * Same rule as EnvoyCoder: bare ids (`haiku`, `gpt-5.5`) stay bare; DeepSeek's
 * opaque JSON pair becomes `provider/model`. Anything we cannot take apart is
 * dropped — never replaced with a list we invented.
 */
export function sessionModelIdsFromConfigOptions(
  raw: unknown,
  shape: "bare-id" | "json-pair",
): string[] {
  const option = findModelOption(raw);
  const values = flattenSelectValues(option);
  const current =
    option && typeof option === "object"
      ? (option as { currentValue?: unknown }).currentValue
      : undefined;
  if (typeof current === "string" && current.trim()) {
    values.unshift(current.trim());
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = decodeSessionModelValue(value, shape);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function findModelOption(raw: unknown): unknown {
  if (!Array.isArray(raw)) return undefined;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const option = entry as { id?: unknown; category?: unknown; type?: unknown };
    if (option.type !== undefined && option.type !== "select") continue;
    if (option.category === "model" || option.id === "model") return option;
  }
  return undefined;
}

function flattenSelectValues(option: unknown): string[] {
  if (!option || typeof option !== "object") return [];
  const options = (option as { options?: unknown }).options;
  return collectSelectValues(options);
}

function collectSelectValues(raw: unknown, depth = 0): string[] {
  if (!Array.isArray(raw) || depth > 4) return [];
  const out: string[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as { value?: unknown; options?: unknown };
    if (Array.isArray(item.options)) {
      out.push(...collectSelectValues(item.options, depth + 1));
      continue;
    }
    if (typeof item.value === "string" && item.value.trim()) out.push(item.value);
  }
  return out;
}

function decodeSessionModelValue(
  value: string,
  shape: "bare-id" | "json-pair",
): string | undefined {
  if (shape === "bare-id") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) return undefined;
    const provider = parsed[0];
    const model = parsed[1];
    if (typeof provider !== "string" || typeof model !== "string") return undefined;
    if (!provider || !model) return undefined;
    return `${provider}/${model}`;
  } catch {
    return undefined;
  }
}

type ModelProbeSpec = {
  command: string;
  args: string[];
  shape: "bare-id" | "json-pair";
};

/** How EnvoyCoder opens a session to read that agent's model option. */
function modelProbeSpec(agentId: string): ModelProbeSpec | null {
  switch (agentId) {
    case "claudecode":
      return { command: "claude-agent-acp", args: [], shape: "bare-id" };
    case "codex":
      return { command: "codex-acp", args: [], shape: "bare-id" };
    case "cursor":
      return { command: "cursor-agent", args: ["acp"], shape: "bare-id" };
    case "deepseek-harness":
    case "deepseek-tui":
    case "codewhale":
      return {
        command: "codewhale",
        args: ["serve", "--acp"],
        shape: "json-pair",
      };
    case "copilot":
      return { command: "copilot", args: ["--acp"], shape: "bare-id" };
    case "opencode":
      return { command: "opencode", args: ["acp"], shape: "bare-id" };
    default: {
      const entry = getCodingProvider(agentId);
      if (!entry) return null;
      const [command, ...args] = entry.command;
      if (!command || command === "npx" || command === "uvx") return null;
      const speaksAcp = args.some((arg) => arg === "acp" || arg === "--acp");
      if (!speaksAcp) return null;
      return { command, args: [...args], shape: "bare-id" };
    }
  }
}

const MODEL_PROBE_MS = 7_000;
const MODEL_PROBE_CACHE_MS = 10 * 60_000;
const modelProbeCache = new Map<string, { at: number; models: string[] }>();

/**
 * Ask one installed agent which models it publishes, the way EnvoyCoder does:
 * `initialize` → `session/new` → read the `model` option → stop.
 *
 * `null` means this agent is not one we ask (Envoy Harness uses Settings / EnvoyLocal).
 * `[]` means we asked and it published nothing, or the program is not installed.
 * A missing program is not filled in with a guessed list.
 *
 * CodeWhale / DeepSeek: ACP often returns only `{sessionId}` (no configOptions).
 * Fall back to `codewhale models` — the live list from the same binary.
 */
export async function probeCodingAgentModels(
  agentId: string,
): Promise<string[] | null> {
  const id = agentId.trim();
  const spec = modelProbeSpec(id);
  if (!spec) return null;
  const key = `${spec.command}\0${spec.args.join("\0")}`;
  const hit = modelProbeCache.get(key);
  if (hit && Date.now() - hit.at < MODEL_PROBE_CACHE_MS) return hit.models;
  const binary = resolveExtAgentBinary(spec.command);
  if (!binary) {
    modelProbeCache.set(key, { at: Date.now(), models: [] });
    return [];
  }
  let models = await readAcpSessionModelIds(binary, spec);
  if (
    models.length === 0 &&
    (id === "codewhale" || id === "deepseek-harness" || id === "deepseek-tui")
  ) {
    models = await listCodewhaleModelsViaCli(binary);
  }
  modelProbeCache.set(key, { at: Date.now(), models });
  return models;
}

/**
 * Parse `codewhale models` stdout.
 * Lines look like `  deepseek-flash (deepseek)` or `* deepseek-v4-pro (deepseek)`.
 */
export function parseCodewhaleModelsCli(stdout: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const m = /^\s*\*?\s*([^\s(]+)\s*\(([^)]+)\)\s*$/.exec(line);
    if (!m) continue;
    const model = m[1]!.trim();
    const provider = m[2]!.trim();
    if (!model || !provider) continue;
    const id = `${provider}/${model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  const defaultMatch = /default:\s*([^\s)]+)/i.exec(stdout);
  const defaultModel = defaultMatch?.[1]?.trim();
  if (defaultModel) {
    const idx = out.findIndex(
      (id) => id === defaultModel || id.endsWith(`/${defaultModel}`),
    );
    if (idx > 0) {
      const [row] = out.splice(idx, 1);
      out.unshift(row!);
    }
  }
  return out;
}

async function listCodewhaleModelsViaCli(binary: string): Promise<string[]> {
  return new Promise((resolve) => {
    let stdout = "";
    let settled = false;
    const done = (models: string[]) => {
      if (settled) return;
      settled = true;
      resolve(models);
    };
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(binary, ["models"], {
        cwd: tmpdir(),
        env: augmentPathForExtAgentBins({ ...process.env }),
        stdio: ["ignore", "pipe", "pipe"],
      }) as unknown as ChildProcessWithoutNullStreams;
    } catch {
      done([]);
      return;
    }
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        // gone
      }
      done(parseCodewhaleModelsCli(stdout));
    }, 5_000);
    timer.unref?.();
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.on("error", () => {
      clearTimeout(timer);
      done([]);
    });
    proc.on("close", () => {
      clearTimeout(timer);
      done(parseCodewhaleModelsCli(stdout));
    });
  });
}

async function readAcpSessionModelIds(
  binary: string,
  spec: ModelProbeSpec,
): Promise<string[]> {
  let proc: ChildProcessWithoutNullStreams;
  try {
    proc = spawn(binary, spec.args, {
      cwd: tmpdir(),
      env: augmentPathForExtAgentBins({ ...process.env }),
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcessWithoutNullStreams;
  } catch {
    return [];
  }
  const framer = new RpcFramer();
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  const send = (msg: Record<string, unknown>) => {
    try {
      proc.stdin.write(encodeRpc(msg));
    } catch {
      // stdin already closed
    }
  };
  const request = (method: string, params: unknown) =>
    new Promise<unknown>((resolvePromise, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolvePromise, reject });
      send({ jsonrpc: "2.0", id, method, params });
    });
  proc.stdout.on("data", (chunk: Buffer) => {
    for (const msg of framer.push(chunk)) {
      if (!msg || typeof msg !== "object") continue;
      const rec = msg as {
        id?: unknown;
        result?: unknown;
        error?: { message?: string };
      };
      const key = pendingKey(rec.id);
      if (key === undefined) continue;
      const waiter = pending.get(key);
      if (!waiter) continue;
      pending.delete(key);
      if (rec.error) waiter.reject(new Error(rec.error.message || "ACP error"));
      else waiter.resolve(rec.result);
    }
  });
  const failPending = (err: Error) => {
    for (const waiter of pending.values()) waiter.reject(err);
    pending.clear();
  };
  proc.on("error", () => {
    failPending(new Error("ACP model probe could not start"));
  });
  const timer = setTimeout(() => {
    failPending(new Error("ACP model probe timed out"));
    try {
      proc.kill("SIGKILL");
    } catch {
      // gone
    }
  }, MODEL_PROBE_MS);
  timer.unref?.();
  try {
    await request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: "envoymesh", version: "0.5.0" },
    });
    const created = (await request("session/new", {
      cwd: tmpdir(),
      mcpServers: [],
    })) as { configOptions?: unknown };
    return sessionModelIdsFromConfigOptions(created?.configOptions, spec.shape);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    try {
      proc.stdin.end();
    } catch {
      // ignore
    }
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}

/** @internal tests */
export const _test = {
  encodeRpc,
  pathInsideCwd,
  allowOptionId,
  denyOptionId,
  sessionModelIdsFromConfigOptions,
  modelProbeSpec,
  parseCodewhaleModelsCli,
};
