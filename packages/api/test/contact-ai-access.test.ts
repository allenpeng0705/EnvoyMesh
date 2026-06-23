import { describe, expect, it } from "vitest";
import {
  contactAiAccessLevelForAssistantMode,
  capGroupChatAiAccessLevel,
  resolveContactAiAccessLevel,
  resolveEffectiveContactAiAccessLevel,
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

describe("resolveEffectiveContactAiAccessLevel", () => {
  it("grants full access for bonded contacts when global auto-send is enabled", () => {
    expect(
      resolveEffectiveContactAiAccessLevel({
        contactOwnerId: "envoy:owner:bob",
        contactAiPreferences: [],
        defaultModeForNewContacts: "manual",
        autoSendEnabled: true,
        bondLevel: "direct",
      }),
    ).toBe("full");
  });

  it("respects explicit none preference even when global auto-send is enabled", () => {
    expect(
      resolveEffectiveContactAiAccessLevel({
        contactOwnerId: "envoy:owner:bob",
        contactAiPreferences: [
          { peerOwnerId: "envoy:owner:bob", aiAccessLevel: "none", knowledgeAccess: "public", priority: "high" },
        ],
        defaultModeForNewContacts: "manual",
        autoSendEnabled: true,
        bondLevel: "direct",
      }),
    ).toBe("none");
  });
});
