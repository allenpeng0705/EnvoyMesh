/**
 * Phase 66/67 review — source-level guards for extracted ownership +
 * Social/EnvoyGo template entry points.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

describe("Phase 67 source guards", () => {
  it("exports the four chain-ownership runtime entry points", () => {
    const src = read("apps/node/src/node-service-chain-ownership.ts");
    expect(src).toContain("export async function scanDelegatedAssignersViaRuntime");
    expect(src).toContain("export async function bestEffortCancelRemoteAssignerViaRuntime");
    expect(src).toContain("export async function chainReclaimAssignerViaRuntime");
    expect(src).toContain("export async function chainCancelDelegatedViaRuntime");
  });

  it("pins EnvoyGo start flow to chainListRecipes", () => {
    const dart = read("apps/envoygo/lib/screens/chains/start_chain_screen.dart");
    expect(dart).toContain("chainListRecipes()");
  });

  it("pins Social ChainsView templateId pick/delete/save RPCs", () => {
    const view = read("apps/social/src/components/views/ChainsView.tsx");
    expect(view).toContain("chainListRecipes");
    expect(view).toContain("chainDeleteRecipe");
    expect(view).toContain("chainSaveRecipe");
    expect(view).toMatch(/templateId/);
    const dialog = read("apps/social/src/components/ChainStartDialog.tsx");
    expect(dialog).toMatch(/templateId/);
  });

  it("pins recipe RPC thin wrappers on NodeServiceImpl", () => {
    const impl = read("apps/node/src/node-service-impl.ts");
    expect(impl).toMatch(/async chainListRecipes[\s\S]*chainListRecipesViaRuntime/);
    expect(impl).toMatch(/async chainSaveRecipe[\s\S]*chainSaveRecipeViaRuntime/);
    expect(impl).toMatch(/async chainDeleteRecipe[\s\S]*chainDeleteRecipeViaRuntime/);
  });
});
