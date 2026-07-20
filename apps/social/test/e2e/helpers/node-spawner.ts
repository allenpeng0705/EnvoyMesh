/**
 * Node spawner helper for Phase 45 Web Content Browsing E2E smoke tests
 * (and reusable for other dual-node Playwright specs).
 *
 * Spawns two EnvoyMesh node OS processes with distinct Social WS ports
 * via ENVOYMESH_PORT_OFFSET. After both report ready, optionally bonds
 * them by writing trust-store.json + peer-directory.json using live
 * connection status (libp2p peerId + multiaddrs) from each node.
 *
 * Usage:
 *   const spawner = new NodeSpawner({ skipBonding: false });
 *   await spawner.start();
 *   // spawner.node1ProfileDir / node1OwnerId / node2WsUrl …
 *   await spawner.stop();
 */

import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");

export interface NodeSpawnerOptions {
  /** Port offset for node 1 (Alice). Default: 100 → Social WS 3130. */
  offset1?: number;
  /** Port offset for node 2 (Bob). Default: 110 → Social WS 3140. */
  offset2?: number;
  /** Timeout in ms to wait for nodes to start. Default: 45000 */
  startupTimeout?: number;
  /** Skip bonding (for stranger / trust enforcement tests). Default: false */
  skipBonding?: boolean;
  /** Unique data dir suffix (default: timestamp). */
  runId?: string;
}

interface LiveNodeInfo {
  ownerId: string;
  peerId: string;
  deviceId: string;
  devicePublicKeyPem: string;
  multiaddrs: string[];
}

export class NodeSpawner {
  private node1?: ChildProcess;
  private node2?: ChildProcess;
  private started = false;
  private _node1ProfileDir = "";
  private _node2ProfileDir = "";
  private _node1OwnerId = "";
  private _node2OwnerId = "";
  private _node1WsUrl = "";
  private _node2WsUrl = "";

  constructor(private opts: NodeSpawnerOptions = {}) {}

  get node1ProfileDir(): string {
    return this._node1ProfileDir;
  }
  get node2ProfileDir(): string {
    return this._node2ProfileDir;
  }
  get node1OwnerId(): string {
    return this._node1OwnerId;
  }
  get node2OwnerId(): string {
    return this._node2OwnerId;
  }
  get node1WsUrl(): string {
    return this._node1WsUrl;
  }
  get node2WsUrl(): string {
    return this._node2WsUrl;
  }
  get node1Port(): number {
    return 3030 + (this.opts.offset1 ?? 100);
  }
  get node2Port(): number {
    return 3030 + (this.opts.offset2 ?? 110);
  }

  async start(): Promise<void> {
    if (this.started) return;
    const timeout = this.opts.startupTimeout ?? 45_000;
    const runId = this.opts.runId ?? `wc-${Date.now()}`;
    const offset1 = this.opts.offset1 ?? 100;
    const offset2 = this.opts.offset2 ?? 110;

    this._node1ProfileDir = path.join(REPO_ROOT, "data", `test-e2e-web-${runId}-alice`);
    this._node2ProfileDir = path.join(REPO_ROOT, "data", `test-e2e-web-${runId}-bob`);
    fs.rmSync(this._node1ProfileDir, { recursive: true, force: true });
    fs.rmSync(this._node2ProfileDir, { recursive: true, force: true });
    fs.mkdirSync(this._node1ProfileDir, { recursive: true });
    fs.mkdirSync(this._node2ProfileDir, { recursive: true });

    const writeConfig = (dir: string) => {
      fs.writeFileSync(
        path.join(dir, "node-config.json"),
        JSON.stringify({
          autoStartChatAssistant: false,
          chatAssistEnabled: false,
          enableLocalDiscovery: true,
          relayEnabled: false,
        }),
      );
    };
    writeConfig(this._node1ProfileDir);
    writeConfig(this._node2ProfileDir);

    const tsxBin = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");
    const nodeEntry = path.join(REPO_ROOT, "apps", "node", "src", "index.ts");

    this._node1WsUrl = `ws://127.0.0.1:${3030 + offset1}/ws`;
    this._node2WsUrl = `ws://127.0.0.1:${3030 + offset2}/ws`;

    this.node1 = spawn(tsxBin, [nodeEntry, "--profile-dir", this._node1ProfileDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ENVOYMESH_CONFIG_DIR: this._node1ProfileDir,
        ENVOYMESH_PORT_OFFSET: String(offset1),
      },
    });

    this.node2 = spawn(tsxBin, [nodeEntry, "--profile-dir", this._node2ProfileDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ENVOYMESH_CONFIG_DIR: this._node2ProfileDir,
        ENVOYMESH_PORT_OFFSET: String(offset2),
      },
    });

    await Promise.all([
      this.waitForReady(this.node1, "alice", timeout),
      this.waitForReady(this.node2, "bob", timeout),
    ]);

    // Give the mesh a moment to bind TCP listeners after WS is up.
    await delay(1500);

    const alice = await this.fetchLiveInfo(this._node1WsUrl, this._node1ProfileDir, timeout);
    const bob = await this.fetchLiveInfo(this._node2WsUrl, this._node2ProfileDir, timeout);
    this._node1OwnerId = alice.ownerId;
    this._node2OwnerId = bob.ownerId;

    if (!this.opts.skipBonding) {
      this.writeBond(this._node1ProfileDir, bob, "Bob");
      this.writeBond(this._node2ProfileDir, alice, "Alice");
      // Brief pause so file writes settle before Social UI dials.
      await delay(500);
    }

    this.started = true;
    console.log(
      `[node-spawner] Ready alice=${this._node1OwnerId} bob=${this._node2OwnerId} bonded=${!this.opts.skipBonding}`,
    );
  }

  private waitForReady(proc: ChildProcess, label: string, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let buf = "";
      const timer = setTimeout(() => {
        reject(new Error(`[node-spawner] ${label} failed to start within ${timeout}ms\n${buf.slice(-2000)}`));
      }, timeout);

      const onData = (data: Buffer) => {
        const text = data.toString();
        buf += text;
        if (
          text.includes("Listening on ws://") ||
          text.includes("Social WebSocket ready") ||
          text.includes("[ws-server] Listening")
        ) {
          clearTimeout(timer);
          proc.stdout?.off("data", onData);
          proc.stderr?.off("data", onData);
          resolve();
        }
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData);
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`[node-spawner] ${label} exited early with code ${code}\n${buf.slice(-2000)}`));
      });
    });
  }

  private async fetchLiveInfo(wsUrl: string, profileDir: string, timeout: number): Promise<LiveNodeInfo> {
    const deadline = Date.now() + timeout;
    let lastErr: unknown;
    while (Date.now() < deadline) {
      try {
        const profile = this.readProfile(profileDir);
        const status = (await this.rpc(wsUrl, "getConnectionStatus", {})) as {
          peerId?: string;
          multiaddrs?: string[];
        };
        if (profile && status?.peerId) {
          return {
            ownerId: profile.ownerId,
            peerId: status.peerId,
            deviceId: profile.deviceId,
            devicePublicKeyPem: profile.devicePublicKeyPem,
            multiaddrs: status.multiaddrs ?? [],
          };
        }
      } catch (err) {
        lastErr = err;
      }
      await delay(500);
    }
    throw new Error(
      `[node-spawner] timed out fetching live info from ${wsUrl}: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    );
  }

  private readProfile(profileDir: string): {
    ownerId: string;
    deviceId: string;
    devicePublicKeyPem: string;
  } | null {
    const profilePath = path.join(profileDir, "profile.json");
    if (!fs.existsSync(profilePath)) return null;
    try {
      const profile = JSON.parse(fs.readFileSync(profilePath, "utf8")) as {
        owner: { ownerId: string };
        device: { deviceId?: string; publicKeyPem: string };
      };
      return {
        ownerId: profile.owner.ownerId,
        deviceId: profile.device.deviceId ?? "envoy:device:unknown",
        devicePublicKeyPem: profile.device.publicKeyPem,
      };
    } catch {
      return null;
    }
  }

  private rpc(wsUrl: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const WebSocketCtor = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
      if (!WebSocketCtor) {
        reject(new Error("WebSocket is not available in this Node runtime"));
        return;
      }
      const id = `spawner_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ws = new WebSocketCtor(wsUrl);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`RPC ${method} timed out against ${wsUrl}`));
      }, 10_000);

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ id, method, params }));
      });
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            id?: string;
            result?: unknown;
            error?: { message?: string };
          };
          if (msg.id !== id) return;
          clearTimeout(timer);
          ws.close();
          if (msg.error) {
            reject(new Error(msg.error.message ?? `RPC ${method} failed`));
          } else {
            resolve(msg.result);
          }
        } catch (err) {
          clearTimeout(timer);
          ws.close();
          reject(err);
        }
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error connecting to ${wsUrl}`));
      });
    });
  }

  private writeBond(localDir: string, remote: LiveNodeInfo, displayName: string): void {
    const now = new Date().toISOString();
    fs.writeFileSync(
      path.join(localDir, "trust-store.json"),
      JSON.stringify(
        {
          version: "0.1",
          records: [
            {
              version: "0.1",
              peerOwnerId: remote.ownerId,
              level: "direct",
              displayName,
              createdAt: now,
              updatedAt: now,
            },
          ],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(localDir, "peer-directory.json"),
      JSON.stringify(
        {
          version: "0.1",
          records: [
            {
              version: "0.1",
              ownerId: remote.ownerId,
              peerId: remote.peerId,
              deviceId: remote.deviceId,
              devicePublicKeyPem: remote.devicePublicKeyPem,
              lastSeenAt: now,
              listenAddrs: remote.multiaddrs,
            },
          ],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }

  async stop(): Promise<void> {
    if (this.node1) {
      this.node1.kill("SIGTERM");
      this.node1 = undefined;
    }
    if (this.node2) {
      this.node2.kill("SIGTERM");
      this.node2 = undefined;
    }
    this.started = false;
    console.log("[node-spawner] Nodes stopped");
  }
}
