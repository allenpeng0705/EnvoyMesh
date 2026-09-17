# Resource Manager

A public-facing libp2p node can be exposed to resource exhaustion attacks, where malicious peers open many connections or streams to consume all available memory or file descriptors. The **Resource Manager** is the component responsible for protecting a node against such attacks by tracking and limiting the resources consumed by other peers.

## Key Concepts

The Resource Manager works with a system of hierarchical **scopes**. A scope represents a component (like a peer, a connection, or a service) that consumes resources. Resources are tracked and limited at each level of the hierarchy.

The main scopes are:
-   **System**: A global scope for the entire libp2p node.
-   **Transient**: A scope for new, untrusted incoming connections.
-   **Service**: A scope for a specific service (e.g., `dht`).
-   **Protocol**: A scope for a specific protocol (e.g., `/ipfs/ping/1.0.0`).
-   **Peer**: A scope for a specific remote peer.
-   **Connection**: A scope for a single network connection.
-   **Stream**: A scope for a single stream within a connection.

### Resource Limits

Each scope has a set of limits that can be configured. These include:
-   `maxConns`: Maximum number of connections.
-   `maxStreams`: Maximum number of streams.
-   `maxMemory`: Maximum memory (in bytes) that can be consumed.

When a component attempts to reserve a resource (e.g., open a new stream), the Resource Manager checks if the reservation would exceed the limits at every level of the scope hierarchy (from the stream's scope up to the system scope). If any limit is exceeded, the operation is denied.

## The `ResourceManager` Interface

The `ResourceManager` is the main entry point for interacting with this system. Implementations of this interface are responsible for tracking resource usage and enforcing limits.

The `ResourceManagerImpl` is the default implementation provided by this library.

### Key Methods

-   **`Future<ConnManagementScope> openConnection(...)`**: Creates a new connection scope. This is called by the `Swarm` when a new connection is established.
-   **`Future<StreamManagementScope> openStream(...)`**: Creates a new stream scope. This is called by the `Host` when a new stream is opened.
-   **`Future<void> close()`**: Closes the resource manager and releases its resources.

## Usage

The `ResourceManager` is a fundamental component of the `Swarm`. While you typically don't interact with it directly in application code, it's important to understand its role.

The default `ResourceManagerImpl` uses a `FixedLimiter` which provides a basic, non-configurable set of limits. For production applications, you will want to create a `ConfigurableLimiter` with limits tailored to your specific needs.

### Example: Configuring a Custom Limiter

```dart
import 'package:dart_libp2p/p2p/host/resource_manager/limiter.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/resource_manager_impl.dart';

// Create a custom limiter configuration
final limiterConfig = LimiterConfig(
  system: ScopeLimit(
    maxConns: 200,
    maxStreams: 1000,
    maxMemory: 2 * 1024 * 1024 * 1024, // 2 GB
  ),
  transient: ScopeLimit(
    maxConns: 50,
    maxStreams: 200,
    maxMemory: 256 * 1024 * 1024, // 256 MB
  ),
  peer: ScopeLimit(
    maxConns: 4,
    maxStreams: 32,
    maxMemory: 64 * 1024 * 1024, // 64 MB
  ),
);

// Create a configurable limiter with your custom config
final limiter = ConfigurableLimiter(limiterConfig);

// Create the resource manager with your custom limiter
final resourceManager = ResourceManagerImpl(limiter: limiter);

// When creating your Swarm or Host, you would pass this resourceManager in.
```

By properly configuring the Resource Manager, you can build more resilient and secure peer-to-peer applications.
