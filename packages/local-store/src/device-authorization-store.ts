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
          state.authorizedDevices[idx] = { ...state.authorizedDevices[idx], ...input };
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
