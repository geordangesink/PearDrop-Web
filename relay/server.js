import DHT from "hyperdht";
import { relay } from "@hyperswarm/dht-relay";
import RelayStream from "@hyperswarm/dht-relay/ws";
import { WebSocketServer } from "ws";
import http from "node:http";
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";

const host = process.env.RELAY_HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.RELAY_PORT || 49443);
const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";
const pushRegistrations = new Map();
const pushRegistryFile =
  process.env.PUSH_REGISTRY_FILE ||
  path.join(process.cwd(), ".relay-push-registrations.json");
let pushRegistrySaveTimer = null;

const dht = new DHT();
const server = http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("PearDrop relay is running\n");
    return;
  }

  if (req.method === "GET" && req.url === "/push/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        registrations: pushRegistrations.size,
      }),
    );
    return;
  }

  if (req.method === "POST" && req.url === "/push/register") {
    void readJson(req)
      .then((body) => {
        const token = String(body?.expoPushToken || "").trim();
        if (!token) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "expoPushToken required" }));
          return;
        }
        const id = pushTargetForToken(token);
        pushRegistrations.set(id, {
          id,
          token,
          platform: String(body?.platform || "").trim(),
          appId: String(body?.appId || "").trim(),
          updatedAt: Date.now(),
        });
        schedulePushRegistrySave();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, pushTarget: id }));
      })
      .catch((error) => {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: summarizeError(error) }));
      });
    return;
  }

  if (req.method === "POST" && req.url === "/push/join-request") {
    void readJson(req)
      .then(async (body) => {
        const pushTarget = String(body?.pushTarget || "").trim();
        if (!pushTarget) {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "pushTarget required" }));
          return;
        }
        const registration = pushRegistrations.get(pushTarget);
        if (!registration) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "push target not found" }));
          return;
        }
        const sessionName = String(body?.sessionName || "Host Session").trim() || "Host Session";
        const peerName = String(body?.peerName || "").trim();
        const title = peerName ? `${peerName} wants to join` : "Join request";
        const message = `Session: ${sessionName}`;
        await sendExpoPush(registration.token, title, message, {
          type: "join-request",
          invite: String(body?.invite || ""),
          sessionName,
          peerName,
        });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      })
      .catch((error) => {
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: summarizeError(error) }));
      });
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Not found\n");
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

wss.on("connection", (socket) => {
  const relayStream = new RelayStream(false, socket);

  socket.on("error", (error) => {
    console.warn("[relay] websocket peer error:", summarizeError(error));
  });

  try {
    relay(dht, relayStream)
      .then((node) => {
        hardenDestroySend(node, socket);
      })
      .catch((error) => {
        console.warn("[relay] relay handshake failed:", summarizeError(error));
        try {
          socket.close();
        } catch {}
      });
  } catch (error) {
    console.warn(
      "[relay] failed to initialize relay connection:",
      summarizeError(error),
    );
    try {
      socket.close();
    } catch {}
  }
});

server.listen(port, host, () => {
  console.log(`[relay] health endpoint: http://${host}:${port}/healthz`);
  console.log(`[relay] push health endpoint: http://${host}:${port}/push/healthz`);
  console.log(`[relay] websocket relay: ws://${host}:${port}`);
});
await loadPushRegistrations();

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[relay] shutdown requested (${signal})`);

  await new Promise((resolve) => {
    try {
      wss.close(() => resolve());
    } catch {
      resolve();
    }
  });

  await new Promise((resolve) => {
    try {
      server.close(() => resolve());
    } catch {
      resolve();
    }
  });

  try {
    await savePushRegistrations();
  } catch {}

  try {
    await dht.destroy();
  } catch {}

  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("uncaughtException", (error) => {
  if (isRecoverableRelayPeerError(error)) {
    console.warn(
      "[relay] recovered uncaught peer error:",
      summarizeError(error),
    );
    return;
  }
  console.error("[relay] fatal uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  if (isRecoverableRelayPeerError(reason)) {
    console.warn(
      "[relay] recovered unhandled peer rejection:",
      summarizeError(reason),
    );
    return;
  }
  console.error("[relay] fatal unhandled rejection:", reason);
  process.exit(1);
});

function isRecoverableRelayPeerError(errorLike) {
  const text = summarizeError(errorLike).toLowerCase();
  if (!text) return false;
  return (
    text.includes("uint must be positive") ||
    text.includes("@hyperswarm/dht-relay") ||
    text.includes("compact-encoding")
  );
}

function summarizeError(errorLike) {
  if (!errorLike) return "";
  const message =
    typeof errorLike === "object" && errorLike && "message" in errorLike
      ? String(errorLike.message || "")
      : String(errorLike);
  const stack =
    typeof errorLike === "object" && errorLike && "stack" in errorLike
      ? String(errorLike.stack || "")
      : "";
  return `${message}${stack ? ` | ${stack}` : ""}`.trim();
}

function hardenDestroySend(node, socket) {
  const destroyChannel = node?._protocol?.destroy;
  if (!destroyChannel || typeof destroyChannel.send !== "function") return;
  if (destroyChannel.__pearDropHardened) return;

  const originalSend = destroyChannel.send.bind(destroyChannel);

  destroyChannel.send = (message = {}) => {
    let normalized = message;

    // @hyperswarm/dht-relay can emit { alias, error } without paired/remoteAlias
    // from server-proxy stream errors, which breaks compact-encoding uint32.
    if (
      normalized &&
      normalized.paired !== true &&
      Number.isInteger(normalized.alias) &&
      !Number.isInteger(normalized.remoteAlias)
    ) {
      normalized = { ...normalized, paired: true };
    }

    if (
      !normalized ||
      (!Number.isInteger(normalized.alias) &&
        !Number.isInteger(normalized.remoteAlias))
    ) {
      console.warn(
        "[relay] dropping invalid destroy message:",
        JSON.stringify(normalized ?? null),
      );
      return;
    }

    try {
      originalSend(normalized);
    } catch (error) {
      if (
        summarizeError(error).toLowerCase().includes("uint must be positive")
      ) {
        console.warn(
          "[relay] suppressed invalid destroy encode:",
          summarizeError(error),
        );
        try {
          socket.close();
        } catch {}
        return;
      }
      throw error;
    }
  };

  Object.defineProperty(destroyChannel, "__pearDropHardened", {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
}

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function pushTargetForToken(token) {
  const digest = createHash("sha256").update(String(token || "")).digest("hex");
  return `pt_${digest.slice(0, 32)}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += String(chunk || "");
      if (body.length > 1024 * 128) {
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function sendExpoPush(to, title, body, data = {}) {
  const response = await fetch(expoPushEndpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      to,
      title: String(title || "PearDrop"),
      body: String(body || ""),
      data: data || {},
      sound: "default",
      priority: "high",
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`expo push request failed (${response.status}): ${text}`);
  }
  const payload = await response.json().catch(() => null);
  const hasError = Array.isArray(payload?.data)
    ? payload.data.some((item) => item?.status === "error")
    : payload?.data?.status === "error";
  if (hasError) {
    throw new Error(`expo push error: ${JSON.stringify(payload?.data || payload)}`);
  }
}

async function loadPushRegistrations() {
  try {
    const raw = await fsp.readFile(pushRegistryFile, "utf8");
    const parsed = JSON.parse(String(raw || "[]"));
    const rows = Array.isArray(parsed) ? parsed : [];
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      const token = String(row?.token || "").trim();
      if (!id || !token) continue;
      pushRegistrations.set(id, {
        id,
        token,
        platform: String(row?.platform || "").trim(),
        appId: String(row?.appId || "").trim(),
        updatedAt: Number(row?.updatedAt || Date.now()),
      });
    }
    console.log(
      `[relay] loaded ${pushRegistrations.size} push registration(s) from ${pushRegistryFile}`,
    );
  } catch (error) {
    const text = summarizeError(error).toLowerCase();
    if (text.includes("enoent")) return;
    console.warn("[relay] failed to load push registrations:", summarizeError(error));
  }
}

function schedulePushRegistrySave() {
  if (pushRegistrySaveTimer) clearTimeout(pushRegistrySaveTimer);
  pushRegistrySaveTimer = setTimeout(() => {
    pushRegistrySaveTimer = null;
    void savePushRegistrations();
  }, 250);
}

async function savePushRegistrations() {
  const rows = Array.from(pushRegistrations.values());
  await fsp.mkdir(path.dirname(pushRegistryFile), { recursive: true });
  await fsp.writeFile(pushRegistryFile, JSON.stringify(rows, null, 2), "utf8");
}
