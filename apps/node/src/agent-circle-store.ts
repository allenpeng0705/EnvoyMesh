/**
 * Agent Circle Store (Phase 23A)
 * Lightweight JSON-file-backed store for AgentCircle CRUD.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentCircle } from "@envoymesh/api";

const CIRCLES_FILENAME = "agent-circles.json";

export class AgentCircleStore {
  constructor(private readonly profileDir: string) {}

  private filePath(): string {
    return join(this.profileDir, CIRCLES_FILENAME);
  }

  async listCircles(): Promise<AgentCircle[]> {
    try {
      const raw = await readFile(this.filePath(), "utf8");
      return JSON.parse(raw) as AgentCircle[];
    } catch {
      return [];
    }
  }

  async saveCircle(circle: AgentCircle): Promise<void> {
    const circles = await this.listCircles();
    const idx = circles.findIndex((c) => c.circleId === circle.circleId);
    if (idx >= 0) circles[idx] = circle;
    else circles.push(circle);
    await this.writeCircles(circles);
  }

  async deleteCircle(circleId: string): Promise<void> {
    const circles = await this.listCircles();
    await this.writeCircles(circles.filter((c) => c.circleId !== circleId));
  }

  private async writeCircles(circles: AgentCircle[]): Promise<void> {
    await mkdir(this.profileDir, { recursive: true });
    await writeFile(this.filePath(), JSON.stringify(circles, null, 2), { mode: 0o600 });
  }
}
