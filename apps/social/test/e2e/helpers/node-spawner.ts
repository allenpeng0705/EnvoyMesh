/**
 * Node spawner helper for Phase 38 WebRTC E2E smoke tests.
 *
 * Spawns two EnvoyMesh nodes with bonded identities for call testing.
 * Both nodes use local-only discovery (mDNS on loopback) and have
 * chat assist disabled to keep the test deterministic.
 *
 * Usage:
 *   const spawner = new NodeSpawner();
 *   await spawner.start();
 *   // ... run test ...
 *   await spawner.stop();
 */

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import path from "node:path";
import fs from "node:fs";

const REPO_ROOT = path.resolve(import.meta.dirname ?? process.cwd(), "../../../../..");

export interface NodeSpawnerOptions {
  /** Port for node 1 (caller). Default: 3031 */
  port1?: number;
  /** Port for node 2 (callee). Default: 3033 */
  port2?: number;
  /** Timeout in ms to wait for nodes to start. Default: 15000 */
  startupTimeout?: number;
  /** Skip bonding (for trust enforcement tests). Default: false */
  skipBonding?: boolean;
}

export class NodeSpawner {
  private node1?: ChildProcess;
  private node2?: ChildProcess;
  private node1PeerId?: string;
  private node2PeerId?: string;
  private started = false;

  constructor(private opts: NodeSpawnerOptions = {}) {}

  get node1Port(): number { return this.opts.port1 ?? 3031; }
  get node2Port(): number { return this.opts.port2 ?? 3033; }

  async start(): Promise<void> {
    if (this.started) return;
    const timeout = this.opts.startupTimeout ?? 15_000;

    const dataDir1 = path.join(REPO_ROOT, "data", "test-e2e-node1");
    const dataDir2 = path.join(REPO_ROOT, "data", "test-e2e-node2");
    fs.mkdirSync(dataDir1, { recursive: true });
    fs.mkdirSync(dataDir2, { recursive: true });

    // Node 1 config
    fs.writeFileSync(path.join(dataDir1, "node-config.json"), JSON.stringify({
      autoStartChatAssistant: false,
      chatAssistEnabled: false,
      enableLocalDiscovery: true,
      relayEnabled: false,
    }));

    // Node 2 config
    fs.writeFileSync(path.join(dataDir2, "node-config.json"), JSON.stringify({
      autoStartChatAssistant: false,
      chatAssistEnabled: false,
      enableLocalDiscovery: true,
      relayEnabled: false,
    }));

    const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
    const nodeEntry = path.join(REPO_ROOT, "apps", "node", "src", "index.ts");

    // Spawn node 1
    this.node1 = spawn(tsxBin, [nodeEntry, "--profile-dir", dataDir1, "--port", String(this.node1Port)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ENVOYMESH_CONFIG_DIR: dataDir1 },
    });

    // Spawn node 2
    this.node2 = spawn(tsxBin, [nodeEntry, "--profile-dir", dataDir2, "--port", String(this.node2Port)], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ENVOYMESH_CONFIG_DIR: dataDir2 },
    });

    // Wait for nodes to be ready
    const node1Ready = this.waitForReady(this.node1, "node1", timeout);
    const node2Ready = this.waitForReady(this.node2, "node2", timeout);
    await Promise.all([node1Ready, node2Ready]);

    this.started = true;
    console.log("[node-spawner] Both nodes started");
  }

  private waitForReady(proc: ChildProcess, label: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`[node-spawner] ${label} failed to start within ${timeout}ms`));
      }, timeout);

      const onData = (data: Buffer) => {
        const text = data.toString();
        // Match "listening on ws://..." or similar startup log
        if (text.includes("listening") || text.includes("WebSocket") || text.includes("started")) {
          clearTimeout(timer);
          proc.stdout?.off("data", onData);
          resolve();
        }
      };

      proc.stdout?.on("data", onData);
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async stop(): Promise<void> {
    if (this.node1) { this.node1.kill("SIGTERM"); this.node1 = undefined; }
    if (this.node2) { this.node2.kill("SIGTERM"); this.node2 = undefined; }
    this.started = false;
    console.log("[node-spawner] Nodes stopped");
  }
}
