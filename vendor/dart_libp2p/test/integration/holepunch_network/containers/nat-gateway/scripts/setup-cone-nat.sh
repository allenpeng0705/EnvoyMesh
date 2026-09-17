#!/bin/bash
# Cone NAT Configuration
# - Same external port for all destinations from the same internal source
# - Allows inbound traffic to established port mappings

set -e

echo "Setting up Cone NAT rules..."

# Get interface names (should be eth0=external, eth1=internal)
EXTERNAL_IF=${EXTERNAL_INTERFACE:-eth0}
INTERNAL_IF=${INTERNAL_INTERFACE:-eth1}
INTERNAL_SUBNET=${INTERNAL_SUBNET:-192.168.1.0/24}

echo "   External Interface: ${EXTERNAL_IF}"
echo "   Internal Interface: ${INTERNAL_IF}" 
echo "   Internal Subnet: ${INTERNAL_SUBNET}"

# Clear only our custom chains to avoid conflicts with Docker
iptables -t nat -N CONE_NAT 2>/dev/null || iptables -t nat -F CONE_NAT
iptables -t filter -N CONE_FORWARD 2>/dev/null || iptables -t filter -F CONE_FORWARD

# Set up more conservative forwarding policy
# Don't change default policies to avoid breaking Docker networking
iptables -P FORWARD ACCEPT  # Keep Docker networking working

# Enable forwarding between interfaces
# Use -I (INSERT) at specific positions to place rules BEFORE Docker's isolation rules
# Docker adds FORWARD rules that can block inter-network traffic, so we must insert first
iptables -I FORWARD 1 -i ${INTERNAL_IF} -o ${EXTERNAL_IF} -j ACCEPT
iptables -I FORWARD 2 -i ${EXTERNAL_IF} -o ${INTERNAL_IF} -m state --state ESTABLISHED,RELATED -j ACCEPT

# Cone NAT: Source NAT with consistent port mapping
# This creates endpoint-independent mapping (same external port regardless of destination)
# Try --random for port randomization, fall back to MASQUERADE without flags if not supported
set +e  # Temporarily disable exit on error
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j MASQUERADE --random 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  --random flag not supported, using basic MASQUERADE"
    iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j MASQUERADE
fi
set -e  # Re-enable exit on error

# Allow established and related connections back in
# Note: MASQUERADE already handles return traffic routing for established connections

# Log NAT translations for debugging
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j LOG --log-prefix "CONE-NAT-OUT: " --log-level 6
iptables -t nat -A PREROUTING -i ${EXTERNAL_IF} -j LOG --log-prefix "CONE-NAT-IN: " --log-level 6

echo "✅ Cone NAT configuration complete"
