const MIN_NODE_MAJOR = 22;
const MIN_NODE_MINOR = 5;
const RECOMMENDED_NODE_MINOR = 13;

function parseNodeVersion(version: string): [number, number, number] {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((part) => Number(part));
  return [major, minor, patch];
}

function isNodeVersionAtLeast(
  [major, minor]: [number, number, number],
  requiredMajor: number,
  requiredMinor: number,
): boolean {
  return major > requiredMajor || (major === requiredMajor && minor >= requiredMinor);
}

const current = parseNodeVersion(process.versions.node);

if (!isNodeVersionAtLeast(current, MIN_NODE_MAJOR, MIN_NODE_MINOR)) {
  console.error(
    [
      `EnvoyMesh requires Node.js >= ${MIN_NODE_MAJOR}.${MIN_NODE_MINOR}.0 for RAG vector storage (built-in node:sqlite).`,
      `Current: v${process.versions.node}`,
      `Upgrade to Node ${MIN_NODE_MAJOR}.${RECOMMENDED_NODE_MINOR}+ LTS (or Node 24 LTS), then rerun npm run node:dev.`,
      "Windows: https://nodejs.org/en/download — or fnm/nvm-windows to install the latest 22.x.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!isNodeVersionAtLeast(current, MIN_NODE_MAJOR, RECOMMENDED_NODE_MINOR)) {
  console.warn(
    `[node] Node ${MIN_NODE_MAJOR}.${RECOMMENDED_NODE_MINOR}+ is recommended (you have v${process.versions.node}). Older 22.x may require NODE_OPTIONS=--experimental-sqlite.`,
  );
}
