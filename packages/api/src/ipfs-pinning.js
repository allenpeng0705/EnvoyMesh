const PROVIDER_ENV = {
    pinata: "ENVOYMESH_PINATA_JWT",
    web3storage: "ENVOYMESH_WEB3_STORAGE_TOKEN",
};
async function pinViaPinata(cid, name, jwt) {
    const response = await fetch("https://api.pinata.cloud/pinning/pinByHash", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            hashToPin: cid,
            pinataMetadata: name ? { name } : undefined,
        }),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
            ok: false,
            error: `Pinata pin failed (${response.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
        };
    }
    let pinId;
    try {
        const body = (await response.json());
        pinId = body.id;
    }
    catch {
        pinId = undefined;
    }
    return { ok: true, provider: "pinata", pinId };
}
async function pinViaWeb3Storage(cid, token) {
    const response = await fetch("https://api.web3.storage/pins", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ cid }),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        return {
            ok: false,
            error: `web3.storage pin failed (${response.status})${text ? `: ${text.slice(0, 160)}` : ""}`,
        };
    }
    let pinId;
    try {
        const body = (await response.json());
        pinId = body.requestid ?? body.cid;
    }
    catch {
        pinId = undefined;
    }
    return { ok: true, provider: "web3storage", pinId };
}
/** Pin an exported CID via a configured external provider (Phase 14D). */
export async function pinCidToProvider(input) {
    const provider = input.provider ?? "pinata";
    if (provider !== "pinata" && provider !== "web3storage") {
        return { ok: false, error: `Unsupported pinning provider: ${provider}` };
    }
    const envVar = input.secretEnvVar?.trim() || PROVIDER_ENV[provider];
    const secret = process.env[envVar]?.trim();
    if (!secret) {
        return {
            ok: false,
            error: `Pinning not configured (set ${envVar} for ${provider})`,
        };
    }
    if (provider === "web3storage") {
        return pinViaWeb3Storage(input.cid, secret);
    }
    return pinViaPinata(input.cid, input.name, secret);
}
//# sourceMappingURL=ipfs-pinning.js.map