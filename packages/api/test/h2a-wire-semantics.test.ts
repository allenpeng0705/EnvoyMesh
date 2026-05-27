import { describe, expect, it } from "vitest";
import {
  wireChannelForIntent,
  isH2aWireIntent,
  isPeerHumanChatIntent,
} from "../src/h2a-wire-semantics.js";

describe("h2a wire semantics", () => {
  it("routes chat.message to chat protocol only", () => {
    expect(wireChannelForIntent("chat.message")).toBe("chat");
    expect(isPeerHumanChatIntent("chat.message")).toBe(true);
  });

  it("routes H2A assist intents to message protocol", () => {
    for (const intent of ["knowledge.query", "knowledge.response", "discovery.request"]) {
      expect(wireChannelForIntent(intent)).toBe("message");
      expect(isH2aWireIntent(intent)).toBe(true);
    }
  });

  it("routes task intents to message protocol", () => {
    expect(wireChannelForIntent("task.propose")).toBe("message");
    expect(wireChannelForIntent("task.result")).toBe("message");
  });

  it("routes share chunks to data protocol", () => {
    expect(wireChannelForIntent("share.chunk")).toBe("data");
  });
});
