import 'dart:io';
import 'dart:async';
import 'package:dart_libp2p/p2p/nat/nat_type.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client_pool.dart';
import 'package:test/test.dart';
import 'mock_stun_server.dart';

void main() {
  group('StunClientPool', () {
    test('should initialize with default servers', () {
      final pool = StunClientPool();
      expect(pool.getServerHealthStatus().length, equals(5)); // Default has 10 servers
    });

    test('should initialize with custom servers', () {
      final pool = StunClientPool(
        stunServers: [
          (host: 'stun1.test.com', port: 3478),
          (host: 'stun2.test.com', port: 3478),
        ],
      );
      expect(pool.getServerHealthStatus().length, equals(2));
      expect(pool.getServerHealthStatus()[0].host, equals('stun1.test.com'));
      expect(pool.getServerHealthStatus()[1].host, equals('stun2.test.com'));
    });

    test('should add and remove servers', () {
      final pool = StunClientPool(stunServers: []);
      expect(pool.getServerHealthStatus().length, equals(0));

      pool.addServer('stun1.test.com', 3478);
      expect(pool.getServerHealthStatus().length, equals(1));
      expect(pool.getServerHealthStatus()[0].host, equals('stun1.test.com'));

      pool.addServer('stun2.test.com', 3478);
      expect(pool.getServerHealthStatus().length, equals(2));

      pool.removeServer('stun1.test.com', 3478);
      expect(pool.getServerHealthStatus().length, equals(1));
      expect(pool.getServerHealthStatus()[0].host, equals('stun2.test.com'));
    });

    test('should not add duplicate servers', () {
      final pool = StunClientPool(stunServers: []);
      pool.addServer('stun.test.com', 3478);
      pool.addServer('stun.test.com', 3478); // Try to add the same server again
      expect(pool.getServerHealthStatus().length, equals(1));
    });

    test('should properly dispose resources', () {
      final pool = StunClientPool();
      pool.dispose();
      // No easy way to test if timer is cancelled, but at least ensure no errors
    });
  });

  group('StunClientPool with Mock Servers', () {
    late List<MockStunServer> mockServers;
    late StunClientPool pool;

    setUp(() async {
      // Create 3 mock STUN servers
      mockServers = await Future.wait([
        MockStunServer.start(),
        MockStunServer.start(),
        MockStunServer.start(),
      ]);

      // Create a pool with these mock servers
      pool = StunClientPool(
        stunServers: mockServers.map((server) => (
          host: 'localhost',
          port: server.port,
        )).toList(),
        // Use shorter timeouts for testing
        timeout: Duration(seconds: 1),
        healthCheckInterval: Duration(milliseconds: 100),
      );
    });

    tearDown(() {
      for (final server in mockServers) {
        server.close();
      }
      pool.dispose();
    });

    test('should discover external IP and port', () async {
      // Simulate a specific response from the first mock server
      mockServers[0].simulateResponse(
        mappedAddress: InternetAddress('1.2.3.4'),
        mappedPort: 12345,
      );

      final response = await pool.discover();
      expect(response.externalAddress?.address, equals('1.2.3.4'));
      expect(response.externalPort, equals(12345));
    });

    test('should fallback to next server on failure', () async {
      // First server will be closed to force a failure
      mockServers[0].close();

      // Second server will respond with a specific address
      mockServers[1].simulateResponse(
        mappedAddress: InternetAddress('5.6.7.8'),
        mappedPort: 56789,
      );

      final response = await pool.discover();
      expect(response.externalAddress?.address, equals('5.6.7.8'));
      expect(response.externalPort, equals(56789));

      // Check that health scores were updated
      final healthStatus = pool.getServerHealthStatus();
      expect(healthStatus.firstWhere((s) => s.port == mockServers[0].port).healthScore, lessThan(100)); // First server should have reduced health
      expect(healthStatus.firstWhere((s) => s.port == mockServers[1].port).healthScore, equals(100)); // Second server should have perfect health
    });

    test('should detect symmetric NAT', () async {
      // Simulate different ports from different servers
      mockServers[0].simulateResponse(
        mappedAddress: InternetAddress('1.2.3.4'),
        mappedPort: 12345,
      );

      mockServers[1].simulateResponse(
        mappedAddress: InternetAddress('1.2.3.4'),
        mappedPort: 54321, // Different port
      );

      final natType = await pool.detectNatType();
      expect(natType, equals(NatType.symmetric));
    });

    test('should detect full cone NAT', () async {
      // Make sure we only have two servers for this test to simplify
      if (mockServers.length > 2) {
        for (var i = 2; i < mockServers.length; i++) {
          mockServers[i].close();
        }
      }

      // Simulate same port from different servers
      mockServers[0].simulateResponse(
        mappedAddress: InternetAddress('1.2.3.4'),
        mappedPort: 12345,
      );

      mockServers[1].simulateResponse(
        mappedAddress: InternetAddress('1.2.3.4'),
        mappedPort: 12345, // Same port
      );

      // First do a discover to ensure the servers are healthy
      await pool.discover();

      // Now detect NAT type
      final natType = await pool.detectNatType();
      expect(natType, equals(NatType.fullCone));
    });

    test('should handle all servers failing', () async {
      // Create a pool with non-responsive servers
      final emptyPool = StunClientPool(
        stunServers: [
          (host: 'invalid1.example.com', port: 12345),
          (host: 'invalid2.example.com', port: 12345),
        ],
        timeout: Duration(milliseconds: 100), // Short timeout for faster test
      );

      try {
        await emptyPool.discover();
        fail('Should throw exception');
      } catch (e) {
        expect(e, isA<Exception>());
      } finally {
        emptyPool.dispose();
      }
    });

    test('should update health scores based on server performance', () async {
      // Make sure we only have two servers for this test to simplify
      if (mockServers.length > 2) {
        for (var i = 2; i < mockServers.length; i++) {
          mockServers[i].close();
        }
      }

      // First check should succeed for first server
      mockServers[0].simulateResponse(
        mappedAddress: InternetAddress('1.2.3.4'),
        mappedPort: 12345,
      );

      await pool.discover();
      var healthStatus = pool.getServerHealthStatus();

      // Store the ports for later comparison
      final firstServerPort = mockServers[0].port;
      final secondServerPort = mockServers[1].port;

      // Verify first server has good health
      final firstServerInfo = healthStatus.firstWhere((s) => s.port == firstServerPort);
      expect(firstServerInfo.healthScore, equals(100));

      // Now make the first server fail and the second succeed
      mockServers[0].close(); // This will cause the first server to fail
      mockServers[1].simulateResponse(
        mappedAddress: InternetAddress('5.6.7.8'),
        mappedPort: 56789,
      );

      // Do multiple discover calls to ensure health scores are updated
      await pool.discover();
      await pool.discover(); // Do it twice to ensure health scores are updated

      // Get updated health status
      healthStatus = pool.getServerHealthStatus();

      // First server should have reduced health, second should be healthy
      expect(healthStatus.firstWhere((s) => s.port == firstServerPort).healthScore, lessThan(100));
      expect(healthStatus.firstWhere((s) => s.port == secondServerPort).healthScore, equals(100));

      // Find the server with the highest health score
      final highestHealthServer = healthStatus.reduce((a, b) => a.healthScore > b.healthScore ? a : b);

      // The server with the highest health score should be the second server
      expect(highestHealthServer.port, equals(secondServerPort));
    });
  });
}
