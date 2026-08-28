# EnvoyMesh Network Model

This document explains how EnvoyMesh nodes connect to **public libp2p networks**, **private EnvoyMesh networks**, or **both** simultaneously.

## The Two Networks

EnvoyMesh can operate in two completely separate network spaces:

```
┌─────────────────────────────────────────────────────────────┐
│                 PUBLIC LIBP2P NETWORK                        │
│                                                             │
│   DNS: bootstrap.libp2p.io                                  │
│         │                                                   │
│         ▼                                                   │
│   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│   │Public   │ │Public   │ │Public   │ │Public   │  ...     │
│   │Bootstrap│ │Bootstrap│ │Bootstrap│ │Bootstrap│          │
│   │Server 1 │ │Server 2 │ │Server 3 │ │Server 4 │          │
│   └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘          │
│        └──────────┴──────────┴──────────┘                  │
│                       │                                      │
│                       ▼                                      │
│   Thousands of peers worldwide (anyone can join)            │
│                                                             │
│   DHT: Public records visible to everyone                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 YOUR PRIVATE ENVOYMESH NETWORK               │
│                                                             │
│   ┌──────────────────────────────────────────────────────┐   │
│   │              YOUR RELAY (VPS or Server)              │   │
│   │  - Only your nodes can connect                       │   │
│   │  - DHT stores ONLY your peers' records               │   │
│   │  - No connection to public network                   │   │
│   └──────────────────────────────────────────────────────┘   │
│                          ▲                                   │
│                          │ bootstrap                         │
│                          │                                   │
│   ┌──────────────────────┴──────────────────────────────┐  │
│   │                                                         │  │
│   │   Peer A          Peer B          Peer C               │  │
│   │  (Home Comp)     (Laptop)        (Office)              │  │
│   │                                                         │  │
│   └───────────────────────────────────────────────────────┘  │
│                                                             │
│   DHT: Your private records - only visible to your nodes     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concept: Two Separate DHT Databases

```
DHT = Distributed Hash Table
(A global database of "who is online and how to find them")
```

The libp2p DHT is **NOT a single global database**. It's a network of nodes that each store a portion of the data.

```
┌────────────────────────────────────────────────────────────────┐
│                     PUBLIC DHT (libp2p)                         │
│                                                                 │
│  Stored on:                                                     │
│    - bootstrap.libp2p.io servers                                 │
│    - Any peer running DHT server mode                          │
│                                                                 │
│  Contains:                                                      │
│    - Peer IDs and addresses of PUBLIC peers                    │
│    - Provider records for public content                       │
│    - Anyone can query this DHT                                 │
│                                                                 │
│  Example records:                                              │
│    - "QmXxx... can be reached at /ip4/1.2.3.4/tcp/4001"       │
│    - "QmYyy... can be reached at /ip4/5.6.7.8/tcp/5000"       │
│                                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                   PRIVATE DHT (Your Fleet)                     │
│                                                                 │
│  Stored on:                                                     │
│    - Your relay servers (if DHT server mode)                    │
│    - Your nodes (if DHT server mode)                           │
│                                                                 │
│  Contains:                                                      │
│    - Peer IDs and addresses of YOUR nodes only                 │
│    - No public peer information                                │
│                                                                 │
│  Example records:                                              │
│    - "QmYourNodeA can be reached at /ip4/YOUR_RELAY/p2p-circuit/p2p/QmYourNodeA" │
│    - "QmYourNodeB can be reached at /ip4/YOUR_RELAY/p2p-circuit/p2p/QmYourNodeB" │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**These DHTs are completely separate.** A query to one does NOT return results from the other.

---

## What Is a Bootstrap Peer?

A bootstrap peer is a **well-known entry point** to a DHT network. When your node starts:

```
1. Connect to bootstrap peer(s)
2. Ask bootstrap: "Who else is online?"
3. Bootstrap responds with peers it knows about
4. Your node now has peers to communicate with
5. Your node builds its own peer routing table over time
```

**Bootstrap peers do NOT:**
- Route your traffic (that's relay's job)
- Store all peers (they just know about some peers)

**Bootstrap peers DO:**
- Help you discover other peers
- Act as DHT servers if running in server mode

---

## What Is a Relay Server?

A relay server **routes traffic** between peers that cannot connect directly (both behind NAT).

```
┌─────────────────────────────────────────────────────────────┐
│                      WITHOUT RELAY                           │
│                                                             │
│   Peer A (NAT)  ────✗───►  Peer B (NAT)                    │
│      └───── Cannot connect directly ─────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       WITH RELAY                             │
│                                                             │
│   Peer A (NAT)  ─────►  RELAY  ◄─────  Peer B (NAT)        │
│        │               │                    │               │
│        └───────────────┴────────────────────┘               │
│                    (traffic routed through relay)            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## DHT Client vs DHT Server

When running with DHT enabled, you have two modes:

### DHT Client Mode (Default)

```
┌─────────────────────────────────────────────────────────────┐
│                   DHT CLIENT MODE                            │
│                                                             │
│   Your Node ──────────►  DHT Network                        │
│        │                                                    │
│        │  - Can QUERY for peers                             │
│        │  - Can FIND other peers                            │
│        │                                                    │
│        │  - CANNOT store records (= not a bootstrap peer)   │
│        │  - Other nodes cannot use you as bootstrap         │
│        │                                                    │
│        X  Cannot be found via DHT                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**What this means:**
- Your node can **discover** peers by querying the DHT
- Other nodes **cannot** find your node via DHT queries (you're not a bootstrap)
- You must give your address to other nodes directly (via `--bootstrap` flag)

### DHT Server Mode

```
┌─────────────────────────────────────────────────────────────┐
│                   DHT SERVER MODE                            │
│                                                             │
│   Your Node ◄──────────►  DHT Network                       │
│        │                                                    │
│        │  - Can QUERY for peers                             │
│        │  - Can FIND other peers                             │
│        │                                                    │
│        │  - CAN store records (= IS a bootstrap peer)       │
│        │  - Other nodes can find you via DHT                │
│        │                                                    │
│        ✓  Can be found via DHT by other nodes               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**What this means:**
- Your node can **discover** peers
- Your node **stores** peer records in the DHT
- Other nodes can **find you** via DHT queries
- You act as a **bootstrap peer** for the network

---

## The Three Scenarios

### Scenario 1: Public Network Only

```bash
# Use public libp2p bootstrap
npm run node:dev -- --bootstrap-preset public-libp2p
```

```
┌─────────────────────────────────────────────────────────────┐
│               PUBLIC LIBP2P NETWORK ONLY                    │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                  YOUR NODE                           │   │
│   │                                                     │   │
│   │  Connects to:                                       │   │
│   │    - Public bootstrap servers                       │   │
│   │    - Public DHT                                     │   │
│   │                                                     │   │
│   │  Can discover:                                      │   │
│   │    - Any peer on public network                     │   │
│   │                                                     │   │
│   │  Cannot discover:                                   │   │
│   │    - Your private EnvoyMesh nodes                   │   │
│   │    - Private DHT records                            │   │
│   │                                                     │   │
│   │  Traffic: Mixed with public traffic                 │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Your node is part of the PUBLIC libp2p network.           │
└─────────────────────────────────────────────────────────────┘
```

**When to use:** Testing, public applications, connecting to the broader libp2p ecosystem.

---

### Scenario 2: Private Network Only

```bash
# On your relay server (VPS)
./run-relay.sh --advertise YOUR_PUBLIC_IP

# On your nodes (home computers)
npm run node:dev -- --bootstrap /ip4/YOUR_RELAY_IP/tcp/4001/p2p/QmRelayPeerId
```

```
┌─────────────────────────────────────────────────────────────┐
│               PRIVATE ENVOYMESH NETWORK ONLY                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              YOUR RELAY (VPS)                       │   │
│   │                                                     │   │
│   │  - DHT mode: Client (default) or Server             │   │
│   │  - Relay: Enabled (routes traffic)                 │   │
│   │  - Only accepts connections from YOUR nodes        │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                          ▲                                   │
│                          │ bootstrap                        │
│                          │                                   │
│   ┌──────────────────────┴──────────────────────────────┐   │
│   │                   YOUR NODES                        │   │
│   │                                                     │   │
│   │  Connect to YOUR relay only                        │   │
│   │  Discover YOUR nodes via YOUR relay                │   │
│   │  Traffic stays within your private network         │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   Your nodes are ISOLATED from the public network.         │
└─────────────────────────────────────────────────────────────┘
```

**When to use:** Private applications, sensitive communications, when you don't want any public traffic.

---

### Scenario 3: Both Networks (Hybrid)

```bash
# Use BOTH public bootstrap AND your private relay
npm run node:dev \
  --bootstrap-preset public-libp2p \
  --bootstrap /ip4/YOUR_RELAY_IP/tcp/4001/p2p/QmRelayPeerId
```

```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID MODE                               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   YOUR NODE                          │   │
│   │                                                      │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │         TWO SEPARATE VIEWS                  │   │   │
│   │   │                                             │   │   │
│   │   │   PUBLIC SIDE:          PRIVATE SIDE:        │   │   │
│   │   │   - Public peers        - Your relay        │   │   │
│   │   │   - Public DHT          - Your nodes         │   │   │
│   │   │   - Via bootstrap.libp2p.io                 │   │   │
│   │   │                                             │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   │                                                      │   │
│   └─────────────────────────────────────────────────────┘   │
│                          │                                   │
│          ┌───────────────┴───────────────┐                  │
│          ▼                               ▼                  │
│   ┌─────────────────────┐     ┌─────────────────────┐        │
│   │ PUBLIC NETWORK      │     │ PRIVATE NETWORK    │        │
│   │                     │     │                     │        │
│   │ Public peers X,Y,Z  │     │ Your relay + nodes  │        │
│   │ (via public DHT)    │     │ (via your relay)    │        │
│   │                     │     │                     │        │
│   └─────────────────────┘     └─────────────────────┘        │
│                                                             │
│   Your node can access BOTH networks, but they are         │
│   completely separate - traffic does not mix.              │
└─────────────────────────────────────────────────────────────┘
```

**When to use:** When you want to connect to both your private nodes AND public libp2p peers (e.g., testing with public nodes while maintaining private fleet).

---

## How Your Relay Server Works

Your relay server has multiple components:

```
┌─────────────────────────────────────────────────────────────┐
│                  YOUR RELAY SERVER                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              CIRCUIT RELAY SERVICE                   │   │
│  │                                                     │   │
│  │  - Always enabled on relay server                  │   │
│  │  - Routes traffic between peers                     │   │
│  │  - Used when both peers are behind NAT              │   │
│  │                                                     │   │
│  │  Default ports: TCP 4001 (or custom)               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              DHT SERVICE (Configurable)              │   │
│  │                                                     │   │
│  │  Default (--dht-client):                            │   │
│  │    - Can QUERY peers                                │   │
│  │    - Cannot STORE records (not a bootstrap)         │   │
│  │    - Other nodes must use --bootstrap to find it    │   │
│  │                                                     │   │
│  │  With --dht-server:                                 │   │
│  │    - Can QUERY peers                                │   │
│  │    - Can STORE records (IS a bootstrap)            │   │
│  │    - Other nodes can discover it via DHT           │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              AUTO NAT SERVICE                        │   │
│  │                                                     │   │
│  │  - Detects NAT type                                 │   │
│  │  - Helps determine connection strategy               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              DCUTR SERVICE (Hole Punching)           │   │
│  │                                                     │   │
│  │  - Attempts direct connection through NAT           │   │
│  │  - Falls back to relay if hole punching fails       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Running Your Relay: DHT Client vs DHT Server

### Option A: DHT Client Mode (Default)

```bash
./run-relay.sh --advertise YOUR_PUBLIC_IP
# Or explicitly:
./run-relay.sh --advertise YOUR_PUBLIC_IP --dht-client
```

**Behavior:**
- Relay can query DHT to find peers
- Relay CANNOT store DHT records (not a bootstrap peer)
- Other nodes MUST use `--bootstrap` to connect to this relay
- This relay will NOT appear in DHT searches

**Best for:**
- Small private networks
- When you don't need DHT discovery

### Option B: DHT Server Mode

```bash
./run-relay.sh --advertise YOUR_PUBLIC_IP --dht-server
```

**Behavior:**
- Relay can query DHT to find peers
- Relay CAN store DHT records (IS a bootstrap peer)
- Other nodes can discover this relay via DHT queries
- This relay will appear in DHT searches

**Best for:**
- Larger networks where you want automatic discovery
- When you want to share relay address via DNS (e.g., `relay.example.com`)

---

## Domain-Based Relay Discovery (HTTP Info Endpoint)

Your relay server can expose an HTTP endpoint for easy discovery:

```bash
./run-relay.sh --advertise YOUR_PUBLIC_IP --http-port 15432
```

This enables:
- `/info` endpoint returns relay's peer ID and addresses
- Users can enter `relay.example.com:15432` instead of full multiaddr
- Node automatically resolves domain to full multiaddr

```
┌─────────────────────────────────────────────────────────────┐
│                  DOMAIN RESOLUTION FLOW                      │
│                                                             │
│   User enters: relay.example.com in app UI                 │
│                          │                                  │
│                          ▼                                  │
│   Node queries: http://relay.example.com:15432/info         │
│                          │                                  │
│                          ▼                                  │
│   Returns: {                                                             │
│     peerId: "Qm...",                                          │
│     addrs: ["/ip4/1.2.3.4/tcp/4001"]                         │
│   }                                                              │
│                          │                                  │
│                          ▼                                  │
│   Node constructs: /ip4/1.2.3.4/tcp/4001/p2p/Qm...          │
│                          │                                  │
│                          ▼                                  │
│   Node connects using full multiaddr                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Decision Guide: Which Mode Should You Use?

```
STARTING YOUR ENVOYMESH NODE:

1. Do you need to connect to PUBLIC libp2p peers?
   │
   ├── YES → Use --bootstrap-preset public-libp2p
   │         (You can ALSO add your private relay with --bootstrap)
   │
   └── NO (private mesh only)
       │
       └── Do you have a relay server?
           │
           ├── YES → Use --bootstrap /ip4/YOUR_RELAY_IP/tcp/4001/p2p/QmRelayPeerId
           │
           └── NO → Limited connectivity (can only connect if peers find you)
```

### Summary Table

| Mode | Bootstrap | DHT Access | Can Be Found | Use Case |
|------|-----------|------------|--------------|----------|
| Public only | `public-libp2p` | Public DHT | By public peers | Testing, public apps |
| Private only | Your relay multiaddr | Private DHT (if server mode) | By your nodes | Private mesh |
| Hybrid | Both | Both | Both (separate) | Mixed private/public |

---

## Quick Reference Commands

### Start a Relay Server

```bash
# Basic (DHT client mode)
./run-relay.sh --advertise YOUR_PUBLIC_IP

# With HTTP info endpoint (for domain discovery)
./run-relay.sh --advertise YOUR_PUBLIC_IP --http-port 15432

# DHT server mode (acts as bootstrap)
./run-relay.sh --advertise YOUR_PUBLIC_IP --dht-server
```

### Start a Node

```bash
# Private network only (use your relay)
npm run node:dev -- --bootstrap /ip4/YOUR_RELAY_IP/tcp/4001/p2p/QmRelayPeerId

# Public network only (use public bootstrap)
npm run node:dev -- --bootstrap-preset public-libp2p

# Hybrid (both networks)
npm run node:dev \
  --bootstrap-preset public-libp2p \
  --bootstrap /ip4/YOUR_RELAY_IP/tcp/4001/p2p/QmRelayPeerId
```

---

## Visual: Network Connectivity

```
                    ┌─────────────────────────────────────────────┐
                    │           INTERNET                          │
                    │                                             │
                    │  ┌─────────────────────────────────────┐   │
                    │  │      PUBLIC LIBP2P NETWORK           │   │
                    │  │                                       │   │
                    │  │   bootstrap.libp2p.io                 │   │
                    │  │        │                              │   │
                    │  │        ▼                              │   │
                    │  │   [Pub Boot] [Pub Boot] [Pub Boot]    │   │
                    │  │        │                              │   │
                    │  │        └──────────┬───────────────────┘   │
                    │  │                   │                       │
                    │  │         PUBLIC PEERS                     │
                    │  │         (X, Y, Z)                         │
                    │  │                                       │   │
                    │  └───────────────────────────────────────┘   │
                    │                                             │
                    └─────────────────────────────────────────────┘
                                        │
                    (if using --bootstrap-preset public-libp2p)
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          YOUR NODE                                     │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │  YOUR NODE                                                      │  │
│   │                                                                  │  │
│   │   peerId: QmYourNode                                            │  │
│   │                                                                  │  │
│   │   Connected to:                                                 │  │
│   │     - Public bootstrap (if configured)                          │  │
│   │     - Your private relay (if configured)                        │  │
│   │                                                                  │  │
│   │   Sees TWO separate peer sets:                                  │  │
│   │     ┌──────────────────┐     ┌──────────────────┐              │  │
│   │     │ PUBLIC PEERS     │     │ PRIVATE PEERS    │              │  │
│   │     │ via public DHT   │     │ via your relay   │              │  │
│   │     │                  │     │                  │              │  │
│   │     │ Peer X           │     │ Peer A           │              │  │
│   │     │ Peer Y           │     │ Peer B           │              │  │
│   │     │ Peer Z           │     │ Your Relay       │              │  │
│   │     └──────────────────┘     └──────────────────┘              │  │
│   │                                                                  │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
                                        │
                    (if using --bootstrap to your relay)
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                    YOUR PRIVATE NETWORK                                │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐  │
│   │              YOUR RELAY SERVER                                  │  │
│   │                                                                │  │
│   │   peerId: QmYourRelay                                           │  │
│   │   listen: /ip4/YOUR_PUBLIC_IP/tcp/4001                         │  │
│   │                                                                │  │
│   │   Services:                                                    │  │
│   │     - Circuit Relay (traffic routing)                          │  │
│   │     - DHT Client or Server                                     │  │
│   │     - AutoNAT                                                  │  │
│   │     - DCUtR                                                    │  │
│   │                                                                │  │
│   └────────────────────────────────────────────────────────────────┘  │
│                         ▲                                            │
│                         │                                            │
│           ┌─────────────┴─────────────┐                             │
│           │                           │                             │
│           ▼                           ▼                             │
│   ┌──────────────┐            ┌──────────────┐                    │
│   │   Peer A     │            │   Peer B     │                    │
│   │  (Home NAT)  │◄──────────►│  (Mobile NAT)│                    │
│   │              │   RELAY     │              │                    │
│   └──────────────┘   TRAFFIC   └──────────────┘                    │
│                                                                        │
│   Only YOUR nodes connect here - completely isolated from public net   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Security Notes

- **Public network:** Traffic is encrypted (libp2p Noise), but DHT records are publicly visible
- **Private network:** Only your nodes know about each other - more private
- **Hybrid:** Traffic remains separate; public peers cannot route to private peers