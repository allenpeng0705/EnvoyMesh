import { WebSocket } from "ws";

const URL = "ws://127.0.0.1:4030/ws";

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`timeout: ${method}`));
    }, 8000);
    ws.on("open", () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }));
    });
    ws.on("message", (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (e) {
        resolve({ raw: data.toString() });
      }
      ws.close();
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  for (const method of ["getNodeStatus", "getSetupSponsorFriendStatus"]) {
    console.log(`\n=== ${method} ===`);
    try {
      const r = await call(method);
      console.log(JSON.stringify(r, null, 2).slice(0, 1500));
    } catch (e) {
      console.log(`ERROR: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log("\n=== runSetupSponsorFriend forceBypassGuards=true ===");
  try {
    const r = await call("runSetupSponsorFriend", { forceBypassGuards: true });
    console.log(JSON.stringify(r, null, 2).slice(0, 2000));
  } catch (e) {
    console.log(`ERROR: ${e.message}`);
  }
}

main();
