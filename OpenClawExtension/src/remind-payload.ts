export interface EnvoymeshCronReminderPayload {
  type: "cron_reminder";
  content: string;
  targetAddress: string;
}

const CRON_PREFIX = "ENVOYMESH_CRON:";

function normalizeBase64ForCompare(value: string): string {
  return value.replace(/=+$/u, "").replace(/-/gu, "+").replace(/_/gu, "/");
}

function decodeStrictBase64Utf8(value: string): string {
  const buffer = Buffer.from(value, "base64");
  if (normalizeBase64ForCompare(buffer.toString("base64")) !== normalizeBase64ForCompare(value)) {
    throw new Error("Cron payload body is not valid base64");
  }
  return buffer.toString("utf-8");
}

export function encodeEnvoymeshCronPayload(payload: EnvoymeshCronReminderPayload): string {
  const jsonString = JSON.stringify(payload);
  const base64 = Buffer.from(jsonString, "utf-8").toString("base64");
  return `${CRON_PREFIX}${base64}`;
}

export function decodeEnvoymeshCronPayload(message: string): {
  isCronPayload: boolean;
  payload?: EnvoymeshCronReminderPayload;
  error?: string;
} {
  const trimmedMessage = message.trim();
  if (!trimmedMessage.startsWith(CRON_PREFIX)) {
    return { isCronPayload: false };
  }

  const base64Content = trimmedMessage.slice(CRON_PREFIX.length);
  if (!base64Content) {
    return { isCronPayload: true, error: "Cron payload body is empty" };
  }

  try {
    const jsonString = decodeStrictBase64Utf8(base64Content);
    const payload = JSON.parse(jsonString) as EnvoymeshCronReminderPayload;
    if (payload.type !== "cron_reminder") {
      return {
        isCronPayload: true,
        error: `Expected type cron_reminder but got ${String(payload.type)}`,
      };
    }
    if (!payload.content?.trim() || !payload.targetAddress?.trim()) {
      return { isCronPayload: true, error: "Cron payload is missing required fields" };
    }
    return { isCronPayload: true, payload };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { isCronPayload: true, error: `Failed to decode cron payload: ${msg}` };
  }
}

export function formatReminderDeliveryText(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (/^⏰/u.test(trimmed)) {
    return trimmed;
  }
  return `⏰ ${trimmed}`;
}
