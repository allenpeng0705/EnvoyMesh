import 'dart:async';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/p2p/network/swarm/swarm_dial.dart';

// Mock connection for testing
class MockConn implements Conn {
  final MultiAddr _addr;
  
  MockConn(this._addr);
  
  @override
  MultiAddr get remoteMultiaddr => _addr;
  
  @override
  PeerId get remotePeer => PeerId.fromString('12D3KooWTest');
  
  @override
  Future<void> close() async {}
  
  @override
  bool get isClosed => false;
  
  @override
  noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  group('HappyEyeballsDialer', () {
    test('returns first successful connection', () async {
      final peerId = PeerId.fromString('12D3KooWTest');
      final context = Context();
      
      final addresses = [
        ScoredAddress(
          addr: MultiAddr('/ip4/1.2.3.4/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 1,
          timeout: Duration(seconds: 5),
        ),
        ScoredAddress(
          addr: MultiAddr('/ip4/5.6.7.8/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 2,
          timeout: Duration(seconds: 5),
        ),
      ];
      
      // First address succeeds immediately
      Future<Conn> dialFunc(Context ctx, MultiAddr addr, PeerId pid) async {
        if (addr.ip4 == '1.2.3.4') {
          return MockConn(addr);
        }
        await Future.delayed(Duration(seconds: 10));
        throw Exception('Should not reach here');
      }
      
      final dialer = HappyEyeballsDialer(
        peerId: peerId,
        addrs: addresses,
        dialFunc: dialFunc,
        context: context,
      );
      
      final conn = await dialer.dial();
      expect(conn.remoteMultiaddr.ip4, '1.2.3.4');
    });
    
    test('tries second address if first fails', () async {
      final peerId = PeerId.fromString('12D3KooWTest');
      final context = Context();
      
      final addresses = [
        ScoredAddress(
          addr: MultiAddr('/ip4/1.2.3.4/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 1,
          timeout: Duration(seconds: 1),
        ),
        ScoredAddress(
          addr: MultiAddr('/ip4/5.6.7.8/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 2,
          timeout: Duration(seconds: 5),
        ),
      ];
      
      // First address fails, second succeeds
      Future<Conn> dialFunc(Context ctx, MultiAddr addr, PeerId pid) async {
        if (addr.ip4 == '1.2.3.4') {
          throw Exception('Connection failed');
        }
        return MockConn(addr);
      }
      
      final dialer = HappyEyeballsDialer(
        peerId: peerId,
        addrs: addresses,
        dialFunc: dialFunc,
        context: context,
      );
      
      final conn = await dialer.dial();
      expect(conn.remoteMultiaddr.ip4, '5.6.7.8');
    });
    
    test('respects stagger delay', () async {
      final peerId = PeerId.fromString('12D3KooWTest');
      final context = Context();
      final attemptTimes = <String, DateTime>{};
      
      final addresses = [
        ScoredAddress(
          addr: MultiAddr('/ip4/1.2.3.4/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 1,
          timeout: Duration(seconds: 5),
        ),
        ScoredAddress(
          addr: MultiAddr('/ip4/5.6.7.8/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 2,
          timeout: Duration(seconds: 5),
        ),
        ScoredAddress(
          addr: MultiAddr('/ip4/9.10.11.12/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 3,
          timeout: Duration(seconds: 5),
        ),
      ];
      
      // Track when each dial attempt starts
      Future<Conn> dialFunc(Context ctx, MultiAddr addr, PeerId pid) async {
        attemptTimes[addr.ip4!] = DateTime.now();
        // All fail so we can track all attempts
        throw Exception('Connection failed');
      }
      
      final dialer = HappyEyeballsDialer(
        peerId: peerId,
        addrs: addresses,
        dialFunc: dialFunc,
        context: context,
      );
      
      try {
        await dialer.dial();
      } catch (e) {
        // Expected to fail
      }
      
      // Verify stagger delay between attempts (should be ~250ms)
      expect(attemptTimes.length, 3);
      
      final time1 = attemptTimes['1.2.3.4']!;
      final time2 = attemptTimes['5.6.7.8']!;
      final time3 = attemptTimes['9.10.11.12']!;
      
      final delay1to2 = time2.difference(time1).inMilliseconds;
      final delay2to3 = time3.difference(time2).inMilliseconds;
      
      // Allow some tolerance (200-300ms)
      expect(delay1to2, greaterThan(200));
      expect(delay1to2, lessThan(300));
      expect(delay2to3, greaterThan(200));
      expect(delay2to3, lessThan(300));
    });
    
    test('throws exception when all attempts fail', () async {
      final peerId = PeerId.fromString('12D3KooWTest');
      final context = Context();
      
      final addresses = [
        ScoredAddress(
          addr: MultiAddr('/ip4/1.2.3.4/tcp/4001'),
          type: AddressType.directIPv4Public,
          priority: 1,
          timeout: Duration(seconds: 1),
        ),
      ];
      
      // Always fail
      Future<Conn> dialFunc(Context ctx, MultiAddr addr, PeerId pid) async {
        throw Exception('Connection refused');
      }
      
      final dialer = HappyEyeballsDialer(
        peerId: peerId,
        addrs: addresses,
        dialFunc: dialFunc,
        context: context,
      );
      
      expect(
        () => dialer.dial(),
        throwsA(isA<Exception>()),
      );
    });
    
    test('throws exception when no addresses provided', () {
      final peerId = PeerId.fromString('12D3KooWTest');
      final context = Context();
      
      Future<Conn> dialFunc(Context ctx, MultiAddr addr, PeerId pid) async {
        return MockConn(addr);
      }
      
      final dialer = HappyEyeballsDialer(
        peerId: peerId,
        addrs: [],
        dialFunc: dialFunc,
        context: context,
      );
      
      expect(
        () => dialer.dial(),
        throwsA(isA<Exception>()),
      );
    });
  });
}

