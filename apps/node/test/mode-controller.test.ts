import { describe, expect, it, vi } from "vitest";
import {
  ModeController,
  createDefaultModeConfig,
  buildSetModeTool,
  buildGetModeTool,
  buildSetContactModeTool,
  getNextCronActivation,
  type AgentMode,
} from "../src/mode-controller.js";

describe("ModeController", () => {
  describe("createDefaultModeConfig", () => {
    it("creates valid default config", () => {
      const config = createDefaultModeConfig();
      expect(config.mode).toBe("reactive");
      expect(config.defaultMode).toBe("reactive");
      expect(config.offlineMinutesBeforeProactive).toBe(5);
      expect(config.perContactOverrides).toEqual({});
    });
  });

  describe("initial state", () => {
    it("starts in reactive mode by default", () => {
      const controller = new ModeController(createDefaultModeConfig());
      expect(controller.getCurrentMode()).toBe("reactive");
    });

    it("starts with owner disconnected", () => {
      const controller = new ModeController(createDefaultModeConfig());
      expect(controller.isOwnerConnected()).toBe(false);
    });
  });

  describe("getModeForContact", () => {
    it("returns current mode when no override", () => {
      const config = createDefaultModeConfig();
      config.mode = "proactive";
      const controller = new ModeController(config);
      expect(controller.getModeForContact("some-owner")).toBe("proactive");
    });

    it("returns override when set for contact", () => {
      const config = createDefaultModeConfig();
      config.mode = "reactive";
      config.perContactOverrides = { "friend-owner": "proactive" };
      const controller = new ModeController(config);
      expect(controller.getModeForContact("friend-owner")).toBe("proactive");
      expect(controller.getModeForContact("other-owner")).toBe("reactive");
    });
  });

  describe("setContactMode", () => {
    it("sets per-contact override", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.setContactMode("friend-owner", "proactive");
      expect(controller.getModeForContact("friend-owner")).toBe("proactive");
    });

    it("clears override when set to null", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.setContactMode("friend-owner", "proactive");
      controller.setContactMode("friend-owner", null);
      expect(controller.getModeForContact("friend-owner")).toBe("reactive");
    });
  });

  describe("owner connection", () => {
    it("marks owner as connected", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.markOwnerConnected();
      expect(controller.isOwnerConnected()).toBe(true);
    });

    it("marks owner as disconnected", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.markOwnerConnected();
      controller.markOwnerDisconnected();
      expect(controller.isOwnerConnected()).toBe(false);
    });

    it("switches to reactive when owner connects", () => {
      const config = createDefaultModeConfig();
      config.mode = "proactive";
      config.defaultMode = "reactive";
      const controller = new ModeController(config);

      controller.markOwnerConnected();

      expect(controller.getCurrentMode()).toBe("reactive");
    });

    it("does not switch mode if default is proactive", () => {
      const config = createDefaultModeConfig();
      config.mode = "proactive";
      config.defaultMode = "proactive";
      const controller = new ModeController(config);

      controller.markOwnerConnected();

      expect(controller.getCurrentMode()).toBe("proactive");
    });
  });

  describe("updateConfig", () => {
    it("updates config fields", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.updateConfig({
        mode: "proactive",
        offlineMinutesBeforeProactive: 10,
      });

      const config = controller.getConfig();
      expect(config.mode).toBe("proactive");
      expect(config.offlineMinutesBeforeProactive).toBe(10);
    });

    it("records transition when mode changes", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.updateConfig({ mode: "proactive" });

      const history = controller.getTransitionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].fromMode).toBe("reactive");
      expect(history[0].toMode).toBe("proactive");
      expect(history[0].reason).toBe("manual");
    });
  });

  describe("checkOfflineTransition", () => {
    it("returns null when owner is connected", () => {
      const config = createDefaultModeConfig();
      config.defaultMode = "proactive";
      config.offlineMinutesBeforeProactive = 5;
      const controller = new ModeController(config);

      controller.markOwnerConnected();
      const result = controller.checkOfflineTransition();

      expect(result).toBeNull();
    });

    it("returns null when mode is already proactive", () => {
      const config = createDefaultModeConfig();
      config.mode = "proactive";
      config.defaultMode = "proactive";
      config.offlineMinutesBeforeProactive = 5;
      const controller = new ModeController(config);

      const result = controller.checkOfflineTransition();

      expect(result).toBeNull();
    });

    it("returns null when default mode is reactive", () => {
      const config = createDefaultModeConfig();
      config.defaultMode = "reactive";
      config.offlineMinutesBeforeProactive = 5;
      const controller = new ModeController(config);

      const result = controller.checkOfflineTransition();

      expect(result).toBeNull();
    });

    it("returns null when offline time is below threshold", () => {
      const config = createDefaultModeConfig();
      config.defaultMode = "proactive";
      config.offlineMinutesBeforeProactive = 60; // 1 hour
      const controller = new ModeController(config);

      // Owner disconnected 30 minutes ago
      controller.markOwnerConnected();
      controller.markOwnerDisconnected();

      const result = controller.checkOfflineTransition();

      expect(result).toBeNull();
    });
  });

  describe("requiresApproval", () => {
    it("returns true in reactive mode", () => {
      const controller = new ModeController(createDefaultModeConfig());
      expect(controller.requiresApproval()).toBe(true);
    });

    it("returns false in proactive mode", () => {
      const config = createDefaultModeConfig();
      config.mode = "proactive";
      const controller = new ModeController(config);
      expect(controller.requiresApproval()).toBe(false);
    });
  });

  describe("canPerformProactiveAction", () => {
    it("returns false in reactive mode", () => {
      const controller = new ModeController(createDefaultModeConfig());
      expect(controller.canPerformProactiveAction()).toBe(false);
    });

    it("returns true in proactive mode", () => {
      const config = createDefaultModeConfig();
      config.mode = "proactive";
      const controller = new ModeController(config);
      expect(controller.canPerformProactiveAction()).toBe(true);
    });
  });

  describe("getTransitionHistory", () => {
    it("returns transition history", () => {
      const controller = new ModeController(createDefaultModeConfig());
      controller.updateConfig({ mode: "proactive" });
      controller.updateConfig({ mode: "reactive" });

      const history = controller.getTransitionHistory();
      expect(history).toHaveLength(2);
      expect(history[0].toMode).toBe("proactive");
      expect(history[1].toMode).toBe("reactive");
    });
  });
});

describe("getNextCronActivation", () => {
  it("returns null when current time does not match cron", () => {
    const after = new Date("2026-05-07T08:59:00Z");
    const result = getNextCronActivation("0 9 * * *", after);
    // At 8:59, next 9:00 activation is not yet reached
    expect(result).toBeNull();
  });

  it("returns next occurrence when current time matches", () => {
    // Use a time that matches the cron expression
    const after = new Date("2026-05-07T09:00:00Z");
    const result = getNextCronActivation("0 9 * * *", after);
    expect(result).not.toBeNull();
    expect(result!.getMinutes()).toBe(1);
  });

  it("returns null for invalid cron", () => {
    const after = new Date();
    expect(getNextCronActivation("invalid", after)).toBeNull();
    expect(getNextCronActivation("1 2 3 4 5 6", after)).toBeNull();
  });

  it("handles wildcard minute", () => {
    // At 9:00, minute matches wildcard, so next occurrence is 9:01
    const after = new Date("2026-05-07T09:00:00Z");
    const result = getNextCronActivation("* 9 * * *", after);
    expect(result).not.toBeNull();
    expect(result!.getMinutes()).toBe(1);
  });
});

describe("buildSetModeTool", () => {
  it("sets mode to reactive", async () => {
    const controller = new ModeController(createDefaultModeConfig());
    const tool = buildSetModeTool(controller);

    const result = await tool({ mode: "reactive" });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("reactive");
    expect(controller.getCurrentMode()).toBe("reactive");
  });

  it("sets mode to proactive", async () => {
    const controller = new ModeController(createDefaultModeConfig());
    const tool = buildSetModeTool(controller);

    const result = await tool({ mode: "proactive" });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("proactive");
    expect(controller.getCurrentMode()).toBe("proactive");
  });

  it("returns error for invalid mode", async () => {
    const controller = new ModeController(createDefaultModeConfig());
    const tool = buildSetModeTool(controller);

    const result = await tool({ mode: "invalid" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Invalid mode");
  });
});

describe("buildGetModeTool", () => {
  it("returns current mode and config", async () => {
    const config = createDefaultModeConfig();
    config.mode = "proactive";
    const controller = new ModeController(config);
    const tool = buildGetModeTool(controller);

    const result = await tool({});

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("proactive");
    expect(result.config).toBeDefined();
    expect(result.config!.mode).toBe("proactive");
  });
});

describe("buildSetContactModeTool", () => {
  it("sets contact mode", async () => {
    const controller = new ModeController(createDefaultModeConfig());
    const tool = buildSetContactModeTool(controller);

    const result = await tool({ contactOwnerId: "friend-owner", mode: "proactive" });

    expect(result.ok).toBe(true);
    expect(result.contact).toBe("friend-owner");
    expect(controller.getModeForContact("friend-owner")).toBe("proactive");
  });

  it("returns error when contactOwnerId missing", async () => {
    const controller = new ModeController(createDefaultModeConfig());
    const tool = buildSetContactModeTool(controller);

    const result = await tool({ mode: "proactive" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("contactOwnerId");
  });

  it("clears contact mode when mode is null", async () => {
    const controller = new ModeController(createDefaultModeConfig());
    controller.setContactMode("friend-owner", "proactive");
    const tool = buildSetContactModeTool(controller);

    const result = await tool({ contactOwnerId: "friend-owner", mode: null });

    expect(result.ok).toBe(true);
    expect(controller.getModeForContact("friend-owner")).toBe("reactive");
  });
});
