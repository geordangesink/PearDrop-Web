import { relayUrlForInvite, formatBytes } from "./lib/invite.js";
import {
  loadManifestFromInvite,
  readInviteEntry,
  readInviteEntryChunks,
  safeClose,
} from "./lib/download.js";
import { openDriveViaWebRtcInvite } from "./lib/webrtc-client.js";

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
    .ghost {
      border: 1px solid #1f7a68;
      background: transparent;
      color: #1f7a68;
      margin-left: 8px;
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

  <h1>Pear Drops Web Client</h1>
  <p>Join a native uploader from the browser and download files peer-to-peer.</p>

  <label for="invite">Invite link</label>
  <textarea id="invite" placeholder="Paste peardrops://invite..."></textarea>
  <div>
    <button id="join">Join & Load Files</button>
    <button id="open-native" class="ghost">Open In Native App</button>
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
const downloadProgressEl = document.getElementById("download-progress");
const downloadProgressLabelEl = document.getElementById("download-progress-label");
const downloadProgressSubEl = document.getElementById("download-progress-sub");
const downloadProgressFillEl = document.getElementById("download-progress-fill");
const filesEl = document.getElementById("files");
const inviteEl = document.getElementById("invite");
const joinBtn = document.getElementById("join");
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
const objectUrls = new Set();

joinBtn.addEventListener("click", () => void joinInvite());
openNativeBtn.addEventListener("click", () => {
  const invite = inviteEl.value.trim();
  if (
    invite.startsWith("peardrops://invite") ||
    invite.startsWith("peardrops-web://join")
  ) {
    location.href = invite;
  }
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
  if (!Number.isInteger(index) || index < 0 || index >= currentEntries.length)
    return;
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
  const invite = normalizeInviteInput(inviteEl.value);
  if (!invite) {
    statusEl.textContent = "Paste an invite URL first.";
    return;
  }
  if (
    !invite.startsWith("peardrops://invite") &&
    !invite.startsWith("peardrops-web://join")
  ) {
    statusEl.textContent =
      "Invite must start with peardrops://invite or peardrops-web://join";
    return;
  }

  statusEl.textContent = "Connecting to relay and peer swarm...";

  try {
    relayHelperEl.style.display = "none";
    await safeClose(currentSession);
    currentSession = null;
    clearPreviewCache();

    const maybeTestOpenDrive = globalThis.__PEARDROPS_TEST_OPEN_DRIVE__;
    const openDrive =
      typeof maybeTestOpenDrive === "function"
        ? (parsed) => maybeTestOpenDrive(parsed)
        : (parsed) => openDriveFromInvite(parsed);

    const { manifest, session } = await loadManifestFromInvite(invite, {
      openDrive,
    });

    currentSession = session;
    currentEntries = Array.isArray(manifest.files) ? manifest.files : [];
    selectedEntryKeys = new Set();

    renderFileRows(currentEntries);

    statusEl.textContent = `Connected. ${manifest.files?.length || 0} file(s) available.`;
  } catch (error) {
    const message = error.message || String(error);
    statusEl.textContent = `Join failed: ${message}`;
    if (message.includes("Relay connection failed")) {
      relayHelperEl.style.display = "block";
    }
  }
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
}

function previewButtonHtml(entry, index) {
  const mime = String(entry?.mimeType || "").toLowerCase();
  const ext = fileExt(entry?.name || "");
  const isImage =
    mime.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp"].includes(ext);
  if (isImage) {
    const cached = previewCache.get(entry.drivePath || "");
    if (cached && cached.kind === "image") {
      return `<button class="preview-btn" data-action="preview" data-index="${index}"><img alt="preview" src="${cached.url}" /></button>`;
    }
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
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const chunkSize = Number(options.chunkSize || 16 * 1024);
  if (!currentSession) throw new Error("No active session");
  const entryBytes = Math.max(0, Number(entry?.byteLength || 0));
  const useByteProgress = entryBytes > 0;
  if (manageProgress) {
    showDownloadProgress(
      0,
      useByteProgress ? entryBytes : 1,
      "Downloading file...",
      `Current file: ${entry?.name || "file"}`,
      useByteProgress ? "bytes" : "count"
    );
  }
  try {
    let doneBytes = 0;
    const chunks = [];
    let writable = null;

    if (useByteProgress && typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: entry?.name || "download.bin",
        });
        writable = await handle.createWritable();
      } catch {
        writable = null;
      }
    }

    for await (const chunk of readInviteEntryChunks(currentSession, entry, { chunkSize })) {
      const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk || 0);
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
          useByteProgress ? "bytes" : "count"
        );
      }
    }

    if (writable) {
      await writable.close();
    } else {
      const blob = new Blob(chunks, {
        type: entry.mimeType || "application/octet-stream",
      });
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
        useByteProgress ? "bytes" : "count"
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
    0
  );
  const useByteProgress = knownTotalBytes > 0;
  const totalForProgress = useByteProgress ? knownTotalBytes : picked.length;
  let downloadedBytes = 0;
  showDownloadProgress(
    0,
    totalForProgress,
    "Downloading selected files...",
    "Current file: preparing...",
    useByteProgress ? "bytes" : "count"
  );
  try {
    for (let i = 0; i < picked.length; i++) {
      const entry = picked[i];
      showDownloadProgress(
        useByteProgress ? downloadedBytes : i,
        totalForProgress,
        "Downloading selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count"
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
            useByteProgress ? "bytes" : "count"
          );
        },
      });
      downloadedBytes = baseAtStart + Math.max(0, Number(entry?.byteLength || 0));
      showDownloadProgress(
        useByteProgress ? downloadedBytes : i + 1,
        totalForProgress,
        "Downloading selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count"
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
    0
  );
  const useByteProgress = knownTotalBytes > 0;
  const totalForProgress = useByteProgress ? knownTotalBytes : picked.length;
  let packedBytes = 0;
  showDownloadProgress(
    0,
    totalForProgress,
    "Packing selected files...",
    "Current file: preparing...",
    useByteProgress ? "bytes" : "count"
  );
  try {
    for (let i = 0; i < picked.length; i++) {
      const entry = picked[i];
      showDownloadProgress(
        useByteProgress ? packedBytes : i,
        totalForProgress,
        "Packing selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count"
      );
      const bytes = await readInviteEntry(currentSession, entry);
      files.push({
        name: sanitizeTarName(entry.name || "file.bin"),
        bytes,
      });
      packedBytes += useByteProgress
        ? bytes.byteLength || Math.max(0, Number(entry?.byteLength || 0))
        : 1;
      showDownloadProgress(
        useByteProgress ? packedBytes : i + 1,
        totalForProgress,
        "Packing selected files...",
        `Current file: ${entry?.name || `file-${i + 1}`}`,
        useByteProgress ? "bytes" : "count"
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
  mode = "count"
) {
  if (!downloadProgressEl || !downloadProgressLabelEl || !downloadProgressFillEl) return;
  const safeTotal = Math.max(1, Number(total || 0));
  const safeDone = Math.max(0, Math.min(safeTotal, Number(done || 0)));
  const percent = Math.round((safeDone / safeTotal) * 100);
  const progressText =
    mode === "bytes"
      ? `${percent}% (${formatBytes(safeDone)} / ${formatBytes(safeTotal)})`
      : `${safeDone}/${safeTotal}`;
  downloadProgressEl.classList.remove("hidden");
  downloadProgressLabelEl.textContent = `${label} ${progressText}`;
  if (downloadProgressSubEl) {
    const sub = String(subtitle || "").trim();
    downloadProgressSubEl.textContent = sub;
    downloadProgressSubEl.classList.toggle("hidden", !sub);
  }
  downloadProgressFillEl.style.width = `${percent}%`;
}

function hideDownloadProgress() {
  if (!downloadProgressEl || !downloadProgressLabelEl || !downloadProgressFillEl) return;
  downloadProgressFillEl.style.width = "0%";
  downloadProgressLabelEl.textContent = "Downloading files...";
  if (downloadProgressSubEl) {
    downloadProgressSubEl.textContent = "";
    downloadProgressSubEl.classList.add("hidden");
  }
  downloadProgressEl.classList.add("hidden");
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
  for (const url of objectUrls) URL.revokeObjectURL(url);
  objectUrls.clear();
  closePreview();
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
    },
    async close() {
      stream.destroy();
      if (typeof dht.destroy === "function") await dht.destroy();
      socket.close();
    },
  };
}

async function openDriveFromInvite(parsed) {
  const relayUrl = relayUrlForInvite(parsed, location);
  const [{ default: DHT }, { default: RelayStream }, { default: b4a }] =
    await Promise.all([
      import("@hyperswarm/dht-relay"),
      import("@hyperswarm/dht-relay/ws"),
      import("b4a"),
    ]);

  if (parsed.signalKey) {
    return openDriveViaWebRtcInvite(parsed, relayUrl, {
      DHT,
      RelayStream,
      b4a,
    });
  }

  return openDriveViaRelay(parsed);
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
            if (message.ok === false)
              waiter.reject(new Error(message.error || "Peer request failed"));
            else waiter.resolve(message);
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
  return text;
}
