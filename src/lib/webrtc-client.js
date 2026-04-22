const DEFAULT_ICE_SERVERS = [
  {
    urls: [
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
    handshakeTimeoutMs: Number(options?.timing?.handshakeTimeoutMs || 120000),
    postAnswerConnectTimeoutMs: Number(options?.timing?.postAnswerConnectTimeoutMs || 120000),
    postAnswerIdleTimeoutMs: Number(options?.timing?.postAnswerIdleTimeoutMs || 20000),
    preAnswerOfferRetryMs: Number(options?.timing?.preAnswerOfferRetryMs || 1100),
    restartOfferMinGapMs: Number(options?.timing?.restartOfferMinGapMs || 2000),
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
  const maxOfferAttempts = 5;
  let offerInFlight = false;
  let lastOfferSentAt = 0;
  let remoteSignalError = "";
  let answerReceivedAt = 0;
  let lastLocalCandidateAt = 0;
  let lastRemoteCandidateAt = 0;
  let hostIceState = "";
  let hostConnState = "";
  let hostNetStatus = null;
  let hostIceStats = null;
  let iceRestartAttempts = 0;
  const maxIceRestartAttempts = 2;
  let remoteAddCandidateErrors = 0;
  let lastRemoteAddCandidateError = "";
  let remoteCandidatesIgnoredByOfferId = 0;
  let activePunchAtMs = 0;
  let suggestedPunchAtMs = 0;
  let localCandidateQueue = [];
  let localCandidateFlushTimer = null;
  let handshakeStatsTimer = null;
  let latestIceStatsSummary = null;
  let stopped = false;
  let offerRetryTimer = null;
  let requestIceRestart = () => {};
  let preparedOfferId = 0;
  let currentOfferId = 0;
  let lastSentOfferId = 0;
  let latestAnsweredOfferId = 0;
  let latestAckedOfferId = 0;
  let latestOfferAckStage = "";
  let latestOfferAckAt = 0;
  let hostIceStatsAt = 0;
  const offerAckEvents = [];

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
    if (handshakeStatsTimer) {
      clearInterval(handshakeStatsTimer);
      handshakeStatsTimer = null;
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

  const addRemoteCandidate = async (candidate) => {
    if (!candidate) {
      await pc.addIceCandidate(null);
      return true;
    }
    const candidateForAdd =
      typeof RTCIceCandidate === "function" ? new RTCIceCandidate(candidate) : candidate;
    await pc.addIceCandidate(candidateForAdd);
    return true;
  };

  const flushPendingCandidates = async () => {
    if (!remoteDescriptionSet || pendingRemoteCandidates.length === 0) return;
    while (pendingRemoteCandidates.length) {
      const candidate = pendingRemoteCandidates.shift();
      try {
        await addRemoteCandidate(candidate);
        if (candidate) remoteCandidatesApplied += 1;
      } catch (error) {
        if (candidate) {
          remoteAddCandidateErrors += 1;
          lastRemoteAddCandidateError = String(error?.message || error || "addIceCandidate failed");
        }
      }
    }
  };

  signal.onMessage(async (message) => {
    if (stopped) return;
    if (message.type === "ready") {
      peerSignalReady = true;
      suggestedPunchAtMs = Number(message.punchAtMs || 0);
      hostNetStatus = message.hostNetStatus || hostNetStatus;
      return;
    }
    if (message.type === "error") {
      remoteSignalError = String(message.error || message.message || "Remote signaling error");
      return;
    }
    if (message.type === "host-ice-state") {
      hostIceState = String(message.state || "");
      const hostIce = String(hostIceState || "").toLowerCase();
      if (receivedAnswer && (hostIce === "failed" || hostIce === "disconnected")) {
        requestIceRestart({ force: true });
      }
      return;
    }
    if (message.type === "host-conn-state") {
      hostConnState = String(message.state || "");
      const hostConn = String(hostConnState || "").toLowerCase();
      if (receivedAnswer && (hostConn === "failed" || hostConn === "disconnected")) {
        requestIceRestart({ force: true });
      }
      return;
    }
    if (message.type === "host-net-status") {
      hostNetStatus = message.status || hostNetStatus;
      return;
    }
    if (message.type === "host-ice-stats") {
      hostIceStats = message.stats || hostIceStats;
      hostIceStatsAt = Date.now();
      return;
    }
    if (message.type === "offer-ack") {
      const offerId = Number(message.offerId || 0);
      if (offerId > 0) {
        latestAckedOfferId = Math.max(latestAckedOfferId, offerId);
      }
      latestOfferAckStage = String(message.stage || "");
      latestOfferAckAt = Date.now();
      offerAckEvents.push({ at: latestOfferAckAt, offerId, stage: latestOfferAckStage });
      if (offerAckEvents.length > 30) offerAckEvents.shift();
      return;
    }

    if (message.type === "answer" && message.sdp) {
      if (String(pc.signalingState || "") !== "have-local-offer") return;
      const answerOfferId = Number(message.offerId || 0);
      if (answerOfferId > 0 && currentOfferId > 0 && answerOfferId !== currentOfferId) return;
      try {
        await pc.setRemoteDescription({
          type: "answer",
          sdp: sanitizeIceSdp(String(message.sdp || "")),
        });
        remoteDescriptionSet = true;
        receivedAnswer = true;
        latestAnsweredOfferId = answerOfferId || currentOfferId;
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
      const messageOfferId = Number(message.offerId || 0);
      if (messageOfferId > 0 && currentOfferId > 0 && messageOfferId !== currentOfferId) {
        remoteCandidatesIgnoredByOfferId += 1;
        remoteCandidatesDropped += 1;
        return;
      }
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
        await addRemoteCandidate(normalized);
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
        await addRemoteCandidate(null);
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
        localCandidateQueue.push({
          type: "candidate",
          candidate: normalized,
          offerId: currentOfferId || undefined,
        });
        return;
      }
      signal.send({
        type: "candidate",
        candidate: normalized,
        offerId: currentOfferId || undefined,
      });
      return;
    }
    if (activePunchAtMs > Date.now()) {
      localCandidateQueue.push({
        type: "candidate-end",
        endOfCandidates: true,
        offerId: currentOfferId || undefined,
      });
      return;
    }
    signal.send({
      type: "candidate-end",
      endOfCandidates: true,
      offerId: currentOfferId || undefined,
    });
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
      preparedOfferId += 1;
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
    if (preparedOfferId > 0 && currentOfferId !== preparedOfferId) {
      currentOfferId = preparedOfferId;
    }
    emitPhase("offer-send");
    const sdp = sanitizeIceSdp(current);
    signal.send({
      type: "offer",
      sdp,
      punchAtMs: activePunchAtMs,
      offerId: currentOfferId,
    });
    lastSentOfferId = currentOfferId;
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
      if (preparedOfferId > 0 && currentOfferId !== preparedOfferId) {
        currentOfferId = preparedOfferId;
      }
      emitPhase("offer-send");
      const sdp = sanitizeIceSdp(String(pc?.localDescription?.sdp || ""));
      signal.send({
        type: "offer",
        sdp,
        punchAtMs: activePunchAtMs,
        offerId: currentOfferId,
      });
      lastSentOfferId = currentOfferId;
      offerAttempts += 1;
      lastOfferSentAt = Date.now();
    } finally {
      offerInFlight = false;
    }
  };

  const tryIceRestart = async ({ force = false } = {}) => {
    if (stopped) return false;
    if (!receivedAnswer) return false;
    if (channel.readyState === "open") return false;
    if (offerInFlight) return false;
    if (iceRestartAttempts >= maxIceRestartAttempts) return false;
    if (offerAttempts >= maxOfferAttempts) return false;
    if (Date.now() - lastOfferSentAt < timing.restartOfferMinGapMs) return false;
    const pairTotal = Number(latestIceStatsSummary?.candidatePairs?.total || 0);
    const pairInProgress = Number(latestIceStatsSummary?.candidatePairs?.inProgress || 0);
    const remoteTotal = Number(latestIceStatsSummary?.remoteCandidates?.total || 0);
    // If ICE is actively probing candidate pairs, avoid restart churn that can reset progress.
    // Allow forced restart when one side already reports failed/disconnected.
    if (!force && pairTotal > 0 && pairInProgress > 0 && remoteTotal > 0) return false;
    iceRestartAttempts += 1;
    await sendOffer({ restartIce: true });
    return true;
  };
  requestIceRestart = (options = {}) => {
    void tryIceRestart(options);
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
    const signalingState = String(pc?.signalingState || "");
    // Keep retrying the current offer while we're still waiting for an answer.
    // This applies before the first answer and after ICE-restart re-offers.
    if (receivedAnswer && signalingState !== "have-local-offer") return;
    if (offerAttempts >= maxOfferAttempts) return;
    if (Date.now() - lastOfferSentAt < timing.preAnswerOfferRetryMs) return;
    // Re-send the same local offer instead of immediately creating a fresh generation.
    sendCurrentOffer();
  }, timing.preAnswerOfferRetryMs);

  const onConnectionStateMaybeRestart = () => {
    const iceState = String(pc.iceConnectionState || "");
    const connState = String(pc.connectionState || "");
    if (iceState === "failed" || connState === "failed") {
      void tryIceRestart({ force: true });
      return;
    }
    if (iceState === "disconnected") {
      void tryIceRestart();
    }
  };
  pc.oniceconnectionstatechange = onConnectionStateMaybeRestart;
  pc.onconnectionstatechange = onConnectionStateMaybeRestart;

  emitPhase("peer-handshake");
  handshakeStatsTimer = setInterval(() => {
    if (stopped) return;
    void collectIceStatsSummary(pc)
      .then((summary) => {
        if (!summary) return;
        latestIceStatsSummary = summary;
        emitPhase("peer-handshake", {
          pairCounts: summary.candidatePairs || null,
          localCandidates: summary.localCandidates || null,
          remoteCandidates: summary.remoteCandidates || null,
        });
      })
      .catch(() => {});
  }, 1000);
  const handshakeStartedAt = Date.now();
  try {
    await waitForChannelOpen(channel, pc, timing.handshakeTimeoutMs, () => ({
      offerAttempts,
      peerSignalReady,
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
      hostNetStatus,
      hostIceStats,
      localIpv6GlobalHostCandidates,
      remoteIpv6GlobalHostCandidates,
      remoteAddCandidateErrors,
      lastRemoteAddCandidateError,
      remoteCandidatesIgnoredByOfferId,
      activePunchAtMs,
      preparedOfferId,
      currentOfferId,
      lastSentOfferId,
      latestAnsweredOfferId,
      latestAckedOfferId,
      latestOfferAckStage,
      latestOfferAckAt,
      hostIceStatsAt,
      offerAckEvents,
      answerReceivedAt,
      answerAgeMs: answerReceivedAt > 0 ? Date.now() - answerReceivedAt : 0,
      lastLocalCandidateAt,
      lastRemoteCandidateAt,
      localCandidateIdleMs: lastLocalCandidateAt > 0 ? Date.now() - lastLocalCandidateAt : 0,
      remoteCandidateIdleMs: lastRemoteCandidateAt > 0 ? Date.now() - lastRemoteCandidateAt : 0,
      iceRestartAttempts,
    }), () => {
      if (!receivedAnswer && Date.now() - handshakeStartedAt > timing.noAnswerTimeoutMs) {
        if (!peerSignalReady) return "Timed out waiting for host ready signal";
        return "Timed out waiting for peer answer";
      }
      if (remoteSignalError) return remoteSignalError;
      if (receivedAnswer && allHostMappingProtocolsFailed(hostNetStatus)) {
        const answerAgeMs = answerReceivedAt > 0 ? Date.now() - answerReceivedAt : 0;
        if (answerAgeMs > Math.max(7000, timing.postAnswerIdleTimeoutMs)) {
          return "Host network does not allow automatic NAT mapping (PCP/NAT-PMP/UPnP all failed)";
        }
      }
      const hostIce = String(hostIceState || "").toLowerCase();
      const hostConn = String(hostConnState || "").toLowerCase();
      if (receivedAnswer && (hostIce === "failed" || hostConn === "failed")) {
        if (iceRestartAttempts < maxIceRestartAttempts) {
          void tryIceRestart({ force: true });
          return "";
        }
        const answerAgeMs = answerReceivedAt > 0 ? Date.now() - answerReceivedAt : 0;
        if (answerAgeMs < Math.max(6000, timing.postAnswerIdleTimeoutMs)) return "";
        return "Host ICE failed before data channel opened";
      }
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
    const diagnostics = {
      iceStats: maybeIceSummary,
      deterministicFailure: classifyDeterministicFailure({
        receivedAnswer,
        hostIceState,
        hostConnState,
        hostNetStatus,
        hostIceStats,
        iceGatheringState: String(pc.iceGatheringState || ""),
        signalingState: String(pc.signalingState || ""),
        preparedOfferId,
        currentOfferId,
        lastSentOfferId,
        latestAnsweredOfferId,
        latestAckedOfferId,
        latestOfferAckStage,
        latestOfferAckAgeMs: latestOfferAckAt > 0 ? Date.now() - latestOfferAckAt : 0,
        hostIceStatsAgeMs: hostIceStatsAt > 0 ? Date.now() - hostIceStatsAt : 0,
        answerAgeMs: answerReceivedAt > 0 ? Date.now() - answerReceivedAt : 0,
        postAnswerConnectTimeoutMs: timing.postAnswerConnectTimeoutMs,
        remoteSignalError,
        iceStats: maybeIceSummary,
      }),
      exactFailurePoint: classifyExactFailurePoint({
        offerAttempts,
        peerSignalReady,
        receivedAnswer,
        localCandidatesSent,
        remoteCandidatesApplied,
        remoteAddCandidateErrors,
        remoteCandidatesIgnoredByOfferId,
        signalingState: String(pc.signalingState || ""),
        preparedOfferId,
        currentOfferId,
        lastSentOfferId,
        latestAnsweredOfferId,
        latestAckedOfferId,
        latestOfferAckStage,
        latestOfferAckAt,
        offerAckEvents,
        hostIceState,
        hostConnState,
        hostNetStatus,
        hostIceStats,
        hostIceStatsAt,
        iceStats: maybeIceSummary,
      }),
    };
    await stopRtc();
    if (maybeIceSummary && String(error?.message || "").includes("WebRTC channel")) {
      throw new Error(
        `${String(error.message || error)} ${JSON.stringify(diagnostics)}`,
      );
    }
    throw error;
  } finally {
    if (offerRetryTimer) {
      clearInterval(offerRetryTimer);
      offerRetryTimer = null;
    }
    if (handshakeStatsTimer) {
      clearInterval(handshakeStatsTimer);
      handshakeStatsTimer = null;
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

function classifyDeterministicFailure(context) {
  const remoteSignalError = String(context?.remoteSignalError || "");
  if (remoteSignalError) {
    return {
      code: "REMOTE_SIGNAL_ERROR",
      message: "Remote signaling reported a hard error",
    };
  }

  const hostConnState = String(context?.hostConnState || "").toLowerCase();
  const hostIceState = String(context?.hostIceState || "").toLowerCase();
  if (allHostMappingProtocolsFailed(context?.hostNetStatus)) {
    return {
      code: "HOST_MAPPING_PROTOCOLS_FAILED",
      message: "Host network rejected PCP/NAT-PMP/UPnP mapping attempts",
    };
  }
  const hostIceStats = context?.hostIceStats || null;
  const hostRemoteCandidates = Number(hostIceStats?.remoteCandidates?.total || 0);
  const hostPairTotal = Number(hostIceStats?.candidatePairs?.total || 0);
  if (hostConnState === "failed" || hostIceState === "failed") {
    if (hostPairTotal === 0 && hostRemoteCandidates === 0) {
      return {
        code: "HOST_NEVER_REGISTERED_REMOTE_CANDIDATES",
        message: "Host ICE transport never registered browser remote candidates",
      };
    }
    return {
      code: "HOST_ICE_FAILED",
      message: "Host peer connection entered failed state before data channel opened",
    };
  }

  const receivedAnswer = Boolean(context?.receivedAnswer);
  const signalingState = String(context?.signalingState || "").toLowerCase();
  if (receivedAnswer && signalingState === "have-local-offer") {
    const currentOfferId = Number(context?.currentOfferId || 0);
    const latestAckedOfferId = Number(context?.latestAckedOfferId || 0);
    if (currentOfferId > 0 && latestAckedOfferId < currentOfferId) {
      return {
        code: "LATEST_OFFER_NOT_ACKED_BY_HOST",
        message: "Host did not acknowledge receiving the latest restart offer",
      };
    }
    return {
      code: "NO_ANSWER_FOR_LATEST_OFFER",
      message: "Browser is still waiting for answer to latest restart offer",
    };
  }
  const gatheringState = String(context?.iceGatheringState || "").toLowerCase();
  const stats = context?.iceStats || null;
  const remoteCandidatesTotal = Number(stats?.remoteCandidates?.total || 0);
  if (receivedAnswer && gatheringState === "complete" && stats && remoteCandidatesTotal === 0) {
    return {
      code: "NO_REMOTE_ICE_CANDIDATES",
      message: "No remote ICE candidates were registered by browser ICE transport",
    };
  }

  const answerAgeMs = Number(context?.answerAgeMs || 0);
  const timeoutMs = Number(context?.postAnswerConnectTimeoutMs || 0);
  const pairTotal = Number(stats?.candidatePairs?.total || 0);
  const hasSelectedPair = Boolean(stats?.selectedPair);
  if (
    receivedAnswer &&
    stats &&
    !hasSelectedPair &&
    pairTotal > 0 &&
    timeoutMs > 0 &&
    answerAgeMs >= timeoutMs
  ) {
    return {
      code: "NO_SELECTED_CANDIDATE_PAIR",
      message: "No ICE candidate pair was selected before timeout",
    };
  }

  return null;
}

function classifyExactFailurePoint(context) {
  const now = Date.now();
  const receivedAnswer = Boolean(context?.receivedAnswer);
  const signalingState = String(context?.signalingState || "").toLowerCase();
  const currentOfferId = Number(context?.currentOfferId || 0);
  const preparedOfferId = Number(context?.preparedOfferId || 0);
  const lastSentOfferId = Number(context?.lastSentOfferId || 0);
  const latestAnsweredOfferId = Number(context?.latestAnsweredOfferId || 0);
  const latestAckedOfferId = Number(context?.latestAckedOfferId || 0);
  const latestOfferAckStage = String(context?.latestOfferAckStage || "");
  const latestOfferAckAt = Number(context?.latestOfferAckAt || 0);
  const hostIceStatsAt = Number(context?.hostIceStatsAt || 0);
  const browserStats = context?.iceStats || null;
  const hostIceStats = context?.hostIceStats || null;
  const hostFlow = context?.hostNetStatus?.remoteCandidateFlow || null;
  const hostActiveFlow = context?.hostNetStatus?.activeOfferCandidateFlow || null;
  const browserRemoteCandidates = Number(browserStats?.remoteCandidates?.total || 0);
  const remoteCandidatesIgnoredByOfferId = Number(context?.remoteCandidatesIgnoredByOfferId || 0);
  const browserPairsTotal = Number(browserStats?.candidatePairs?.total || 0);
  const browserPairsInProgress = Number(browserStats?.candidatePairs?.inProgress || 0);
  const browserHasSelectedPair = Boolean(browserStats?.selectedPair);
  const hostRemoteCandidates = Number(hostIceStats?.remoteCandidates?.total || 0);
  const hostPairsTotal = Number(hostIceStats?.candidatePairs?.total || 0);
  const hostPairsInProgress = Number(hostIceStats?.candidatePairs?.inProgress || 0);
  const hostHasSelectedPair = Boolean(hostIceStats?.selectedPair);
  const hostFlowReceived = Number(hostFlow?.received || 0);
  const hostFlowApplied = Number(hostFlow?.applied || 0);
  const hostFlowAddErrors = Number(hostFlow?.addErrors || 0);
  if (allHostMappingProtocolsFailed(context?.hostNetStatus)) {
    return {
      stage: "host.nat-mapping-unavailable",
      exact: true,
      reason: "Host network rejected PCP/NAT-PMP/UPnP mapping attempts",
      evidence: {
        upnpStatus: context?.hostNetStatus?.upnp || null,
      },
    };
  }

  if (!Boolean(context?.peerSignalReady) && !receivedAnswer) {
    return {
      stage: "signaling.host-ready",
      exact: true,
      reason: "Host ready signal was never observed before answer timeout",
      evidence: {
        offerAttempts: Number(context?.offerAttempts || 0),
        peerSignalReady: Boolean(context?.peerSignalReady),
      },
    };
  }

  if (!receivedAnswer) {
    return {
      stage: "signaling.answer",
      exact: true,
      reason: "Did not receive peer answer for current offer generation",
      evidence: {
        currentOfferId,
        latestAnsweredOfferId,
        latestAckedOfferId,
        latestOfferAckStage,
      },
    };
  }

  if (signalingState === "have-local-offer" && latestAnsweredOfferId < currentOfferId) {
    if (lastSentOfferId < currentOfferId || currentOfferId < preparedOfferId) {
      return {
        stage: "client.offer-send",
        exact: true,
        reason: "Latest local offer generation was prepared but not confirmed as sent",
        evidence: {
          preparedOfferId,
          currentOfferId,
          lastSentOfferId,
          latestAnsweredOfferId,
          latestAckedOfferId,
        },
      };
    }
    return {
      stage: "signaling.latest-answer",
      exact: true,
      reason: "Latest restart offer did not get a matching answer",
      evidence: {
        currentOfferId,
        latestAnsweredOfferId,
        latestAckedOfferId,
        latestOfferAckStage,
        latestOfferAckAgeMs: latestOfferAckAt > 0 ? now - latestOfferAckAt : 0,
      },
    };
  }

  if (remoteCandidatesIgnoredByOfferId > 0 && browserRemoteCandidates === 0) {
    return {
      stage: "candidate.generation-mismatch",
      exact: true,
      reason: "Browser dropped remote ICE candidates from non-active offer generation",
      evidence: {
        remoteCandidatesIgnoredByOfferId,
        currentOfferId,
        latestAnsweredOfferId,
      },
    };
  }

  if (hostFlowReceived === 0 && Number(context?.localCandidatesSent || 0) > 0) {
    return {
      stage: "candidate.delivery.to-host",
      exact: true,
      reason: "Host did not report receiving browser ICE candidates",
      evidence: {
        localCandidatesSent: Number(context?.localCandidatesSent || 0),
        hostFlowReceived,
        latestOfferAckStage,
      },
    };
  }

  if (hostFlowReceived > 0 && hostFlowApplied === 0 && hostFlowAddErrors > 0) {
    return {
      stage: "candidate.apply.on-host",
      exact: true,
      reason: "Host received candidates but failed to apply them",
      evidence: {
        hostFlowReceived,
        hostFlowApplied,
        hostFlowAddErrors,
        lastAddError: String(hostFlow?.lastAddError || ""),
      },
    };
  }

  if (hostFlowApplied > 0 && hostRemoteCandidates === 0 && hostIceStatsAt > 0 && now - hostIceStatsAt < 10000) {
    return {
      stage: "host.ice.transport.register-remote",
      exact: true,
      reason: "Host applied candidates but host ICE stats still show zero remote candidates",
      evidence: {
        hostFlowApplied,
        hostRemoteCandidates,
        hostIceStatsAgeMs: now - hostIceStatsAt,
      },
    };
  }

  const hostNetIceStats = context?.hostNetStatus?.iceStats || null;
  const hostNetPairs = Number(hostNetIceStats?.candidatePairs?.total || 0);
  const hostNetRemote = Number(hostNetIceStats?.remoteCandidates?.total || 0);
  if (
    (hostNetPairs > 0 || hostNetRemote > 0) &&
    hostPairsTotal === 0 &&
    hostRemoteCandidates === 0 &&
    Number(hostActiveFlow?.applied || 0) > 0
  ) {
    return {
      stage: "host.ice.post-apply-collapse",
      exact: true,
      reason: "Host had active ICE checks for this flow, then host ICE stats collapsed to zero without selection",
      evidence: {
        hostNetPairs,
        hostNetRemote,
        hostPairsTotal,
        hostRemoteCandidates,
        hostActiveFlow,
      },
    };
  }

  if (
    hostRemoteCandidates > 0 &&
    browserRemoteCandidates > 0 &&
    hostPairsTotal === 0 &&
    browserPairsTotal === 0
  ) {
    return {
      stage: "ice.pair-formation",
      exact: true,
      reason: "Both sides registered remote candidates but no ICE candidate pairs were formed",
      evidence: {
        browserRemoteCandidates,
        hostRemoteCandidates,
        browserPairsTotal,
        hostPairsTotal,
      },
    };
  }

  if (
    (browserPairsInProgress > 0 || hostPairsInProgress > 0) &&
    !browserHasSelectedPair &&
    !hostHasSelectedPair
  ) {
    return {
      stage: "ice.connectivity-checks",
      exact: true,
      reason: "Connectivity checks ran but no pair was nominated/selected",
      evidence: {
        browserPairs: browserStats?.candidatePairs || null,
        hostPairs: hostIceStats?.candidatePairs || null,
      },
    };
  }

  return {
    stage: "unknown",
    exact: false,
    reason: "Insufficient synchronized evidence to isolate first failing stage",
    evidence: {
      signalingState,
      currentOfferId,
      latestAnsweredOfferId,
      latestAckedOfferId,
      latestOfferAckStage,
      browserPairs: browserStats?.candidatePairs || null,
      hostPairs: hostIceStats?.candidatePairs || null,
      hostFlow,
    },
  };
}

function allHostMappingProtocolsFailed(hostNetStatus) {
  const upnp = hostNetStatus?.upnp || null;
  const protocols = upnp?.protocols || null;
  if (!protocols) return false;
  const pcp = protocols.pcp || null;
  const natPmp = protocols.natPmp || null;
  const upnpNative = protocols.upnp || null;
  const upnpLegacy = protocols.upnpLegacy || null;
  const hasAttempts =
    Number(pcp?.attempts || 0) > 0 &&
    Number(natPmp?.attempts || 0) > 0 &&
    Number(upnpNative?.attempts || 0) > 0 &&
    Number(upnpLegacy?.attempts || 0) > 0;
  if (!hasAttempts) return false;
  const allFailed =
    Number(pcp?.succeeded || 0) === 0 &&
    Number(natPmp?.succeeded || 0) === 0 &&
    Number(upnpNative?.succeeded || 0) === 0 &&
    Number(upnpLegacy?.succeeded || 0) === 0;
  return allFailed;
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
