    import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Manages Docker containers for holepunch integration testing
class ContainerOrchestrator {
  final String composeFile;
  final Map<String, String> environment;
  final Duration startupTimeout;
  
  bool _isStarted = false;
  
  /// Check if the orchestrator is already started
  bool get isStarted => _isStarted;

  ContainerOrchestrator({
    required this.composeFile,
    Map<String, String>? environment,
    this.startupTimeout = const Duration(minutes: 2),
  }) : environment = environment ?? <String, String>{};

  /// Start the container topology
  Future<void> start() async {
    if (_isStarted) {
      throw StateError('Container orchestrator is already started');
    }

    print('🐳 Starting container topology...');
    
    // Clean up any leftover containers and networks first
    await _cleanup();
    
    // Build images first (with --no-cache to ensure all script changes are applied)
    print('🔨 Building images with --no-cache to ensure latest changes are applied...');
    await _runDockerCompose(['build', '--no-cache']);
    
    // Start services with orphan removal and force recreate
    await _runDockerCompose(['up', '-d', '--remove-orphans', '--force-recreate']);
    
    // Wait for services to be healthy
    await _waitForServices();
    
    _isStarted = true;
    print('✅ Container topology is ready');
  }

  /// Stop and clean up containers
  Future<void> stop() async {
    if (!_isStarted) return;

    print('🛑 Stopping container topology...');
    
    try {
      // Stop and remove containers
      await _runDockerCompose(['down', '-v', '--remove-orphans']);
      
      // Clean up networks
      await _runDockerCompose(['down', '--volumes', '--remove-orphans']);
      
    } catch (e) {
      print('⚠️ Warning during cleanup: $e');
    }
    
    _isStarted = false;
    print('✅ Container cleanup complete');
  }

  /// Clean up any leftover containers and networks before starting
  Future<void> _cleanup() async {
    print('🧹 Cleaning up leftover containers and networks...');
    
    try {
      // Force stop and remove any containers from this compose project
      await _runDockerCompose(['down', '-v', '--remove-orphans', '--timeout', '10']);
      
      // Clean up specific holepunch networks that might be leftover
      await _cleanupHolepunchNetworks();
      
      print('✅ Cleanup completed');
    } catch (e) {
      print('⚠️  Warning: Cleanup encountered issues (may be normal): $e');
    }
  }

  /// Clean up specific holepunch-related networks
  Future<void> _cleanupHolepunchNetworks() async {
    final networkNames = [
      'holepunch_nat_a',
      'holepunch_nat_b', 
      'holepunch_public',
      'holepunch_nat_a_net',
      'holepunch_nat_b_net',
      'holepunch_public_net',
    ];
    
    for (final networkName in networkNames) {
      try {
        final result = await Process.run('docker', ['network', 'rm', networkName]);
        if (result.exitCode == 0) {
          print('🗑️  Removed network: $networkName');
        }
      } catch (e) {
        // Ignore errors - network may not exist
      }
    }
  }

  /// Get the status of all services
  Future<Map<String, ContainerStatus>> getStatus() async {
    final result = await _runDockerCompose(['ps', '--format', 'json']);
    final lines = result.split('\n').where((line) => line.trim().isNotEmpty);
    
    final statuses = <String, ContainerStatus>{};
    for (final line in lines) {
      try {
        final data = jsonDecode(line) as Map<String, dynamic>;
        final name = data['Name'] as String;
        final state = data['State'] as String;
        statuses[name] = ContainerStatus(
          name: name,
          state: state,
          health: data['Health'] as String? ?? 'unknown',
        );
      } catch (e) {
        print('⚠️ Failed to parse container status: $e');
      }
    }
    
    return statuses;
  }

  /// Execute a command in a running container
  Future<String> exec(String containerName, List<String> command) async {
    final result = await Process.run(
      'docker',
      ['exec', containerName, ...command],
      environment: _buildEnvironment(),
    );
    
    if (result.exitCode != 0) {
      throw ContainerException(
        'Command failed in container $containerName: ${result.stderr}',
      );
    }
    
    return result.stdout as String;
  }

  /// Get logs from a container
  Future<String> getLogs(String containerName, {int? lines}) async {
    final args = ['logs'];
    if (lines != null) args.addAll(['--tail', lines.toString()]);
    args.add(containerName);
    
    final result = await Process.run('docker', args);
    return result.stdout as String;
  }

  /// Send HTTP request to a container's control API
  Future<Map<String, dynamic>> sendControlRequest(
    String containerName,
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
    Duration? timeout,
  }) async {
    // Increased timeout for health checks and holepunch operations
    timeout ??= (path == '/holepunch' 
      ? Duration(seconds: 45) 
      : path == '/status'
        ? Duration(seconds: 20) // Longer timeout for status checks during startup
        : Duration(seconds: 10));
    
    try {
      return await _performHttpRequest(containerName, path, method, body).timeout(timeout);
    } on TimeoutException catch (e) {
      throw ContainerException(
        'HTTP $method $path to $containerName timed out after ${timeout.inSeconds}s',
      );
    }
  }

  Future<Map<String, dynamic>> _performHttpRequest(
    String containerName,
    String path, 
    String method,
    Map<String, dynamic>? body,
  ) async {
    // Map container names to their host-mapped ports
    final portMappings = {
      'peer-a': 8081,
      'peer-b': 8082, 
      'relay-server': 8083,
    };
    
    final port = portMappings[containerName];
    if (port == null) {
      throw ContainerException('No port mapping configured for container $containerName');
    }
    
    // Make HTTP request to localhost with mapped port
    final client = HttpClient();
    try {
      final uri = Uri.parse('http://localhost:$port$path');
      final request = await client.openUrl(method, uri);
      
      if (body != null) {
        request.headers.contentType = ContentType.json;
        request.write(jsonEncode(body));
      }
      
      final response = await request.close();
      final responseBody = await utf8.decoder.bind(response).join();
      
      if (response.statusCode >= 400) {
        throw ContainerException(
          'HTTP $method $path failed with ${response.statusCode}: $responseBody',
        );
      }
      
      return jsonDecode(responseBody) as Map<String, dynamic>;
    } finally {
      client.close();
    }
  }

  Future<String> _runDockerCompose(List<String> args) async {
    final env = _buildEnvironment();
    
    // Debug: Print environment variables being passed
    if (environment.isNotEmpty) {
      print('🔧 Docker Compose environment variables:');
      environment.forEach((key, value) {
        print('   $key=$value');
      });
    }
    
    final result = await Process.run(
      'docker-compose',
      ['-f', composeFile, ...args],
      environment: env,
    );
    
    if (result.exitCode != 0) {
      throw ContainerException(
        'Docker compose command failed: ${result.stderr}',
      );
    }
    
    return result.stdout as String;
  }



  Future<void> _waitForServices() async {
    print('⏳ Waiting for services to be ready...');
    
    final timeout = DateTime.now().add(startupTimeout);
    int attemptCount = 0;
    
    while (DateTime.now().isBefore(timeout)) {
      attemptCount++;
      print('⏳ Health check attempt $attemptCount...');
      
      final statuses = await getStatus();
      final unhealthyServices = statuses.values
          .where((status) => status.state != 'running')
          .toList();
      
      if (unhealthyServices.isEmpty) {
        // All services are running, now check control APIs
        print('✅ All containers running, checking control APIs...');
        final controlChecks = await _checkControlAPIs();
        if (controlChecks) {
          print('✅ All services are healthy');
          return;
        } else {
          print('⏳ Control APIs not ready yet, waiting...');
        }
      } else {
        print('⏳ Waiting for ${unhealthyServices.length} services to start...');
      }
      
      await Future.delayed(Duration(seconds: 5));
    }
    
    throw ContainerException('Services failed to start within timeout');
  }

  Future<bool> _checkControlAPIs() async {
    final peerServices = ['relay-server', 'peer-a', 'peer-b']; // Check relay first as peers depend on it
    
    for (final service in peerServices) {
      try {
        await sendControlRequest(service, '/status');
        print('✅ $service control API is ready');
      } catch (e) {
        print('⏳ $service control API not ready: $e');
        return false;
      }
      // Small delay between checks to avoid overwhelming the system
      await Future.delayed(Duration(milliseconds: 500));
    }
    
    return true;
  }

  Map<String, String> _buildEnvironment() {
    final env = Map<String, String>.from(Platform.environment);
    env.addAll(environment);
    return env;
  }
}

class ContainerStatus {
  final String name;
  final String state;
  final String health;

  ContainerStatus({
    required this.name,
    required this.state,
    required this.health,
  });

  bool get isHealthy => state == 'running' && health != 'unhealthy';

  @override
  String toString() => '$name: $state ($health)';
}

class ContainerException implements Exception {
  final String message;
  ContainerException(this.message);
  
  @override
  String toString() => 'ContainerException: $message';
}
