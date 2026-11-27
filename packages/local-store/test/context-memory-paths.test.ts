import { describe, expect, it } from "vitest";
import {
  CONTEXT_MEMORY_DEFAULT_NAMESPACE,
  CONTEXT_MEMORY_DIR,
  CONTEXT_MEMORY_EDGES_FILE,
  CONTEXT_MEMORY_FACTS_FILE,
  CONTEXT_MEMORY_NS_DIR,
  contextMemoryBankDir,
  contextMemoryEdgesPath,
  contextMemoryFactsPath,
  isValidContextMemoryNamespace,
  normalizeContextMemoryNamespace,
} from "../src/context-memory-paths.js";

describe("context-memory-paths", () => {
  it("normalizes default and valid names", () => {
    expect(normalizeContextMemoryNamespace(undefined)).toBe(CONTEXT_MEMORY_DEFAULT_NAMESPACE);
    expect(normalizeContextMemoryNamespace("")).toBe(CONTEXT_MEMORY_DEFAULT_NAMESPACE);
    expect(normalizeContextMemoryNamespace("default")).toBe(CONTEXT_MEMORY_DEFAULT_NAMESPACE);
    expect(normalizeContextMemoryNamespace("Work_01")).toBe("work_01");
  });

  it("rejects path traversal and invalid charset", () => {
    expect(isValidContextMemoryNamespace("../x")).toBe(false);
    expect(isValidContextMemoryNamespace("a/b")).toBe(false);
    expect(isValidContextMemoryNamespace("bad name")).toBe(false);
    expect(() => normalizeContextMemoryNamespace("../x")).toThrow(/invalid namespace/);
    expect(() => normalizeContextMemoryNamespace("a/b")).toThrow(/invalid namespace/);
  });

  it("bank dirs isolate named namespaces", () => {
    expect(contextMemoryBankDir("/p", undefined)).toBe(`/p/${CONTEXT_MEMORY_DIR}`);
    expect(contextMemoryBankDir("/p", "work")).toBe(
      `/p/${CONTEXT_MEMORY_DIR}/${CONTEXT_MEMORY_NS_DIR}/work`,
    );
    expect(contextMemoryFactsPath("/p", "work")).toContain(CONTEXT_MEMORY_FACTS_FILE);
    expect(contextMemoryEdgesPath("/p", "work")).toContain(CONTEXT_MEMORY_EDGES_FILE);
    expect(contextMemoryFactsPath("/p", "work")).not.toBe(contextMemoryFactsPath("/p"));
  });
});
