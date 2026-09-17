FROM alpine:3.18

# Install necessary packages for NAT simulation
RUN apk add --no-cache \
    iptables \
    tcpdump \
    socat \
    iproute2 \
    bash \
    curl

# Copy NAT configuration scripts
COPY scripts/ /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Enable IP forwarding
RUN echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose common ports for testing
EXPOSE 1024-65535

ENTRYPOINT ["/entrypoint.sh"]
