/**
 * `CoreNodeService` / `CoreRpcMethods` — the reusable half of the RPC contract
 * (plan §10 **E9**, §8.13).
 *
 * **Why these tests exist.** E9's decided shape is easy to state and easy to
 * quietly undo: delete a name from the generated file, move a core member back
 * into `node-service.ts`, or widen the core set to include something social —
 * and nothing else in the repo notices. The checks below are:
 *
 * 1. the generated artifact is **current** (positive control);
 * 2. a perturbed artifact **fails** the gate (seeded negative control — a gate
 *    that cannot fail is not a gate);
 * 3. the core surface and the declared product residual are **disjoint**;
 * 4. every generated core method is a real `NodeService` member;
 * 5. no core method names a product concept from the Axis-1 manifest;
 * 6. the core surface is a **proper** subset of the full one — it cannot silently
 *    grow to "everything", which is the defect E9 exists to remove.
 */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const CORE_FILE = path.join(repoRoot, "packages/api/src/core-node-service.ts");
const NODE_SERVICE_FILE = path.join(repoRoot, "packages/api/src/node-service.ts");
const MANIFEST = path.join(repoRoot, "scripts/module-boundary.json");

const run = (args: string[]) =>
  spawnSync(process.execPath, ["scripts/generate-core-surface.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

const evidence = () => {
  // `--json` is the generator's machine-readable evidence: membership is derived
  // from the two interface files, so a test that parsed them itself would drift.
  const r = run(["--json"]);
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as {
    coreFile: string;
    coreSections: string[];
    totalMembers: number;
    coreMembers: string[];
    coreWireMembers: string[];
    coreMembersNotExposed: string[];
    excludedMembers: string[];
    sections: { section: string; disposition: string; members: number; excluded: number }[];
  };
};

const coreText = readFileSync(CORE_FILE, "utf8");
const nodeServiceText = readFileSync(NODE_SERVICE_FILE, "utf8");
const productText = readFileSync(path.join(repoRoot, "packages/api/src/ws-protocol.ts"), "utf8");
const unionNames = (text: string, typeName: string) => {
  const start = text.indexOf(`export type ${typeName} =`);
  const end = text.indexOf("\n\n", start);
  return [...text.slice(start, end === -1 ? undefined : end).matchAll(/^ {2}\| "([^"]+)"/gm)].map((m) => m[1]);
};

const tempDirs: string[] = [];
afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true });
});

describe("E9 core surface", () => {
  it("the generated artifact is current", () => {
    const r = run(["--check"]);
    expect(r.stderr).toBe("");
    expect(r.stdout).toContain("core-surface OK");
    expect(r.status).toBe(0);
  });

  it("fails when the generated artifact is perturbed (seeded)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "core-surface-"));
    tempDirs.push(dir);
    const copy = path.join(dir, "core-node-service.ts");
    copyFileSync(CORE_FILE, copy);
    const dropped = unionNames(coreText, "CoreRpcMethods")[0];
    writeFileSync(copy, coreText.replace(`  | "${dropped}"\n`, ""));

    const r = run(["--check", "--core-file", copy]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("stale");
  });

  it("fails when a product method is added to the core surface (seeded)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "core-surface-"));
    tempDirs.push(dir);
    const copy = path.join(dir, "core-node-service.ts");
    copyFileSync(CORE_FILE, copy);
    writeFileSync(copy, coreText.replace('export type CoreRpcMethods =', 'export type CoreRpcMethods =\n  | "sendChat"'));

    const r = run(["--check", "--core-file", copy]);
    expect(r.status).toBe(1);
  });

  it("the core surface and the declared product residual do not overlap", () => {
    const e = evidence();
    const core = new Set(e.coreMembers);
    const overlap = e.excludedMembers.filter((m) => core.has(m));
    expect(overlap).toEqual([]);
  });

  it("every core method is a real NodeService member", () => {
    const e = evidence();
    // Members live in one of the two files after the split; the declaration form
    // checked here is the one the generator emits (`  name(…` at two spaces).
    const declared = (name: string) =>
      new RegExp(`^ {2}(?:readonly\\s+)?${name}\\s*[(<:]`, "m").test(coreText) ||
      new RegExp(`^ {2}(?:readonly\\s+)?${name}\\s*[(<:]`, "m").test(nodeServiceText);
    const missing = e.coreMembers.filter((m) => !declared(m));
    expect(missing).toEqual([]);
  });

  it("no core method names a product concept", () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const concept = new RegExp(manifest.declaredInputs.conceptPattern);
    const offenders = evidence().coreMembers.filter((m) => concept.test(m));
    expect(offenders).toEqual([]);
  });

  it("every core wire method is a real RPC method", () => {
    // The bug this pins: `RpcMethods = CoreRpcMethods | ProductRpcMethods` means a
    // name in `CoreRpcMethods` that is not in `ProductRpcMethods` *widens* the
    // wire contract — it advertises a method no client can call. Eight core
    // members are in-process only (`recordOwnerActivity`, `clearAllUserData`, …),
    // so the generator intersects the two surfaces instead of conflating them.
    const e = evidence();
    const product = new Set(unionNames(productText, "ProductRpcMethods"));
    const notReal = e.coreWireMembers.filter((n) => !product.has(n));
    expect(notReal).toEqual([]);
  });

  it("the type surface and the wire surface are different, and say so", () => {
    const e = evidence();
    const union = unionNames(coreText, "CoreRpcMethods");
    // The generated union is the wire surface, not every member.
    expect(new Set(e.coreWireMembers)).toEqual(new Set(union));
    expect(e.coreMembersNotExposed.length).toBeGreaterThan(0);
    for (const n of e.coreMembersNotExposed) {
      expect(union).not.toContain(n);
      expect(e.coreMembers).toContain(n); // still part of CoreNodeService
    }
    expect(e.coreWireMembers.length + e.coreMembersNotExposed.length).toBe(e.coreMembers.length);
  });

  it("the core surface is a proper subset of the full one", () => {
    const e = evidence();
    const core = unionNames(coreText, "CoreRpcMethods");
    expect(core.length).toBeGreaterThan(0);
    expect(core.length).toBe(e.coreWireMembers.length);
    // The full surface is the core union plus the product union; if every member
    // were core, E9 would have changed nothing.
    expect(core.length).toBeLessThan(e.totalMembers);
    expect(new Set(core).size).toBe(core.length); // no duplicates
  });

  it("NodeService extends CoreNodeService and the dual export is in place", () => {
    expect(nodeServiceText).toMatch(/^export interface NodeService extends CoreNodeService \{/m);
    expect(nodeServiceText).toMatch(/export type \{[^}]*\} from "\.\/core-node-service\.js";/s);
    expect(coreText).toMatch(/GENERATED by `node scripts\/generate-core-surface\.mjs`/);
  });
});
