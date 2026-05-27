/**
 * W3C did:key presentation for EnvoyMesh owner Ed25519 keys (Phase 15E first slice).
 * Read-only bridge: `envoy:owner:*` remains canonical; DID is for import/export UX.
 */
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ED25519_SPKI_PREFIX = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);
function decodePemBody(publicKeyPem) {
    const body = publicKeyPem
        .replace(/-----BEGIN PUBLIC KEY-----/g, "")
        .replace(/-----END PUBLIC KEY-----/g, "")
        .replace(/\s/g, "");
    if (typeof Buffer !== "undefined") {
        return new Uint8Array(Buffer.from(body, "base64"));
    }
    return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}
export function ed25519RawPublicKeyFromSpkiPem(publicKeyPem) {
    const der = decodePemBody(publicKeyPem.trim());
    if (der.length !== ED25519_SPKI_PREFIX.length + 32) {
        throw new Error("expected Ed25519 SPKI public key PEM");
    }
    for (let i = 0; i < ED25519_SPKI_PREFIX.length; i += 1) {
        if (der[i] !== ED25519_SPKI_PREFIX[i]) {
            throw new Error("unsupported public key SPKI format (expected Ed25519)");
        }
    }
    return der.subarray(ED25519_SPKI_PREFIX.length);
}
function base58Encode(bytes) {
    let leadingZeros = 0;
    for (const byte of bytes) {
        if (byte !== 0)
            break;
        leadingZeros += 1;
    }
    const digits = [0];
    for (let i = leadingZeros; i < bytes.length; i += 1) {
        let carry = bytes[i];
        for (let j = 0; j < digits.length; j += 1) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let out = "1".repeat(leadingZeros);
    for (let i = digits.length - 1; i >= 0; i -= 1) {
        out += BASE58_ALPHABET[digits[i]];
    }
    return out;
}
export function deriveDidKeyFromEd25519PublicKey(rawPublicKey) {
    if (rawPublicKey.length !== 32) {
        throw new Error("Ed25519 public key must be 32 bytes");
    }
    const prefixed = new Uint8Array(2 + rawPublicKey.length);
    prefixed[0] = 0xed;
    prefixed[1] = 0x01;
    prefixed.set(rawPublicKey, 2);
    return `did:key:z${base58Encode(prefixed)}`;
}
export function buildOwnerDidPresentation(input) {
    const ownerId = input.ownerId.trim();
    if (!ownerId) {
        throw new Error("ownerId is required");
    }
    const raw = ed25519RawPublicKeyFromSpkiPem(input.publicKeyPem);
    const multibase = deriveDidKeyFromEd25519PublicKey(raw).slice("did:key:".length);
    const did = `did:key:${multibase}`;
    const verificationMethodId = `${did}#${multibase}`;
    return {
        did,
        ownerId,
        publicKeyMultibase: multibase,
        document: {
            "@context": ["https://www.w3.org/ns/did/v1"],
            id: did,
            alsoKnownAs: [ownerId],
            verificationMethod: [
                {
                    id: verificationMethodId,
                    type: "Ed25519VerificationKey2020",
                    controller: did,
                    publicKeyMultibase: multibase,
                },
            ],
            authentication: [verificationMethodId],
        },
    };
}
/** Accept `did:key:z…` or canonical `envoy:owner:…` for bonded search. */
export function parseDidLookupInput(raw) {
    const input = raw.trim();
    if (!input)
        return { kind: "invalid" };
    if (input.startsWith("envoy:owner:")) {
        return { kind: "envoy-owner", ownerId: input };
    }
    if (!input.startsWith("did:key:z")) {
        return { kind: "invalid" };
    }
    const multibase = input.slice("did:key:".length);
    if (!multibase.startsWith("z") || multibase.length < 10) {
        return { kind: "invalid" };
    }
    return {
        kind: "did-key",
        did: input,
        publicKeyMultibase: multibase,
    };
}
export function didKeysMatch(left, right) {
    return left.trim() === right.trim();
}
//# sourceMappingURL=owner-did-presentation.js.map