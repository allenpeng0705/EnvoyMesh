import { describe, expect, it } from "vitest";
import {
  EH_CHAT_PLACEHOLDER_TITLE,
  defaultEhChatTitle,
  ehChatTitleFromUserPrompt,
  normalizeEhChatModel,
  resolveEhChatDisplayTitle,
  resolveEhChatHostCreds,
  resolveEhChatHostModel,
  shouldAutoSetEhChatTitle,
  type EhChatTaskSummary,
} from "../src/eh-chat-task.js";
import { deriveCodingUiBucket } from "../src/coding-ui-bucket.js";

describe("eh-chat-task titles", () => {
  it("uses folder basename only for project-style defaultEhChatTitle", () => {
    expect(defaultEhChatTitle("/Users/me/my-app/")).toBe("my-app");
    expect(defaultEhChatTitle("C:\\\\repos\\\\EnvoyMesh")).toBe("EnvoyMesh");
  });

  it("resolves empty title to New task placeholder", () => {
    expect(resolveEhChatDisplayTitle(undefined)).toBe(EH_CHAT_PLACEHOLDER_TITLE);
    expect(resolveEhChatDisplayTitle("  ")).toBe(EH_CHAT_PLACEHOLDER_TITLE);
    expect(resolveEhChatDisplayTitle("Fix login")).toBe("Fix login");
  });

  it("derives title from first non-empty prompt line (max 60)", () => {
    expect(ehChatTitleFromUserPrompt("  Fix the login bug  ")).toBe(
      "Fix the login bug",
    );
    expect(
      ehChatTitleFromUserPrompt("line one\nline two that is longer"),
    ).toBe("line one");
    expect(ehChatTitleFromUserPrompt("\n\n  second  \n")).toBe("second");
    const long = "a".repeat(80);
    const titled = ehChatTitleFromUserPrompt(long);
    expect(titled.length).toBeLessThanOrEqual(60);
    expect(titled.endsWith("…")).toBe(true);
  });

  it("auto-sets placeholder, empty, and legacy folder-basename titles", () => {
    expect(shouldAutoSetEhChatTitle(undefined, "/p/app")).toBe(true);
    expect(shouldAutoSetEhChatTitle(EH_CHAT_PLACEHOLDER_TITLE, "/p/app")).toBe(
      true,
    );
    expect(
      shouldAutoSetEhChatTitle("app", "/p/app", { messageCount: 0 }),
    ).toBe(true);
    // Folder basename was never a user-chosen title — still replaceable
    // after prior turns (Paseo: first prompt becomes the task name).
    expect(
      shouldAutoSetEhChatTitle("app", "/p/app", { messageCount: 2 }),
    ).toBe(true);
    expect(
      shouldAutoSetEhChatTitle("Fix login", "/p/app", { messageCount: 0 }),
    ).toBe(false);
  });
});

describe("EhChatTaskSummary promote fields", () => {
  it("accepts optional harness / uiBucket / agentState", () => {
    const summary: EhChatTaskSummary = {
      id: "c1",
      cwd: "/p",
      title: "Fix login",
      lastUsedAt: "2026-09-11T00:00:00.000Z",
      harness: "envoy-harness",
      agentState: "thinking",
      uiBucket: deriveCodingUiBucket({ state: "thinking" }),
    };
    expect(summary.harness).toBe("envoy-harness");
    expect(summary.uiBucket).toBe("running");
    expect(summary.agentState).toBe("thinking");
  });

  it("accepts optional locked model", () => {
    const summary: EhChatTaskSummary = {
      id: "c1",
      cwd: "/p",
      title: "Fix login",
      lastUsedAt: "2026-09-11T00:00:00.000Z",
      model: "openai:gpt-4o",
    };
    expect(summary.model).toBe("openai:gpt-4o");
  });
});

describe("resolveEhChatHostModel", () => {
  it("prefers task lock over global host model", () => {
    expect(normalizeEhChatModel("  openai:a  ")).toBe("openai:a");
    expect(normalizeEhChatModel("   ")).toBeUndefined();
    expect(resolveEhChatHostModel("openai:locked", "openai:global")).toBe(
      "openai:locked",
    );
    expect(resolveEhChatHostModel(undefined, "openai:global")).toBe(
      "openai:global",
    );
    expect(resolveEhChatHostModel("  ", undefined)).toBeUndefined();
  });

  it("prefers task endpoint and apiKey over global", () => {
    expect(
      resolveEhChatHostCreds({
        chatEndpoint: "https://chat",
        chatApiKey: "sk-chat",
        globalEndpoint: "https://global",
        globalApiKey: "sk-global",
      }),
    ).toEqual({ endpoint: "https://chat", apiKey: "sk-chat" });
    expect(
      resolveEhChatHostCreds({
        globalEndpoint: "https://global",
        globalApiKey: "sk-global",
      }),
    ).toEqual({ endpoint: "https://global", apiKey: "sk-global" });
  });
});
