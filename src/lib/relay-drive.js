export async function openDriveViaRelayInvite(parsed, relayUrl, libs) {
  const { DHT, RelayStream, b4a } = libs;
  const webKey = String(parsed?.webKey || "").trim();
  if (!webKey) throw new Error("Invite is missing web host key");

  const relaySocket = new WebSocket(relayUrl);
  await onceWebSocketOpen(relaySocket);

  const dht = new DHT(new RelayStream(true, relaySocket));
  const stream = dht.connect(b4a.from(webKey, "hex"));
  await onceStreamOpen(stream);
  const peer = createLinePeer(stream, b4a);

  let nextId = 1;
  const pending = new Map();

  peer.onMessage((message) => {
    const id = Number(message?.id || 0);
    if (!id || !pending.has(id)) return;
    const waiter = pending.get(id);
    pending.delete(id);
    if (message?.ok === false) {
      waiter.reject(new Error(String(message?.error || "Peer request failed")));
      return;
    }
    waiter.resolve(message || {});
  });

  const request = (payload) => {
    const id = nextId++;
    peer.send({ id, ...(payload || {}) });
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  };

  return {
    drive: {
      async get(drivePath) {
        if (drivePath === "/manifest.json") {
          const response = await request({ type: "manifest" });
          return b4a.from(JSON.stringify(response?.manifest || {}), "utf8");
        }
        const response = await request({ type: "file", path: drivePath });
        if (!response?.dataBase64) return null;
        return b4a.from(response.dataBase64, "base64");
      },
      async getChunk(drivePath, offset, length) {
        const response = await request({
          type: "file-chunk",
          path: drivePath,
          offset: Number(offset || 0),
          length: Number(length || 0),
        });
        if (!response?.dataBase64) return null;
        return b4a.from(response.dataBase64, "base64");
      },
    },
    async close() {
      for (const waiter of pending.values()) {
        waiter.reject(new Error("Drive session closed"));
      }
      pending.clear();
      try {
        stream.destroy();
      } catch {}
      try {
        await dht.destroy();
      } catch {}
      try {
        relaySocket.close();
      } catch {}
    },
  };
}

function createLinePeer(stream, b4a) {
  let buffered = "";
  const listeners = new Set();

  stream.on("data", (chunk) => {
    buffered += b4a.toString(chunk, "utf8");
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) {
        try {
          const message = JSON.parse(line);
          for (const listener of listeners) void listener(message);
        } catch {}
      }
      newline = buffered.indexOf("\n");
    }
  });

  return {
    send(message) {
      stream.write(b4a.from(`${JSON.stringify(message || {})}\n`, "utf8"));
    },
    onMessage(listener) {
      listeners.add(listener);
    },
  };
}

function onceWebSocketOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("Relay connection failed")),
      { once: true },
    );
  });
}

function onceStreamOpen(stream) {
  if (stream.opened || stream.writable) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error || new Error("Relay stream failed"));
    };
    const cleanup = () => {
      stream.off?.("open", onOpen);
      stream.off?.("error", onError);
    };
    stream.on?.("open", onOpen);
    stream.on?.("error", onError);
  });
}
