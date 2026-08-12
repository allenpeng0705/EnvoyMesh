import { describe, expect, it } from "vitest";
import {
  applyGlobalAutoSendGate,
  contactAiAccessLevelForAssistantMode,
  capGroupChatAiAccessLevel,
  isContactAgentModeEnabled,
  resolveContactAiAccessLevel,
  resolveInboundContactAgentMode,
  resolveInboundContactAiAccess,
} from "../src/contact-ai-access.js";

describe("resolveContactAiAccessLevel", () => {
  it("returns explicit preference when set", () => {
    expect(
      resolveContactAiAccessLevel(
        "envoy:owner:abc",
        [{ peerOwnerId: "envoy:owner:abc", aiAccessLevel: "assistant_only", knowledgeAccess: "public", priority: "high" }],
        "manual",
      ),
    ).toBe("assistant_only");
  });

  it("falls back to defaultModeForNewContacts auto as full access", () => {
    expect(resolveContactAiAccessLevel("envoy:owner:new", [], "auto")).toBe("full");
  });

  it("falls back to defaultModeForNewContacts assistant as assistant_only", () => {
    expect(resolveContactAiAccessLevel("envoy:owner:new", [], "assistant")).toBe("assistant_only");
  });

  it("falls back to none when default is manual", () => {
    expect(resolveContactAiAccessLevel("envoy:owner:new", [], "manual")).toBe("none");
  });
});

describe("isContactAgentModeEnabled", () => {
  it("defaults to off when missing or false", () => {
    expect(isContactAgentModeEnabled(undefined)).toBe(false);
    expect(isContactAgentModeEnabled(null)).toBe(false);
    expect(isContactAgentModeEnabled({ agentModeEnabled: false })).toBe(false);
  });

  it("is true only when explicitly enabled", () => {
    expect(isContactAgentModeEnabled({ agentModeEnabled: true })).toBe(true);
  });
});

describe("resolveInboundContactAgentMode", () => {
  it("prefers Assist when agentModeEnabled is false/undefined", () => {
    expect(resolveInboundContactAgentMode({ preference: undefined })).toBe(false);
    expect(resolveInboundContactAgentMode({ preference: { agentModeEnabled: false } })).toBe(false);
  });

  it("enables Agent Mode when preference is on", () => {
    expect(resolveInboundContactAgentMode({ preference: { agentModeEnabled: true } })).toBe(true);
  });

  it("forces Agent Mode off for group threads", () => {
    expect(
      resolveInboundContactAgentMode({
        preference: { agentModeEnabled: true },
        forceOff: true,
      }),
    ).toBe(false);
  });
});

describe("contactAiAccessLevelForAssistantMode", () => {
  it("maps UI modes to access levels", () => {
    expect(contactAiAccessLevelForAssistantMode("manual")).toBe("none");
    expect(contactAiAccessLevelForAssistantMode("assistant")).toBe("assistant_only");
    expect(contactAiAccessLevelForAssistantMode("auto")).toBe("full");
  });
});

describe("capGroupChatAiAccessLevel", () => {
  it("caps full access to assistant_only for group threads", () => {
    expect(capGroupChatAiAccessLevel("full")).toBe("assistant_only");
    expect(capGroupChatAiAccessLevel("assistant_only")).toBe("assistant_only");
    expect(capGroupChatAiAccessLevel("none")).toBe("none");
  });
});

describe("applyGlobalAutoSendGate", () => {
  it("downgrades full to assistant_only when global auto-send is off", () => {
    expect(applyGlobalAutoSendGate("full", false)).toBe("assistant_only");
  });

  it("preserves full when global auto-send is on", () => {
    expect(applyGlobalAutoSendGate("full", true)).toBe("full");
  });

  it("leaves assistant_only and none unchanged", () => {
    expect(applyGlobalAutoSendGate("assistant_only", false)).toBe("assistant_only");
    expect(applyGlobalAutoSendGate("none", false)).toBe("none");
  });
});

describe("resolveInboundContactAiAccess", () => {
  it("does not grant full access from global auto-send alone", () => {
    expect(
      resolveInboundContactAiAccess({
        contactOwnerId: "envoy:owner:bob",
        contactAiPreferences: [],
        defaultModeForNewContacts: "manual",
        globalAutoSendEnabled: true,
      }),
    ).toBe("none");
  });

  it("grants full only when contact is explicitly on Auto and global is on", () => {
    expect(
      resolveInboundContactAiAccess({
        contactOwnerId: "envoy:owner:bob",
        contactAiPreferences: [
          { peerOwnerId: "envoy:owner:bob", aiAccessLevel: "full", knowledgeAccess: "public", priority: "high" },
        ],
        defaultModeForNewContacts: "manual",
        globalAutoSendEnabled: true,
      }),
    ).toBe("full");
  });

  it("caps contact Auto to assistant_only when global auto-send is off", () => {
    expect(
      resolveInboundContactAiAccess({
        contactOwnerId: "envoy:owner:bob",
        contactAiPreferences: [
          { peerOwnerId: "envoy:owner:bob", aiAccessLevel: "full", knowledgeAccess: "public", priority: "high" },
        ],
        defaultModeForNewContacts: "manual",
        globalAutoSendEnabled: false,
      }),
    ).toBe("assistant_only");
  });
});
