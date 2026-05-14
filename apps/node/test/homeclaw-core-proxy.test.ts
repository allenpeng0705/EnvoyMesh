import http from "node:http";
import { describe, expect, it } from "vitest";

import { executeHomeClawCoreProxy } from "../src/homeclaw-core-proxy.js";

describe("executeHomeClawCoreProxy", () => {
  it("rejects disallowed pathname", async () => {
    const r = await executeHomeClawCoreProxy(
      { method: "GET", path: "/forbidden/other" },
      "http://127.0.0.1:9",
    );
    expect(r.status).toBe(403);
    expect(r.error).toBeDefined();
  });

  it("forwards GET /api/me to downstream", async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json", "x-test": "1" });
      res.end("{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const addr = server.address();
      expect(addr && typeof addr === "object").toBe(true);
      const port = typeof addr === "object" && addr !== null ? addr.port : NaN;

      const r = await executeHomeClawCoreProxy(
        { method: "GET", path: "/api/me", headers: {} },
        `http://127.0.0.1:${port}`,
      );

      expect(r.status).toBe(200);
      expect(r.headers["Content-Type"] ?? r.headers["content-type"]).toContain("application/json");
      expect(r.headers["x-test"] ?? r.headers["X-Test"]).toBe("1");
      expect(Buffer.from(r.bodyBase64 ?? "", "base64").toString()).toBe("{}");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });

  it("forwards GET /files/* to downstream", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/files/demo.png") {
        res.writeHead(200, { "Content-Type": "image/png" });
        res.end("ok");
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    try {
      const addr = server.address();
      expect(addr && typeof addr === "object").toBe(true);
      const port = typeof addr === "object" && addr !== null ? addr.port : NaN;

      const r = await executeHomeClawCoreProxy(
        { method: "GET", path: "/files/demo.png", headers: {} },
        `http://127.0.0.1:${port}`,
      );

      expect(r.status).toBe(200);
      expect(r.headers["Content-Type"] ?? r.headers["content-type"]).toContain("image/png");
      expect(Buffer.from(r.bodyBase64 ?? "", "base64").toString()).toBe("ok");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    }
  });
});
