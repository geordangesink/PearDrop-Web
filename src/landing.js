import {
  APP_LINKS,
  detectClientPlatform,
  installerUrlForPlatform,
} from "./lib/app-links.js";

const app = document.getElementById("app");
const platform = detectClientPlatform();
const recommendedInstaller = installerUrlForPlatform(platform.id);

app.innerHTML = `
  <style>
    :root {
      --bg: #0e1722;
      --bg-soft: #132131;
      --panel: #ffffff;
      --line: #d7e1ec;
      --text: #12253a;
      --muted: #5f7387;
      --brand: #1578de;
      --brand-dark: #0f5fb2;
      --accent: #17b37f;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      color: var(--text);
      background:
        radial-gradient(1300px 540px at 20% -10%, #294966 0%, transparent 55%),
        radial-gradient(1000px 500px at 90% -20%, #113753 0%, transparent 58%),
        linear-gradient(180deg, var(--bg), var(--bg-soft));
      min-height: 100vh;
    }
    main {
      width: min(1120px, 94vw);
      margin: 28px auto;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 22px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), #f8fbff);
      box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.35),
        0 2px 18px rgba(0, 0, 0, 0.14);
      overflow: hidden;
    }
    .hero {
      position: relative;
      padding: 38px 36px 28px;
      background:
        radial-gradient(540px 220px at 92% -12%, rgba(23, 179, 127, 0.22), transparent 65%),
        radial-gradient(520px 230px at 4% -18%, rgba(21, 120, 222, 0.26), transparent 62%);
      border-bottom: 1px solid var(--line);
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid #c6d7ea;
      background: #eff6ff;
      border-radius: 999px;
      padding: 6px 12px;
      color: #2e4e6a;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .eyebrow-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--accent);
      box-shadow: 0 0 0 4px rgba(23, 179, 127, 0.18);
    }
    h1 {
      margin: 16px 0 0;
      font-size: clamp(36px, 5vw, 56px);
      line-height: 0.98;
      letter-spacing: -0.02em;
      color: #0d2033;
    }
    .sub {
      margin: 12px 0 0;
      max-width: 760px;
      color: var(--muted);
      font-size: 18px;
      line-height: 1.45;
    }
    .hero-actions {
      margin-top: 22px;
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      border: 1px solid transparent;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      padding: 11px 16px;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
    }
    .btn:hover {
      transform: translateY(-1px);
    }
    .btn.primary {
      background: linear-gradient(180deg, var(--brand), var(--brand-dark));
      color: #fff;
      box-shadow: 0 10px 24px rgba(21, 120, 222, 0.26);
    }
    .btn.alt {
      background: #f2f7fd;
      color: #24445d;
      border-color: #c5d6e8;
    }
    .content {
      padding: 26px 30px 30px;
      display: grid;
      gap: 20px;
    }
    .section-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .section-title {
      margin: 0;
      font-size: 24px;
      letter-spacing: -0.01em;
    }
    .platform-chip {
      border: 1px solid #cbd9e8;
      background: #f3f8ff;
      border-radius: 999px;
      padding: 7px 12px;
      color: #31526f;
      font-size: 13px;
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(240px, 1fr));
      gap: 12px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fff;
      padding: 14px;
      box-shadow: 0 1px 0 rgba(18, 37, 58, 0.04);
    }
    .card h3 {
      margin: 0;
      font-size: 18px;
      color: #163149;
    }
    .card p {
      margin: 7px 0 10px;
      color: #647a91;
      font-size: 14px;
      line-height: 1.4;
    }
    .split {
      display: grid;
      grid-template-columns: 1.3fr 1fr;
      gap: 12px;
    }
    .browser-cta {
      border: 1px solid #cfe0ee;
      background: linear-gradient(180deg, #f8fcff 0%, #f2f8ff 100%);
      border-radius: 14px;
      padding: 16px;
    }
    .browser-cta h3 {
      margin: 0;
      font-size: 22px;
      color: #13314b;
    }
    .browser-cta p {
      margin: 8px 0 12px;
      color: #5f748a;
      font-size: 15px;
      line-height: 1.45;
    }
    .footer-note {
      margin-top: 4px;
      color: #7a8ea2;
      font-size: 13px;
    }
    @media (max-width: 920px) {
      .split {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 760px) {
      main {
        width: calc(100vw - 20px);
        margin: 10px auto;
        border-radius: 16px;
      }
      .hero {
        padding: 24px 18px 18px;
      }
      .content {
        padding: 18px 14px 18px;
      }
      .sub {
        font-size: 16px;
      }
      .grid {
        grid-template-columns: 1fr;
      }
    }
  </style>

  <section class="hero">
    <span class="eyebrow"><span class="eyebrow-dot"></span>${escapeHtml(platform.label)} detected</span>
    <h1>Pear Drop</h1>
    <p class="sub">Private invite-based file sharing across desktop, mobile, and web. Install once, then open links instantly.</p>
    <div class="hero-actions">
      ${
        recommendedInstaller
          ? `<a class="btn primary" href="${escapeHtmlAttr(recommendedInstaller)}">Download for ${escapeHtml(platform.label)}</a>`
          : `<a class="btn primary" href="/download.html">View Downloads</a>`
      }
      <a class="btn alt" href="/download.html">All Installers</a>
      <a class="btn alt" href="/web-client/">Open Web Client</a>
    </div>
  </section>

  <section class="content">
    <div class="section-head">
      <h2 class="section-title">Installers</h2>
      <span class="platform-chip">Smart links open app first, then web fallback</span>
    </div>
    <section class="grid">
      ${installerCard("Windows", ".msix installer", APP_LINKS.windows)}
      ${installerCard("macOS", ".dmg installer", APP_LINKS.mac)}
      ${installerCard("Linux", ".AppImage package", APP_LINKS.linux)}
      ${installerCard("Mobile", "iOS + Android download options", "/download.html")}
    </section>

    <section class="split">
      <article class="browser-cta">
        <h3>Need no-install access?</h3>
        <p>Use the browser client to open invite links, preview files, and download selected content immediately.</p>
        <a class="btn primary" href="/web-client/">Launch Web Client</a>
      </article>
      <article class="card">
        <h3>Share Reliable Invite Links</h3>
        <p>Use links like <code>/open/?invite=...</code>. If the app is installed it opens directly; otherwise it auto-loads in web client.</p>
        <a class="btn alt" href="/download.html">See Download + Invite Flow</a>
      </article>
    </section>
    <div class="footer-note">Pear Drop supports direct native deep links and reliable web fallback on all devices.</div>
  </section>
`;

function installerCard(title, subtitle, href) {
  const safeHref = String(href || "").trim();
  return `
    <article class="card">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(subtitle)}</p>
      ${
        safeHref
          ? `<a class="btn alt" href="${escapeHtmlAttr(safeHref)}">Download</a>`
          : `<span class="btn alt" style="opacity:.55; cursor:default;">Coming soon</span>`
      }
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
