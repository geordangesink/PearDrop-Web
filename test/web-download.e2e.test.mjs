import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const WEB_PORT = 4177;

test(
  "web app downloads from bare-backed native uploader",
  { timeout: 60000 },
  async (t) => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "peardrops-web-e2e-"),
    );
    const payload = "web app e2e payload";
    const fileName = "download.txt";

    let uploaderProc = null;
    let webProc = null;
    let browser = null;
    let page = null;

    t.after(async () => {
      await Promise.all([
        stopProcess(uploaderProc),
        stopProcess(webProc),
        browser ? browser.close() : Promise.resolve(),
      ]);
      await fs.rm(tmpDir, { recursive: true, force: true });
    });

    try {
      console.log("[e2e] start bare uploader");
      uploaderProc = spawn(
        "bare",
        [
          "test/harness/native-uploader.bare.mjs",
          JSON.stringify({
            relayUrl: "ws://127.0.0.1:49543",
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

      const stateLine = await waitForOutput(uploaderProc, "STATE:", 10000);
      const state = JSON.parse(
        stateLine.slice(stateLine.indexOf("STATE:") + "STATE:".length),
      );

      console.log("[e2e] start vite server");
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

      console.log("[e2e] launch browser");
      browser = await chromium.launch({ headless: true });
      page = await browser.newPage({ acceptDownloads: true });
      page.on("console", (msg) => {
        console.log("[browser]", msg.type(), msg.text());
      });
      page.on("pageerror", (err) => {
        console.error("[browser] pageerror", err);
      });

      await page.addInitScript((bootstrapState) => {
        const files = bootstrapState.files || {};

        globalThis.__PEARDROPS_TEST_OPEN_DRIVE__ = async () => ({
          drive: {
            async get(drivePath) {
              if (drivePath === "/manifest.json") {
                const text = JSON.stringify(bootstrapState.manifest, null, 2);
                return {
                  toString() {
                    return text;
                  },
                };
              }

              const encoded = files[drivePath];
              if (!encoded) return null;

              const binary = atob(encoded);
              const out = new Uint8Array(binary.length);
              for (let i = 0; i < binary.length; i++) {
                out[i] = binary.charCodeAt(i);
              }
              return out;
            },
          },
          async close() {},
        });
      }, state);

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
        { timeout: 20000 },
      );

      const statusText = await page.textContent("#status");
      assert.match(
        String(statusText || ""),
        /Connected\./,
        `Expected Connected status, got: ${statusText}`,
      );

      console.log("[e2e] trigger download");
      const downloadPromise = page.waitForEvent("download", { timeout: 20000 });
      await page.getByRole("button", { name: `Download ${fileName}` }).click();
      const download = await downloadPromise;

      const outPath = path.join(tmpDir, "downloaded.txt");
      await download.saveAs(outPath);

      const content = await fs.readFile(outPath, "utf8");
      assert.equal(content, payload);
      console.log("[e2e] success");
    } catch (error) {
      if (page) {
        try {
          const debug = await page.evaluate(() => ({
            status: document.getElementById("status")?.textContent || "",
            inviteInput: document.getElementById("invite")?.value || "",
            hasTestOpenDrive:
              typeof globalThis.__PEARDROPS_TEST_OPEN_DRIVE__ === "function",
            hasAppNode: Boolean(document.getElementById("app")),
            appHtmlLength: (document.getElementById("app")?.innerHTML || "")
              .length,
            bodyHtmlLength: (document.body?.innerHTML || "").length,
          }));
          console.error("[e2e] page debug", debug);
        } catch (diagError) {
          console.error("[e2e] page debug failed", diagError);
        }
      }
      console.error("[e2e] failure", error);
      throw error;
    }
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
    const hit = lines.find((line) => line.includes(needle));
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
