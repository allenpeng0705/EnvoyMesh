/// Newline-delimited framing for the family's mesh host wire.
///
/// The home's mesh host transport (`@envoymesh/host-connect`'s `splitFrames`) reads
/// **newline-delimited** frames. Every transport that writes to a home over a *raw* duplex must
/// append this delimiter, and the failure when it does not is not a parse error — it is a **hang**:
/// the home buffers the bytes as an incomplete frame and waits forever for a boundary that never
/// arrives. That is why `frameMeshMessage` exists rather than an interpolation at each call site.
///
/// The direct-libp2p transport already frames at its write (`envoy_mesh_libp2p`'s `frameMessage`,
/// which cannot be imported here without dragging libp2p into a pure thin client); this is the same
/// contract for the relay WebSocket transport, which forwards the bytes it receives verbatim to the
/// home's stream. The relay-to-*client* direction is WebSocket messages, whose boundaries are
/// preserved, so it needs no delimiter.
library;

/// The frame delimiter. One definition for this package's writers.
const String kMeshFrameDelimiter = '\n';

/// Delimit one outbound message as a single frame.
String frameMeshMessage(String data) => '$data$kMeshFrameDelimiter';
