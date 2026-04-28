import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("DHT capability topic providers", () => {
  it("findCapabilityTopicProviders settles (bounded query; no infinite hang)", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: true,
      dhtClientMode: false,
    });
    await mesh.start();
    meshes.push(mesh);

    const providers = await mesh.findCapabilityTopicProviders("envoymesh.smoke.cap.v1", {
      queryTimeoutMs: 4000,
      limit: 8,
    });

    expect(Array.isArray(providers)).toBe(true);
  });

  it("rejects capability topic APIs when DHT is disabled", async () => {
    const mesh = new EnvoyMesh({
      listen: ["/ip4/127.0.0.1/tcp/0"],
      enableMdns: false,
      enableDht: false,
    });
    await mesh.start();
    meshes.push(mesh);

    await expect(mesh.provideCapabilityTopic("x")).rejects.toThrow(/DHT/);
    await expect(mesh.findCapabilityTopicProviders("x")).rejects.toThrow(/DHT/);
  });
});
