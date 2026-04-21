import { toInviteUrl, toNativeInviteUrl } from "./lib/app-links.js";

const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const rawInvite = params.get("invite") || "";
const invite = toInviteUrl(rawInvite);
const nativeInvite = toNativeInviteUrl(invite);
const fallbackUrl = invite
  ? `/web-client/?invite=${encodeURIComponent(invite)}`
  : "/web-client/";

app.innerHTML = `
  <style>
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: #1f3342;
      background: radial-gradient(circle at top left, #e8f4ef, #f5f8fb);
    }
    main {
      max-width: 640px;
      margin: 64px auto;
      padding: 24px;
      background: #fff;
      border: 1px solid #d7e2ea;
      border-radius: 16px;
      box-shadow: 0 18px 42px rgba(31, 51, 66, 0.09);
      text-align: center;
    }
    h1 {
      margin: 0;
      font-size: 26px;
    }
    p {
      margin: 8px 0 0;
      color: #5f7688;
    }
    .spinner {
      margin: 14px auto 0;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      border: 3px solid #9ec3e5;
      border-right-color: transparent;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to {
        transform: rotate(360deg);
      }
    }
  </style>
  <h1>Opening PearDrop...</h1>
  <p id="hint">Trying the native app first. If unavailable, loading web client.</p>
  <div class="spinner"></div>
`;

const hintEl = document.getElementById("hint");

if (!invite) {
  if (hintEl) hintEl.textContent = "Invite missing. Opening web client.";
  location.replace("/web-client/");
} else {
  openAppWithFallback(nativeInvite, fallbackUrl);
}

function openAppWithFallback(nativeInvite, webUrl) {
  if (!nativeInvite) {
    if (hintEl) hintEl.textContent = "Native invite missing. Opening web client...";
    location.replace(webUrl);
    return;
  }
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
    if (hintEl) hintEl.textContent = "App not detected. Opening web client...";
    location.replace(webUrl);
  }, 1400);

  try {
    location.href = nativeInvite;
  } catch {
    finish();
    location.replace(webUrl);
  }
}
