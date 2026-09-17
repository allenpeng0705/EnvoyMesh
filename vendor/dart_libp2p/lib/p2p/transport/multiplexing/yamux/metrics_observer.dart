import 'package:dart_libp2p/core/peer/peer_id.dart';

/// Observer interface for Yamux session metrics
/// 
/// This optional callback interface allows external metrics collectors
/// to observe Yamux session events for monitoring and performance analysis.
abstract class YamuxMetricsObserver {
  /// Called when a ping is sent
  void onPingSent(PeerId remotePeer, int pingId, DateTime timestamp);

  /// Called when a pong is received
  void onPongReceived(PeerId remotePeer, int pingId, DateTime sentTime, DateTime receivedTime, Duration rtt);

  /// Called when a stream open operation is initiated (before SYN is sent)
  /// Use with onStreamOpened to calculate stream open latency
  void onStreamOpenStart(PeerId remotePeer, int streamId);

  /// Called when a new stream is opened (after SYN-ACK received)
  void onStreamOpened(PeerId remotePeer, int streamId, String? protocol);

  /// Called when a stream is closed
  void onStreamClosed(PeerId remotePeer, int streamId, Duration duration, int bytesRead, int bytesWritten);

  /// Called when a stream is reset
  void onStreamReset(PeerId remotePeer, int streamId, String? reason);
  
  /// Called when a session-level error occurs
  void onSessionError(PeerId remotePeer, String error, StackTrace? stackTrace);
}

