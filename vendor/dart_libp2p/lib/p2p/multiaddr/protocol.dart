import 'dart:io' show InternetAddress, InternetAddressType;

/// Represents a multiaddr protocol
class Protocol {
  final String name;
  final int code;
  final int size; // -1 for variable size
  final String? path; // true if protocol has a path component
  // final String? _value = null;

  const Protocol({
    required this.name,
    required this.code,
    required this.size,
    this.path,
  });

  /// Returns true if this protocol has a variable size value
  bool get isVariableSize => size == -1;

  /// Returns true if this protocol has a path component
  bool get hasPath => path != null;

  // set value(String? value) { _value = value;}
  //
  // String? get value => _value;

  /// Converts a protocol value to an InternetAddress if possible
  /// Throws ArgumentError if the protocol doesn't support conversion to InternetAddress
  InternetAddress toInternetAddress(String value) {
    switch (name) {
      case 'ip4':
        return InternetAddress(value, type: InternetAddressType.IPv4);
      case 'ip6':
        return InternetAddress(value, type: InternetAddressType.IPv6);
      default:
        throw ArgumentError('Protocol $name does not support conversion to InternetAddress');
    }
  }

  @override
  String toString() => '/$name';
}

/// Registry of supported multiaddr protocols
class Protocols {
  static const ip4 = Protocol(
    name: 'ip4',
    code: 0x04,
    size: 32,
  );

  static const tcp = Protocol(
    name: 'tcp',
    code: 0x06,
    size: 16,
  );

  static const udp = Protocol(
    name: 'udp',
    code: 0x0111,
    size: 16,
  );

  static const ip6 = Protocol(
    name: 'ip6',
    code: 0x29,
    size: 128,
  );

  static const dns4 = Protocol(
    name: 'dns4',
    code: 0x36,
    size: -1,
  );

  static const dns6 = Protocol(
    name: 'dns6',
    code: 0x37,
    size: -1,
  );

  static const dnsaddr = Protocol(
    name: 'dnsaddr',
    code: 0x38,
    size: -1,
  );

  static const p2p = Protocol(
    name: 'p2p',
    code: 0x01A5,
    size: -1,
  );

  static const unix = Protocol(
    name: 'unix',
    code: 0x0190,
    size: -1,
    path: '/',
  );

  static const quicV1 = Protocol(
    name: 'quic-v1',
    code: 0x01CC,
    size: 0,
  );

  static const webtransport = Protocol(
    name: 'webtransport',
    code: 0x01D1,
    size: 0,
  );

  static const certhash = Protocol(
    name: 'certhash',
    code: 0x01D2,
    size: -1,
  );

  static const sni = Protocol(
    name: 'sni',
    code: 0x01D3,
    size: -1,
  );

  static const circuit = Protocol(
    name: 'p2p-circuit',
    code: 0x0122,
    size: 0,
  );

  static const webrtc = Protocol(
    name: 'webrtc',
    code: 0x0113,
    size: 0,
  );

  static const udx = Protocol(
    name: 'udx',
    code: 0x0300, // Assigned a private use code for now
    size: 0,
  );

  static const _protocols = {
    'ip4': ip4,
    'tcp': tcp,
    'udp': udp,
    'ip6': ip6,
    'dns4': dns4,
    'dns6': dns6,
    'dnsaddr': dnsaddr,
    'p2p': p2p,
    'unix': unix,
    'quic-v1': quicV1,
    'webtransport': webtransport,
    'certhash': certhash,
    'sni': sni,
    'p2p-circuit': circuit,
    'webrtc': webrtc,
    'udx': udx,
  };

  /// Returns the protocol for the given name
  static Protocol? byName(String name) => _protocols[name];

  /// Returns the protocol for the given code
  static Protocol? byCode(int code) {
    return _protocols.values.firstWhere(
      (p) => p.code == code,
      orElse: () => throw ArgumentError('Unknown protocol code: $code'),
    );
  }

  /// Returns true if the protocol is supported
  static bool isSupported(String name) => _protocols.containsKey(name);

  /// Returns a list of all supported protocols
  static List<Protocol> get all => _protocols.values.toList();
}
