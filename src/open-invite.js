import "./styles/site.css";
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
  <section class="handoff-card">
    <img class="handoff-logo" src="/images/logo.png" alt="PearDrop" />
    <h1>Opening PearDrop...</h1>
    <p id="hint">Trying the native app first. If it is unavailable, we will continue in your browser.</p>
    <div class="handoff-progress" aria-hidden="true"><span></span></div>
    <a class="handoff-back" href="/">Back to peardrop.online</a>
  </section>
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
    if (hintEl) {
      hintEl.textContent = "Native invite missing. Opening web client...";
    }
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
