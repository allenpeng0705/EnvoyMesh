/**
 * Minimal ACP stdio session for catalog CLIs (JSON-RPC + Content-Length).
 *
 * Not a full ACP host: permissions auto-select the first allow-like option;
 * fs/read and fs/write are allowed only under the task cwd.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, normalize, relative, resolve } from "node:path";
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
};

function encodeRpc(msg: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, body]);
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
    if (typeof m.id === "number" && pending.has(m.id) && m.method == null) {
      const p = pending.get(m.id);
      pending.delete(m.id);
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
          const optionId = allowOptionId(params.options);
          result = optionId
            ? { outcome: { outcome: "selected", optionId } }
            : { outcome: { outcome: "cancelled" } };
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

/** @internal tests */
export const _test = {
  encodeRpc,
  pathInsideCwd,
  allowOptionId,
};
