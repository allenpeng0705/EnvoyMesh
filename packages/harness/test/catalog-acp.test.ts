import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCodingHarnessBackend,
} from "../src/coding-harness-backend.js";
import { _test } from "../src/catalog-acp-session.js";
import { runCatalogAcpPrompt } from "../src/catalog-acp-session.js";

describe("catalog ACP helpers", () => {
  it("pathInsideCwd rejects escapes", () => {
    const cwd = "/Users/test/proj";
    expect(_test.pathInsideCwd(cwd, "src/a.ts")?.endsWith("/src/a.ts")).toBe(
      true,
    );
    expect(_test.pathInsideCwd(cwd, "../secret")).toBeNull();
  });

  it("prefer allow-like permission option", () => {
    expect(
      _test.allowOptionId([
        { optionId: "reject" },
        { optionId: "allow-once" },
      ]),
    ).toBe("allow-once");
  });
});

describe("createCodingHarnessBackend", () => {
  it("DeepSeek Harness uses the CodeWhale sidecar", () => {
    const backend = createCodingHarnessBackend("deepseek-harness");
    expect(backend.kind).toBe("codewhale");
    expect(backend.label.toLowerCase()).toContain("codewhale");
  });

  it("gemini uses catalog ACP backend", () => {
    const backend = createCodingHarnessBackend("gemini");
    expect(backend.kind).toBe("gemini");
    expect(backend.label).toBe("Gemini CLI");
  });
});

describe("runCatalogAcpPrompt", () => {
  it("collects assistant text from a mock ACP stdio agent", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "acp-mock-"));
    const script = join(cwd, "mock-acp.mjs");
    await writeFile(
      script,
      `
import { Buffer } from "node:buffer";
let buf = Buffer.alloc(0);
function send(msg) {
  const body = Buffer.from(JSON.stringify(msg));
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
}
process.stdin.on("data", (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const idx = buf.indexOf("\\r\\n\\r\\n");
    if (idx < 0) break;
    const header = buf.subarray(0, idx).toString("utf8");
    const m = /content-length:\\s*(\\d+)/i.exec(header);
    if (!m) { buf = buf.subarray(idx + 4); continue; }
    const len = Number(m[1]);
    const start = idx + 4;
    if (buf.length < start + len) break;
    const msg = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
    buf = buf.subarray(start + len);
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1 } });
    } else if (msg.method === "session/new") {
      send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "s1" } });
    } else if (msg.method === "session/prompt") {
      send({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "s1",
          update: { sessionUpdate: "agent_message_chunk", content: { text: "hello-from-acp" } },
        },
      });
      send({ jsonrpc: "2.0", id: msg.id, result: { stopReason: "end_turn" } });
    }
  }
});
`,
      "utf8",
    );
    const text = await runCatalogAcpPrompt({
      command: process.execPath,
      args: [script],
      cwd,
      prompt: "hi",
      timeoutMs: 8_000,
    });
    expect(text).toBe("hello-from-acp");
  });
});

/**
 * The permission ask, through a real ACP stdio agent.
 *
 * A mock that asks for one tool mid-prompt and then reports **which option was selected**, which
 * is the only way to tell "the human allowed it" from "we cancelled it silently" — the two
 * outcomes this change exists to separate. `argv[2]` names the tool so the same script can be a
 * covered read (`safe-only` never asks about it) or an uncovered write.
 */
describe("runCatalogAcpPrompt — tool permission", () => {
  async function askAgentScript(): Promise<{ cwd: string; script: string }> {
    const cwd = await mkdtemp(join(tmpdir(), "acp-perm-"));
    const script = join(cwd, "mock-acp-perm.mjs");
    await writeFile(
      script,
      `
import { Buffer } from "node:buffer";
const toolName = process.argv[2] || "bash";
const toolInput = toolName === "read_file" ? { path: "a.ts" } : { command: "rm -rf build" };
let buf = Buffer.alloc(0);
let promptId = null;
function send(msg) {
  const body = Buffer.from(JSON.stringify(msg));
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
}
function chunk(text) {
  send({ jsonrpc: "2.0", method: "session/update", params: {
    sessionId: "s1",
    update: { sessionUpdate: "agent_message_chunk", content: { text } },
  }});
}
process.stdin.on("data", (c) => {
  buf = Buffer.concat([buf, c]);
  while (true) {
    const idx = buf.indexOf("\\r\\n\\r\\n");
    if (idx < 0) break;
    const header = buf.subarray(0, idx).toString("utf8");
    const m = /content-length:\\s*(\\d+)/i.exec(header);
    if (!m) { buf = buf.subarray(idx + 4); continue; }
    const len = Number(m[1]);
    const start = idx + 4;
    if (buf.length < start + len) break;
    const msg = JSON.parse(buf.subarray(start, start + len).toString("utf8"));
    buf = buf.subarray(start + len);
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1 } });
    } else if (msg.method === "session/new") {
      send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "s1" } });
    } else if (msg.method === "session/prompt") {
      promptId = msg.id;
      send({ jsonrpc: "2.0", id: 9001, method: "session/request_permission", params: {
        sessionId: "s1",
        toolCall: { toolCallId: "tc-1", toolName, input: toolInput },
        options: [
          { optionId: "allow-once", name: "Allow" },
          { optionId: "reject-once", name: "Reject" },
        ],
      }});
    } else if (msg.id === 9001) {
      const outcome = msg.result && msg.result.outcome;
      chunk("decision:" + (outcome && outcome.optionId ? outcome.optionId : outcome && outcome.outcome));
      send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn" } });
    }
  }
});
`,
      "utf8",
    );
    return { cwd, script };
  }

  it("routes an uncovered tool to the dock and sends the human's allow back to the agent", async () => {
    const { cwd, script } = await askAgentScript();
    const asked: Array<{ toolName: string; args: unknown }> = [];
    const text = await runCatalogAcpPrompt({
      command: process.execPath,
      args: [script, "bash"],
      cwd,
      prompt: "clean up",
      timeoutMs: 8_000,
      permissionPolicy: "safe-only",
      onPermissionRequest: async (req) => {
        asked.push({ toolName: req.toolName, args: req.args });
        return true;
      },
    });
    expect(asked).toEqual([{ toolName: "bash", args: { command: "rm -rf build" } }]);
    expect(text).toBe("decision:allow-once");
  });

  it("sends a denial back to the agent when the human says no", async () => {
    const { cwd, script } = await askAgentScript();
    const text = await runCatalogAcpPrompt({
      command: process.execPath,
      args: [script, "bash"],
      cwd,
      prompt: "clean up",
      timeoutMs: 8_000,
      permissionPolicy: "safe-only",
      onPermissionRequest: async () => false,
    });
    expect(text).toBe("decision:reject-once");
  });

  it("still cancels rather than allowing when no dock can answer", async () => {
    const { cwd, script } = await askAgentScript();
    const text = await runCatalogAcpPrompt({
      command: process.execPath,
      args: [script, "bash"],
      cwd,
      prompt: "clean up",
      timeoutMs: 8_000,
      permissionPolicy: "safe-only",
    });
    expect(text).toBe("decision:reject-once");
  });

  it("never asks about a tool the policy already covers", async () => {
    const { cwd, script } = await askAgentScript();
    let asked = 0;
    const text = await runCatalogAcpPrompt({
      command: process.execPath,
      args: [script, "read_file"],
      cwd,
      prompt: "look",
      timeoutMs: 8_000,
      permissionPolicy: "safe-only",
      onPermissionRequest: async () => {
        asked += 1;
        return false;
      },
    });
    expect(asked).toBe(0);
    expect(text).toBe("decision:allow-once");
  });
});
