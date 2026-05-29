/**
 * Resolve external did:key / DID documents for bonded lookup and hello flows (Phase 15E).
 */
import { type DidKeyDocument } from "./owner-did-presentation.js";
/** Decode multibase `z…` Ed25519 did:key payload (0xed 0x01 + 32 bytes). */
export declare function ed25519RawPublicKeyFromDidKeyMultibase(multibase: string): Uint8Array;
export declare function ed25519SpkiPemFromRawPublicKey(rawPublicKey: Uint8Array): string;
export interface ResolvedDidImport {
    did: string;
    ownerId: string;
    publicKeyPem: string;
    document?: DidKeyDocument;
    source: "did-key" | "did-document";
}
export type ResolveDidImportResult = {
    ok: true;
    resolved: ResolvedDidImport;
} | {
    ok: false;
    reason: string;
};
export declare function parseExternalDidDocumentJson(raw: string): ResolveDidImportResult;
/** Resolve `did:key:…`, `envoy:owner:…`, or a JSON DID document string. */
export declare function resolveDidImportInput(raw: string): ResolveDidImportResult;
/** Verify an existing owner public key PEM matches a did:key string. */
export declare function verifyDidKeyMatchesPublicKeyPem(did: string, publicKeyPem: string): boolean;
//# sourceMappingURL=did-import.d.ts.map