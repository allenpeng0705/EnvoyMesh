#!/bin/bash
# Symmetric NAT Configuration
# - Different external port for each destination from the same internal source
# - Restricts inbound traffic to exact connection tuples (address + port dependent)

set -e

echo "Setting up Symmetric NAT rules..."

# Get interface names
EXTERNAL_IF=${EXTERNAL_INTERFACE:-eth0}
INTERNAL_IF=${INTERNAL_INTERFACE:-eth1}
INTERNAL_SUBNET=${INTERNAL_SUBNET:-192.168.1.0/24}

echo "   External Interface: ${EXTERNAL_IF}"
echo "   Internal Interface: ${INTERNAL_IF}"
echo "   Internal Subnet: ${INTERNAL_SUBNET}"

# Clear only our custom chains to avoid conflicts with Docker
iptables -t nat -N SYMM_NAT 2>/dev/null || iptables -t nat -F SYMM_NAT
iptables -t filter -N SYMM_FORWARD 2>/dev/null || iptables -t filter -F SYMM_FORWARD

# Set up more conservative forwarding policy
# Don't change default policies to avoid breaking Docker networking
iptables -P FORWARD ACCEPT  # Keep Docker networking working

# Enable forwarding between interfaces for established connections
# Use -I (INSERT) at specific positions to place rules BEFORE Docker's isolation rules
# Docker adds FORWARD rules that can block inter-network traffic, so we must insert first
iptables -I FORWARD 1 -i ${INTERNAL_IF} -o ${EXTERNAL_IF} -j ACCEPT
iptables -I FORWARD 2 -i ${EXTERNAL_IF} -o ${INTERNAL_IF} -m state --state ESTABLISHED,RELATED -j ACCEPT

# Symmetric NAT: Address and port dependent mapping
# Each destination gets a unique external port mapping
# Try --random for port randomization, fall back to MASQUERADE without flags if not supported
set +e  # Temporarily disable exit on error
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j MASQUERADE --random 2>/dev/null
if [ $? -ne 0 ]; then
    echo "⚠️  --random flag not supported, using basic MASQUERADE"
    iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j MASQUERADE
fi
set -e  # Re-enable exit on error

# Block inbound connections that don't match established outbound connections
# This simulates symmetric NAT's strict filtering (only allow ESTABLISHED,RELATED)
# Note: Filtering must be done in the filter table, not nat table
# Insert at position 3 (after our two ACCEPT rules)
iptables -I FORWARD 3 -i ${EXTERNAL_IF} -o ${INTERNAL_IF} -m state --state NEW -j DROP

# Log NAT translations for debugging
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j LOG --log-prefix "SYMM-NAT-OUT: " --log-level 6
iptables -t nat -A PREROUTING -i ${EXTERNAL_IF} -j LOG --log-prefix "SYMM-NAT-IN: " --log-level 6

echo "✅ Symmetric NAT configuration complete"
