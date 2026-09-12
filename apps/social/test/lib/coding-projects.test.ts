import { afterEach, describe, expect, it } from "vitest";
import {
  addCodingProject,
  codingModelToEhHostModel,
  ensureCodingProjectsFromCwds,
  getCodingProject,
  loadCodingProjects,
  modelProvidersToCodingSpec,
  normalizeCodingProjectPath,
  removeCodingProject,
  resolveCodingWorkspacePrefill,
  saveCodingProjects,
  seedCodingProjectDefaultsIfEmpty,
  updateCodingProject,
} from "../../src/lib/coding-projects.js";

const memory = new Map<string, string>();

function installMemoryStorage(): void {
  memory.clear();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => {
      memory.clear();
    },
    key: (index: number) => Array.from(memory.keys())[index] ?? null,
    get length() {
      return memory.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  memory.clear();
});

describe("coding-projects", () => {
  it("normalizes trailing slashes", () => {
    expect(normalizeCodingProjectPath("/a/b/")).toBe("/a/b");
  });

  it("addCodingProject is idempotent by path", () => {
    installMemoryStorage();
    const a = addCodingProject("/projects/app/");
    const b = addCodingProject("/projects/app");
    expect(a.path).toBe("/projects/app");
    expect(b.path).toBe(a.path);
    expect(loadCodingProjects()).toHaveLength(1);
  });

  it("removeCodingProject drops registry entry only", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    expect(removeCodingProject("/projects/app/")).toBe(true);
    expect(loadCodingProjects()).toHaveLength(0);
    expect(removeCodingProject("/projects/app")).toBe(false);
  });

  it("removeCodingProject dismisses path so cwd seed cannot revive it", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    expect(removeCodingProject("/projects/app")).toBe(true);
    expect(loadCodingProjects()).toHaveLength(0);
    const seeded = ensureCodingProjectsFromCwds(["/projects/app"]);
    expect(seeded).toHaveLength(0);
  });

  it("addCodingProject clears dismiss and allows the path again", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    removeCodingProject("/projects/app");
    ensureCodingProjectsFromCwds(["/projects/app"]);
    expect(loadCodingProjects()).toHaveLength(0);
    addCodingProject("/projects/app");
    expect(loadCodingProjects().map((p) => p.path)).toEqual(["/projects/app"]);
  });

  it("ensureCodingProjectsFromCwds seeds missing roots", () => {
    installMemoryStorage();
    saveCodingProjects([
      {
        path: "/projects/app",
        label: "app",
        addedAt: "2020-01-01T00:00:00.000Z",
      },
    ]);
    const next = ensureCodingProjectsFromCwds([
      "/projects/app",
      "/other/lib/",
    ]);
    expect(next.map((p) => p.path).sort()).toEqual([
      "/other/lib",
      "/projects/app",
    ]);
  });

  it("updateCodingProject renames and sets defaultHarness", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    const updated = updateCodingProject("/projects/app", {
      label: "My App",
      defaultHarness: "pi",
    });
    expect(updated?.label).toBe("My App");
    expect(updated?.defaultHarness).toBe("pi");
    expect(getCodingProject("/projects/app/")?.defaultHarness).toBe("pi");
  });

  it("updateCodingProject sets provider fields and clears them", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    const updated = updateCodingProject("/projects/app", {
      defaultModel: "gpt-4o",
      defaultProviderKind: "openai-compatible",
      defaultEndpoint: "https://api.example/v1",
      defaultApiKey: "sk-x",
    });
    expect(updated?.defaultModel).toBe("gpt-4o");
    expect(updated?.defaultProviderKind).toBe("openai-compatible");
    expect(updated?.defaultEndpoint).toBe("https://api.example/v1");
    expect(updated?.defaultApiKey).toBe("sk-x");
    const cleared = updateCodingProject("/projects/app", {
      defaultModel: null,
      defaultProviderKind: null,
      defaultEndpoint: null,
      defaultApiKey: null,
    });
    expect(cleared?.defaultModel).toBeUndefined();
    expect(cleared?.defaultProviderKind).toBeUndefined();
  });

  it("resolveCodingWorkspacePrefill prefers project over last-used (no Settings)", () => {
    expect(
      resolveCodingWorkspacePrefill({
        project: {
          path: "/p",
          label: "p",
          addedAt: "2020-01-01T00:00:00.000Z",
          defaultHarness: "codex",
          defaultModel: "gpt-4o",
          defaultProviderKind: "openai-compatible",
          defaultEndpoint: "https://x",
          defaultApiKey: "sk",
        },
        lastUsed: {
          harness: "pi",
          model: "other",
          providerKind: "anthropic-compatible",
          endpoint: "https://y",
          apiKey: "sk2",
        },
      }),
    ).toEqual({
      harness: "codex",
      model: "gpt-4o",
      providerKind: "openai-compatible",
      endpoint: "https://x",
      apiKey: "sk",
    });
    expect(codingModelToEhHostModel("gpt-4o", "openai-compatible")).toBe(
      "openai:gpt-4o",
    );
  });

  it("modelProvidersToCodingSpec maps Settings → AI for Envoy/Pi hints", () => {
    expect(modelProvidersToCodingSpec(undefined)).toBe("");
    expect(modelProvidersToCodingSpec({ modelName: "gpt-4o" })).toBe("gpt-4o");
    expect(
      modelProvidersToCodingSpec({ mode: "openai", modelName: "gpt-4o" }),
    ).toBe("openai:gpt-4o");
    expect(
      modelProvidersToCodingSpec({
        mode: "anthropic-compatible",
        modelName: "claude-sonnet",
      }),
    ).toBe("anthropic:claude-sonnet");
    expect(
      modelProvidersToCodingSpec({ mode: "disabled", modelName: "x" }),
    ).toBe("x");
  });

  it("resolveCodingWorkspacePrefill leaves Envoy/Pi model empty for Settings fallback", () => {
    expect(
      resolveCodingWorkspacePrefill({
        project: {
          path: "/p",
          label: "p",
          addedAt: "2020-01-01T00:00:00.000Z",
          defaultHarness: "envoy-harness",
        },
        lastUsed: null,
      }),
    ).toEqual({
      harness: "envoy-harness",
      model: "",
      providerKind: "",
      endpoint: "",
      apiKey: "",
    });
  });

  it("updateCodingProject can clear defaultHarness", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    updateCodingProject("/projects/app", { defaultHarness: "codex" });
    const cleared = updateCodingProject("/projects/app", {
      defaultHarness: null,
    });
    expect(cleared?.defaultHarness).toBeUndefined();
    expect(getCodingProject("/projects/app")?.defaultHarness).toBeUndefined();
  });

  it("loads legacy rows without defaultHarness", () => {
    installMemoryStorage();
    saveCodingProjects([
      {
        path: "/projects/legacy",
        label: "legacy",
        addedAt: "2020-01-01T00:00:00.000Z",
      },
    ]);
    expect(loadCodingProjects()[0]?.defaultHarness).toBeUndefined();
  });

  it("seedCodingProjectDefaultsIfEmpty sets first workspace agent only once", () => {
    installMemoryStorage();
    addCodingProject("/projects/app");
    const seeded = seedCodingProjectDefaultsIfEmpty("/projects/app", {
      harness: "cursor",
      model: "auto",
    });
    expect(seeded?.defaultHarness).toBe("cursor");
    expect(seeded?.defaultModel).toBe("auto");
    const again = seedCodingProjectDefaultsIfEmpty("/projects/app", {
      harness: "codex",
      model: "gpt-4o",
    });
    expect(again?.defaultHarness).toBe("cursor");
    expect(again?.defaultModel).toBe("auto");
  });
});
