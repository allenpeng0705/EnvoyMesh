import type { BondRecord, DiscoverPublishedLibraryParams, DiscoverPublishedLibraryPeerResult, PublishedLibraryFileHit, SendChatResult } from "./node-service.js";
export interface LibraryRequestShareInput {
    /** Bonded contact owner id or display-name hint (resolved via bonds). */
    targetOwnerHint: string;
    fileTitleQuery?: string;
    relativePath?: string;
    contentHashPrefix?: string;
}
export interface LibraryRequestShareDeps {
    getBonds: () => Promise<BondRecord[]>;
    discoverPublishedLibrary: (params?: DiscoverPublishedLibraryParams) => Promise<DiscoverPublishedLibraryPeerResult[]>;
    sendChat: (targetOwnerId: string, text: string) => Promise<SendChatResult | void>;
}
export interface LibraryRequestShareResult {
    targetOwnerId: string;
    targetDisplayName?: string;
    matches: PublishedLibraryFileHit[];
    chatText: string;
}
export declare function runLibraryRequestShare(deps: LibraryRequestShareDeps, input: LibraryRequestShareInput): Promise<{
    ok: true;
    result: LibraryRequestShareResult;
} | {
    ok: false;
    error: string;
}>;
//# sourceMappingURL=library-request-share.d.ts.map