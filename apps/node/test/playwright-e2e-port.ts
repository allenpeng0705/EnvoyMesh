import { createConnection, createServer } from "node:net";

/** Bind to port 0 and return an ephemeral localhost port for Playwright static servers. */
export async function pickFreePort(host = "127.0.0.1"): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

/** Poll until a TCP listener accepts connections (avoids WS races after listen()). */
export async function waitForTcpPort(host: string, port: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ host, port }, () => {
          socket.destroy();
          resolve();
        });
        socket.on("error", reject);
      });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  throw new Error(`TCP port ${host}:${port} not ready: ${String(lastError)}`);
}

type ChromiumModule = typeof import("playwright");
type ChromiumBrowser = Awaited<ReturnType<ChromiumModule["chromium"]["launch"]>>;
type ChromiumContext = Awaited<ReturnType<ChromiumBrowser["newContext"]>>;
type ChromiumPage = Awaited<ReturnType<ChromiumContext["newPage"]>>;

/**
 * Launch headless Chromium with Local Network Access permission and a page on
 * http://127.0.0.1 so browser WebSocket clients can reach loopback servers
 * (Chrome 142+ blocks ws://127.0.0.1 from about:blank / opaque origins).
 */
export async function createLocalhostChromiumPage(options: {
  launchArgs?: string[];
  originPort: number;
}): Promise<{ browser: ChromiumBrowser; context: ChromiumContext; page: ChromiumPage }> {
  const chromium = (await import("playwright")).chromium;
  const browser = await chromium.launch({
    headless: true,
    args: options.launchArgs ?? [],
  });
  const context = await browser.newContext({
    permissions: ["local-network-access"],
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${options.originPort}/`, { waitUntil: "domcontentloaded" });
  return { browser, context, page };
}
