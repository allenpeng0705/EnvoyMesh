/**
 * Phase 43H — Persisted chain goal recipes (owner-saved templates).
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ChainRecipeRecord {
  id: string;
  label: string;
  goal: string;
  maxChainCostUsd?: number;
  costCeilingUsd?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalChainRecipesStore {
  listRecipes(): Promise<ChainRecipeRecord[]>;
  saveRecipe(recipe: Omit<ChainRecipeRecord, "createdAt" | "updatedAt"> & { createdAt?: string }): Promise<ChainRecipeRecord>;
  deleteRecipe(id: string): Promise<boolean>;
}

interface ChainRecipesFile {
  version: 1;
  recipes: ChainRecipeRecord[];
}

export function createLocalChainRecipesStore(profileDir: string): LocalChainRecipesStore {
  const filePath = join(profileDir, "chain-recipes.json");

  async function loadFile(): Promise<ChainRecipesFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as ChainRecipesFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.recipes)) {
        return { version: 1, recipes: [] };
      }
      return parsed;
    } catch {
      return { version: 1, recipes: [] };
    }
  }

  async function writeFileAtomic(data: ChainRecipesFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await rename(tmp, filePath);
  }

  return {
    async listRecipes() {
      const file = await loadFile();
      return [...file.recipes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async saveRecipe(recipe) {
      const file = await loadFile();
      const now = new Date().toISOString();
      const existing = file.recipes.findIndex((r) => r.id === recipe.id);
      const record: ChainRecipeRecord = {
        id: recipe.id,
        label: recipe.label,
        goal: recipe.goal,
        maxChainCostUsd: recipe.maxChainCostUsd,
        costCeilingUsd: recipe.costCeilingUsd,
        createdAt: existing >= 0 ? file.recipes[existing]!.createdAt : recipe.createdAt ?? now,
        updatedAt: now,
      };
      if (existing >= 0) file.recipes[existing] = record;
      else file.recipes.unshift(record);
      await writeFileAtomic(file);
      return record;
    },

    async deleteRecipe(id) {
      const file = await loadFile();
      const before = file.recipes.length;
      file.recipes = file.recipes.filter((r) => r.id !== id);
      if (file.recipes.length === before) return false;
      await writeFileAtomic(file);
      return true;
    },
  };
}
