/**
 * Capacitor Secure Storage adapter implementing the SecureStorage interface.
 *
 * Wraps capacitor-secure-storage-plugin to store private keys in
 * iOS Keychain / Android EncryptedSharedPreferences.
 * Only usable within the Capacitor runtime context.
 */
import type { SecureStorage } from "@envoymesh/mobile-storage";

export class CapacitorSecureStorage implements SecureStorage {
  async set(key: string, value: string): Promise<void> {
    const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
    await SecureStoragePlugin.set({ key, value });
  }

  async get(key: string): Promise<string | undefined> {
    const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
    try {
      const result = await SecureStoragePlugin.get({ key });
      return result.value as string | undefined;
    } catch {
      return undefined;
    }
  }

  async remove(key: string): Promise<void> {
    const { SecureStoragePlugin } = await import("capacitor-secure-storage-plugin");
    await SecureStoragePlugin.remove({ key });
  }
}
