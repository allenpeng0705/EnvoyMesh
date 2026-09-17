import 'dart:async';
import 'dart:convert';
import 'nat_behavior.dart';
import 'stun/stun_client_pool.dart';
import 'storage_broker.dart';
import 'network_interface_monitor.dart';

/// A record of NAT behavior at a specific point in time
class NatBehaviorRecord {
  /// The NAT behavior
  final NatBehavior behavior;

  /// The timestamp when the behavior was recorded
  final DateTime timestamp;

  /// Creates a new NAT behavior record
  NatBehaviorRecord({
    required this.behavior,
    DateTime? timestamp,
  }) : timestamp = timestamp ?? DateTime.now();

  /// Creates a NAT behavior record from JSON
  factory NatBehaviorRecord.fromJson(Map<String, dynamic> json) {
    return NatBehaviorRecord(
      behavior: NatBehavior(
        mappingBehavior: NatMappingBehavior.values.byName(json['mappingBehavior']),
        filteringBehavior: NatFilteringBehavior.values.byName(json['filteringBehavior']),
        supportsHairpinning: json['supportsHairpinning'],
        preservesPorts: json['preservesPorts'],
        supportsPortMapping: json['supportsPortMapping'],
        mappingLifetime: json['mappingLifetime'],
      ),
      timestamp: DateTime.parse(json['timestamp']),
    );
  }

  /// Converts the NAT behavior record to JSON
  Map<String, dynamic> toJson() {
    return {
      'mappingBehavior': behavior.mappingBehavior.name,
      'filteringBehavior': behavior.filteringBehavior.name,
      'supportsHairpinning': behavior.supportsHairpinning,
      'preservesPorts': behavior.preservesPorts,
      'supportsPortMapping': behavior.supportsPortMapping,
      'mappingLifetime': behavior.mappingLifetime,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

/// A callback function for NAT behavior changes
typedef NatBehaviorChangeCallback = void Function(NatBehavior oldBehavior, NatBehavior newBehavior);

/// A class that tracks NAT behavior over time
class NatBehaviorTracker {
  /// The STUN client pool to use for NAT behavior discovery
  final StunClientPool stunClientPool;

  /// The storage broker to use for persistent storage
  final StorageBroker? storageBroker;

  /// The network interface monitor to use for detecting network changes
  final NetworkInterfaceMonitor? networkInterfaceMonitor;

  /// The key to use for storage
  final String storageKey;

  /// The interval between periodic checks
  final Duration checkInterval;

  /// The maximum number of behavior records to keep in history
  final int maxHistorySize;

  /// The current NAT behavior
  NatBehavior _currentBehavior = NatBehavior();

  /// The history of NAT behavior records
  final List<NatBehaviorRecord> _behaviorHistory = [];

  /// Timer for periodic checks
  Timer? _checkTimer;

  /// Callbacks for behavior changes
  final List<NatBehaviorChangeCallback> _callbacks = [];


  List<NatBehaviorChangeCallback> get callbacks => _callbacks;

  /// Creates a new NAT behavior tracker
  NatBehaviorTracker({
    required this.stunClientPool,
    this.storageBroker,
    this.networkInterfaceMonitor,
    this.storageKey = 'nat_behavior',
    this.checkInterval = const Duration(minutes: 30),
    this.maxHistorySize = 100,
  });

  /// The current NAT behavior
  NatBehavior get currentBehavior => _currentBehavior;

  /// The history of NAT behavior records
  List<NatBehaviorRecord> get behaviorHistory => List.unmodifiable(_behaviorHistory);

  /// Initializes the NAT behavior tracker
  Future<void> initialize() async {
    // Try to load behavior history from storage
    await _loadFromStorage();

    // If no history was loaded, discover behavior
    if (_behaviorHistory.isEmpty) {
      await discoverBehavior();
    } else {
      // Use the most recent behavior as current
      _currentBehavior = _behaviorHistory.last.behavior;
    }

    // Start periodic checks
    _startPeriodicChecks();

    // Initialize network interface monitor if provided
    if (networkInterfaceMonitor != null) {
      // Register callback for network interface changes
      networkInterfaceMonitor!.addChangeCallback(_onNetworkInterfaceChange);

      // Initialize the network interface monitor
      await networkInterfaceMonitor!.initialize();
    }
  }

  /// Handles network interface changes
  void _onNetworkInterfaceChange() {
    // Trigger NAT behavior discovery when network interfaces change
    discoverBehavior();
  }

  /// Discovers the current NAT behavior
  Future<NatBehavior> discoverBehavior() async {
    final behavior = await stunClientPool.discoverNatBehavior();

    // Check if behavior has changed
    if (_behaviorHasChanged(behavior)) {
      final oldBehavior = _currentBehavior;
      _currentBehavior = behavior;

      // Add to history
      final record = NatBehaviorRecord(behavior: behavior);
      _behaviorHistory.add(record);

      // Limit history size
      while (_behaviorHistory.length > maxHistorySize) {
        _behaviorHistory.removeAt(0);
      }

      // Save to storage
      await _saveToStorage();

      // Notify callbacks
      _notifyCallbacks(oldBehavior, behavior);
    }

    return behavior;
  }

  /// Adds a callback for NAT behavior changes
  void addBehaviorChangeCallback(NatBehaviorChangeCallback callback) {
    _callbacks.add(callback);
  }

  /// Removes a callback for NAT behavior changes
  void removeBehaviorChangeCallback(NatBehaviorChangeCallback callback) {
    _callbacks.remove(callback);
  }

  /// Starts periodic checks for NAT behavior changes
  void _startPeriodicChecks() {
    _checkTimer?.cancel();
    _checkTimer = Timer.periodic(checkInterval, (_) {
      discoverBehavior();
    });
  }

  /// Stops periodic checks for NAT behavior changes
  void stopPeriodicChecks() {
    _checkTimer?.cancel();
    _checkTimer = null;
  }

  /// Checks if the NAT behavior has changed
  bool _behaviorHasChanged(NatBehavior newBehavior) {
    // If no history, behavior has changed
    if (_behaviorHistory.isEmpty) {
      return true;
    }

    // Compare with current behavior
    return newBehavior.mappingBehavior != _currentBehavior.mappingBehavior ||
           newBehavior.filteringBehavior != _currentBehavior.filteringBehavior ||
           newBehavior.supportsHairpinning != _currentBehavior.supportsHairpinning ||
           newBehavior.preservesPorts != _currentBehavior.preservesPorts ||
           newBehavior.supportsPortMapping != _currentBehavior.supportsPortMapping ||
           newBehavior.mappingLifetime != _currentBehavior.mappingLifetime;
  }

  /// Notifies callbacks of a NAT behavior change
  void _notifyCallbacks(NatBehavior oldBehavior, NatBehavior newBehavior) {
    for (final callback in _callbacks) {
      callback(oldBehavior, newBehavior);
    }
  }

  /// Loads NAT behavior history from storage
  Future<void> _loadFromStorage() async {
    if (storageBroker == null) return;

    try {
      final data = await storageBroker!.load(storageKey);
      if (data != null) {
        final json = jsonDecode(data) as List<dynamic>;
        _behaviorHistory.clear();
        for (final item in json) {
          _behaviorHistory.add(NatBehaviorRecord.fromJson(item as Map<String, dynamic>));
        }
      }
    } catch (e) {
    }
  }

  /// Saves NAT behavior history to storage
  Future<void> _saveToStorage() async {
    if (storageBroker == null) return;

    try {
      final json = _behaviorHistory.map((record) => record.toJson()).toList();
      final data = jsonEncode(json);
      await storageBroker!.save(storageKey, data);
    } catch (e) {
    }
  }

  /// Disposes the NAT behavior tracker
  void dispose() {
    stopPeriodicChecks();

    // Clean up network interface monitor if provided
    if (networkInterfaceMonitor != null) {
      networkInterfaceMonitor!.removeChangeCallback(_onNetworkInterfaceChange);
      networkInterfaceMonitor!.dispose();
    }

    _callbacks.clear();
  }
}
