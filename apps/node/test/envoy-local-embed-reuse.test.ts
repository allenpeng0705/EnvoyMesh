import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tmpdir } from "node:os";
import type { EnvoyLocalCatalogModel } from "@envoymesh/api";
import {
  findExistingEmbedModelPath,
  isUsableEmbedModelFile,
  listSiblingEmbedModelPaths,
  scanAndReconcileEmbedModelsIndex,
} from "../src/envoy-local-embed-runtime.js";
import { GGUF_MAGIC } from "../src/envoy-local-download.js";

const catalog: EnvoyLocalCatalogModel = {
  id: "test-embed-q8",
  label: "Test embed",
  description: "test",
  fileName: "Test-Embed-Q8_0.gguf",
  url: "https://example.invalid/test.gguf",
  approxBytes: 80_000_000,
  tags: ["embedding"],
  source: "curated",
};

async function writeMinimalGguf(path: string, sizeBytes: number): Promise<void> {
  const fh = await open(path, "w");
  try {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(GGUF_MAGIC, 0);
    header.writeUInt32LE(3, 4);
    await fh.write(header, 0, 8, 0);
    await fh.truncate(sizeBytes);
  } finally {
    await fh.close();
  }
}

describe("embed model reuse (skip re-download)", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  async function mkRoot(name: string): Promise<string> {
    const dir = join(tmpdir(), `envoy-embed-reuse-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(dir, { recursive: true });
    roots.push(dir);
    return dir;
  }

  it("isUsableEmbedModelFile accepts a plausible GGUF", async () => {
    const root = await mkRoot("usable");
    const path = join(root, catalog.fileName);
    await writeMinimalGguf(path, 60_000_000);
    await expect(isUsableEmbedModelFile(path, catalog)).resolves.toBe(true);
  });

  it("findExistingEmbedModelPath reuses dest without index entry", async () => {
    const profile = await mkRoot("profile-a");
    const embedDir = join(profile, "envoy-local", "embed-models");
    await mkdir(embedDir, { recursive: true });
    const dest = join(embedDir, catalog.fileName);
    await writeMinimalGguf(dest, 60_000_000);

    const found = await findExistingEmbedModelPath(profile, catalog, { models: [] });
    expect(found).toBe(dest);
  });

  it("findExistingEmbedModelPath promotes a complete .part file", async () => {
    const profile = await mkRoot("profile-part");
    const embedDir = join(profile, "envoy-local", "embed-models");
    await mkdir(embedDir, { recursive: true });
    const dest = join(embedDir, catalog.fileName);
    const part = `${dest}.part`;
    await writeMinimalGguf(part, 60_000_000);

    const found = await findExistingEmbedModelPath(profile, catalog, { models: [] });
    expect(found).toBe(dest);
    await expect(isUsableEmbedModelFile(dest, catalog)).resolves.toBe(true);
  });

  it("findExistingEmbedModelPath reuses a sibling profile copy", async () => {
    const dataRoot = await mkRoot("data");
    const defaultProfile = join(dataRoot, "default");
    const cocoProfile = join(dataRoot, "coco");
    const cocoEmbed = join(cocoProfile, "envoy-local", "embed-models");
    await mkdir(cocoEmbed, { recursive: true });
    await mkdir(join(defaultProfile, "envoy-local", "embed-models"), { recursive: true });
    const siblingFile = join(cocoEmbed, catalog.fileName);
    await writeMinimalGguf(siblingFile, 60_000_000);

    const siblings = await listSiblingEmbedModelPaths(defaultProfile, catalog.fileName);
    expect(siblings).toContain(siblingFile);

    const found = await findExistingEmbedModelPath(defaultProfile, catalog, { models: [] });
    expect(found).toBe(siblingFile);
  });

  it("findExistingEmbedModelPath prefers index path when present", async () => {
    const profile = await mkRoot("indexed");
    const custom = join(profile, "custom-place", catalog.fileName);
    await mkdir(join(profile, "custom-place"), { recursive: true });
    await writeMinimalGguf(custom, 60_000_000);

    const found = await findExistingEmbedModelPath(profile, catalog, {
      models: [{ id: catalog.id, path: custom, fileName: catalog.fileName }],
    });
    expect(found).toBe(custom);
  });

  it("scanAndReconcileEmbedModelsIndex discovers dropped GGUFs as local: ids", async () => {
    const profile = await mkRoot("scan");
    const embedDir = join(profile, "envoy-local", "embed-models");
    await mkdir(embedDir, { recursive: true });
    await writeMinimalGguf(join(embedDir, "My-Custom-Embed.gguf"), 60_000_000);

    const index = await scanAndReconcileEmbedModelsIndex(profile);
    expect(index.models).toHaveLength(1);
    expect(index.models[0]?.id).toBe("local:my-custom-embed");
    expect(index.models[0]?.fileName).toBe("My-Custom-Embed.gguf");
    expect(index.activeModelId).toBe("local:my-custom-embed");
  });

  it("scanAndReconcileEmbedModelsIndex maps curated filenames to catalog ids", async () => {
    const profile = await mkRoot("scan-curated");
    const embedDir = join(profile, "envoy-local", "embed-models");
    await mkdir(embedDir, { recursive: true });
    await writeMinimalGguf(
      join(embedDir, "Qwen3-Embedding-0.6B-Q8_0.gguf"),
      60_000_000,
    );

    const index = await scanAndReconcileEmbedModelsIndex(profile);
    expect(index.models[0]?.id).toBe("qwen3-embedding-0.6b-q8_0");
  });
});
