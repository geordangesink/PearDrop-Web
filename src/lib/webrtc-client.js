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
  const timing = {
    signalReadyTimeoutMs: Number(options?.timing?.signalReadyTimeoutMs || 2500),
    noAnswerTimeoutMs: Number(options?.timing?.noAnswerTimeoutMs || 12000),
    handshakeTimeoutMs: Number(options?.timing?.handshakeTimeoutMs || 38000),
    postAnswerConnectTimeoutMs: Number(options?.timing?.postAnswerConnectTimeoutMs || 28000),
    postAnswerIdleTimeoutMs: Number(options?.timing?.postAnswerIdleTimeoutMs || 10000),
    preAnswerOfferRetryMs: Number(options?.timing?.preAnswerOfferRetryMs || 900),
    restartOfferMinGapMs: Number(options?.timing?.restartOfferMinGapMs || 1200),
    punchLeadMs: Number(options?.timing?.punchLeadMs || 800),
  };
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
  let localIpv6GlobalHostCandidates = 0;
  let remoteIpv6GlobalHostCandidates = 0;
  let offerAttempts = 0;
  const maxOfferAttempts = 4;
  let offerInFlight = false;
  let lastOfferSentAt = 0;
  let remoteSignalError = "";
  let answerReceivedAt = 0;
  let lastLocalCandidateAt = 0;
  let lastRemoteCandidateAt = 0;
  let hostIceState = "";
  let hostConnState = "";
  let iceRestartAttempts = 0;
  const maxIceRestartAttempts = 2;
  let remoteAddCandidateErrors = 0;
  let lastRemoteAddCandidateError = "";
  let activePunchAtMs = 0;
  let suggestedPunchAtMs = 0;
  let localCandidateQueue = [];
  let localCandidateFlushTimer = null;
  let stopped = false;
  let offerRetryTimer = null;

  const stopRtc = async () => {
    if (stopped) return;
    stopped = true;
    if (offerRetryTimer) {
      clearInterval(offerRetryTimer);
      offerRetryTimer = null;
    }
    if (localCandidateFlushTimer) {
      clearTimeout(localCandidateFlushTimer);
      localCandidateFlushTimer = null;
    }
    localCandidateQueue = [];
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
      suggestedPunchAtMs = Number(message.punchAtMs || 0);
      return;
    }
    if (message.type === "error") {
      remoteSignalError = String(message.error || message.message || "Remote signaling error");
      return;
    }
    if (message.type === "host-ice-state") {
      hostIceState = String(message.state || "");
      return;
    }
    if (message.type === "host-conn-state") {
      hostConnState = String(message.state || "");
      return;
    }

    if (message.type === "answer" && message.sdp) {
      if (String(pc.signalingState || "") !== "have-local-offer") return;
      try {
        await pc.setRemoteDescription({
          type: "answer",
          sdp: sanitizeIceSdp(String(message.sdp || "")),
        });
        remoteDescriptionSet = true;
        receivedAnswer = true;
        answerReceivedAt = Date.now();
        if (offerRetryTimer) {
          clearInterval(offerRetryTimer);
          offerRetryTimer = null;
        }
        await flushPendingCandidates();
      } catch (error) {
        remoteSignalError = String(error?.message || error || "Failed to apply peer answer");
      }
      return;
    }

    if (message.type === "candidate" && message.candidate) {
      const normalized = normalizeCandidateForSignal(message.candidate);
      if (!normalized) return;
      bumpCandidateKind(remoteCandidateKinds, normalized);
      if (isGlobalIpv6HostCandidate(normalized)) remoteIpv6GlobalHostCandidates += 1;
      if (isRelayIceCandidate(normalized)) {
        remoteCandidatesDropped += 1;
        return;
      }
      if (isMdnsIceCandidate(normalized)) {
        remoteCandidatesDropped += 1;
        return;
      }
      lastRemoteCandidateAt = Date.now();
      if (!remoteDescriptionSet) {
        pendingRemoteCandidates.push(normalized);
        return;
      }
      try {
        const candidateForAdd =
          typeof RTCIceCandidate === "function" ? new RTCIceCandidate(normalized) : normalized;
        await pc.addIceCandidate(candidateForAdd);
        remoteCandidatesApplied += 1;
      } catch (error) {
        remoteAddCandidateErrors += 1;
        lastRemoteAddCandidateError = String(error?.message || error || "addIceCandidate failed");
      }
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
      const normalized = normalizeCandidateForSignal(event.candidate);
      if (!normalized) return;
      bumpCandidateKind(localCandidateKinds, normalized);
      if (isGlobalIpv6HostCandidate(normalized)) localIpv6GlobalHostCandidates += 1;
      if (isRelayIceCandidate(normalized)) return;
      if (isMdnsIceCandidate(normalized)) return;
      localCandidatesSent += 1;
      lastLocalCandidateAt = Date.now();
      if (activePunchAtMs > Date.now()) {
        localCandidateQueue.push({ type: "candidate", candidate: normalized });
        return;
      }
      signal.send({ type: "candidate", candidate: normalized });
      return;
    }
    if (activePunchAtMs > Date.now()) {
      localCandidateQueue.push({ type: "candidate-end", endOfCandidates: true });
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
      // New local offer means a new remote ICE generation is expected.
      // Queue incoming remote candidates until the matching answer is applied.
      remoteDescriptionSet = false;
      pendingRemoteCandidates.length = 0;
      activePunchAtMs = nextPunchAtMs({
        now: Date.now(),
        suggestedPunchAtMs,
        punchLeadMs: timing.punchLeadMs,
      });
      scheduleLocalCandidateFlush({
        activePunchAtMs,
        signal,
        stoppedRef: () => stopped,
        getQueue: () => localCandidateQueue,
        setQueue: (value) => {
          localCandidateQueue = value;
        },
        setTimer: (value) => {
          localCandidateFlushTimer = value;
        },
        clearTimer: () => {
          if (localCandidateFlushTimer) clearTimeout(localCandidateFlushTimer);
          localCandidateFlushTimer = null;
        },
      });
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
      punchAtMs: activePunchAtMs,
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
        punchAtMs: activePunchAtMs,
      });
      offerAttempts += 1;
      lastOfferSentAt = Date.now();
    } finally {
      offerInFlight = false;
    }
  };

  const tryIceRestart = async () => {
    if (stopped) return false;
    if (!receivedAnswer) return false;
    if (channel.readyState === "open") return false;
    if (offerInFlight) return false;
    if (iceRestartAttempts >= maxIceRestartAttempts) return false;
    if (offerAttempts >= maxOfferAttempts) return false;
    if (Date.now() - lastOfferSentAt < timing.restartOfferMinGapMs) return false;
    iceRestartAttempts += 1;
    await sendOffer({ restartIce: true });
    return true;
  };

  await waitForCondition(
    () => peerSignalReady,
    timing.signalReadyTimeoutMs,
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
  }, timing.preAnswerOfferRetryMs);

  const onConnectionStateMaybeRestart = () => {
    const iceState = String(pc.iceConnectionState || "");
    const connState = String(pc.connectionState || "");
    if (iceState === "failed" || connState === "failed" || iceState === "disconnected") {
      void tryIceRestart();
    }
  };
  pc.oniceconnectionstatechange = onConnectionStateMaybeRestart;
  pc.onconnectionstatechange = onConnectionStateMaybeRestart;

  emitPhase("peer-handshake");
  const handshakeStartedAt = Date.now();
  try {
    await waitForChannelOpen(channel, pc, timing.handshakeTimeoutMs, () => ({
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
      hostIceState,
      hostConnState,
      localIpv6GlobalHostCandidates,
      remoteIpv6GlobalHostCandidates,
      remoteAddCandidateErrors,
      lastRemoteAddCandidateError,
      activePunchAtMs,
      answerReceivedAt,
      answerAgeMs: answerReceivedAt > 0 ? Date.now() - answerReceivedAt : 0,
      lastLocalCandidateAt,
      lastRemoteCandidateAt,
      localCandidateIdleMs: lastLocalCandidateAt > 0 ? Date.now() - lastLocalCandidateAt : 0,
      remoteCandidateIdleMs: lastRemoteCandidateAt > 0 ? Date.now() - lastRemoteCandidateAt : 0,
      iceRestartAttempts,
    }), () => {
      if (!receivedAnswer && Date.now() - handshakeStartedAt > timing.noAnswerTimeoutMs) {
        return "Timed out waiting for peer answer";
      }
      if (remoteSignalError) return remoteSignalError;
      const localDirect = Number(localCandidateKinds.srflx || 0) + Number(localCandidateKinds.prflx || 0);
      const remoteDirect = Number(remoteCandidateKinds.srflx || 0) + Number(remoteCandidateKinds.prflx || 0);
      const hasGlobalIpv6HostPath =
        localIpv6GlobalHostCandidates > 0 || remoteIpv6GlobalHostCandidates > 0;
      if (!receivedAnswer) return "";
      const answerAgeMs = Date.now() - answerReceivedAt;
      if (answerAgeMs > timing.postAnswerConnectTimeoutMs) {
        const gatheringState = String(pc.iceGatheringState || "");
        const localIdleMs = lastLocalCandidateAt > 0 ? Date.now() - lastLocalCandidateAt : Infinity;
        const remoteIdleMs = lastRemoteCandidateAt > 0 ? Date.now() - lastRemoteCandidateAt : Infinity;
        const maxIdleMs = Math.max(localIdleMs, remoteIdleMs);
        const iceState = String(pc.iceConnectionState || "");
        const connState = String(pc.connectionState || "");
        if (
          (iceState === "failed" || connState === "failed" || maxIdleMs > timing.postAnswerIdleTimeoutMs) &&
          iceRestartAttempts < maxIceRestartAttempts
        ) {
          void tryIceRestart();
          return "";
        }
        if (gatheringState === "complete" || maxIdleMs > timing.postAnswerIdleTimeoutMs) {
          return "Timed out waiting for ICE connect after peer answer";
        }
      }
      if (String(pc.iceGatheringState || "") !== "complete") return "";
      if (localDirect > 0 || remoteDirect > 0 || hasGlobalIpv6HostPath) return "";
      return "No reflexive ICE candidates available for direct cross-network route";
    });
  } catch (error) {
    const maybeIceSummary = await collectIceStatsSummary(pc).catch(() => null);
    if (maybeIceSummary && String(error?.message || "").includes("WebRTC channel")) {
      throw new Error(
        `${String(error.message || error)} ${JSON.stringify({ iceStats: maybeIceSummary })}`,
      );
    }
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

function isGlobalIpv6HostCandidate(candidateLike) {
  const line =
    typeof candidateLike === "string"
      ? candidateLike
      : String(candidateLike?.candidate || "");
  if (!/\btyp\s+host\b/i.test(line)) return false;
  const match = line.match(/\bcandidate:[^\s]+\s+\d+\s+udp\s+\d+\s+([^\s]+)\s+\d+\s+typ\s+host\b/i);
  if (!match) return false;
  const address = String(match[1] || "").trim();
  if (!address || !address.includes(":")) return false;
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1") return false;
  if (normalized.startsWith("fe80:")) return false;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
  return true;
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

async function collectIceStatsSummary(pc) {
  if (!pc || typeof pc.getStats !== "function") return null;
  const report = await pc.getStats();
  const summary = {
    selectedPair: null,
    candidatePairs: { total: 0, succeeded: 0, failed: 0, inProgress: 0 },
    localCandidates: { total: 0, byType: {} },
    remoteCandidates: { total: 0, byType: {} },
  };
  const byId = new Map();
  for (const stat of report.values()) {
    byId.set(stat.id, stat);
  }
  for (const stat of report.values()) {
    if (stat.type === "candidate-pair") {
      summary.candidatePairs.total += 1;
      const state = String(stat.state || "");
      if (state === "succeeded") summary.candidatePairs.succeeded += 1;
      else if (state === "failed") summary.candidatePairs.failed += 1;
      else summary.candidatePairs.inProgress += 1;
      if (stat.nominated || stat.selected) {
        const local = byId.get(stat.localCandidateId);
        const remote = byId.get(stat.remoteCandidateId);
        summary.selectedPair = {
          state,
          nominated: Boolean(stat.nominated),
          bytesSent: Number(stat.bytesSent || 0),
          bytesReceived: Number(stat.bytesReceived || 0),
          currentRoundTripTime: Number(stat.currentRoundTripTime || 0),
          local: local
            ? {
                candidateType: String(local.candidateType || ""),
                protocol: String(local.protocol || ""),
                address: String(local.address || ""),
                port: Number(local.port || 0),
              }
            : null,
          remote: remote
            ? {
                candidateType: String(remote.candidateType || ""),
                protocol: String(remote.protocol || ""),
                address: String(remote.address || ""),
                port: Number(remote.port || 0),
              }
            : null,
        };
      }
      continue;
    }
    if (stat.type === "local-candidate") {
      summary.localCandidates.total += 1;
      const kind = String(stat.candidateType || "other");
      summary.localCandidates.byType[kind] = Number(summary.localCandidates.byType[kind] || 0) + 1;
      continue;
    }
    if (stat.type === "remote-candidate") {
      summary.remoteCandidates.total += 1;
      const kind = String(stat.candidateType || "other");
      summary.remoteCandidates.byType[kind] = Number(summary.remoteCandidates.byType[kind] || 0) + 1;
    }
  }
  return summary;
}

function normalizeCandidateForSignal(candidateLike) {
  const source =
    candidateLike && typeof candidateLike === "object" && typeof candidateLike.toJSON === "function"
      ? candidateLike.toJSON()
      : candidateLike;
  const candidate = String(source?.candidate || "");
  if (!candidate) return null;
  const sdpMid =
    source?.sdpMid === null || typeof source?.sdpMid === "string" ? source.sdpMid : null;
  const sdpMLineIndex = Number.isInteger(source?.sdpMLineIndex)
    ? Number(source.sdpMLineIndex)
    : 0;
  const usernameFragment =
    typeof source?.usernameFragment === "string" && source.usernameFragment
      ? source.usernameFragment
      : parseUfragFromCandidateLine(candidate);
  const normalized = { candidate, sdpMid, sdpMLineIndex };
  if (usernameFragment) normalized.usernameFragment = usernameFragment;
  return normalized;
}

function parseUfragFromCandidateLine(line) {
  const text = String(line || "");
  if (!text) return undefined;
  const match = text.match(/\bufrag\s+([^\s]+)/i);
  if (!match) return undefined;
  return String(match[1] || "").trim() || undefined;
}

function nextPunchAtMs({ now, suggestedPunchAtMs, punchLeadMs }) {
  const nowMs = Number(now || Date.now());
  const suggested = Number(suggestedPunchAtMs || 0);
  const lead = Math.max(200, Number(punchLeadMs || 0));
  const earliest = nowMs + lead;
  const latest = nowMs + 4000;
  if (!Number.isFinite(suggested) || suggested <= 0) return earliest;
  return Math.max(earliest, Math.min(latest, suggested));
}

function scheduleLocalCandidateFlush({
  activePunchAtMs,
  signal,
  stoppedRef,
  getQueue,
  setQueue,
  setTimer,
  clearTimer,
}) {
  clearTimer();
  const flush = () => {
    if (typeof stoppedRef === "function" && stoppedRef()) return;
    const queue = Array.isArray(getQueue?.()) ? getQueue() : [];
    if (!queue.length) return;
    setQueue([]);
    for (const item of queue) {
      signal.send(item);
    }
  };
  const delayMs = Math.max(0, Number(activePunchAtMs || 0) - Date.now());
  if (delayMs <= 0) {
    flush();
    return;
  }
  const timer = setTimeout(() => {
    setTimer(null);
    flush();
  }, delayMs);
  setTimer(timer);
}
