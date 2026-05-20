/**
 * Persists agent share proposals under Capacitor Directory.Data (FS-E parity with desktop).
 */
import type { AgentShareProposal } from "@envoymesh/api";

const REL_PATH = "envoymesh_profile/agent-share-proposals.json";

function _uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function _base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type FileShape = { proposals: AgentShareProposal[] };

async function readAll(): Promise<AgentShareProposal[]> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: REL_PATH,
      directory: Directory.Data,
    });
    const text = new TextDecoder().decode(_base64ToUint8Array(result.data as string));
    const j = JSON.parse(text) as FileShape;
    return Array.isArray(j.proposals) ? j.proposals : [];
  } catch {
    return [];
  }
}

async function writeAll(proposals: AgentShareProposal[]): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const body = `${JSON.stringify({ proposals }, null, 2)}\n`;
  const data = _uint8ArrayToBase64(new TextEncoder().encode(body));
  await Filesystem.writeFile({
    path: REL_PATH,
    data,
    directory: Directory.Data,
  });
}

export async function listMobileAgentShareProposals(): Promise<AgentShareProposal[]> {
  const cur = await readAll();
  return cur.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function upsertMobileAgentShareProposal(proposal: AgentShareProposal): Promise<void> {
  const cur = await readAll();
  const idx = cur.findIndex((p) => p.proposalId === proposal.proposalId);
  if (idx >= 0) cur[idx] = proposal;
  else cur.push(proposal);
  await writeAll(cur);
}

export async function removeMobileAgentShareProposal(proposalId: string): Promise<void> {
  const cur = (await readAll()).filter((p) => p.proposalId !== proposalId);
  await writeAll(cur);
}
