/**
 * Fleet Manifest + WanJoin public-API runtime (Step 30).
 *
 * Extracted from `node-service-impl.ts`. Wraps the existing WanJoin
 * / CompanyInvite / FleetManifest runtimes with the taskStore and
 * audit-event wiring boilerplate.
 *
 * The runtime takes a loose `any`-typed context (the class itself
 * is the only caller, so loose typing is fine). This keeps the
 * runtime file small and focused.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createWanJoinInviteViaRuntime, applyWanJoinInviteViaRuntime } from "./node-service-wan.js";
import { createCompanyInviteViaRuntime, listCompanyInvitesViaRuntime, revokeCompanyInviteViaRuntime } from "./node-service-company-invite.js";
import { createFleetManifestViaRuntime, listFleetManifestsViaRuntime, revokeFleetManifestViaRuntime, importFleetManifestViaRuntime } from "./node-service-fleet-manifest.js";

export type FleetManifestDeps = any;

export function createWanJoinInviteViaPublicRuntime(deps: any, params: any): any {
  return createWanJoinInviteViaRuntime(deps.getWanRuntimeDeps() as never, params) as never;
}

export function applyWanJoinInviteViaPublicRuntime(deps: any, token: any): any {
  return applyWanJoinInviteViaRuntime(deps.getWanRuntimeDeps() as never, token) as never;
}

export async function createCompanyInviteViaPublicRuntime(deps: any, params: any): Promise<any> {
  if (!deps.hasTaskStore()) {
    throw new Error("Local task store is not initialised; cannot create company invite");
  }
  const ctx = await deps.getCompanyInviteInviteContext();
  return createCompanyInviteViaRuntime(
    { taskStore: deps.requireTaskStore() as never, ...ctx },
    params,
  );
}

export function listCompanyInvitesViaPublicRuntime(deps: any): Promise<any> {
  if (!deps.hasTaskStore()) return Promise.resolve({ invites: [] });
  return listCompanyInvitesViaRuntime(deps.requireTaskStore());
}

export async function revokeCompanyInviteViaPublicRuntime(deps: any, inviteId: any): Promise<any> {
  if (!deps.hasTaskStore()) {
    throw new Error("Local task store is not initialised; cannot revoke company invite");
  }
  return revokeCompanyInviteViaRuntime(deps.requireTaskStore() as never, inviteId);
}

export function importFleetManifestViaPublicRuntime(deps: any, params: any): Promise<any> {
  if (!deps.hasTaskStore()) {
    return Promise.resolve({
      ok: false,
      reason: "malformed",
      detail: "task store not initialised",
    });
  }
  return importFleetManifestViaRuntime(
    {
      trustStore: deps.getTrustStore(),
      peerDirectoryStore: deps.getPeerDirectoryStore(),
      manifestStore: deps.getManifestStore(),
      profile: deps.getProfile(),
      appendAudit: (event: any) => deps.appendAudit(event),
    },
    params,
  );
}

export async function listFleetManifestsViaPublicRuntime(deps: any): Promise<any> {
  if (!deps.hasTaskStore()) return Promise.resolve({ manifests: [] });
  const manifests = await listFleetManifestsViaRuntime({
    trustStore: deps.getTrustStore(),
    peerDirectoryStore: deps.getPeerDirectoryStore(),
    manifestStore: deps.getManifestStore(),
    profile: deps.getProfile(),
  });
  return { manifests };
}

export async function revokeFleetManifestViaPublicRuntime(deps: any, manifestId: any): Promise<any> {
  if (!deps.hasTaskStore()) {
    throw new Error("Local task store is not initialised; cannot revoke fleet manifest");
  }
  const result = await revokeFleetManifestViaRuntime(
    {
      trustStore: deps.getTrustStore(),
      peerDirectoryStore: deps.getPeerDirectoryStore(),
      manifestStore: deps.getManifestStore(),
      profile: deps.getProfile(),
      appendAudit: (event: any) => deps.appendAudit(event),
    },
    manifestId,
  );
  if (!result.ok) {
    throw new Error(`Failed to revoke fleet manifest: ${result.reason}`);
  }
  return result;
}

export async function createFleetManifestViaPublicRuntime(deps: any, input: any): Promise<any> {
  const result = await createFleetManifestViaRuntime({ profile: deps.getProfile() }, input);
  if (!("manifest" in result)) {
    throw new Error(
      `Cannot create fleet manifest: ${result.reason} (${result.detail ?? ""})`,
    );
  }
  return { manifest: result.manifest };
}