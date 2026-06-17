/**
 * Phase 35D — pairing-kiosk status snapshot.
 *
 * Surfaced by `NodeService.getPairingKioskStatus()` so the Settings → Devices
 * tab can show "Kiosk: running at http://192.168.1.10:3737" and otherwise
 * hide the field.
 */
export interface PairingKioskStatus {
  enabled: boolean;
  running: boolean;
  address?: string;
  port?: number;
  bindLan: boolean;
  expiresAt?: string;
}
