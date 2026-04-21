import { relayUrlForInvite, formatBytes } from "./lib/invite.js";
import {
  loadManifestFromInvite,
  readInviteEntry,
  readInviteEntryChunks,
  safeClose,
} from "./lib/download.js";
import { openDriveViaWebRtcInvite } from "./lib/webrtc-client.js";
import {
  buildWebClientInviteUrl,
  toInviteUrl,
  toNativeInviteUrl,
} from "./lib/app-links.js";

if (typeof globalThis.global === "undefined") {
  globalThis.global = globalThis;
}

const app = document.getElementById("app");

app.innerHTML = `
  <style>
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #1f3342;
      background: radial-gradient(circle at top left, #e8f4ef, #f5f8fb);
    }
    main {
      max-width: 780px;
      margin: 48px auto;
      padding: 24px;
      background: #fff;
      border: 1px solid #d7e2ea;
      border-radius: 16px;
      box-shadow: 0 18px 42px rgba(31, 51, 66, 0.09);
    }
    textarea {
      width: 100%;
      min-height: 88px;
      border-radius: 12px;
      border: 1px solid #c8d6e2;
      padding: 10px;
      box-sizing: border-box;
    }
    button {
      border: 0;
      border-radius: 999px;
      background: #1f7a68;
      color: #fff;
      padding: 10px 16px;
      margin-top: 12px;
      cursor: pointer;
    }
    button:disabled,
    button.is-loading {
      opacity: 0.65;
      cursor: not-allowed;
      pointer-events: none;
    }
    .ghost {
      border: 1px solid #1f7a68;
      background: transparent;
      color: #1f7a68;
      margin-left: 8px;
    }
    .join-spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 999px;
      margin-right: 8px;
      animation: joinspin 0.8s linear infinite;
      vertical-align: -2px;
    }
    @keyframes joinspin {
      to { transform: rotate(360deg); }
    }
    .bulk-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }
    .bulk-count {
      color: #5f7688;
      font-size: 13px;
    }
    .menu-wrap {
      position: relative;
      display: inline-block;
    }
    .menu-btn {
      margin-top: 0;
      border-radius: 10px;
      background: #2a5973;
      color: #fff;
      padding: 8px 12px;
    }
    .menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 280px;
      background: #fff;
      border: 1px solid #d1dde8;
      border-radius: 10px;
      box-shadow: 0 12px 24px rgba(31, 51, 66, 0.18);
      padding: 6px;
      z-index: 20;
    }
    .menu-item {
      width: 100%;
      margin-top: 0;
      border-radius: 8px;
      text-align: left;
      background: #f5f8fb;
      color: #27465b;
      padding: 8px 10px;
    }
    .menu-item + .menu-item {
      margin-top: 6px;
    }
    .files-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .files-table th,
    .files-table td {
      text-align: left;
      border-bottom: 1px solid #e3eaf0;
      padding: 10px 8px;
      vertical-align: middle;
    }
    .files-table th {
      color: #667989;
      font-size: 13px;
      font-weight: 700;
    }
    .check-col {
      width: 40px;
    }
    .preview-col {
      width: 86px;
    }
    .preview-btn {
      border: 0;
      margin: 0;
      padding: 0;
      width: 52px;
      height: 52px;
      border-radius: 10px;
      border: 1px solid #cfdae5;
      background: #f0f4f8;
      color: #4a6173;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      overflow: hidden;
      cursor: pointer;
    }
    .preview-btn img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .preview-skeleton {
      width: 100%;
      height: 100%;
      display: block;
      background: linear-gradient(100deg, #d8e2eb 20%, #eef3f8 45%, #d8e2eb 70%);
      background-size: 220% 100%;
      animation: previewShimmer 1.2s linear infinite;
    }
    @keyframes previewShimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: -100% 0;
      }
    }
    .download-btn {
      margin-top: 0;
      padding: 8px 12px;
      border-radius: 10px;
    }
    .row-muted {
      color: #8094a5;
      font-size: 13px;
    }
    .hidden { display: none !important; }
    .download-progress {
      margin-top: 8px;
    }
    .join-progress {
      margin-top: 10px;
    }
    .join-progress-label {
      color: #6f8598;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .join-progress-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: #d7e4ef;
      overflow: hidden;
    }
    .join-progress-fill {
      width: 0%;
      height: 100%;
      background: #1f7a68;
      transition: width 160ms ease;
    }
    .download-progress-label {
      color: #6f8598;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .download-progress-sub {
      color: #7f93a4;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .download-progress-track {
      width: 100%;
      height: 8px;
      border-radius: 999px;
      background: #d7e4ef;
      overflow: hidden;
    }
    .download-progress-fill {
      width: 0%;
      height: 100%;
      background: #1967d2;
      transition: width 120ms ease;
    }
    .helper {
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid #f1d6a8;
      background: #fff8ea;
      color: #6d4d16;
      display: none;
    }
    .helper button {
      margin-top: 8px;
      background: #6d4d16;
      color: #fff8ea;
    }
    .preview-modal {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview-modal-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(12, 21, 28, 0.58);
    }
    .preview-modal-card {
      position: relative;
      width: min(1020px, 92vw);
      height: min(760px, 90vh);
      background: #fff;
      border: 1px solid #d7e2ea;
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .preview-modal-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e3eaf0;
      padding: 10px 12px;
    }
    .preview-close {
      margin-top: 0;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      padding: 0;
      background: #dce8f1;
      color: #2a4558;
      border: 1px solid #c2d6e6;
    }
    .preview-modal-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 14px;
      background: #f7fbff;
    }
    .preview-frame {
      width: 100%;
      height: 100%;
      border: 2px solid #bccfdf;
      border-radius: 12px;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      color: #567184;
    }
    .preview-frame img,
    .preview-frame video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #fff;
    }
  </style>

  <h1>PearDrop Web Client</h1>
  <p>View an invite drive in browser, then download selected files peer-to-peer.</p>
  <p><a href="/" style="color:#2a5973; font-weight:700; text-decoration:none;">← Back to landing</a></p>

  <label for="invite">Invite link</label>
  <textarea id="invite" placeholder="Paste peardrops://invite..."></textarea>
  <div>
    <button id="join">View Drive</button>
    <button id="join-cancel" class="ghost hidden">Cancel</button>
    <button id="open-native" class="ghost">Open in App</button>
  </div>
  <h2>Files</h2>
  <div class="bulk-actions">
    <span id="bulk-count" class="bulk-count">0 selected</span>
    <span class="menu-wrap">
      <button id="download-selected-btn" class="menu-btn">Download selected ▾</button>
      <div id="download-selected-menu" class="menu hidden">
        <button id="download-selected-tgz" class="menu-item">Download selected as .tgz</button>
        <button id="download-selected-individual" class="menu-item">Download selected individually (batch)</button>
      </div>
    </span>
  </div>
  <table class="files-table">
    <thead>
      <tr>
        <th class="check-col"><input id="check-all" type="checkbox" /></th>
        <th class="preview-col">Preview</th>
        <th>Name</th>
        <th>Last modified</th>
        <th>Size</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody id="files"></tbody>
  </table>
  <p id="status">Idle</p>
  <div id="join-progress" class="join-progress hidden">
    <div id="join-progress-label" class="join-progress-label">Connecting to peer...</div>
    <div class="join-progress-track">
      <div id="join-progress-fill" class="join-progress-fill"></div>
    </div>
  </div>
  <div id="download-progress" class="download-progress hidden">
    <div id="download-progress-label" class="download-progress-label">Downloading files...</div>
    <div id="download-progress-sub" class="download-progress-sub hidden"></div>
    <div class="download-progress-track">
      <div id="download-progress-fill" class="download-progress-fill"></div>
    </div>
  </div>
  <div id="relay-helper" class="helper">
    <div><strong>Relay not running?</strong> Start it with:</div>
    <code id="relay-cmd">cd /Users/geordangesink/Documents/Projects/Pear Drops/web && npm run relay</code>
    <div><button id="copy-relay-cmd">Copy command</button></div>
  </div>
  <div id="preview-modal" class="preview-modal hidden">
    <div id="preview-backdrop" class="preview-modal-backdrop"></div>
    <div class="preview-modal-card">
      <div class="preview-modal-head">
        <strong id="preview-title">Preview</strong>
        <button id="preview-close" class="preview-close">✕</button>
      </div>
      <div class="preview-modal-body">
        <div id="preview-frame" class="preview-frame">Loading preview...</div>
      </div>
    </div>
  </div>
`;

const statusEl = document.getElementById("status");
const joinProgressEl = document.getElementById("join-progress");
const joinProgressLabelEl = document.getElementById("join-progress-label");
const joinProgressFillEl = document.getElementById("join-progress-fill");
const downloadProgressEl = document.getElementById("download-progress");
const downloadProgressLabelEl = document.getElementById(
  "download-progress-label",
);
const downloadProgressSubEl = document.getElementById("download-progress-sub");
const downloadProgressFillEl = document.getElementById(
  "download-progress-fill",
);
const downloadProgressState = {
  startedAt: 0,
  total: 0,
  mode: "",
  label: "",
};
const filesEl = document.getElementById("files");
const inviteEl = document.getElementById("invite");
const joinBtn = document.getElementById("join");
const joinCancelBtn = document.getElementById("join-cancel");
const openNativeBtn = document.getElementById("open-native");
const relayHelperEl = document.getElementById("relay-helper");
const copyRelayCmdBtn = document.getElementById("copy-relay-cmd");
const relayCmdEl = document.getElementById("relay-cmd");
const previewModalEl = document.getElementById("preview-modal");
const previewBackdropEl = document.getElementById("preview-backdrop");
const previewCloseEl = document.getElementById("preview-close");
const previewTitleEl = document.getElementById("preview-title");
const previewFrameEl = document.getElementById("preview-frame");
const checkAllEl = document.getElementById("check-all");
const bulkCountEl = document.getElementById("bulk-count");
const downloadSelectedBtn = document.getElementById("download-selected-btn");
const downloadSelectedMenu = document.getElementById("download-selected-menu");
const downloadSelectedTgzBtn = document.getElementById("download-selected-tgz");
const downloadSelectedIndividualBtn = document.getElementById(
  "download-selected-individual",
);

let currentSession = null;
let currentEntries = [];
let selectedEntryKeys = new Set();
const previewCache = new Map();
const thumbnailCache = new Map();
const thumbnailLoading = new Set();
const objectUrls = new Set();
let joinInFlight = false;
let activeJoinToken = 0;
let joinProgressTimer = null;
let joinProgressValue = 0;
const JOIN_PHASES = Object.freeze({
  "parse-invite": { value: 8, label: "Parsing invite..." },
  "open-drive": { value: 14, label: "Preparing connection..." },
  "relay-connect": { value: 20, label: "Connecting to relay..." },
  "relay-open": { value: 28, label: "Relay connected. Initializing DHT..." },
  "dht-init": { value: 34, label: "Initializing peer discovery..." },
  "signal-connect": { value: 40, label: "Opening signaling channel..." },
  "signal-open": { value: 46, label: "Signaling channel ready." },
  "rtc-setup": { value: 52, label: "Preparing WebRTC connection..." },
  "offer-create": { value: 58, label: "Creating peer offer..." },
  "offer-send": { value: 64, label: "Sending offer to peer..." },
  "peer-handshake": { value: 72, label: "Waiting for peer handshake..." },
  "channel-open": { value: 80, label: "Secure channel established." },
  "drive-ready": { value: 86, label: "Peer drive connected." },
  "manifest-request": { value: 90, label: "Requesting drive manifest..." },
  "manifest-received": { value: 94, label: "Manifest received..." },
  "manifest-parsed": { value: 96, label: "Preparing file list..." },
});

joinBtn.addEventListener("click", () => void joinInvite());
joinCancelBtn.addEventListener("click", () => {
  if (!joinInFlight) return;
  activeJoinToken += 1;
  setJoinLoading(false);
  stopJoinProgress();
  statusEl.textContent = "Cancelled loading invite.";
});
openNativeBtn.addEventListener("click", () => {
  const nativeInvite = toNativeInviteUrl(inviteEl.value);
  if (!nativeInvite) {
    statusEl.textContent = "Paste a valid invite URL first.";
    return;
  }
  openAppWithFallback(nativeInvite);
});
copyRelayCmdBtn.addEventListener("click", async () => {
  const cmd = relayCmdEl.textContent || "";
  try {
    await navigator.clipboard.writeText(cmd);
    statusEl.textContent = "Relay command copied.";
  } catch {
    statusEl.textContent = "Could not copy command automatically.";
  }
});
previewBackdropEl.addEventListener("click", closePreview);
previewCloseEl.addEventListener("click", closePreview);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePreview();
});
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (!target.closest(".menu-wrap")) {
    downloadSelectedMenu.classList.add("hidden");
  }
});
downloadSelectedBtn.addEventListener("click", () => {
  downloadSelectedMenu.classList.toggle("hidden");
});
downloadSelectedTgzBtn.addEventListener(
  "click",
  () => void downloadSelectedAsTgz(),
);
downloadSelectedIndividualBtn.addEventListener(
  "click",
  () => void downloadSelectedIndividually(),
);
checkAllEl.addEventListener("change", () => {
  selectedEntryKeys = new Set();
  if (checkAllEl.checked) {
    for (let i = 0; i < currentEntries.length; i++) {
      selectedEntryKeys.add(entryKey(currentEntries[i], i));
    }
  }
  renderFileRows(currentEntries);
});
filesEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const actionNode = target.closest("[data-action]");
  if (!(actionNode instanceof HTMLElement)) return;
  const action = actionNode.dataset.action || "";
  const index = Number(actionNode.dataset.index || -1);
  if (!Number.isInteger(index) || index < 0 || index >= currentEntries.length) {
    return;
  }
  const entry = currentEntries[index];
  if (action === "download") void downloadEntry(entry);
  if (action === "preview") void openPreview(entry);
  if (action === "toggle") {
    const key = entryKey(entry, index);
    if (selectedEntryKeys.has(key)) selectedEntryKeys.delete(key);
    else selectedEntryKeys.add(key);
    syncBulkSelectionUi();
  }
});

const initialInvite = new URLSearchParams(location.search).get("invite");
if (initialInvite) {
  inviteEl.value = initialInvite;
  void joinInvite();
}

async function joinInvite() {
  if (joinInFlight) return;
  const token = ++activeJoinToken;
  const invite = normalizeInviteInput(inviteEl.value);
  if (!invite) {
    setJoinLoading(false);
    statusEl.textContent = "Paste an invite URL first.";
    return;
  }
  if (
    !invite.startsWith("peardrops://invite") &&
    !invite.startsWith("peardrops-web://join")
  ) {
    setJoinLoading(false);
    statusEl.textContent =
      "Invite must be a peardrops:// link, peardrops-web:// link, or a https://peardrop.online/open/?invite=... link";
    return;
  }

  setJoinLoading(true);
  startJoinProgress("Initializing connection...");
  statusEl.textContent = "Connecting to relay and peer swarm...";

  try {
    setJoinProgress(6, "Resetting previous session...");
    relayHelperEl.style.display = "none";
    await safeClose(currentSession);
    if (token !== activeJoinToken) return;
    currentSession = null;
    clearPreviewCache();

    let offerSendCount = 0;
    const applyJoinPhase = (phase, details = null) => {
      const step = JOIN_PHASES[String(phase || "")];
      if (!step) return;
      if (String(phase || "") === "offer-send") {
        offerSendCount += 1;
        setJoinProgress(step.value, `Sending offer to peer (${offerSendCount})...`);
        return;
      }
      if (String(phase || "") === "peer-handshake") {
        const pairCounts = details?.pairCounts || null;
        const localCandidates = details?.localCandidates || null;
        const remoteCandidates = details?.remoteCandidates || null;
        if (pairCounts) {
          const totalPairs = Math.max(0, Number(pairCounts.total || 0));
          const succeededPairs = Math.max(0, Number(pairCounts.succeeded || 0));
          const failedPairs = Math.max(0, Number(pairCounts.failed || 0));
          const inProgressPairs = Math.max(0, Number(pairCounts.inProgress || 0));
          const weightedDone =
            succeededPairs + failedPairs + inProgressPairs * 0.45;
          const ratio = totalPairs > 0 ? Math.min(1, weightedDone / totalPairs) : 0;
          const handshakeProgress = Math.round(72 + ratio * 7);

          const listText = [
            `pairs total ${totalPairs}`,
            `in progress ${inProgressPairs}`,
            `succeeded ${succeededPairs}`,
            `failed ${failedPairs}`,
            `local ${Number(localCandidates?.total || 0)}`,
            `remote ${Number(remoteCandidates?.total || 0)}`,
          ].join(" | ");
          setJoinProgress(handshakeProgress, `Waiting for peer handshake... ${listText}`);
          return;
        }
      }
      setJoinProgress(step.value, step.label);
    };
    const maybeTestOpenDrive = globalThis.__PEARDROPS_TEST_OPEN_DRIVE__;
    const openDrive =
      typeof maybeTestOpenDrive === "function"
        ? (parsed, _options = {}) => maybeTestOpenDrive(parsed)
        : async (parsed) => {
            return openDriveFromInvite(parsed, {
              onPhase: applyJoinPhase,
            });
          };

    setJoinProgress(10, "Parsing invite...");
    const { manifest, session } = await loadManifestFromInvite(invite, {
      openDrive,
      onPhase: applyJoinPhase,
    });
    if (token !== activeJoinToken) {
      await safeClose(session);
      return;
    }

    currentSession = session;
    currentEntries = Array.isArray(manifest.files) ? manifest.files : [];
    selectedEntryKeys = new Set();

    setJoinProgress(98, "Rendering drive contents...");
    renderFileRows(currentEntries);
    setJoinProgress(100, "Drive ready");

    statusEl.textContent = `Connected. ${manifest.files?.length || 0} file(s) available.`;
  } catch (error) {
    if (token !== activeJoinToken) return;
    const message = error.message || String(error);
    statusEl.textContent = `Join failed: ${message}`;
    if (message.includes("Relay connection failed")) {
      relayHelperEl.style.display = "block";
    }
  } finally {
    if (token === activeJoinToken) {
      setJoinLoading(false);
      stopJoinProgress();
    }
  }
}

function setJoinLoading(loading) {
  joinInFlight = Boolean(loading);
  joinBtn.disabled = joinInFlight;
  joinBtn.classList.toggle("is-loading", joinInFlight);
  joinBtn.setAttribute("aria-busy", joinInFlight ? "true" : "false");
  joinCancelBtn.classList.toggle("hidden", !joinInFlight);
  joinBtn.innerHTML = joinInFlight
    ? '<span class="join-spinner"></span>Loading...'
    : "View Drive";
}

function startJoinProgress(label = "Connecting to peer...") {
  stopJoinProgress(false);
  joinProgressValue = 4;
  if (joinProgressEl) joinProgressEl.classList.remove("hidden");
  if (joinProgressLabelEl) joinProgressLabelEl.textContent = label;
  if (joinProgressFillEl) {
    joinProgressFillEl.style.width = `${joinProgressValue}%`;
  }
  joinProgressTimer = setInterval(() => {
    if (!joinInFlight) return;
    if (joinProgressValue >= 88) return;
    joinProgressValue = Math.min(88, joinProgressValue + 1);
    if (joinProgressFillEl) {
      joinProgressFillEl.style.width = `${joinProgressValue}%`;
    }
  }, 420);
}

function setJoinProgress(value, label = "") {
  const nextValue = Math.max(0, Math.min(100, Number(value || 0)));
  joinProgressValue = Math.max(joinProgressValue, nextValue);
  if (joinProgressEl) joinProgressEl.classList.remove("hidden");
  if (joinProgressFillEl) {
    joinProgressFillEl.style.width = `${joinProgressValue}%`;
  }
  if (label && joinProgressLabelEl) joinProgressLabelEl.textContent = label;
}

function stopJoinProgress(hide = true) {
  if (joinProgressTimer) {
    clearInterval(joinProgressTimer);
    joinProgressTimer = null;
  }
  if (hide && joinProgressEl) joinProgressEl.classList.add("hidden");
}

function renderFileRows(entries) {
  filesEl.textContent = "";
  if (!entries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td class="row-muted" colspan="6">No files available in this invite.</td>';
    filesEl.appendChild(tr);
    syncBulkSelectionUi();
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const key = entryKey(entry, i);
    const checked = selectedEntryKeys.has(key) ? "checked" : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="checkbox" data-action="toggle" data-index="${i}" ${checked} /></td>
      <td>${previewButtonHtml(entry, i)}</td>
      <td>${escapeHtml(entry.name || `File ${i + 1}`)}</td>
      <td class="row-muted">--</td>
      <td class="row-muted">${formatBytes(Number(entry.byteLength || 0))}</td>
      <td><button class="download-btn" data-action="download" data-index="${i}">Download ${escapeHtml(entry.name || `file-${i + 1}`)}</button></td>
    `;
    filesEl.appendChild(tr);
  }
  syncBulkSelectionUi();
  queueImageThumbnailLoads(entries);
}

function previewButtonHtml(entry, index) {
  const mime = String(entry?.mimeType || "").toLowerCase();
  const ext = fileExt(entry?.name || "");
  const key = entryKey(entry, index);
  const isImage =
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  if (isImage) {
    const thumb = thumbnailCache.get(key);
    if (thumb) {
      return `<button class="preview-btn" data-action="preview" data-index="${index}"><img alt="preview" src="${thumb}" loading="lazy" /></button>`;
    }
    const waiting = thumbnailLoading.has(key);
    return `<button class="preview-btn" data-action="preview" data-index="${index}"><span class="preview-skeleton" aria-label="${escapeHtml(waiting ? "Loading preview..." : "Preview pending")}"></span></button>`;
  }
  if (
    mime.startsWith("video/") ||
    ["mp4", "mov", "webm", "mkv"].includes(ext)
  ) {
    return `<button class="preview-btn" data-action="preview" data-index="${index}">▶</button>`;
  }
  return `<button class="preview-btn" data-action="preview" data-index="${index}">${escapeHtml((ext || "file").toUpperCase())}</button>`;
}

async function downloadEntry(entry, options = {}) {
  const manageProgress = options.manageProgress !== false;
  const onProgress =
    typeof options.onProgress === "function" ? options.onProgress : null;
  const chunkSize = Number(options.chunkSize || 64 * 1024);
  if (!currentSession) throw new Error("No active session");
  const entryBytes = Math.max(0, Number(entry?.byteLength || 0));
  const useByteProgress = entryBytes > 0;
  if (manageProgress) {
    showDownloadProgress(
      0,
      useByteProgress ? entryBytes : 1,
      "Downloading file...",
      `Current file: ${entry?.name || "file"}`,
      useByteProgress ? "bytes" : "count",
    );
  }
  try {
    let doneBytes = 0;
    const chunks = [];
    let writable = null;

    const allowFilePicker =
      useByteProgress &&
      typeof window.showSaveFilePicker === "function" &&
      !(typeof navigator !== "undefined" && navigator.webdriver) &&
      !globalThis.__PEARDROPS_DISABLE_FILE_PICKER__;
    if (allowFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: entry?.name || "download.bin",
        });
        writable = await handle.createWritable();
      } catch {
        writable = null;
      }
    }

    for await (const chunk of readInviteEntryChunks(currentSession, entry, {
      chunkSize,
    })) {
      const bytes =
        chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk || 0);
      doneBytes += bytes.byteLength;
      if (writable) await writable.write(bytes);
      else chunks.push(bytes);

      if (onProgress) onProgress(doneBytes, entry);
      if (manageProgress) {
        showDownloadProgress(
          useByteProgress ? doneBytes : 1,
          useByteProgress ? entryBytes : 1,
          "Downloading file...",
          `Current file: ${entry?.name || "file"}`,
          useByteProgress ? "bytes" : "count",
        );
      }
    }

    if (writable) {
      await writable.close();
    } else {
      const blob = new Blob(chunks, {
        type: entry.mimeType || "application/octet-stream",
      });
      const handledByShareSheet = await maybeShareMediaToPhotos(blob, entry);
      if (handledByShareSheet) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
    if (manageProgress) {
      showDownloadProgress(
        useByteProgress ? Math.max(doneBytes, entryBytes) : 1,
        useByteProgress ? entryBytes : 1,
        "Downloading file...",
        `Current file: ${entry?.name || "file"}`,
        useByteProgress ? "bytes" : "count",
      );
    }
  } finally {
    if (manageProgress) hideDownloadProgress();
  }
}

async function downloadSelectedIndividually() {
  const picked = getSelectedEntries();
  if (!picked.length) {
    statusEl.textContent = "Select one or more files first.";
    return;
  }
  downloadSelectedMenu.classList.add("hidden");
  statusEl.textContent = `Downloading ${picked.length} selected file(s)...`;
  const knownTotalBytes = picked.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry?.byteLength || 0)),
    0,
  );
  const useByteProgress = knownTotalBytes > 0;
  const totalForProgress = useByteProgress ? knownTotalBytes : picked.length;
  let downloadedBytes = 0;
  showDownloadProgress(
    0,
    totalForProgress,
    "Downloading selected files...",
    "Current file: preparing...",
    useByteProgress ? "bytes" : "count",
  );
  try {
    for (let i = 0; i < picked.length; i++) {
      const entry = picked[i];
      showDownloadProgress(
        useByteProgress ? downloadedBytes : i,
        totalForProgress,
        "Downloading selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count",
      );
      const baseAtStart = downloadedBytes;
      await downloadEntry(entry, {
        manageProgress: false,
        onProgress(doneForFile) {
          downloadedBytes = baseAtStart + Number(doneForFile || 0);
          showDownloadProgress(
            useByteProgress ? downloadedBytes : i,
            totalForProgress,
            "Downloading selected files...",
            `Current file: ${entry?.name || `file-${i + 1}`}`,
            useByteProgress ? "bytes" : "count",
          );
        },
      });
      downloadedBytes =
        baseAtStart + Math.max(0, Number(entry?.byteLength || 0));
      showDownloadProgress(
        useByteProgress ? downloadedBytes : i + 1,
        totalForProgress,
        "Downloading selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count",
      );
      await sleep(40);
    }
    statusEl.textContent = `Downloaded ${picked.length} selected file(s).`;
  } finally {
    hideDownloadProgress();
  }
}

async function downloadSelectedAsTgz() {
  const picked = getSelectedEntries();
  if (!picked.length) {
    statusEl.textContent = "Select one or more files first.";
    return;
  }
  if (!currentSession) throw new Error("No active session");
  downloadSelectedMenu.classList.add("hidden");
  statusEl.textContent = `Packing ${picked.length} selected file(s) into .tgz...`;

  const files = [];
  const knownTotalBytes = picked.reduce(
    (sum, entry) => sum + Math.max(0, Number(entry?.byteLength || 0)),
    0,
  );
  const useByteProgress = knownTotalBytes > 0;
  const totalForProgress = useByteProgress ? knownTotalBytes : picked.length;
  let packedBytes = 0;
  const chunkSize = 64 * 1024;
  showDownloadProgress(
    0,
    totalForProgress,
    "Packing selected files...",
    "Current file: preparing...",
    useByteProgress ? "bytes" : "count",
  );
  try {
    for (let i = 0; i < picked.length; i++) {
      const entry = picked[i];
      showDownloadProgress(
        useByteProgress ? packedBytes : i,
        totalForProgress,
        "Packing selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count",
      );
      const baseAtStart = packedBytes;
      let fileDone = 0;
      const fileChunks = [];
      for await (const chunk of readInviteEntryChunks(currentSession, entry, {
        chunkSize,
      })) {
        const bytes =
          chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk || 0);
        if (!bytes.byteLength) continue;
        fileChunks.push(bytes);
        fileDone += bytes.byteLength;
        packedBytes = useByteProgress ? baseAtStart + fileDone : i;
        showDownloadProgress(
          useByteProgress ? packedBytes : i,
          totalForProgress,
          "Packing selected files...",
          `Current file: ${entry?.name || `file-${i + 1}`}`,
          useByteProgress ? "bytes" : "count",
        );
      }
      const bytes = concatBytes(fileChunks);
      files.push({
        name: sanitizeTarName(entry.name || "file.bin"),
        bytes,
      });
      packedBytes = useByteProgress
        ? baseAtStart + Math.max(fileDone, Number(entry?.byteLength || 0))
        : i + 1;
      showDownloadProgress(
        useByteProgress ? packedBytes : i + 1,
        totalForProgress,
        "Packing selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count",
      );
    }

    const tarBytes = buildTarArchive(files);
    const tgzBytes = await gzipBytes(tarBytes);
    const blob = new Blob([tgzBytes], { type: "application/gzip" });
    const fileName = `pear-drops-${Date.now()}.tgz`;
    triggerBrowserDownload(blob, fileName);
    statusEl.textContent = `Downloaded ${fileName}`;
  } finally {
    hideDownloadProgress();
  }
}

function showDownloadProgress(
  done,
  total,
  label = "Downloading files...",
  subtitle = "",
  mode = "count",
) {
  if (
    !downloadProgressEl ||
    !downloadProgressLabelEl ||
    !downloadProgressFillEl
  ) {
    return;
  }
  const safeTotal = Math.max(1, Number(total || 0));
  const safeDone = Math.max(0, Math.min(safeTotal, Number(done || 0)));
  const normalizedMode = String(mode || "count");
  const normalizedLabel = String(label || "Downloading files...");
  if (
    !downloadProgressState.startedAt ||
    downloadProgressState.total !== safeTotal ||
    downloadProgressState.mode !== normalizedMode ||
    downloadProgressState.label !== normalizedLabel ||
    safeDone === 0
  ) {
    downloadProgressState.startedAt = Date.now();
    downloadProgressState.total = safeTotal;
    downloadProgressState.mode = normalizedMode;
    downloadProgressState.label = normalizedLabel;
  }
  const percent = Math.round((safeDone / safeTotal) * 100);
  const progressText =
    normalizedMode === "bytes"
      ? `${percent}% (${formatBytes(safeDone)} / ${formatBytes(safeTotal)})`
      : `${safeDone}/${safeTotal}`;
  const etaMs = estimateRemainingMs(
    safeDone,
    safeTotal,
    downloadProgressState.startedAt,
  );
  const etaText = etaMs ? `ETA ${formatEta(etaMs)}` : "";
  downloadProgressEl.classList.remove("hidden");
  downloadProgressLabelEl.textContent = `${normalizedLabel} ${progressText}`;
  if (downloadProgressSubEl) {
    const sub = String(subtitle || "").trim();
    const nextSub = sub && etaText ? `${sub} • ${etaText}` : sub || etaText;
    downloadProgressSubEl.textContent = nextSub;
    downloadProgressSubEl.classList.toggle("hidden", !nextSub);
  }
  downloadProgressFillEl.style.width = `${percent}%`;
}

function hideDownloadProgress() {
  if (
    !downloadProgressEl ||
    !downloadProgressLabelEl ||
    !downloadProgressFillEl
  ) {
    return;
  }
  downloadProgressFillEl.style.width = "0%";
  downloadProgressLabelEl.textContent = "Downloading files...";
  if (downloadProgressSubEl) {
    downloadProgressSubEl.textContent = "";
    downloadProgressSubEl.classList.add("hidden");
  }
  downloadProgressState.startedAt = 0;
  downloadProgressState.total = 0;
  downloadProgressState.mode = "";
  downloadProgressState.label = "";
  downloadProgressEl.classList.add("hidden");
}

function estimateRemainingMs(done, total, startedAtMs) {
  const safeTotal = Math.max(0, Number(total || 0));
  const safeDone = Math.max(0, Number(done || 0));
  const startedAt = Number(startedAtMs || 0);
  if (!safeTotal || safeDone <= 0 || safeDone >= safeTotal || !startedAt) {
    return null;
  }
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  if (elapsedMs < 1500) return null;
  const ratePerMs = safeDone / elapsedMs;
  if (!Number.isFinite(ratePerMs) || ratePerMs <= 0) return null;
  return (safeTotal - safeDone) / ratePerMs;
}

function formatEta(ms) {
  const seconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  if (minutes < 60) return `${minutes}m ${rem}s`;
  const hours = Math.floor(minutes / 60);
  const minRem = minutes % 60;
  return `${hours}h ${minRem}m`;
}

function getSelectedEntries() {
  const picked = [];
  for (let i = 0; i < currentEntries.length; i++) {
    const entry = currentEntries[i];
    if (selectedEntryKeys.has(entryKey(entry, i))) picked.push(entry);
  }
  return picked;
}

function syncBulkSelectionUi() {
  const total = currentEntries.length;
  const selected = getSelectedEntries().length;
  bulkCountEl.textContent = `${selected} selected`;
  checkAllEl.checked = total > 0 && selected === total;
}

function entryKey(entry, index) {
  return String(entry.drivePath || `${entry.name || "file"}:${index}`);
}

function triggerBrowserDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function sanitizeTarName(name) {
  return String(name || "file.bin")
    .replaceAll("\\", "_")
    .replaceAll("/", "_");
}

function buildTarArchive(files) {
  const chunks = [];
  for (const file of files) {
    const body = toUint8(file.bytes);
    const header = makeTarHeader(file.name, body.length);
    chunks.push(header, body, zeroPad((512 - (body.length % 512)) % 512));
  }
  chunks.push(new Uint8Array(1024));
  return concatBytes(chunks);
}

function makeTarHeader(name, size) {
  const header = new Uint8Array(512);
  writeString(header, 0, 100, name.slice(0, 100));
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000));
  for (let i = 148; i < 156; i++) header[i] = 32;
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar");
  writeString(header, 263, 2, "00");
  const checksum = header.reduce((sum, value) => sum + value, 0);
  writeOctal(header, 148, 8, checksum);
  return header;
}

function writeString(buffer, offset, length, text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const count = Math.min(bytes.length, length);
  for (let i = 0; i < count; i++) buffer[offset + i] = bytes[i];
}

function writeOctal(buffer, offset, length, value) {
  const octal = Math.max(0, Number(value || 0)).toString(8);
  const padded = octal.padStart(Math.max(1, length - 2), "0");
  writeString(buffer, offset, length - 1, padded);
  buffer[offset + length - 1] = 0;
}

function zeroPad(size) {
  return size > 0 ? new Uint8Array(size) : new Uint8Array(0);
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function toUint8(value) {
  if (value instanceof Uint8Array) return value;
  return new Uint8Array(value);
}

async function gzipBytes(bytes) {
  if (typeof CompressionStream === "undefined") {
    throw new Error(
      "This browser does not support CompressionStream for .tgz export.",
    );
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const compressed = await new Response(stream).arrayBuffer();
  return new Uint8Array(compressed);
}

async function openPreview(entry) {
  if (!currentSession) return;
  const key = String(entry.drivePath || "");
  previewTitleEl.textContent = entry.name || "Preview";
  previewModalEl.classList.remove("hidden");
  previewFrameEl.textContent = "Loading preview...";

  const cached = previewCache.get(key);
  if (cached) {
    renderPreviewFromCache(cached);
    return;
  }

  try {
    const data = await readInviteEntry(currentSession, entry);
    const mime = String(entry.mimeType || "").toLowerCase();
    const blob = new Blob([data], {
      type: mime || "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    objectUrls.add(url);
    const kind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("video/")
        ? "video"
        : "other";
    const record = { url, kind, mime };
    previewCache.set(key, record);
    renderPreviewFromCache(record);
  } catch (error) {
    previewFrameEl.textContent = `Preview unavailable: ${error?.message || String(error)}`;
  }
}

function renderPreviewFromCache(record) {
  previewFrameEl.textContent = "";
  if (record.kind === "image") {
    const img = document.createElement("img");
    img.src = record.url;
    previewFrameEl.appendChild(img);
    return;
  }
  if (record.kind === "video") {
    const video = document.createElement("video");
    video.src = record.url;
    video.controls = true;
    video.autoplay = true;
    previewFrameEl.appendChild(video);
    return;
  }
  previewFrameEl.textContent =
    "No inline preview available for this file type.";
}

function closePreview() {
  previewModalEl.classList.add("hidden");
}

function clearPreviewCache() {
  previewCache.clear();
  thumbnailCache.clear();
  thumbnailLoading.clear();
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
  closePreview();
}

function queueImageThumbnailLoads(entries) {
  if (!currentSession || !Array.isArray(entries) || !entries.length) return;
  const sessionAtStart = currentSession;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isImageEntry(entry)) continue;
    const key = entryKey(entry, i);
    if (thumbnailCache.has(key) || thumbnailLoading.has(key)) continue;
    thumbnailLoading.add(key);
    void loadImageThumbnail(entry, key, sessionAtStart);
  }
}

async function loadImageThumbnail(entry, key, sessionAtStart) {
  try {
    const bytes = await readInviteEntry(sessionAtStart, entry);
    if (sessionAtStart !== currentSession) return;
    const mime = String(entry?.mimeType || "").toLowerCase();
    const blob = new Blob([bytes], {
      type: mime || "application/octet-stream",
    });
    const thumbUrl = await makeThumbnailUrl(blob, 52);
    if (!thumbUrl) return;
    objectUrls.add(thumbUrl);
    thumbnailCache.set(key, thumbUrl);
  } catch {
    // keep fallback preview icon when thumbnail fails
  } finally {
    thumbnailLoading.delete(key);
    if (sessionAtStart === currentSession) {
      renderFileRows(currentEntries);
    }
  }
}

async function makeThumbnailUrl(blob, maxEdge = 52) {
  const safeEdge = Math.max(24, Number(maxEdge || 52));
  let sourceWidth = 0;
  let sourceHeight = 0;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);
    sourceWidth = Number(bitmap.width || 0);
    sourceHeight = Number(bitmap.height || 0);
    if (!sourceWidth || !sourceHeight) {
      bitmap.close?.();
      return "";
    }
    const scale = Math.min(1, safeEdge / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await canvasToObjectUrl(canvas);
  }

  const srcUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImageElement(srcUrl);
    sourceWidth = Number(image.naturalWidth || image.width || 0);
    sourceHeight = Number(image.naturalHeight || image.height || 0);
    if (!sourceWidth || !sourceHeight) return "";
    const scale = Math.min(1, safeEdge / Math.max(sourceWidth, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await canvasToObjectUrl(canvas);
  } finally {
    URL.revokeObjectURL(srcUrl);
  }
}

function loadImageElement(srcUrl) {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = srcUrl;
  });
}

function canvasToObjectUrl(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve("");
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/webp",
      0.75,
    );
  });
}

function isImageEntry(entry) {
  const mime = String(entry?.mimeType || "").toLowerCase();
  const ext = fileExt(entry?.name || "");
  if (mime.startsWith("image/")) return true;
  return ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"].includes(ext);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fileExt(name) {
  const idx = String(name || "").lastIndexOf(".");
  return idx < 0
    ? ""
    : String(name)
        .slice(idx + 1)
        .toLowerCase();
}

function isMediaFileEntry(entry) {
  const mime = String(entry?.mimeType || "").toLowerCase();
  const ext = fileExt(entry?.name || "");
  if (mime.startsWith("image/") || mime.startsWith("video/")) return true;
  return [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "heic",
    "heif",
    "mp4",
    "mov",
    "webm",
    "m4v",
  ].includes(ext);
}

function isLikelyMobileBrowser() {
  const ua = String(navigator?.userAgent || "").toLowerCase();
  return /iphone|ipad|ipod|android|mobile/.test(ua);
}

async function maybeShareMediaToPhotos(blob, entry) {
  if (!isLikelyMobileBrowser()) return false;
  if (!isMediaFileEntry(entry)) return false;
  if (typeof navigator?.share !== "function") return false;
  if (typeof globalThis.File !== "function") return false;

  const file = new globalThis.File([blob], String(entry?.name || "download"), {
    type: String(entry?.mimeType || blob.type || "application/octet-stream"),
  });

  if (typeof navigator?.canShare === "function") {
    try {
      if (!navigator.canShare({ files: [file] })) return false;
    } catch {
      return false;
    }
  }

  const shouldOpenShareSheet = window.confirm(
    "Save to Photos? We can open the share sheet so you can choose “Save Image” or “Save Video”.",
  );
  if (!shouldOpenShareSheet) return false;

  try {
    await navigator.share({
      files: [file],
      title: String(entry?.name || "PearDrop media"),
      text: "Save to Photos",
    });
    statusEl.textContent =
      "Opened share sheet. Choose “Save Image” or “Save Video” to save to Photos.";
    return true;
  } catch (error) {
    if (String(error?.name || "") === "AbortError") return true;
    return false;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function openDriveViaRelay(parsed) {
  const [{ default: DHT }, { default: RelayStream }, { default: b4a }] =
    await Promise.all([
      import("@hyperswarm/dht-relay"),
      import("@hyperswarm/dht-relay/ws"),
      import("b4a"),
    ]);

  const relayUrl = relayUrlForInvite(parsed, location);
  const socket = new WebSocket(relayUrl);
  await onceOpen(socket);

  const dht = new DHT(new RelayStream(true, socket));
  const topicHex = parsed.topic || parsed.driveKey;
  if (!topicHex) throw new Error("Invite is missing web swarm topic");

  const topic = b4a.from(topicHex, "hex");
  const preferredKey = parsed.webKey ? b4a.from(parsed.webKey, "hex") : null;
  const peerKey = await lookupFirstPeer(dht, topic, 8000, preferredKey);
  const stream = dht.connect(peerKey);
  await onceStreamOpen(stream);
  const peer = createPeerRequestClient(stream);

  return {
    drive: {
      async get(drivePath) {
        if (drivePath === "/manifest.json") {
          const response = await peer.request({ type: "manifest" });
          if (!response || typeof response.manifest !== "object") {
            throw new Error("Peer did not return a valid manifest payload");
          }
          return b4a.from(JSON.stringify(response.manifest), "utf8");
        }

        const response = await peer.request({ type: "file", path: drivePath });
        if (!response?.dataBase64) return null;
        return b4a.from(response.dataBase64, "base64");
      },
      async getChunk(drivePath, offset, length) {
        const response = await peer.request({
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
      stream.destroy();
      if (typeof dht.destroy === "function") await dht.destroy();
      socket.close();
    },
  };
}

async function openDriveFromInvite(parsed, options = {}) {
  if (!parsed.signalKey) {
    // TODO: Consider reintroducing non-WebRTC fallback in a future release
    // when we can guarantee equivalent privacy semantics end-to-end.
    throw new Error(
      "This web client requires a WebRTC-enabled invite (missing signal key).",
    );
  }

  const relayUrl = relayUrlForInvite(parsed, location);
  const [{ default: DHT }, { default: RelayStream }, { default: b4a }] =
    await Promise.all([
      import("@hyperswarm/dht-relay"),
      import("@hyperswarm/dht-relay/ws"),
      import("b4a"),
    ]);

  return openDriveViaWebRtcInvite(
    parsed,
    relayUrl,
    {
      DHT,
      RelayStream,
      b4a,
    },
    options,
  );
}

function onceOpen(socket) {
  if (socket.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => {
        const url = socket.url || "unknown relay url";
        reject(
          new Error(
            `Relay connection failed (${url}). Start relay with \`npm run relay\` or use an invite with a reachable relay host (not localhost unless browser is on same machine).`,
          ),
        );
      },
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
      reject(error || new Error("Peer connection failed"));
    };
    const cleanup = () => {
      stream.off?.("open", onOpen);
      stream.off?.("error", onError);
    };
    stream.on?.("open", onOpen);
    stream.on?.("error", onError);
  });
}

function lookupFirstPeer(dht, topic, timeoutMs, preferredKey = null) {
  return new Promise((resolve, reject) => {
    const stream = dht.lookup(topic);
    const timer = setTimeout(() => {
      stream.destroy?.();
      reject(new Error("Timed out finding a web peer on swarm topic"));
    }, timeoutMs);

    let fallbackPeer = null;
    stream.on("data", (result) => {
      const peers = result?.peers || [];
      for (const peer of peers) {
        if (!peer?.publicKey) continue;
        fallbackPeer = fallbackPeer || peer.publicKey;
        if (
          preferredKey &&
          peer.publicKey.length === preferredKey.length &&
          peer.publicKey.every((value, index) => value === preferredKey[index])
        ) {
          clearTimeout(timer);
          stream.destroy?.();
          resolve(peer.publicKey);
          return;
        }
      }
    });

    stream.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    stream.on("end", () => {
      clearTimeout(timer);
      if (fallbackPeer) {
        resolve(fallbackPeer);
        return;
      }
      reject(new Error("No peers announced for this web swarm topic"));
    });
  });
}

function createPeerRequestClient(stream) {
  let nextId = 1;
  let buffered = "";
  const pending = new Map();
  const decoder = new TextDecoder("utf8");

  stream.on("data", (chunk) => {
    buffered += decoder.decode(chunk, { stream: true });
    let newline = buffered.indexOf("\n");
    while (newline !== -1) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (line) {
        try {
          const message = JSON.parse(line);
          const waiter = pending.get(message.id);
          if (waiter) {
            pending.delete(message.id);
            if (message.ok === false) {
              waiter.reject(new Error(message.error || "Peer request failed"));
            } else {
              waiter.resolve(message);
            }
          }
        } catch {
          // Helps diagnose protocol mismatches when connected peer is not serving the expected API.
          console.warn("Ignoring non-JSON peer message:", line.slice(0, 120));
        }
      }
      newline = buffered.indexOf("\n");
    }
  });

  stream.on("error", (error) => {
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });

  return {
    request(payload) {
      const id = nextId++;
      const request = JSON.stringify({ id, ...payload }) + "\n";
      stream.write(request);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
    },
  };
}

function normalizeInviteInput(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("Join failed:")) return "";
  return toInviteUrl(text) || text;
}

function openAppWithFallback(nativeInvite) {
  const fallbackUrl = buildWebClientInviteUrl(nativeInvite);
  let done = false;
  let timer = null;

  const finish = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
  };

  const onVisibilityChange = () => {
    if (document.hidden) finish();
  };

  const onPageHide = () => finish();

  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide, { once: true });

  timer = setTimeout(() => {
    if (done) return;
    finish();
    location.href = fallbackUrl;
  }, 1500);

  try {
    location.href = nativeInvite;
  } catch {
    finish();
    location.href = fallbackUrl;
  }
}
