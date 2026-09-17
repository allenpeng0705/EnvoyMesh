#!/bin/bash
set -e

echo "🚀 Starting Dart LibP2P Peer Container"
echo "   Role: ${PEER_ROLE:-peer}"
echo "   Name: ${PEER_NAME:-unknown}" 
echo "   Listen Addrs: ${LISTEN_ADDRS:-/ip4/0.0.0.0/tcp/4001}"

# Configure routing for NAT traversal FIRST (before any connectivity checks)
if [ -n "$PUBLIC_NET_SUBNET" ] && [ -n "$NAT_GATEWAY" ]; then
    echo "🔀 Configuring route to $PUBLIC_NET_SUBNET via NAT gateway $NAT_GATEWAY..."
    ip route add $PUBLIC_NET_SUBNET via $NAT_GATEWAY || echo "⚠️  Route already exists or failed to add"
fi

# NAT gateway info
if [ -n "$NAT_GATEWAY" ]; then
    echo "ℹ️  NAT gateway configured at $NAT_GATEWAY"
fi

# Quick relay connectivity check (non-blocking, just informational)
if [ -n "$RELAY_SERVERS" ]; then
    echo "⏳ Checking relay server connectivity..."
    FIRST_RELAY=$(echo $RELAY_SERVERS | cut -d',' -f1 | grep -oP '(?<=/ip4/)[^/]+')
    if [ -n "$FIRST_RELAY" ]; then
        nc -z -w 2 $FIRST_RELAY 4001 2>/dev/null && echo "✅ Relay reachable" || echo "⚠️  Relay not yet reachable (will retry in application)"
    fi
fi

# Show network configuration
echo "📡 Network Configuration:"
echo "   Hostname: $(hostname)"
echo "   IP Addresses:"
ip addr show | grep "inet " | sed 's/^/     /'

echo "   Routing Table:"
ip route show | sed 's/^/     /'

# Start the peer application
echo "🎬 Starting peer application..."
exec /app/peer
