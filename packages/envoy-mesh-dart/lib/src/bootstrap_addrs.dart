/// Community relay / DHT bootstrap constants — keep in sync with
/// `packages/api/src/default-bootstrap.ts`.
library;

/// EnvoyMesh community relay — Asia (`cn-relay`).
const String defaultEnvoyCommunityRelayBootstrapAddr =
    '/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo';

/// EnvoyMesh community relay — US (`us-relay`).
const String defaultEnvoyUsRelayBootstrapAddr =
    '/ip4/47.251.91.97/tcp/4001/p2p/12D3KooWAWiVSpsCjpjauz83ijLugxwScRJi89N4PA1VQ1Czsncb';

const List<String> defaultEnvoyCommunityRelayBootstrapAddrs = [
  defaultEnvoyCommunityRelayBootstrapAddr,
  defaultEnvoyUsRelayBootstrapAddr,
];

/// Extract `/p2p/<peerId>` suffix from a multiaddr, or null.
String? peerIdFromBootstrapMultiaddr(String addr) {
  final idx = addr.lastIndexOf('/p2p/');
  if (idx < 0) return null;
  final id = addr.substring(idx + 5);
  if (id.isEmpty || id.contains('/')) return null;
  return id;
}
