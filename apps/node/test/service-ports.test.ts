import { afterEach, describe, expect, it, vi } from "vitest";

describe("service-ports", () => {
  const envKeys = [
    "ENVOYMESH_PORT_OFFSET",
    "ENVOYMESH_SOCIAL_WS_PORT",
    "ENVOYMESH_BRIDGE_PORT",
    "ENVOYMESH_TERMINAL_WS_PORT",
    "ENVOYMESH_GATEWAY_PORT",
    "OPENCLAW_PORT",
  ] as const;

  afterEach(() => {
    vi.resetModules();
    for (const key of envKeys) {
      delete process.env[key];
    }
  });

  async function loadPorts() {
    return import("../src/service-ports.js");
  }

  it("uses default ports when no env is set", async () => {
    const ports = await loadPorts();
    expect(ports.SOCIAL_WS_PORT).toBe(3030);
    expect(ports.BRIDGE_HTTP_PORT).toBe(3031);
    expect(ports.TERMINAL_WS_PORT).toBe(3032);
    expect(ports.OPENCLAW_GATEWAY_PORT).toBe(18789);
    expect(ports.socialWsLoopbackUrl()).toBe("ws://127.0.0.1:3030/ws");
  });

  it("shifts all ports with ENVOYMESH_PORT_OFFSET", async () => {
    process.env.ENVOYMESH_PORT_OFFSET = "100";
    const ports = await loadPorts();
    expect(ports.SOCIAL_WS_PORT).toBe(3130);
    expect(ports.BRIDGE_HTTP_PORT).toBe(3131);
    expect(ports.TERMINAL_WS_PORT).toBe(3132);
    expect(ports.OPENCLAW_GATEWAY_PORT).toBe(18889);
    expect(ports.devServicePortsConfigured()).toBe(true);
  });

  it("allows explicit ENVOYMESH_SOCIAL_WS_PORT override", async () => {
    process.env.ENVOYMESH_SOCIAL_WS_PORT = "4030";
    const ports = await loadPorts();
    expect(ports.SOCIAL_WS_PORT).toBe(4030);
  });
});
