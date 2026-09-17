import 'dart:async';
import 'dart:io';
import 'package:dart_libp2p/p2p/nat/network_interface_monitor.dart';
import 'package:test/test.dart';

/// A mock implementation of NetworkInterface for testing
class MockNetworkInterface implements NetworkInterface {
  @override
  final String name;

  @override
  final List<InternetAddress> addresses;

  @override
  final int index;

  MockNetworkInterface({
    required this.name,
    required this.addresses,
    required this.index,
  });
}

void main() {
  group('NetworkInterfaceMonitor', () {
    late NetworkInterfaceMonitor monitor;
    late List<NetworkInterface> mockInterfaces;

    setUp(() {
      // Initial mock interfaces
      mockInterfaces = [
        MockNetworkInterface(
          name: 'eth0',
          addresses: [InternetAddress('192.168.1.1')],
          index: 1,
        ),
      ];

      // Create monitor with mock interface provider
      monitor = NetworkInterfaceMonitor(
        checkInterval: Duration(milliseconds: 100), // Short interval for testing
        interfaceProvider: () async => mockInterfaces,
      );
    });

    tearDown(() {
      monitor.dispose();
    });

    test('should detect changes in network interfaces', () async {
      // Initialize the monitor with initial interfaces
      await monitor.initialize();

      // Change the mock interfaces
      mockInterfaces = [
        MockNetworkInterface(
          name: 'eth0',
          addresses: [InternetAddress('192.168.1.2')], // Changed address
          index: 1,
        ),
      ];

      // Check for changes
      final hasChanged = await monitor.checkForChanges();

      // Verify that changes were detected
      expect(hasChanged, isTrue);
    });

    test('should notify callbacks when network interfaces change', () async {
      // Initialize the monitor with initial interfaces
      await monitor.initialize();

      // Set up callback
      var callbackCalled = false;
      monitor.addChangeCallback(() {
        callbackCalled = true;
      });

      // Change the mock interfaces
      mockInterfaces = [
        MockNetworkInterface(
          name: 'eth0',
          addresses: [InternetAddress('192.168.1.2')], // Changed address
          index: 1,
        ),
      ];

      // Check for changes
      await monitor.checkForChanges();

      // Verify that callback was called
      expect(callbackCalled, isTrue);
    });

    test('should not notify callbacks when network interfaces do not change', () async {
      // Initialize the monitor with initial interfaces
      await monitor.initialize();

      // Set up callback
      var callbackCalled = false;
      monitor.addChangeCallback(() {
        callbackCalled = true;
      });

      // Don't change the mock interfaces

      // Check for changes (with the same interfaces)
      await monitor.checkForChanges();

      // Verify that callback was not called
      expect(callbackCalled, isFalse);
    });

    test('should detect changes in network interface count', () async {
      // Initialize the monitor with initial interfaces
      await monitor.initialize();

      // Change the mock interfaces to add an interface
      mockInterfaces = [
        MockNetworkInterface(
          name: 'eth0',
          addresses: [InternetAddress('192.168.1.1')],
          index: 1,
        ),
        MockNetworkInterface(
          name: 'wlan0',
          addresses: [InternetAddress('10.0.0.1')],
          index: 2,
        ),
      ];

      // Check for changes
      final hasChanged = await monitor.checkForChanges();

      // Verify that changes were detected
      expect(hasChanged, isTrue);
    });
  });
}
