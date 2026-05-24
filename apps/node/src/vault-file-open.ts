import { spawn } from "node:child_process";
import { platform } from "node:os";
import { dirname } from "node:path";

function spawnDetached(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore", detached: true });
    child.on("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

/** Open a vault file with the OS default application (Preview, Adobe, etc.). */
export async function openPathWithDefaultApp(absolutePath: string): Promise<void> {
  const os = platform();
  if (os === "darwin") {
    await spawnDetached("open", [absolutePath]);
    return;
  }
  if (os === "win32") {
    await spawnDetached("cmd", ["/c", "start", "", absolutePath]);
    return;
  }
  await spawnDetached("xdg-open", [absolutePath]);
}

/** Reveal a vault file in Finder, Explorer, or the parent folder on Linux. */
export async function revealPathInFileManager(absolutePath: string): Promise<void> {
  const os = platform();
  if (os === "darwin") {
    await spawnDetached("open", ["-R", absolutePath]);
    return;
  }
  if (os === "win32") {
    await spawnDetached("explorer", [`/select,${absolutePath}`]);
    return;
  }
  await spawnDetached("xdg-open", [dirname(absolutePath)]);
}
