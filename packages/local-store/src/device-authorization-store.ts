import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
  createDeviceRevocationRecord,
  isDeviceRevoked,
  type CreateDeviceRevocationRecordInput,
} from "@envoymesh/identity";
import type {
  DeviceCertificate,
  DeviceProfile,
  DeviceRevocationRecord,
  DeviceRevocationReason,
} from "@envoymesh/protocol";

const DEVICE_AUTHORIZATION_FILE = "device-authorization.json";

export interface AuthorizedDeviceRecord {
  deviceId: string;
  devicePublicKeyPem: string;
  certificateId: string;
  deviceProfile: DeviceProfile;
  displayName?: string;
  pairedAt: string;
  lastSeenAt?: string;
}

export interface AuthorizedDeviceSummary {
  deviceId: string;
  certificateId: string;
  deviceProfile: DeviceProfile;
  displayName?: string;
  pairedAt: string;
  lastSeenAt?: string;
  revoked: boolean;
}

interface DeviceAuthorizationFile {
  version: "0.1";
  authorizedDevices: AuthorizedDeviceRecord[];
  revocations: DeviceRevocationRecord[];
}

export interface DeviceAuthorizationStore {
  listAuthorizedDevices(): Promise<AuthorizedDeviceSummary[]>;
  listRevocations(): Promise<DeviceRevocationRecord[]>;
  registerAuthorizedDevice(input: AuthorizedDeviceRecord): Promise<void>;
  revokeDevice(input: {
    owner: CreateDeviceRevocationRecordInput["owner"];
    deviceId: string;
    certificateId?: string;
    reason?: DeviceRevocationReason;
  }): Promise<DeviceRevocationRecord>;
  /**
   * Merge duplicate authorized-device records into one canonical record.
   * The record identified by `keepDeviceId` is preserved; every record
   * in `mergeDeviceIds` is removed from the authorized list and a
   * revocation record is added for each (reason = `reason` or
   * "deduplicated" by default).
   *
   * This is the cleanup path for historical duplicates created before
   * the mobile app started reusing a stable device keypair across
   * re-pairs. Returns the new revocation records in the order they
   * were created. Atomic: either every merge succeeds or the store is
   * left untouched.
   */
  mergeAuthorizedDevices(input: {
    owner: CreateDeviceRevocationRecordInput["owner"];
    keepDeviceId: string;
    mergeDeviceIds: string[];
    reason?: DeviceRevocationReason;
  }): Promise<DeviceRevocationRecord[]>;
  /**
   * Drop every authorized-device entry that has a matching revocation
   * record. `revokeDevice` keeps the entry in `authorizedDevices` and
   * just adds a revocation record (so the entry shows as `revoked: true`
   * in `listAuthorizedDevices()`). This method cleans those orphan
   * revoked entries out of the authorized list while keeping the
   * revocation records themselves (for audit history). Returns the
   * deviceIds that were pruned.
   *
   * Use case: the historical "Clean up" flow in Settings, after a user
   * has revoked some devices and wants them gone from the list.
   */
  pruneRevokedDevices(): Promise<string[]>;
  isCertificateRevoked(
    certificate: DeviceCertificate,
    ownerPublicKeyPem: string,
  ): Promise<boolean>;
}

export function createDeviceAuthorizationStore(profileDir: string): DeviceAuthorizationStore {
  const filePath = join(profileDir, DEVICE_AUTHORIZATION_FILE);
  let mutex: Promise<DeviceAuthorizationFile> = readFileState();

  async function readFileState(): Promise<DeviceAuthorizationFile> {
    try {
      const raw = await readFile(filePath, "utf8");
      if (!raw.trim()) {
        return emptyState();
      }
      const data = JSON.parse(raw) as DeviceAuthorizationFile;
      return {
        version: "0.1",
        authorizedDevices: Array.isArray(data?.authorizedDevices) ? data.authorizedDevices : [],
        revocations: Array.isArray(data?.revocations) ? data.revocations : [],
      };
    } catch (error) {
      if (isMissingFileError(error)) {
        return emptyState();
      }
      console.warn(
        `[device-authorization-store] failed to read ${basename(filePath)}, starting fresh: ${error instanceof Error ? error.message : String(error)}`,
      );
      return emptyState();
    }
  }

  async function writeFileState(state: DeviceAuthorizationFile): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    const content = JSON.stringify(state, null, 2) + "\n";
    JSON.parse(content);
    const tmpPath = `${filePath}.tmp.${Date.now()}.${randomUUID().slice(0, 8)}`;
    await writeFile(tmpPath, content, { mode: 0o600 });
    await rename(tmpPath, filePath);
  }

  function serialised<T>(
    fn: (state: DeviceAuthorizationFile) => Promise<{ state: DeviceAuthorizationFile; result: T }>,
  ): Promise<T> {
    const prev = mutex;
    let resolveOuter!: (value: T) => void;
    let rejectOuter!: (reason?: unknown) => void;
    const outerPromise = new Promise<T>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;
    });

    mutex = prev.then(async (state) => {
      try {
        const { state: next, result } = await fn(state);
        await writeFileState(next);
        resolveOuter(result);
        return next;
      } catch (error) {
        rejectOuter(error);
        try {
          return await readFileState();
        } catch {
          return emptyState();
        }
      }
    });
    mutex.catch(() => {});
    return outerPromise;
  }

  return {
    async listAuthorizedDevices(): Promise<AuthorizedDeviceSummary[]> {
      const state = await readFileState();
      const revokedDeviceIds = new Set(
        state.revocations.map((record) => record.deviceId),
      );
      return state.authorizedDevices.map((device) => ({
        deviceId: device.deviceId,
        certificateId: device.certificateId,
        deviceProfile: device.deviceProfile,
        displayName: device.displayName,
        pairedAt: device.pairedAt,
        lastSeenAt: device.lastSeenAt,
        revoked: revokedDeviceIds.has(device.deviceId),
      }));
    },

    async listRevocations(): Promise<DeviceRevocationRecord[]> {
      const state = await readFileState();
      return [...state.revocations];
    },

    async registerAuthorizedDevice(input: AuthorizedDeviceRecord): Promise<void> {
      await serialised<void>(async (state) => {
        const idx = state.authorizedDevices.findIndex((d) => d.deviceId === input.deviceId);
        if (idx >= 0) {
          // Re-pair of the same device: keep the original `pairedAt` (the
          // date the device was first authorized on this home node) and
          // refresh `lastSeenAt` so the UI can show "last seen" without
          // losing the original pairing date. All other fields (cert id,
          // public key, display name) come from the freshest input.
          const previous = state.authorizedDevices[idx]!;
          state.authorizedDevices[idx] = {
            ...previous,
            ...input,
            pairedAt: previous.pairedAt,
            lastSeenAt: input.pairedAt,
          };
        } else {
          state.authorizedDevices.push(input);
        }
        return { state, result: undefined };
      });
    },

    async revokeDevice(input): Promise<DeviceRevocationRecord> {
      return serialised(async (state) => {
        const device = state.authorizedDevices.find((d) => d.deviceId === input.deviceId);
        const record = createDeviceRevocationRecord({
          owner: input.owner,
          deviceId: input.deviceId,
          certificateId: input.certificateId ?? device?.certificateId,
          reason: input.reason ?? "retired",
        });
        state.revocations = state.revocations.filter(
          (existing) => existing.deviceId !== input.deviceId,
        );
        state.revocations.push(record);
        return { state, result: record };
      });
    },

    async mergeAuthorizedDevices(input): Promise<DeviceRevocationRecord[]> {
      return serialised(async (state) => {
        // Sanity-check the keep entry exists. Without it the merge
        // would silently destroy authorization history.
        const keep = state.authorizedDevices.find((d) => d.deviceId === input.keepDeviceId);
        if (!keep) {
          throw new Error(
            `Cannot merge: keepDeviceId "${input.keepDeviceId}" is not in the authorized devices list`,
          );
        }
        // Dedupe + drop the keep entry from the merge list, in case
        // the caller accidentally included it.
        const mergeSet = new Set(
          input.mergeDeviceIds.filter((id) => id !== input.keepDeviceId),
        );
        if (mergeSet.size === 0) {
          return { state, result: [] as DeviceRevocationRecord[] };
        }

        // Build the revocation records first so we can fail loudly if
        // any of the merge targets are unknown.
        const records: DeviceRevocationRecord[] = [];
        for (const deviceId of mergeSet) {
          const device = state.authorizedDevices.find((d) => d.deviceId === deviceId);
          if (!device) {
            throw new Error(
              `Cannot merge: deviceId "${deviceId}" is not in the authorized devices list`,
            );
          }
          records.push(
            createDeviceRevocationRecord({
              owner: input.owner,
              deviceId,
              certificateId: device.certificateId,
              reason: input.reason ?? "deduplicated",
            }),
          );
        }

        // Apply the merge: drop the duplicate records and append the
        // revocations, replacing any existing revocations for the
        // merged devices (so the store stays consistent).
        state.authorizedDevices = state.authorizedDevices.filter(
          (d) => !mergeSet.has(d.deviceId),
        );
        state.revocations = state.revocations.filter(
          (existing) => !mergeSet.has(existing.deviceId),
        );
        state.revocations.push(...records);
        return { state, result: records };
      });
    },

    async pruneRevokedDevices(): Promise<string[]> {
      return serialised(async (state) => {
        // Build the set of deviceIds that have any revocation record.
        // A device is considered revoked if there is a revocation
        // record for it (revocations are append-only — the store never
        // deletes them, it just adds new ones).
        const revokedIds = new Set(state.revocations.map((r) => r.deviceId));
        const pruned: string[] = [];
        state.authorizedDevices = state.authorizedDevices.filter((d) => {
          if (revokedIds.has(d.deviceId)) {
            pruned.push(d.deviceId);
            return false;
          }
          return true;
        });
        return { state, result: pruned };
      });
    },

    async isCertificateRevoked(certificate, ownerPublicKeyPem): Promise<boolean> {
      const state = await readFileState();
      return isDeviceRevoked(certificate, state.revocations, ownerPublicKeyPem);
    },
  };
}

function emptyState(): DeviceAuthorizationFile {
  return { version: "0.1", authorizedDevices: [], revocations: [] };
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}
