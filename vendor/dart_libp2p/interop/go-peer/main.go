package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
	"time"

	"github.com/libp2p/go-libp2p"
	"github.com/libp2p/go-libp2p/core/crypto"
	"github.com/libp2p/go-libp2p/core/host"
	"github.com/libp2p/go-libp2p/core/network"
	"github.com/libp2p/go-libp2p/core/peer"
	"github.com/libp2p/go-libp2p/core/protocol"
	"github.com/libp2p/go-libp2p/p2p/security/noise"
	yamux "github.com/libp2p/go-libp2p/p2p/muxer/yamux"
	relayv2 "github.com/libp2p/go-libp2p/p2p/protocol/circuitv2/relay"
	relayv2client "github.com/libp2p/go-libp2p/p2p/protocol/circuitv2/client"
	"github.com/libp2p/go-libp2p/p2p/transport/tcp"
	udxtransport "github.com/stephanfeb/go-libp2p-udx-transport"
	dht "github.com/libp2p/go-libp2p-kad-dht"
	pubsub "github.com/libp2p/go-libp2p-pubsub"
	"github.com/ipfs/go-cid"
	"github.com/multiformats/go-multiaddr"
)

const echoProtocol = "/echo/1.0.0"

func main() {
	defer func() {
		if r := recover(); r != nil {
			buf := make([]byte, 8192)
			n := runtime.Stack(buf, true)
			fmt.Fprintf(os.Stderr, "[UDX-DIAG] PANIC RECOVERED: %v\n%s\n", r, string(buf[:n]))
			os.Exit(2)
		}
	}()

	mode := flag.String("mode", "server", "Mode: server, client, ping, echo-server, echo-client, push-test, relay, relay-echo-server, relay-echo-client, dht-server, dht-put-value, dht-get-value, dht-provide, dht-find-providers, pubsub-server, pubsub-client")
	port := flag.Int("port", 0, "Listen port (0 for random)")
	target := flag.String("target", "", "Target multiaddr for client/ping modes")
	message := flag.String("message", "hello from go-libp2p", "Message to send in echo-client mode")
	relayAddr := flag.String("relay", "", "Relay multiaddr for relay-echo-server mode")
	key := flag.String("key", "", "DHT record key (for put/get value)")
	value := flag.String("value", "", "DHT record value (for put value)")
	cidStr := flag.String("cid", "", "Content ID (for provide/find-providers)")
	pkSelf := flag.Bool("pk-self", false, "For dht-put-value: store own public key as /pk/<self> record")
	pkPeer := flag.String("pk-peer", "", "PeerId (base58) to construct /pk/<raw-id> key for get-value")
	topic := flag.String("topic", "test-topic", "PubSub topic name")
	transport := flag.String("transport", "tcp", "Transport: tcp or udx")
	flag.Parse()

	switch *mode {
	case "server":
		runServer(*port, *transport)
	case "client":
		runClient(*target, *transport)
	case "ping":
		runPing(*target, *transport)
	case "echo-server":
		runEchoServer(*port, *transport)
	case "echo-client":
		runEchoClient(*target, *message, *transport)
	case "push-test":
		runPushTest(*target, *transport)
	case "relay":
		runRelay(*port)
	case "relay-echo-server":
		runRelayEchoServer(*relayAddr)
	case "relay-echo-client":
		runRelayEchoClient(*target, *message)
	case "dht-server":
		runDHTServer(*port)
	case "dht-put-value":
		runDHTPutValue(*target, *key, *value, *pkSelf)
	case "dht-get-value":
		runDHTGetValue(*target, *key, *pkPeer)
	case "dht-provide":
		runDHTProvide(*target, *cidStr)
	case "dht-find-providers":
		runDHTFindProviders(*target, *cidStr)
	case "pubsub-server":
		runPubSubServer(*port, *topic)
	case "pubsub-client":
		runPubSubClient(*target, *topic, *message)
	default:
		fmt.Fprintf(os.Stderr, "Unknown mode: %s\n", *mode)
		os.Exit(1)
	}
}

func transportOpts(transport string, port int) []libp2p.Option {
	if transport == "udx" {
		return []libp2p.Option{
			libp2p.NoTransports,
			libp2p.Transport(udxtransport.NewTransport),
			libp2p.ListenAddrStrings(fmt.Sprintf("/ip4/0.0.0.0/udp/%d/udx", port)),
			libp2p.ResourceManager(&network.NullResourceManager{}),
		}
	}
	return []libp2p.Option{
		libp2p.Transport(tcp.NewTCPTransport),
		libp2p.ListenAddrStrings(fmt.Sprintf("/ip4/0.0.0.0/tcp/%d", port)),
	}
}

func createHost(port int, transport string) (host.Host, error) {
	priv, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}

	opts := []libp2p.Option{
		libp2p.Identity(priv),
		libp2p.Security(noise.ID, noise.New),
		libp2p.Muxer("/yamux/1.0.0", yamux.DefaultTransport),
		libp2p.DisableRelay(),
	}
	opts = append(opts, transportOpts(transport, port)...)
	return libp2p.New(opts...)
}

func createHostWithRelay(port int, transport string) (host.Host, error) {
	priv, _, err := crypto.GenerateEd25519Key(rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("generate key: %w", err)
	}

	opts := []libp2p.Option{
		libp2p.Identity(priv),
		libp2p.Security(noise.ID, noise.New),
		libp2p.Muxer("/yamux/1.0.0", yamux.DefaultTransport),
		libp2p.EnableRelay(),
	}
	opts = append(opts, transportOpts(transport, port)...)
	return libp2p.New(opts...)
}

func printHostInfo(h host.Host) {
	fmt.Printf("PeerID: %s\n", h.ID())
	for _, addr := range h.Addrs() {
		fmt.Printf("Listening: %s/p2p/%s\n", addr, h.ID())
	}
	fmt.Println("Ready")
}

func parseTarget(targetStr string) (*peer.AddrInfo, error) {
	maddr, err := multiaddr.NewMultiaddr(targetStr)
	if err != nil {
		return nil, fmt.Errorf("parse multiaddr: %w", err)
	}
	return peer.AddrInfoFromP2pAddr(maddr)
}

func waitForShutdown() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
	fmt.Println("Shutting down")
}

// server mode: listen and accept connections, handle ping and identify automatically
func runServer(port int, transport string) {
	h, err := createHost(port, transport)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	printHostInfo(h)

	// Also handle echo protocol
	h.SetStreamHandler(protocol.ID(echoProtocol), func(s network.Stream) {
		defer s.Close()
		buf := make([]byte, 64*1024)
		for {
			n, err := s.Read(buf)
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(os.Stderr, "Echo read error: %v\n", err)
				}
				return
			}
			if _, err := s.Write(buf[:n]); err != nil {
				fmt.Fprintf(os.Stderr, "Echo write error: %v\n", err)
				return
			}
		}
	})

	// Listen for commands on stdin
	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "quit" || line == "exit" {
				os.Exit(0)
			}
		}
	}()

	waitForShutdown()
}

// client mode: connect to target peer
func runClient(targetStr, transport string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}

	h, err := createHost(0, transport)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Connected: %s\n", info.ID)
}

// ping mode: connect and send pings
func runPing(targetStr, transport string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}

	h, err := createHost(0, transport)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	// Use the built-in ping protocol
	s, err := h.NewStream(ctx, info.ID, "/ipfs/ping/1.0.0")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Ping stream failed: %v\n", err)
		os.Exit(1)
	}
	defer s.Close()

	pingData := make([]byte, 32)
	rand.Read(pingData)

	start := time.Now()
	if _, err := s.Write(pingData); err != nil {
		fmt.Fprintf(os.Stderr, "Ping write failed: %v\n", err)
		os.Exit(1)
	}

	resp := make([]byte, 32)
	if _, err := io.ReadFull(s, resp); err != nil {
		fmt.Fprintf(os.Stderr, "Ping read failed: %v\n", err)
		os.Exit(1)
	}
	rtt := time.Since(start)

	match := true
	for i := range pingData {
		if pingData[i] != resp[i] {
			match = false
			break
		}
	}

	if match {
		fmt.Printf("Ping successful: rtt=%v\n", rtt)
	} else {
		fmt.Fprintln(os.Stderr, "Ping failed: data mismatch")
		os.Exit(1)
	}
}

// echo-server mode: listen and echo data back
func runEchoServer(port int, transport string) {
	h, err := createHost(port, transport)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	h.SetStreamHandler(protocol.ID(echoProtocol), func(s network.Stream) {
		defer s.Close()
		buf := make([]byte, 64*1024)
		for {
			n, err := s.Read(buf)
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(os.Stderr, "Echo read error: %v\n", err)
				}
				return
			}
			fmt.Printf("Echo: received %d bytes\n", n)
			if _, err := s.Write(buf[:n]); err != nil {
				fmt.Fprintf(os.Stderr, "Echo write error: %v\n", err)
				return
			}
		}
	})

	printHostInfo(h)
	waitForShutdown()
}

// push-test mode: connect to target, wait for identify, then register a new
// protocol handler to trigger an identify push notification to the remote peer.
func runPushTest(targetStr, transport string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}

	h, err := createHost(0, transport)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("PeerID: %s\n", h.ID())
	fmt.Println("Connected")

	// Wait for identify to complete
	time.Sleep(2 * time.Second)

	// Register a new protocol handler — this triggers identify push
	const pushTestProto = "/test/push-verify/1.0.0"
	h.SetStreamHandler(protocol.ID(pushTestProto), func(s network.Stream) {
		s.Close()
	})
	fmt.Printf("Registered protocol: %s\n", pushTestProto)

	// Give the push time to propagate
	time.Sleep(3 * time.Second)
	fmt.Println("Push test complete")
}

// relay mode: run a circuit relay v2 service
func runRelay(port int) {
	h, err := createHostWithRelay(port, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	_, err = relayv2.New(h)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Relay service error: %v\n", err)
		os.Exit(1)
	}

	printHostInfo(h)

	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "quit" || line == "exit" {
				os.Exit(0)
			}
		}
	}()

	waitForShutdown()
}

// relay-echo-server mode: connect to relay, reserve, then handle echo streams
func runRelayEchoServer(relayAddrStr string) {
	if relayAddrStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --relay required")
		os.Exit(1)
	}

	h, err := createHostWithRelay(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	// Parse relay address and connect
	relayInfo, err := parseTarget(relayAddrStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing relay addr: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, *relayInfo); err != nil {
		fmt.Fprintf(os.Stderr, "Relay connection failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Connected to relay")

	// Reserve a slot on the relay using the client package
	rsvp, err := relayv2client.Reserve(ctx, h, *relayInfo)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Relay reservation failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Reservation expires: %v\n", rsvp.Expiration)

	// Listen on the relay circuit address so we can accept incoming relayed connections
	relayMA, err := multiaddr.NewMultiaddr(fmt.Sprintf("/p2p/%s/p2p-circuit", relayInfo.ID))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating relay listen addr: %v\n", err)
		os.Exit(1)
	}
	if err := h.Network().Listen(relayMA); err != nil {
		fmt.Fprintf(os.Stderr, "Relay listen failed: %v\n", err)
		os.Exit(1)
	}

	// Set echo handler
	h.SetStreamHandler(protocol.ID(echoProtocol), func(s network.Stream) {
		defer s.Close()
		buf := make([]byte, 64*1024)
		for {
			n, err := s.Read(buf)
			if err != nil {
				if err != io.EOF {
					fmt.Fprintf(os.Stderr, "Echo read error: %v\n", err)
				}
				return
			}
			fmt.Printf("Echo: received %d bytes\n", n)
			if _, err := s.Write(buf[:n]); err != nil {
				fmt.Fprintf(os.Stderr, "Echo write error: %v\n", err)
				return
			}
		}
	})

	// Wait for the relay reservation to propagate
	time.Sleep(2 * time.Second)

	// Print circuit address for clients to connect to
	fmt.Printf("PeerID: %s\n", h.ID())
	foundCircuit := false
	for _, addr := range h.Addrs() {
		addrStr := addr.String()
		if strings.Contains(addrStr, "p2p-circuit") {
			fmt.Printf("CircuitAddr: %s/p2p/%s\n", addr, h.ID())
			foundCircuit = true
		}
	}
	if !foundCircuit {
		// Construct circuit address using relay's transport address
		for _, raddr := range relayInfo.Addrs {
			raddrStr := raddr.String()
			if strings.Contains(raddrStr, "127.0.0.1") {
				fmt.Printf("CircuitAddr: %s/p2p/%s/p2p-circuit/p2p/%s\n", raddr, relayInfo.ID, h.ID())
				foundCircuit = true
				break
			}
		}
		if !foundCircuit {
			fmt.Printf("CircuitAddr: %s/p2p/%s/p2p-circuit/p2p/%s\n", relayInfo.Addrs[0], relayInfo.ID, h.ID())
		}
	}
	fmt.Println("Ready")

	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "quit" || line == "exit" {
				os.Exit(0)
			}
		}
	}()

	waitForShutdown()
}

// relay-echo-client mode: connect to peer through relay and send echo
func runRelayEchoClient(targetStr, message string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}

	h, err := createHostWithRelay(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	// Parse the circuit address — contains relay + destination
	targetMA, err := multiaddr.NewMultiaddr(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error parsing target: %v\n", err)
		os.Exit(1)
	}

	info, err := peer.AddrInfoFromP2pAddr(targetMA)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error extracting peer info: %v\n", err)
		os.Exit(1)
	}

	// Add the circuit address to the peerstore
	h.Peerstore().AddAddrs(info.ID, info.Addrs, time.Hour)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Connect through the relay
	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Circuit connection failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Connected through relay")

	// Use WithAllowLimitedConn to allow streams over transient (relayed) connections
	s, err := h.NewStream(network.WithAllowLimitedConn(ctx, "relay-echo-client"), info.ID, protocol.ID(echoProtocol))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Stream failed: %v\n", err)
		os.Exit(1)
	}
	defer s.Close()

	data := []byte(message)
	if _, err := s.Write(data); err != nil {
		fmt.Fprintf(os.Stderr, "Write failed: %v\n", err)
		os.Exit(1)
	}
	s.CloseWrite()

	resp, err := io.ReadAll(s)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Read failed: %v\n", err)
		os.Exit(1)
	}

	if string(resp) == message {
		fmt.Printf("Echo successful: %q\n", string(resp))
	} else {
		fmt.Fprintf(os.Stderr, "Echo mismatch: sent %q, got %q\n", message, string(resp))
		os.Exit(1)
	}
}

// echo-client mode: connect and send a message
func runEchoClient(targetStr, message, transport string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}

	h, err := createHost(0, transport)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	s, err := h.NewStream(ctx, info.ID, protocol.ID(echoProtocol))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Stream failed: %v\n", err)
		os.Exit(1)
	}
	defer s.Close()

	data := []byte(message)
	if _, err := s.Write(data); err != nil {
		fmt.Fprintf(os.Stderr, "Write failed: %v\n", err)
		os.Exit(1)
	}
	s.CloseWrite()

	resp, err := io.ReadAll(s)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Read failed: %v\n", err)
		os.Exit(1)
	}

	if string(resp) == message {
		fmt.Printf("Echo successful: %q\n", string(resp))
	} else {
		fmt.Fprintf(os.Stderr, "Echo mismatch: sent %q, got %q\n", message, string(resp))
		os.Exit(1)
	}
}

// dht-server mode: run a Kademlia DHT server
func runDHTServer(port int) {
	h, err := createHost(port, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	ctx := context.Background()
	// Use permissive options for local testing: allow private/loopback addresses
	kadDHT, err := dht.New(ctx, h,
		dht.Mode(dht.ModeServer),
		dht.AddressFilter(func(addrs []multiaddr.Multiaddr) []multiaddr.Multiaddr {
			return addrs // Accept all addresses including loopback
		}),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "DHT error: %v\n", err)
		os.Exit(1)
	}
	defer kadDHT.Close()

	if err := kadDHT.Bootstrap(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "DHT bootstrap error: %v\n", err)
		os.Exit(1)
	}

	printHostInfo(h)

	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "quit" || line == "exit" {
				os.Exit(0)
			}
		}
	}()

	waitForShutdown()
}

// dht-put-value mode: connect to target DHT peer and store a value
func runDHTPutValue(targetStr, key, value string, pkSelf bool) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}
	if !pkSelf && (key == "" || value == "") {
		fmt.Fprintln(os.Stderr, "Error: --key and --value required (or use --pk-self)")
		os.Exit(1)
	}

	h, err := createHost(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	kadDHT, err := dht.New(ctx, h, dht.Mode(dht.ModeClient))
	if err != nil {
		fmt.Fprintf(os.Stderr, "DHT error: %v\n", err)
		os.Exit(1)
	}
	defer kadDHT.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	if err := kadDHT.Bootstrap(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "DHT bootstrap error: %v\n", err)
		os.Exit(1)
	}
	// Allow routing table to populate
	time.Sleep(2 * time.Second)

	if pkSelf {
		// Store own public key as /pk/<raw-peer-id> record
		// This is the spec-compliant way to publish a public key
		pkKey := "/pk/" + string(h.ID())
		pubKeyBytes, err := crypto.MarshalPublicKey(h.Peerstore().PubKey(h.ID()))
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to marshal public key: %v\n", err)
			os.Exit(1)
		}
		if err := kadDHT.PutValue(ctx, pkKey, pubKeyBytes); err != nil {
			fmt.Fprintf(os.Stderr, "PutValue /pk/ failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("PeerID: %s\n", h.ID())
		fmt.Println("Put /pk/ successful")
	} else {
		if err := kadDHT.PutValue(ctx, key, []byte(value)); err != nil {
			fmt.Fprintf(os.Stderr, "PutValue failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Put successful")
	}
}

// dht-get-value mode: connect to target DHT peer and retrieve a value
func runDHTGetValue(targetStr, key, pkPeerStr string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}
	if key == "" && pkPeerStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --key or --pk-peer required")
		os.Exit(1)
	}

	h, err := createHost(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	kadDHT, err := dht.New(ctx, h, dht.Mode(dht.ModeClient))
	if err != nil {
		fmt.Fprintf(os.Stderr, "DHT error: %v\n", err)
		os.Exit(1)
	}
	defer kadDHT.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	if err := kadDHT.Bootstrap(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "DHT bootstrap error: %v\n", err)
		os.Exit(1)
	}
	time.Sleep(2 * time.Second)

	// Build the actual key
	actualKey := key
	if pkPeerStr != "" {
		// Construct /pk/<raw-peer-id> from the base58 peer ID
		pid, err := peer.Decode(pkPeerStr)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Invalid peer ID: %v\n", err)
			os.Exit(1)
		}
		actualKey = "/pk/" + string(pid)
	}

	val, err := kadDHT.GetValue(ctx, actualKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "GetValue failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Value: %d bytes\n", len(val))
	fmt.Println("Get successful")
}

// dht-provide mode: connect to target DHT peer and announce as provider
func runDHTProvide(targetStr, cidStr string) {
	if targetStr == "" || cidStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target and --cid required")
		os.Exit(1)
	}

	h, err := createHost(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	kadDHT, err := dht.New(ctx, h, dht.Mode(dht.ModeClient))
	if err != nil {
		fmt.Fprintf(os.Stderr, "DHT error: %v\n", err)
		os.Exit(1)
	}
	defer kadDHT.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	if err := kadDHT.Bootstrap(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "DHT bootstrap error: %v\n", err)
		os.Exit(1)
	}
	time.Sleep(2 * time.Second)

	c, err := cid.Decode(cidStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid CID: %v\n", err)
		os.Exit(1)
	}

	if err := kadDHT.Provide(ctx, c, true); err != nil {
		fmt.Fprintf(os.Stderr, "Provide failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Provide successful")
}

// dht-find-providers mode: connect to target DHT peer and find providers for a CID
func runDHTFindProviders(targetStr, cidStr string) {
	if targetStr == "" || cidStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target and --cid required")
		os.Exit(1)
	}

	h, err := createHost(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	kadDHT, err := dht.New(ctx, h,
		dht.Mode(dht.ModeClient),
		dht.AddressFilter(func(addrs []multiaddr.Multiaddr) []multiaddr.Multiaddr {
			return addrs // Accept all addresses including loopback
		}),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "DHT error: %v\n", err)
		os.Exit(1)
	}
	defer kadDHT.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}

	if err := kadDHT.Bootstrap(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "DHT bootstrap error: %v\n", err)
		os.Exit(1)
	}
	time.Sleep(2 * time.Second)

	c, err := cid.Decode(cidStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid CID: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Searching for providers of CID: %s (multihash: %s)\n", c, c.Hash())
	provChan := kadDHT.FindProvidersAsync(ctx, c, 20)
	found := false
	for prov := range provChan {
		if prov.ID == "" {
			continue
		}
		fmt.Printf("Provider: %s\n", prov.ID)
		found = true
	}
	if !found {
		fmt.Fprintln(os.Stderr, "No providers found")
		os.Exit(1)
	}
}

// debugTracer logs pubsub validation events
type debugTracer struct{}
func (t *debugTracer) AddPeer(p peer.ID, proto protocol.ID) {}
func (t *debugTracer) RemovePeer(p peer.ID) {}
func (t *debugTracer) Join(topic string) {}
func (t *debugTracer) Leave(topic string) {}
func (t *debugTracer) Graft(p peer.ID, topic string) {}
func (t *debugTracer) Prune(p peer.ID, topic string) {}
func (t *debugTracer) ValidateMessage(msg *pubsub.Message) {
	fmt.Fprintf(os.Stderr, "TRACE ValidateMessage: from=%s topic=%s datalen=%d\n", msg.GetFrom(), msg.GetTopic(), len(msg.Data))
}
func (t *debugTracer) DeliverMessage(msg *pubsub.Message) {
	fmt.Fprintf(os.Stderr, "TRACE DeliverMessage: from=%s topic=%s datalen=%d\n", msg.GetFrom(), msg.GetTopic(), len(msg.Data))
}
func (t *debugTracer) RejectMessage(msg *pubsub.Message, reason string) {
	fmt.Fprintf(os.Stderr, "TRACE RejectMessage: from=%s topic=%s reason=%s\n", msg.GetFrom(), msg.GetTopic(), reason)
}
func (t *debugTracer) DuplicateMessage(msg *pubsub.Message) {}
func (t *debugTracer) ThrottlePeer(p peer.ID) {}
func (t *debugTracer) RecvRPC(rpc *pubsub.RPC) {}
func (t *debugTracer) SendRPC(rpc *pubsub.RPC, p peer.ID) {}
func (t *debugTracer) DropRPC(rpc *pubsub.RPC, p peer.ID) {}
func (t *debugTracer) UndeliverableMessage(msg *pubsub.Message) {
	fmt.Fprintf(os.Stderr, "TRACE UndeliverableMessage: from=%s topic=%s\n", msg.GetFrom(), msg.GetTopic())
}

// pubsub-server mode: create GossipSub, subscribe to topic, print received messages
func runPubSubServer(port int, topicName string) {
	h, err := createHost(port, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	ctx := context.Background()
	ps, err := pubsub.NewGossipSub(ctx, h,
		pubsub.WithRawTracer(&debugTracer{}),
	)
	if err != nil {
		fmt.Fprintf(os.Stderr, "GossipSub error: %v\n", err)
		os.Exit(1)
	}

	topic, err := ps.Join(topicName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Join topic error: %v\n", err)
		os.Exit(1)
	}

	sub, err := topic.Subscribe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Subscribe error: %v\n", err)
		os.Exit(1)
	}

	printHostInfo(h)

	// Read messages in background
	go func() {
		for {
			msg, err := sub.Next(ctx)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Sub.Next error: %v\n", err)
				return
			}
			fmt.Fprintf(os.Stderr, "Got message from %s (receivedFrom: %s), data len: %d\n",
				msg.GetFrom(), msg.ReceivedFrom, len(msg.Data))
			// Skip our own messages
			if msg.ReceivedFrom == h.ID() {
				fmt.Fprintf(os.Stderr, "Skipping own message\n")
				continue
			}
			fmt.Printf("Received: %s\n", string(msg.Data))
		}
	}()

	go func() {
		scanner := bufio.NewScanner(os.Stdin)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "quit" || line == "exit" {
				os.Exit(0)
			}
		}
	}()

	waitForShutdown()
}

// pubsub-client mode: connect to target, subscribe to topic, publish a message
func runPubSubClient(targetStr, topicName, message string) {
	if targetStr == "" {
		fmt.Fprintln(os.Stderr, "Error: --target required")
		os.Exit(1)
	}

	h, err := createHost(0, "tcp")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	defer h.Close()

	info, err := parseTarget(targetStr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.Connect(ctx, *info); err != nil {
		fmt.Fprintf(os.Stderr, "Connection failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("Connected")

	ps, err := pubsub.NewGossipSub(ctx, h)
	if err != nil {
		fmt.Fprintf(os.Stderr, "GossipSub error: %v\n", err)
		os.Exit(1)
	}

	topic, err := ps.Join(topicName)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Join topic error: %v\n", err)
		os.Exit(1)
	}

	// Subscribe first (required before publishing in GossipSub)
	sub, err := topic.Subscribe()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Subscribe error: %v\n", err)
		os.Exit(1)
	}
	_ = sub

	// Wait for mesh to form, then publish multiple times to ensure delivery
	time.Sleep(3 * time.Second)

	for i := 0; i < 5; i++ {
		if err := topic.Publish(ctx, []byte(message)); err != nil {
			fmt.Fprintf(os.Stderr, "Publish failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Published attempt %d: %s\n", i+1, message)
		time.Sleep(2 * time.Second)
	}
	fmt.Printf("Published: %s\n", message)
	fmt.Println("PubSub client done")
}

