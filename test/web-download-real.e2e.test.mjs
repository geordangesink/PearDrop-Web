import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const WEB_PORT = 4187;
const RELAY_PORT = 49543;

test(
  "web app real relay path downloads from bare-backed native uploader",
  { timeout: 120000 },
  async (t) => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "peardrops-web-real-e2e-"),
    );
    const payload = "web app real relay payload";
    const fileName = "real-download.txt";

    let relayProc = null;
    let uploaderProc = null;
    let webProc = null;
    let browser = null;

    t.after(async () => {
      await Promise.all([
        stopProcess(relayProc),
        stopProcess(uploaderProc),
        stopProcess(webProc),
        browser ? browser.close() : Promise.resolve(),
      ]);
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    relayProc = spawn(process.execPath, ["relay/server.js"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        RELAY_PORT: String(RELAY_PORT),
        RELAY_HOST: "127.0.0.1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await waitForOutput(
      relayProc,
      new RegExp(`ws://127\\.0\\.0\\.1:${RELAY_PORT}`),
      10000,
    );

    uploaderProc = spawn(
      "bare",
      [
        "test/harness/native-uploader.bare.mjs",
        JSON.stringify({
          relayUrl: `ws://127.0.0.1:${RELAY_PORT}`,
          payload,
          fileName,
          baseDir: path.join(tmpDir, "uploader"),
        }),
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const stateLine = await waitForOutput(uploaderProc, "STATE:", 15000);
    const state = JSON.parse(
      stateLine.slice(stateLine.indexOf("STATE:") + "STATE:".length),
    );

    webProc = spawn(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "--host",
        "127.0.0.1",
        "--port",
        String(WEB_PORT),
        "--strictPort",
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    await waitForHttp(`http://127.0.0.1:${WEB_PORT}/`, 15000);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ acceptDownloads: true });
    await page.addInitScript(() => {
      globalThis.__PEARDROPS_DISABLE_FILE_PICKER__ = true;
    });

    await page.goto(
      `http://127.0.0.1:${WEB_PORT}/?invite=${encodeURIComponent(state.invite)}`,
    );

    await page.waitForFunction(
      () => {
        const el = document.getElementById("status");
        return (
          el &&
          (/Connected\./.test(el.textContent || "") ||
            /Join failed:/.test(el.textContent || ""))
        );
      },
      { timeout: 30000 },
    );

    const statusText = await page.textContent("#status");
    assert.match(
      String(statusText || ""),
      /Connected\./,
      `Expected Connected status, got: ${statusText}`,
    );

    const downloadPromise = page.waitForEvent("download", { timeout: 30000 });
    await page.getByRole("button", { name: `Download ${fileName}` }).click();
    const download = await downloadPromise;

    const outPath = path.join(tmpDir, "downloaded.txt");
    await download.saveAs(outPath);

    const content = await fs.readFile(outPath, "utf8");
    assert.equal(content, payload);
  },
);

async function waitForOutput(proc, needle, timeoutMs) {
  const start = Date.now();
  let stdout = "";
  let stderr = "";

  proc.stdout?.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  proc.stderr?.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  while (Date.now() - start < timeoutMs) {
    const lines = stdout.split(/\r?\n/);
    const hit = lines.find((line) =>
      needle instanceof RegExp ? needle.test(line) : line.includes(needle),
    );
    if (hit) return hit;

    if (proc.exitCode !== null) {
      throw new Error(
        `Process exited early (${proc.exitCode}) while waiting for ${needle}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }

    await delay(50);
  }

  throw new Error(
    `Timed out waiting for output: ${needle}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
  );
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function stopProcess(proc) {
  if (!proc) return;
  if (proc.exitCode !== null) return;

  try {
    proc.kill("SIGTERM");
  } catch {
    return;
  }

  const exited = await Promise.race([
    once(proc, "exit").then(() => true),
    delay(1500).then(() => false),
  ]);

  if (exited) return;

  try {
    proc.kill("SIGKILL");
  } catch {
    return;
  }

  await Promise.race([once(proc, "exit"), delay(1000)]);
}
