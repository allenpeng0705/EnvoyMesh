"""Step 47 — wire 4 small profile/did delegations."""
import sys

p = "apps/node/src/node-service-impl.ts"
with open(p) as f:
    c = f.read()

# 1. Add the import.
ANCHOR = "} from \"./node-service-handlers-validate-pairing-token.js\";"
if ANCHOR not in c:
    sys.exit("import anchor not found")
NEW = ANCHOR + """

import {
  cacheDidContactKeyViaRuntime,
  setPublicProfileThumbnailViaRuntime,
  getAgentIdentityViaRuntime,
  updateAgentIdentityViaRuntime,
  type SmallProfileDelegationsContext,
} from "./node-service-handlers-small-profile-delegations.js";"""
c = c.replace(ANCHOR, NEW, 1)
print("import added")

# 2. Replace each method body.
REPLACEMENTS = [
    # cacheDidContactKey
    (
        '''  async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
    if (!this._contactOwnerKeyStore) {
      return { ok: false, reason: "contact owner key store unavailable" };
    }
    const ownerId = params.ownerId.trim();
    const publicKeyPem = params.publicKeyPem.trim();
    if (!ownerId || !publicKeyPem) {
      return { ok: false, reason: "ownerId and publicKeyPem are required" };
    }
    await this._contactOwnerKeyStore.upsert(ownerId, publicKeyPem);
    return { ok: true };
  }''',
        '''  async cacheDidContactKey(params: { ownerId: string; publicKeyPem: string }) {
    return cacheDidContactKeyViaRuntime(this._smallProfileDelegationsContext(), params);
  }''',
    ),
    # setPublicProfileThumbnail
    (
        '''  async setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile> {
    const mime = parseProfilePhotoMime(params.mimeType);
    const imported = await importProfilePhotoBytes({
      vaultDir: this._vaultDir,
      relativePath: profileThumbnailVaultPath(mime),
      contentBase64: params.contentBase64,
      mimeType: mime,
      maxBytes: MAX_PROFILE_THUMBNAIL_BYTES,
    });
    const publicThumbnail = ProfilePhotoRefSchema.parse(imported);
    const { base } = await this._loadHumanProfileForPhotoUpdate();
    return this._signAndSaveHumanProfile({ ...base, publicThumbnail });
  }''',
        '''  async setPublicProfileThumbnail(params: SetPublicProfileThumbnailParams): Promise<HumanProfile> {
    return setPublicProfileThumbnailViaRuntime(this._smallProfileDelegationsContext(), params);
  }''',
    ),
    # getAgentIdentity
    (
        '''  async getAgentIdentity(): Promise<AgentIdentityDocument> {
    if (!this._agentIdentityStore) {
      throw new Error("Profile directory not initialized");
    }
    return this._agentIdentityStore.load();
  }''',
        '''  async getAgentIdentity(): Promise<AgentIdentityDocument> {
    return getAgentIdentityViaRuntime(this._smallProfileDelegationsContext());
  }''',
    ),
    # updateAgentIdentity
    (
        '''  async updateAgentIdentity(content: string): Promise<AgentIdentityDocument> {
    this._assertOnline();
    if (!this._agentIdentityStore) {
      throw new Error("Profile directory not initialized");
    }
    return this._agentIdentityStore.save(content);
  }''',
        '''  async updateAgentIdentity(content: string): Promise<AgentIdentityDocument> {
    return updateAgentIdentityViaRuntime(this._smallProfileDelegationsContext(), content);
  }''',
    ),
]

for old, new in REPLACEMENTS:
    if old not in c:
        sys.exit(f"NOT FOUND: {old[:60]!r}")
    c = c.replace(old, new, 1)
print(f"replaced {len(REPLACEMENTS)} methods")

# 3. Add the factory right before the next-existing factory.
ANCHOR = "  private _validatePairingTokenContext(): ValidatePairingTokenContext {"
FACTORY = """  private _smallProfileDelegationsContext(): SmallProfileDelegationsContext {
    return {
      getContactOwnerKeyStore: () => this._contactOwnerKeyStore ?? undefined,
      getVaultDir: () => this._vaultDir,
      signAndSaveHumanProfile: (update) =>
        this._signAndSaveHumanProfile(update as never),
      loadHumanProfileForPhotoUpdate: () =>
        this._loadHumanProfileForPhotoUpdate() as Promise<{ base: any; existing: any }>,
      getAgentIdentityStore: () => this._agentIdentityStore ?? undefined,
      assertOnline: () => this._assertOnline(),
    };
  }

""" + ANCHOR
c = c.replace(ANCHOR, FACTORY, 1)
print("factory added")

with open(p, "w") as f:
    f.write(c)
print("OK")