/** Mirrors SessionTokenRecord from @envoymesh/local-store for mobile. */
export interface SessionTokenRecord {
  token: string;
  ownerId: string;
  deviceId: string;
  displayName?: string;
  createdAt: string;
  lastUsedAt: string;
}
