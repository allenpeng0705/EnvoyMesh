import { describe, expect, it } from "vitest";
import {
  buildCodingPaletteItems,
  filterCodingPaletteItems,
  scoreCodingPaletteItem,
  type CodingPaletteItem,
} from "../../src/lib/coding-palette-items.js";
import {
  codingRowIsRecent,
  codingRowMatchesFilter,
  codingRowNeedsYou,
} from "../../src/lib/coding-history.js";

describe("scoreCodingPaletteItem / filterCodingPaletteItems", () => {
  const items: CodingPaletteItem[] = [
    {
      id: "ws-1",
      kind: "workspace",
      label: "Fix auth bug",
      detail: "Envoy Harness · /Users/me/app",
      path: "/Users/me/app",
      harness: "Envoy Harness",
      action: {
        type: "select-session",
        ref: { kind: "eh", chatId: "c1" },
      },
    },
    {
      id: "proj-1",
      kind: "project",
      label: "app",
      detail: "/Users/me/app",
      path: "/Users/me/app",
      action: { type: "focus-project", path: "/Users/me/app" },
    },
    {
      id: "act-1",
      kind: "action",
      label: "New workspace",
      action: { type: "new-workspace" },
    },
  ];

  it("scores exact label highest", () => {
    const exact = scoreCodingPaletteItem(items[0], "Fix auth bug");
    const partial = scoreCodingPaletteItem(items[0], "auth");
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(0);
  });

  it("matches path and harness", () => {
    expect(scoreCodingPaletteItem(items[0], "Users/me")).toBeGreaterThan(0);
    expect(scoreCodingPaletteItem(items[0], "harness")).toBeGreaterThan(0);
  });

  it("returns 0 when no field matches", () => {
    expect(scoreCodingPaletteItem(items[0], "zzzz-nope")).toBe(0);
  });

  it("filters and sorts by score", () => {
    const filtered = filterCodingPaletteItems(items, "app");
    expect(filtered.length).toBeGreaterThanOrEqual(1);
    expect(filtered.every((i) => scoreCodingPaletteItem(i, "app") > 0)).toBe(
      true,
    );
  });

  it("empty query keeps all items", () => {
    expect(filterCodingPaletteItems(items, "").length).toBe(items.length);
  });
});

describe("buildCodingPaletteItems", () => {
  it("builds projects, workspaces, actions, and files", () => {
    const items = buildCodingPaletteItems({
      projects: [
        {
          path: "/repo",
          label: "repo",
          addedAt: new Date().toISOString(),
        },
      ],
      workspaces: [
        {
          kind: "eh",
          id: "eh1",
          title: "Task A",
          cwd: "/repo",
          harnessLabel: "Envoy Harness",
          ref: { kind: "eh", chatId: "eh1" },
        },
      ],
      cwdFiles: [{ name: "README.md", path: "/repo/README.md" }],
      canOpenSettings: true,
      canInvitePeer: true,
    });
    expect(items.some((i) => i.kind === "project")).toBe(true);
    expect(items.some((i) => i.kind === "workspace")).toBe(true);
    expect(items.some((i) => i.kind === "file")).toBe(true);
    expect(items.some((i) => i.id === "action:new-workspace")).toBe(true);
    expect(items.some((i) => i.id === "action:new-schedule")).toBe(true);
    expect(items.some((i) => i.id === "action:invite-peer")).toBe(true);
    expect(items.some((i) => i.id === "action:open-settings")).toBe(true);
  });
});

describe("coding history filters", () => {
  it("needs_you matches EH attention buckets", () => {
    expect(
      codingRowNeedsYou({
        kind: "eh",
        id: "1",
        lastUsedAt: new Date().toISOString(),
        uiBucket: "needs_input",
      }),
    ).toBe(true);
    expect(
      codingRowNeedsYou({
        kind: "eh",
        id: "1",
        lastUsedAt: new Date().toISOString(),
        uiBucket: "done",
      }),
    ).toBe(false);
    expect(
      codingRowNeedsYou({
        kind: "ext",
        id: "x",
        lastUsedAt: new Date().toISOString(),
        extNeedsInstall: true,
      }),
    ).toBe(true);
  });

  it("recent uses 14-day window", () => {
    const now = Date.parse("2026-09-11T12:00:00.000Z");
    expect(
      codingRowIsRecent(new Date(now - 3 * 86400000).toISOString(), now),
    ).toBe(true);
    expect(
      codingRowIsRecent(new Date(now - 20 * 86400000).toISOString(), now),
    ).toBe(false);
  });

  it("hides archived from all / shows only in archived", () => {
    const row = {
      kind: "eh" as const,
      id: "c1",
      lastUsedAt: new Date().toISOString(),
      uiBucket: "done" as const,
    };
    const archived = new Set(["eh:c1"]);
    expect(codingRowMatchesFilter(row, "all", archived)).toBe(false);
    expect(codingRowMatchesFilter(row, "archived", archived)).toBe(true);
    expect(codingRowMatchesFilter(row, "all", new Set())).toBe(true);
  });
});
