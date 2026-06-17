import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request as httpRequest } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { startPairingKioskServer, type PairingKioskServerHandle } from "../src/pairing-kiosk-server.js";

const ADMIN_TOKEN = "0123456789abcdef0123456789abcdef";

interface MintResult {
  uri: string;
  expiresAt: string;
  inviteId: string;
}

let handle: PairingKioskServerHandle | null = null;

afterEach(async () => {
  if (handle) {
    await handle.close();
    handle = null;
  }
});

function get(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            contentType: String(res.headers["content-type"] ?? ""),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function post(
  port: number,
  path: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "Content-Length": Buffer.byteLength(body), ...headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            contentType: String(res.headers["content-type"] ?? ""),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

describe("startPairingKioskServer — startup guards", () => {
  beforeEach(() => {
    handle = null;
  });

  it("rejects a non-loopback bind without explicit opt-in", async () => {
    await expect(
      startPairingKioskServer({
        kioskAdminToken: ADMIN_TOKEN,
        bindAddress: "0.0.0.0",
        mintInvite: async () => ({
          uri: "envoy://invite?token=x",
          expiresAt: "2099-01-01T00:00:00.000Z",
          inviteId: "x",
        }),
      }),
    ).rejects.toThrow(/Refusing to bind/);
  });

  it("rejects a short admin token", async () => {
    await expect(
      startPairingKioskServer({
        kioskAdminToken: "short",
        mintInvite: async () => ({
          uri: "envoy://invite?token=x",
          expiresAt: "2099-01-01T00:00:00.000Z",
          inviteId: "x",
        }),
      }),
    ).rejects.toThrow(/at least 16/);
  });

  it("rejects a 15-char admin token (off-by-one boundary)", async () => {
    await expect(
      startPairingKioskServer({
        kioskAdminToken: "0123456789abcde", // 15 chars
        mintInvite: async () => ({
          uri: "envoy://invite?token=x",
          expiresAt: "2099-01-01T00:00:00.000Z",
          inviteId: "x",
        }),
      }),
    ).rejects.toThrow(/at least 16/);
  });

  it("accepts a 16-char admin token (boundary)", async () => {
    const local = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: "0123456789abcdef", // exactly 16 chars
      mintInvite: async () => ({
        uri: "envoy://invite?token=x",
        expiresAt: "2099-01-01T00:00:00.000Z",
        inviteId: "x",
      }),
    });
    await local.close();
  });

  it("rejects an already-expired kiosk", async () => {
    await expect(
      startPairingKioskServer({
        kioskAdminToken: ADMIN_TOKEN,
        kioskExpiresAt: "2000-01-01T00:00:00.000Z",
        mintInvite: async () => ({
          uri: "envoy://invite?token=x",
          expiresAt: "2099-01-01T00:00:00.000Z",
          inviteId: "x",
        }),
      }),
    ).rejects.toThrow(/past/);
  });
});

describe("startPairingKioskServer — runtime", () => {
  beforeEach(async () => {
    handle = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: ADMIN_TOKEN,
      mintInvite: async (input): Promise<MintResult> => ({
        uri: `envoy://invite?token=minted-${input.expiresInHours ?? 1}`,
        expiresAt: "2099-01-01T00:00:00.000Z",
        inviteId: "inv-1",
      }),
    });
  });

  it("serves an HTML page on GET /", async () => {
    const resp = await get(handle!.port, "/");
    expect(resp.status).toBe(200);
    expect(resp.contentType).toContain("text/html");
    expect(resp.body).toContain("EnvoyMesh Pairing Kiosk");
  });

  it("serves 200 on GET /health", async () => {
    const resp = await get(handle!.port, "/health");
    expect(resp.status).toBe(200);
    expect(resp.body).toBe("ok");
  });

  it("returns 404 on unknown routes", async () => {
    const resp = await get(handle!.port, "/nope");
    expect(resp.status).toBe(404);
  });

  it("rejects POST /pair without bearer token", async () => {
    const resp = await post(handle!.port, "/pair", "{}");
    expect(resp.status).toBe(401);
  });

  it("rejects POST /pair with a wrong bearer token", async () => {
    const resp = await post(handle!.port, "/pair", "{}", {
      Authorization: "Bearer wrong-token-1234567890",
    });
    expect(resp.status).toBe(401);
  });

  it("rejects POST /pair with a body that is too large", async () => {
    const big = "x".repeat(8 * 1024);
    // The server destroys the request once it crosses MAX_BODY_BYTES. The
    // client may see a socket hang up or a 4xx/5xx — any non-200 is fine.
    let resp: { status: number; body: string; contentType: string } | null = null;
    let error: Error | null = null;
    try {
      resp = await post(handle!.port, "/pair", big, {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      });
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
    }
    if (resp) {
      expect([400, 413, 500]).toContain(resp.status);
    } else {
      expect(error).toBeDefined();
    }
  });

  it("mints an invite on POST /pair with valid token", async () => {
    // Use a swap helper so we don't depend on the global `handle` lifecycle.
    const mintSpy = vi.fn(async (): Promise<MintResult> => ({
      uri: "envoy://invite?token=minted",
      expiresAt: "2099-01-01T00:00:00.000Z",
      inviteId: "inv-1",
    }));
    const local = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: ADMIN_TOKEN,
      mintInvite: mintSpy,
    });
    try {
      const resp = await post(local.port, "/pair", "{}", {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      });
      expect(resp.status).toBe(200);
      const parsed = JSON.parse(resp.body);
      expect(parsed.token).toBe("minted");
      expect(parsed.inviteId).toBe("inv-1");
      expect(parsed.expiresAt).toBeDefined();
      expect(mintSpy).toHaveBeenCalledTimes(1);
    } finally {
      await local.close();
    }
  });

  it("handles two concurrent /pair requests with distinct invite IDs", async () => {
    const mintSpy = vi.fn(async (): Promise<MintResult> => ({
      uri: "envoy://invite?token=minted",
      expiresAt: "2099-01-01T00:00:00.000Z",
      inviteId: randomUUID(),
    }));
    const local = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: ADMIN_TOKEN,
      mintInvite: mintSpy,
    });
    try {
      const [a, b] = await Promise.all([
        post(local.port, "/pair", "{}", {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        }),
        post(local.port, "/pair", "{}", {
          Authorization: `Bearer ${ADMIN_TOKEN}`,
          "Content-Type": "application/json",
        }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const aJson = JSON.parse(a.body);
      const bJson = JSON.parse(b.body);
      expect(aJson.inviteId).not.toBe(bJson.inviteId);
      expect(mintSpy).toHaveBeenCalledTimes(2);
    } finally {
      await local.close();
    }
  });

  it("rejects a NaN expiresInHours without poisoning the invite", async () => {
    // A malicious kiosk operator that posts `{"expiresInHours": "abc"}`
    // must NOT be able to plant an "Invalid Date" invite. The kiosk should
    // fall back to the default and the response should still be 200.
    const mintSpy = vi.fn(async (params: { expiresInHours: number; note?: string }): Promise<MintResult> => ({
      uri: "envoy://invite?token=minted",
      expiresAt: new Date(Date.now() + params.expiresInHours * 3_600_000).toISOString(),
      inviteId: "inv-1",
    }));
    const local = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: ADMIN_TOKEN,
      mintInvite: mintSpy,
    });
    try {
      const resp = await post(local.port, "/pair", '{"expiresInHours": "abc"}', {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      });
      expect(resp.status).toBe(200);
      expect(mintSpy).toHaveBeenCalledTimes(1);
      const callArgs = mintSpy.mock.calls[0]?.[0] as { expiresInHours: number } | undefined;
      expect(callArgs?.expiresInHours).toBeGreaterThan(0);
      expect(Number.isFinite(callArgs?.expiresInHours)).toBe(true);
    } finally {
      await local.close();
    }
  });

  it("clamps expiresInHours to [1, 24]", async () => {
    const mintSpy = vi.fn(async (): Promise<MintResult> => ({
      uri: "envoy://invite?token=minted",
      expiresAt: "2099-01-01T00:00:00.000Z",
      inviteId: "inv-1",
    }));
    const local = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: ADMIN_TOKEN,
      mintInvite: mintSpy,
    });
    try {
      await post(local.port, "/pair", JSON.stringify({ expiresInHours: 9999 }), {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      });
      expect(mintSpy).toHaveBeenCalledWith(expect.objectContaining({ expiresInHours: 24 }));
      mintSpy.mockClear();
      await post(local.port, "/pair", JSON.stringify({ expiresInHours: 0 }), {
        Authorization: `Bearer ${ADMIN_TOKEN}`,
        "Content-Type": "application/json",
      });
      expect(mintSpy).toHaveBeenCalledWith(expect.objectContaining({ expiresInHours: 1 }));
    } finally {
      await local.close();
    }
  });

  it("responds 410 once the kiosk is expired", async () => {
    // Start with an expiry 200ms in the future, then wait it out.
    const expires = new Date(Date.now() + 200).toISOString();
    const local = await startPairingKioskServer({
      port: 0,
      kioskAdminToken: ADMIN_TOKEN,
      kioskExpiresAt: expires,
      mintInvite: async () => ({
        uri: "envoy://invite?token=x",
        expiresAt: "2099-01-01T00:00:00.000Z",
        inviteId: "x",
      }),
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const resp = await get(local.port, "/");
      expect(resp.status).toBe(410);
    } finally {
      await local.close();
    }
  });
});

describe("startPairingKioskServer — port allocation", () => {
  it("binds a real port when no port is provided", async () => {
    handle = await startPairingKioskServer({
      kioskAdminToken: ADMIN_TOKEN,
      mintInvite: async () => ({
        uri: "envoy://invite?token=x",
        expiresAt: "2099-01-01T00:00:00.000Z",
        inviteId: "x",
      }),
    });
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.address).toBe("127.0.0.1");
    // Use the typecast to inspect AddressInfo shape; in practice the address
    // is a string when binding to "127.0.0.1".
    expect(typeof handle.address).toBe("string");
    // Touch AddressInfo so the type ref is kept.
    const _info: AddressInfo | null = null;
    void _info;
  });
});
