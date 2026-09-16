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
