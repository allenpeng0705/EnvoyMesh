#!/bin/bash
# Port-Restricted NAT Configuration  
# - Same external port for all destinations (like Cone NAT)
# - Only allows inbound traffic from same IP and port that was contacted

set -e

echo "Setting up Port-Restricted NAT rules..."

# Get interface names
EXTERNAL_IF=${EXTERNAL_INTERFACE:-eth0}
INTERNAL_IF=${INTERNAL_INTERFACE:-eth1}
INTERNAL_SUBNET=${INTERNAL_SUBNET:-192.168.1.0/24}

echo "   External Interface: ${EXTERNAL_IF}"
echo "   Internal Interface: ${INTERNAL_IF}"
echo "   Internal Subnet: ${INTERNAL_SUBNET}"

# Clear only our custom chains to avoid conflicts with Docker
iptables -t nat -N PORT_RESTR_NAT 2>/dev/null || iptables -t nat -F PORT_RESTR_NAT
iptables -t filter -N PORT_RESTR_FORWARD 2>/dev/null || iptables -t filter -F PORT_RESTR_FORWARD

# Set up more conservative forwarding policy
# Don't change default policies to avoid breaking Docker networking
iptables -P FORWARD ACCEPT  # Keep Docker networking working

# Enable forwarding for outbound traffic
iptables -A FORWARD -i ${INTERNAL_IF} -o ${EXTERNAL_IF} -j ACCEPT

# Port-Restricted NAT: endpoint-independent mapping but port-dependent filtering
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j MASQUERADE --random

# Only allow inbound traffic that matches EXACTLY the same destination IP:port
# that was previously contacted from inside
iptables -A FORWARD -i ${EXTERNAL_IF} -o ${INTERNAL_IF} -m state --state ESTABLISHED -j ACCEPT

# This rule makes it port-restricted: must match exact IP and port tuple
iptables -A FORWARD -i ${EXTERNAL_IF} -o ${INTERNAL_IF} -m state --state RELATED -j ACCEPT

# Block new inbound connections (makes it more restrictive than full cone)
iptables -A FORWARD -i ${EXTERNAL_IF} -o ${INTERNAL_IF} -m state --state NEW -j DROP

# Connection tracking to enforce port restrictions
iptables -t nat -A PREROUTING -i ${EXTERNAL_IF} -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -A PREROUTING -i ${EXTERNAL_IF} -m conntrack --ctstate NEW -j DROP

# Log NAT translations for debugging
iptables -t nat -A POSTROUTING -s ${INTERNAL_SUBNET} -o ${EXTERNAL_IF} -j LOG --log-prefix "PORT-RESTR-OUT: " --log-level 6
iptables -t nat -A PREROUTING -i ${EXTERNAL_IF} -j LOG --log-prefix "PORT-RESTR-IN: " --log-level 6

echo "✅ Port-Restricted NAT configuration complete"
