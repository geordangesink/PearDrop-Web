const DEFAULT_ICE_SERVERS = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun3.l.google.com:19302",
      "stun:stun4.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
      "stun:global.stun.twilio.com:3478",
      "stun:stun.sipgate.net:3478",
      "stun:stun.nextcloud.com:443",
      "stun:openrelay.metered.ca:80",
      "stun:openrelay.metered.ca:443",
    ],
  },
];

export async function openDriveViaWebRtcInvite(
  parsed,
  relayUrl,
  libs,
  options = {},
) {
  const { DHT, RelayStream, b4a } = libs;
  const emitPhase =
    typeof options?.onPhase === "function" ? options.onPhase : () => {};
  if (!parsed.signalKey) throw new Error("Invite is missing signal key");
  if (!parsed.nativeInvite) {
    throw new Error("Invite is missing native invite context");
  }

  emitPhase("relay-connect");
  const relaySocket = new WebSocket(relayUrl);
  await onceWebSocketOpen(relaySocket);
  emitPhase("relay-open");

  emitPhase("dht-init");
  const dht = new DHT(new RelayStream(true, relaySocket));
  emitPhase("signal-connect");
  const signalSocket = dht.connect(b4a.from(parsed.signalKey, "hex"));
  await onceStreamOpen(signalSocket);
  emitPhase("signal-open");
  const signal = createLineSignal(signalSocket, b4a);

  emitPhase("rtc-setup");
  const pc = new RTCPeerConnection({
    iceServers: DEFAULT_ICE_SERVERS,
    iceCandidatePoolSize: 8,
  });
  const channel = pc.createDataChannel("peardrops");
  const peer = createDataChannelRpc(channel);
  let remoteDescriptionSet = false;
  const pendingRemoteCandidates = [];
  let peerSignalReady = false;
  let receivedAnswer = false;
  let localCandidatesSent = 0;
  let remoteCandidatesApplied = 0;
  let remoteCandidatesDropped = 0;
  const localCandidateKinds = { host: 0, srflx: 0, prflx: 0, relay: 0, other: 0 };
  const remoteCandidateKinds = { host: 0, srflx: 0, prflx: 0, relay: 0, other: 0 };
  let offerAttempts = 0;
  const maxOfferAttempts = 3;
  let offerInFlight = false;
  let lastOfferSentAt = 0;
  let remoteSignalError = "";
  let answerReceivedAt = 0;
  let stopped = false;
  let offerRetryTimer = null;

  const stopRtc = async () => {
    if (stopped) return;
    stopped = true;
    if (offerRetryTimer) {
      clearInterval(offerRetryTimer);
      offerRetryTimer = null;
    }
    pc.onicecandidate = null;
    pc.oniceconnectionstatechange = null;
    pc.onconnectionstatechange = null;
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
  };

  const flushPendingCandidates = async () => {
    if (!remoteDescriptionSet || pendingRemoteCandidates.length === 0) return;
    while (pendingRemoteCandidates.length) {
      const candidate = pendingRemoteCandidates.shift();
      try {
        await pc.addIceCandidate(candidate);
      } catch {}
    }
  };

  signal.onMessage(async (message) => {
    if (stopped) return;
    if (message.type === "ready") {
      peerSignalReady = true;
      return;
    }
    if (message.type === "error") {
      remoteSignalError = String(message.error || message.message || "Remote signaling error");
      return;
    }

    if (message.type === "answer" && message.sdp) {
      if (remoteDescriptionSet) return;
      if (String(pc.signalingState || "") !== "have-local-offer") return;
      try {
        await pc.setRemoteDescription({
          type: "answer",
          sdp: sanitizeIceSdp(String(message.sdp || "")),
        });
        remoteDescriptionSet = true;
        receivedAnswer = true;
        answerReceivedAt = Date.now();
        await flushPendingCandidates();
      } catch (error) {
        remoteSignalError = String(error?.message || error || "Failed to apply peer answer");
      }
      return;
    }

    if (message.type === "candidate" && message.candidate) {
      bumpCandidateKind(remoteCandidateKinds, message.candidate);
      if (isRelayIceCandidate(message.candidate)) {
        remoteCandidatesDropped += 1;
        return;
      }
      if (isMdnsIceCandidate(message.candidate)) {
        remoteCandidatesDropped += 1;
        return;
      }
      if (!remoteDescriptionSet) {
        pendingRemoteCandidates.push(message.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(message.candidate);
        remoteCandidatesApplied += 1;
      } catch {}
      return;
    }

    if (message.type === "candidate-end" || message.endOfCandidates === true) {
      if (!remoteDescriptionSet) {
        pendingRemoteCandidates.push(null);
        return;
      }
      try {
        await pc.addIceCandidate(null);
      } catch {}
    }
  });

  pc.onicecandidate = (event) => {
    if (stopped) return;
    if (event.candidate) {
      bumpCandidateKind(localCandidateKinds, event.candidate);
      if (isRelayIceCandidate(event.candidate)) return;
      if (isMdnsIceCandidate(event.candidate)) return;
      localCandidatesSent += 1;
      signal.send({ type: "candidate", candidate: event.candidate });
      return;
    }
    signal.send({ type: "candidate-end", endOfCandidates: true });
  };

  const createLocalOffer = async ({ restartIce = false } = {}) => {
    if (stopped) return;
    if (!peerSignalReady) return;
    if (offerInFlight) return;
    offerInFlight = true;
    try {
      emitPhase("offer-create");
      const offer = await pc.createOffer(restartIce ? { iceRestart: true } : {});
      await pc.setLocalDescription(offer);
    } finally {
      offerInFlight = false;
    }
  };

  const sendCurrentOffer = () => {
    if (stopped) return;
    if (!peerSignalReady) return;
    if (offerAttempts >= maxOfferAttempts) return;
    const current = String(pc?.localDescription?.sdp || "");
    if (!current) return;
    emitPhase("offer-send");
    const sdp = sanitizeIceSdp(current);
    signal.send({
      type: "offer",
      sdp,
    });
    offerAttempts += 1;
    lastOfferSentAt = Date.now();
  };

  const sendOffer = async ({ restartIce = false } = {}) => {
    await createLocalOffer({ restartIce });
    if (stopped) return;
    if (!peerSignalReady) return;
    if (offerAttempts >= maxOfferAttempts) return;
    offerInFlight = true;
    try {
      emitPhase("offer-send");
      const sdp = sanitizeIceSdp(String(pc?.localDescription?.sdp || ""));
      signal.send({
        type: "offer",
        sdp,
      });
      offerAttempts += 1;
      lastOfferSentAt = Date.now();
    } finally {
      offerInFlight = false;
    }
  };

  await waitForCondition(
    () => peerSignalReady,
    2500,
    "Timed out waiting for peer signaling readiness",
  ).catch(() => {});
  await sendOffer({ restartIce: false });
  offerRetryTimer = setInterval(() => {
    if (stopped) return;
    if (channel.readyState === "open") return;
    if (!peerSignalReady) return;
    if (receivedAnswer) return;
    if (offerAttempts >= maxOfferAttempts) return;
    // Before first answer, re-send the same offer instead of repeated ICE restarts.
    sendCurrentOffer();
  }, 1800);

  pc.oniceconnectionstatechange = () => {};
  pc.onconnectionstatechange = () => {};

  emitPhase("peer-handshake");
  const handshakeStartedAt = Date.now();
  try {
    await waitForChannelOpen(channel, pc, 24000, () => ({
      offerAttempts,
      receivedAnswer,
      localCandidatesSent,
      remoteCandidatesApplied,
      remoteCandidatesDropped,
      localCandidateKinds,
      remoteCandidateKinds,
      pendingRemoteCandidates: pendingRemoteCandidates.length,
      signalingState: String(pc.signalingState || ""),
      iceGatheringState: String(pc.iceGatheringState || ""),
      iceConnectionState: String(pc.iceConnectionState || ""),
      connectionState: String(pc.connectionState || ""),
      remoteSignalError,
      answerReceivedAt,
      answerAgeMs: answerReceivedAt > 0 ? Date.now() - answerReceivedAt : 0,
    }), () => {
      if (!receivedAnswer && Date.now() - handshakeStartedAt > 12000) {
        return "Timed out waiting for peer answer";
      }
      if (remoteSignalError) return remoteSignalError;
      const localDirect = Number(localCandidateKinds.srflx || 0) + Number(localCandidateKinds.prflx || 0);
      const remoteDirect = Number(remoteCandidateKinds.srflx || 0) + Number(remoteCandidateKinds.prflx || 0);
      if (!receivedAnswer) return "";
      if (Date.now() - answerReceivedAt > 12000) {
        return "Timed out waiting for ICE connect after peer answer";
      }
      if (String(pc.iceGatheringState || "") !== "complete") return "";
      if (localDirect > 0 || remoteDirect > 0) return "";
      return "No reflexive ICE candidates available for direct cross-network route";
    });
  } catch (error) {
    await stopRtc();
    throw error;
  } finally {
    if (offerRetryTimer) {
      clearInterval(offerRetryTimer);
      offerRetryTimer = null;
    }
  }
  emitPhase("channel-open");

  emitPhase("drive-ready");
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
      await stopRtc();
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

function waitForChannelOpen(channel, pc, timeoutMs, getDiagnostics = null, getEarlyAbortReason = null) {
  if (channel.readyState === "open") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onPcState = () => {
      const state = String(pc?.connectionState || "");
      if (state === "closed") {
        cleanup();
        reject(new Error("Peer connection failed before channel opened"));
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(abortTimer);
      channel.onopen = null;
      channel.onerror = null;
      if (pc && typeof pc.removeEventListener === "function") {
        pc.removeEventListener("connectionstatechange", onPcState);
      }
    };
    const abortTimer = setInterval(() => {
      const reason =
        typeof getEarlyAbortReason === "function" ? String(getEarlyAbortReason() || "") : "";
      if (!reason) return;
      cleanup();
      const diagnostics =
        typeof getDiagnostics === "function" ? getDiagnostics() : null;
      const details = diagnostics
        ? ` ${JSON.stringify(diagnostics)}`
        : "";
      reject(new Error(`${reason}.${details}`));
    }, 700);

    const timer = setTimeout(
      () => {
        cleanup();
        const diagnostics =
          typeof getDiagnostics === "function" ? getDiagnostics() : null;
        const details = diagnostics
          ? ` ${JSON.stringify(diagnostics)}`
          : "";
        reject(
          new Error(`Timed out waiting for direct WebRTC channel.${details}`),
        );
      },
      timeoutMs,
    );
    channel.onopen = () => {
      cleanup();
      resolve();
    };
    channel.onerror = () => {
      cleanup();
      reject(new Error("WebRTC datachannel failed"));
    };
    if (pc && typeof pc.addEventListener === "function") {
      pc.addEventListener("connectionstatechange", onPcState);
    }
  });
}

function bumpCandidateKind(counter, candidateLike) {
  if (!counter) return;
  const kind = parseCandidateKind(candidateLike);
  if (!Object.hasOwn(counter, kind)) counter[kind] = 0;
  counter[kind] += 1;
}

function parseCandidateKind(candidateLike) {
  const line =
    typeof candidateLike === "string"
      ? candidateLike
      : String(candidateLike?.candidate || "");
  if (!line) return "other";
  const match = line.match(/\btyp\s+(host|srflx|prflx|relay)\b/i);
  return match ? String(match[1] || "").toLowerCase() : "other";
}

function waitForCondition(test, timeoutMs, errorMessage) {
  if (typeof test === "function" && test()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (typeof test === "function" && test()) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve();
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        clearTimeout(timer);
        reject(new Error(errorMessage || "Timed out waiting for condition"));
      }
    };
    const interval = setInterval(tick, 120);
    const timer = setTimeout(tick, timeoutMs + 25);
  });
}

function isRelayIceCandidate(candidateLike) {
  const candidateLine =
    typeof candidateLike === "string"
      ? candidateLike
      : String(candidateLike?.candidate || "");
  return /\btyp\s+relay\b/i.test(candidateLine);
}

function isMdnsIceCandidate(candidateLike) {
  const candidateLine =
    typeof candidateLike === "string"
      ? candidateLike
      : String(candidateLike?.candidate || "");
  return /\b[a-z0-9-]+\.local\b/i.test(candidateLine);
}

function sanitizeIceSdp(sdpText) {
  const raw = String(sdpText || "");
  if (!raw) return raw;
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const value = String(line || "");
    if (!value) {
      out.push(value);
      continue;
    }
    if (value.startsWith("a=candidate:")) {
      if (isRelayIceCandidate(value)) continue;
      if (isMdnsIceCandidate(value)) continue;
    }
    out.push(value);
  }
  return out.join("\r\n");
}
