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

/// True for dialable libp2p TCP multiaddrs (`/ip4|ip6/.../tcp/.../p2p/...`).
///
/// Pairing often mixes WebSocket relay URLs into `bootstrapPeers` — those
/// must not be fed to [Libp2pNode.start] or cold start stalls on bad dials.
bool isLibp2pTcpBootstrapMultiaddr(String addr) {
  final a = addr.trim();
  if (a.isEmpty || !a.startsWith('/')) return false;
  if (a.startsWith('ws:') ||
      a.startsWith('wss:') ||
      a.startsWith('http:') ||
      a.startsWith('https:')) {
    return false;
  }
  if (!a.contains('/tcp/') || !a.contains('/p2p/')) return false;
  return peerIdFromBootstrapMultiaddr(a) != null;
}

/// Keep only TCP `/p2p/` multiaddrs; drop WS/HTTP relay URLs.
List<String> filterLibp2pTcpBootstrapAddrs(Iterable<String> addrs) {
  final out = <String>[];
  final seen = <String>{};
  for (final raw in addrs) {
    final a = raw.trim();
    if (!isLibp2pTcpBootstrapMultiaddr(a)) continue;
    if (!seen.add(a)) continue;
    out.add(a);
  }
  return out;
}

/// Extract `/p2p/<peerId>` suffix from a multiaddr, or null.
String? peerIdFromBootstrapMultiaddr(String addr) {
  final idx = addr.lastIndexOf('/p2p/');
  if (idx < 0) return null;
  final id = addr.substring(idx + 5);
  if (id.isEmpty || id.contains('/')) return null;
  return id;
}
