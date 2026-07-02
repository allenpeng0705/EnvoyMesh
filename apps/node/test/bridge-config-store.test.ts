import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyExtAgentSettingsPatch,
  loadBridgeConfigFromProfile,
  saveBridgeConfigToProfile,
} from "../src/bridge/bridge-config-store.js";

describe("bridge-config-store", () => {
  it("round-trips active agent selection and applies agentUrl/agentName", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoy-bridge-"));
    try {
      await saveBridgeConfigToProfile(profileDir, {
        enabled: true,
        extAgents: [
          {
            id: "homeclaw",
            name: "HomeClaw",
            adapter: "envoymesh-message",
            url: "http://127.0.0.1:8010/message",
            enabled: true,
          },
          {
            id: "hermes",
            name: "Hermes",
            adapter: "envoymesh-message",
            url: "http://127.0.0.1:8020/message",
            enabled: true,
          },
        ],
        activeExtAgent: "homeclaw",
      });

      const switched = await applyExtAgentSettingsPatch(profileDir, {
        activeExtAgentId: "hermes",
      });
      expect(switched.activeExtAgent).toBe("hermes");
      expect(switched.agentUrl).toBe("http://127.0.0.1:8020/message");
      expect(switched.agentName).toBe("Hermes");

      const raw = JSON.parse(await readFile(join(profileDir, "bridge-config.json"), "utf-8"));
      expect(raw.activeExtAgent).toBe("hermes");
      expect(raw.agentUrl).toBe("http://127.0.0.1:8020/message");
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });

  it("loads defaults when bridge-config.json is missing", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "envoy-bridge-"));
    try {
      const cfg = await loadBridgeConfigFromProfile(profileDir);
      expect(cfg.activeExtAgent).toBe("homeclaw");
      expect(cfg.extAgents?.some((a) => a.id === "openhuman")).toBe(true);
    } finally {
      await rm(profileDir, { recursive: true, force: true });
    }
  });
});
