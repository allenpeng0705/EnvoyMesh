export type TransferPhase = "negotiating" | "transferring" | "verified" | "failed";
export interface TransferStatus {
    correlationId: string;
    phase: TransferPhase;
    bytesTransferred?: number;
    totalBytes?: number;
    remotePeerOwnerId?: string;
    remotePeerId?: string;
    vaultRelativePath?: string;
    error?: string;
    updatedAt: string;
}
//# sourceMappingURL=transfer-status.d.ts.map