import 'dart:async';
import 'dart:io';

/// A callback function for network interface changes
typedef NetworkInterfaceChangeCallback = void Function();

/// A function that returns a list of network interfaces
typedef NetworkInterfaceProvider = Future<List<NetworkInterface>> Function();

/// A class that monitors network interfaces for changes
class NetworkInterfaceMonitor {
  /// The interval between checks for network interface changes
  final Duration checkInterval;

  /// The function that provides network interfaces
  final NetworkInterfaceProvider _interfaceProvider;

  /// The current network interfaces
  List<NetworkInterface> _currentInterfaces = [];

  /// Timer for periodic checks
  Timer? _checkTimer;

  /// Callbacks for network interface changes
  final List<NetworkInterfaceChangeCallback> _callbacks = [];

  /// Creates a new network interface monitor
  NetworkInterfaceMonitor({
    this.checkInterval = const Duration(seconds: 30),
    NetworkInterfaceProvider? interfaceProvider,
  }) : _interfaceProvider = interfaceProvider ?? NetworkInterface.list;

  /// Initializes the network interface monitor
  Future<void> initialize() async {
    // Get initial network interfaces
    _currentInterfaces = await _interfaceProvider();

    // Start periodic checks
    _startPeriodicChecks();
  }

  /// Checks for network interface changes
  Future<bool> checkForChanges() async {
    final newInterfaces = await _interfaceProvider();

    // Check if interfaces have changed
    if (_interfacesHaveChanged(newInterfaces)) {
      _currentInterfaces = newInterfaces;
      _notifyCallbacks();
      return true;
    }

    return false;
  }

  /// Adds a callback for network interface changes
  void addChangeCallback(NetworkInterfaceChangeCallback callback) {
    _callbacks.add(callback);
  }

  /// Removes a callback for network interface changes
  void removeChangeCallback(NetworkInterfaceChangeCallback callback) {
    _callbacks.remove(callback);
  }

  /// Starts periodic checks for network interface changes
  void _startPeriodicChecks() {
    _checkTimer?.cancel();
    _checkTimer = Timer.periodic(checkInterval, (_) {
      checkForChanges();
    });
  }

  /// Stops periodic checks for network interface changes
  void stopPeriodicChecks() {
    _checkTimer?.cancel();
    _checkTimer = null;
  }

  /// Checks if network interfaces have changed
  bool _interfacesHaveChanged(List<NetworkInterface> newInterfaces) {
    // If the number of interfaces has changed, they've changed
    if (_currentInterfaces.length != newInterfaces.length) {
      return true;
    }

    // Check each interface
    for (final newInterface in newInterfaces) {
      // Try to find matching interface in current interfaces
      final matchingInterfaceExists = _currentInterfaces.any((i) => i.name == newInterface.name);

      // If interface not found, they've changed
      if (!matchingInterfaceExists) {
        return true;
      }

      // Get the matching interface
      final matchingInterface = _currentInterfaces.firstWhere(
        (i) => i.name == newInterface.name,
      );

      // Check if addresses have changed
      if (_addressesHaveChanged(matchingInterface.addresses, newInterface.addresses)) {
        return true;
      }
    }

    return false;
  }

  /// Checks if addresses have changed
  bool _addressesHaveChanged(List<InternetAddress> oldAddresses, List<InternetAddress> newAddresses) {
    // If the number of addresses has changed, they've changed
    if (oldAddresses.length != newAddresses.length) {
      return true;
    }

    // Check each address
    for (final newAddress in newAddresses) {
      // Check if address exists in old addresses
      final addressExists = oldAddresses.any((a) => a.address == newAddress.address);
      if (!addressExists) {
        return true;
      }
    }

    return false;
  }

  /// Notifies callbacks of a network interface change
  void _notifyCallbacks() {
    for (final callback in _callbacks) {
      callback();
    }
  }

  /// Disposes the network interface monitor
  void dispose() {
    stopPeriodicChecks();
    _callbacks.clear();
  }
}
