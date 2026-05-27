/**
 * WebSocket API Protocol for NodeService
 *
 * The social app connects to the node via WebSocket and sends commands
 * using this protocol. All messages are JSON.
 *
 * Message Flow:
 *
 * 1. Client -> Server: RPC request
 *    { id: "msg_123", method: "sendHello", params: { ... } }
 *
 *    Server -> Client: RPC response
 *    { id: "msg_123", result: { decision: "accept" } }
 *    or
 *    { id: "msg_123", error: { code: "NOT_IMPLEMENTED", message: "..." } }
 *
 * 2. Client -> Server: Subscribe to events
 *    { id: "sub_456", method: "on", params: { event: "hello:request" } }
 *
 *    Server -> Client: Event (no id, since it's a push)
 *    { event: "hello:request", data: { ... } }
 *
 *    Client -> Server: Unsubscribe
 *    { id: "sub_456", method: "off", params: { event: "hello:request" } }
 *
 * 3. Connection status (server pushes on connect)
 *    { event: "connected", data: { peerId: "...", multiaddrs: [...] } }
 */
// ============================================
// Protocol Constants
// ============================================
export const WS_PROTOCOL_VERSION = "envoy/ws-api/0.1.0";
export const WS_PORT = 3030;
export const WS_PATH = "/ws";
// ============================================
// Request/Response Examples
// ============================================
/*
Example: Send Hello

Client -> Server:
{
  "id": "req_abc123",
  "method": "sendHello",
  "params": {
    "targetOwnerId": "envoy:owner:xyz789",
    "profile": {
      "displayName": "Alice",
      "interests": ["blues", "jazz"],
      "whatShares": ["music"]
    },
    "message": "Hi! We share music taste."
  }
}

Server -> Client:
{
  "id": "req_abc123",
  "result": {
    "messageId": "hello_xyz",
    "inReplyTo": "req_abc123",
    "decision": "accept",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}


Example: Subscribe to hello:request

Client -> Server:
{
  "id": "sub_def456",
  "method": "on",
  "params": {
    "event": "hello:request"
  }
}

Server -> Client (when hello arrives):
{
  "event": "hello:request",
  "data": {
    "messageId": "hello_xyz",
    "sender": {
      "nodeId": "QmPeerId",
      "ownerId": "envoy:owner:xyz789",
      "displayName": "Bob"
    },
    "profile": {
      "displayName": "Bob",
      "interests": ["rock"]
    },
    "message": "Hey there!",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}


Example: Search Peers

Client -> Server:
{
  "id": "req_ghi789",
  "method": "searchPeers",
  "params": {
    "interests": ["blues"],
    "maxResults": 10
  }
}

Server -> Client:
{
  "id": "req_ghi789",
  "result": [
    {
      "nodeId": "QmAlice",
      "ownerId": "envoy:owner:alice123",
      "displayName": "Alice",
      "interests": ["blues", "jazz"],
      "profileVisibility": "public"
    }
  ]
}
*/ 
//# sourceMappingURL=ws-protocol.js.map