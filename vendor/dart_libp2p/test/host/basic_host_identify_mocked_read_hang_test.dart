import 'dart:async';
import 'dart:io' show Socket;
import 'dart:typed_data';

import 'package:dart_libp2p/core/network/network.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/transport_conn.dart' as core_transport_conn;
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart' as core_protocol;
import 'package:dart_libp2p/core/crypto/pb/crypto.pb.dart' as pb;
import 'package:dart_libp2p/core/network/context.dart' as core_context;
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/core/network/mux.dart' as core_mux;

// P2P layer imports for mocks
import 'package:dart_libp2p/p2p/transport/transport.dart' as p2p_transport;
import 'package:dart_libp2p/p2p/transport/listener.dart' as p2p_listener;
import 'package:dart_libp2p/p2p/security/security_protocol.dart' as p2p_security;
import 'package:dart_libp2p/p2p/security/secured_connection.dart' as p2p_secured_conn;
import 'package:dart_libp2p/p2p/transport/multiplexing/multiplexer.dart' as p2p_muxer;
import 'package:dart_libp2p/p2p/transport/transport_config.dart';

import 'package:dart_libp2p/config/config.dart' as p2p_config;
import 'package:dart_libp2p/config/stream_muxer.dart' as config_stream_muxer;
import 'package:dart_libp2p/p2p/host/basic/basic_host.dart';

const String identifyProtocolId = '/ipfs/id/1.0.0';


// --- Mock Classes ---

class MockResourceScope implements ResourceScope {
  @override
  Future<void> reserveMemory(int size, int prio) async {}
  @override
  void releaseMemory(int size) {}
  @override
  Future<void> addConnection(Direction dir, bool usefd) async {}
  @override
  void removeConnection(Direction dir, bool usefd) {}
  @override
  Future<void> addStream(Direction dir) async {}
  @override
  void removeStream(Direction dir) {}
  @override
  ResourceScope newStreamScope() => this;
  @override
  ResourceScope newConnScope() => this;
  @override
  Future<void> close() async {}
  @override
  Future<ResourceScopeSpan> beginSpan() async => throw UnimplementedError('MockResourceScope.beginSpan not implemented');
  @override
  ScopeStat get stat => throw UnimplementedError('MockResourceScope.stat not implemented');
}

class MockPublicKey extends PublicKey {
  static int _defaultKeyCounter = 0;
  final Uint8List _bytes;
  MockPublicKey([List<int>? bytes]) : _bytes = Uint8List.fromList(bytes ?? List.generate(34, (i) => i + 100 + _defaultKeyCounter++)..[0]=0x00 ..[1]=0x24);
  @override
  Uint8List marshal() => _bytes;
  @override
  Future<bool> verify(Uint8List data, Uint8List signature) async => true;
  @override
  pb.KeyType get keyType => pb.KeyType.Ed25519;
  @override
  pb.KeyType get type => pb.KeyType.Ed25519;
  @override
  Future<bool> equals(PublicKey other) async => false;
  @override
  Uint8List get raw => _bytes;
}

class MockPrivateKey extends PrivateKey {
  static int _defaultKeyCounterP = 0;
  final Uint8List _bytes;
  final PublicKey _publicKey;
  MockPrivateKey([List<int>? bytes, PublicKey? publicKey])
    : _bytes = Uint8List.fromList(bytes ?? List.generate(32, (i) => i + 200 + _defaultKeyCounterP++)),
      _publicKey = publicKey ?? MockPublicKey();
  @override
  pb.KeyType get keyType => pb.KeyType.Ed25519;
  @override
  pb.KeyType get type => pb.KeyType.Ed25519;
  @override
  Uint8List marshal() => _bytes;
  @override
  Future<bool> equals(PrivateKey other) async => false;
  @override
  PublicKey get publicKey => _publicKey;
  @override
  Future<Uint8List> sign(Uint8List data) async => Uint8List(0);
  @override
  Uint8List get raw => _bytes;
}

class MockKeyPair implements KeyPair {
  @override
  final PrivateKey privateKey;
  @override
  final PublicKey publicKey;
  MockKeyPair() : this._create(MockPublicKey());
  MockKeyPair._create(PublicKey pub)
    : publicKey = pub,
      privateKey = MockPrivateKey(null, pub);
}

class MockStats implements Stats {
  @override
  Direction direction = Direction.unknown;
  @override
  Map<dynamic, dynamic> extra = const {};
  @override
  bool limited = false;
  @override
  DateTime opened = DateTime.now();
  @override
  Map<String, num> toMap() => {};
}

class MockConnStats implements ConnStats {
  @override
  DateTime opened = DateTime.now();
  @override
  Direction dir = Direction.unknown;
  @override
  Map<String, DateTime> get timeline => {}; // Corrected: returns Map
  @override
  Map<dynamic, dynamic> get extra => const {}; // Corrected: returns Map
  @override
  int numStreams = 0;
  @override
  Stats stats = MockStats();
}

class MockP2PStream implements P2PStream {
  String _id = 'mock-stream-${DateTime.now().millisecondsSinceEpoch}-${_streamIdCounter++}';
  static int _streamIdCounter = 0;
  @override
  String id() => _id;

  String _protocol = '';
  @override
  String protocol() => _protocol;
  void setMockProtocol(String p) => _protocol = p;

  @override
  StreamStats stat() => StreamStats(direction: Direction.unknown, opened: DateTime.now());

  Completer<Uint8List>? _hangingReadCompleter;
  bool _shouldHangRead = false;
  void Function()? onReadCalledWhileHanging;

  List<Uint8List> _pendingReadData = [];
  Completer<Uint8List>? _currentReadCompleter;

  void configureReadToHang({void Function()? onReadCallback}) {
    _shouldHangRead = true;
    _hangingReadCompleter = Completer<Uint8List>();
    onReadCalledWhileHanging = onReadCallback;
  }
  void addDataToRead(Uint8List data) {
    _pendingReadData.add(data);
    _tryCompleteRead();
  }
  void _tryCompleteRead() {
    if (_currentReadCompleter != null && !_currentReadCompleter!.isCompleted && _pendingReadData.isNotEmpty) {
      _currentReadCompleter!.complete(_pendingReadData.removeAt(0));
      _currentReadCompleter = null;
    }
  }

  final Completer<void> _closeCompleter = Completer<void>();
  bool _isStreamClosed = false;
  @override
  bool get isClosed => _isStreamClosed;

  @override
  bool get isWritable => !_isStreamClosed && !_writeClosed;

  bool _writeClosed = false;
  bool _readClosed = false;
  List<Uint8List> writtenData = [];

  @override
  Future<void> setDeadline(DateTime? deadline) async {}
  @override
  Future<void> setReadDeadline(DateTime? time) async {}
  @override
  Future<void> setWriteDeadline(DateTime? time) async {}
  @override
  Future<void> closeWrite() async { _writeClosed = true; }
  @override
  Future<void> closeRead() async { _readClosed = true; }
  @override
  Future<void> close() async {
    _isStreamClosed = true;
    _writeClosed = true;
    _readClosed = true;
    if (_hangingReadCompleter?.isCompleted == false) {
      _hangingReadCompleter!.completeError(Exception("Stream closed while read was hanging"));
    }
    if (_currentReadCompleter?.isCompleted == false) {
      _currentReadCompleter!.completeError(Exception("Stream closed while reading"));
    }
    if (!_closeCompleter.isCompleted) _closeCompleter.complete();
  }
  @override
  Future<void> reset() async { await close(); }
  @override
  Future<void> write(Uint8List data) async {
    if (_isStreamClosed || _writeClosed) throw Exception('Stream closed or write-closed');
    writtenData.add(data);
  }
  @override
  Future<Uint8List> read([int? maxLength]) async {
    if (_isStreamClosed || _readClosed) throw Exception('Stream closed or read-closed');
    if (_shouldHangRead && _hangingReadCompleter != null) {
      onReadCalledWhileHanging?.call();
      return _hangingReadCompleter!.future;
    }
    if (_pendingReadData.isNotEmpty) {
      return _pendingReadData.removeAt(0);
    }
    _currentReadCompleter = Completer<Uint8List>();
    return _currentReadCompleter!.future;
  }
  @override
  P2PStream<Uint8List> get incoming => throw UnimplementedError('MockP2PStream.incoming not implemented');
  @override
  StreamManagementScope scope() => throw UnimplementedError('MockP2PStream.scope not implemented'); // Changed return type
  @override
  Future<void> setProtocol(String id) async { _protocol = id; }

  @override
  // TODO: implement conn
  Conn get conn => throw UnimplementedError(); // Getter for connection
}

class MockConnBase implements Conn {
  String _connId = 'mock-conn-${DateTime.now().millisecondsSinceEpoch}-${_connBaseIdCounter++}';
  static int _connBaseIdCounter = 0;
  @override
  String get id => _connId;

  MultiAddr? _localMultiaddrVal;
  MultiAddr? _remoteMultiaddrVal;
  MockConnBase({MultiAddr? localAddr, MultiAddr? remoteAddr})
    : _localMultiaddrVal = localAddr, _remoteMultiaddrVal = remoteAddr;

  @override
  MultiAddr get localMultiaddr => _localMultiaddrVal ?? MultiAddr('/ip4/127.0.0.1/tcp/1111');
  @override
  MultiAddr get remoteMultiaddr => _remoteMultiaddrVal ?? MultiAddr('/ip4/127.0.0.1/tcp/2222');
  @override
  ConnStats get stat => MockConnStats();
  bool _isConnClosed = false;
  @override
  Future<void> close() async { _isConnClosed = true; }
  @override
  bool get isClosed => _isConnClosed;
  @override
  ConnScope get scope => MockConnScope();
  @override
  PeerId get localPeer => throw UnimplementedError('MockConnBase.localPeer not implemented');
  @override
  Future<P2PStream> newStream(core_context.Context context) async => MockP2PStream();
  @override
  PeerId get remotePeer => throw UnimplementedError('MockConnBase.remotePeer not implemented');
  @override
  Future<PublicKey?> get remotePublicKey async => null;
  @override
  ConnState get state => ConnState(
    streamMultiplexer: '/mock/1.0.0',
    security: '/mock/1.0.0',
    transport: 'mock',
    usedEarlyMuxerNegotiation: false,
  );
  @override
  Future<List<P2PStream>> get streams async => [];
}

class MockConnScope extends MockResourceScope implements ConnScope {}

class MockTransportConn extends MockConnBase implements core_transport_conn.TransportConn {
  @override
  final p2p_transport.Transport transport;
  MockTransportConn({required this.transport, MultiAddr? localAddr, MultiAddr? remoteAddr})
    : super(localAddr: localAddr, remoteAddr: remoteAddr);

  @override
  Future<Uint8List> read([int? length]) async => Uint8List(0);
  @override
  void setReadTimeout(Duration timeout) {}
  @override
  void setWriteTimeout(Duration timeout) {}
  @override
  Socket get socket => throw UnimplementedError('MockTransportConn.socket not implemented');
  @override
  Future<void> write(Uint8List data) async {}

  @override
  void notifyActivity() {}
}

class MockSecuredConn extends MockConnBase implements p2p_secured_conn.SecuredConnection {
  @override
  final PeerId localPeer;
  @override
  final PeerId remotePeer;
  final PublicKey? _remotePublicKeyVal;

  MockSecuredConn(this.localPeer, this.remotePeer, this._remotePublicKeyVal, {MultiAddr? localAddr, MultiAddr? remoteAddr})
    : super(localAddr: localAddr, remoteAddr: remoteAddr);

  @override
  Future<PublicKey?> get remotePublicKey async => _remotePublicKeyVal;
  @override
  Conn get conn => this;
  @override
  String get securityProtocolId => '/mock-sec/1.0.0';
  @override
  p2p_transport.Transport get transport => throw UnimplementedError('MockSecuredConn.transport not implemented');
  
  @override
  Future<Uint8List> read([int? length]) async => Uint8List(0);
  @override
  void setReadTimeout(Duration timeout) {}
  @override
  void setWriteTimeout(Duration timeout) {}
  @override
  Socket get socket => throw UnimplementedError('MockSecuredConn.socket not implemented');
  @override
  Future<void> write(Uint8List data) async {}
  
  @override
  PeerId? get establishedRemotePeer => remotePeer;
  @override
  PublicKey? get establishedRemotePublicKey => _remotePublicKeyVal;
  @override
  MultiAddr get localAddr => localMultiaddr;
  @override
  MultiAddr get remoteAddr => remoteMultiaddr;

  @override
  void notifyActivity() {}

  @override
  // TODO: implement currentRecvNonce
  int get currentRecvNonce => throw UnimplementedError();

  @override
  // TODO: implement currentSendNonce
  int get currentSendNonce => throw UnimplementedError();
}

class MockMuxerInstance implements p2p_muxer.Multiplexer {
  final Conn _connection; 
  final bool _isClient;
  final Map<String, Future<P2PStream> Function()> _specificStreamProviders;

  MockMuxerInstance(this._connection, this._isClient, this._specificStreamProviders);

  @override
  String get id => protocolId;
  @override
  String get protocolId => 'mock-muxer/1.0.0';
  bool _muxerClosed = false;
  @override
  Future<void> close() async { _muxerClosed = true; }
  @override
  bool get isClosed => _muxerClosed;

  @override
  Future<P2PStream> openStream(core_context.Context context) async { 
    // Mock implementation can ignore context if not needed for its logic
    if (!_isClient) throw StateError('Listener side should not call openStream directly in this mock setup');
    if (_specificStreamProviders.containsKey(identifyProtocolId)) {
      return await _specificStreamProviders[identifyProtocolId]!();
    }
    return MockP2PStream(); 
  }

  StreamHandler? _globalStreamHandler;

  @override
  void setStreamHandler(Future<void> Function(P2PStream stream) handler) { 
    _globalStreamHandler = (P2PStream stream, PeerId remotePeer) async {
        await handler(stream);
    };
  }
  @override
  void removeStreamHandler() { 
    _globalStreamHandler = null;
  }

  void simulateIncomingStream(String protocolId, MockP2PStream stream, PeerId remotePeer) {
    stream.setMockProtocol(protocolId); 
    if (_globalStreamHandler != null) {
      _globalStreamHandler!(stream, remotePeer);
    } else {
      print('MockMuxerInstance: No global stream handler for incoming protocol $protocolId');
      stream.reset();
    }
  }
  
  @override
  bool get canCreateStream => true;
  @override
  Stream<P2PStream> get incomingStreams => StreamController<P2PStream>().stream;
  @override
  int get maxStreams => 100;
  @override
  Future<core_mux.MuxedConn> newConnOnTransport( core_transport_conn.TransportConn secureConnection, bool isServer, PeerScope scope ){

    throw UnimplementedError('newConnOnTransport not implemented in mock');
  }
  @override
  int get numStreams => 0;
  @override
  Future<List<P2PStream>> get streams async => [];
  @override
  Future<P2PStream> acceptStream() async => throw UnimplementedError('acceptStream not implemented in mock');
}

class MockStreamMuxerDef extends config_stream_muxer.StreamMuxer {
  final Map<String, Future<P2PStream> Function()> specificStreamProviders;
  MockStreamMuxerDef(this.specificStreamProviders)
    : super(
        id: 'mock-muxer/1.0.0',
        muxerFactory: (Conn secureConn, bool isClient) {
          return MockMuxerInstance(
            secureConn,
            isClient,
            isClient ? specificStreamProviders : {},
          );
        },
      );
}

class MockSecurityProtocol implements p2p_security.SecurityProtocol {
  final KeyPair localKeyPair;
  MockSecurityProtocol(this.localKeyPair);
  @override
  String get id => protocolId;
  @override
  String get protocolId => '/mock-sec/1.0.0';

  @override
  Future<p2p_secured_conn.SecuredConnection> secureInbound(core_transport_conn.TransportConn conn) async {
    final remotePeerId = await PeerId.fromPublicKey(MockPublicKey(List.generate(34, (i)=>i+50)..[0]=0x00..[1]=0x24)); 
    final localPeer = await PeerId.fromPublicKey(localKeyPair.publicKey);
    return MockSecuredConn(localPeer, remotePeerId, MockPublicKey(), localAddr: conn.localMultiaddr, remoteAddr: conn.remoteMultiaddr);
  }
  @override
  Future<p2p_secured_conn.SecuredConnection> secureOutbound(core_transport_conn.TransportConn conn) async {
    final remotePeerId = await PeerId.fromPublicKey(MockPublicKey(List.generate(34, (i)=>i+60)..[0]=0x00..[1]=0x24)); 
    final localPeer = await PeerId.fromPublicKey(localKeyPair.publicKey);
    return MockSecuredConn(localPeer, remotePeerId, MockPublicKey(), localAddr: conn.localMultiaddr, remoteAddr: conn.remoteMultiaddr);
  }
}

class MockListener implements p2p_listener.Listener {
  @override
  final MultiAddr laddr;
  final StreamController<core_transport_conn.TransportConn> _connController;
  MockListener(this._connController, this.laddr) {
    print('[MockListener] constructor called with laddr: ${laddr.toString()}');
  }

  @override
  Stream<core_transport_conn.TransportConn> get newConnections => _connController.stream;
  @override
  Future<void> close() async {
    if (!_connController.isClosed) {
      await _connController.close();
    }
  }
  @override
  List<MultiAddr> get listenAddrs {
    print('[MockListener] listenAddrs getter called, returning: [${laddr.toString()}]');
    return [laddr];
  }
  @override
  Future<core_transport_conn.TransportConn?> accept() async {
    if (_connController.isClosed || !_connController.hasListener) return null;
    try {
      return await _connController.stream.first;
    } catch (e) {
      return null;
    }
  }
  @override
  MultiAddr get addr => laddr;
  @override
  Stream<core_transport_conn.TransportConn> get connectionStream => _connController.stream;
  @override
  bool get isClosed => _connController.isClosed;
  @override
  bool supportsAddr(MultiAddr addr) => true;
}

class MockTransport implements p2p_transport.Transport {
  Completer<core_transport_conn.TransportConn>? _pendingDialCompleter;
  StreamController<core_transport_conn.TransportConn>? _activeListenerController;
  @override
  MultiAddr? _listenAddrVal;

  @override
  Future<Conn> dial(MultiAddr raddr, {Duration? timeout, PeerId? p}) async {
    _pendingDialCompleter = Completer<core_transport_conn.TransportConn>();
    return _pendingDialCompleter!.future;
  }
  void completeDial(core_transport_conn.TransportConn conn) {
    if (_pendingDialCompleter != null && !_pendingDialCompleter!.isCompleted) {
      _pendingDialCompleter!.complete(conn);
    }
  }
  void failDial(Exception e) {
    if (_pendingDialCompleter != null && !_pendingDialCompleter!.isCompleted) {
      _pendingDialCompleter!.completeError(e);
    }
  }
  @override
  Future<p2p_listener.Listener> listen(MultiAddr laddr) async {
    print('[MockTransport] listen() called with: ${laddr.toString()} (this is the original laddr)');
    MultiAddr effectiveListenAddr = laddr;
    if (laddr.toString().endsWith('/tcp/0')) {
      // Replace /tcp/0 with a concrete port, preserving the IP
      final addrStr = laddr.toString().replaceFirst('/tcp/0', '/tcp/9999');
      print('[MockTransport] Original laddr ends with /tcp/0. Resolving to $addrStr');
      effectiveListenAddr = MultiAddr(addrStr);
    }
    _listenAddrVal = effectiveListenAddr; 
    print('[MockTransport] _listenAddrVal is now: ${_listenAddrVal.toString()}');
    _activeListenerController = StreamController<core_transport_conn.TransportConn>();
    print('[MockTransport] Creating MockListener with: ${_listenAddrVal.toString()}');
    return MockListener(_activeListenerController!, _listenAddrVal!);
  }
  void acceptConnection(core_transport_conn.TransportConn conn) {
    _activeListenerController?.add(conn);
  }
  @override
  bool canDial(MultiAddr addr) => true;
  @override
  List<String> get protocols => [];
  @override
  Future<void> close() async {}
  @override
  bool canListen(MultiAddr addr) => true;
  @override
  TransportConfig get config => TransportConfig();

  @override
  Future<void> dispose() async {}
}

void main() {
  group('BasicHost Identify Mocked Read Hang Test', () {
    late BasicHost hostA;
    late BasicHost hostB;
    late PeerId peerIdA;
    late PeerId peerIdB;
    late KeyPair keyPairA;
    late KeyPair keyPairB;
    late MockTransport mockTransportA;
    late MockTransport mockTransportB;
    late MockP2PStream hangingIdentifyStreamForA;
    bool readOnHangingStreamWasCalled = false;

    setUp(() async {
      keyPairA = MockKeyPair();
      keyPairB = MockKeyPair();
      peerIdA = await PeerId.fromPublicKey(keyPairA.publicKey);
      peerIdB = await PeerId.fromPublicKey(keyPairB.publicKey);

      readOnHangingStreamWasCalled = false;
      hangingIdentifyStreamForA = MockP2PStream();
      hangingIdentifyStreamForA.configureReadToHang(onReadCallback: () {
        readOnHangingStreamWasCalled = true;
      });

      mockTransportA = MockTransport();
      mockTransportB = MockTransport();

      final configA = p2p_config.Config()
        ..peerKey = keyPairA
        ..transports = [mockTransportA]
        ..securityProtocols = [MockSecurityProtocol(keyPairA)]
        ..muxers = [
          MockStreamMuxerDef({ 
            identifyProtocolId: () async => hangingIdentifyStreamForA, 
          })
        ];
      
      final configB = p2p_config.Config()
        ..peerKey = keyPairB
        ..transports = [mockTransportB]
        ..securityProtocols = [MockSecurityProtocol(keyPairB)]
        ..muxers = [MockStreamMuxerDef({})] 
        ..listenAddrs = [MultiAddr('/ip4/192.168.1.100/tcp/0')]
        ..enableHolePunching = false; // Explicitly disable hole punching for hostB

      hostA = await configA.newNode() as BasicHost;
      hostB = await configB.newNode() as BasicHost;

      await hostA.start();
      await hostB.start();
    });

    tearDown(() async {
      await hostA.close();
      await hostB.close();
    });

    // TODO: This test requires mock transports that support multistream-select
    // negotiation. Currently MockTransportConn.read() returns empty data,
    // so the upgrader's multistream negotiation fails before reaching the
    // identify hang scenario. Needs piped mock connections or a mock upgrader.
    test('dialer Identify read hangs, causing operation timeout', () async {
      // Original assertion was here. We add delay before it.
      // expect(hostB.addrs, isNotEmpty, reason: "Host B should have listen addresses.");
      var allAddrs = hostB.addrs;
      
      // Wait a bit for async operations like Swarm listening to potentially complete
      print('[TEST] About to delay before checking hostB.addrs. Current hostB.addrs: ${allAddrs}');
      await Future.delayed(const Duration(milliseconds: 200));
      allAddrs = hostB.addrs;
      print('[TEST] After delay, checking hostB.addrs. Current hostB.addrs: ${allAddrs}');
      expect(allAddrs.isNotEmpty, true, reason: 'hostB should have listen addresses from configB. Actual: ${allAddrs}');

      final serverAddrInfo = AddrInfo(peerIdB, allAddrs);
      
      final connectOperation = hostA.connect(serverAddrInfo, context: core_context.Context());

      await Future.delayed(Duration(milliseconds: 100));

      final dialerTransportConn = MockTransportConn(
        transport: mockTransportA,
        localAddr: MultiAddr('/ip4/127.0.0.1/tcp/12345'),
        remoteAddr: serverAddrInfo.addrs.first
      );
      final listenerTransportConn = MockTransportConn(
        transport: mockTransportB,
        localAddr: serverAddrInfo.addrs.first,
        remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/12345')
      );
      
      mockTransportA.completeDial(dialerTransportConn);
      mockTransportB.acceptConnection(listenerTransportConn);

      bool didTestTimeout = false;
      try {
        await connectOperation.timeout(Duration(seconds: 2), onTimeout: (){ 
          print("connectOperation itself timed out (unexpected, Identify might be blocking it)");
          throw TimeoutException("connectOperation timed out");
        });
        print('Host A connect() operation completed. Identify should be running/hanging now.');

        await Future.delayed(Duration(seconds: 3)); 

        if (readOnHangingStreamWasCalled && 
            hangingIdentifyStreamForA._hangingReadCompleter != null && 
           !hangingIdentifyStreamForA._hangingReadCompleter!.isCompleted) {
          print('Identify read was called and is hanging. Test should now hit its global timeout.');
          await Completer<void>().future; 
        } else if (readOnHangingStreamWasCalled && hangingIdentifyStreamForA._hangingReadCompleter?.isCompleted == true) {
            fail('Identify read was called but completed, expected to hang.');
        } else {
            fail('Identify read on the hanging stream was not called. Check mock setup for newStream in MockMuxerInstance and MockStreamMuxerDef.');
        }
      } on TimeoutException catch(e) {
        print('Test caught TimeoutException: $e');
        if (readOnHangingStreamWasCalled && 
            hangingIdentifyStreamForA._hangingReadCompleter != null && 
           !hangingIdentifyStreamForA._hangingReadCompleter!.isCompleted) {
          didTestTimeout = true;
          print('Test timed out as expected, and Identify read was called and is hanging.');
        } else {
          fail('Test timed out, but the Identify read hang state is not as expected. readCalled: $readOnHangingStreamWasCalled, completer: ${hangingIdentifyStreamForA._hangingReadCompleter}');
        }
      }
      expect(didTestTimeout, isTrue, reason: "The test should have timed out because IdentifyService's read() call was hanging.");
    }, timeout: Timeout(Duration(seconds: 6)),
       skip: 'Mock transports do not support multistream-select negotiation required by BasicUpgrader');
  });
}
