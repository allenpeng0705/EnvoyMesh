# Basic Echo Example

This example demonstrates **one-way messaging** using `dart-libp2p`. It creates a client that sends messages to an echo server, which receives and displays them. This is perfect for understanding the fundamentals of libp2p communication without the complexity of bidirectional chat.

## What This Example Demonstrates

- **Host Creation**: Setting up libp2p hosts with UDX transport and Noise security
- **Direct Peer Connection**: Connecting two peers using known addresses
- **Protocol Handling**: Implementing a custom echo protocol (`/echo/1.0.0`)
- **One-Way Communication**: Client → Server message flow
- **Stream Management**: Opening streams, sending data, and proper cleanup

## How It Works

1. **Two Hosts**: Creates a client host and a server host
2. **Direct Connection**: Client connects directly to server using its known address
3. **Echo Protocol**: When you type a message, client sends it to server using `/echo/1.0.0`
4. **Server Echo**: Server receives and displays the message (echoes it to console)

```
You type: "Hello World!"
    ↓
[Client] ──────────→ [Server]
                         ↓
                    🔊 Echo received: "Hello World!"
```

## Architecture

### EchoClient
- **Purpose**: Sends messages to echo servers
- **Method**: `sendEcho(targetPeer, message)` - sends a message to a peer
- **Behavior**: Opens stream, sends message, closes stream

### EchoServer  
- **Purpose**: Receives and displays echo messages
- **Handler**: `_handleEchoRequest()` - processes incoming echo streams
- **Behavior**: Reads message, displays it, closes stream

## Running the Example

From the project root directory:

```bash
dart run example/echo_basic/main.dart
```

## Expected Output

```
🔊 Starting Basic Echo Example
This example demonstrates one-way messaging where a client sends messages to an echo server.

Client Host: [a1b2c3d4] listening on [/ip4/127.0.0.1/udp/54321/udx]
Server Host: [e5f6g7h8] listening on [/ip4/127.0.0.1/udp/12345/udx]

✅ Client connected to server successfully!

--- Echo Session Started! ---
Type a message and press Enter to send it to the echo server.

📤 CLIENT [a1b2c3d4] sends messages
🔊 SERVER [e5f6g7h8] receives and displays them

💡 Note: You'll see both CLIENT and SERVER logs since both run in this same process.
Type "quit" to exit.
------------------------------

> Hello libp2p!
📤 [ECHO CLIENT] Sending: "Hello libp2p!" to server [e5f6g7h8]

🔊 [ECHO SERVER] Received: "Hello libp2p!" from client [a1b2c3d4]
> 
```

## Understanding the Output

**Important:** You see both sides of the conversation because the client and server run in the same process:

- **📤 CLIENT logs**: Show when messages are sent
- **🔊 SERVER logs**: Show when messages are received and "echoed"
- **Debug logs**: You may see internal protocol debug messages (these can be ignored)

This is **normal behavior** - you're seeing the complete echo flow from both perspectives!

## Key Components

### Protocol Definition
- **Protocol ID**: `/echo/1.0.0`
- **Message Format**: UTF-8 encoded strings with newline terminator
- **Flow**: Client opens stream → sends message → closes stream → server displays

### Host Configuration
Uses shared `host_utils.dart` for consistent setup:
- **Ed25519 Keys**: For peer identity  
- **UDX Transport**: UDP-based networking
- **Noise Security**: Encrypted connections
- **Connection Manager**: Peer connection handling

## Learning Objectives

This example teaches:

✅ **Basic libp2p concepts** - hosts, peers, streams, protocols  
✅ **Stream lifecycle** - open, write, close pattern  
✅ **Protocol handlers** - registering and implementing custom protocols  
✅ **Peer connections** - connecting to known peers  
✅ **Error handling** - network operation error management  

## Limitations (By Design)

This is intentionally a simple example:

- **One-Way Only**: Server cannot send messages back to client
- **Two Peers Only**: No multi-peer support  
- **No Discovery**: Requires known peer addresses
- **Simple Protocol**: Basic string messages only

## Next Steps

After mastering this echo example:

1. **Understand the Code**: Study how streams and protocols work
2. **Try Modifications**: Change the protocol ID, add timestamps, etc.
3. **Explore mDNS Chat**: See `../chat_mdns/` for bidirectional chat with peer discovery
4. **Build Your Own**: Create custom protocols for your use case

This echo example provides a solid foundation for understanding libp2p fundamentals before moving to more complex scenarios! 🎯
