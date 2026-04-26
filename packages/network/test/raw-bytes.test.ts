import { afterEach, describe, expect, it } from "vitest";
import { EnvoyMesh } from "../src/index.js";

const meshes: EnvoyMesh[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((mesh) => mesh.stop()));
});

describe("EnvoyMesh raw bytes", () => {
  it("does not crash the receiver when bytes are not a JSON envelope", async () => {
    const receiver = await startMesh();
    const sender = await startMesh();

    let sawMessage = false;
    receiver.onMessage(async () => {
      sawMessage = true;
    });

    const latencyMs = await sender.sendRawBytes(receiver.multiaddrs[0], new TextEncoder().encode("{not-json"));
    expect(latencyMs).toBeGreaterThanOrEqual(0);

    await sleep(50);
    expect(sawMessage).toBe(false);
  });
});

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
  });

  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
