/**
 * Which app am I, and which app made this pairing code?
 *
 * Every product in the EnvoyMesh family mints its own pairing codes, and a phone app
 * belongs to one product. The code says who made it (`PairingPayload.app`), and the
 * **client** refuses a code from another app — this module owns that rule for every
 * client, so a phone, a web UI and a desktop app all say the same sentence.
 *
 * ## Why this is the client's job
 *
 * The node cannot enforce it. A pairing token is opaque: the node validates it against
 * *its own* in-memory QR token, review token or invite, so a token minted by another
 * product's node does not validate here at all. Cross-app pairing arrives when someone
 * *scans* the wrong code and the app dutifully dials the `wsUrl` inside it — and only
 * the app knows both the name in the code and its own name.
 *
 * Living in `@envoymesh/protocol` rather than in a node-side package is deliberate: it
 * is browser-safe and dependency-free, so a web UI can import it without dragging a
 * node runtime into its bundle.
 */

/** The app this process *is*, unless a launcher says otherwise. */
export const DEFAULT_APP_NAME = "EnvoyMesh";

/**
 * The app name for this process.
 *
 * `ENVOYMESH_APP_NAME` exists so a product states it once, in its launcher, rather
 * than a literal appearing in several places.
 */
export function resolveAppName(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env["ENVOYMESH_APP_NAME"]?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_APP_NAME;
}

/**
 * Why a pairing code from another app must be refused, or `null` when it is fine.
 *
 * Returns an **end-user sentence**, not a code: the person holding the phone is the
 * one who has to act on it, and "app mismatch" tells them nothing.
 *
 * `codeApp` undefined means the code predates the field — accepted, because refusing
 * it would break every QR already printed, and the phone still has to authenticate
 * afterwards.
 */
export function pairingAppMismatch(
  codeApp: string | undefined,
  nodeApp: string = resolveAppName(),
): string | null {
  const raw = codeApp?.trim();
  if (!raw) return null;
  const claimed = safeAppLabel(raw);
  const mine = safeAppLabel(nodeApp);
  if (claimed === mine) return null;
  return (
    `That code was made by ${claimed}, and this is ${mine}. ` +
    `Open ${claimed} and show its pairing code, or install ${claimed} here.`
  );
}

/**
 * Bound and sanitise a name before it reaches a dialog.
 *
 * The claimed name comes from a **scanned code**, so it is untrusted text on its way to
 * the user's screen: control characters removed and the length capped, or a crafted QR
 * puts arbitrary content — or a convincing fake instruction — in front of someone who is
 * being asked to trust it.
 */
function safeAppLabel(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.length > 40 ? `${cleaned.slice(0, 40)}…` : cleaned;
}
