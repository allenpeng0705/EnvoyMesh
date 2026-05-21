/**
 * Append-only mobile audit log (Capacitor Directory.Data + localStorage fallback).
 * Mirrors desktop JSONL audit shape for IPFS export observability.
 */
const REL_PATH = "envoymesh_profile/audit.jsonl";

export interface MobileAuditRecord {
  eventId: string;
  createdAt: string;
  type: string;
  outcome: "allow" | "deny" | "record";
  summary: string;
  correlationId?: string;
  latencyMs?: number;
  direction?: "local" | "inbound" | "outbound";
}

function _localStorageKey(profileDir: string): string {
  return `envoymesh_mobile_audit:${profileDir}`;
}

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

async function _readExistingLines(profileDir: string): Promise<string> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const result = await Filesystem.readFile({
      path: REL_PATH,
      directory: Directory.Data,
    });
    return new TextDecoder().decode(_base64ToUint8Array(result.data as string));
  } catch {
    try {
      return typeof localStorage !== "undefined"
        ? (localStorage.getItem(_localStorageKey(profileDir)) ?? "")
        : "";
    } catch {
      return "";
    }
  }
}

async function _appendLine(profileDir: string, line: string): Promise<void> {
  const existing = await _readExistingLines(profileDir);
  const body = `${existing}${line}`;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: REL_PATH,
      data: _uint8ArrayToBase64(new TextEncoder().encode(body)),
      directory: Directory.Data,
    });
    return;
  } catch {
    /* fall through */
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(_localStorageKey(profileDir), body);
    }
  } catch {
    /* ignore */
  }
}

export async function appendMobileAuditEvent(
  profileDir: string,
  record: MobileAuditRecord,
): Promise<void> {
  const line = `${JSON.stringify(record)}\n`;
  await _appendLine(profileDir, line);
}

export function createMobileAuditRecord(
  input: Omit<MobileAuditRecord, "eventId" | "createdAt">,
): MobileAuditRecord {
  return {
    eventId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...input,
  };
}
