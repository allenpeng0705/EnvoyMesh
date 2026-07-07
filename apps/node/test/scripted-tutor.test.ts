/**
 * Tests for the scripted onboarding tutor — the no-model fallback that
 * ensures every new user can interact with the assistant.
 */
import { describe, it, expect } from "vitest";
import { getScriptedTutorReply } from "../src/scripted-tutor.js";

const noModelState = { bondCount: 0, interestCount: 3, hasModel: false };
const withModelState = { bondCount: 2, interestCount: 5, hasModel: true };

describe("getScriptedTutorReply", () => {
  describe("intent matching", () => {
    it("matches 'how do I find contacts'", () => {
      const reply = getScriptedTutorReply("How do I find contacts?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Finding contacts");
      expect(reply).toContain("Discover");
    });

    it("matches 'how to add friends'", () => {
      const reply = getScriptedTutorReply("how to add friends on here?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Finding contacts");
    });

    it("matches 'what can you do'", () => {
      const reply = getScriptedTutorReply("What can you do?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("What EnvoyMesh can do");
    });

    it("matches 'what can envoymesh do'", () => {
      const reply = getScriptedTutorReply("what can envoymesh help with?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("EnvoyMesh");
    });

    it("matches 'get started'", () => {
      const reply = getScriptedTutorReply("Help me get started", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Getting started");
    });

    it("matches 'I'm new here'", () => {
      const reply = getScriptedTutorReply("I'm new here, how do I begin?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Getting started");
    });

    it("matches model configuration questions", () => {
      const reply = getScriptedTutorReply("how do I configure an AI model?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Connecting an AI model");
      expect(reply).toContain("Ollama");
    });

    it("matches chain/multi-agent questions", () => {
      const reply = getScriptedTutorReply("what are chains?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Multi-agent chains");
    });

    it("matches privacy/security questions", () => {
      const reply = getScriptedTutorReply("is this private and secure?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("Privacy & security");
    });
  });

  describe("state-aware responses", () => {
    it("includes interest count in find-contacts response", () => {
      const reply = getScriptedTutorReply("how do I find contacts?", { ...noModelState, interestCount: 5 });
      expect(reply).toContain("5 interests");
    });

    it("shows bond count in get-started when user has contacts", () => {
      const reply = getScriptedTutorReply("get started", { ...noModelState, bondCount: 3 });
      expect(reply).toContain("3 contact");
    });

    it("shows model suggestion in get-started when no model", () => {
      const reply = getScriptedTutorReply("get started", noModelState);
      expect(reply).toContain("Connect an AI model");
    });
  });

  describe("when a model IS configured (hasModel: true)", () => {
    it("ALWAYS returns null — never intercepts when a model is available", () => {
      // Even onboarding questions should go to the LLM, not the scripted tutor
      const intents = [
        "how do I find contacts?",
        "what can you do?",
        "help me get started",
        "how do I configure a model?",
        "what are chains?",
        "is this secure?",
        "random unrelated question",
      ];
      for (const msg of intents) {
        expect(getScriptedTutorReply(msg, withModelState)).toBeNull();
      }
    });
  });

  describe("fallback behavior (no model)", () => {
    it("returns generic response for unknown message when no model", () => {
      const reply = getScriptedTutorReply("what's the weather like?", noModelState);
      expect(reply).not.toBeNull();
      expect(reply).toContain("limited mode");
    });

    it("returns null for empty message", () => {
      expect(getScriptedTutorReply("", noModelState)).toBeNull();
      expect(getScriptedTutorReply("   ", noModelState)).toBeNull();
    });

    it("always returns a response (never null) when no model, even for onboarding intents", () => {
      const intents = [
        "how do I find people",
        "what can you do",
        "help me get started",
        "how do I set up a model",
        "what are chains",
        "is this secure",
        "random unrelated question",
      ];
      for (const msg of intents) {
        expect(getScriptedTutorReply(msg, noModelState)).not.toBeNull();
      }
    });
  });
});
