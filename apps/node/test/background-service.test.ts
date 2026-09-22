import { describe, expect, it } from "vitest";
import {
  parseNodeServiceStatus,
  launcherSourceForTests,
  unitPlanForTests,
} from "../src/background-service.js";

describe("background service unit", () => {
  it("forwards a supervisor stop to the node and does not start another copy", () => {
    const source = launcherSourceForTests();
    expect(source).toContain('process.on("SIGTERM"');
    expect(source).toContain("if (stopping) process.exit(0)");
    expect(source).not.toContain("process.kill(process.pid, signal)");
  });
  it("keeps a macOS job up after a crash and down after a clean exit", () => {
    const plan = unitPlanForTests("macos", "/tmp/home/background-service-launch.cjs");
    expect(plan.contents).toContain("<string>mesh.envoy.node</string>");
    expect(plan.contents).toContain("<key>SuccessfulExit</key>\n    <false/>");
    expect(plan.contents).toContain("<key>RunAtLoad</key>");
    expect(plan.contents).toContain("node-service.out.log");
    expect(plan.contents).toContain("node-service.err.log");
    const logs = [...plan.contents.matchAll(/<string>([^<]*node-service\.[^<]+)<\/string>/g)].map((match) => match[1]);
    expect(logs).toHaveLength(2);
    expect(logs[0]).not.toBe(logs[1]);
    expect(plan.install[0]?.args).toEqual(["bootout", expect.stringMatching(/^gui\/\d+\/mesh\.envoy\.node$/)]);
    expect(plan.install[0]?.args).toHaveLength(2);
  });

  it("does not restart a Linux unit after a deliberate stop or a damaged profile", () => {
    const plan = unitPlanForTests("linux", "/tmp/home/background-service-launch.cjs");
    expect(plan.contents).toContain("Restart=always");
    expect(plan.contents).toContain("RestartPreventExitStatus=0 4");
    expect(plan.uninstall.some((step) => step.args.includes("disable") && step.args.includes("--now"))).toBe(true);
  });

  it("asks Windows to keep going on battery, without a time limit", () => {
    const plan = unitPlanForTests("windows", "/tmp/home/background-service-launch.cjs");
    expect(plan.contents).toContain("<Count>999</Count>");
    expect(plan.contents).toContain("<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>");
    expect(plan.contents).toContain("<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>");
    expect(plan.contents).toContain("<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>");
    expect(plan.contents).toContain("<RunLevel>LeastPrivilege</RunLevel>");
    expect(plan.status).toHaveLength(2);
  });
});

describe("background service status", () => {
  it("reads a running launchd job", () => {
    expect(parseNodeServiceStatus("macos", 0, "state = running\npid = 42\n", "")).toEqual({
      state: "running",
      enabled: true,
      pid: 42,
      detail: "state = running\npid = 42",
    });
  });

  it("does not treat a missing launchd domain as 'not installed'", () => {
    expect(parseNodeServiceStatus("macos", 1, "", "Bad request.").state).toBe("unknown");
  });

  it("treats a clean systemd stop as installed, and exit-status words as enabled", () => {
    const text = "LoadState=loaded\nActiveState=inactive\nUnitFileState=enabled\nMainPID=0\n";
    expect(parseNodeServiceStatus("linux", 0, text, "")).toMatchObject({
      state: "installed-stopped",
      enabled: true,
    });
  });

  it("uses the Windows XML for existence and only English words for running", () => {
    const xml = "<Settings><Enabled>true</Enabled></Settings>";
    expect(parseNodeServiceStatus("windows", 0, xml, "", { code: 0, stdout: "Status: Running" })).toMatchObject({
      state: "running",
      enabled: true,
    });
    expect(parseNodeServiceStatus("windows", 0, xml, "", { code: 0, stdout: "Status: Wird" }).state).toBe("unknown");
    expect(parseNodeServiceStatus("windows", 1, "", "The system cannot find the file specified.").state).toBe(
      "not-installed",
    );
    expect(parseNodeServiceStatus("windows", 1, "", "Access is denied.").state).toBe("unknown");
  });
});
