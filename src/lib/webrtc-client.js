export async function openDriveViaWebRtcInvite(parsed, relayUrl, libs) {
  const { DHT, RelayStream, b4a } = libs;
  if (!parsed.signalKey) throw new Error("Invite is missing signal key");
  if (!parsed.nativeInvite) {
    throw new Error("Invite is missing native invite context");
  }

  const relaySocket = new WebSocket(relayUrl);
  await onceWebSocketOpen(relaySocket);

  const dht = new DHT(new RelayStream(true, relaySocket));
  const signalSocket = dht.connect(b4a.from(parsed.signalKey, "hex"));
  await onceStreamOpen(signalSocket);
  const signal = createLineSignal(signalSocket, b4a);

  const pc = new RTCPeerConnection({ iceServers: [] });
  const channel = pc.createDataChannel("peardrops");
  const peer = createDataChannelRpc(channel);

  signal.onMessage(async (message) => {
    if (message.type === "answer" && message.sdp) {
      await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
      return;
    }

    if (message.type === "candidate" && message.candidate) {
      await pc.addIceCandidate(message.candidate);
    }
  });

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      signal.send({ type: "candidate", candidate: event.candidate });
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  signal.send({
    type: "offer",
    sdp: offer.sdp,
  });

  await waitForChannelOpen(channel, 10000);

  return {
    drive: {
      async get(drivePath) {
        if (drivePath === "/manifest.json") {
          const response = await peer.request({
            type: "manifest",
            invite: parsed.nativeInvite,
          });
          return b4a.from(JSON.stringify(response.manifest), "utf8");
        }

        const response = await peer.request({
          type: "file",
          path: drivePath,
          invite: parsed.nativeInvite,
        });
        if (!response?.dataBase64) return null;
        return b4a.from(response.dataBase64, "base64");
      },
      async getChunk(drivePath, offset, length) {
        const response = await peer.request({
          type: "file-chunk",
          path: drivePath,
          offset: Number(offset || 0),
          length: Number(length || 0),
          invite: parsed.nativeInvite,
        });
        if (!response?.dataBase64) return null;
        return b4a.from(response.dataBase64, "base64");
      },
    },
    async close() {
      try {
        channel.close();
      } catch {}
      try {
        pc.close();
      } catch {}
      try {
        signalSocket.destroy();
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

function createLineSignal(signalSocket, b4a) {
  let buffered = "";
  const listeners = new Set();

  signalSocket.on("data", (chunk) => {
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
      signalSocket.write(b4a.from(`${JSON.stringify(message)}\n`, "utf8"));
    },
    onMessage(listener) {
      listeners.add(listener);
    },
  };
}

function createDataChannelRpc(channel) {
  let nextId = 1;
  const pending = new Map();

  channel.onmessage = (event) => {
    let message = null;
    try {
      message = JSON.parse(String(event.data || "{}"));
    } catch {
      message = null;
    }

    if (!message) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.ok === false) {
      waiter.reject(new Error(message.error || "Peer request failed"));
    } else {
      waiter.resolve(message);
    }
  };

  return {
    request(payload) {
      const id = nextId++;
      channel.send(JSON.stringify({ id, ...payload }));
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
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
      {
        once: true,
      },
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
      reject(error || new Error("Signal stream failed"));
    };
    const cleanup = () => {
      stream.off?.("open", onOpen);
      stream.off?.("error", onError);
    };
    stream.on?.("open", onOpen);
    stream.on?.("error", onError);
  });
}

function waitForChannelOpen(channel, timeoutMs) {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timed out waiting for direct WebRTC channel")),
      timeoutMs,
    );
    channel.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    channel.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WebRTC datachannel failed"));
    };
  });
}
