# Relay Diagnostics System - Implementation Complete

This document summarizes the comprehensive relay diagnostics system implemented to diagnose circuit relay connection instability.

## Overview

A multi-layer instrumentation and diagnostics system has been implemented across three repositories:
- **dart-udx**: Low-level UDX transport instrumentation
- **dart-libp2p**: Metrics observer integration
- **overtop**: UI and service layer for diagnostics

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      OverTop App                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  RelayDiagnosticsScreen (3 Tabs: Timeline/Health/Metrics)│ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  RelayDiagnosticsProvider                              │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────┬───────────────────────────────────┐ │
│  │ ConnectionTimeline │  RelayHealthWatchdog              │ │
│  │    Service         │  (30s probe interval)             │ │
│  └────────────────────┴───────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    Collectors Layer                          │
│  ┌──────────────┬──────────────┬──────────────────────────┐ │
│  │UdxCollector  │RelayCollector│YamuxCollector            │ │
│  └──────────────┴──────────────┴──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                dart-libp2p Transport Layer                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  UDXTransport (with metricsObserver)                 │  │
│  │  ├─ UDXMultiplexer (passes observer to sockets)     │  │
│  │  └─ UDPSocket (emits metrics)                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│                    dart-udx Layer                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  UdxMetricsObserver Interface                        │  │
│  │  ├─ UDPSocket (handshake, streams, path migration)  │  │
│  │  ├─ UDXStream (byte tracking)                        │  │
│  │  └─ CongestionController (RTT, cwnd, retransmits)   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### Phase 1: UDX Layer Instrumentation

#### 1.1 UdxMetricsObserver Interface
**Location**: `dart-udx/lib/src/metrics_observer.dart`

Defines callbacks for all low-level UDX events:
- Handshake start/complete
- Stream created/closed/limit exceeded
- RTT samples
- Congestion window updates
- Flow control blocks
- Packet retransmission/loss
- Path migration

#### 1.2 Instrumented Classes

**UDPSocket** (`dart-udx/lib/src/socket.dart`):
- Tracks handshake timing
- Emits stream lifecycle events
- Reports path migration events
- Added `metricsObserver` field

**UDXStream** (`dart-udx/lib/src/stream.dart`):
- Added `connectedAt`, `bytesRead`, `bytesWritten` tracking
- Tracks stream duration
- Reports byte statistics on closure

**CongestionController** (`dart-udx/lib/src/congestion.dart`):
- Added `metricsObserver` and `connectionId` fields
- Emits RTT samples
- Reports congestion window changes with reasons
- Tracks retransmissions

**UDXMultiplexer** (`dart-udx/lib/src/multiplexer.dart`):
- Accepts `metricsObserver` parameter
- Passes observer to all created sockets

### Phase 2: LibP2P Integration

**UDXTransport** (`dart-libp2p/lib/p2p/transport/udx_transport.dart`):
- Added `metricsObserver` field
- Passes observer to multiplexer during dial and listen

### Phase 3: OverTop Models and Collectors

#### Models Created:
1. **`connection_timeline.dart`**: TimelineEvent, TimelineLayer, PeerTimeline
2. **`udx_metric.dart`**: UdxMetric with factory methods for each event type
3. **`relay_health.dart`**: RelayHealthReport, HealthCheck, HealthCheckStatus

#### Collectors:
**UdxCollector** (`overtop/lib/data/collectors/udx_collector.dart`):
- Implements `UdxMetricsObserver`
- Converts UDX events → TimelineEvents + UdxMetrics
- Maintains connection ID → peer ID mapping
- Stores last 1000 timeline events

### Phase 4: Services

#### ConnectionTimelineService
**Location**: `overtop/lib/services/connection_timeline_service.dart`

Features:
- Aggregates events from all collectors
- Maintains indexes by peer ID and connection ID
- Provides queryable timeline history
- Supports filtering by layer and time range
- Stores up to 5000 events

#### RelayHealthWatchdog
**Location**: `overtop/lib/services/relay_health_watchdog.dart`

Features:
- Periodic health probes (30s interval)
- Checks: reservation validity, Yamux keepalive RTT, UDX connection, RTT latency
- Generates structured health reports
- Emits health report stream
- Supports manual health checks

### Phase 5: UI Components

#### RelayDiagnosticsScreen
**Location**: `overtop/lib/ui/screens/relay_diagnostics_screen.dart`

**Tab 1: Timeline**
- Chronological event list
- Color-coded by layer (UDX=blue, Yamux=amber, Relay=purple)
- Filterable by layer
- Shows event type, duration, success/failure
- Displays metadata (bytes, RTT, etc.)

**Tab 2: Health**
- Large health status indicator
- List of individual checks with pass/warn/fail badges
- "Run Health Check" button
- Last check timestamp
- Summary statistics

**Tab 3: Metrics** (Placeholder for future charts)
- RTT history chart (placeholder)
- Retransmit rate
- Congestion window display

#### Supporting Widgets:
- **TimelineEventCard**: Displays individual timeline events
- **HealthStatusIndicator**: Large circular health badge
- **LayerBadge**: Colored layer indicators

#### Peer Detail Enhancement
**Location**: `overtop/lib/ui/screens/peer_detail_screen.dart`

Added:
- "Relay Diagnostics" button (only visible for relay connections)
- Relay peer ID display in connection stats
- Navigation to RelayDiagnosticsScreen

### Phase 6: Integration

#### P2PService
**Location**: `overtop/lib/services/p2p_service.dart`

Integrated:
- Created `UdxCollector`, `RelayCollector`
- Set `metricsObserver` on UDXTransport
- Initialized `ConnectionTimelineService`
- Started `RelayHealthWatchdog`
- Exposed services via getters

#### App Providers
**Location**: `overtop/lib/app.dart`

Added:
- `RelayDiagnosticsProvider` wired to timeline and health services
- Lazy initialization when P2P service is ready

## Key Metrics Captured

### UDX Layer
- Handshake duration and success rate
- Stream lifecycle (open, close, duration, bytes transferred)
- RTT samples (raw, smoothed, variance)
- Congestion window changes (with reasons: ack, loss, timeout)
- Retransmission attempts and packet loss events
- Flow control blocks
- Path migration events

### Relay Layer
- Reservation validity
- Yamux keepalive RTT
- Connection health
- Stream counts

## Usage

1. **Access Diagnostics**:
   - Navigate to peer detail screen
   - Tap "Relay Diagnostics" button (relay connections only)

2. **Timeline Tab**:
   - View chronological events
   - Filter by layer (UDX, Yamux, Relay)
   - Identify patterns in failures

3. **Health Tab**:
   - View overall connection health
   - Check individual health metrics
   - Run manual health checks
   - Monitor health trends

4. **Metrics Tab**:
   - View real-time metrics (future enhancement)
   - Track RTT trends
   - Monitor retransmissions

## Benefits

1. **Fine-grained visibility**: Track events from UDX transport up through relay protocol
2. **Correlation**: Connect low-level transport issues with high-level failures
3. **Proactive monitoring**: Detect degradation before complete failure
4. **Targeted debugging**: Pinpoint exact layer and event type causing issues
5. **Production-ready**: Low overhead, optional instrumentation

## Future Enhancements

1. **Live Charts**: RTT graphs, cwnd history visualization
2. **Anomaly Detection**: Automatic detection of unusual patterns
3. **Export**: Export timeline events for offline analysis
4. **Alerts**: Configurable alerts for specific event patterns
5. **Metrics Aggregation**: Historical trends and statistics
6. **Per-Stream Metrics**: Track individual stream performance

## Files Created/Modified

### dart-udx (7 files)
- ✅ `lib/src/metrics_observer.dart` (NEW)
- ✅ `lib/dart_udx.dart` (MODIFIED - export)
- ✅ `lib/src/socket.dart` (MODIFIED - instrumented)
- ✅ `lib/src/stream.dart` (MODIFIED - instrumented)
- ✅ `lib/src/congestion.dart` (MODIFIED - instrumented)
- ✅ `lib/src/multiplexer.dart` (MODIFIED - observer propagation)

### dart-libp2p (1 file)
- ✅ `lib/p2p/transport/udx_transport.dart` (MODIFIED - observer wiring)

### overtop (16 files)
- ✅ `lib/core/models/connection_timeline.dart` (NEW)
- ✅ `lib/core/models/udx_metric.dart` (NEW)
- ✅ `lib/core/models/relay_health.dart` (NEW)
- ✅ `lib/core/models/peer_info.dart` (MODIFIED - added relay fields)
- ✅ `lib/data/collectors/udx_collector.dart` (NEW)
- ✅ `lib/services/connection_timeline_service.dart` (NEW)
- ✅ `lib/services/relay_health_watchdog.dart` (NEW)
- ✅ `lib/services/p2p_service.dart` (MODIFIED - integration)
- ✅ `lib/ui/screens/relay_diagnostics_screen.dart` (NEW)
- ✅ `lib/ui/screens/peer_detail_screen.dart` (MODIFIED - added button)
- ✅ `lib/ui/widgets/timeline_event_card.dart` (NEW)
- ✅ `lib/ui/widgets/health_status_indicator.dart` (NEW)
- ✅ `lib/ui/widgets/layer_badge.dart` (NEW)
- ✅ `lib/providers/relay_diagnostics_provider.dart` (NEW)
- ✅ `lib/app.dart` (MODIFIED - provider wiring)

## Conclusion

The relay diagnostics system provides comprehensive, multi-layer instrumentation for diagnosing circuit relay connection instability. It transforms "too much noise and not enough signal" into actionable insights through structured event capture, health monitoring, and intuitive visualization.

The system is now ready to act as a "canary" in the P2P network, providing early warning of connection degradation and detailed forensics when failures occur.

