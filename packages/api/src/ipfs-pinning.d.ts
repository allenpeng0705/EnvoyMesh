export type IpfsPinningProvider = "pinata" | "web3storage";
export interface PinCidInput {
    cid: string;
    name?: string;
    provider?: IpfsPinningProvider;
    /** Env var holding provider JWT/secret. */
    secretEnvVar?: string;
}
export type PinCidResult = {
    ok: true;
    provider: IpfsPinningProvider;
    pinId?: string;
} | {
    ok: false;
    error: string;
};
/** Pin an exported CID via a configured external provider (Phase 14D). */
export declare function pinCidToProvider(input: PinCidInput): Promise<PinCidResult>;
//# sourceMappingURL=ipfs-pinning.d.ts.map