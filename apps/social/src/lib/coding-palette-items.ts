/**
 * Coding command palette items — metadata only (not transcript search).
 * @see docs/product_coding_tab_design.md §0
 */

import {
  codingHarnessLabel,
  type CodingHarnessId,
} from "@envoymesh/api";
import type { CodingProject } from "./coding-projects.js";
import type { CodingSessionRef } from "./coding-session-ref.js";

export type CodingPaletteItemKind =
  | "project"
  | "task"
  | "action"
  | "file";

export type CodingPaletteAction =
  | { type: "select-session"; ref: CodingSessionRef }
  | { type: "focus-project"; path: string }
  | { type: "new-task"; projectPath?: string }
  | { type: "add-project" }
  | { type: "open-settings" }
  | { type: "invite-peer" }
  | { type: "new-schedule" }
  | { type: "open-file"; path: string; chatId?: string };

export type CodingPaletteItem = {
  id: string;
  kind: CodingPaletteItemKind;
  /** Primary searchable / display label. */
  label: string;
  /** Secondary line (path, harness, …). */
  detail?: string;
  path?: string;
  harness?: string;
  action: CodingPaletteAction;
};

export type CodingPaletteTaskInput = {
  kind: "eh" | "pi" | "ext";
  id: string;
  title: string;
  cwd: string;
  harnessLabel: string;
  ref: CodingSessionRef;
};

export type BuildCodingPaletteItemsInput = {
  projects: CodingProject[];
  tasks: CodingPaletteTaskInput[];
  /** Top-level files under the focused project cwd (optional). */
  cwdFiles?: Array<{ name: string; path: string }>;
  /** For open-file EH context. */
  focusedEhChatId?: string | null;
  /** Include Invite peer when an EH task is selected. */
  canInvitePeer?: boolean;
  /** Include Open Coding settings. */
  canOpenSettings?: boolean;
  labels?: {
    newTask?: string;
    addProject?: string;
    openSettings?: string;
    invitePeer?: string;
    newSchedule?: string;
  };
};

/** Case-insensitive includes score — higher is better; 0 = no match. */
export function scoreCodingPaletteItem(
  item: CodingPaletteItem,
  query: string,
): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const label = item.label.toLowerCase();
  const path = (item.path ?? "").toLowerCase();
  const harness = (item.harness ?? "").toLowerCase();
  const detail = (item.detail ?? "").toLowerCase();
  let score = 0;
  if (label === q) score += 100;
  else if (label.startsWith(q)) score += 60;
  else if (label.includes(q)) score += 40;
  if (path.includes(q)) score += 25;
  if (harness.includes(q)) score += 20;
  if (detail.includes(q)) score += 10;
  // Multi-token: every token must hit something.
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const hay = `${label} ${path} ${harness} ${detail}`;
    if (!tokens.every((t) => hay.includes(t))) return 0;
    score += tokens.length * 5;
  }
  return score;
}

export function filterCodingPaletteItems(
  items: CodingPaletteItem[],
  query: string,
): CodingPaletteItem[] {
  const scored = items
    .map((item) => ({ item, score: scoreCodingPaletteItem(item, query) }))
    .filter((r) => r.score > 0);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.item.label.localeCompare(b.item.label);
  });
  return scored.map((r) => r.item);
}

export function buildCodingPaletteItems(
  input: BuildCodingPaletteItemsInput,
): CodingPaletteItem[] {
  const labels = input.labels ?? {};
  const items: CodingPaletteItem[] = [];

  items.push({
    id: "action:new-task",
    kind: "action",
    label: labels.newTask ?? "New task",
    detail: "Action",
    action: { type: "new-task" },
  });
  items.push({
    id: "action:new-schedule",
    kind: "action",
    label: labels.newSchedule ?? "New schedule",
    detail: "Action",
    action: { type: "new-schedule" },
  });
  items.push({
    id: "action:add-project",
    kind: "action",
    label: labels.addProject ?? "Add project",
    detail: "Action",
    action: { type: "add-project" },
  });
  if (input.canOpenSettings) {
    items.push({
      id: "action:open-settings",
      kind: "action",
      label: labels.openSettings ?? "Open Coding settings",
      detail: "Action",
      action: { type: "open-settings" },
    });
  }
  if (input.canInvitePeer) {
    items.push({
      id: "action:invite-peer",
      kind: "action",
      label: labels.invitePeer ?? "Invite peer to review",
      detail: "Action",
      action: { type: "invite-peer" },
    });
  }

  for (const project of input.projects) {
    items.push({
      id: `project:${project.path}`,
      kind: "project",
      label: project.label || project.path,
      detail: project.path,
      path: project.path,
      action: { type: "focus-project", path: project.path },
    });
  }

  for (const ws of input.tasks) {
    items.push({
      id: `task:${ws.kind}:${ws.id}`,
      kind: "task",
      label: ws.title,
      detail: `${ws.harnessLabel} · ${ws.cwd}`,
      path: ws.cwd,
      harness: ws.harnessLabel,
      action: { type: "select-session", ref: ws.ref },
    });
  }

  for (const file of input.cwdFiles ?? []) {
    items.push({
      id: `file:${file.path}`,
      kind: "file",
      label: file.name,
      detail: file.path,
      path: file.path,
      action: {
        type: "open-file",
        path: file.path,
        chatId: input.focusedEhChatId ?? undefined,
      },
    });
  }

  return items;
}

/** Convenience harness label for palette task rows. */
export function paletteHarnessLabel(
  kind: "eh" | "pi" | "ext",
  harness?: CodingHarnessId,
): string {
  if (kind === "eh") return codingHarnessLabel("envoy-harness");
  if (kind === "pi") return "Pi";
  if (harness) return codingHarnessLabel(harness);
  return "Ext";
}
