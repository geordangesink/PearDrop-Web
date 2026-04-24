import DHT from "hyperdht";
import { relay } from "@hyperswarm/dht-relay";
import RelayStream from "@hyperswarm/dht-relay/ws";
import { WebSocketServer } from "ws";
import http from "node:http";

const host = process.env.RELAY_HOST || "0.0.0.0";
const port = Number(process.env.PORT || process.env.RELAY_PORT || 49443);

const dht = new DHT();
const server = http.createServer((req, res) => {
  if (req.url === "/healthz" || req.url === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("PearDrop relay is running\n");
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
        console.warn(
          "[relay] relay handshake failed:",
          summarizeError(error),
        );
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
  console.log(`[relay] websocket relay: ws://${host}:${port}`);
});

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
      if (summarizeError(error).toLowerCase().includes("uint must be positive")) {
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
