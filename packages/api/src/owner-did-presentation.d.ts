/**
 * W3C did:key presentation for EnvoyMesh owner Ed25519 keys (Phase 15E first slice).
 * Read-only bridge: `envoy:owner:*` remains canonical; DID is for import/export UX.
 */
export interface DidKeyDocument {
    "@context": string | string[];
    id: string;
    alsoKnownAs?: string[];
    verificationMethod: Array<{
        id: string;
        type: "Ed25519VerificationKey2020";
        controller: string;
        publicKeyMultibase: string;
    }>;
    authentication: string[];
}
export interface OwnerDidPresentation {
    did: string;
    ownerId: string;
    publicKeyMultibase: string;
    document: DidKeyDocument;
}
export declare function ed25519RawPublicKeyFromSpkiPem(publicKeyPem: string): Uint8Array;
export declare function deriveDidKeyFromEd25519PublicKey(rawPublicKey: Uint8Array): string;
export declare function buildOwnerDidPresentation(input: {
    ownerId: string;
    publicKeyPem: string;
}): OwnerDidPresentation;
export type DidLookupInputKind = "did-key" | "envoy-owner" | "invalid";
export interface ParsedDidLookupInput {
    kind: DidLookupInputKind;
    did?: string;
    ownerId?: string;
    publicKeyMultibase?: string;
}
/** Accept `did:key:z…` or canonical `envoy:owner:…` for bonded search. */
export declare function parseDidLookupInput(raw: string): ParsedDidLookupInput;
export declare function didKeysMatch(left: string, right: string): boolean;
//# sourceMappingURL=owner-did-presentation.d.ts.map