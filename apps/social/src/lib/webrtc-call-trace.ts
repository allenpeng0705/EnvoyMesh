/** Structured `[webrtc-call]` logs for end-to-end voice call debugging (Social UI). */

let seq = 0;

export function shortCallId(value: string | undefined | null): string {
  const v = value?.trim() ?? "";
  if (!v) return "(none)";
  return v.length <= 16 ? v : `${v.slice(0, 12)}…`;
}

function formatDetail(detail: Record<string, unknown> | string | undefined): string {
  if (detail === undefined) return "";
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function webrtcCallTrace(phase: string, detail?: Record<string, unknown> | string): void {
  seq += 1;
  const suffix = formatDetail(detail);
  if (suffix) {
    console.log(`[webrtc-call] #${seq} ${phase} ${suffix}`);
  } else {
    console.log(`[webrtc-call] #${seq} ${phase}`);
  }
}

export function webrtcCallWarn(phase: string, detail?: Record<string, unknown> | string): void {
  seq += 1;
  const suffix = formatDetail(detail);
  if (suffix) {
    console.warn(`[webrtc-call] #${seq} ${phase} ${suffix}`);
  } else {
    console.warn(`[webrtc-call] #${seq} ${phase}`);
  }
}
