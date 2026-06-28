/// libp2p reachability for a bonded contact (from the home node's mesh view).
class PeerConnectionInfo {
  final bool connected;
  final bool direct;
  final String? relayPeerId;

  const PeerConnectionInfo({
    required this.connected,
    required this.direct,
    this.relayPeerId,
  });

  factory PeerConnectionInfo.fromJson(Map<String, dynamic> json) {
    return PeerConnectionInfo(
      connected: json['connected'] == true,
      direct: json['direct'] == true,
      relayPeerId: json['relayPeerId'] as String?,
    );
  }

  static const offline =
      PeerConnectionInfo(connected: false, direct: false);
}
