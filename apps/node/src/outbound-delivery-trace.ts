type TraceFields = Record<string, string | number | boolean | undefined>;

const enabled = process.env.ENVOYMESH_DELIVERY_TRACE === "1";

/** Structured outbound delivery log (enable with ENVOYMESH_DELIVERY_TRACE=1). */
export function outboundDeliveryTrace(event: string, fields?: TraceFields): void {
  if (!enabled) {
    return;
  }
  const payload = fields
    ? Object.entries(fields)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" ")
    : "";
  console.log(`[delivery-trace] ${event}${payload ? ` ${payload}` : ""}`);
}
