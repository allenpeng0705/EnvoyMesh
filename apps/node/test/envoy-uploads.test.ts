import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_CHAT_ATTACHMENT_BYTES } from "@envoymesh/api";
import {
  envoyUploadsDir,
  sanitizeUploadFilename,
  saveEnvoyUpload,
} from "../src/envoy-uploads.js";

describe("envoy-uploads", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it("sanitizeUploadFilename strips path segments and unsafe chars", () => {
    expect(sanitizeUploadFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeUploadFilename("a/b\\c.txt")).toBe("c.txt");
    expect(sanitizeUploadFilename('bad<>:"|?*.bin')).toBe("bad_______.bin");
    expect(sanitizeUploadFilename("...")).toBe("upload.bin");
  });

  it("saveEnvoyUpload writes under envoy-uploads/ with stamped name", () => {
    const profileDir = mkdtempSync(join(tmpdir(), "envoy-uploads-"));
    dirs.push(profileDir);
    const content = Buffer.from("hello attach");
    const result = saveEnvoyUpload(profileDir, {
      filename: "note.txt",
      mimeType: "text/plain",
      contentBase64: content.toString("base64"),
    });
    expect(result.ok).toBe(true);
    expect(result.path).toBeTruthy();
    expect(result.path!.startsWith(envoyUploadsDir(profileDir))).toBe(true);
    expect(result.name).toMatch(/^\d{8}-\d{6}-note\.txt$/);
    expect(result.mimeType).toBe("text/plain");
    expect(result.sizeBytes).toBe(content.byteLength);
    expect(existsSync(result.path!)).toBe(true);
    expect(readFileSync(result.path!).toString("utf8")).toBe("hello attach");
  });

  it("saveEnvoyUpload writes under project .envoy-attachments when targetDir set", () => {
    const profileDir = mkdtempSync(join(tmpdir(), "envoy-uploads-"));
    const projectDir = mkdtempSync(join(tmpdir(), "envoy-project-"));
    dirs.push(profileDir, projectDir);
    const content = Buffer.from("project scoped");
    const result = saveEnvoyUpload(profileDir, {
      filename: "src/main.ts",
      mimeType: "text/plain",
      contentBase64: content.toString("base64"),
      targetDir: projectDir,
    });
    expect(result.ok).toBe(true);
    expect(result.path!.startsWith(join(projectDir, ".envoy-attachments"))).toBe(true);
    expect(readFileSync(result.path!).toString("utf8")).toBe("project scoped");
  });

  it("rejects empty and oversize uploads", () => {
    const profileDir = mkdtempSync(join(tmpdir(), "envoy-uploads-"));
    dirs.push(profileDir);
    expect(
      saveEnvoyUpload(profileDir, {
        filename: "empty.bin",
        contentBase64: "",
      }).ok,
    ).toBe(false);
    const huge = Buffer.alloc(MAX_CHAT_ATTACHMENT_BYTES + 1, 1);
    const oversized = saveEnvoyUpload(profileDir, {
      filename: "huge.bin",
      contentBase64: huge.toString("base64"),
    });
    expect(oversized.ok).toBe(false);
    expect(oversized.error).toMatch(/too large/i);
  });
});
