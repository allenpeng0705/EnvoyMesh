import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Manages a go-libp2p test peer process for interop testing.
class GoProcessManager {
  final String binaryPath;
  Process? _process;
  PeerId? _peerId;
  MultiAddr? _listenAddr;
  String? _circuitAddr;
  final List<String> _output = [];
  final _outputController = StreamController<String>.broadcast();
  bool _ready = false;

  GoProcessManager({required this.binaryPath});

  PeerId get peerId {
    if (_peerId == null) throw StateError('Go peer not started');
    return _peerId!;
  }

  MultiAddr get listenAddr {
    if (_listenAddr == null) throw StateError('Go peer not started');
    return _listenAddr!;
  }

  String get circuitAddr {
    if (_circuitAddr == null) throw StateError('No circuit address available');
    return _circuitAddr!;
  }

  List<String> get output => List.unmodifiable(_output);

  /// Builds the Go peer binary if it doesn't exist.
  static Future<String> ensureBinary(String goSourceDir) async {
    final binaryPath = '$goSourceDir/go-peer';
    final binary = File(binaryPath);

    if (!await binary.exists()) {
      final result = await Process.run(
        'go',
        ['build', '-o', 'go-peer', '.'],
        workingDirectory: goSourceDir,
      );
      if (result.exitCode != 0) {
        throw Exception('Failed to build Go peer: ${result.stderr}');
      }
    }
    return binaryPath;
  }

  /// Starts the Go peer in server mode on a random port.
  Future<void> startServer({int port = 0, String transport = 'tcp'}) async {
    await _start(['--mode=server', '--port=$port', '--transport=$transport']);
  }

  /// Starts the Go peer in echo-server mode.
  Future<void> startEchoServer({int port = 0, String transport = 'tcp'}) async {
    await _start(['--mode=echo-server', '--port=$port', '--transport=$transport']);
  }

  Future<void> _start(List<String> args) async {
    _process = await Process.start(binaryPath, args);

    _process!.stderr.transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
      _output.add('[stderr] $line');
      _outputController.add('[stderr] $line');
    });

    _process!.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((line) {
      _output.add(line);
      _outputController.add(line);

      if (line.startsWith('PeerID: ')) {
        _peerId = PeerId.fromString(line.substring('PeerID: '.length).trim());
      } else if (line.startsWith('Listening: ') && line.contains('127.0.0.1')) {
        _listenAddr = MultiAddr(line.substring('Listening: '.length).trim());
      } else if (line.startsWith('CircuitAddr: ')) {
        _circuitAddr = line.substring('CircuitAddr: '.length).trim();
      } else if (line == 'Ready') {
        _ready = true;
      }
    });

    // Wait for the process to be ready
    await waitForOutput('Ready', timeout: const Duration(seconds: 30));
  }

  /// Runs the Go peer in client mode (connects and exits).
  Future<ProcessResult> runClient(String targetMultiaddr, {String transport = 'tcp'}) async {
    return Process.run(
      binaryPath,
      ['--mode=client', '--target=$targetMultiaddr', '--transport=$transport'],
    );
  }

  /// Runs the Go peer in ping mode.
  Future<ProcessResult> runPing(String targetMultiaddr, {String transport = 'tcp'}) async {
    return Process.run(
      binaryPath,
      ['--mode=ping', '--target=$targetMultiaddr', '--transport=$transport'],
    );
  }

  /// Runs the Go peer in push-test mode.
  /// Connects to target, completes identify, then registers a new protocol
  /// to trigger an identify push notification.
  Future<ProcessResult> runPushTest(String targetMultiaddr, {String transport = 'tcp'}) async {
    return Process.run(
      binaryPath,
      ['--mode=push-test', '--target=$targetMultiaddr', '--transport=$transport'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Starts the Go peer in relay mode (circuit relay v2 service).
  Future<void> startRelay({int port = 0}) async {
    await _start(['--mode=relay', '--port=$port']);
  }

  /// Starts the Go peer in relay-echo-server mode.
  /// Connects to the relay and reserves a slot, then handles echo streams.
  Future<void> startRelayEchoServer(String relayAddr) async {
    await _start(['--mode=relay-echo-server', '--relay=$relayAddr']);
  }

  /// Runs the Go peer in relay-echo-client mode.
  Future<ProcessResult> runRelayEchoClient(String circuitAddr, String message) async {
    return Process.run(
      binaryPath,
      ['--mode=relay-echo-client', '--target=$circuitAddr', '--message=$message'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Starts the Go peer in dht-server mode.
  Future<void> startDHTServer({int port = 0}) async {
    await _start(['--mode=dht-server', '--port=$port']);
  }

  /// Runs the Go peer in dht-put-value mode.
  Future<ProcessResult> runDHTPutValue(String target, String key, String value) async {
    return Process.run(
      binaryPath,
      ['--mode=dht-put-value', '--target=$target', '--key=$key', '--value=$value'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Runs the Go peer in dht-put-value mode with --pk-self (stores own public key).
  Future<ProcessResult> runDHTPutPkSelf(String target) async {
    return Process.run(
      binaryPath,
      ['--mode=dht-put-value', '--target=$target', '--pk-self'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Runs the Go peer in dht-get-value mode.
  Future<ProcessResult> runDHTGetValue(String target, String key) async {
    return Process.run(
      binaryPath,
      ['--mode=dht-get-value', '--target=$target', '--key=$key'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Runs the Go peer in dht-get-value mode with --pk-peer (gets /pk/ record for a peer).
  Future<ProcessResult> runDHTGetPkPeer(String target, String peerId) async {
    return Process.run(
      binaryPath,
      ['--mode=dht-get-value', '--target=$target', '--pk-peer=$peerId'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Runs the Go peer in dht-provide mode.
  Future<ProcessResult> runDHTProvide(String target, String cid) async {
    return Process.run(
      binaryPath,
      ['--mode=dht-provide', '--target=$target', '--cid=$cid'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Runs the Go peer in dht-find-providers mode.
  Future<ProcessResult> runDHTFindProviders(String target, String cid) async {
    return Process.run(
      binaryPath,
      ['--mode=dht-find-providers', '--target=$target', '--cid=$cid'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Starts the Go peer in pubsub-server mode.
  Future<void> startPubSubServer({int port = 0, String topic = 'test-topic'}) async {
    await _start(['--mode=pubsub-server', '--port=$port', '--topic=$topic']);
  }

  /// Runs the Go peer in pubsub-client mode.
  Future<ProcessResult> runPubSubClient(String targetMultiaddr, String topic, String message) async {
    return Process.run(
      binaryPath,
      ['--mode=pubsub-client', '--target=$targetMultiaddr', '--topic=$topic', '--message=$message'],
      stdoutEncoding: utf8,
      stderrEncoding: utf8,
    ).timeout(const Duration(seconds: 30));
  }

  /// Runs the Go peer in echo-client mode.
  Future<ProcessResult> runEchoClient(String targetMultiaddr, String message, {String transport = 'tcp'}) async {
    return Process.run(
      binaryPath,
      ['--mode=echo-client', '--target=$targetMultiaddr', '--message=$message', '--transport=$transport'],
    );
  }

  /// Waits for a specific string to appear in the output.
  Future<String> waitForOutput(String pattern, {Duration timeout = const Duration(seconds: 30)}) async {
    // Check existing output first
    for (final line in _output) {
      if (line.contains(pattern)) return line;
    }

    return _outputController.stream
        .firstWhere((line) => line.contains(pattern))
        .timeout(timeout, onTimeout: () {
      throw TimeoutException(
        'Timed out waiting for "$pattern" in Go peer output.\nOutput so far:\n${_output.join("\n")}',
        timeout,
      );
    });
  }

  /// Stops the Go peer process.
  Future<void> stop() async {
    if (_process != null) {
      _process!.stdin.writeln('quit');
      // Give it a moment to exit gracefully
      final exitCode = await _process!.exitCode.timeout(
        const Duration(seconds: 5),
        onTimeout: () {
          _process!.kill(ProcessSignal.sigterm);
          return _process!.exitCode.timeout(
            const Duration(seconds: 2),
            onTimeout: () {
              _process!.kill(ProcessSignal.sigkill);
              return -1;
            },
          );
        },
      );
      _process = null;
    }
    _peerId = null;
    _listenAddr = null;
    _circuitAddr = null;
    _ready = false;
    _output.clear();
  }
}
