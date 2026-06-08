/**
 * Vitest global setup.
 *
 * Patches `os.networkInterfaces()` to return a stub loopback interface when
 * the host environment has none (e.g. some sandboxes). Without this, libp2p's
 * `multicast-dns` throws `uv_interface_addresses returned Unknown system
 * error 1`, which then cascades into hundreds of false-positive test
 * failures across the whole suite.
 *
 * This is environment-only — it does not change behavior in normal dev / CI
 * environments where real interfaces exist.
 */
import os from "node:os";

const realNetworkInterfaces = os.networkInterfaces.bind(os);

interface FakeInterface {
  address: string;
  netmask: string;
  family: "IPv4";
  mac: string;
  internal: boolean;
  cidr: string | null;
}

const FAKE_LOOPBACK: FakeInterface = {
  address: "127.0.0.1",
  netmask: "255.0.0.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal: true,
  cidr: "127.0.0.1/8",
};

let patched = false;

export function patchOsNetworkInterfaces(): void {
  if (patched) return;
  patched = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).networkInterfaces = function patchedNetworkInterfaces() {
    try {
      const real = realNetworkInterfaces();
      if (real && Object.keys(real).length > 0) return real;
    } catch {
      // fall through to stub
    }
    return { lo: [FAKE_LOOPBACK] };
  };
}

patchOsNetworkInterfaces();
